import { useMemo, useState } from 'react';
import { recipientOf } from '../../../core/messages/messages.ts';
import { activity, activityChoices, myWork, personNotes } from '../../../core/team/team.ts';
import { CHECK_PACKS } from '../../platform/bundle.ts';
import { record } from '../../state/journal.ts';
import { localTime, today, update } from '../../state/store.ts';
import { useStore } from '../../state/use-store.ts';
import { PageHead } from '../../ui/PageHead.tsx';
import { cardWords, describeEvent, oneLinePerMessage } from '../../view/activity.ts';
import { memoryOf, repliesToRead, statusWord } from '../../view/cases.ts';
import { combinedGroup, groupChip, memoryWords, nextStep, stepIcon, stepWords } from '../../view/groups.ts';
import { casesOfPerson, personOf, personTimeline } from '../../view/person.ts';
import type { OwnerGroup } from '../../view/groups.ts';
import { ComposeDialog } from '../../ui/ComposeDialog.tsx';
import { AssignMenu, PersonLink } from '../../ui/people.tsx';
import { HandOverDialog } from './HandOver.tsx';
import { Button, Chip, Icon, STATUS_TONE, Why, cx, inputClass, plural, shortDate } from '../../ui/basics.tsx';
import type { IconName } from '../../ui/icons.ts';
import { Avatar, CountBadge, EmptyState, LongText, Notice, TABLE } from '../../ui/parts.tsx';
import type { Case } from '../../../core/cases/cases.ts';
import type { WorkItem } from '../../../core/team/team.ts';

const labelOf = (checkId: string): string => CHECK_PACKS.filter((pack) => pack.id === checkId)[0]?.cardLabel ?? checkId;

/** "today 09:14", "12 Nov 09:14": when a reply came. */
const replyTime = (at: string): string => (at.slice(0, 10) === today() ? `today ${localTime(at).slice(-5)}` : localTime(at));

/** A heading of a part of a page, with its count ("Replies to read 2"). */
function PartHead({ icon, title, count, tone }: { icon: IconName; title: string; count: number; tone?: string }) {
  return <h3 className="flex items-center gap-2 text-base font-semibold whitespace-nowrap"><Icon name={icon} className={cx('size-5', tone ?? 'text-muted')} />{title}<CountBadge n={count} /></h3>;
}

/**
 * My work (build L5): the replies to read first, under their own heading, then what is assigned to me as a table, one
 * line per person to contact, with the same step as the group on a card. The empty sentence only when the page is empty.
 */
export function MyWorkPage() {
  const store = useStore();
  const items = useMemo(() => myWork(store.cases, store.user.name), [store.cases, store.user.name]);
  const recipient = useMemo(() => (fact: Case['fact']) => recipientOf(fact, store.settings), [store.settings]);
  const groups = useMemo(() => new Map(items.map((item) => [item.contact, combinedGroup(item.cases, store.people, recipient)])), [items, store.people, recipient]);
  const [compose, setCompose] = useState<OwnerGroup | null>(null);
  const [handing, setHanding] = useState(false);
  const count = items.reduce((total, item) => total + item.cases.length, 0);
  // Replies no manager has acted on yet, of the whole team, mine first (F07).
  const replies = useMemo(() => repliesToRead(store.cases, store.user.name), [store.cases, store.user.name]);
  const empty = !items.length && !replies.length;
  return (
    <section aria-label="My work" className="min-w-0 space-y-4">
      <PageHead title="My work" text={empty ? 'What is assigned to you, and the replies of the team to read.' : `${plural(replies.length, 'reply', 'replies')} to read · ${plural(items.length, 'person', 'people')} to contact · ${plural(count, 'open case')} assigned to you.`}>
        {count > 0 && <Button onClick={() => setHanding(true)} data-tip="Give your open cases to a colleague"><Icon name="handover" />Hand over</Button>}
      </PageHead>
      {empty && <EmptyState icon="me" title="Nothing for you now" text="Take a group on a card with More, then Take, or ask a colleague to share out a card." />}
      {replies.length > 0 && (
        <section aria-label="Replies to read" className="space-y-2" data-replies>
          <PartHead icon="replies" title="Replies to read" count={replies.length} tone="text-violet" />
          {replies.map((reply, index) => (
            <Notice key={reply.file} kind="reply">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <div className="min-w-0 flex-1">
                  <p><b className="font-semibold">{reply.cases[0]!.fact.contactName || reply.from}</b> <span className="text-sm text-muted">· {replyTime(reply.received)} · {Array.from(new Set(reply.cases.map((one) => labelOf(one.fact.checkId)))).join(', ')} · {plural(new Set(reply.cases.map((one) => one.fact.ciKey)).size, 'CI')}{reply.mine ? ' · mine' : reply.cases[0]!.assignedTo ? ` · ${reply.cases[0]!.assignedTo}` : ''}</span></p>
                  <p className="text-sm">{reply.firstLine}</p>
                </div>
                <Button small kind={index === 0 ? 'primary' : 'secondary'} data-tip="Open the case with the reply" onClick={() => update({ openCi: reply.cases[0]!.fact.ciKey, openCard: reply.cases[0]!.fact.checkId })}><Icon name="replies" />Reply</Button>
              </div>
            </Notice>
          ))}
          <p className="text-sm text-muted">A reply stays here until a manager sets a status on its case or writes again. Yours first, then the team's.</p>
        </section>
      )}
      {items.length > 0 && (
        <section aria-label="Assigned to me" className="space-y-2">
          <PartHead icon="me" title="Assigned to me" count={items.length} />
          <div className="rounded-xl bg-surface shadow-sm ring-1 ring-line max-md:bg-transparent max-md:shadow-none max-md:ring-0">
            <table className={TABLE.table}>
              <thead className={TABLE.head}><tr>{['Asked', 'Cards', 'CIs', 'Follow-up', 'State', 'Next step'].map((head) => <th key={head} className={cx(TABLE.th, head === 'CIs' && 'text-right', head === 'Next step' && 'text-right')}>{head}</th>)}</tr></thead>
              <tbody className={TABLE.body}>
                {items.map((item) => <WorkLine key={item.contact} item={item} group={groups.get(item.contact)!} onEmail={() => setCompose(groups.get(item.contact)!)} />)}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {compose && <ComposeDialog group={compose} title="Write to the person" onClose={() => setCompose(null)} />}
      {handing && <HandOverDialog count={count} onClose={() => setHanding(false)} />}
    </section>
  );
}

/** The step of a person, by the rule of the group on a card: Email, Remind 1 of 2, Escalate to (name), Reply (D226). */
function StepButton({ group, kind, onEmail }: { group: Pick<OwnerGroup, 'open'>; kind: 'primary' | 'secondary'; onEmail: () => void }) {
  const store = useStore();
  const next = nextStep(group, today(), store.settings);
  const words = stepWords(next);
  const replied = group.open.filter((item) => item.status === 'Answered')[0];
  if (next.step === 'answered') return <Button small kind={kind} onClick={() => replied && update({ openCi: replied.fact.ciKey, openCard: replied.fact.checkId })}><Icon name="replies" />{words.button}</Button>;
  if (!words.button) return <Button small kind="ghost" onClick={onEmail} data-tip={words.line}><Icon name={stepIcon(next) as IconName} />{words.link}</Button>;
  return <Button small kind={kind} onClick={onEmail} data-step-button={next.step}><Icon name={stepIcon(next) as IconName} />{words.button}</Button>;
}

/** One line of My work: the person asked, the cards, the CIs, the memory, the state chip, the step and Assign. */
function WorkLine({ item, group, onEmail }: { item: WorkItem; group: OwnerGroup; onEmail: () => void }) {
  const store = useStore();
  const via = item.cases[0]!.fact.contactVia;
  const chip = groupChip(group, 'solve');
  return (
    <tr className={TABLE.line}>
      <td className={TABLE.td}>
        <span className={TABLE.label}>Asked </span>
        <PersonLink id={item.contact === 'nobody' ? '' : item.contact} name={item.name} className="font-semibold" />
        {via && <span className="ml-1.5 text-sm whitespace-nowrap text-muted">{via.charAt(0).toLocaleUpperCase('en-GB') + via.slice(1)}</span>}
        {item.handover && <span className="block text-sm text-muted"><Icon name="handover" className="mr-1 inline size-3.5" />Handed over by {item.handover.byName}{item.handover.text ? `: ${item.handover.text}` : ''}</span>}
      </td>
      <td className={TABLE.td}>
        <span className={TABLE.label}>Cards </span>
        {item.checkIds.map((checkId, index) => <span key={checkId}>{index ? ', ' : ''}<button type="button" className="min-h-6 text-left hover:underline" onClick={() => update({ view: 'overview', openCard: checkId, openCi: '' })}>{labelOf(checkId)}</button></span>)}
      </td>
      <td className={cx(TABLE.td, TABLE.num)}><span className={TABLE.label}>CIs </span>{item.ciCount}</td>
      <td className={cx(TABLE.td, 'text-sm whitespace-nowrap text-muted')}>{memoryWords(group.memory)}</td>
      <td className={TABLE.td}>{chip ? <Chip tone={chip.tone} {...(chip.icon ? { icon: chip.icon } : {})}>{chip.word}</Chip> : <span className="text-muted">–</span>}</td>
      <td className={cx(TABLE.td, 'md:text-right')}>
        <span className="inline-flex flex-wrap items-center gap-2 md:justify-end">
          {item.email ? <StepButton group={group} kind="secondary" onEmail={onEmail} /> : <Why>No email address</Why>}
          <AssignMenu keys={item.cases.map((one) => one.key)} current={store.user.name} />
        </span>
      </td>
    </tr>
  );
}

/** What the CIs of an event are, in a few words ("CI-1, CI-2 and 3 more"). */
function ciWords(keys: string[], cases: Map<string, Case>): string {
  const names = Array.from(new Set(keys.map((key) => cases.get(key)?.fact.ciName ?? '').filter(Boolean)));
  if (!names.length) return '';
  return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/**
 * Activity (build L5): everything the team did, newest first, as a table: the icon, the time, who, what, and what it was
 * about (the cards and the CIs). A filter per manager and per day, a search, and "So far" in the head.
 */
export function ActivityPage() {
  const store = useStore();
  const [by, setBy] = useState('');
  const [day, setDay] = useState('');
  const [search, setSearch] = useState('');
  const choices = useMemo(() => activityChoices(store.events), [store.events]);
  const list = useMemo(() => activity(store.events, { by, day }), [store.events, by, day]);
  const byKey = useMemo(() => new Map(store.cases.map((item) => [item.key, item])), [store.cases]);
  const memory = useMemo(() => memoryOf(store.cases), [store.cases]);
  const needle = search.trim().toLowerCase();
  const lines = useMemo(() => oneLinePerMessage(list).map(({ event, withNew }) => {
    const touched = event.keys.map((key) => byKey.get(key)).filter((item): item is Case => !!item);
    return { event, line: describeEvent(event, store.sent, withNew), cis: ciWords(event.keys, byKey), cards: cardWords(touched.map((item) => labelOf(item.fact.checkId))), first: touched[0] };
  }).filter((one) => !needle || [one.line.what, one.line.text, one.line.by, one.cis, one.cards].join(' ').toLowerCase().indexOf(needle) >= 0), [list, byKey, store.sent, needle]);
  const shown = lines.slice(0, 300);
  const select = cx(inputClass.replace('w-full ', ''), 'w-auto');
  return (
    <section aria-label="Activity" className="min-w-0 space-y-4">
      <PageHead title="Activity" text={`What the team did, newest first. So far: ${plural(memory.emails, 'email')} · ${plural(memory.reminders, 'reminder')} · ${plural(memory.teams, 'Teams chat')}. Read from the folder${store.readAt ? ` at ${store.readAt.slice(11, 16)}` : ''}; Refresh (in More) reads colleagues' latest work.`} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-56 max-w-full">
          <Icon name="search" className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted" />
          <input type="search" aria-label="Search" placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} className={cx(inputClass, 'pl-8')} />
        </label>
        <select aria-label="Who" value={by} onChange={(event) => setBy(event.target.value)} className={select}>
          <option value="">Everyone</option>
          {choices.people.map((person) => <option key={person.email} value={person.email}>{person.name}</option>)}
        </select>
        <select aria-label="Days" value={day} onChange={(event) => setDay(event.target.value)} className={select}>
          <option value="">All days</option>
          {choices.days.map((value) => <option key={value} value={value}>{shortDate(value)}</option>)}
        </select>
        <span className="text-sm whitespace-nowrap text-muted">{plural(lines.length, 'entry', 'entries')}</span>
      </div>
      {!lines.length ? <EmptyState icon="activity" title="Nothing yet" text={needle || by || day ? 'Nothing matches the search or the filters.' : 'What the team does shows here: loads, emails, statuses, notes.'} /> : (
        <div className="rounded-xl bg-surface shadow-sm ring-1 ring-line max-md:bg-transparent max-md:shadow-none max-md:ring-0">
          <table className={TABLE.table} data-activity>
            <thead className={TABLE.head}><tr><th className={cx(TABLE.th, 'w-10')}><span className="sr-only">Kind</span></th>{['Time', 'Who', 'What', 'About'].map((head) => <th key={head} className={TABLE.th}>{head}</th>)}</tr></thead>
            <tbody className={TABLE.body}>
              {shown.map(({ event, line, cis, cards, first }) => (
                <tr key={event.id} className={TABLE.line}>
                  <td className={cx(TABLE.td, 'w-10 max-md:hidden')}><span className="grid size-7 place-items-center rounded-full bg-surface-2 text-muted"><Icon name={line.icon as IconName} className="size-3.5" /></span></td>
                  <td className={cx(TABLE.td, 'whitespace-nowrap text-muted')}>{localTime(event.at)}</td>
                  <td className={TABLE.td}>{line.by ? <Avatar name={line.by} tip={line.by} /> : <span className="text-muted">–</span>}</td>
                  <td className={TABLE.td}>
                    <p className="font-semibold">{line.what}</p>
                    {line.text && <LongText className="text-sm whitespace-pre-wrap text-muted" text={line.text} limit={300} />}
                  </td>
                  <td className={TABLE.td}>
                    {cards && <p className="text-sm">{cards}</p>}
                    {cis && <button type="button" data-rows className="min-h-6 text-left text-sm text-muted hover:underline" onClick={() => first && update({ openCi: first.fact.ciKey })}>{cis}</button>}
                    {!cards && !cis && <span className="text-muted">–</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lines.length > shown.length && <p className="text-sm text-muted">The newest 300. Choose a manager or a day, or search, to see the others.</p>}
    </section>
  );
}

/** The page of one person contacted: everything open with them, every contact and reply, and the team's notes about them. */
export function PersonPage() {
  const store = useStore();
  const key = store.openPerson;
  const person = useMemo(() => personOf(key, store.cases, store.people), [key, store.cases, store.people]);
  const { asked, named } = useMemo(() => casesOfPerson(key, store.cases, store.people), [key, store.cases, store.people]);
  const timeline = useMemo(() => personTimeline(key, person.email, store.cases, store.events, store.sent), [key, person.email, store.cases, store.events, store.sent]);
  const notes = useMemo(() => personNotes(store.events, key), [store.events, key]);
  const [note, setNote] = useState('');
  const [compose, setCompose] = useState<OwnerGroup | null>(null);
  const byCard = new Map<string, Case[]>();
  for (const item of asked) byCard.set(item.fact.checkId, (byCard.get(item.fact.checkId) ?? []).concat([item]));
  const assigned = Array.from(new Set(asked.map((item) => item.assignedTo)));
  const email = (): void => setCompose(combinedGroup(asked, store.people, (fact) => recipientOf(fact, store.settings)));
  const namedNames = Array.from(new Set(named.map((item) => item.fact.ciName)));
  return (
    <section aria-label={`Person: ${person.name}`} className="min-w-0 space-y-4">
      <PageHead title={person.name} back={store.backTo === 'person' ? 'overview' : store.backTo}
        text={`${person.email || 'No email in the report'}${person.active === false ? ' · inactive' : ''} · asked about ${plural(new Set(asked.map((item) => item.fact.ciKey)).size, 'CI')}${named.length ? `, named on ${plural(new Set(named.map((item) => item.fact.ciKey)).size, 'more CI')}` : ''}`}>
        {asked.length > 0 && (person.email ? <StepButton group={{ open: asked }} kind="primary" onEmail={email} /> : <Why>No email address</Why>)}
        <AssignMenu keys={asked.map((item) => item.key)} current={assigned.length === 1 ? assigned[0]! : assigned.length ? 'Several' : ''} />
      </PageHead>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <section className="space-y-2 rounded-xl bg-surface p-4 shadow-sm ring-1 ring-line">
            <h3 className="text-base font-semibold">Open with {person.name}</h3>
            {!asked.length && <p className="text-sm text-muted">Nothing open where the checks ask this person.</p>}
            {Array.from(byCard.entries()).map(([checkId, list]) => (
              <div key={checkId} className="space-y-1">
                <button type="button" className="min-h-6 text-sm font-semibold hover:underline" onClick={() => update({ view: 'overview', openCard: checkId, openCi: '' })}>{labelOf(checkId)}</button>
                <ul className="space-y-0.5">
                  {list.map((item) => (
                    <li key={item.key} className="flex flex-wrap items-center gap-1.5 text-sm">
                      <button type="button" className="min-h-6 font-semibold text-accent hover:underline" onClick={() => update({ openCi: item.fact.ciKey })}>{item.fact.ciName}</button>
                      <span className="text-muted">{item.fact.detail}</span>
                      {item.status !== 'New' && <Chip tone={STATUS_TONE[item.status]}>{statusWord(item.status)}</Chip>}
                      {item.reminderDue && <Chip tone="amber" icon="bell">Reminder due</Chip>}
                      {item.assignedTo && <Avatar name={item.assignedTo} tip={`Assigned to ${item.assignedTo}`} />}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {named.length > 0 && <p className="pt-1 text-sm text-muted">Also named (owner, manager or support) on {plural(new Set(named.map((item) => item.fact.ciKey)).size, 'CI')} where the checks ask somebody else: {namedNames.slice(0, 8).join(', ')}{namedNames.length > 8 ? ` and ${namedNames.length - 8} more` : ''}.</p>}
          </section>
          <section className="space-y-2 rounded-xl bg-surface p-4 shadow-sm ring-1 ring-line">
            <h3 className="text-base font-semibold">Messages and replies</h3>
            <ol className="relative space-y-3 border-l border-line pl-5">
              {timeline.map((line) => (
                <li key={line.id} className="relative">
                  <span className="absolute -left-[33px] grid size-7 place-items-center rounded-full bg-surface-2 text-muted ring-4 ring-surface"><Icon name={line.icon as IconName} className="size-3.5" /></span>
                  <p className="text-sm text-muted">{localTime(line.at)}</p>
                  <p className="font-semibold">{line.title}</p>
                  {line.text && <LongText className="text-sm whitespace-pre-wrap text-muted" text={line.text} limit={400} />}
                </li>
              ))}
              {!timeline.length && <li className="text-sm text-muted">Nobody has written to this person yet.</li>}
            </ol>
          </section>
        </div>
        <section className="space-y-2 self-start rounded-xl bg-surface p-4 shadow-sm ring-1 ring-line">
          <h3 className="text-base font-semibold">Notes for the team</h3>
          <div className="flex flex-col gap-2">
            <textarea rows={2} aria-label="Note about the person" className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} placeholder="For example: prefers Teams; on leave until 20 November; ask the deputy for the payment systems" />
            <Button small className="self-end" disabled={!note.trim()} onClick={() => { void record('person-note', [], { person: key, text: note.trim() }); setNote(''); }}><Icon name="note" />Add note</Button>
          </div>
          <ul className="space-y-2">
            {notes.map((event) => (
              <li key={event.id} className="rounded-lg bg-surface-2 px-3 py-2">
                <p className="text-sm whitespace-pre-wrap">{event.text}</p>
                <p className="text-sm text-muted">{event.byName}, {localTime(event.at)}</p>
              </li>
            ))}
            {!notes.length && <li className="text-sm text-muted">No note yet.</li>}
          </ul>
        </section>
      </div>
      {compose && <ComposeDialog group={compose} title={`Write to ${person.name}`} onClose={() => setCompose(null)} />}
    </section>
  );
}
