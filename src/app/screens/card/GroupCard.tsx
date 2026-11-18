// One group of an open card (version 0.31, build L3): named after the person asked, one line of memory, one state chip,
// the next step, Teams and More; and the parts around the groups: Share out, the folds and the plain lists.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { EPO_OWNER } from '../../../core/cases/cases.ts';
import { CHECK_PACKS } from '../../platform/bundle.ts';
import { record } from '../../state/journal.ts';
import { localDay, toast, today, update } from '../../state/store.ts';
import { applyShareOut, shareOutPlan } from '../../state/team.ts';
import { useStore } from '../../state/use-store.ts';
import { download } from '../../ui/download.ts';
import { fixPlace } from '../../ui/labels.ts';
import { subjectWord } from '../../view/cards.ts';
import { isClosed } from '../../view/cases.ts';
import { exportCsv } from '../../view/exports.ts';
import { FOLD_ABOVE, askedName, groupChip, memoryWords, nextStep, stepIcon, stepWords } from '../../view/groups.ts';
import { SHOWN_ROLES } from '../../view/people.ts';
import type { CardSummary } from '../../view/cards.ts';
import type { GroupMode, OwnerGroup } from '../../view/groups.ts';
import type { CiPeople } from '../../view/people.ts';
import { AssignItems, PersonLink } from '../../ui/people.tsx';
import { ConfirmDialog } from '../../ui/ConfirmDialog.tsx';
import { ExceptionDialog } from '../../ui/ExceptionDialog.tsx';
import { Button, Chip, Icon, Why, cx, inputClass, plural } from '../../ui/basics.tsx';
import { Avatar, Fold, FoldSign, MenuButton, MenuItem, MenuLine } from '../../ui/parts.tsx';
import type { IconName } from '../../ui/icons.ts';
import type { Case, CaseEvent } from '../../../core/cases/cases.ts';
import { CiTable, PlainLines } from './CiTable.tsx';

/** Export this list: the cases as a CSV file with the columns of the SACM template. Made in the browser; nothing leaves the computer. */
export function exportList(cases: Case[], people: Map<string, CiPeople>, label: string): void {
  download(exportCsv(cases, people, CHECK_PACKS), label);
}

/** What a list of owner groups is: the cases to solve, a review list, or the folded Waiting and Known lists (no message offered). */
export type Mode = GroupMode;

/** The contact key of the person asked with this email in a group (for their page). */
function contactIdOf(group: OwnerGroup, email: string): string {
  const item = group.open.concat(group.cases).filter((one) => one.fact.contactEmail.toLowerCase() === email.toLowerCase())[0];
  return item ? item.fact.contactId || email.toLowerCase() : email.toLowerCase();
}

/** The last note of the team on a set of cases and the hand over. */
export function NoteLines({ memory, handover }: { memory: OwnerGroup['memory']; handover: CaseEvent | null }) {
  return <>
    {memory.lastNote && <p className="rounded-md bg-surface-2 px-2 py-1.5 text-sm text-ink"><Icon name="note" className="mr-1 inline size-3.5" /><b className="font-semibold">{memory.lastNote.byName}, {localDay(memory.lastNote.at)}:</b> {memory.lastNote.text}{memory.notes > 1 ? ` (and ${plural(memory.notes - 1, 'older note')}: open a CI to see them)` : ''}</p>}
    {handover && <p className="text-sm text-muted"><Icon name="handover" className="mr-1 inline size-3.5" />Handed over by {handover.byName} to {handover.to}{handover.text ? `: ${handover.text}` : ''}</p>}
  </>;
}
export const lastHandover = (cases: Case[]): CaseEvent | null => cases.map((item) => item.handover).filter((event): event is CaseEvent => !!event).sort((a, b) => a.at.localeCompare(b.at)).pop() ?? null;

/** The field for a new note on a set of cases, with Save note. */
export function NoteField({ keys, placeholder, saved, onDone }: { keys: string[]; placeholder: string; saved: string; onDone: () => void }) {
  const [note, setNote] = useState('');
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <textarea rows={2} value={note} autoFocus onChange={(event) => setNote(event.target.value)} aria-label="Note for the team" placeholder={placeholder} className={cx(inputClass, 'flex-1')} />
      <Button kind="primary" small disabled={!note.trim()} onClick={() => { void record('note', keys, { text: note.trim() }).then(() => toast(saved)); setNote(''); onDone(); }}><Icon name="note" />Save note</Button>
    </div>
  );
}

/**
 * One group of a card (D226): named after the person asked ("Cy Keeper", Managed by), or "Nobody to ask" with the reason;
 * one line of memory, one state chip, the initials of whoever has it; the next step (Email, Remind or Escalate to (name)),
 * Teams and More (Note, Take, Assign, Stop following, Export). Only the open group has the navy button. The whole head
 * folds. `place`: the card holds two fix places (F23).
 */
export function GroupCard({ group, card, mode, startFolded, place = false, onEmail, onTeams }: { group: OwnerGroup; card: CardSummary; mode: Mode; startFolded: boolean; place?: boolean; onEmail: () => void; onTeams: () => void }) {
  const store = useStore();
  const [noting, setNoting] = useState(false);
  const [folded, setFolded] = useState(startFolded);
  const [excepting, setExcepting] = useState(false);
  const closed = group.state === 'closed';
  // Waiting and known items are not problems to solve: no step, no message.
  const quiet = !closed && (mode === 'waiting' || mode === 'known');
  const active = !closed && !quiet;
  const contract = card.pack.subject === 'contract';
  const who = askedName(group);
  const chip = groupChip(group, mode);
  const openKeys = group.open.map((item) => item.key);
  // The next step of the follow-up: one function decides it (F05).
  const next = nextStep(group, today(), store.settings);
  const words = stepWords(next);
  const canWrite = group.contacts.some((person) => person.email);
  const replied = group.open.filter((item) => item.status === 'Answered')[0];
  // Supported by is shown only when it is part of the check, or filled on one of the CIs.
  const roles = contract ? SHOWN_ROLES.filter((role) => role === 'owned_by')
    : SHOWN_ROLES.filter((role) => role !== 'supported_by' || group.rows.some((row) => row.people.supported_by || row.cases.some((item) => item.fact.field === role)));
  const places = Array.from(new Set(group.open.map(fixPlace)));
  const main = !folded && mode !== 'review';
  const label = group.label ?? who.name;
  const line = who.nobody && active ? who.reason
    : quiet ? `Nobody is asked: ${mode === 'waiting' ? 'it waits' : 'a tag of the team explains it'}`
    : !canWrite && group.label ? `${plural(group.rows.length, subjectWord(card.pack, 1), subjectWord(card.pack, 2))}`
    : memoryWords(group.memory);
  const hints = [
    active && group.team && canWrite ? 'One message to every person of the team. Nobody else is copied.' : '',
    active && group.team && !canWrite ? `Add the people of the ${group.owner?.name ?? 'team'} team in Settings, Requests and mailboxes.` : '',
    active && group.open.some((item) => item.fact.contactId === EPO_OWNER) && !store.settings.epoOwnerEmail ? 'Some CIs come from EPO: set the email of the EPO inventory owner in Settings.' : '',
    active && !group.owner && !group.team && canWrite ? 'No owner, so the check asks Managed by, else the owner\'s manager or department head.' : '',
    !closed && mode === 'review' ? (card.pack.reviewWhy ? `${card.pack.reviewWhy}. No message is needed; you can still write to the group.` : 'Allowed by the process, so no message is needed. You can still write to the group when a value looks wrong.') : ''
  ].filter(Boolean);
  const stepButton = (): ReactNode => {
    if (!active) return null;
    if (!canWrite) return mode === 'solve' ? <Button small onClick={() => setExcepting(true)}><Icon name="stop" />Stop following</Button> : null;
    if (next.step === 'answered') return <Button kind={main ? 'primary' : 'secondary'} small onClick={() => replied && update({ openCi: replied.fact.ciKey })}><Icon name="replies" />{words.button}</Button>;
    if (!words.button) return null;
    return <Button kind={main ? 'primary' : 'secondary'} small onClick={onEmail} data-step-button={next.step}><Icon name={stepIcon(next) as IconName} />{words.button}</Button>;
  };
  return (
    <article className={cx('rounded-xl bg-surface shadow-sm ring-1', !folded && active && mode === 'solve' ? 'ring-line-strong' : 'ring-line')} data-group={group.key} data-folded={folded ? '' : undefined}>
      <div data-group-head className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" onClick={() => setFolded(!folded)}>
        <button type="button" data-rows onClick={(event) => { event.stopPropagation(); setFolded(!folded); }} aria-expanded={!folded} aria-label={`${folded ? 'Show' : 'Hide'} the CIs of ${label}`}
          className="flex min-w-[min(100%,16rem)] flex-1 items-start gap-2 text-left">
          <span className="grid size-6 shrink-0 place-items-center text-muted"><FoldSign open={!folded} /></span>
          <span data-rows className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {who.nobody && active && <Icon name="nobody" className="size-4 text-muted" />}
              <b className={cx('font-semibold', who.nobody && active && 'text-muted')} data-asked>{label}</b>
              {who.others > 0 && <span className="text-sm whitespace-nowrap text-muted">+{who.others}</span>}
              {who.role && !who.nobody && <span className="text-sm whitespace-nowrap text-muted" data-role>{who.role}</span>}
              <span className="text-sm whitespace-nowrap text-muted">{plural(group.rows.length, contract ? 'contract' : 'CI')}{group.open.length && group.open.length < group.cases.length ? ` · ${group.cases.length - group.open.length} closed` : ''}{place && !closed && places.length === 1 ? ` · ${places[0]}` : ''}</span>
              {chip && <Chip tone={chip.tone} {...(chip.icon ? { icon: chip.icon } : {})}>{chip.word}</Chip>}
            </span>
            <span className="text-sm text-muted" data-memory>{line}{active && canWrite && words.line ? ` · ${words.line}` : ''}</span>
          </span>
        </button>
        <span className="flex flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
          {group.memory.assignedTo && <Avatar name={group.memory.assignedTo} tip={`Assigned to ${group.memory.assignedTo}`} />}
          {active && canWrite && words.link && <button type="button" className="min-h-6 text-sm font-semibold text-accent underline decoration-dotted hover:decoration-solid" onClick={onEmail}>{words.link}</button>}
          {stepButton()}
          {active && canWrite && (next.step === 'first' || next.step === 'reminder') && <Button small onClick={onTeams} disabled={!group.people.some((person) => person.email)}><Icon name="teams" />Teams</Button>}
          <MenuButton label="More" tip={`More for ${label}`}>
            {(close) => <>
              <MenuItem icon="note" label="Note" tip="A note for the team on these CIs" onClick={() => { close(); setFolded(false); setNoting(true); }} />
              {!closed && openKeys.length > 0 && <AssignItems keys={openKeys} current={group.memory.assignedTo} close={close} />}
              {active && canWrite && mode === 'solve' && <><MenuLine /><MenuItem icon="stop" label="Stop following" tip="Not followed up: a reason and a review date" onClick={() => { close(); setExcepting(true); }} /></>}
              <MenuLine />
              <MenuItem icon="export" label="Export" tip="Save the CIs of this group as a file" onClick={() => { close(); exportList(group.cases, store.people, `${card.label} ${label}`); }} />
            </>}
          </MenuButton>
        </span>
      </div>
      {!folded && <div className="space-y-3 border-t border-line px-4 py-3">
        {hints.length > 0 && <p className="text-sm text-muted" data-hint>{hints.join(' ')}</p>}
        {active && group.contacts.length > 1 && (
          <p className="text-sm text-muted">Asked: {group.contacts.map((person, index) => <span key={person.email || index}>{index ? ', ' : ''}<PersonLink id={contactIdOf(group, person.email)} name={person.name} className="font-semibold text-ink" /> ({person.via})</span>)}</p>
        )}
        <CiTable rows={group.rows} roles={roles} contract={contract} place={place && places.length > 1} markUnwritable={canWrite} />
        {group.people.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
            <Icon name="people" className="size-3.5" />People:
            {group.people.map((person) => <span key={person.id} className="rounded-full bg-surface-2 px-2 py-0.5 text-ink"><PersonLink id={person.id} name={person.name} title={person.email} /></span>)}
          </p>
        )}
        <NoteLines memory={group.memory} handover={lastHandover(group.open)} />
        {noting && <NoteField keys={group.cases.map((item) => item.key)} placeholder={`A note for the team on these ${plural(group.rows.length, subjectWord(card.pack, 1), subjectWord(card.pack, 2))} of "${card.label}"`}
          saved={`Note saved. It shows on this group and on each of its ${subjectWord(card.pack, 2)}.`} onDone={() => setNoting(false)} />}
      </div>}
      {excepting && <ExceptionDialog keys={openKeys} title={`Stop following ${plural(group.rows.length, 'CI')} of ${card.label}`} onClose={() => setExcepting(false)} />}
    </article>
  );
}

/**
 * Share out: gives the groups nobody has taken to the team members in turn (the biggest first, to who has least). When
 * it cannot, the button is grey and says why next to it (rule 6).
 */
export function ShareOut({ groups }: { groups: OwnerGroup[] }) {
  const store = useStore();
  const [asking, setAsking] = useState(false);
  const free = groups.filter((group) => group.open.length && group.open.every((item) => !item.assignedTo));
  const input = free.map((group) => ({ key: group.key, keys: group.open.map((item) => item.key), size: group.rows.filter((row) => row.cases.some((item) => !isClosed(item))).length }));
  const plan = asking ? shareOutPlan(input) : new Map<string, string>();
  const per = new Map<string, { groups: number; cis: number }>();
  for (const item of asking ? input : []) { const name = plan.get(item.key)!; const entry = per.get(name) ?? { groups: 0, cis: 0 }; entry.groups += 1; entry.cis += item.size; per.set(name, entry); }
  if (store.mode === 'files' || !groups.length) return null;
  const why = store.team.length < 2 ? 'Add colleagues in Settings' : free.length ? '' : 'Every group is taken';
  return <>
    <Button small onClick={() => setAsking(true)} disabled={!!why} data-tip="Give the groups nobody has taken to the team, in turn"><Icon name="share" />Share out</Button>
    {why && <Why>{why}</Why>}
    {asking && (
      <ConfirmDialog title={`Share out ${plural(free.length, 'free group')}?`} confirm="Share out" onClose={() => setAsking(false)}
        onConfirm={() => { void applyShareOut(input, plan).then(() => toast(`${plural(free.length, 'group')} shared out.`)); }}>
        <ul className="list-disc pl-5">{Array.from(per.entries()).map(([name, entry]) => <li key={name}>{name}: {plural(entry.groups, 'group')} ({plural(entry.cis, 'CI')})</li>)}</ul>
        <p>You can still change each one.</p>
      </ConfirmDialog>
    )}
  </>;
}

const cisOf = (groups: OwnerGroup[]): number => new Set(([] as Case[]).concat(...groups.map((group) => group.cases)).map((item) => item.fact.ciKey)).size;

const HINTS = {
  review: 'Listed for a review only: the rule is not agreed yet, or the change must be confirmed first. Nothing here turns the card red.',
  waiting: 'The CI is not live yet (status Ready), it waits for a date, or EPO already holds the right value. Nobody is asked, and each line says why. A finding moves to the main list at a later report when its reason is gone.',
  known: 'A tag of the team explains the finding. Nobody is asked. When the tag is removed, the finding moves to the main list at the next report.',
  done: 'Verified by a later report, or not followed up. Nothing to do.'
};

/**
 * The lists under the main one, folded: To check (on a card that is not a review card), Waiting, Known, and Done (the
 * groups verified or closed). Nobody is asked from them.
 */
export function StateLists({ card, review, waiting, known, closed, listKey, onEmail, onTeams }: { card: CardSummary; review: OwnerGroup[]; waiting: OwnerGroup[]; known: OwnerGroup[]; closed: OwnerGroup[]; listKey: string; onEmail: (group: OwnerGroup) => void; onTeams: (group: OwnerGroup) => void }) {
  const lists = [['review', review, 'To check', 'eye'], ['waiting', waiting, 'Waiting', 'clock'], ['known', known, 'Known', 'tag']] as const;
  return <>
    {lists.map(([id, list, title, icon]) => list.length > 0 && (
      <Fold key={id} title={title} count={cisOf(list)} icon={icon} hint={HINTS[id]}>
        {list.map((group) => <GroupCard key={`${listKey}|${id}|${group.key}`} group={group} card={card} mode={id} startFolded={list.length > FOLD_ABOVE} onEmail={() => onEmail(group)} onTeams={() => onTeams(group)} />)}
      </Fold>
    ))}
    {closed.length > 0 && (
      <Fold title="Done" count={cisOf(closed)} icon="ok" hint={HINTS.done}>
        {closed.map((group) => <GroupCard key={`${listKey}|closed|${group.key}`} group={group} card={card} mode="solve" startFolded={closed.length > FOLD_ABOVE} onEmail={() => onEmail(group)} onTeams={() => onTeams(group)} />)}
      </Fold>
    )}
  </>;
}

/**
 * The folded lists of a card that asks no owner (a fix list, a review list, the mailbox card): To check, Waiting and
 * Known, as plain lines. No owner, no people, no message.
 */
export function QuietLists({ card, matches, review = true }: { card: CardSummary; matches: (item: Case) => boolean; review?: boolean }) {
  const contract = card.pack.subject === 'contract';
  const lists = [
    ['review', review ? card.review.filter(matches) : [], 'To check', 'eye', HINTS.review],
    ['waiting', card.waiting.filter(matches), 'Waiting', 'clock', 'Not live yet, or it waits for a date. Nothing to do now: it moves to the main list at a later report.'],
    ['known', card.known.filter(matches), 'Known', 'tag', HINTS.known]
  ] as const;
  return <>
    {lists.map(([id, list, title, icon, hint]) => list.length > 0 && (
      <Fold key={id} title={title} count={list.length} icon={icon} hint={hint}><PlainLines cases={list} contract={contract} /></Fold>
    ))}
  </>;
}
