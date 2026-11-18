import { useEffect, useMemo, useRef, useState } from 'react';
import { REPORT_TYPES } from '../../../core/sources/report-types.ts';
import { runFileName } from '../../../core/memory/finder.ts';
import { folderReports, loadFiles, loadFolderReports, removeLoad, runChecksAgain } from '../../state/loading.ts';
import { latestRun, localTime, today, update } from '../../state/store.ts';
import { datesInText } from '../../../core/shared/dates.ts';
import { useStore } from '../../state/use-store.ts';
import { changedAfterChecks, changedAfterChecksText, reportTiles, reportsLine } from '../../view/tiles.ts';
import { cardTotals } from '../../view/cards.ts';
import type { CardSummary } from '../../view/cards.ts';
import type { Mode } from '../../state/store.ts';
import type { FolderReport } from '../../state/loading.ts';
import type { ReportTile } from '../../view/tiles.ts';
import { Button, Chip, Dialog, Icon, IconButton, Why, cx, shortDate } from '../../ui/basics.tsx';
import type { ReportKind } from '../../../core/sources/report-types.ts';


/** Opens the file dialog: one or more .csv and .xlsx files. */
export function BrowseButton({ label = 'Browse', kind = 'secondary', onPicked }: { label?: string; kind?: 'primary' | 'secondary' | 'ghost'; onPicked?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={input} type="file" accept=".csv,.xlsx" multiple hidden onChange={async (event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (!files.length) return;
        onPicked?.();
        await loadFiles(files);
      }} />
      <Button kind={kind} onClick={() => input.current?.click()} data-tip="Pick .csv or .xlsx files"><Icon name="folder" />{label}</Button>
    </>
  );
}

function RemoveDialog({ tile, onClose }: { tile: ReportTile; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title="Remove this report?" onClose={onClose} actions={<>
      <Button kind="ghost" onClick={onClose}>Cancel</Button>
      <Button kind="danger" disabled={busy} onClick={() => { setBusy(true); void removeLoad(tile.type.kind).then(onClose); }}><Icon name="remove" />Remove</Button>
    </>}>
      <p>For a wrong file: <b className="break-all">{tile.load?.file}</b> (report of {shortDate(tile.load?.date ?? '')}) is taken out of the screens.</p>
      <p className="text-muted">Nothing is deleted: the load moves to the archive folder and the history records it. The cases are worked out again from the loads that stay.</p>
    </Dialog>
  );
}

function Tile({ tile, mode, onRemove }: { tile: ReportTile; mode: Mode; onRemove: () => void }) {
  const load = tile.load;
  return (
    <div className={cx('flex flex-col gap-1.5 rounded-xl bg-surface p-4 shadow-sm ring-1',
      tile.stale ? 'ring-amber-line' : 'ring-line')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{tile.type.label}</h3>
          <p className="text-xs text-muted">{tile.type.hint}</p>
        </div>
        {load ? (tile.stale
          ? <Chip tone="amber" icon="warn" title="Older than the number of days set in Settings">{tile.ageDays} days old</Chip>
          : <Chip tone="green" icon="check">Loaded</Chip>)
          : <Chip icon="nottested">Missing</Chip>}
      </div>
      {load ? (
        <>
          <p className="text-sm font-semibold break-all">{load.file}</p>
          <p className="text-xs text-muted">
            Report of <b>{shortDate(load.date)}</b>{load.loadedByName ? <> · loaded by {load.loadedByName}, {localTime(load.loadedAt)}</> : mode === 'folder' ? ' · loaded by an earlier version' : ' · loaded just now, not saved'}
          </p>
          <p className="text-xs text-ink">{load.summary}</p>
          {load.details.map((line) => <p key={line} className="text-xs text-muted">{datesInText(line)}</p>)}
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {tile.type.kind === 'ci' && <Button kind="ghost" small data-tip="The verification record of this report" onClick={() => update({ view: 'audit', auditTab: 'verification', auditRun: runFileName(load.date, load.file), openCi: '' })}><Icon name="file" className="size-3.5" />Record</Button>}
            {tile.type.kind === 'solusi' && <Button kind="ghost" small data-tip="The contract changes since the file before" onClick={() => update({ view: 'contracts', openCi: '' })}><Icon name="changes" className="size-3.5" />Changes</Button>}
            <Button kind="ghost" small data-tip="Remove this load: the window asks first" onClick={onRemove}><Icon name="remove" className="size-4" />Remove</Button>
          </div>
        </>
      ) : <p className="text-xs text-muted">No {tile.type.label} is loaded yet. Use <i>Choose reports</i> at the top.</p>}
    </div>
  );
}

/**
 * The Reports line (F26, version 0.30): one line under the title of My day, "Reports 5 reports · 12 Nov · fresh" and Show.
 * It opens by itself when a report is missing, old, or changed after the checks ran. The message of the last load shows
 * with the tiles, or by itself when a file was not loaded (the toast "Reports loaded" has Details).
 */
export function ReportsStrip({ cards }: { cards: CardSummary[] }) {
  const store = useStore();
  const run = latestRun();
  const tiles = useMemo(() => reportTiles(run, store.relationship, today(), store.settings.staleDays || 3, store.epo, store.epoPrevious, store.solusi, store.contracts, store.solusiPrevious, cardTotals(cards)), [run, store.relationship, store.settings.staleDays, store.epo, store.epoPrevious, store.solusi, store.contracts, store.solusiPrevious, cards]);
  const changedText = changedAfterChecksText(changedAfterChecks(run, store.relationship, store.epo, store.solusi, store.contracts));
  const line = reportsLine(tiles, changedText, shortDate, (at) => localTime(at));
  // The manager's Show or Hide wins; until then the line opens by itself only when something needs a look.
  const open = store.reportsShown ?? line.opens;
  const [rerunning, setRerunning] = useState(false);
  const [removing, setRemoving] = useState<ReportKind | ''>('');
  const tile = tiles.filter((item) => item.type.kind === removing)[0];
  return (
    <section aria-labelledby="reports-title" className="space-y-2.5">
      <div className={cx('flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1 text-sm', line.opens && 'rounded-lg bg-amber-soft px-3 py-1 text-amber ring-1 ring-inset ring-amber-line')} data-reports-line>
        <h2 id="reports-title" className="font-semibold whitespace-nowrap text-ink">Reports</h2>
        <span className={cx('whitespace-nowrap', !line.opens && 'text-muted')} data-tip={line.tip}>{line.text}</span>
        {line.warning && <span className="font-semibold text-amber"><Icon name="warn" className="mr-1 inline size-3.5" />{line.warning}</span>}
        <Button kind="ghost" small aria-expanded={open} aria-controls="report-tiles" onClick={() => update({ reportsShown: !open })}>{open ? 'Hide' : 'Show'}<Icon name={open ? 'down' : 'right'} className="size-3.5" /></Button>
      </div>
      {open && (
        <div id="report-tiles" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((item) => <Tile key={item.type.kind} tile={item} mode={store.mode} onRemove={() => setRemoving(item.type.kind)} />)}
        </div>
      )}
      {changedText && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-soft px-4 py-2.5 text-sm text-amber ring-1 ring-amber-line">
          <Icon name="warn" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{changedText}</span>
          <Button kind="secondary" small disabled={rerunning} data-tip="Run the checks again with the reports loaded now" onClick={() => { setRerunning(true); void runChecksAgain().finally(() => setRerunning(false)); }}>{rerunning ? 'Checking' : 'Check again'}</Button>
        </div>
      )}
      {store.loadMessages.length > 0 && (open || store.loadNeedsLook) && (
        <div role="status" className="relative rounded-xl bg-blue-soft px-4 py-3 pr-10 text-sm text-blue ring-1 ring-blue-line" data-load-message>
          <ul className="list-disc space-y-1 pl-4">{store.loadMessages.map((text, index) => <li key={index}>{text}</li>)}</ul>
          <IconButton icon="close" label="Close" className="absolute top-1.5 right-1.5" onClick={() => update({ loadMessages: [], loadNeedsLook: false })} />
        </div>
      )}
      {tile && tile.load && <RemoveDialog tile={tile} onClose={() => setRemoving('')} />}
    </section>
  );
}

/** "Choose reports": the report files found in the folder, with their date, type and whether they are loaded. Also Browse. */
export function PickReportsDialog({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [limit, setLimit] = useState(20);
  const [found, setFound] = useState<{ files: FolderReport[]; more: number } | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void folderReports(limit).then((result) => {
      if (!live) return;
      setFound(result);
      // Ticked at first: the newest file of each type, when it is not loaded yet.
      const first = new Set<string>();
      for (const type of REPORT_TYPES) {
        const newest = result.files.filter((file) => file.type?.kind === type.kind)[0];
        if (newest && !newest.state) first.add(newest.path);
      }
      setTicked((before) => (before.size ? before : first));
    });
    return () => { live = false; };
  }, [limit, store.runs, store.relationship, store.epo, store.solusi, store.contracts]);
  const toggle = (path: string): void => { const next = new Set(ticked); if (next.has(path)) next.delete(path); else next.add(path); setTicked(next); };
  const chosen = (found?.files ?? []).filter((file) => ticked.has(file.path) && file.type);
  const load = async (): Promise<void> => { setBusy(true); await loadFolderReports(chosen, store.mode === 'demo'); setBusy(false); onClose(); };
  const fileName = (path: string): string => path.split('/').pop() ?? path;
  return (
    <Dialog title="Choose reports" wide onClose={onClose} actions={<>
      <div className="mr-auto"><BrowseButton kind="ghost" label="Choose files" onPicked={onClose} /></div>
      {!chosen.length && found && <Why>Tick a report to load</Why>}
      <Button kind="ghost" onClick={onClose}>Cancel</Button>
      <Button kind="primary" disabled={!chosen.length || busy} onClick={() => void load()}><Icon name="load" />{busy ? 'Loading' : chosen.length ? `Load ${chosen.length}` : 'Load'}</Button>
    </>}>
      <p className="text-muted" data-tip="The type is recognised from the columns, not from the file name">
        {store.mode === 'folder' ? 'The report files of the team folder, newest first.' : 'The report files you can load, newest first.'}
      </p>
      {!found ? <p className="text-muted">Reading the folder</p> : !found.files.length ? (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-3 text-muted">No .csv or .xlsx file found here. Use <i>Choose files</i>.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
          {found.files.map((file) => (
            <li key={file.path}>
              <label className={cx('flex items-center gap-3 px-3 py-2', file.type ? 'cursor-pointer hover:bg-surface-2' : 'opacity-80')} data-tip={file.path}>
                <input type="checkbox" className="size-[18px] shrink-0 accent-accent" disabled={!file.type} checked={ticked.has(file.path) && !!file.type} onChange={() => toggle(file.path)} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold break-all">{fileName(file.path)}</span>
                  {!file.type && <span className="block text-xs text-red">{file.message}</span>}
                </span>
                {file.type ? <Chip tone="blue">{file.type.label}</Chip> : <Chip tone="red">Not a known report</Chip>}
                <span className="text-xs whitespace-nowrap text-muted" data-tip={file.dateFrom === 'name' ? 'The date in the file name' : 'The date the file last changed'}>{shortDate(file.date)}</span>
                {file.state === 'loaded' && <Chip tone="green" icon="check">Loaded</Chip>}
                {file.state === 'removed' && <Chip tone="amber">Removed</Chip>}
              </label>
            </li>
          ))}
        </ul>
      )}
      {found && found.more > 0 && <Button kind="ghost" small onClick={() => setLimit(limit + 20)} data-tip={`Show ${Math.min(20, found.more)} older files`}>Older files<Icon name="down" className="size-3.5" /></Button>}
      <p className="text-xs text-muted">A file loaded again replaces its earlier load. Older loads stay in the history.</p>
    </Dialog>
  );
}
