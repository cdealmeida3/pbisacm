// A card of the kind SACM fix list: changes SACM makes itself in ServiceNow. Nobody is asked; a manager marks each line as fixed.
import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { record } from '../../state/journal.ts';
import { localDay, toast, update } from '../../state/store.ts';
import { applyShareOut, shareOutPlan } from '../../state/team.ts';
import { useStore } from '../../state/use-store.ts';
import { download } from '../../ui/download.ts';
import { fixProgress } from '../../view/cards.ts';
import { isClosed } from '../../view/cases.ts';
import { exportFixCsv } from '../../view/exports.ts';
import { askable, fixGroups, fixRecords, fixRows, handedToOwner } from '../../view/fix-list.ts';
import type { CardSummary } from '../../view/cards.ts';
import type { FixRecord, FixRow } from '../../view/fix-list.ts';
import { CopyValue, ServiceNowLink } from '../../ui/servicenow.tsx';
import { ConfirmDialog } from '../../ui/ConfirmDialog.tsx';
import { Button, Chip, Icon, PAGE_SIZE, Pager, Why, cx, pageOf, plural } from '../../ui/basics.tsx';
import { Avatar, FoldSign, TABLE, TickBox } from '../../ui/parts.tsx';
import { CardHead, CardToolbar, NothingToDo } from './CardHead.tsx';
import { CaseChips, CiCell, apartWord, nameCounts } from './CiTable.tsx';
import { QuietLists, ShareOut, StateLists } from './GroupCard.tsx';
import { OwnerGroups, useOwnerGroups } from './OwnerCard.tsx';

/**
 * One record of a fix list (build W5, D242): the CI or contract once, then one line per change with its value now, the
 * value to set and **Copy**; at the right **ServiceNow** (the record, D244) and **Fixed** for every line of the record.
 * The whole record opens the case. A record whose lines are all marked is teal, with who marked it and **Undo**.
 */
function FixRecordRows({ card, record, apart, withValues, ticks, onTick, mark }: {
  card: CardSummary; record: FixRecord; apart: string; withValues: boolean; ticks: Set<string>; onTick: (keys: string[], on: boolean) => void;
  mark: (keys: string[], text: string, said: string) => void;
}) {
  const marked = card.pack.playbook.markWord ?? 'fixed';
  const first = record.rows[0]!.item;
  const allMarked = !record.open.length && record.marked.length > 0;
  const lines = record.rows.length;
  const open = (): void => update({ openCi: record.key });
  const what = record.ciName;
  return (
    <tbody onClick={open} data-record={record.key} {...(allMarked ? { 'data-marked-line': '' } : {})}
      className={cx('group/row cursor-pointer hover:bg-surface-2 max-md:block max-md:rounded-lg max-md:px-3 max-md:py-2 max-md:ring-1 max-md:ring-line', allMarked && 'bg-teal-soft hover:bg-teal-soft')}>
      {record.rows.map((row, index) => {
        const last = index === lines - 1;
        const isMarked = !isClosed(row.item) && row.item.status === 'Fixed';
        const cell = cx(TABLE.td, !last && 'md:border-b-0');
        return (
          <tr key={row.item.key} className="max-md:block" {...(index === 0 ? { tabIndex: 0, onKeyDown: (event: KeyboardEvent) => { if (event.key === 'Enter' && event.target === event.currentTarget) open(); } } : {})}>
            {index === 0 && <td rowSpan={lines} className={cx(TABLE.td, 'w-10')}>{record.open.length > 0 && <TickBox label={`Tick ${what}`} checked={record.open.every((key) => ticks.has(key))} onChange={(on) => onTick(record.open, on)} />}</td>}
            {index === 0 && (
              <td rowSpan={lines} className={TABLE.td}>
                <CiCell item={first} name={record.ciName} apart={apart} sub={record.classLabel} />
                {record.assignedTo && <span className="mt-1 flex"><Avatar name={record.assignedTo} tip={`Assigned to ${record.assignedTo}`} /></span>}
              </td>
            )}
            <td className={cell}>{row.change}{row.note && <span className="mt-0.5 block text-sm text-muted"><Icon name="nottested" className="mr-1 inline size-3.5" />{row.note}</span>}</td>
            {withValues && <>
              <td className={cell}><span className={TABLE.label}>Now: </span>{row.current || <span className="text-muted">–</span>}</td>
              <td className={cx(cell, 'font-semibold')}>
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0"><span className={TABLE.label}>Set to: </span>{row.set || <span className="font-normal text-muted">–</span>}</span>
                  {row.value && !isMarked && !isClosed(row.item) && <span className="-my-1 shrink-0"><CopyValue value={row.value} what={`${what}: ${row.change}`} /></span>}
                </span>
              </td>
            </>}
            <td className={cell}>
              {isMarked
                ? <span className="flex flex-col items-start gap-0.5" data-marked><Chip tone="teal" icon="marked">Marked {marked}</Chip>{row.fixed && <span className="text-xs text-muted">{row.fixed.byName}, {localDay(row.fixed.at)}</span>}</span>
                : <CaseChips item={row.item} />}
            </td>
            {index === 0 && (
              <td rowSpan={lines} className={cx(TABLE.td, 'text-right')}>
                <span className="flex flex-wrap items-center justify-end gap-1.5">
                  <ServiceNowLink fact={first.fact} what={what} />
                  {record.open.length > 0 && <Button small onClick={(event) => { event.stopPropagation(); mark(record.open, 'Fixed', `Marked ${marked}: ${what}. The next report checks it.`); }} data-tip={lines > 1 ? `Mark every line of this record ${marked}` : `Mark this line ${marked}`}><Icon name="fixed" />{marked === 'deleted' ? 'Deleted' : 'Fixed'}</Button>}
                  {allMarked && <Button small kind="ghost" onClick={(event) => { event.stopPropagation(); mark(record.marked, 'New', `The mark is taken away: ${what}.`); }}><Icon name="undo" />Undo</Button>}
                </span>
              </td>
            )}
          </tr>
        );
      })}
    </tbody>
  );
}

/**
 * The records of one group of a fix list, 50 to a page: one record per CI with all its changes (build W5, D242), a tick
 * box per record. The ticks are the card's: "Mark N fixed" in the toolbar marks what is ticked.
 */
function FixTable({ card, name, rows, startOpen, ticks, onTick }: { card: CardSummary; name: string; rows: FixRow[]; startOpen: boolean; ticks: Set<string>; onTick: (keys: string[], on: boolean) => void }) {
  const [page, setPage] = useState(0);
  const [shown, setShown] = useState(startOpen);
  const marked = card.pack.playbook.markWord ?? 'fixed';
  const contract = card.pack.subject === 'contract';
  const records = useMemo(() => fixRecords(rows), [rows]);
  const at = pageOf(records, page);
  const tickable = ([] as string[]).concat(...at.shown.map((record) => record.open));
  const done = rows.filter((row) => !isClosed(row.item) && row.item.status === 'Fixed').length;
  const live = rows.filter((row) => !isClosed(row.item)).length;
  const names = nameCounts(records.map((record) => record.ciName));
  const mark = (keys: string[], text: string, said: string): void => { void record('status', keys, { text }).then(() => toast(said)); };
  const withValues = rows.some((row) => row.current || row.set);
  const allTicked = tickable.length > 0 && tickable.every((key) => ticks.has(key));
  const word = contract ? 'contract' : 'CI';
  const count = <span className="text-sm font-normal text-muted">{plural(live, 'line')}{records.length < rows.length ? ` on ${plural(records.length, word)}` : ''}{done ? ` · ${done} marked ${marked}` : ''}</span>;
  return (
    <div className="rounded-xl bg-surface shadow-sm ring-1 ring-line" data-fix-group={name}>
      {name ? (
        <button type="button" onClick={() => setShown(!shown)} aria-expanded={shown} className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold">
          <FoldSign open={shown} className="text-muted" />{name}{count}
        </button>
      ) : <h3 className="flex items-center gap-2 px-4 py-3 font-semibold"><Icon name="table" />{marked === 'deleted' ? 'Delete list' : 'Fix list'}{count}</h3>}
      {shown && <div className="px-2 pb-2">
        <table className={TABLE.table}>
          <thead className={TABLE.head}>
            <tr>
              <th className={cx(TABLE.th, 'w-10')}>{at.shown.filter((one) => one.open.length).length > 1 ? <TickBox label="Tick every line shown" checked={allTicked} onChange={(on) => onTick(tickable, on)} /> : <span className="sr-only">Tick</span>}</th>
              <th className={TABLE.th}>{contract ? 'Contract' : 'CI'}</th><th className={TABLE.th}>Change</th>
              {withValues && <><th className={TABLE.th}>Now</th><th className={TABLE.th}>Set to</th></>}
              <th className={TABLE.th}>State</th>
              <th className={TABLE.th}><span className="sr-only">Step</span></th>
            </tr>
          </thead>
          {at.shown.map((one) => <FixRecordRows key={one.key} card={card} record={one} apart={apartWord(names, one.rows[0]!.item)} withValues={withValues} ticks={ticks} onTick={onTick} mark={mark} />)}
        </table>
        <Pager total={records.length} from={at.from} to={at.to} page={at.page} pages={at.pages} onPage={setPage} word={contract ? 'contracts' : 'CIs'} />
      </div>}
    </div>
  );
}

/**
 * Share out a fix list (build W5): each record nobody has taken goes to a manager of the team, in turn, by its number of
 * lines, as the groups of an owners card (D61). "Mine" in Filter then shows one's own records.
 */
function ShareRecords({ records }: { records: FixRecord[] }) {
  const store = useStore();
  const [asking, setAsking] = useState(false);
  const free = records.filter((one) => one.open.length && !one.assignedTo);
  const input = free.map((one) => ({ key: one.key, keys: one.open, size: one.open.length }));
  const plan = asking ? shareOutPlan(input) : new Map<string, string>();
  const per = new Map<string, { records: number; lines: number }>();
  for (const item of asking ? input : []) { const who = plan.get(item.key)!; const entry = per.get(who) ?? { records: 0, lines: 0 }; entry.records += 1; entry.lines += item.size; per.set(who, entry); }
  if (store.mode === 'files' || !records.some((one) => one.open.length)) return null;
  const why = store.team.length < 2 ? 'Add colleagues in Settings' : free.length ? '' : 'Every record is taken';
  return <>
    <Button small onClick={() => setAsking(true)} disabled={!!why} data-tip="Give the records nobody has taken to the team, in turn"><Icon name="share" />Share out</Button>
    {why && <Why>{why}</Why>}
    {asking && (
      <ConfirmDialog title={`Share out ${plural(free.length, 'free record')}?`} confirm="Share out" onClose={() => setAsking(false)}
        onConfirm={() => { void applyShareOut(input, plan).then(() => toast(`${plural(free.length, 'record')} shared out.`)); }}>
        <ul className="list-disc pl-5">{Array.from(per.entries()).map(([who, entry]) => <li key={who}>{who}: {plural(entry.records, 'record')} ({plural(entry.lines, 'line')})</li>)}</ul>
        <p>You can still change each one in its case. Mine, in Filter, shows your records.</p>
      </ConfirmDialog>
    )}
  </>;
}

/** "Mark N fixed": marks the ticked lines, after a question. Grey with its reason when nothing is ticked (rule 6). */
function MarkTicked({ card, keys, onDone }: { card: CardSummary; keys: string[]; onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  const marked = card.pack.playbook.markWord ?? 'fixed';
  return <>
    {!keys.length && <Why>Tick a line first</Why>}
    <Button kind="primary" small disabled={!keys.length} onClick={() => setAsking(true)} data-mark-ticked><Icon name="fixed" />{keys.length ? `Mark ${keys.length} ${marked}` : `Mark ${marked}`}</Button>
    {asking && (
      <ConfirmDialog title={`Mark ${keys.length} ${marked}?`} confirm={`Mark ${keys.length}`} onClose={() => setAsking(false)}
        onConfirm={() => { void record('status', keys, { text: 'Fixed' }).then(() => toast(`${plural(keys.length, 'line')} marked ${marked}. The next report checks ${keys.length === 1 ? 'it' : 'them'}.`)); onDone(); }}>
        <p>The {plural(keys.length, 'line')} you ticked {keys.length === 1 ? 'is' : 'are'} marked. Your name and the time are saved.</p>
        <p>Each one is Verified when a later report no longer shows it.{marked === 'deleted' ? ' The app deletes nothing: delete them in ServiceNow first.' : ''}</p>
      </ConfirmDialog>
    )}
  </>;
}

/**
 * A card of the kind SACM fix list. The numbers are lines to fix and lines marked. A check that can hand a line to the
 * owner (`askWhenUnsure`) shows a second part "Asked of the owner", only when it has lines (F20).
 */
export function FixListCard({ card }: { card: CardSummary }) {
  const store = useStore();
  const filters = useOwnerGroups(card);
  const { groupsOf, matches } = filters;
  const deps = [store.people, store.settings, filters.chosenClass, filters.sort, filters.search, store.filters.search, filters.onlyMine, store.filters.escalations];
  const marked = card.pack.playbook.markWord ?? 'fixed';
  const deleting = marked === 'deleted';
  const progress = fixProgress(card);
  const fixCases = useMemo(() => card.main.filter((item) => !handedToOwner(card.pack, item) && matches(item)), [card.main, card.pack, ...deps]);
  const groups = useMemo(() => fixGroups(fixRows(fixCases)), [fixCases]);
  // The owner part: only on a check that also asks somebody. With `askWhenUnsure`, only the lines handed to the owner.
  const asksOwner = !!card.pack.playbook.message;
  const asked = useMemo(() => (asksOwner ? groupsOf(card.main.filter((item) => askable(card.pack, item))).filter((group) => group.state !== 'closed') : []), [card.main, card.pack, asksOwner, ...deps]);
  const waiting = useMemo(() => (asksOwner ? groupsOf(card.waiting) : []), [card.waiting, asksOwner, ...deps]);
  const known = useMemo(() => (asksOwner ? groupsOf(card.known) : []), [card.known, asksOwner, ...deps]);
  const review = useMemo(() => (asksOwner ? groupsOf(card.review) : []), [card.review, asksOwner, ...deps]);
  const idle = card.open.length + card.review.length === 0;
  const allMarked = card.light === 'marked';
  // The ticked lines of the card: only those still shown and not marked count.
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const tickKeys = fixCases.filter((item) => ticked.has(item.key) && !isClosed(item) && item.status !== 'Fixed').map((item) => item.key);
  const onTick = (keys: string[], on: boolean): void => { const next = new Set(ticked); for (const key of keys) { if (on) next.add(key); else next.delete(key); } setTicked(next); };
  return (
    <section aria-label={card.label} className="min-w-0 space-y-4" data-kind="fix">
      <CardHead card={card} numbers={idle ? [] : [{ value: progress.lines, label: deleting ? 'To delete' : 'To fix' }, { value: progress.marked, label: deleting ? 'Deleted' : 'Fixed' }]}
        {...(allMarked ? { badge: `All marked as ${marked}` } : {})}>
        {!idle && <p className="mt-1 text-sm text-muted" data-progress>
          {allMarked ? `All marked as ${marked}. The next report checks it.` : `${progress.marked} of ${progress.lines.toLocaleString('en-GB')} marked as ${marked}.`}
          {' '}SACM makes these changes in ServiceNow{deleting ? ': the app deletes nothing' : ''}.
          {!store.settings.serviceNowAddress && <span data-no-servicenow> To open each record there, set the ServiceNow address in Settings, Mailboxes.</span>}
        </p>}
      </CardHead>
      <NothingToDo card={card} />
      {!idle && (
        <CardToolbar filters={{ ...filters, setOnlyDue: undefined }}
          right={<>
            {fixCases.length > 0 ? <ShareRecords records={fixRecords(fixRows(fixCases))} /> : asked.length > 0 && <ShareOut groups={asked} />}
            <Button small onClick={() => download(exportFixCsv(fixCases), `${card.label} ${deleting ? 'delete' : 'fix'} list`)} disabled={!fixCases.length} data-tip={deleting ? 'Save the delete list as a file' : 'Save the fix list as a file'}><Icon name="export" />Export</Button>
            {fixCases.some((item) => !isClosed(item) && item.status !== 'Fixed') && <MarkTicked card={card} keys={tickKeys} onDone={() => setTicked(new Set())} />}
          </>} />
      )}
      {!idle && !groups.length && !asked.length && <p className="text-sm text-muted">Nothing matches the filters.</p>}
      {groups.length > 1 && fixCases.length > PAGE_SIZE && <p className="text-sm text-muted">{plural(groups.length, 'group')} by {card.pack.subject === 'contract' ? 'kind of problem' : 'class'}. Click a group to see its lines.</p>}
      {groups.length > 0 && (
        <section aria-label={deleting ? 'Delete list' : 'Fix list'} className="space-y-3">
          {groups.map((group, index) => <FixTable key={`${filters.listKey}|${group.name}`} card={card} name={group.name} rows={group.rows} startOpen={fixCases.length <= PAGE_SIZE || index === 0} ticks={ticked} onTick={onTick} />)}
        </section>
      )}
      {store.mode === 'files' && !idle && <p className="text-sm text-muted">Report files only: marks are kept until the page is closed.</p>}
      <OwnerGroups card={card} groups={asked} place={false} listKey={filters.listKey} title={card.pack.playbook.askWhenUnsure ? 'Asked of the owner: SACM cannot tell which one is right' : 'Who to ask, when the source is wrong'}>
        {(onEmail, onTeams) => (asksOwner ? <StateLists card={card} review={review} waiting={waiting} known={known} closed={[]} listKey={filters.listKey} onEmail={onEmail} onTeams={onTeams} /> : null)}
      </OwnerGroups>
      {!asksOwner && <QuietLists card={card} matches={matches} />}
    </section>
  );
}
