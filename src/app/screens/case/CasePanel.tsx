import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { EXCEPTION, REVIEWED_ASK, REVIEWED_BACK, STATUSES, ownerAsked } from '../../../core/cases/cases.ts';
import { recipientOf } from '../../../core/messages/messages.ts';
import { CHECK_PACKS, REFERENCES } from '../../platform/bundle.ts';
import { record } from '../../state/journal.ts';
import { localDay, localTime, toast, today, update } from '../../state/store.ts';
import { useStore } from '../../state/use-store.ts';
import { cardWords, describeEvent, oneLinePerMessage } from '../../view/activity.ts';
import { cardKind } from '../../view/cards.ts';
import { fixedBy, handedToOwner } from '../../view/fix-list.ts';
import { CopyValue, ServiceNowLink } from '../../ui/servicenow.tsx';
import { epoCorrection, isClosed, stateWhyOf, statusWord, toSolve } from '../../view/cases.ts';
import { nextStep, ownerGroups, stepIcon, stepWords } from '../../view/groups.ts';
import { ROLE_LABEL, SHOWN_ROLES } from '../../view/people.ts';
import type { OwnerGroup } from '../../view/groups.ts';
import { epoConfig, systemsById } from '../../../core/sources/epo/epo-report.ts';
import { AssignMenu, PersonLink } from '../../ui/people.tsx';
import { StagePicker } from '../../ui/stages.tsx';
import { canMarkProcessMissing, mappingConfig, processMissing, stageOf, stagesFor, toldOn } from '../../../core/mapping/backlog.ts';
import { fixLabel } from '../../ui/labels.ts';
import { ComposeDialog } from '../../ui/ComposeDialog.tsx';
import { ConfirmDialog } from '../../ui/ConfirmDialog.tsx';
import { ExceptionDialog } from '../../ui/ExceptionDialog.tsx';
import { Button, Chip, Icon, IconButton, STATE_ICON, STATE_WORD, STATUS_TONE, cx, inputClass, plural, shortDate, yearDate } from '../../ui/basics.tsx';
import type { IconName } from '../../ui/icons.ts';
import { CountBadge, DateField, LongText, Notice, TickBox } from '../../ui/parts.tsx';
import type { Case } from '../../../core/cases/cases.ts';

const packOf = (id: string) => CHECK_PACKS.filter((pack) => pack.id === id)[0];
/** A problem SACM fixes itself: a line of a fix list that was not handed to the owner. */
const sacmFixes = (item: Case): boolean => { const pack = packOf(item.fact.checkId); return !!pack && cardKind(pack) === 'fix' && !handedToOwner(pack, item); };
const markWordOf = (item: Case): string => packOf(item.fact.checkId)?.playbook.markWord ?? 'fixed';
// A time of the journal (UTC) in local time, like Activity; a date alone (a report date) as a date.
const stamp = (at: string): string => (at.length > 10 ? localTime(at) : shortDate(at));

/**
 * A case of the mapping backlog (D201, D203): its stage, which a manager sets as the mapping moves on, and the mark "The
 * process does not exist", which puts the CI into the message to Process Management (on the page Backlog).
 */
function MappingPart({ item }: { item: Case }) {
  const store = useStore();
  const config = mappingConfig(REFERENCES);
  if (!config) return null;
  const stages = stagesFor(config, item.fact.className);
  const found = stageOf(item.timeline, config, item.fact.className);
  const marked = processMissing(item.timeline);
  const told = toldOn(store.events, item.key);
  return (
    <div className="mt-2 space-y-2" data-mapping>
      <StagePicker keys={[item.key]} stages={stages} index={found.index} />
      {found.at && <p className="text-xs text-muted">Stage set by {found.byName}, {localDay(found.at)}.</p>}
      {canMarkProcessMissing(config, item.fact.className, item.fact.mapping ?? []) && (
        <div className="flex flex-wrap items-center gap-2">
          {!marked
            ? <Button small onClick={() => void record('no-process', [item.key], { text: 'yes' }).then(() => toast('Marked. Tell Process Management from the page Backlog.'))}><Icon name="note" className="size-3.5" />The process does not exist</Button>
            : <><span className="text-xs text-amber">{told ? `The process does not exist: Process Management was told on ${shortDate(told)}.` : 'The process does not exist: tell Process Management from the page Backlog.'}</span>
              <Button small kind="ghost" onClick={() => void record('no-process', [item.key], { text: 'no' })}>Undo</Button></>}
        </div>
      )}
    </div>
  );
}

interface Entry { at: string; id: string; icon: string; title: string; text: string; reply?: boolean; tone?: string }

/** The button of a case that hands a line to somebody (`askWhenUnsure`): "Ask the owner"; the reason is the tooltip. */
const askWords = (text: string): { button: string; why: string } => {
  const at = text.lastIndexOf(': ');
  if (at < 0) return { button: text, why: '' };
  const rest = text.slice(at + 2);
  return { button: rest.charAt(0).toLocaleUpperCase('en-GB') + rest.slice(1), why: text.slice(0, at) };
};

/** The bar at the left of a problem: red to solve, blue to check, teal marked, grey waiting or known, green done. */
function barOf(item: Case): string {
  if (isClosed(item)) return 'border-l-green';
  if (item.status === 'Fixed') return 'border-l-teal';
  if (item.state === 'review') return 'border-l-blue';
  return item.state === 'open' ? 'border-l-red' : 'border-l-grey-line';
}

/** One problem of the case: a white box with a bar of its colour, the tick, the problem, its card and where it is fixed. */
function Problem({ item, tick, children }: { item: Case; tick: ReactNode; children: ReactNode }) {
  const pack = packOf(item.fact.checkId);
  return (
    <div data-problem={item.fact.checkId} className={cx('rounded-lg border-l-4 bg-surface px-3 py-2.5 shadow-sm ring-1 ring-line', barOf(item))}>
      <div className="flex items-start gap-2">
        {tick}
        <div className="min-w-0 flex-1">
          <b className="font-semibold">{item.fact.detail}</b>
          <p className="text-sm text-muted">{pack?.cardLabel ?? item.fact.checkId} · {fixLabel(pack, item)}</p>
          {children}
        </div>
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {item.status !== 'New' && <Chip tone={STATUS_TONE[item.status]}>{statusWord(item.status)}{item.verifiedOn ? ` ${shortDate(item.verifiedOn)}` : ''}</Chip>}
          {!isClosed(item) && item.state !== 'open' && <Chip tone={item.state === 'review' ? 'blue' : 'grey'} icon={STATE_ICON[item.state]}>{STATE_WORD[item.state]}</Chip>}
          {item.queued && <Chip tone="amber" icon="outbox">In the outbox</Chip>}
          {item.reminderDue && <Chip tone="amber" icon="bell">Reminder due</Chip>}
          {item.overLimit && <Chip tone="red" icon="escalate">To escalate</Chip>}
        </span>
      </div>
    </div>
  );
}

/**
 * The case panel (version 0.31, build L3): one CI, its problems, its people, its replies and its timeline (the memory).
 * The CI name takes up to two lines. A fixed bar at the bottom holds the main step, Status and Assign; Stop following
 * is its own button (D232).
 */
export function CasePanel() {
  const store = useStore();
  const cases = store.cases.filter((item) => item.fact.ciKey === store.openCi);
  const [note, setNote] = useState('');
  const [request, setRequest] = useState('');
  const [compose, setCompose] = useState<OwnerGroup | null>(null);
  const [excepting, setExcepting] = useState(false);
  const [retireOn, setRetireOn] = useState('');
  const [followAgain, setFollowAgain] = useState(false);
  // The problems the manager ticked (F08), for the CI and the card the panel was opened on. Null: the ticks of the start.
  const [ticks, setTicks] = useState<{ on: string; keys: Set<string> } | null>(null);
  const close = (): void => update({ openCi: '' });
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape' && !document.querySelector('dialog[open]') && !document.querySelector('[role=menu]')) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ordered = useMemo(() => cases.slice().sort((a, b) => Number(b.fact.checkId === store.openCard) - Number(a.fact.checkId === store.openCard) || Number(isClosed(a)) - Number(isClosed(b))), [cases, store.openCard]);
  const entries = useMemo(() => {
    const seen = new Set<string>();
    const list: Entry[] = [];
    const events = new Map<string, Case['timeline'][number]>();
    for (const item of cases) for (const event of item.timeline) if (!(event.type === 'request' && !event.text)) events.set(event.id, event);
    // A reminder with new points is one message, also when this CI has a case in each part.
    for (const line of oneLinePerMessage(Array.from(events.values()))) list.push(describeEvent(line.event, store.sent, line.withNew));
    for (const item of cases) {
      for (const reply of item.replies) {
        if (seen.has(`reply:${reply.file}`)) continue;
        seen.add(`reply:${reply.file}`);
        list.push({ at: reply.received.slice(0, 19), id: reply.file, icon: 'replies', title: `Reply from ${reply.from}`, text: reply.text, reply: true });
      }
    }
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [cases, store.sent]);
  const epoSystems = useMemo(() => (store.epo ? systemsById(store.epo.systems) : null), [store.epo]);
  if (!cases.length) return null;
  const config = epoConfig(REFERENCES);

  const first = ordered[0]!;
  const people = store.people.get(first.fact.ciKey) ?? {};
  // Waiting and known items take no action; a review item can still be noted, assigned or written about.
  const open = cases.filter((item) => toSolve(item) || (!isClosed(item) && item.state === 'review'));
  const openKeys = open.map((item) => item.key);
  const allKeys = cases.map((item) => item.key);
  // Status, Request number and Stop following act only on the ticked problems (D169). Opened from a card: the problem
  // of that card. Opened from a search, My work or a page: all of them. A problem SACM fixes itself is never ticked at the
  // start: it has its own "Fixed".
  const fromCard = store.view === 'overview' && !!store.openCard && cases.some((item) => item.fact.checkId === store.openCard);
  const tickable = open.filter((item) => !sacmFixes(item));
  const startTicks = (fromCard ? tickable.filter((item) => item.fact.checkId === store.openCard) : tickable).map((item) => item.key);
  const tickedOn = `${store.openCi}|${fromCard ? store.openCard : ''}`;
  const tickSet = ticks && ticks.on === tickedOn ? ticks.keys : new Set(startTicks);
  const ticked = open.filter((item) => tickSet.has(item.key));
  const tickedKeys = ticked.map((item) => item.key);
  const tick = (key: string, on: boolean): void => { const keys = new Set(tickSet); if (on) keys.add(key); else keys.delete(key); setTicks({ on: tickedOn, keys }); };
  const status = ticked.length ? ticked[0]!.status : '';
  const cardsOf = (list: Case[]): string => cardWords(list.map((item) => packOf(item.fact.checkId)?.cardLabel ?? item.fact.checkId));
  // The next step of the follow-up, from the same function as the card (F05). No Email when nobody can be asked.
  const next = nextStep({ open }, today(), store.settings);
  const words = stepWords(next);
  const askable = open.some((item) => { const pack = packOf(item.fact.checkId); return !sacmFixes(item) && !!recipientOf(item.fact, store.settings).email && !(pack && cardKind(pack) === 'review'); });
  const writeTo = (): void => setCompose(ownerGroups(open, store.people, (fact) => recipientOf(fact, store.settings))[0] ?? null);
  const replies = entries.filter((entry) => entry.reply);
  const lastReply = replies[0];
  // The planned retirement date the owner gave (D148): on the cases of the checks that ask for it, open or waiting for it.
  const dated = cases.filter((item) => !isClosed(item) && !!packOf(item.fact.checkId)?.playbook.retirementDate && (item.state === 'open' || !!item.retireOn));
  const datedOn = dated.map((item) => item.retireOn).filter(Boolean).sort().pop() ?? '';
  const saveRetirement = (value: string): void => {
    void record('retirement', dated.map((item) => item.key), { retireOn: value }).then(() => toast(value ? `Waits until ${yearDate(value)}.` : 'Planned retirement date taken away.'));
    setRetireOn('');
  };
  const assigned = Array.from(new Set(open.map((item) => item.assignedTo)));
  const roleMissing = (role: string): boolean => cases.some((item) => !isClosed(item) && item.fact.field === role);
  const firstSeen = cases.map((item) => item.firstSeen).sort()[0] ?? '';
  const stopped = cases.filter((item) => item.exception);

  return (
    <div className="fixed inset-0 z-30 flex justify-end print:hidden">
      <button type="button" aria-label="Close the case panel" onClick={close} className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]" />
      <aside aria-label={`Case: ${first.fact.ciName}`} className="relative flex h-full w-full flex-col bg-surface shadow-xl sm:max-w-[560px]">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg leading-snug font-semibold [overflow-wrap:anywhere]" data-case-name>{first.fact.ciName}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
              <span>{first.fact.classLabel}</span>
              {first.fact.ci?.epoId && <span>· {first.fact.ci.epoId}</span>}
              {firstSeen && <span>· Since {shortDate(firstSeen)}</span>}
              {(first.fact.ci?.chips ?? []).map((chip) => <Chip key={chip} tone="blue">{chip}</Chip>)}
            </p>
          </div>
          <IconButton icon="close" label="Close" onClick={close} />
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
          <section className="space-y-2" aria-label="Problems">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">Problems<CountBadge n={cases.length} /></h3>
            {ordered.map((item: Case) => {
              const pack = packOf(item.fact.checkId);
              const to = recipientOf(item.fact, store.settings);
              const unsure = pack?.playbook.askWhenUnsure ? askWords(pack.playbook.askWhenUnsure) : null;
              return (
                <Problem key={item.key} item={item}
                  tick={open.length > 1 && openKeys.indexOf(item.key) >= 0 ? <TickBox label={`Act on: ${pack?.cardLabel ?? item.fact.checkId}`} checked={tickSet.has(item.key)} onChange={(on) => tick(item.key, on)} /> : null}>
                  <div className="mt-1.5 space-y-1.5 text-sm">
                    {sacmFixes(item) || (pack && cardKind(pack) === 'review')
                      ? <p className="text-muted">{sacmFixes(item) ? 'SACM fixes it: nobody is asked.' : 'SACM looks at it: nobody is asked.'}</p>
                      : <p className="text-muted">{to.name ? <>Asked: <PersonLink id={item.fact.contactId || item.fact.contactEmail.toLowerCase()} name={to.name} className="font-semibold text-ink" />{item.fact.contactVia ? ` (${item.fact.contactVia})` : ''}</> : <><Icon name="nobody" className="mr-1 inline size-3.5" />Nobody to ask</>}</p>}
                    {!isClosed(item) && item.assignedTo && <p className="text-muted"><Icon name="assign" className="mr-1 inline size-3.5" />Assigned to {item.assignedTo}{item.handover ? ` (handed over by ${item.handover.byName}${item.handover.text ? `: ${item.handover.text}` : ''})` : ''}</p>}
                    {item.fact.fix && <p className="text-ink"><Icon name="table" className="mr-1 inline size-3.5" />{pack?.playbook.markWord === 'deleted' ? 'Delete list' : 'Fix list'}: {item.fact.fix.change}. Now: {item.fact.fix.current || '–'}. Set to: <b>{item.fact.fix.set || '–'}</b></p>}
                    {!isClosed(item) && pack && cardKind(pack) === 'mapping' && <MappingPart item={item} />}
                    {sacmFixes(item) && !isClosed(item) && item.state === 'open' && (
                      <div className="flex flex-wrap items-center gap-2" data-hand-work>
                        {item.status !== 'Fixed' && item.fact.fix?.value && <CopyValue value={item.fact.fix.value} what={item.fact.fix.change} />}
                        {item.status !== 'Fixed' && <ServiceNowLink fact={item.fact} what={item.fact.ciName} />}
                        {item.status !== 'Fixed'
                          ? <Button small onClick={() => void record('status', [item.key], { text: 'Fixed' }).then(() => toast(`Marked ${markWordOf(item)}. The next report checks it.`))} data-tip={`Mark this line ${markWordOf(item)}`}><Icon name="fixed" />{markWordOf(item) === 'deleted' ? 'Deleted' : 'Fixed'}</Button>
                          : <><span className="text-muted" data-marked>Marked {markWordOf(item)}{fixedBy(item) ? ` by ${fixedBy(item)!.byName}, ${localDay(fixedBy(item)!.at)}` : ''}</span><Button small kind="ghost" onClick={() => void record('status', [item.key], { text: 'New' }).then(() => toast('The mark is taken away.'))}><Icon name="undo" />Undo</Button></>}
                      </div>
                    )}
                    {epoCorrection(item, epoSystems, store.people, config) && <p className="rounded-md bg-green-soft px-2 py-1.5 font-semibold text-green ring-1 ring-green-line"><Icon name="check" className="mr-1 inline size-3.5" />{epoCorrection(item, epoSystems, store.people, config)}</p>}
                    {!isClosed(item) && item.state !== 'open' && stateWhyOf(item) && <p className="text-muted">{stateWhyOf(item)}. Not counted as to solve.</p>}
                    {!isClosed(item) && pack?.playbook.askAfterReview && (item.state === 'review' || item.fact.state === 'review') && (
                      <div className="flex flex-wrap items-center gap-2">
                        {item.state === 'review'
                          ? <Button small onClick={() => void record('reviewed', [item.key], { text: REVIEWED_ASK }).then(() => toast('Moved to To solve: write to the owner.'))}><Icon name="check" />{pack.playbook.askAfterReview}</Button>
                          : <Button small kind="ghost" onClick={() => void record('reviewed', [item.key], { text: REVIEWED_BACK })} data-tip="Back to the review of SACM"><Icon name="back" />Back to SACM</Button>}
                      </div>
                    )}
                    {!isClosed(item) && item.state === 'open' && unsure && (
                      <div className="flex flex-wrap items-center gap-2">
                        {!ownerAsked(item.timeline)
                          ? <><Button small onClick={() => void record('reviewed', [item.key], { text: REVIEWED_ASK }).then(() => toast('Off the fix list: write to the owner.'))} data-tip={pack!.playbook.askWhenUnsure}><Icon name="mail" />{unsure.button}</Button>{unsure.why && <span className="text-muted">{unsure.why}</span>}</>
                          : <><span className="text-muted">SACM could not tell which one is right: the owner is asked.</span><Button small kind="ghost" onClick={() => void record('reviewed', [item.key], { text: REVIEWED_BACK })} data-tip="Back to the fix list"><Icon name="back" />Back to SACM</Button></>}
                      </div>
                    )}
                    {item.exception && <p className="text-muted"><Icon name="stop" className="mr-1 inline size-3.5" />Not followed up, decided by {item.exception.byName || item.exception.by} on {localDay(item.exception.at)}{item.exception.reason ? `: ${item.exception.reason}` : ' (before version 0.12, no reason)'}{item.exception.text && item.exception.type === 'exception' ? `. ${item.exception.text}` : ''}{item.exception.reviewOn ? `. Review on ${yearDate(item.exception.reviewOn)}.` : '. No review date.'}</p>}
                    {item.exceptionEnded && !isClosed(item) && <p><Chip tone="amber" icon="undo">Followed again since {shortDate(item.exceptionEnded)}</Chip></p>}
                    {item.ciMissing && <p className="text-muted">Not in the latest report: waits for a report that contains this CI.</p>}
                    {item.untested && <p className="text-muted">The latest report could not test this check.</p>}
                  </div>
                </Problem>
              );
            })}
          </section>

          <section aria-label="People">
            <h3 className="mb-2 text-base font-semibold text-ink">People</h3>
            <dl className="grid grid-cols-3 gap-2">
              {SHOWN_ROLES.map((role) => (
                <div key={role} className="min-w-0 rounded-lg bg-surface-2 px-3 py-2">
                  <dt className="text-sm whitespace-nowrap text-muted">{ROLE_LABEL[role]}</dt>
                  <dd className="font-semibold [overflow-wrap:anywhere]">{people[role]
                    ? <><PersonLink id={people[role]!.id} name={people[role]!.name} title={people[role]!.email} />{people[role]?.active === false ? ' (inactive)' : ''}</>
                    : roleMissing(role) ? <span className="text-red" data-missing>Missing</span> : <span className="font-normal text-muted">–</span>}</dd>
                </div>
              ))}
            </dl>
          </section>

          {open.length > 0 && (
            <section className="flex flex-wrap items-center gap-2" aria-label="Request number">
              <label className="text-sm font-semibold whitespace-nowrap text-muted" htmlFor="case-request">Request number</label>
              <input id="case-request" className={cx(inputClass, 'h-8 w-44')} disabled={!ticked.length} placeholder={ticked[0]?.request || 'RITM'} value={request} onChange={(event) => setRequest(event.target.value)}
                onBlur={() => { if (request.trim() && ticked.length) { const text = request.trim(); void record('request', tickedKeys, { text }).then(() => toast(`Request number ${text} on ${cardsOf(ticked)}.`)); setRequest(''); } }} />
              {ticked[0]?.request && <Chip tone="grey" icon="file">{ticked[0].request}</Chip>}
            </section>
          )}
          {dated.length > 0 && (
            <section className="space-y-2" aria-label="Retirement date">
              <h3 className="text-base font-semibold text-ink">Retirement date</h3>
              <div className="flex flex-wrap items-center gap-2">
                <DateField label="The date the owner gave" value={retireOn || datedOn} onChange={setRetireOn} />
                <Button small kind="primary" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(retireOn) || retireOn === datedOn} onClick={() => saveRetirement(retireOn)}><Icon name="calendar" />Save</Button>
                {datedOn && <Button small kind="ghost" onClick={() => saveRetirement('')}><Icon name="remove" />Remove</Button>}
              </div>
              <p className="text-muted">Until this date the CI waits: no reminder. On the date it is to solve again.</p>
            </section>
          )}
          {stopped.length > 0 && (
            <section className="flex flex-wrap items-center gap-2">
              <Button small onClick={() => setFollowAgain(true)}><Icon name="undo" />Follow again</Button>
              <span className="text-muted">Everything not followed up is listed in Audit, Not followed.</span>
            </section>
          )}

          <section id="case-replies" className="space-y-2" aria-label="Replies">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">Replies{replies.length > 0 && <CountBadge n={replies.length} />}</h3>
            {lastReply ? (
              <Notice kind="reply">
                <p className="font-semibold">{lastReply.title.replace(/^Reply from /, '')} · {stamp(lastReply.at)}</p>
                <pre className="mt-1 font-sans text-sm whitespace-pre-wrap">{lastReply.text}</pre>
              </Notice>
            ) : <p className="text-muted">No reply yet. Replies come with Replies at the top, from the shared mailbox.</p>}
          </section>

          <section className="space-y-3" aria-label="Timeline">
            <h3 className="text-base font-semibold text-ink">Timeline</h3>
            <div className="flex gap-2">
              <input value={note} onChange={(event) => setNote(event.target.value)} aria-label="Note for the team" placeholder="Note for the team" className={cx(inputClass, 'h-8 flex-1')}
                onKeyDown={(event) => { if (event.key === 'Enter' && note.trim()) { void record('note', allKeys, { text: note.trim() }).then(() => toast('Note saved.')); setNote(''); } }} />
              <Button small disabled={!note.trim()} onClick={() => { void record('note', allKeys, { text: note.trim() }).then(() => toast('Note saved.')); setNote(''); }}><Icon name="note" />Save note</Button>
            </div>
            <ol className="relative space-y-3 border-l border-line pl-5">
              {entries.map((entry) => (
                <li key={entry.id} className="relative">
                  <span className={cx('absolute -left-[29px] grid size-6 place-items-center rounded-full ring-4 ring-surface', entry.reply ? 'bg-violet-soft text-violet' : 'bg-surface-2 text-muted')}>
                    <Icon name={entry.icon as IconName} className="size-3.5" />
                  </span>
                  <p className="text-sm text-muted">{stamp(entry.at)}</p>
                  <p className="font-semibold">{entry.title}</p>
                  {entry.text && <LongText className="whitespace-pre-wrap text-muted" text={entry.text} limit={240} />}
                </li>
              ))}
              {entries.length === 0 && <li className="text-muted">Nothing yet. Every message, reminder, Teams chat, reply and note shows here.</li>}
            </ol>
          </section>
        </div>
        {open.length > 0 && (
          <footer className="space-y-2 border-t border-line bg-surface px-5 py-3" data-case-bar>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {open.length > 1 && <span className="font-semibold text-ink" data-applies>{ticked.length} of {open.length} ticked</span>}
              <span>Verified comes with the next report.</span>
              <span className="flex-1" />
              <Button small kind="ghost" disabled={!ticked.length} onClick={() => setExcepting(true)} data-tip="Not followed up: a reason and a review date. Not a criticality exception: the owner requests that in the Service Portal"><Icon name="stop" />Stop following</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-muted">Status
                <select className={cx(inputClass, 'h-8 w-40 py-0')} value={status} disabled={!ticked.length} onChange={(event) => { const value = event.target.value; if (value) void record('status', tickedKeys, { text: value }).then(() => toast(`Status ${statusWord(value)} on ${cardsOf(ticked)}.`)); }}>
                  {!ticked.length && <option value="">Nothing ticked</option>}
                  {status === EXCEPTION && <option value={EXCEPTION}>{statusWord(EXCEPTION)}</option>}
                  {STATUSES.filter((value) => value !== 'Verified' && value !== EXCEPTION).map((value) => <option key={value} value={value}>{statusWord(value)}</option>)}
                </select>
              </label>
              <AssignMenu keys={openKeys} current={assigned.length === 1 ? assigned[0]! : 'Several'} up />
              <span className="flex-1" />
              {askable && next.step === 'answered' && <Button kind="primary" small onClick={() => document.getElementById('case-replies')?.scrollIntoView({ block: 'start' })}><Icon name="replies" />Reply</Button>}
              {askable && next.step !== 'answered' && words.button && <Button kind="primary" small onClick={writeTo}><Icon name={stepIcon(next) as IconName} />{words.button}</Button>}
              {askable && !words.button && words.link && <Button small onClick={writeTo}><Icon name="mail" />{words.link === 'Remind now' ? 'Remind' : 'Email'}</Button>}
            </div>
          </footer>
        )}
      </aside>
      {compose && <ComposeDialog group={compose} onClose={() => setCompose(null)} />}
      {excepting && <ExceptionDialog keys={tickedKeys} title={`Stop following: ${first.fact.ciName}`} onClose={() => setExcepting(false)} />}
      {followAgain && (
        <ConfirmDialog title="Follow this again?" confirm="Follow again" onClose={() => setFollowAgain(false)}
          onConfirm={() => { void record('exception', stopped.map((item) => item.key), { reason: stopped[0]!.exception!.reason || 'Other', reviewOn: today(), text: 'Ended by hand' }).then(() => toast('Followed again from today.')); }}>
          <p>From today the {plural(stopped.length, 'problem')} not followed up on {first.fact.ciName} {stopped.length === 1 ? 'is' : 'are'} to solve again.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
