// The actions of the Power App "SACM actions" (build B6, D294 to D296): the catalogue of powerbi/apps/actions.json, and
// the answer key of the column Actions of CaseLines: which actions the HTML app offers on each case (the case panel,
// src/app/screens/case/CasePanel.tsx), so tools/powerbi/parity.ts can compare the Power Query result (fnCaseActions)
// with it. Only invented data.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isClosedStatus, ownerAsked } from '../../src/core/cases/cases.ts';
import type { Case, CaseEvent } from '../../src/core/cases/cases.ts';
import { canMarkProcessMissing, mappingConfig, processMissing, stageOf, stagesFor } from '../../src/core/mapping/backlog.ts';
import type { MappingConfig } from '../../src/core/mapping/backlog.ts';
import type { CheckPack } from '../../src/core/model/model.ts';
import { cardKind } from '../../src/app/view/cards.ts';
import { handedToOwner } from '../../src/app/view/fix-list.ts';
import { loadPacks, loadReferences } from '../../src/hosts/cli.ts';

const root = join(import.meta.dirname, '..', '..');
export const ACTIONS_FILE = join(root, 'powerbi', 'apps', 'actions.json');

/** What a manager types or picks for an action. */
export const ASKS = ['text', 'status', 'request', 'member', 'reason', 'reviewOn', 'retireOn', 'stage'] as const;
export type Ask = typeof ASKS[number];

export interface AppAction {
  id: string;
  label: string;
  /** The type of the journal event it adds (DATA-MODEL §3). */
  type: string;
  /** line: the model gives it to each case it applies to; mine: the open lines assigned to the manager; person: one person. */
  scope: 'line' | 'mine' | 'person';
  /** The fixed text of the event, when the manager types none. */
  text?: string;
  asks: Ask[];
}

export const appActions = (): AppAction[] => (JSON.parse(readFileSync(ACTIONS_FILE, 'utf8')) as { actions: AppAction[] }).actions;

/** The button of a fix list line SACM cannot fix alone (`askWhenUnsure`): "Cannot tell which one is right: ask the owner" → "Ask the owner". */
export function askWords(text: string): string {
  const at = text.lastIndexOf(': ');
  if (at < 0) return text;
  const rest = text.slice(at + 2);
  return rest.charAt(0).toLocaleUpperCase('en-GB') + rest.slice(1);
}

/** The key of the person a case is about, as the HTML app knows a person contacted (contactKeyOf): user ID, else email, lower case. */
export const personOf = (item: Case): string => item.fact.contactId || item.fact.contactEmail.toLowerCase();

export interface CaseActions {
  /** "id=Label|id=Label", in the order of the catalogue. */
  Actions: string;
  /** The labels, as the Case page shows them: "Note · Status · Assign". */
  ActionWords: string;
  /** For a case of the mapping backlog: the stages of its class, "id=Label|id=Label"; '' otherwise. */
  Stages: string;
  /** For a case of the mapping backlog: the id of its stage (the last stage event of the journal, else the first). */
  StageId: string;
}

/**
 * The actions the HTML app offers on a case (the case panel). `inLatest`: the newest report shows the finding; a case it no
 * longer shows is known by its key only (as in CaseLines), so it offers Note, and Follow again when it is not followed up.
 */
export function caseActions(item: Case, inLatest: boolean, packs: CheckPack[] = loadPacks(), config: MappingConfig | null = mappingConfig(loadReferences())): CaseActions {
  const pack = packs.find((candidate) => candidate.id === item.fact.checkId);
  const playbook = pack?.playbook;
  const state = inLatest ? item.state : '';
  const factState = inLatest ? item.fact.state ?? 'open' : '';
  const closed = isClosedStatus(item.status);
  const kind = pack ? cardKind(pack) : 'owners';
  const sacmFix = kind === 'fix' && !handedToOwner(pack, item);
  const openWork = !closed && (state === 'open' || state === 'review');
  const timeline: CaseEvent[] = item.timeline;
  const asked = ownerAsked(timeline);
  const mapping = inLatest && kind === 'mapping' && !!config;
  const canMark = mapping && canMarkProcessMissing(config!, item.fact.className, item.fact.mapping ?? []);
  const reviewAsk = !closed && !!playbook?.askAfterReview && state === 'review';
  const reviewBack = !closed && !!playbook?.askAfterReview && state !== 'review' && factState === 'review';
  const unsure = !closed && state === 'open' && !!playbook?.askWhenUnsure;
  const on: Record<string, boolean> = {
    note: true,
    status: openWork && !sacmFix,
    request: openWork && !sacmFix,
    assign: openWork,
    stop: openWork && !sacmFix,
    'follow-again': !!item.exception,
    fixed: sacmFix && !closed && state === 'open' && item.status !== 'Fixed',
    'undo-fixed': sacmFix && !closed && state === 'open' && item.status === 'Fixed',
    'ask-owner': reviewAsk || (unsure && !asked),
    'back-to-sacm': reviewBack || (unsure && asked),
    retirement: inLatest && !closed && !!playbook?.retirementDate && (state === 'open' || !!item.retireOn),
    stage: mapping && !closed,
    'no-process': canMark && !closed && !processMissing(timeline),
    'no-process-undo': canMark && !closed && processMissing(timeline)
  };
  const labelOf = (action: AppAction): string => {
    if (action.id === 'fixed' && playbook?.markWord === 'deleted') return 'Deleted';
    if (action.id === 'ask-owner' && reviewAsk) return playbook!.askAfterReview!;
    if (action.id === 'ask-owner' && unsure) return askWords(playbook!.askWhenUnsure!);
    return action.label;
  };
  const chosen = appActions().filter((action) => action.scope === 'line' && on[action.id]);
  const stages = mapping ? stagesFor(config!, item.fact.className) : [];
  return {
    Actions: chosen.map((action) => `${action.id}=${labelOf(action)}`).join('|'),
    ActionWords: chosen.map(labelOf).join(' · '),
    Stages: stages.map((stage) => `${stage.id}=${stage.label}`).join('|'),
    StageId: mapping ? stageOf(timeline, config!, item.fact.className).stage.id : ''
  };
}

/** The ids of the line actions that fnCaseActions must know: every action of the catalogue with scope 'line'. */
export const lineActionIds = (): string[] => appActions().filter((action) => action.scope === 'line').map((action) => action.id);
