import { useEffect, useMemo, useState } from 'react';
import { contractChanges, contractInformation } from '../../../core/sources/contracts/contract-changes.ts';
import { contractConfig } from '../../../core/sources/contracts/contract-reports.ts';
import { REFERENCES } from '../../platform/bundle.ts';
import { today } from '../../state/store.ts';
import { useStore } from '../../state/use-store.ts';
import { longDate } from '../../../core/shared/dates.ts';
import { changesCsv } from '../../view/exports.ts';
import { changesText } from '../../view/contracts.ts';
import { folderReports } from '../../state/loading.ts';
import { download } from '../../ui/download.ts';
import { PageHead } from '../../ui/PageHead.tsx';
import { Button, Icon, cx, inputClass, plural } from '../../ui/basics.tsx';
import { EmptyState, Fold, Notice, TABLE } from '../../ui/parts.tsx';
import type { ReactNode } from 'react';
import type { ContractChange } from '../../../core/sources/contracts/contract-changes.ts';
import type { SolusiContract } from '../../../core/sources/contracts/contract-reports.ts';

const SHOWN = 200;

/** A list of the page: the fold of the cards ("New contracts 3"), its table in a box when open (build L5). */
function List({ title, hint, count, startOpen = true, children }: { title: string; hint: string; count: number; startOpen?: boolean; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <Fold title={title} count={count} hint={hint} startOpen={startOpen && count > 0}>
        {count ? <div className="rounded-xl bg-surface shadow-sm ring-1 ring-line max-md:bg-transparent max-md:shadow-none max-md:ring-0">{children}</div> : <p className="text-sm text-muted">None.</p>}
      </Fold>
    </section>
  );
}

function Table({ head, rows, total }: { head: string[]; rows: ReactNode[][]; total: number }) {
  return (
    <>
      <table className={TABLE.table}>
        <thead className={TABLE.head}><tr>{head.map((name) => <th key={name} className={TABLE.th}>{name}</th>)}</tr></thead>
        <tbody className={TABLE.body}>
          {rows.map((row, index) => (
            <tr key={index} className={TABLE.line}>
              {row.map((value, column) => <td key={column} className={TABLE.td}>{column ? <span className={TABLE.label}>{head[column]}: </span> : null}{value}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {total > rows.length && <p className="px-3 py-2 text-sm text-muted">Showing {rows.length} of {total}. Search to narrow the list, or Export for all of them.</p>}
    </>
  );
}

const named = (number: string, name: string, vendor: string): ReactNode => (
  <><span className="font-semibold">{number}</span>{name ? `: ${name}` : ''}<span className="block text-xs text-muted">{vendor || 'No vendor'}</span></>
);
const period = (contract: SolusiContract): string => [contract.start ? `from ${longDate(contract.start)}` : '', contract.end ? `to ${longDate(contract.end)}` : 'no end date'].filter(Boolean).join(' ');

/**
 * Contract changes (version 0.16): what changed between the newest Solusi contract file and the one loaded before it.
 * Not a problem list: nothing is asked and no message is written. It replaces the Excel "Latest Updates Check".
 */
export function ContractChangesPage() {
  const store = useStore();
  const [search, setSearch] = useState('');
  const config = useMemo(() => contractConfig(REFERENCES), []);
  const changes = useMemo(() => (store.solusi ? contractChanges(store.solusiPrevious, store.solusi) : null), [store.solusi, store.solusiPrevious]);
  const information = useMemo(() => (store.solusi && config ? contractInformation(store.solusi.contracts, today(), config) : null), [store.solusi, config]);
  // Nothing to compare: is an earlier Solusi contract file in the folder that was never loaded?
  const [unloaded, setUnloaded] = useState('');
  useEffect(() => {
    let live = true;
    setUnloaded('');
    if (!store.solusi || store.solusiPrevious) return;
    const newest = store.solusi.date;
    void folderReports(30).then(({ files }) => {
      const earlier = files.filter((file) => file.type?.kind === 'solusi' && file.date < newest && file.state !== 'loaded')[0];
      if (live) setUnloaded(earlier ? earlier.date : '');
    });
    return () => { live = false; };
  }, [store.solusi, store.solusiPrevious]);
  const needle = search.trim().toLowerCase();
  const has = (...values: string[]): boolean => !needle || values.join(' ').toLowerCase().indexOf(needle) >= 0;

  if (!store.solusi || !changes) {
    return (
      <section aria-label="Contract changes" className="min-w-0 space-y-4">
        <PageHead title="Contract changes" text="What changed since the last Solusi contract file." />
        <EmptyState icon="contract" title="No contract file yet" text="Load a Solusi contract file with More, then Choose reports." />
      </section>
    );
  }
  const contractRows = (contracts: SolusiContract[]): ReactNode[][] => contracts.filter((contract) => has(contract.number, contract.name, contract.vendor, contract.status))
    .map((contract) => [named(contract.number, contract.name, contract.vendor), contract.status || 'No status', period(contract), contract.owner || 'No contract owner']);
  const changeRows = (list: ContractChange[], withField: boolean): ReactNode[][] => list.filter((change) => has(change.number, change.name, change.vendor, change.what, change.before, change.after))
    .map((change) => [named(change.number, change.name, change.vendor), ...(withField ? [change.what] : []), <span className="text-muted">{change.before}</span>, <b className="font-semibold">{change.after}</b>]);
  const added = contractRows(changes.added);
  const left = contractRows(changes.left);
  const status = changeRows(changes.status, false);
  const fields = changeRows(changes.fields, true);
  const total = changes.added.length + changes.left.length + changes.status.length + changes.fields.length;
  const contractHead = ['Contract', 'Status', 'Runs', 'Contract owner'];
  const ending = information?.ending ?? [];
  const longest = ending[ending.length - 1];
  const shortest = ending.length > 1 ? ending[0] : undefined;
  const soon = (longest?.contracts ?? []).filter((contract) => has(contract.number, contract.name, contract.vendor));

  return (
    <section aria-label="Contract changes" className="min-w-0 space-y-4">
      <PageHead title="Contract changes"
        text={changesText(changes.to, changes.from, total, unloaded)}>
        <Button disabled={!total} onClick={() => download(changesCsv(changes), `Contract changes ${changes.to}`)}><Icon name="export" />Export</Button>
      </PageHead>

      {information && (
        <Notice kind="info"><div className="space-y-1">
          {longest && <p>{plural(longest.contracts.length, 'Concluded contract')} {longest.contracts.length === 1 ? 'ends' : 'end'} in the next {longest.days} days{shortest ? `, ${shortest.contracts.length} of them in the next ${shortest.days}` : ''} (counted from today).</p>}
          <p>{plural(information.noDailyResponsible.length, 'running contract')} {information.noDailyResponsible.length === 1 ? 'has' : 'have'} no daily responsible. For information: nobody is asked.</p>
        </div></Notice>
      )}

      {changes.from && <>
        <div className="relative max-w-xs">
          <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted" />
          <input type="search" aria-label="Search in the changes" placeholder="Search in the changes" value={search} onChange={(event) => setSearch(event.target.value)} className={cx(inputClass, 'pl-9')} />
        </div>
        <List title="New contracts" hint="In this file, not in the one before." count={added.length}>
          <Table head={contractHead} rows={added.slice(0, SHOWN)} total={added.length} />
        </List>
        <List title="Contracts that left" hint="In the file before, not in this one." count={left.length}>
          <Table head={contractHead} rows={left.slice(0, SHOWN)} total={left.length} />
        </List>
        <List title="Status changes" hint="The status in Solusi changed." count={status.length}>
          <Table head={['Contract', 'Before', 'Now']} rows={status.slice(0, SHOWN)} total={status.length} />
        </List>
        <List title="Changed fields" hint="Each field with the value before and now." count={fields.length}>
          <Table head={['Contract', 'Field', 'Before', 'Now']} rows={fields.slice(0, SHOWN)} total={fields.length} />
        </List>
      </>}

      {longest && longest.contracts.length > 0 && (
        <List title={`Ending in the next ${longest.days} days`} hint="Concluded contracts, soonest first. For information." count={soon.length} startOpen={false}>
          <Table head={['Contract', 'Ends', 'Contract owner', 'Procurement partner']} total={soon.length}
            rows={soon.slice(0, SHOWN).map((contract) => [named(contract.number, contract.name, contract.vendor), longDate(contract.end), contract.owner || 'No contract owner', contract.procurementPartner || 'Nobody'])} />
        </List>
      )}
    </section>
  );
}
