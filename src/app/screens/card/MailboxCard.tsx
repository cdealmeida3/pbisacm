// A card of the kind One mailbox (For Procurement, D98): one message for the whole card, with a table per kind of problem.
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { escalationOf, recipientOf, toMailbox } from '../../../core/messages/messages.ts';
import { today, update } from '../../state/store.ts';
import { useStore } from '../../state/use-store.ts';
import { subjectWord } from '../../view/cards.ts';
import { isClosed } from '../../view/cases.ts';
import { combinedGroup, groupChip, memoryWords, nextStep, ownerGroups, stepIcon, stepWords } from '../../view/groups.ts';
import { SHOWN_ROLES } from '../../view/people.ts';
import type { CardSummary } from '../../view/cards.ts';
import type { OwnerGroup } from '../../view/groups.ts';
import { AssignItems } from '../../ui/people.tsx';
import { ComposeDialog } from '../../ui/ComposeDialog.tsx';
import { Button, Chip, Icon, Why } from '../../ui/basics.tsx';
import { Avatar, Fold, MenuButton, MenuItem } from '../../ui/parts.tsx';
import type { IconName } from '../../ui/icons.ts';
import { CardHead, CardToolbar, NothingToDo } from './CardHead.tsx';
import { CiTable } from './CiTable.tsx';
import { NoteField, NoteLines, QuietLists, exportList, lastHandover } from './GroupCard.tsx';
import { useOwnerGroups } from './OwnerCard.tsx';

/** Opens Settings from a card. */
const SettingsLink = () => <button type="button" className="font-semibold underline" onClick={() => update({ openSettings: true })}>Open Settings</button>;

/**
 * A card whose findings all go to one mailbox (version 0.31, build L3). Its step sits where every card has its actions,
 * at the right of the toolbar; grey with its reason in words when the mailbox has no email (D231). The memory of the
 * one message is in the head; then a table for each kind of problem. The mailbox warning is said once, at the top.
 */
export function MailboxCard({ card }: { card: CardSummary }) {
  const store = useStore();
  const filters = useOwnerGroups(card);
  const { matches } = filters;
  // The message is written for the cases as they were when the button was pressed: the drafts stay after Send.
  const [writing, setWriting] = useState<OwnerGroup | null>(null);
  const [noting, setNoting] = useState(false);
  const recipient = (fact: Parameters<typeof recipientOf>[0]) => recipientOf(fact, store.settings);
  const open = useMemo(() => card.main.filter((item) => !isClosed(item) && toMailbox(item.fact)), [card.main]);
  const all = useMemo(() => combinedGroup(open, store.people, recipient), [open, store.people, store.settings]);
  const kinds = useMemo(() => ownerGroups(card.main.filter(matches), store.people, recipient), [card.main, store.people, store.settings, filters.search, store.filters.search]);
  const liveKinds = kinds.filter((group) => group.state !== 'closed');
  const closedKinds = kinds.filter((group) => group.state === 'closed');
  const mailbox = open[0] ? recipient(open[0].fact) : null;
  const lead = open[0] ? escalationOf(open[0].fact, store.settings) : null;
  const next = nextStep(all, today(), store.settings);
  const words = stepWords(next);
  const keys = open.map((item) => item.key);
  const idle = card.open.length + card.review.length === 0;
  const canWrite = !!mailbox?.email;
  const contracts = new Set(open.map((item) => item.fact.ciKey)).size;
  const things = (count: number): string => `${count} ${subjectWord(card.pack, count)}`;
  const chip = groupChip(all, 'solve');
  const replied = open.filter((item) => item.status === 'Answered')[0];
  const step = (): ReactNode => {
    if (next.step === 'answered') return <Button small kind="primary" onClick={() => replied && update({ openCi: replied.fact.ciKey })}><Icon name="replies" />Reply</Button>;
    if (next.step === 'cannot-escalate') return <Button small kind="primary" disabled={!canWrite} onClick={() => setWriting(all)}><Icon name="remind" />Remind</Button>;
    if (!words.button) return words.link ? <Button small disabled={!canWrite} onClick={() => setWriting(all)}><Icon name="mail" />{words.link === 'Remind now' ? 'Remind' : 'Email'}</Button> : null;
    return <Button small kind="primary" disabled={!canWrite} onClick={() => setWriting(all)} data-step-button={next.step}><Icon name={stepIcon(next) as IconName} />{words.button}</Button>;
  };
  return (
    <section aria-label={card.label} className="min-w-0 space-y-4" data-kind="mailbox">
      <CardHead card={card} numbers={idle ? [] : [{ value: open.length, label: 'Problems' }, { value: contracts, label: card.pack.subject === 'contract' ? 'Contracts' : 'CIs' }]}>
        {!idle && mailbox && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted" data-one-message>
            <Icon name="mail" className="size-3.5" />One email to <b className="font-semibold text-ink">{mailbox.name || 'the mailbox'}</b>{canWrite ? <span>{mailbox.email}</span> : null}
            <span>· {memoryWords(all.memory)}{words.line && next.step !== 'cannot-escalate' ? ` · ${words.line}` : ''}</span>
            {chip && <Chip tone={chip.tone} {...(chip.icon ? { icon: chip.icon } : {})}>{chip.word}</Chip>}
            {all.memory.assignedTo && <Avatar name={all.memory.assignedTo} tip={`Assigned to ${all.memory.assignedTo}`} />}
          </p>
        )}
        {mailbox && !canWrite && <p className="mt-1.5 text-sm font-semibold text-amber" data-mailbox-warning><Icon name="warn" className="mr-1 inline size-3.5" />The Procurement mailbox has no email yet. Set it in Settings to write the message. <SettingsLink /></p>}
        {mailbox && next.step === 'cannot-escalate' && !lead && <p className="mt-1.5 text-sm font-semibold text-amber"><Icon name="warn" className="mr-1 inline size-3.5" />Procurement did not answer the reminders, and Settings has no Procurement lead: there is no escalation. Set the Procurement lead in Settings, or write to the mailbox again. <SettingsLink /></p>}
      </CardHead>
      <NothingToDo card={card} />
      {!idle && (
        <CardToolbar filters={{ ...filters, classes: [], setOnlyDue: undefined, setOnlyMine: undefined }}
          right={<>
            <Button small disabled={!kinds.length} onClick={() => exportList(kinds.flatMap((group) => group.cases), store.people, card.label)} data-tip="Save this list as a file"><Icon name="export" />Export</Button>
            {mailbox && <MenuButton label="More" tip={`More for ${card.label}`}>
              {(close) => <>
                <MenuItem icon="note" label="Note" tip="A note for the team on this card" onClick={() => { close(); setNoting(true); }} />
                <AssignItems keys={keys} current={all.memory.assignedTo} close={close} />
              </>}
            </MenuButton>}
            {mailbox && !canWrite && <Why>Set the mailbox email first</Why>}
            {mailbox && step()}
          </>} />
      )}
      {!idle && (all.memory.lastNote || lastHandover(open) || noting) && (
        <div className="space-y-2">
          <NoteLines memory={all.memory} handover={lastHandover(open)} />
          {noting && <NoteField keys={keys} placeholder={`A note for the team on "${card.label}"`} saved="Note saved. It shows here and on each contract." onDone={() => setNoting(false)} />}
        </div>
      )}
      {!idle && !liveKinds.length && <p className="text-sm text-muted">Nothing matches the search.</p>}
      {liveKinds.map((group) => (
        <section key={group.key} aria-label={group.label ?? 'Problems'} className="rounded-xl bg-surface px-2 pt-3 pb-1 shadow-sm ring-1 ring-line" data-kind-table={group.label ?? ''}>
          <h3 className="px-2 font-semibold">{group.label ?? 'Problems'} <span className="text-sm font-normal text-muted">{things(group.rows.length)}</span></h3>
          <CiTable rows={group.rows} roles={SHOWN_ROLES.filter((role) => role === 'owned_by')} contract={card.pack.subject === 'contract'} />
        </section>
      ))}
      {closedKinds.length > 0 && (
        <Fold title="Done" count={new Set(closedKinds.flatMap((group) => group.rows.map((row) => row.ciKey))).size} icon="ok" hint="Verified by a later report, or not followed up. Nothing to do.">
          {closedKinds.map((group) => <section key={group.key} className="rounded-xl bg-surface px-2 pt-3 pb-1 shadow-sm ring-1 ring-line"><h3 className="px-2 font-semibold">{group.label ?? 'Problems'}</h3><CiTable rows={group.rows} roles={[]} contract={card.pack.subject === 'contract'} /></section>)}
        </Fold>
      )}
      <QuietLists card={card} matches={matches} />
      {writing && <ComposeDialog group={writing} onClose={() => setWriting(null)} title={`Message to ${mailbox?.name || 'the mailbox'}`} />}
    </section>
  );
}
