// A card of the kind Owners: people are asked, group by group. Also the second part of a fix list that asks owners.
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { REVIEWED_ASK } from '../../../core/cases/cases.ts';
import { recipientOf } from '../../../core/messages/messages.ts';
import { unassignedCount } from '../../../core/team/team.ts';
import { record } from '../../state/journal.ts';
import { state, toast } from '../../state/store.ts';
import { useStore } from '../../state/use-store.ts';
import { cardFixLabel } from '../../ui/labels.ts';
import { subjectWord } from '../../view/cards.ts';
import { isClosed } from '../../view/cases.ts';
import { askable } from '../../view/fix-list.ts';
import { FOLD_ABOVE, GROUP_SORTS, classesOf, groupMatches, ownerGroups } from '../../view/groups.ts';
import type { CardSummary } from '../../view/cards.ts';
import type { GroupSort, OwnerGroup } from '../../view/groups.ts';
import { ComposeDialog } from '../../ui/ComposeDialog.tsx';
import { TeamsDialog } from '../../ui/TeamsDialog.tsx';
import { Button, Icon, Pager, cx, pageOf, plural } from '../../ui/basics.tsx';
import { MenuButton, MenuCheck, TABLE } from '../../ui/parts.tsx';
import type { Case } from '../../../core/cases/cases.ts';
import { CardHead, CardToolbar, NothingToDo } from './CardHead.tsx';
import { CiCell, RowGo, RowLink, apartWord, nameCounts } from './CiTable.tsx';
import { GroupCard, ShareOut, StateLists, exportList } from './GroupCard.tsx';

/** The filters of a card of owner groups, and the groups they leave. Shared by the Owners card and the owner part of a fix list. */
export function useOwnerGroups(card: CardSummary) {
  const store = useStore();
  const [onlyDue, setOnlyDue] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [search, setSearch] = useState('');
  const [className, setClassName] = useState('');
  const [sort, setSort] = useState<GroupSort>('size');
  const classes = useMemo(() => classesOf(card.cases), [card.cases]);
  const chosenClass = classes.indexOf(className) >= 0 ? className : '';
  const words = search || store.filters.search;
  const keep = (cases: Case[]): Case[] => (chosenClass ? cases.filter((item) => item.fact.classLabel === chosenClass) : cases);
  const groupsOf = (cases: Case[]): OwnerGroup[] => ownerGroups(keep(cases), store.people, (fact) => recipientOf(fact, store.settings), sort)
    .filter((group) => groupMatches(group, words)
      && (!onlyDue || group.memory.reminderDue || group.memory.overLimit)
      && (!store.filters.escalations || group.memory.overLimit)
      && (!onlyMine || group.open.some((item) => item.assignedTo === state.user.name)));
  /** Does one case pass the search, the class and Only mine? For lists that are not owner groups. */
  const matches = (item: Case): boolean => (!chosenClass || item.fact.classLabel === chosenClass)
    && (!words || `${item.fact.ciName} ${item.fact.classLabel} ${item.fact.detail} ${item.fact.fix?.change ?? ''} ${item.fact.group ?? ''}`.toLowerCase().indexOf(words.toLowerCase()) >= 0)
    && (!onlyMine || item.assignedTo === state.user.name);
  return { onlyDue, setOnlyDue, onlyMine, setOnlyMine, search, setSearch, classes, chosenClass, setClassName, sort, setSort, groupsOf, matches, listKey: `${sort}|${chosenClass}` };
}

/**
 * Findings SACM checks first (`playbook.askAfterReview`, D134): one line per CI with the button that moves it to "to
 * solve". It comes first on its card and is open (F17).
 */
function CheckFirst({ card, cases }: { card: CardSummary; cases: Case[] }) {
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => cases.slice().sort((a, b) => a.fact.ciName.localeCompare(b.fact.ciName) || a.fact.detail.localeCompare(b.fact.detail)), [cases]);
  const names = nameCounts(Array.from(new Map(sorted.map((item) => [item.fact.ciKey, item.fact.ciName])).values()));
  const cis = new Set(cases.map((item) => item.fact.ciKey)).size;
  const at = pageOf(sorted, page);
  const button = card.pack.playbook.askAfterReview!;
  return (
    <section aria-label="Check first" className="space-y-2 rounded-xl bg-surface px-4 py-3 shadow-sm ring-1 ring-blue-line" data-check-first>
      <div>
        <h3 className="font-semibold"><Icon name="eye" className="mr-1 inline size-4 text-blue" />Check first <span className="font-normal text-muted">{cis} {subjectWord(card.pack, cis)}</span></h3>
        <p className="text-sm text-muted">SACM checks the mapping of these first. When it is complete, press "{button}" on the line: the owner is asked. Nothing here turns the card red.</p>
      </div>
      <table className={TABLE.table}>
        <thead className={TABLE.head}><tr><th className={TABLE.th}>CI</th><th className={TABLE.th}>What the report shows</th><th className={TABLE.th}><span className="sr-only">Step</span></th><th className={TABLE.th}><span className="sr-only">Open</span></th></tr></thead>
        <tbody className={TABLE.body}>
          {at.shown.map((item) => (
            <RowLink key={item.key} ciKey={item.fact.ciKey}>
              <td className={TABLE.td}><CiCell item={item} name={item.fact.ciName} apart={apartWord(names, item)} sub={item.fact.classLabel} /></td>
              <td className={TABLE.td}>{item.fact.detail}{item.fact.stateWhy && <span className="block text-sm text-muted">{item.fact.stateWhy}</span>}</td>
              <td className={cx(TABLE.td, 'text-right')}>
                <Button small onClick={(event) => { event.stopPropagation(); void record('reviewed', [item.key], { text: REVIEWED_ASK }).then(() => toast(`${item.fact.ciName}: the owner is asked.`)); }}><Icon name="check" />{button}</Button>
              </td>
              <RowGo />
            </RowLink>
          ))}
        </tbody>
      </table>
      <Pager total={sorted.length} from={at.from} to={at.to} page={at.page} pages={at.pages} onPage={setPage} word="lines" />
    </section>
  );
}

/** The owner groups to solve, with the dialogs of their messages. `title`: a heading above them (the second part of a card). */
export function OwnerGroups({ card, groups, title, place, listKey, children }: { card: CardSummary; groups: OwnerGroup[]; title?: string; place: boolean; listKey: string; children?: (onEmail: (group: OwnerGroup) => void, onTeams: (group: OwnerGroup) => void) => ReactNode }) {
  const [email, setEmail] = useState<OwnerGroup | null>(null);
  const [teams, setTeams] = useState<OwnerGroup | null>(null);
  const fold = groups.length > FOLD_ABOVE;
  return <>
    {title && groups.length > 0 && <h3 className="pt-2 font-semibold text-ink">{title}</h3>}
    {groups.length > 1 && <p className="text-sm text-muted">{groups.length} groups. Open a group to see its {subjectWord(card.pack, 2)}.</p>}
    <div className="space-y-3">
      {/* Only the first group starts open: it alone has the navy button (D226). */}
      {groups.map((group, index) => <GroupCard key={`${listKey}|${group.key}`} group={group} card={card} mode="solve" place={place} startFolded={fold || index > 0} onEmail={() => setEmail(group)} onTeams={() => setTeams(group)} />)}
    </div>
    {children?.(setEmail, setTeams)}
    {email && <ComposeDialog group={email} onClose={() => setEmail(null)} />}
    {teams && <TeamsDialog group={teams} card={card} onClose={() => setTeams(null)} onEmail={() => { setTeams(null); setEmail(teams); }} />}
  </>;
}

/** A card of the kind Owners: the numbers are CIs, people and groups not taken; the main action is the next step of each group. */
export function OwnerCard({ card }: { card: CardSummary }) {
  const store = useStore();
  const filters = useOwnerGroups(card);
  const { groupsOf, matches } = filters;
  const deps = [store.people, store.settings, filters.chosenClass, filters.sort, filters.search, store.filters.search, filters.onlyDue, filters.onlyMine, store.filters.escalations];
  const checkFirst = !!card.pack.playbook.askAfterReview;
  const mainAsked = useMemo(() => card.main.filter((item) => askable(card.pack, item)), [card.main, card.pack]);
  const shown = useMemo(() => groupsOf(mainAsked), [mainAsked, ...deps]);
  const waiting = useMemo(() => groupsOf(card.waiting), [card.waiting, ...deps]);
  const known = useMemo(() => groupsOf(card.known), [card.known, ...deps]);
  // Review items: on a card SACM checks first they are the first part; else a folded list of their own.
  const review = useMemo(() => (checkFirst ? [] : groupsOf(card.review)), [card.review, checkFirst, ...deps]);
  const toCheck = useMemo(() => (checkFirst ? card.review.filter(matches) : []), [card.review, checkFirst, ...deps]);
  const open = shown.filter((group) => group.state !== 'closed');
  const closed = shown.filter((group) => group.state === 'closed');
  const free = unassignedCount(open.map((group) => group.cases));
  const checkCis = new Set(card.review.map((item) => item.fact.ciKey)).size;
  const openCis = new Set(card.open.map((item) => item.fact.ciKey)).size;
  const place = cardFixLabel(card.pack, card.cases.filter((item) => !isClosed(item))).mixed;
  const listed = shown.concat(review, waiting, known);
  const idle = card.open.length + card.review.length === 0;
  // The numbers in short words (labels.md, section 3): To solve, People (to ask), Free (groups nobody has taken).
  const numbers = idle ? [] : [
    ...(checkFirst && checkCis ? [{ value: checkCis, label: 'To check' }] : []),
    { value: openCis, label: 'To solve' },
    ...(card.open.length ? [{ value: card.people, label: 'People' }, { value: free, label: 'Free' }] : [])
  ];
  return (
    <section aria-label={card.label} className="min-w-0 space-y-4" data-kind="owners">
      <CardHead card={card} numbers={numbers} aside={!checkFirst} {...(checkFirst && card.light === 'review' ? { badge: 'To check' } : {})} />
      <NothingToDo card={card} />
      {!idle && (
        <CardToolbar filters={filters}
          left={<MenuButton label="Sort" icon="sort" kind="secondary" caret align="left" tip={`Sorted: ${GROUP_SORTS.filter((option) => option.id === filters.sort)[0]?.label ?? ''}`}>
            {(close) => GROUP_SORTS.map((option) => <MenuCheck key={option.id} label={option.label} checked={filters.sort === option.id} onChange={() => { filters.setSort(option.id); close(); }} />)}
          </MenuButton>}
          right={<>
            <ShareOut groups={open} />
            <Button small disabled={!listed.length && !toCheck.length} onClick={() => exportList(([] as Case[]).concat(toCheck, ...listed.map((group) => group.cases)), store.people, card.label)} data-tip="Save this list as a file"><Icon name="export" />Export</Button>
          </>} />
      )}
      {checkFirst && toCheck.length > 0 && <CheckFirst card={card} cases={toCheck} />}
      {!idle && !open.length && !toCheck.length && <p className="text-sm text-muted">Nothing matches the filters.</p>}
      {checkFirst && card.review.length > 0 && !open.length && card.open.length === 0 && <p className="text-sm text-muted">Asked of the owner: nobody yet. A CI comes here when its mapping is complete.</p>}
      <OwnerGroups card={card} groups={open} place={place} listKey={filters.listKey} {...(checkFirst ? { title: `Asked of the owner: ${plural(open.length, 'group')}` } : {})}>
        {(onEmail, onTeams) => <StateLists card={card} review={review} waiting={waiting} known={known} closed={closed} listKey={filters.listKey} onEmail={onEmail} onTeams={onTeams} />}
      </OwnerGroups>
    </section>
  );
}
