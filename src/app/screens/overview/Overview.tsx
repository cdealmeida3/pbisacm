// All cards (version 0.30, build L2 of the new look): the filter row, the three sections, each card as a card or as one
// line (the Lines switch), and the short list of cards beside an open card. The words come from view/cards.ts.
import { useState } from 'react';
import { MODULES } from '../../../core/model/model.ts';
import { latestRun, setFilters, state, update } from '../../state/store.ts';
import { chooseLook } from '../../state/settings.ts';
import { useStore } from '../../state/use-store.ts';
import { MODULE_LABEL } from '../../ui/labels.ts';
import { LATER_WORDS, TOPICS, asideText, cardKind, cardLine, isDailyToSolve, isToSolve, orderCards, partlyTested, sectionText, subjectWord, topicOf } from '../../view/cards.ts';
import type { Filters, SubjectFilter } from '../../state/store.ts';
import type { CardLine, CardSummary, Change, SinceReport } from '../../view/cards.ts';
import { Button, Icon, LIGHT, LightBadge, cx, inputClass } from '../../ui/basics.tsx';
import { EmptyState, FilterChip, FoldSign, MenuButton, MenuCheck, Segmented } from '../../ui/parts.tsx';
import type { IconName } from '../../ui/icons.ts';
import type { Light } from '../../view/cases.ts';
import type { Module } from '../../../core/model/model.ts';

export const MODULE_HINT: Record<Module, string> = { completeness: 'Something is missing', correctness: 'Something is wrong', compliance: 'A process rule is broken' };

/** The subject of a card: the folder of its check file (`packFolder`, given by the shell). */
export type FolderOf = (id: string) => string;

/** Does a card pass the filter row? Search looks at CIs, people and problems of its open cases. */
export function cardVisible(card: CardSummary, folderOf: FolderOf, change?: Change): boolean {
  const { onlyRed, mine, due, escalations, fresh, search, subject } = state.filters;
  if (subject !== 'all' && topicOf(folderOf(card.id)).id !== subject) return false;
  // "To solve" is the daily work: a card for when there is time is not counted (D182).
  if (onlyRed && !isDailyToSolve(card)) return false;
  if (due && card.due === 0) return false;
  if (escalations && !card.open.some((item) => item.overLimit)) return false;
  if (fresh && !(change && change.added > 0)) return false;
  if (mine && !card.open.some((item) => item.assignedTo === state.user.name)) return false;
  if (search) {
    const words = search.toLowerCase();
    const hit = card.label.toLowerCase().indexOf(words) >= 0 || card.open.concat(card.review).some((item) => {
      const roles = state.people.get(item.fact.ciKey) ?? {};
      return `${item.fact.ciName} ${item.fact.classLabel} ${item.fact.detail} ${item.fact.contactName} ${item.fact.contactEmail} ${roles.owned_by?.name ?? ''} ${roles.managed_by?.name ?? ''} ${roles.supported_by?.name ?? ''}`.toLowerCase().indexOf(words) >= 0;
    });
    if (!hit) return false;
  }
  return true;
}

const SUBJECTS: Array<{ id: SubjectFilter; label: string }> = [{ id: 'all', label: 'All' }, ...TOPICS.map((topic) => ({ id: topic.id, label: topic.filter }))];

/** The filters of the menu Filter, in its order, with the word of the menu and of the chip (labels.md, section 2). */
type FilterKey = 'onlyRed' | 'mine' | 'due' | 'escalations' | 'fresh';
const FILTERS: Array<{ key: FilterKey; word: string; tip: string }> = [
  { key: 'onlyRed', word: 'To solve', tip: 'Only the cards with something to solve today' },
  { key: 'mine', word: 'Mine', tip: 'Only the cards with work assigned to me' },
  { key: 'due', word: 'Reminders', tip: 'Only the cards with a reminder due' },
  { key: 'escalations', word: 'Escalations', tip: 'Only the cards with reminders that got no answer' },
  { key: 'fresh', word: 'New', tip: 'Only the cards with findings new since the report before' }
];

/** The filter row: Search, the subject, the menu Filter with the active filters as chips, and the Cards and Lines switch. */
export function FilterBar() {
  const store = useStore();
  const { filters } = store;
  const on = FILTERS.filter((filter) => filters[filter.key]);
  return (
    <div className="flex flex-wrap items-center gap-2" data-filter-row>
      <div className="relative w-56 shrink-0">
        <Icon name="search" className="pointer-events-none absolute top-2 left-3 size-4 text-muted" />
        <input type="search" aria-label="Search" placeholder="Search" defaultValue={filters.search} data-tip="Search a CI, a contract, a person or a problem"
          onChange={(event) => setFilters({ search: event.target.value.trim() })} className={cx(inputClass, 'h-8 pl-9')} />
      </div>
      <Segmented label="Show cards about" options={SUBJECTS} value={filters.subject ?? 'all'} onChange={(id) => setFilters({ subject: id })} />
      <MenuButton label="Filter" icon="filter" kind="secondary" caret align="left">
        {() => FILTERS.map((filter) => <MenuCheck key={filter.key} label={filter.word} tip={filter.tip} checked={filters[filter.key]} onChange={(value) => setFilters({ [filter.key]: value } as Partial<Filters>)} />)}
      </MenuButton>
      {on.map((filter) => <FilterChip key={filter.key} id={filter.key} word={filter.word} onClear={() => setFilters({ [filter.key]: false } as Partial<Filters>)} />)}
      <span className="flex-1" />
      <Segmented label="Show the cards as" value={store.cardsAs} onChange={(id) => chooseLook({ cardsAs: id })}
        options={[{ id: 'cards', label: <><Icon name="cards" />Cards</> }, { id: 'lines', label: <><Icon name="table" />Lines</> }]} />
    </div>
  );
}

/** The state of a card in one word and its icon: "When there is time" (a cup) for a card for later (D182). */
function stateOf(card: CardSummary): { light: Light; word: string; icon?: IconName } {
  if (card.later && isToSolve(card)) return { light: 'grey', word: LATER_WORDS, icon: 'later' };
  if (card.light === 'marked') return { light: 'marked', word: `All marked as ${card.pack.playbook.markWord ?? 'fixed'}` };
  return { light: card.light, word: LIGHT[card.light].word };
}

/** The tooltip of a card: the notes of a card partly or not tested, else its hint. The rest is in the open card. */
function tipOf(card: CardSummary): string {
  const partly = partlyTested(card);
  if (partly) return partly.all;
  if (card.light === 'grey') return card.notes[0] ?? 'The latest report could not test this check.';
  if (card.light === 'marked') return `All marked as ${card.pack.playbook.markWord ?? 'fixed'}. The next report checks it.`;
  return card.pack.cardHint ?? '';
}

/**
 * The aria-label of a card, a line and an entry of the list beside an open card: the same words for the three. It says the
 * CIs (or contracts) and what is listed apart, also on a SACM list that shows its lines.
 */
const nameOf = (card: CardSummary, _line: CardLine): string => {
  const state = stateOf(card);
  const aside = asideText(card, card.light !== 'review');
  return `${card.label}: ${state.word}${card.cis ? `, ${card.cis} ${subjectWord(card.pack, card.cis)}` : ''}${aside ? `, ${aside}` : ''}`;
};

function Fact({ line }: { line: CardLine }) {
  if (!line.fact) return null;
  if (line.factKind === 'new') return <span className="shrink-0 rounded-full bg-red-soft px-2 text-xs leading-5 font-semibold whitespace-nowrap text-red ring-1 ring-inset ring-red-line" data-since>{line.fact}</span>;
  if (line.factKind === 'partly') return <span className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-md bg-grey-soft px-2 text-xs font-semibold whitespace-nowrap text-grey" data-partly><Icon name="nottested" className="size-3.5" />{line.fact}</span>;
  return <span className="shrink-0 text-xs whitespace-nowrap text-muted">{line.fact}</span>;
}

function Number({ line, big }: { line: CardLine; big?: boolean }) {
  if (line.count === null) return line.unit ? <span className="text-xs whitespace-nowrap text-muted">{line.unit}</span> : null;
  return (
    <span className="inline-flex shrink-0 items-baseline gap-1 whitespace-nowrap" data-number>
      <b className={cx('font-bold text-ink tabular-nums', big ? 'text-lg leading-none' : 'text-sm')}>{line.count.toLocaleString('en-GB')}</b>
      <span className="text-xs text-muted">{line.unit}</span>
    </span>
  );
}

interface ItemProps { card: CardSummary; active: boolean; change: Change | undefined; topic: string }

const openCard = (card: CardSummary, active: boolean): void => update({ openCard: active ? '' : card.id, openCi: '' });

/** A card: its name, its state, the one number and at most one more fact. The hint is the tooltip (D220). */
function Card({ card, active, change, topic }: ItemProps) {
  const line = cardLine(card, change);
  const state = stateOf(card);
  return (
    <button type="button" data-rows onClick={() => openCard(card, active)} aria-pressed={active} aria-label={nameOf(card, line)} data-tip={tipOf(card)}
      data-kind={cardKind(card.pack)} data-light={card.light} data-later={card.later ? '' : undefined} data-topic={topic}
      className={cx('group flex min-w-0 flex-col gap-2 rounded-xl px-4 py-3 text-left transition hover:ring-2 hover:ring-accent',
        state.icon === 'later' ? 'bg-surface-2 ring-1 ring-line-strong [border-style:dashed]' : 'bg-surface shadow-sm', active ? 'ring-2 ring-accent' : state.icon === 'later' ? '' : 'ring-1 ring-transparent')}>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 text-sm font-semibold whitespace-nowrap text-ink" data-card-name>{card.label}</span>
        <Icon name="right" className="ml-auto size-4 text-muted opacity-0 transition group-hover:opacity-100" />
      </span>
      <span className="flex min-h-6 items-center gap-2.5">
        <LightBadge light={state.light} word={state.word} {...(state.icon ? { icon: state.icon } : {})} />
        <Number line={line} big />
        <span className="flex-1" />
        <Fact line={line} />
      </span>
    </button>
  );
}

/** A card as one line of 36 px (the Lines switch): state icon, name, one fact, the number, the chevron. */
function Line({ card, active, change, topic }: ItemProps) {
  const line = cardLine(card, change);
  const state = stateOf(card);
  const quiet = state.light === 'green' || state.light === 'grey';
  return (
    <button type="button" onClick={() => openCard(card, active)} aria-pressed={active} aria-label={nameOf(card, line)} data-tip={tipOf(card)}
      data-kind={cardKind(card.pack)} data-light={card.light} data-later={card.later ? '' : undefined} data-topic={topic}
      className={cx('group flex h-9 min-w-0 items-center gap-2.5 border-b border-line pr-3 pl-2 text-left transition hover:bg-surface-2', active && 'bg-accent-soft')}>
      <LightBadge light={state.light} word={state.word} iconOnly {...(state.icon ? { icon: state.icon } : {})} />
      <span className={cx('min-w-0 text-sm whitespace-nowrap', quiet ? 'text-muted' : 'font-semibold text-ink')} data-card-name>{card.label}</span>
      <span className="flex-1" />
      <Fact line={line} />
      <span className="flex w-24 shrink-0 justify-end"><Number line={line} /></span>
      <Icon name="right" className="size-4 text-muted opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}

/** One grey line per parked class (D179): what the cards do not check yet, so nothing is left out silently. */
function ParkedLines({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <ul className="flex flex-col items-start gap-1" data-parked aria-label="Not checked yet">
      {lines.map((line) => <li key={line} className="inline-flex items-center gap-2 rounded-lg px-3 py-1 text-sm text-muted ring-1 ring-inset ring-line-strong [border-style:dashed]"><Icon name="nottested" className="size-4" />{line}</li>)}
    </ul>
  );
}

/** The cards of every section, as cards or lines (D217), to solve and biggest first (D172). */
export function Overview({ cards, since, folderOf }: { cards: CardSummary[]; since: SinceReport | null; folderOf: FolderOf }) {
  const store = useStore();
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const lines = store.cardsAs === 'lines';
  const parked = latestRun()?.parked?.lines ?? [];
  const sections = MODULES.map((module) => {
    const all = cards.filter((card) => card.module === module);
    return { module, all, shown: orderCards(all.filter((card) => cardVisible(card, folderOf, since?.byCheck[card.id]))) };
  });
  const anyShown = sections.some((section) => section.shown.length);
  const clear = (): void => setFilters({ onlyRed: false, mine: false, due: false, escalations: false, fresh: false, subject: 'all' });
  return (
    <div className="space-y-4">
      <FilterBar />
      {!anyShown && <EmptyState icon="search" title="No card" text="No card matches the filters." action={<Button onClick={clear}><Icon name="close" />Clear</Button>} />}
      {anyShown && sections.map(({ module, all, shown }, index) => {
        if (!shown.length) return null;
        const header = sectionText(all);
        const isFolded = !!folded[module];
        return (
          <section key={module} aria-labelledby={`section-${module}`} className="space-y-2.5">
            <div className="flex min-h-9 items-center gap-2 max-sm:flex-wrap">
              <button type="button" onClick={() => setFolded({ ...folded, [module]: !isFolded })} aria-expanded={!isFolded} aria-label={`Fold ${MODULE_LABEL[module]}`}
                className="inline-flex size-6 items-center justify-center rounded-md text-muted hover:bg-surface-2"><FoldSign open={!isFolded} /></button>
              <h2 id={`section-${module}`} className="text-base font-bold whitespace-nowrap text-ink">{MODULE_LABEL[module]}</h2>
              <span className="text-sm whitespace-nowrap text-muted max-sm:whitespace-normal" data-section-count>{header.text}</span>
              <span tabIndex={0} data-tip={MODULE_HINT[module]} aria-label={MODULE_HINT[module]} className="inline-flex size-6 items-center justify-center rounded-md text-muted"><Icon name="info" /></span>
            </div>
            {!isFolded && <>
              {index === sections.findIndex((section) => section.shown.length) && <ParkedLines lines={parked} />}
              {lines
                ? <div className="grid grid-cols-1 overflow-hidden rounded-xl bg-surface shadow-sm ring-1 ring-line min-[1250px]:grid-cols-2 min-[1250px]:[&>*:nth-child(odd)]:border-r" data-lines>
                    {shown.map((card) => <Line key={card.id} card={card} active={store.openCard === card.id} change={since?.byCheck[card.id]} topic={topicOf(folderOf(card.id)).word} />)}
                  </div>
                : <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5" data-cards>
                    {shown.map((card) => <Card key={card.id} card={card} active={store.openCard === card.id} change={since?.byCheck[card.id]} topic={topicOf(folderOf(card.id)).word} />)}
                  </div>}
            </>}
          </section>
        );
      })}
    </div>
  );
}

/** Beside an open card: a plain list of the card names, a state icon and a number, one line each (no small cards). */
export function CardList({ cards, since, folderOf }: { cards: CardSummary[]; since: SinceReport | null; folderOf: FolderOf }) {
  const store = useStore();
  return (
    <nav aria-label="All cards" className="space-y-1">
      <Button kind="ghost" small onClick={() => update({ openCard: '', openCi: '' })}><Icon name="back" />All cards</Button>
      {MODULES.map((module) => {
        const shown = orderCards(cards.filter((card) => card.module === module && cardVisible(card, folderOf, since?.byCheck[card.id])));
        if (!shown.length) return null;
        return (
          <section key={module} aria-label={MODULE_LABEL[module]}>
            <h2 className="px-2 pt-2.5 pb-1 text-xs font-semibold whitespace-nowrap text-muted">{MODULE_LABEL[module]}</h2>
            {shown.map((card) => {
              const line = cardLine(card, since?.byCheck[card.id]);
              const state = stateOf(card);
              const active = store.openCard === card.id;
              return (
                <button key={card.id} type="button" onClick={() => openCard(card, active)} aria-pressed={active} aria-label={nameOf(card, line)} data-tip={tipOf(card)} data-light={card.light}
                  className={cx('flex h-[30px] w-full min-w-0 items-center gap-2 rounded-md pr-2 pl-1 text-left text-[13px] hover:bg-surface-2', active && 'bg-accent-soft font-semibold shadow-[inset_3px_0_0_var(--wb-accent)]')}>
                  <LightBadge light={state.light} word={state.word} iconOnly {...(state.icon ? { icon: state.icon } : {})} />
                  <span className="min-w-0 flex-1 whitespace-nowrap">{card.label}</span>
                  {line.count !== null && line.count > 0 && <span className="text-xs text-muted tabular-nums">{line.count.toLocaleString('en-GB')}</span>}
                </button>
              );
            })}
          </section>
        );
      })}
    </nav>
  );
}
