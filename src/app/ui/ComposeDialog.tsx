// The email window (build L4): the drafts of a message, opened from a card, a case and a person's page.
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildDrafts, recipientOf, toMailbox } from '../../core/messages/messages.ts';
import { CHECK_PACKS } from '../platform/bundle.ts';
import { messageSettings, queue, recordSent } from '../state/messages.ts';
import { QUEUED_AFTER_MS, newRef, state, toast } from '../state/store.ts';
import { colleagueContacts, recheckColleagues } from '../state/team.ts';
import { useStore } from '../state/use-store.ts';
import { toSolve } from '../view/cases.ts';
import { askable } from '../view/fix-list.ts';
import type { OwnerGroup } from '../view/groups.ts';
import { DoubleContactBox } from './people.tsx';
import { Button, Chip, Dialog, Field, Icon, Why, cx, inputClass, plural } from './basics.tsx';
import { MenuButton, MenuItem, Tabs } from './parts.tsx';
import type { DoubleContact } from '../../core/team/team.ts';
import type { Draft } from '../../core/messages/messages.ts';

/** Outlook cuts a mailto link that is too long: above this, the message is copied and pasted instead. */
const MAILTO_BODY_LIMIT = 1800;
const KIND_LABEL = { first: 'First message', reminder: 'Reminder', escalation: 'Escalation' } as const;
/** The word of the kind of a draft: an escalation of a mailbox (For Procurement) goes to the Procurement lead. */
const kindLabel = (draft: Draft): string => (draft.kind === 'escalation' && draft.mailbox ? 'Escalation to the Procurement lead' : draft.kind === 'reminder' && draft.newKeys.length ? 'Reminder with new points' : KIND_LABEL[draft.kind]);
const cardLabel = (id: string): string => CHECK_PACKS.filter((pack) => pack.id === id)[0]?.cardLabel ?? id;
const isContract = (draft: Draft): boolean => draft.checkIds.every((id) => CHECK_PACKS.filter((pack) => pack.id === id)[0]?.subject === 'contract');
/** The key of a draft: the same while the manager types, so its fields are kept. */
const draftKey = (draft: Draft): string => `${draft.ref}|${draft.kind}|${draft.nobodyAbove ? 'typed' : draft.to}`;

/** Copies the message with its table (HTML) and as plain text, for pasting into Outlook. */
async function copyMessage(draft: Draft): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const html = `<div style="font:14px Calibri,Arial,sans-serif">${draft.body}</div>`;
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([draft.plain], { type: 'text/plain' }) })]);
      return true;
    }
    await navigator.clipboard.writeText(draft.plain);
    return true;
  } catch {
    return false;
  }
}

const addresses = (text: string): string[] => text.split(/[;,]/).map((part) => part.trim()).filter(Boolean);

/** To: the person the check asks first. Cc: everybody else on the CIs of the group, once each. */
function groupCc(draft: Draft, group: OwnerGroup): string {
  const to = draft.to.toLowerCase();
  const cc: string[] = [];
  // A message to a mailbox (For Procurement) copies nobody: the people of a contract are not asked.
  // A message to a team (Process Management) copies nobody either: the people of the CIs are not written to (D195).
  const others = draft.mailbox || draft.team ? [] : group.people.map((person) => person.email);
  for (const address of [...addresses(draft.cc), ...others]) {
    if (address && address.toLowerCase() !== to && !cc.some((known) => known.toLowerCase() === address.toLowerCase())) cc.push(address);
  }
  return cc.join('; ');
}

/** Who To and Cc are, and why, in a few words under the field (U065). */
function hints(draft: Draft): { to: string; cc: string } {
  if (draft.mailbox) return { to: draft.kind === 'escalation' ? 'The Procurement lead of Settings' : 'The Procurement mailbox of Settings', cc: 'Nobody is copied' };
  if (draft.team) return { to: 'The people of the team in Settings', cc: 'Nobody is copied' };
  if (draft.kind === 'escalation') return { to: draft.nobodyAbove ? 'The person you typed above' : `Above ${draft.about ?? 'the person asked'}: the owner, else the manager`, cc: `${draft.about ?? 'The person asked'} and the others on these CIs` };
  return { to: 'The person the check asks', cc: 'The others on these CIs' };
}

/** What the manager typed and did in one draft. Kept by the window, so a draft keeps it when another tab is opened. */
interface Form { to: string; toEdited: boolean; cc: string; subject: string; done: string; outlook: boolean; copied: boolean }
const formOf = (draft: Draft, group: OwnerGroup): Form => ({ to: draft.to, toEdited: false, cc: groupCc(draft, group), subject: draft.subject, done: '', outlook: false, copied: false });

/** Before a send: false when a colleague wrote to the same person not long ago and the manager has not said to go on. */
type Guard = (to: string, keys: string[]) => Promise<boolean>;

/** The fields and the preview of one draft. The preview shows its first lines; Show all opens it. */
function DraftBody({ draft, form, set }: { draft: Draft; form: Form; set: (change: Partial<Form>) => void }) {
  const [all, setAll] = useState(false);
  const hint = hints(draft);
  const cards = draft.checkIds.map(cardLabel);
  return (
    <section className="space-y-3" data-draft={draft.kind}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm whitespace-nowrap" data-tip={cards.length > 1 ? cards.join(', ') : undefined}>
          {plural(draft.ciCount, isContract(draft) ? 'contract' : 'CI')} · {cards.length === 1 ? cards[0] : plural(cards.length, 'card')}{draft.part.count > 1 ? ` · part ${draft.part.index} of ${draft.part.count}` : ''}
        </strong>
        {form.done ? <Chip tone="green" icon="check">{form.done}</Chip> : <Chip tone={draft.kind === 'escalation' ? 'red' : draft.kind === 'reminder' ? 'amber' : 'grey'}>{kindLabel(draft)}</Chip>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="To" hint={hint.to}><input className={inputClass} value={form.to} onChange={(event) => set({ to: event.target.value, toEdited: true })} disabled={!!form.done} /></Field>
        <Field label="Cc" hint={hint.cc}><input className={inputClass} value={form.cc} onChange={(event) => set({ cc: event.target.value })} disabled={!!form.done} /></Field>
      </div>
      <Field label="Subject"><input className={inputClass} value={form.subject} onChange={(event) => set({ subject: event.target.value })} disabled={!!form.done} /></Field>
      <div className="space-y-1">
        <iframe sandbox="" title="Message preview" className={cx('w-full rounded-lg bg-surface ring-1 ring-line', all ? 'h-96' : 'h-36')}
          srcDoc={`<body style="font:14px system-ui,sans-serif;margin:12px;color:#0f172a">${draft.body}</body>`} />
        <Button kind="ghost" small aria-expanded={all} onClick={() => setAll(!all)}>{all ? 'Show less' : 'Show all'}<Icon name={all ? 'up' : 'down'} className="size-3.5" /></Button>
      </div>
    </section>
  );
}

/**
 * The one footer of the email window, for the draft in view: More (Copy, Test) at the left, then Cancel, Outlook and the
 * main button Send from mailbox. After Outlook: "Sent?" with Yes and No.
 */
function DraftFooter({ draft, form, set, guard, onClose }: { draft: Draft; form: Form; set: (change: Partial<Form>) => void; guard: Guard; onClose: () => void }) {
  const store = useStore();
  const values = { ref: draft.ref, to: form.to.trim(), cc: form.cc.trim(), subject: form.subject.trim(), kind: draft.kind };
  const files = store.mode === 'files';
  const send = async (): Promise<void> => {
    if (!(await guard(values.to, draft.keys))) return;
    const file = await queue(draft, values.to, values.cc, values.subject);
    await recordSent(draft.keys, draft.newKeys, { ...values, channel: 'mailbox', text: file });
    set({ done: 'Handed to the shared mailbox' });
  };
  const test = async (): Promise<void> => {
    await queue(draft, store.user.email, '', `[TEST for ${values.to}] ${values.subject}`);
    toast(`Test handed to the shared mailbox for ${store.user.email}. The case is not changed.`);
  };
  const copy = async (): Promise<boolean> => {
    const done = await copyMessage(draft);
    if (done) { set({ copied: true }); toast('Message copied. Paste it into the email in Outlook.'); } else toast('The browser did not allow copying. Select the message in the preview and copy it.');
    return done;
  };
  // To, Cc and Subject are always filled. The body only when it is short: a long one is copied first, then pasted.
  const outlook = async (): Promise<void> => {
    if (!(await guard(values.to, draft.keys))) return;
    const short = draft.plain.length <= MAILTO_BODY_LIMIT;
    if (!short && !form.copied) await copy();
    const body = short && !form.copied ? `&body=${encodeURIComponent(draft.plain)}` : '';
    window.location.href = `mailto:${encodeURIComponent(values.to)}?cc=${encodeURIComponent(values.cc)}&subject=${encodeURIComponent(values.subject)}${body}`;
    set({ outlook: true });
  };
  if (form.done) return <Button kind="primary" onClick={onClose}>Close</Button>;
  if (form.outlook) {
    return <>
      <span className="mr-auto text-sm whitespace-nowrap text-muted">Sent?</span>
      <Button kind="secondary" onClick={() => set({ outlook: false })}>No</Button>
      <Button kind="primary" onClick={() => void recordSent(draft.keys, draft.newKeys, { ...values, channel: 'outlook' }).then(() => set({ done: 'Recorded as sent from Outlook' }))}>Yes</Button>
    </>;
  }
  return <>
    <div className="mr-auto">
      <MenuButton label="More" up align="left">
        {(close) => <>
          <MenuItem icon={form.copied ? 'check' : 'copy'} label="Copy" tip="Copy the message, with its table, to paste it into Outlook" onClick={() => { close(); void copy(); }} />
          {!files && <MenuItem icon="send" label="Test" tip="Send a test to me from the shared mailbox. The case is not changed" onClick={() => { close(); void test(); }} />}
        </>}
      </MenuButton>
    </div>
    {files ? <Why>No team folder: use Outlook</Why> : !values.to && <Why>Fill in To first</Why>}
    <Button kind="ghost" onClick={onClose}>Cancel</Button>
    <Button kind="secondary" onClick={() => void outlook()} disabled={!values.to} data-tip="Open the message in Outlook"><Icon name="outlook" />Outlook</Button>
    <Button kind="primary" onClick={() => void send()} disabled={!values.to || files}><Icon name="send" />Send from mailbox</Button>
  </>;
}

/** The short name of a draft on its tab: the kind and the CIs, and who when the drafts go to different people. */
function tabLabel(draft: Draft, group: OwnerGroup, named: boolean): string {
  const kind = draft.kind === 'first' ? 'Email' : KIND_LABEL[draft.kind];
  const who = group.people.filter((person) => person.email.toLowerCase() === draft.to.toLowerCase())[0]?.name ?? draft.to;
  const size = draft.part.count > 1 ? `part ${draft.part.index}` : plural(draft.ciCount, isContract(draft) ? 'contract' : 'CI');
  return [named && who ? who : '', kind, size].filter(Boolean).join(' · ');
}

/**
 * The email window: one message per person asked, the rest of the group in copy. Two drafts or more are tabs. Nothing is
 * sent until a send button is pressed.
 */
export function ComposeDialog({ group, onClose, title }: { group: OwnerGroup; onClose: () => void; title?: string }) {
  const store = useStore();
  const [others, setOthers] = useState(true);
  // An escalation nobody is known for: the manager types who gets it, or sends one more reminder (D160).
  const [above, setAbove] = useState({ name: '', email: '' });
  const [remindInstead, setRemindInstead] = useState(false);
  const refs = useRef<string[]>([]);
  const [found, setFound] = useState<DoubleContact[]>([]);
  const [goOn, setGoOn] = useState<Set<string>>(new Set());
  const [forms, setForms] = useState<Record<string, Form>>({});
  const [tab, setTab] = useState('');
  const result = useMemo(() => {
    const own = group.open;
    const ownKeys = new Set(own.map((item) => item.key));
    const asked = new Set(own.map((item) => recipientOf(item.fact, state.settings).email.toLowerCase()).filter(Boolean));
    // One message per person across all cards: add this person's open points from the other cards.
    // A line SACM keeps on its fix list (askWhenUnsure, not handed to the owner yet) is never added.
    // Only points never asked, or with a reminder due: a point that waits for its answer, or was answered, is not sent again.
    const more = state.cases.filter((item) => !ownKeys.has(item.key) && toSolve(item) && (!item.messages.length || item.reminderDue) && askable(CHECK_PACKS.filter((pack) => pack.id === item.fact.checkId)[0], item) && asked.has(recipientOf(item.fact, state.settings).email.toLowerCase()));
    const extra = others ? more : [];
    const options = { escalateTo: above, remindInstead };
    const unknown = buildDrafts(own, CHECK_PACKS, messageSettings(), () => '').drafts.filter((draft) => draft.nobodyAbove);
    // The references stay the same while the manager types or ticks: a draft is not made anew for each letter.
    let used = 0;
    const stableRef = (): string => { const ref = refs.current[used] ?? newRef(); refs.current[used] = ref; used += 1; return ref; };
    return {
      ...buildDrafts(own.concat(extra), CHECK_PACKS, messageSettings(), stableRef, options), more: more.length, moreCards: new Set(more.map((item) => item.fact.checkId)).size,
      unknown: Array.from(new Set(unknown.map((draft) => draft.about ?? ''))).filter(Boolean),
      attempts: Math.max(0, ...own.filter((item) => item.overLimit).map((item) => item.messages.length))
    };
  }, [group, others, above, remindInstead]);
  const allKeys = result.drafts.flatMap((draft) => draft.keys);
  // Opening the window reads the colleagues' journals again: did someone write to these people a moment ago?
  useEffect(() => {
    let live = true;
    void recheckColleagues().then(() => { if (live) setFound(colleagueContacts(result.drafts.map((draft) => draft.to), allKeys)); });
    return () => { live = false; };
  }, [result]);
  const guard: Guard = async (to, keys) => {
    await recheckColleagues();
    const fresh = colleagueContacts([to], keys).filter((item) => !goOn.has(item.event.id));
    if (!fresh.length) return true;
    setFound(fresh);
    toast('A colleague wrote to this person not long ago. See the warning at the top.');
    document.querySelector('dialog[open] [role=alert]')?.scrollIntoView({ block: 'nearest' });
    return false;
  };
  // The form of a draft. The address of an escalation nobody is known for follows what is typed at the top, until To is changed.
  const formFor = (draft: Draft): Form => {
    const form = forms[draftKey(draft)] ?? formOf(draft, group);
    return draft.nobodyAbove && !form.toEdited ? { ...form, to: draft.to } : form;
  };
  const setFor = (draft: Draft) => (change: Partial<Form>): void => setForms((before) => ({ ...before, [draftKey(draft)]: { ...(before[draftKey(draft)] ?? formOf(draft, group)), ...change } }));
  const shownDraft = result.drafts.filter((draft) => draftKey(draft) === tab)[0] ?? result.drafts[0];
  const named = new Set(result.drafts.map((draft) => draft.to.toLowerCase())).size > 1;
  const shown = found.filter((item) => !goOn.has(item.event.id));
  const mailbox = group.open.length > 0 && group.open.every((item) => toMailbox(item.fact));
  // Nothing was ever sent by the flow and the oldest outbox message waits for over an hour: the flow is not set up yet (F06).
  const flowSilent = store.mode === 'folder' && store.sent.size === 0 && store.outbox.some((message) => Date.now() - Date.parse(`${message.at.slice(0, 19)}Z`) > QUEUED_AFTER_MS);
  return (
    <Dialog title={title ?? `Email: ${group.owner ? group.owner.name : 'CIs without an owner'}`} onClose={onClose} wide
      actions={shownDraft ? <DraftFooter draft={shownDraft} form={formFor(shownDraft)} set={setFor(shownDraft)} guard={guard} onClose={onClose} /> : <Button kind="primary" onClick={onClose}>Close</Button>}>
      <DoubleContactBox found={shown} keys={allKeys} onGiven={onClose} anywayLabel="Write anyway"
        onAnyway={() => setGoOn(new Set([...goOn, ...found.map((item) => item.event.id)]))} />
      {result.more > 0 && !mailbox && <label className="flex min-h-6 items-center gap-2 text-sm whitespace-nowrap max-sm:whitespace-normal">
        <input type="checkbox" checked={others} onChange={(event) => setOthers(event.target.checked)} className="size-[18px] accent-accent" />
        Add {plural(result.more, 'point')} from {plural(result.moreCards, 'other card')}
      </label>}
      {result.unknown.length > 0 && (
        <div role="group" aria-label="Who gets the escalation" className="space-y-2 rounded-xl bg-amber-soft p-3 ring-1 ring-amber-line">
          <p className="text-sm font-semibold text-amber">Nobody is known to escalate to for {result.unknown.join(' and ')}. Type who gets the escalation.</p>
          {!remindInstead && <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><input className={inputClass} value={above.name} onChange={(event) => setAbove({ ...above, name: event.target.value })} /></Field>
            <Field label="Email"><input type="email" className={inputClass} value={above.email} onChange={(event) => setAbove({ ...above, email: event.target.value })} /></Field>
          </div>}
          <Button small kind="secondary" data-tip={remindInstead ? undefined : `Reminder ${result.attempts} instead of the escalation`} onClick={() => setRemindInstead(!remindInstead)}>
            <Icon name={remindInstead ? 'escalate' : 'remind'} className="size-3.5" />{remindInstead ? 'Escalate instead' : 'One more reminder'}
          </Button>
        </div>
      )}
      {result.skipped.length > 0 && <p className="rounded-lg bg-amber-soft px-3 py-2 text-amber" data-tip="The report names no role, manager or department head, or, for a CI from EPO, the EPO inventory owner of Settings has no email">{plural(result.skipped.length, 'point')} left out: nobody to write to.</p>}
      {result.drafts.length === 0 && <p>Nobody in this group has an email address to write to.</p>}
      {result.drafts.length > 1 && shownDraft && <Tabs label="Drafts" value={draftKey(shownDraft)} onChange={setTab}
        tabs={result.drafts.map((draft) => ({ id: draftKey(draft), label: tabLabel(draft, group, named), icon: formFor(draft).done ? 'check' as const : undefined }))} />}
      {shownDraft && <DraftBody key={draftKey(shownDraft)} draft={shownDraft} form={formFor(shownDraft)} set={setFor(shownDraft)} />}
      {shownDraft && !formFor(shownDraft).done && shownDraft.nobodyAbove && !formFor(shownDraft).to.trim() && <p className="text-sm text-amber">Type who gets the escalation at the top first.</p>}
      {flowSilent && <p className="text-xs text-amber" data-tip="Messages wait in the outbox until the sending flow is set up">Nothing was sent from the shared mailbox yet. Use Outlook for now.</p>}
    </Dialog>
  );
}
