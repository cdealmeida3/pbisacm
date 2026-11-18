import type { CaseEvent } from '../cases/cases.ts';
import type { References } from '../model/model.ts';

/**
 * The mapping backlog as a manager works it (D200 to D203): the stages of a case and the steps each class goes through, the
 * mark "The process does not exist" and the message that told Process Management. Pure; the stages are data in
 * reference/mapping-backlog, and what a manager did is in the journal ('stage' and 'no-process' events).
 */

export const MAPPING_CHECK = 'MAPPING';
const REF = 'reference/mapping-backlog';
/** The end of the key of the message to Process Management, in place of ':mapping' (see the 'no-process' event). */
export const NO_PROCESS = 'no-process';

export interface Stage { id: string; label: string }

/** The part of reference/mapping-backlog the screens read. */
export interface MappingConfig {
  stages: Stage[];
  classStages: Record<string, string[]>;
  stageWords?: Record<string, Record<string, string>>;
  processMissing?: { classes: string[]; rules: string[]; team: string };
  criticality?: string[];
}

export function mappingConfig(references: References): MappingConfig | null {
  const config = references[REF] as MappingConfig | undefined;
  return config && Array.isArray(config.stages) && config.stages.length ? config : null;
}

/** The stages a CI of a class goes through, in order, with the words of that class. Every stage when the class has no list. */
export function stagesFor(config: MappingConfig, className: string): Stage[] {
  const ids = config.classStages[className];
  const words = config.stageWords?.[className] ?? {};
  const list = ids ? ids.map((id) => config.stages.filter((stage) => stage.id === id)[0]).filter((stage): stage is Stage => !!stage) : config.stages;
  return list.map((stage) => (words[stage.id] ? { id: stage.id, label: words[stage.id]! } : stage));
}

/**
 * The stage of a case: the last 'stage' event that names a stage of its class, else the first stage. `index` is its place
 * in the steps of the class, `at` when it was set ('' for the first stage nobody set).
 */
export function stageOf(timeline: CaseEvent[], config: MappingConfig, className: string): { stage: Stage; index: number; at: string; byName: string } {
  const stages = stagesFor(config, className);
  const marks = timeline.filter((event) => event.type === 'stage' && stages.some((stage) => stage.id === event.text));
  const last = marks[marks.length - 1];
  const index = last ? stages.findIndex((stage) => stage.id === last.text) : 0;
  return { stage: stages[index]!, index, at: last ? last.at : '', byName: last ? last.byName : '' };
}

/** Can the case be marked "The process does not exist"? Its class and one of its reasons are those of `processMissing`. */
export function canMarkProcessMissing(config: MappingConfig, className: string, reasons: string[]): boolean {
  const rule = config.processMissing;
  return !!rule && rule.classes.indexOf(className) >= 0 && reasons.some((reason) => rule.rules.indexOf(reason) >= 0);
}

/** The owner says the Business Process does not exist: the last 'no-process' event of the case says 'yes'. */
export function processMissing(timeline: CaseEvent[]): boolean {
  const marks = timeline.filter((event) => event.type === 'no-process');
  return marks.length > 0 && marks[marks.length - 1]!.text === 'yes';
}

/** The key of the message to Process Management about a case of the backlog. */
export const toldKey = (caseKey: string): string => caseKey.replace(/:mapping$/, `:${NO_PROCESS}`);

/** When Process Management was last told about a case (yyyy-mm-dd), from every event of the journals; '' when never. */
export function toldOn(events: CaseEvent[], caseKey: string): string {
  const key = toldKey(caseKey);
  return events.filter((event) => event.type === 'message' && event.keys.indexOf(key) >= 0).map((event) => event.at.slice(0, 10)).sort().pop() ?? '';
}
