// A card of the kind Review list: lines to look at. Nothing to fix, nothing to mark, nobody to write to.
import { useMemo, useState } from 'react';
import { record } from '../../state/journal.ts';
import { toast } from '../../state/store.ts';
import { useStore } from '../../state/use-store.ts';
import { subjectWord } from '../../view/cards.ts';
import { isClosed } from '../../view/cases.ts';
import type { CardSummary } from '../../view/cards.ts';
import { Button, Chip, Icon, Pager, cx, inputClass, pageOf, plural, yearDate } from '../../ui/basics.tsx';
import { Avatar, TABLE } from '../../ui/parts.tsx';
import { CardHead, CardToolbar, NothingToDo } from './CardHead.tsx';
import { CaseChips, CiCell, RowGo, RowLink, apartWord, nameCounts } from './CiTable.tsx';
import { QuietLists, exportList } from './GroupCard.tsx';
import { useOwnerGroups } from './OwnerCard.tsx';

/**
 * What the manager does on a review list, as its text names it: on a list about another system (the fix is at the
 * source) one incident for the pattern, with its number kept on every line; else the mapping is checked CI by CI.
 */
function ReviewAction({ card, keys }: { card: CardSummary; keys: string[] }) {
  const [number, setNumber] = useState('');
  const incident = card.pack.playbook.path === 'source-fix';
  return (
    <div className="space-y-2 rounded-xl bg-blue-soft px-4 py-3 text-sm text-ink ring-1 ring-blue-line" data-review-action>
      <p><Icon name="eye" className="mr-1 inline size-4 text-blue" /><b className="font-semibold">{card.pack.reviewWhy ?? 'Listed for a review'}.</b> {incident
        ? 'Look at a few lines. When they show the same pattern, raise one incident for it and keep its number here: it is saved on every line shown.'
        : 'Open a line to check its mapping, and keep a note on what you found. A line leaves the list when a later report no longer shows it.'}</p>
      {incident && keys.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Incident number" placeholder="Incident number" value={number} onChange={(event) => setNumber(event.target.value)} className={cx(inputClass.replace('w-full ', ''), 'w-56 py-1.5')} />
          <Button small kind="primary" disabled={!number.trim()} data-tip={`Keep the number on ${plural(keys.length, 'line')}`} onClick={() => { const text = number.trim(); void record('request', keys, { text }).then(() => toast(`Incident ${text} kept on ${plural(keys.length, 'line')}.`)); setNumber(''); }}><Icon name="file" />Keep number</Button>
        </div>
      )}
    </div>
  );
}

/** A card of the kind Review list: CI, class, what the report shows, since when. The whole line opens the case. */
export function ReviewListCard({ card }: { card: CardSummary }) {
  const store = useStore();
  const filters = useOwnerGroups(card);
  const { matches } = filters;
  const [page, setPage] = useState(0);
  const lines = useMemo(() => card.main.filter(matches).sort((a, b) => Number(isClosed(a)) - Number(isClosed(b)) || a.fact.ciName.localeCompare(b.fact.ciName) || a.fact.detail.localeCompare(b.fact.detail)),
    [card.main, filters.chosenClass, filters.search, store.filters.search]);
  const live = lines.filter((item) => !isClosed(item));
  const names = nameCounts(Array.from(new Map(lines.map((item) => [item.fact.ciKey, item.fact.ciName])).values()));
  const at = pageOf(lines, page);
  const idle = card.review.length === 0;
  const contract = card.pack.subject === 'contract';
  return (
    <section aria-label={card.label} className="min-w-0 space-y-4" data-kind="review">
      <CardHead card={card} place={false} numbers={idle ? [] : [{ value: card.review.length, label: 'To check' }, { value: card.cis, label: subjectWord(card.pack, card.cis).replace(/^./, (first) => first.toLocaleUpperCase('en-GB')) }]} />
      <NothingToDo card={card} />
      {!idle && <>
        <ReviewAction card={card} keys={live.map((item) => item.key)} />
        <CardToolbar filters={{ ...filters, setOnlyDue: undefined, setOnlyMine: undefined }}
          right={<Button small disabled={!lines.length} onClick={() => exportList(lines, store.people, card.label)} data-tip="Save this list as a file"><Icon name="export" />Export</Button>} />
        {!lines.length && <p className="text-sm text-muted">Nothing matches the filters.</p>}
        {lines.length > 0 && (
          <div className="rounded-xl bg-surface px-2 py-1 shadow-sm ring-1 ring-line">
            <table className={TABLE.table}>
              <thead className={TABLE.head}>
                <tr><th className={TABLE.th}>{contract ? 'Contract' : 'CI'}</th><th className={TABLE.th}>What the report shows</th><th className={TABLE.th}>State</th><th className={TABLE.th}>Since</th><th className={TABLE.th}><span className="sr-only">Open</span></th></tr>
              </thead>
              <tbody className={TABLE.body}>
                {at.shown.map((item) => (
                  <RowLink key={item.key} ciKey={item.fact.ciKey}>
                    <td className={TABLE.td}><CiCell item={item} name={item.fact.ciName} apart={apartWord(names, item)} sub={item.fact.classLabel} /></td>
                    <td className={TABLE.td}>{item.fact.detail}</td>
                    <td className={TABLE.td}>
                      <span className="flex flex-wrap gap-1.5">
                        <CaseChips item={item} />
                        {item.request && <Chip tone="grey" icon="file">{item.request}</Chip>}
                        {!isClosed(item) && item.assignedTo && <Avatar name={item.assignedTo} tip={`Assigned to ${item.assignedTo}`} />}
                      </span>
                    </td>
                    <td className={cx(TABLE.td, 'whitespace-nowrap text-muted')}><span className={TABLE.label}>Since: </span>{yearDate(item.firstSeen)}</td>
                    <RowGo />
                  </RowLink>
                ))}
              </tbody>
            </table>
            <Pager total={lines.length} from={at.from} to={at.to} page={at.page} pages={at.pages} onPage={setPage} word="lines" />
          </div>
        )}
      </>}
      <QuietLists card={card} matches={matches} review={false} />
    </section>
  );
}
