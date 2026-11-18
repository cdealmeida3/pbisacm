// The tables of an open card (version 0.31, build L3): one table part for the CIs of a group, the plain lines of a
// folded list and the lines SACM checks first. The name looks like a link and the whole line opens the case.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { recipientOf } from '../../../core/messages/messages.ts';
import { update } from '../../state/store.ts';
import { useStore } from '../../state/use-store.ts';
import { fixPlace } from '../../ui/labels.ts';
import { isClosed, stateWhyOf, statusWord } from '../../view/cases.ts';
import { canWriteTo } from '../../view/groups.ts';
import type { CiRow } from '../../view/groups.ts';
import type { Person, ShownRole } from '../../view/people.ts';
import { Chip, Icon, Pager, STATE_ICON, STATUS_TONE, cx, pageOf, shortDate } from '../../ui/basics.tsx';
import { TABLE } from '../../ui/parts.tsx';
import type { Case } from '../../../core/cases/cases.ts';

/** The tags of a CI on a line of a card (D151): they often answer a question. Never in a message to the owner. */
export function Tags({ tags, chips }: { tags: string[] | undefined; chips?: string[] | undefined }) {
  // The chip "to map" already says Descoped: the tag is not repeated on the same line (F51).
  const toMap = (chips ?? []).some((chip) => chip.toLowerCase() === 'to map');
  const shown = (tags ?? []).filter((tag) => !(toMap && tag.trim().toLowerCase() === 'descoped'));
  if (!shown.length) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-1" aria-label="Tags">
      {shown.map((tag) => <span key={tag} className="inline-flex items-center gap-0.5 rounded bg-surface-2 px-1.5 py-px text-xs text-muted"><Icon name="tag" className="size-3.5" />{tag}</span>)}
    </span>
  );
}

/**
 * What tells two lines of the same name apart (F36): the EPO ID, else the class. '' when the name is there once.
 * `names`: how often each name is in the list.
 */
export function apartWord(names: Map<string, number>, item: Case | undefined): string {
  if (!item || (names.get(item.fact.ciName) ?? 0) < 2) return '';
  return item.fact.ci?.epoId ? `EPO ID ${item.fact.ci.epoId}` : item.fact.classLabel;
}
export function nameCounts(names: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return counts;
}

/**
 * The first cell of a line: the name, styled as a link (the line opens the case), and on the same line its class (or the
 * vendor of a contract), what tells two names apart, the chips of the CI and its tags. `name` is false on the second line
 * of the same CI.
 */
export function CiCell({ item, name, sub, apart, showName = true }: { item: Case | undefined; name: string; sub: string; apart: string; showName?: boolean }) {
  const chips = item?.fact.ci?.chips ?? [];
  if (!showName) return null;
  return <>
    <span className="font-semibold text-ink underline decoration-line-strong decoration-1 underline-offset-2 group-hover/row:decoration-current" data-ci-name>{name}</span>
    {apart && <span className="ml-1.5 text-xs text-muted" data-apart>{apart}</span>}
    <span className="ml-1.5 text-xs whitespace-nowrap text-muted" data-class>{sub}</span>
    {chips.map((chip) => <span key={chip} className="ml-1.5"><Chip tone="blue">{chip}</Chip></span>)}
    <Tags tags={item?.fact.ci?.tags} chips={chips} />
  </>;
}

/** The last cell of a line: a chevron that shows on hover, to say the line opens. */
export const RowGo = () => <td className={cx(TABLE.td, 'w-8 text-muted max-md:hidden')}><Icon name="right" className="size-4 opacity-0 transition group-hover/row:opacity-100" /></td>;

/** A line of a table that opens the case of its CI, by a click or Enter. */
export function RowLink({ ciKey, marked, children }: { ciKey: string; marked?: boolean; children: ReactNode }) {
  const open = (): void => update({ openCi: ciKey });
  return (
    <tr onClick={open} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' && event.target === event.currentTarget) open(); }}
      className={cx(TABLE.row, marked && 'bg-teal-soft hover:bg-teal-soft')} {...(marked ? { 'data-marked-line': '' } : {})}>
      {children}
    </tr>
  );
}

/** "Missing" in red when the empty field is the problem, "–" when it is empty and not the problem (D229). */
export function PersonCell({ person, problem }: { person: Person | undefined; problem: boolean }) {
  if (!person) return problem ? <span className="text-sm font-semibold text-red" data-missing>Missing</span> : <span className="text-sm text-muted">–</span>;
  return (
    <span className={cx('text-sm', problem && 'font-semibold text-red')} data-tip={person.email}>
      {person.name}{person.active === false && <span className="ml-1 text-xs">(inactive)</span>}
    </span>
  );
}

/** The state of one case on a line: its status (not New), and why it waits or is known. */
export function CaseChips({ item, place = false, unwritable = false }: { item: Case; place?: boolean; unwritable?: boolean }) {
  const closed = isClosed(item);
  const why = !closed && (item.state === 'waiting' || item.state === 'known') ? stateWhyOf(item) : '';
  if (item.status === 'New' && !why && !(place && !closed) && !(unwritable && !closed)) return <span className="text-muted">–</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {item.status !== 'New' && <Chip tone={STATUS_TONE[item.status]}>{statusWord(item.status)}{closed && item.verifiedOn ? ` ${shortDate(item.verifiedOn)}` : ''}</Chip>}
      {why && <Chip icon={STATE_ICON[item.state]}>{why}</Chip>}
      {place && !closed && <span className="text-xs text-muted" data-place>{fixPlace(item)}</span>}
      {unwritable && !closed && <Chip tone="amber" icon="nobody">Nobody to write to</Chip>}
    </span>
  );
}

const roleLabel = (role: ShownRole, contract: boolean): string => (contract ? 'Contract owner' : role === 'owned_by' ? 'Owned by' : role === 'managed_by' ? 'Managed by' : 'Supported by');

/**
 * The CIs (or contracts) of a group, 50 to a page. `place`: the fix place on each line (a card that holds both, F23).
 * `markUnwritable`: a line nobody can be written about carries the mark "Nobody to write to" (F37).
 */
export function CiTable({ rows, roles, contract = false, place = false, markUnwritable = false }: { rows: CiRow[]; roles: ShownRole[]; contract?: boolean; place?: boolean; markUnwritable?: boolean }) {
  const store = useStore();
  const [page, setPage] = useState(0);
  const names = nameCounts(rows.map((row) => row.name));
  const at = pageOf(rows, page);
  return (
    <div>
      <table className={TABLE.table}>
        <thead className={TABLE.head}>
          <tr>
            <th className={TABLE.th}>{contract ? 'Contract' : 'CI'}</th>
            {roles.map((role) => <th key={role} className={TABLE.th}>{roleLabel(role, contract)}</th>)}
            <th className={TABLE.th}>Problem</th>
            <th className={TABLE.th}>State</th>
            <th className={TABLE.th}><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody className={TABLE.body}>
          {at.shown.map((row) => {
            const fields = new Set(row.cases.map((item) => item.fact.field));
            const first = row.cases[0];
            return (
              <RowLink key={row.ciKey} ciKey={row.ciKey}>
                <td className={TABLE.td}>
                  <CiCell item={first} name={row.name} apart={apartWord(names, first)} sub={contract ? first?.fact.ci?.contract?.vendor || 'No vendor' : row.classLabel} />
                </td>
                {roles.map((role) => (
                  <td key={role} className={cx(TABLE.td, 'max-md:flex max-md:gap-2')}>
                    <span className={TABLE.label}>{roleLabel(role, contract)}:</span>
                    <PersonCell person={row.people[role]} problem={fields.has(role)} />
                  </td>
                ))}
                <td className={TABLE.td}>{row.cases.map((item) => <span key={item.key} className="block">{item.fact.detail}</span>)}</td>
                <td className={TABLE.td}>
                  <span className="flex flex-col gap-1">
                    {row.cases.map((item) => <CaseChips key={item.key} item={item} place={place} unwritable={markUnwritable && !canWriteTo(item, (fact) => recipientOf(fact, store.settings))} />)}
                  </span>
                </td>
                <RowGo />
              </RowLink>
            );
          })}
        </tbody>
      </table>
      <Pager total={rows.length} from={at.from} to={at.to} page={at.page} pages={at.pages} onPage={setPage} word={contract ? 'contracts' : 'CIs'} />
    </div>
  );
}

/** Lines nobody is asked about, as a plain table: the CI, what the report shows, and its state. The whole line opens the case. */
export function PlainLines({ cases, contract = false, why = true }: { cases: Case[]; contract?: boolean; why?: boolean }) {
  const [page, setPage] = useState(0);
  const sorted = cases.slice().sort((a, b) => a.fact.ciName.localeCompare(b.fact.ciName) || a.fact.detail.localeCompare(b.fact.detail));
  const names = nameCounts(Array.from(new Map(sorted.map((item) => [item.fact.ciKey, item.fact.ciName])).values()));
  const at = pageOf(sorted, page);
  return (
    <div className="rounded-xl bg-surface px-2 py-1 shadow-sm ring-1 ring-line">
      <table className={TABLE.table}>
        <thead className={TABLE.head}><tr><th className={TABLE.th}>{contract ? 'Contract' : 'CI'}</th><th className={TABLE.th}>What the report shows</th><th className={TABLE.th}>State</th><th className={TABLE.th}><span className="sr-only">Open</span></th></tr></thead>
        <tbody className={TABLE.body}>
          {at.shown.map((item) => (
            <RowLink key={item.key} ciKey={item.fact.ciKey}>
              <td className={TABLE.td}><CiCell item={item} name={item.fact.ciName} apart={apartWord(names, item)} sub={contract ? item.fact.ci?.contract?.vendor || 'No vendor' : item.fact.classLabel} /></td>
              <td className={TABLE.td}>{item.fact.fix?.change ?? item.fact.detail}</td>
              <td className={TABLE.td}>{(why || isClosed(item)) ? <CaseChips item={item} /> : <span className="text-muted">–</span>}</td>
              <RowGo />
            </RowLink>
          ))}
        </tbody>
      </table>
      <Pager total={sorted.length} from={at.from} to={at.to} page={at.page} pages={at.pages} onPage={setPage} word="lines" />
    </div>
  );
}
