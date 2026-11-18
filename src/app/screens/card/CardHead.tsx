// The head every open card shares (the way back, the title, what to do, Details, the numbers), the one toolbar of every
// kind of card, and the one sentence of a card with nothing to do.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { latestRun, update } from '../../state/store.ts';
import { useStore } from '../../state/use-store.ts';
import { MODULE_LABEL, cardFixLabel } from '../../ui/labels.ts';
import { LATER_WORDS, asideText, subjectWord, testedOn } from '../../view/cards.ts';
import { isClosed } from '../../view/cases.ts';
import { contractFilesLine } from '../../view/contracts.ts';
import type { CardSummary } from '../../view/cards.ts';
import { Button, Icon, LightBadge, cx, inputClass } from '../../ui/basics.tsx';
import { FilterChip, MenuButton, MenuCheck, MenuLine } from '../../ui/parts.tsx';

export interface HeadNumber { value: number | string; label: string }

/**
 * The head of an open card (version 0.31, build L3; pale pink, D227): the title and its state, one sentence of what to do,
 * the link Details for the rest, and the numbers of its kind in short words (D167). `place`: say how the problem gets
 * fixed (in Details), only when every line has the same place (F23). `badge`: another word for the state. `children`:
 * lines that belong to this kind of card (the progress of a fix list, the warning of a mailbox).
 */
export function CardHead({ card, numbers, place = true, badge, aside = true, children }: { card: CardSummary; numbers: HeadNumber[]; place?: boolean; badge?: string; aside?: boolean; children?: ReactNode }) {
  const store = useStore();
  const [details, setDetails] = useState(false);
  const fix = place ? cardFixLabel(card.pack, card.cases.filter((item) => !isClosed(item))).text : '';
  const filesLine = card.pack.subject === 'contract' ? contractFilesLine(latestRun(), store.solusi, store.contracts) : '';
  const rest = aside ? asideText(card) : asideText(card, false);
  const todo = card.pack.cardHint ?? card.pack.cardText ?? card.pack.title;
  // The rest, for Details: the check's own name when it differs from the card's, the subject, the fix place, the long text.
  const more = [card.pack.title !== card.label ? card.pack.title : '', MODULE_LABEL[card.module]].filter(Boolean).join(' · ');
  const long = card.pack.cardText && card.pack.cardText !== todo ? card.pack.cardText : '';
  return <>
    {/* Below 1280 px the list of cards is not beside the card: the way back is here. */}
    <div className="xl:hidden">
      <Button kind="ghost" small onClick={() => update({ openCard: '', openCi: '' })}><Icon name="back" />All cards</Button>
    </div>
    <div className="flex flex-wrap items-start gap-4 rounded-xl bg-pink px-5 py-4 shadow-sm ring-1 ring-line" data-card-head>
      <div className="min-w-[min(100%,18rem)] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{card.label}</h2>
          <LightBadge light={card.light} {...(badge ? { word: badge } : {})} />
          {card.later && <LightBadge light="grey" word={LATER_WORDS} icon="later" />}
        </div>
        {todo && <p className="mt-1 max-w-3xl text-sm text-ink" data-card-todo>{todo}</p>}
        {children}
        {/* A card that was not tested and has nothing to show says why once, in its one sentence (F32). */}
        {!(card.light === 'grey' && card.open.length + card.review.length === 0) && card.notes.map((note) => <p key={note} className="mt-1 text-sm text-muted"><Icon name="nottested" className="mr-1 inline size-3.5" />{note}</p>)}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <button type="button" aria-expanded={details} onClick={() => setDetails(!details)} data-tip="How this check works"
            className="inline-flex min-h-6 items-center gap-1 font-semibold text-accent underline decoration-dotted underline-offset-2 hover:decoration-solid">
            <Icon name="help" className="size-3.5" />Details
          </button>
          {rest && <span className="inline-flex items-center gap-1 whitespace-nowrap text-muted" data-aside><Icon name="clock" className="size-3.5" />{rest}, below</span>}
          {filesLine && <span className="inline-flex flex-wrap items-center gap-x-2 text-ink"><Icon name="contract" className="size-3.5" />{filesLine}
            <button type="button" className="min-h-6 font-semibold text-accent underline" onClick={() => update({ view: 'contracts', openCi: '' })}>Contract changes</button></span>}
        </div>
        {details && (
          <div className="mt-2 max-w-3xl space-y-1 text-sm text-muted" data-details>
            <p>{more}{fix ? <span data-fix-place> · {fix}</span> : ''}</p>
            {long && <p className="text-ink">{long}</p>}
            {rest && <p>Not counted as to solve: {rest}. They are listed below the main list.</p>}
          </div>
        )}
      </div>
      {numbers.length > 0 && (
        <div className="flex gap-5 text-center text-sm text-muted" data-numbers>
          {numbers.map((entry) => <div key={entry.label} className="whitespace-nowrap"><b className="block text-2xl font-semibold text-ink tabular-nums">{typeof entry.value === 'number' ? entry.value.toLocaleString('en-GB') : entry.value}</b>{entry.label}</div>)}
        </div>
      )}
    </div>
  </>;
}

/** What to load so a check can be tested, when its note only says which report is missing. '' when the note already says what to do. */
function whatToLoad(card: CardSummary): string {
  const note = card.notes[0] ?? '';
  if (/no Relationship report/.test(note)) return ' Load a Relationship report together with the CI report.';
  if (/no EPO systems report/.test(note)) return ' Load an EPO systems report together with the CI report.';
  if (/no Solusi contract file|no ServiceNow contract report/.test(note)) return ' Load the Solusi contract file and the ServiceNow contract report together with the CI report.';
  return '';
}

/**
 * A card with nothing to do (F32): one sentence, no toolbar and no table. Not tested is never "0 to solve": it says why
 * and what to load. Null when the card has lines to work on.
 */
export function NothingToDo({ card }: { card: CardSummary }) {
  if (card.open.length + card.review.length > 0) return null;
  const rest = asideText(card);
  if (card.light === 'grey') {
    const reason = (card.notes[0] ?? 'the latest report could not test this check').replace(/^Not tested:\s*/i, '').replace(/\.$/, '');
    return <p className="rounded-xl border border-dashed border-line-strong p-4 text-sm text-muted" data-nothing="grey">Not tested: {reason.charAt(0).toLowerCase() + reason.slice(1)}.{whatToLoad(card)} This is not the same as OK.</p>;
  }
  const tested = testedOn(card.pack, latestRun());
  return (
    <p className="rounded-xl border border-dashed border-green-line p-4 text-sm text-green" data-nothing="green">
      {tested === null ? 'Tested.' : tested === 0 ? `Tested: the report holds no ${subjectWord(card.pack, 1)} this check is about.` : `Tested on ${tested.toLocaleString('en-GB')} ${subjectWord(card.pack, tested)}.`} Nothing to solve.{rest ? ` ${rest}: see the lists below.` : ''}{card.verified ? ` ${card.verified} verified.` : ''}
    </p>
  );
}

/** The filters of the toolbar of a card: the class, Reminders and Mine (each only where the card offers it). */
export interface ToolbarFilters {
  search: string; setSearch: (value: string) => void;
  classes: string[]; chosenClass: string; setClassName: (value: string) => void;
  onlyDue?: boolean; setOnlyDue?: (value: boolean) => void;
  onlyMine?: boolean; setOnlyMine?: (value: boolean) => void;
}

/**
 * The one toolbar of every kind of card (version 0.31, build L3): Search and Filter at the left (and `left`, the Sort of
 * a card of owners), the actions of the card at the right (`right`: Share out, Export, Mark N fixed, the step of a mailbox).
 * The filters that are on show as chips with an x.
 */
export function CardToolbar({ filters, left, right }: { filters: ToolbarFilters; left?: ReactNode; right?: ReactNode }) {
  const { classes, chosenClass } = filters;
  const offered = classes.length > 1 || !!filters.setOnlyDue || !!filters.setOnlyMine;
  const on = [
    ...(chosenClass ? [{ id: 'class', word: chosenClass, clear: () => filters.setClassName('') }] : []),
    ...(filters.onlyDue && filters.setOnlyDue ? [{ id: 'reminders', word: 'Reminders', clear: () => filters.setOnlyDue!(false) }] : []),
    ...(filters.onlyMine && filters.setOnlyMine ? [{ id: 'mine', word: 'Mine', clear: () => filters.setOnlyMine!(false) }] : [])
  ];
  return (
    <div className="flex flex-wrap items-center gap-2" data-toolbar>
      <div className="relative w-56 shrink-0">
        <Icon name="search" className="pointer-events-none absolute top-2 left-3 size-4 text-muted" />
        <input type="search" aria-label="Search in this card" placeholder="Search" value={filters.search} data-tip="Search a CI, a person or a problem in this card"
          onChange={(event) => filters.setSearch(event.target.value.trim())} className={cx(inputClass, 'h-8 pl-9')} />
      </div>
      {offered && (
        <MenuButton label="Filter" icon="filter" kind="secondary" caret align="left">
          {() => <>
            {classes.length > 1 && <>
              <MenuCheck label="All classes" checked={!chosenClass} onChange={() => filters.setClassName('')} />
              {classes.map((name) => <MenuCheck key={name} label={name} checked={chosenClass === name} onChange={(value) => filters.setClassName(value ? name : '')} />)}
            </>}
            {classes.length > 1 && (filters.setOnlyDue || filters.setOnlyMine) && <MenuLine />}
            {filters.setOnlyDue && <MenuCheck label="Reminders" tip="Only the groups with a reminder or an escalation due" checked={!!filters.onlyDue} onChange={filters.setOnlyDue} />}
            {filters.setOnlyMine && <MenuCheck label="Mine" tip="Only what is assigned to me" checked={!!filters.onlyMine} onChange={filters.setOnlyMine} />}
          </>}
        </MenuButton>
      )}
      {on.map((filter) => <FilterChip key={filter.id} id={filter.id} word={filter.word} onClear={filter.clear} />)}
      {left}
      <span className="flex-1" />
      {right}
    </div>
  );
}

