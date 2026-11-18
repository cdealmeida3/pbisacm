import { MODULES, ROLES } from '../model/model.ts';
import type { References } from '../model/model.ts';
import { RULE_OPERATORS } from './engine.ts';
import { CODE_MODULES } from './detectors/index.ts';
import { CONTRACT_CLASS } from '../sources/contracts/contract-reports.ts';
import { REQUESTS } from '../messages/messages.ts';
import { CI_CLASSES } from '../sources/ci/ci-report.ts';
import { recordTeams } from '../cases/record-teams.ts';

/*
 * Validates the check files (checks/packs/<subject>/*.json) against what the code knows: the fields of a check, the rule
 * words, the detectors, the classes, the requests and the reference files. A typing mistake in a check file would
 * otherwise switch a rule off without a word. `npm test` and `npm run build` stop on any problem it returns.
 */

/**
 * What a check's `status` says: proposed (built, not confirmed by SACM), pilot, live (confirmed by SACM), retired, off
 * (switched off: the file stays, the check does not run and has no card).
 */
export const CHECK_STATUSES = ['proposed', 'pilot', 'live', 'retired', 'off'] as const;
/** The priority of a check (D182): daily work (the default), or to clarify when there is time. */
export const PRIORITIES = ['daily', 'later'] as const;
/** How a problem is fixed (`playbook.path`). */
export const FIX_PATHS = ['email', 'self-fix', 'service-request', 'source-fix', 'sacm-fix', 'mapping'] as const;
/** The detectors of type "manual": their findings come from what managers mark (src/core/audit/lifecycle-review.ts). */
const MANUAL_MODULES = ['review/lifecycle'];
/** Entries of `playbook.audience` that are not a role: nobody is asked (SACM), or the Procurement mailbox. */
const AUDIENCE_WORDS = ['otherRoles', 'sacm', 'procurement'];

/** The longest `cardHint`: one or two sentences on the card of the overview. */
export const CARD_HINT_MAX = 160;

const FIELDS = {
  pack: ['id', 'status', 'title', 'cardLabel', 'cardHint', 'cardText', 'family', 'subject', 'dimension', 'severity', 'priority', 'reviewOnly', 'reviewWhy', 'scope', 'detector', 'playbook'],
  scope: ['classes', 'exclude'],
  exclude: ['operational_status'],
  detector: ['type', 'module', 'ref', 'rules', 'forEach', 'forEachClasses', 'when'],
  playbook: ['path', 'audience', 'routeBy', 'markWord', 'askAfterReview', 'askWhenUnsure', 'retirementDate', 'message'],
  message: ['subject', 'intro', 'ask', 'why', 'request', 'askByClass', 'askByTeam', 'askNoRequest', 'epoWhat', 'epoAsk', 'several', 'byProblem'],
  byProblem: ['subject', 'intro', 'ask'],
  condition: ['op', 'field', 'value', 'ref', 'ignore']
};
const REQUIRED = { pack: ['id', 'status', 'title', 'family', 'dimension', 'severity', 'scope', 'detector', 'playbook'], message: ['subject', 'intro', 'ask', 'why'] };
const PLACEHOLDERS = ['role', 'who', 'epoRole', 'request', 'form', 'reply', 'Reply'];
const SEVERITIES = ['low', 'medium', 'high'];

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);

/** Every `id` written anywhere in a reference file: the rule ids a check may name in `detector.rules`. */
function idsIn(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) idsIn(item, out);
  else if (isObject(value)) for (const [key, item] of Object.entries(value)) { if (key === 'id' && typeof item === 'string') out.add(item); else idsIn(item, out); }
  return out;
}

/** The problems of the check files, one line each ("RESP-MISSING: unknown field playbook.chanels"). Empty when every file is right. */
export function validateCheckFiles(packs: unknown[], references: References): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const roles: readonly string[] = ROLES;
  const classes = new Set<string>([...CI_CLASSES, CONTRACT_CLASS, '*']);
  const requests = new Set(REQUESTS.map((request) => request.id));
  // The teams of reference/record-teams (D195): an askByTeam names one, and the checks a team gets must exist.
  const teams = new Set(recordTeams(references).map((team) => team.id));
  const codeModules = new Set(CODE_MODULES);
  const operators: readonly string[] = RULE_OPERATORS;

  packs.forEach((raw, index) => {
    const id = isObject(raw) && isText(raw['id']) ? raw['id'] : `pack ${index + 1}`;
    const say = (problem: string): void => { problems.push(`${id}: ${problem}`); };
    const unknown = (value: Record<string, unknown>, allowed: string[], where: string): void => {
      for (const key of Object.keys(value)) if (!allowed.includes(key)) say(`unknown field ${where}${key}`);
    };
    const reference = (ref: unknown, where: string): void => {
      if (!isText(ref)) say(`${where} must name a reference file`);
      else if (!/^reference\/[a-z0-9-]+$/.test(ref)) say(`${where} must be written reference/<file name without .json>`);
      // A proposed check may wait for its reference data (TAG-INVALID waits for the list of allowed tags): its card is grey and says so.
      else if (references[ref] === undefined && ['proposed', 'off'].indexOf(String((raw as { status?: unknown }).status)) < 0) say(`${where} names ${ref}, which is not a file in checks/reference/`);
    };
    if (!isObject(raw)) { say('is not an object'); return; }
    const pack = raw as Record<string, unknown>;
    unknown(pack, FIELDS.pack, '');
    for (const key of REQUIRED.pack) if (pack[key] === undefined) say(`missing field ${key}`);
    if (ids.has(id)) say('the id is used by another check'); else ids.add(id);
    if (!/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/.test(id)) say('the id must be upper case words joined by "-"');
    if (pack['status'] !== undefined && !(CHECK_STATUSES as readonly string[]).includes(pack['status'] as string)) say(`status must be one of ${CHECK_STATUSES.join(', ')}`);
    if (pack['dimension'] !== undefined && !(MODULES as readonly string[]).includes(pack['dimension'] as string)) say(`dimension must be one of ${MODULES.join(', ')}`);
    if (pack['severity'] !== undefined && !SEVERITIES.includes(pack['severity'] as string)) say(`severity must be one of ${SEVERITIES.join(', ')}`);
    for (const key of ['title', 'family', 'cardLabel', 'cardHint', 'cardText', 'reviewWhy']) if (pack[key] !== undefined && !isText(pack[key])) say(`${key} must be a text`);
    // The card of the overview shows the hint in two lines at most (D172); the longer text goes into cardText.
    if (typeof pack['cardHint'] === 'string' && pack['cardHint'].length > CARD_HINT_MAX) say(`cardHint must be at most ${CARD_HINT_MAX} characters; put the longer text in cardText`);
    if (pack['reviewOnly'] !== undefined && typeof pack['reviewOnly'] !== 'boolean') say('reviewOnly must be true or false');
    if (pack['priority'] !== undefined && !(PRIORITIES as readonly string[]).includes(pack['priority'] as string)) say(`priority must be one of ${PRIORITIES.join(', ')}`);
    if (pack['subject'] !== undefined && pack['subject'] !== CONTRACT_CLASS) say(`subject must be "${CONTRACT_CLASS}" when it is written`);

    const scope = pack['scope'];
    let scoped: string[] = [];
    if (scope !== undefined) {
      if (!isObject(scope)) say('scope must be an object');
      else {
        unknown(scope, FIELDS.scope, 'scope.');
        if (!isTextList(scope['classes']) || !scope['classes'].length) say('scope.classes must list at least one class');
        else { scoped = scope['classes']; for (const cls of scoped) if (!classes.has(cls)) say(`unknown class ${cls} in scope.classes`); }
        const exclude = scope['exclude'];
        if (exclude !== undefined) {
          if (!isObject(exclude)) say('scope.exclude must be an object');
          else {
            unknown(exclude, FIELDS.exclude, 'scope.exclude.');
            if (exclude['operational_status'] !== undefined && !isTextList(exclude['operational_status'])) say('scope.exclude.operational_status must be a list of statuses');
          }
        }
      }
    }
    if (pack['subject'] === CONTRACT_CLASS && scoped.some((cls) => cls !== CONTRACT_CLASS)) say(`a check about contracts has the class ${CONTRACT_CLASS} only`);

    const detector = pack['detector'];
    if (detector !== undefined) {
      if (!isObject(detector)) say('detector must be an object');
      else validateDetector(detector, say, unknown, reference, { operators, codeModules, classes: scoped, references });
    }

    const playbook = pack['playbook'];
    if (playbook !== undefined) {
      if (!isObject(playbook)) say('playbook must be an object');
      else {
        unknown(playbook, FIELDS.playbook, 'playbook.');
        if (!(FIX_PATHS as readonly string[]).includes(playbook['path'] as string)) say(`playbook.path must be one of ${FIX_PATHS.join(', ')}`);
        const audience = playbook['audience'];
        if (!isTextList(audience) || !audience.length) say('playbook.audience must list who is asked (or "sacm")');
        else for (const entry of audience) {
          const above = /^(managerOf|departmentHeadOf)\((\w+)\)$/.exec(entry);
          const fine = AUDIENCE_WORDS.includes(entry) || roles.includes(entry) || (above && (above[2] === 'field' || roles.includes(above[2]!)));
          if (!fine) say(`unknown entry ${entry} in playbook.audience`);
        }
        if (playbook['routeBy'] !== undefined && playbook['routeBy'] !== 'epo') say('playbook.routeBy must be "epo" when it is written');
        if (playbook['markWord'] !== undefined && !isText(playbook['markWord'])) say('playbook.markWord must be a text');
        if (playbook['markWord'] !== undefined && playbook['path'] !== 'sacm-fix') say('playbook.markWord is only for a SACM fix list (path "sacm-fix")');
        if (playbook['askAfterReview'] !== undefined && !isText(playbook['askAfterReview'])) say('playbook.askAfterReview must be a text (the word of the button)');
        if (playbook['askAfterReview'] !== undefined && pack['reviewOnly'] === true) say('playbook.askAfterReview is for a check whose findings can become to solve: not with reviewOnly');
        if (playbook['askAfterReview'] !== undefined && playbook['message'] === undefined) say('playbook.askAfterReview needs playbook.message: the owner is asked with it');
        if (playbook['askWhenUnsure'] !== undefined && !isText(playbook['askWhenUnsure'])) say('playbook.askWhenUnsure must be a text (the word of the button)');
        if (playbook['askWhenUnsure'] !== undefined && (playbook['path'] !== 'sacm-fix' || playbook['message'] === undefined)) say('playbook.askWhenUnsure is for a SACM fix list (path "sacm-fix") with playbook.message: the owner is asked with it');
        if (playbook['retirementDate'] !== undefined && playbook['retirementDate'] !== true) say('playbook.retirementDate must be true (or left out)');
        const message = playbook['message'];
        if (message !== undefined) {
          if (!isObject(message)) say('playbook.message must be an object');
          else validateMessage(message, say, unknown, requests, classes, teams);
        }
      }
    }
  });
  return problems;
}

/**
 * The problems of reference/record-teams against the whole set of check files (D195): every check a team gets is a check
 * file, and every class is known. Empty when the file is right, or missing.
 */
export function validateRecordTeams(packs: unknown[], references: References): string[] {
  const ids = new Set(packs.map((raw) => (isObject(raw) && isText(raw['id']) ? raw['id'] : '')));
  const classes = new Set<string>(CI_CLASSES);
  const problems: string[] = [];
  for (const team of recordTeams(references)) {
    for (const check of team.checks) if (!ids.has(check)) problems.push(`reference/record-teams: team ${team.id} names ${check}, which is not a check file`);
    for (const cls of team.classes) if (!classes.has(cls)) problems.push(`reference/record-teams: team ${team.id} names the unknown class ${cls}`);
  }
  return problems;
}

interface DetectorLists { operators: readonly string[]; codeModules: Set<string>; classes: string[]; references: References }
type Say = (problem: string) => void;
type Unknown = (value: Record<string, unknown>, allowed: string[], where: string) => void;

function validateDetector(detector: Record<string, unknown>, say: Say, unknown: Unknown, reference: (ref: unknown, where: string) => void, lists: DetectorLists): void {
  unknown(detector, FIELDS.detector, 'detector.');
  const type = detector['type'];
  if (type === 'code' || type === 'manual') {
    const modules = type === 'code' ? lists.codeModules : new Set(MANUAL_MODULES);
    if (!isText(detector['module'])) say(`a detector of type "${type}" needs detector.module`);
    else if (!modules.has(detector['module'])) say(`unknown detector ${detector['module']} (detector.module)`);
    reference(detector['ref'], 'detector.ref');
    for (const key of ['when', 'forEach', 'forEachClasses']) if (detector[key] !== undefined) say(`detector.${key} is only for a detector of type "rule"`);
    const rules = detector['rules'];
    if (rules !== undefined) {
      if (!isTextList(rules)) say('detector.rules must be a list of rule ids');
      else if (isText(detector['ref']) && lists.references[detector['ref']] !== undefined) {
        const known = idsIn(lists.references[detector['ref']]);
        for (const rule of rules) if (!known.has(rule)) say(`unknown rule ${rule} in detector.rules (not in ${detector['ref']})`);
      }
    }
  } else if (type === 'rule') {
    for (const key of ['module', 'ref', 'rules']) if (detector[key] !== undefined) say(`detector.${key} is only for a detector of type "code" or "manual"`);
    if (!isObject(detector['when'])) say('a detector of type "rule" needs detector.when');
    else validateCondition(detector['when'], 'detector.when', say, unknown, reference, lists.operators);
    const forEach = detector['forEach'];
    if (forEach !== undefined && (!isTextList(forEach) || !forEach.length)) say('detector.forEach must list at least one entry');
    const forEachClasses = detector['forEachClasses'];
    if (forEachClasses !== undefined) {
      if (!isObject(forEachClasses)) say('detector.forEachClasses must be an object');
      else for (const [entry, classes] of Object.entries(forEachClasses)) {
        if (!isTextList(forEach) || !forEach.includes(entry)) say(`detector.forEachClasses names ${entry}, which is not in detector.forEach`);
        if (!Array.isArray(classes) || !classes.every(isText)) say(`detector.forEachClasses.${entry} must be a list of classes`);
        else for (const cls of classes) if (!lists.classes.includes(cls) && !lists.classes.includes('*')) say(`detector.forEachClasses.${entry} names ${cls}, which is not in scope.classes`);
      }
    }
  } else say('detector.type must be one of rule, code, manual');
}

function validateCondition(condition: Record<string, unknown>, where: string, say: Say, unknown: Unknown, reference: (ref: unknown, where: string) => void, operators: readonly string[]): void {
  for (const key of ['all', 'any']) {
    if (condition[key] === undefined) continue;
    if (Object.keys(condition).length > 1) say(`${where}: "${key}" stands alone`);
    const list = condition[key];
    if (!Array.isArray(list) || !list.length) { say(`${where}.${key} must list conditions`); return; }
    list.forEach((item, index) => {
      if (!isObject(item)) say(`${where}.${key}[${index}] must be a condition`);
      else validateCondition(item, `${where}.${key}[${index}]`, say, unknown, reference, operators);
    });
    return;
  }
  unknown(condition, FIELDS.condition, `${where}.`);
  if (!operators.includes(condition['op'] as string)) say(`unknown rule word ${String(condition['op'])} (${where}.op)`);
  if (condition['ref'] !== undefined) reference(condition['ref'], `${where}.ref`);
  if (condition['field'] !== undefined && !isText(condition['field'])) say(`${where}.field must be a text`);
}

function validateMessage(message: Record<string, unknown>, say: Say, unknown: Unknown, requests: Set<string>, classes: Set<string>, teams: Set<string>): void {
  unknown(message, FIELDS.message, 'playbook.message.');
  for (const key of REQUIRED.message) if (!isText(message[key])) say(`playbook.message.${key} is missing`);
  const request = message['request'];
  if (request !== undefined && request !== 'role' && !requests.has(request as string)) say(`unknown request ${String(request)} (playbook.message.request)`);
  const texts: [string, unknown][] = [];
  for (const [key, value] of Object.entries(message)) {
    if (key === 'request') continue;
    if (key === 'askByClass' || key === 'askByTeam' || key === 'byProblem') {
      if (!isObject(value)) { say(`playbook.message.${key} must be an object`); continue; }
      for (const [part, text] of Object.entries(value)) {
        if (key === 'byProblem') {
          if (!isObject(text)) { say(`playbook.message.byProblem.${part} must be an object`); continue; }
          unknown(text, FIELDS.byProblem, `playbook.message.byProblem.${part}.`);
          for (const field of FIELDS.byProblem) texts.push([`byProblem.${part}.${field}`, text[field]]);
        } else if (key === 'askByTeam') {
          if (!teams.has(part)) say(`unknown team ${part} in playbook.message.askByTeam (reference/record-teams)`);
          texts.push([`askByTeam.${part}`, text]);
        } else {
          if (!classes.has(part)) say(`unknown class ${part} in playbook.message.askByClass`);
          texts.push([`askByClass.${part}`, text]);
        }
      }
    } else texts.push([key, value]);
  }
  for (const [key, text] of texts) {
    if (!isText(text)) { say(`playbook.message.${key} must be a text`); continue; }
    for (const token of text.matchAll(/\{([a-zA-Z]+)(?::([a-z-]+))?\}/g)) {
      if (!PLACEHOLDERS.includes(token[1]!)) say(`unknown placeholder {${token[1]}} in playbook.message.${key}`);
      else if (token[2] !== undefined && ((token[1] !== 'request' && token[1] !== 'form') || !requests.has(token[2]))) say(`unknown request ${token[2]} in playbook.message.${key}`);
      else if (token[1] === 'form' && token[2] === undefined) say(`{form} names a request: {form:<id>} in playbook.message.${key}`);
    }
    // The same text goes into an email and a Teams chat: "reply to this email" is written {reply} (D163).
    if (/this (e-?mail|chat)/i.test(text)) say(`playbook.message.${key} says "this email": write {reply} (or {Reply}), so the Teams chat reads right`);
    if (/\{request\}/.test(text) && request === undefined) say(`playbook.message.${key} uses {request} but playbook.message.request is not set`);
  }
}
