import { recipientOf } from '../../core/messages/messages.ts';
import { isDaily } from '../../core/cases/cases.ts';
import { ownerGroups, nextStep } from './groups.ts';
import { repliesToRead } from './cases.ts';
import { subjectWord } from './cards.ts';
import type { Case, CaseGroup } from '../../core/cases/cases.ts';
import type { CheckPack } from '../../core/model/model.ts';
import type { MessageSettings } from '../../core/messages/messages.ts';
import type { CardSummary, SinceReport } from './cards.ts';
import type { NextStep, OwnerGroup } from './groups.ts';
import type { CiPeople } from './people.ts';

/**
 * My day (version 0.30, D216): the first page. Four boxes of the team's daily work, the same numbers for everybody:
 *   replies    replies the shared mailbox filed that no manager has acted on yet;
 *   reminders  groups whose reminder is due (and not yet at the escalation);
 *   escalate   groups whose reminders got no answer;
 *   fresh      cards with findings that are new since the report before.
 * Daily work only: the cards for when there is time are not counted (D182). Without a team folder only `fresh` is shown.
 */

/** One row of a box: who, about what, when, and what the button opens. */
export interface MyDayRow {
  key: string;
  who: string;
  what: string;
  /** An ISO time (a reply), a report date, or words ("3 times, no reply"); `whenKind` says which. */
  when: string;
  whenKind: 'time' | 'asked' | 'words' | 'report';
  checkId: string;
  ciKey: string;
  /** The group to write to: reminders and escalations. */
  group?: OwnerGroup;
  next?: NextStep;
}

export interface MyDayBox { rows: MyDayRow[]; total: number }

export interface MyDay {
  replies: MyDayBox;
  reminders: MyDayBox;
  escalate: MyDayBox;
  fresh: MyDayBox;
  /** Distinct CIs with a reply to read, for the folded line ("1 answered"). */
  answered: number;
  /** Findings new since the report before on the daily cards, for the folded line ("3 new"). */
  added: number;
}

export interface MyDayInput {
  packs: CheckPack[];
  groups: CaseGroup[];
  cases: Case[];
  cards: CardSummary[];
  since: SinceReport | null;
  people: Map<string, CiPeople>;
  settings: Parameters<typeof nextStep>[2] & MessageSettings;
  user: string;
  today: string;
}

const plural = (count: number, word: string, many = `${word}s`): string => `${count.toLocaleString('en-GB')} ${count === 1 ? word : many}`;

export function myDay(input: MyDayInput): MyDay {
  const packOf = new Map(input.packs.map((pack) => [pack.id, pack]));
  const label = (checkId: string): string => packOf.get(checkId)?.cardLabel ?? packOf.get(checkId)?.title ?? checkId;
  const recipient = (fact: Case['fact']) => recipientOf(fact, input.settings);
  const daily = input.groups.filter((group) => group.state === 'open' && group.open.length && isDaily(packOf.get(group.checkId)));
  const rowOf = (group: CaseGroup, when: string, whenKind: MyDayRow['whenKind']): MyDayRow => {
    const owner = ownerGroups(group.open, input.people, recipient)[0];
    const person = recipient(group.open[0]!.fact);
    const cis = new Set(group.open.map((item) => item.fact.ciKey)).size;
    return {
      key: group.key, who: person.name || person.email || 'Nobody to ask', what: `${label(group.checkId)} · ${plural(cis, subjectWord(packOf.get(group.checkId), 1), subjectWord(packOf.get(group.checkId), 2))}`,
      when, whenKind, checkId: group.checkId, ciKey: group.open[0]!.fact.ciKey,
      ...(owner ? { group: owner, next: nextStep(owner, input.today, input.settings) } : {})
    };
  };
  const oldest = (a: CaseGroup, b: CaseGroup): number => a.lastMessageOn.localeCompare(b.lastMessageOn) || a.key.localeCompare(b.key);
  const reminders = daily.filter((group) => group.reminderDue && !group.overLimit).sort(oldest).map((group) => rowOf(group, group.lastMessageOn, 'asked'));
  const escalate = daily.filter((group) => group.overLimit).sort(oldest).map((group) => {
    const attempts = Math.max(...group.open.map((item) => item.messages.length));
    return rowOf(group, `${attempts} ${attempts === 1 ? 'time' : 'times'}, no reply`, 'words');
  });
  const read = repliesToRead(input.cases, input.user).filter((reply) => reply.cases.some((item) => isDaily(packOf.get(item.fact.checkId))));
  const replies = read.map((reply): MyDayRow => {
    const first = reply.cases[0]!;
    const cis = new Set(reply.cases.map((item) => item.fact.ciKey)).size;
    return {
      key: reply.file, who: first.fact.contactName || reply.from, what: `${first.fact.ciName}${cis > 1 ? ` and ${plural(cis - 1, 'more')}` : ''} · ${label(first.fact.checkId)}`,
      when: reply.received, whenKind: 'time', checkId: first.fact.checkId, ciKey: first.fact.ciKey
    };
  });
  const answered = new Set(read.flatMap((reply) => reply.cases.map((item) => item.fact.ciKey))).size;
  const since = input.since;
  const fresh = since ? input.cards.filter((card) => !card.later && (since.byCheck[card.id]?.added ?? 0) > 0)
    .sort((a, b) => since.byCheck[b.id]!.added - since.byCheck[a.id]!.added || a.label.localeCompare(b.label))
    .map((card): MyDayRow => {
      const change = since.byCheck[card.id]!;
      return {
        key: card.id, who: card.label, what: `${plural(change.added, `new ${subjectWord(card.pack, 1)}`, `new ${subjectWord(card.pack, 2)}`)}${change.solved ? ` · ${change.solved.toLocaleString('en-GB')} solved` : ''}`,
        when: since.date, whenKind: 'report', checkId: card.id, ciKey: ''
      };
    }) : [];
  const box = (rows: MyDayRow[]): MyDayBox => ({ rows, total: rows.length });
  const added = fresh.reduce((sum, row) => sum + (since?.byCheck[row.checkId]?.added ?? 0), 0);
  return { replies: box(replies), reminders: box(reminders), escalate: box(escalate), fresh: box(fresh), answered, added };
}

/** How many rows a box shows before "All N" (D216). */
export const BOX_ROWS = 3;
