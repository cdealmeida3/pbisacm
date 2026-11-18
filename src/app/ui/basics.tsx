// The small shared parts of every screen: buttons, icons, chips, dialogs, fields, and the words for lights and states.
import { cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { screenDate } from '../../core/shared/dates.ts';
import type { Light } from '../view/cases.ts';
import { ICONS } from './icons.ts';
import type { IconName } from './icons.ts';

export const cx = (...names: Array<string | false | null | undefined>): string => names.filter(Boolean).join(' ');
export const plural = (count: number, word: string, many = `${word}s`): string => `${count} ${count === 1 ? word : many}`;
/** The initials of a name ("Demo User": DU), for the round mark of a person. */
export const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).map((part) => part[0]!.toLocaleUpperCase('en-GB')).slice(0, 2).join('') || 'Me';
/** "12 Nov" for a date of this year, "12 Nov 2025" for another year: the date in lists (D176). */
export const shortDate = (iso: string): string => screenDate(iso.slice(0, 10), String(new Date().getFullYear()));

/** "12 Nov 2026": a date with its year, for sentences, the Audit page and what it prints. */
export const yearDate = (iso: string): string => screenDate(iso.slice(0, 10));

/* Buttons: one height (32 px), four kinds. The main button is navy; selected is never drawn as a main button (LOOK.md). */
type Kind = 'primary' | 'secondary' | 'ghost' | 'danger';
const KIND: Record<Kind, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-red text-surface hover:opacity-90'
};
const DISABLED = 'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted disabled:ring-1 disabled:ring-inset disabled:ring-line';

/** A button with a word. `small` is kept for the places that had a small button: every button is 32 px high now. */
export function Button({ kind = 'secondary', small, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind; small?: boolean; 'data-tip'?: string }) {
  return (
    <button type="button" {...rest}
      className={cx('inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition', small ? 'px-3' : 'px-4', KIND[kind], DISABLED, className)}>
      {children}
    </button>
  );
}

/** An icon alone, for the well-known actions only (settings, close, export, print, search, back, theme): its word is the tooltip. */
export function IconButton({ icon, label, className, ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { icon: IconName; label: string }) {
  return (
    <button type="button" aria-label={label} data-tip={label} {...rest}
      className={cx('inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-surface-2', DISABLED, className)}>
      <Icon name={icon} />
    </button>
  );
}

/* Icons: the Workspace set of icons.ts, drawn inline, so the page needs no image file. 16 px, 14 px in chips. */
export function Icon({ name, className = 'size-4' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={cx('shrink-0', className)}
      aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
  );
}

/** The mark of the app: a magnifier over a grid, navy with a coral magnifier (coral is decoration only). */
export const LOGO_SVG = '<rect x="4" y="4" width="7" height="7" rx="1.5" stroke="var(--wb-accent)"/><rect x="4" y="14" width="7" height="7" rx="1.5" stroke="var(--wb-accent)"/>'
  + '<rect x="14" y="4" width="7" height="7" rx="1.5" stroke="var(--wb-accent)"/><circle cx="19.5" cy="19.5" r="5.5" fill="var(--wb-surface)" stroke="var(--wb-deco)"/>'
  + '<path d="m23.6 23.6 4 4" stroke="var(--wb-deco)" stroke-width="2.8"/>';
export function Logo({ size = 28 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0" dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />;
}

/** The state of a card or group: one colour, one icon and one word each (rule 4), so it never depends on colour alone. */
export const LIGHT: Record<Light, { word: string; icon: IconName; badge: string; dot: string; bar: string }> = {
  red: { word: 'To solve', icon: 'solve', badge: 'bg-red-soft text-red ring-red-line', dot: 'bg-red', bar: 'bg-red' },
  green: { word: 'OK', icon: 'ok', badge: 'bg-green-soft text-green ring-green-line', dot: 'bg-green', bar: 'bg-green' },
  review: { word: 'To check', icon: 'eye', badge: 'bg-blue-soft text-blue ring-blue-line', dot: 'bg-blue', bar: 'bg-blue' },
  marked: { word: 'Marked as fixed', icon: 'marked', badge: 'bg-teal-soft text-teal ring-teal-line', dot: 'bg-teal', bar: 'bg-teal' },
  grey: { word: 'Not tested', icon: 'nottested', badge: 'bg-grey-soft text-grey ring-grey-line', dot: 'bg-grey', bar: 'bg-grey-line' }
};
/** The state badge: the five card states, and "when there is time" (grey, a cup) through `icon`. */
export function LightBadge({ light, word, iconOnly, icon }: { light: Light; word?: string; iconOnly?: boolean; icon?: IconName }) {
  const style = LIGHT[light];
  return (
    <span data-tip={iconOnly ? word ?? style.word : undefined} className={cx('inline-flex h-6 shrink-0 items-center gap-1 rounded-full text-xs font-semibold whitespace-nowrap ring-1 ring-inset', iconOnly ? 'w-6 justify-center' : 'pr-2.5 pl-2', style.badge)}>
      <Icon name={icon ?? style.icon} className="size-3.5" />{iconOnly ? <span className="sr-only">{word ?? style.word}</span> : word ?? style.word}
    </span>
  );
}

/** The status chip: one shape, the colours of the word list (rule 4). */
export type Tone = 'grey' | 'amber' | 'red' | 'green' | 'blue' | 'violet' | 'teal';
const TONE: Record<Tone, string> = {
  grey: 'bg-grey-soft text-grey', amber: 'bg-amber-soft text-amber', red: 'bg-red-soft text-red', green: 'bg-green-soft text-green',
  blue: 'bg-blue-soft text-blue', violet: 'bg-violet-soft text-violet', teal: 'bg-teal-soft text-teal'
};
export function Chip({ tone = 'grey', icon, children, title }: { tone?: Tone; icon?: IconName; children: ReactNode; title?: string }) {
  return (
    <span data-tip={title} className={cx('inline-flex h-[22px] items-center gap-1 rounded-md px-2 text-xs font-semibold whitespace-nowrap', TONE[tone])}>
      {icon && <Icon name={icon} className="size-3.5" />}{children}
    </span>
  );
}

/** How a case that is not "to solve" is named on the screens. */
export const STATE_WORD: Record<string, string> = { open: 'To solve', review: 'To check', waiting: 'Waiting', known: 'Known' };
export const STATE_ICON: Record<string, IconName> = { open: 'solve', review: 'eye', waiting: 'clock', known: 'tag' };

export const STATUS_TONE: Record<string, Tone> = { New: 'grey', Contacted: 'blue', Answered: 'violet', 'Fix in progress': 'blue', Fixed: 'teal', 'Not followed up': 'grey', Verified: 'green' };

/**
 * A window on the native dialog element: focus, Escape and the shade behind come with it. Three widths: small (480),
 * medium (720) and the side panel (560, the case panel). One footer: Cancel or Close at the left of the main button, the
 * main button right-most.
 */
export function Dialog({ title, onClose, children, actions, wide, guard }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode; wide?: boolean; guard?: () => boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const box = ref.current; if (box && !box.open) box.showModal(); }, []);
  // `guard`: asked before the window closes by Close or Escape; false keeps it open (Settings asks about changes first).
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title} onCancel={(event) => { if (guard && !guard()) event.preventDefault(); }}
      className={cx('m-auto max-h-[92vh] w-[calc(100%-1.5rem)] overflow-hidden rounded-xl bg-surface p-0 text-ink shadow-xl ring-1 ring-line', wide ? 'max-w-[720px]' : 'max-w-[480px]')}>
      <div className="flex max-h-[92vh] flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton icon="close" label="Close" onClick={() => { if (!guard || guard()) ref.current?.close(); }} />
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">{children}</div>
        {actions && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{actions}</div>}
      </div>
    </dialog>
  );
}

/** The reason a button is grey, in words next to it (rule 6): "Tick a line first". */
export function Why({ children }: { children: ReactNode }) {
  return <span className="text-sm whitespace-nowrap text-muted" data-why>{children}</span>;
}

export const inputClass = 'w-full rounded-md border-0 bg-surface px-3 py-1.5 text-sm text-ink ring-1 ring-inset ring-line-strong placeholder:text-muted focus:ring-2 focus:ring-accent';

/**
 * A field with its label. The hint and the error sit under the label, not in it, so the field's name is its label alone;
 * the hint is linked to the field for screen readers.
 */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  const id = useId();
  const described = hint && isValidElement<{ 'aria-describedby'?: string }>(children) ? cloneElement(children, { 'aria-describedby': `${id}-hint` }) : children;
  return (
    <div className="space-y-1">
      <label className="block space-y-1">
        <span className="block text-xs font-semibold text-muted">{label}</span>
        {described}
      </label>
      {error && <span role="alert" className="block text-xs font-semibold text-red">{error}</span>}
      {hint && <span id={`${id}-hint`} className="block text-xs text-muted">{hint}</span>}
    </div>
  );
}

/** The filter chip: a tick and a light fill when on, never the navy of a main button (rule 5). */
export function Toggle({ label, checked, onChange, icon }: { label: string; checked: boolean; onChange: (value: boolean) => void; icon?: IconName }) {
  return (
    <button type="button" aria-pressed={checked} onClick={() => onChange(!checked)}
      className={cx('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap ring-1 ring-inset transition',
        checked ? 'bg-accent-soft font-semibold text-ink ring-accent' : 'bg-surface text-ink ring-line-strong hover:bg-surface-2')}>
      <Icon name={checked ? 'check' : icon ?? 'filter'} className="size-3.5" />{label}
    </button>
  );
}

/** The size of a page of a long list (F25). */
export const PAGE_SIZE = 50;

/** The lines of one page of a list, and where the page sits: "Showing 51 to 100 of 303". */
export function pageOf<T>(list: T[], page: number, size = PAGE_SIZE): { shown: T[]; page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const at = Math.min(Math.max(0, page), pages - 1);
  const shown = list.slice(at * size, (at + 1) * size);
  return { shown, page: at, pages, from: list.length ? at * size + 1 : 0, to: at * size + shown.length };
}

/** "Showing 1 to 50 of 303" with Previous and Next. Nothing when the list fits on one page. */
export function Pager({ total, from, to, page, pages, onPage, word }: { total: number; from: number; to: number; page: number; pages: number; onPage: (page: number) => void; word: string }) {
  if (pages <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted" data-pager>
      <span>Showing {from} to {to} of {total.toLocaleString('en-GB')} {word}</span>
      <Button small kind="ghost" disabled={page === 0} onClick={() => onPage(page - 1)}><Icon name="back" className="size-3.5" />Previous</Button>
      <Button small kind="ghost" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next<Icon name="right" className="size-3.5" /></Button>
    </div>
  );
}
