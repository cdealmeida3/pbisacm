import { NO_PROCESS, canMarkProcessMissing, processMissing, stageOf, stagesFor, toldKey, toldOn } from '../../core/mapping/backlog.ts';
import { TEAM_PREFIX, teamVia } from '../../core/cases/record-teams.ts';
import { isClosed } from './cases.ts';
import type { MappingConfig, Stage } from '../../core/mapping/backlog.ts';
import type { RecordTeam } from '../../core/cases/record-teams.ts';
import type { Case, CaseEvent } from '../../core/cases/cases.ts';
import type { FindingState } from '../../core/model/model.ts';
import type { CiPeople } from './people.ts';

/**
 * What the mapping backlog shows (D200 to D204): one line per CI to map, with its reasons, its stage, its owner, the
 * criticality lines of the same CI, and whether Process Management was told that its process does not exist. Pure.
 */

export interface BacklogLine {
  item: Case;
  /** Who is invited: the owner of the CI (Owned by), else the contact of the case. */
  owner: string;
  reasons: string[];
  stage: Stage;
  stageIndex: number;
  stages: Stage[];
  state: FindingState;
  /** The cards of the criticality lines of the same CI that are not closed (Above parent, No criticality reaches the CI). */
  criticality: string[];
  /** The owner says the process does not exist (the mark), and whether the case can carry the mark. */
  processMissing: boolean;
  canMark: boolean;
  /** When Process Management was told about it (yyyy-mm-dd), '' when not yet. */
  toldOn: string;
}

const STATE_ORDER: FindingState[] = ['open', 'review', 'waiting', 'known'];

/** The lines of the backlog: the cases of `checkId` that are not closed. To solve first, then by stage, then by name. */
export function backlogLines(cases: Case[], events: CaseEvent[], people: Map<string, CiPeople>, config: MappingConfig, checkId: string, labelOf: (checkId: string) => string): BacklogLine[] {
  const critical = new Set(config.criticality ?? []);
  const criticalByCi = new Map<string, string[]>();
  for (const item of cases) {
    if (!critical.has(item.fact.checkId) || isClosed(item)) continue;
    const list = criticalByCi.get(item.fact.ciKey) ?? [];
    if (list.indexOf(labelOf(item.fact.checkId)) < 0) list.push(labelOf(item.fact.checkId));
    criticalByCi.set(item.fact.ciKey, list);
  }
  return cases.filter((item) => item.fact.checkId === checkId && !isClosed(item)).map((item): BacklogLine => {
    const found = stageOf(item.timeline, config, item.fact.className);
    const owner = people.get(item.fact.ciKey)?.owned_by;
    return {
      item, owner: owner ? owner.name : item.fact.contactName, reasons: item.fact.detail.split('; ').filter(Boolean),
      stage: found.stage, stageIndex: found.index, stages: stagesFor(config, item.fact.className), state: item.state,
      criticality: criticalByCi.get(item.fact.ciKey) ?? [], processMissing: processMissing(item.timeline),
      canMark: canMarkProcessMissing(config, item.fact.className, item.fact.mapping ?? []), toldOn: toldOn(events, item.key)
    };
  }).sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || a.stageIndex - b.stageIndex || a.item.fact.ciName.localeCompare(b.item.fact.ciName));
}

/** How many lines are at each stage, in the order of the stages. A stage no line can reach is left out. */
export function stageCounts(lines: BacklogLine[], config: MappingConfig): Array<{ stage: Stage; count: number }> {
  return config.stages.filter((stage) => lines.some((line) => line.stages.some((own) => own.id === stage.id)))
    .map((stage) => ({ stage, count: lines.filter((line) => line.stage.id === stage.id).length }));
}

/** The lines marked "The process does not exist" that Process Management was not told about yet. */
export const toTell = (lines: BacklogLine[]): BacklogLine[] => lines.filter((line) => line.canMark && line.processMissing && !line.toldOn);

/**
 * The cases of the message to Process Management (D203): the marked cases as the team's points, under the key of the case
 * with ':no-process', so the message is recorded apart from the follow-up of the mapping case. Their field gives the
 * texts of the message (`byProblem` "no-process").
 */
export function teamCases(lines: BacklogLine[], team: Pick<RecordTeam, 'id' | 'name'>): Case[] {
  return lines.map((line) => {
    const key = toldKey(line.item.key);
    return {
      ...line.item, key, state: 'open', status: 'New', messages: [], replies: [], lastMessageOn: '', queued: false, sentOn: '', reminderDue: false, overLimit: false, timeline: [],
      exception: null, exceptionEnded: '', assignedTo: '', handover: null,
      fact: {
        ...line.item.fact, key, field: NO_PROCESS, state: 'open', contactId: `${TEAM_PREFIX}${team.id}`, contactName: team.name, contactEmail: '', contactVia: teamVia(team), cc: [],
        escalateName: '', escalateEmail: ''
      }
    };
  });
}
