// The parts of the look that sit next to the buttons and chips of basics.tsx: tabs, segmented control, counter, notice,
// empty state, fold, menu button, date field, table, long text and the one tooltip of the page (docs/LOOK.md).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { screenDate } from '../../core/shared/dates.ts';
import { Button, Icon, cx, initialsOf } from './basics.tsx';
import type { Tone } from './basics.tsx';
import type { IconName } from './icons.ts';

/** Tabs with a line under the open one (coral, rule 3 of the readings), never a filled pill. */
export function Tabs<T extends string>({ label, tabs, value, onChange }: { label: string; tabs: Array<{ id: T; label: ReactNode; icon?: IconName }>; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={value === tab.id} onClick={() => onChange(tab.id)}
          className={cx('-mb-px inline-flex h-9 items-center gap-1.5 border-b-[3px] px-3 text-sm whitespace-nowrap', value === tab.id ? 'border-deco font-semibold text-ink' : 'border-transparent text-muted hover:text-ink')}>
          {tab.icon && <Icon name={tab.icon} />}{tab.label}
        </button>
      ))}
    </div>
  );
}

/** One choice out of a few, side by side: the chosen one has a light fill and a navy ring. */
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: Array<{ id: T; label: ReactNode }>; value: T; onChange: (id: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-surface p-0.5 ring-1 ring-inset ring-line-strong">
      {options.map((option) => (
        <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}
          className={cx('inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm whitespace-nowrap', value === option.id ? 'bg-accent-soft font-semibold text-ink ring-1 ring-inset ring-accent' : 'text-ink hover:bg-surface-2')}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A counter: its colour when there is something, grey and not a button when it is zero. */
export function Counter({ icon, text, tone, onClick, tip }: { icon: IconName; text: string; tone: Tone; onClick?: () => void; tip?: string }) {
  const colour: Record<Tone, string> = {
    grey: 'bg-grey-soft text-grey ring-grey-line', amber: 'bg-amber-soft text-amber ring-amber-line', red: 'bg-red-soft text-red ring-red-line',
    green: 'bg-green-soft text-green ring-green-line', blue: 'bg-blue-soft text-blue ring-blue-line', violet: 'bg-violet-soft text-violet ring-violet-line',
    teal: 'bg-teal-soft text-teal ring-teal-line'
  };
  return (
    <button type="button" onClick={onClick} disabled={!onClick} data-tip={tip}
      className={cx('inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm whitespace-nowrap', onClick ? cx('font-semibold ring-1 ring-inset hover:brightness-95', colour[tone]) : 'text-muted')}>
      <Icon name={icon} />{text}
    </button>
  );
}

/** A notice: warning (act before you go on), info, or a reply to read. */
export function Notice({ kind, children, className }: { kind: 'warn' | 'info' | 'reply'; children: ReactNode; className?: string }) {
  const style = { warn: 'bg-amber-soft text-amber ring-amber-line', info: 'bg-blue-soft text-blue ring-blue-line', reply: 'bg-violet-soft text-violet ring-violet-line' }[kind];
  return (
    <div className={cx('flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm ring-1 ring-inset', style, className)}>
      <Icon name={kind === 'warn' ? 'warn' : kind === 'info' ? 'info' : 'replies'} className="mt-0.5 size-4" />
      <div className="min-w-0 flex-1 text-ink">{children}</div>
    </div>
  );
}

/** Nothing to show: an icon, one sentence, at most one action. */
export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl px-6 py-7 text-center text-muted ring-1 ring-line-strong ring-inset [border-style:dashed]">
      <Icon name={icon} className="size-7" />
      <b className="font-semibold text-ink">{title}</b>
      {text && <span className="text-sm">{text}</span>}
      {action}
    </div>
  );
}

/** The fold sign of a section or a group: a chevron of 24 px that turns down when open. */
export function FoldSign({ open, className }: { open: boolean; className?: string }) {
  return <Icon name="right" className={cx('size-4 transition', open && 'rotate-90', className)} />;
}

/** A menu button: the word and the menu sign (three bars), a list under it; Escape or a click outside closes it. */
export function MenuButton({ label, icon = 'more', iconOnly, kind = 'ghost', caret, align = 'right', up, tip, word, children }: { label: string; icon?: IconName; iconOnly?: boolean; kind?: 'ghost' | 'secondary'; caret?: boolean; align?: 'left' | 'right'; up?: boolean; tip?: string; word?: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: MouseEvent): void => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    // Escape closes the menu only, not the window it sits in.
    const escape = (event: KeyboardEvent): void => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <Button kind={kind} aria-haspopup="menu" aria-expanded={open} onClick={(event) => { event.stopPropagation(); setOpen(!open); }} aria-label={label} {...(iconOnly ? { 'data-tip': label } : tip ? { 'data-tip': tip } : {})}>
        <Icon name={icon} /><span className={cx(iconOnly ? 'sr-only' : 'max-sm:sr-only')}>{word ?? label}</span>{caret && <Icon name="down" className="size-3.5" />}
      </Button>
      {open && (
        <div role="menu" aria-label={label} onClick={(event) => event.stopPropagation()} className={cx('absolute z-30 w-64 rounded-lg bg-surface p-1 shadow-xl ring-1 ring-line-strong', up ? 'bottom-full mb-1' : 'mt-1', align === 'right' ? 'right-0' : 'left-0')}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
/** One line of a menu: an icon and a word, 36 px; the note is a tooltip. */
export function MenuItem({ icon, label, tip, onClick }: { icon: IconName; label: string; tip?: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} data-tip={tip}
      className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm whitespace-nowrap hover:bg-surface-2">
      <Icon name={icon} className="size-4 text-muted" />{label}
    </button>
  );
}

/** A line of a menu that is on or off (a filter): a tick when on, the menu stays open. */
export function MenuCheck({ label, checked, onChange, tip }: { label: string; checked: boolean; onChange: (value: boolean) => void; tip?: string }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={checked} onClick={() => onChange(!checked)} data-tip={tip}
      className={cx('flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm whitespace-nowrap hover:bg-surface-2', checked && 'font-semibold')}>
      <span className="inline-flex size-4 items-center justify-center">{checked && <Icon name="check" className="size-4 text-accent" />}</span>{label}
    </button>
  );
}

/** A line between two parts of a menu, with a heading when given ("Assign to"). */
export function MenuLine({ heading }: { heading?: string }) {
  return heading ? <p className="mt-1 border-t border-line px-3 pt-2 pb-1 text-xs font-semibold whitespace-nowrap text-muted">{heading}</p> : <div className="my-1 border-t border-line" />;
}

/** A note at the bottom of a menu, grey and not a button ("Last read 21:29"). */
export function MenuNote({ children }: { children: ReactNode }) {
  return <p className="border-t border-line px-3 pt-2 pb-1.5 text-xs whitespace-nowrap text-muted">{children}</p>;
}

/** A date field: the browser's picker, and the date in words beside it ("5 Dec 2027"), as everywhere else (D176). */
export function DateField({ label, value, onChange, min }: { label: string; value: string; onChange: (value: string) => void; min?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <input type="date" aria-label={label} value={value} min={min} onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-md bg-surface px-2 text-sm text-ink ring-1 ring-inset ring-line-strong focus:ring-2 focus:ring-accent" />
      {value && <span className="text-sm whitespace-nowrap text-muted" data-date-words>{screenDate(value)}</span>}
    </span>
  );
}

/**
 * The table part (version 0.31, build L3): the header stays in view under the header of the page, numbers at the right,
 * the whole line opens (`row`, with a chevron on hover). Below 768 px each line is a small box of its own and the column
 * names show inside it (`label`).
 */
const TH = 'sticky top-0 z-[1] border-b border-line bg-surface px-3 py-2 text-xs font-semibold whitespace-nowrap text-muted';
export const TABLE = {
  table: 'w-full border-collapse text-left text-sm max-md:block',
  head: 'max-md:hidden',
  th: `${TH} sm:top-16`,
  /** The header of a table in a window: it stays in view at the top of the window. */
  thWindow: TH,
  /** A line that does not open anything (a window's list). */
  line: 'max-md:block max-md:rounded-lg max-md:px-3 max-md:py-2 max-md:ring-1 max-md:ring-line',
  body: 'max-md:block max-md:space-y-2 max-md:py-2',
  td: 'border-b border-line px-3 py-2.5 align-top max-md:block max-md:border-0 max-md:px-0 max-md:py-0.5',
  num: 'text-right tabular-nums',
  row: 'group/row cursor-pointer hover:bg-surface-2 max-md:block max-md:rounded-lg max-md:px-3 max-md:py-2 max-md:ring-1 max-md:ring-line',
  label: 'text-xs text-muted md:hidden'
};

/** A folded list: one word and its count ("Waiting 1"); the explanation when it is open (D230). Under a card, and the
 * lists of Contract changes (build L5). */
export function Fold({ title, count, icon, hint, startOpen = false, children }: { title: string; count: number; icon?: IconName; hint?: string; startOpen?: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(startOpen);
  return (
    <div className="space-y-3" data-fold={title}>
      <button type="button" onClick={() => setShown(!shown)} aria-expanded={shown} aria-label={`${title} ${count}`} className="inline-flex h-8 items-center gap-2 rounded-full pr-3 pl-1 text-sm font-semibold text-ink hover:bg-surface-2">
        <FoldSign open={shown} className="text-muted" />{icon && <Icon name={icon} className="size-4 text-muted" />}{title}<CountBadge n={count} />
      </button>
      {shown && hint && <p className="text-sm text-muted">{hint}</p>}
      {shown && children}
    </div>
  );
}

/** An active filter as a chip: its word and an x that takes it away (the filter row, the toolbar of a card). */
export function FilterChip({ id, word, onClear }: { id: string; word: string; onClear: () => void }) {
  return (
    <button type="button" onClick={onClear} data-filter-chip={id} data-tip={`Take the filter ${word} away`}
      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-sm font-semibold whitespace-nowrap text-ink ring-1 ring-inset ring-accent hover:brightness-95">
      {word}<Icon name="close" className="size-3.5" />
    </button>
  );
}

/** A count next to a heading or a word ("Problems 4", "Waiting 1"). */
export function CountBadge({ n }: { n: number }) {
  return <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-2 px-1.5 text-xs font-semibold text-ink tabular-nums ring-1 ring-inset ring-line-strong">{n.toLocaleString('en-GB')}</span>;
}

/** A tick box of 24 px (a line of a SACM list, a problem of a case): the browser's own, in the navy of the look. */
export function TickBox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="grid size-6 shrink-0 cursor-pointer place-items-center" onClick={(event) => event.stopPropagation()}>
      <input type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="size-[18px] cursor-pointer accent-accent" />
    </label>
  );
}

/** The round mark of a person: their initials, their name and what they do as the tooltip ("Assigned to Demo User"). */
export function Avatar({ name, tip }: { name: string; tip: string }) {
  return (
    <span data-tip={tip} aria-label={tip} role="img" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-ink ring-1 ring-inset ring-line-strong">
      {initialsOf(name)}
    </span>
  );
}

/** A long text: the first part, and "Show all" for the rest (no three dots on a cut text). */
export function LongText({ text, limit, className }: { text: string; limit: number; className?: string }) {
  const [all, setAll] = useState(false);
  if (text.length <= limit || all) return <p className={className}>{text}</p>;
  return <p className={className}>{text.slice(0, limit).trimEnd()} <button type="button" className="font-semibold text-accent underline" onClick={() => setAll(true)}>Show all</button></p>;
}

/**
 * The one tooltip of the page: any element with `data-tip` shows its text under the mouse and on keyboard focus (the
 * browser tooltip of `title` is not used). Mounted once by the shell.
 */
export function TipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean; host: Element } | null>(null);
  useEffect(() => {
    let current: Element | null = null;
    const show = (event: Event): void => {
      const target = (event.target instanceof Element ? event.target : null)?.closest('[data-tip]') ?? null;
      if (target === current) return;
      current = target;
      const text = target?.getAttribute('data-tip') ?? '';
      if (!target || !text) { setTip(null); return; }
      const box = target.getBoundingClientRect();
      const below = box.bottom + 60 < window.innerHeight;
      setTip({ host: target.closest('dialog') ?? document.body, text, x: Math.min(Math.max(box.left + box.width / 2, 170), window.innerWidth - 170), y: below ? box.bottom + 6 : box.top - 6, below });
    };
    const hide = (): void => { current = null; setTip(null); };
    document.addEventListener('mouseover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('focusout', hide);
    document.addEventListener('scroll', hide, true);
    const escape = (event: KeyboardEvent): void => { if (event.key === 'Escape') hide(); };
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mouseover', show); document.removeEventListener('focusin', show); document.removeEventListener('focusout', hide);
      document.removeEventListener('scroll', hide, true); document.removeEventListener('keydown', escape);
    };
  }, []);
  if (!tip) return null;
  return createPortal(
    <div role="tooltip" className="pointer-events-none fixed z-[100] max-w-80 rounded-md bg-tip px-2.5 py-1.5 text-xs text-tip-ink shadow-xl"
      style={{ left: tip.x, top: tip.y, transform: `translate(-50%, ${tip.below ? '0' : '-100%'})` }}>{tip.text}</div>,
    tip.host
  );
}
