import { useMemo, useState } from 'react';
import { auditCsvFiles, csvText, auditSummary, exceptionLines, exceptionStateWord, exceptionsCsv, monthPeriod, quarterPeriod, testedText, verificationCsv, verificationRecord } from '../../../core/audit/audit.ts';
import { runFileName } from '../../../core/memory/finder.ts';
import { longDate } from '../../../core/shared/dates.ts';
import { loadersOf } from '../../../core/team/team.ts';
import { EVIDENCE_COLUMNS, agreeingWithEpo, epoStatusOf, evidenceRows, marksOf, reviewCaseKey, reviewProgress } from '../../../core/audit/lifecycle-review.ts';
import { reviewConfig } from '../../../core/cases/inventory.ts';
import { systemsById } from '../../../core/sources/epo/epo-report.ts';
import { CHECK_PACKS, REFERENCES } from '../../platform/bundle.ts';
import { endException, previousRun, readHistory } from '../../state/audit.ts';
import { markReview, markSameAsEpo, startLifecycleReview } from '../../state/review.ts';
import { latestRun, localDay, localTime, state, toast, today, update } from '../../state/store.ts';
import { useStore } from '../../state/use-store.ts';
import { downloadText } from '../../ui/download.ts';
import { ExceptionDialog } from '../../ui/ExceptionDialog.tsx';
import type { AuditTab } from '../../state/store.ts';
import { ConfirmDialog } from '../../ui/ConfirmDialog.tsx';
import { PageHead } from '../../ui/PageHead.tsx';
import { Button, Chip, Field, Icon, cx, inputClass, plural, yearDate } from '../../ui/basics.tsx';
import { Tabs } from '../../ui/parts.tsx';
import type { AuditSummary, ExceptionLine, Period } from '../../../core/audit/audit.ts';
import type { Review, ReviewItem } from '../../../core/audit/lifecycle-review.ts';

const labelOf = (checkId: string): string => (checkId === '*' ? 'Every check' : CHECK_PACKS.filter((pack) => pack.id === checkId)[0]?.cardLabel ?? checkId);
const CLASS_WORD: Record<string, string> = { business_service: 'Business Service', service_offering: 'Service Offering', service_instance: 'Service Instance' };
const MODULE_WORD: Record<string, string> = { completeness: 'Completeness', correctness: 'Correctness', compliance: 'Compliance' };

/** A list of the page: as wide as its longest choice, not as wide as the page. */
const SELECT = cx(inputClass.replace('w-full ', ''), 'w-auto');
const box = 'rounded-xl bg-surface p-4 shadow-sm ring-1 ring-line print:shadow-none print:ring-0 print:p-0';
const th = 'py-2 pr-3 font-semibold whitespace-nowrap';
const td = 'py-1.5 pr-3 align-top';
/** One width for each kind of column in every table of the page (F43): a date, a name, a number. */
const COL = { date: 'w-32 whitespace-nowrap', name: 'w-44', num: 'w-24 text-right tabular-nums whitespace-nowrap', text: '' };
const colOf = (head: string): keyof typeof COL =>
  (/date|first seen|review on/i.test(head) ? 'date'
    : /^(verifier|by|decided by|checked by|person asked)$/i.test(head) ? 'name'
      : /^(to solve|other|new|verified|findings|cis|number|age \(days\))$/i.test(head) ? 'num' : 'text');
const formal = (text: string): string => text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (date) => longDate(date));

/** The Audit page: the verification record of each load, the audit export of a period, and the exceptions. */
export function AuditPage() {
  const store = useStore();
  const tabs: Array<{ id: AuditTab; label: string }> = [
    { id: 'verification', label: 'Record' }, { id: 'export', label: 'Export' }, { id: 'exceptions', label: 'Not followed' }, { id: 'lifecycle', label: 'Lifecycle' }
  ];
  return (
    <section aria-label="Audit" className="min-w-0 space-y-4">
      <div className="print:hidden">
        <PageHead title="Audit" text="What the SACM procedure asks to keep. Record: the verification record of each report (date, verifier, issues found). Export: the audit report of a period (findings, actions taken, open issues). Not followed: what SACM decided not to follow up. Lifecycle: the lifecycle review with its evidence file." />
      </div>
      <div className="print:hidden"><Tabs label="Parts of Audit" value={store.auditTab} onChange={(id) => update({ auditTab: id })} tabs={tabs} /></div>
      {store.auditTab === 'verification' ? <VerificationPart /> : store.auditTab === 'export' ? <ExportPart /> : store.auditTab === 'lifecycle' ? <LifecyclePart /> : <ExceptionsPart />}
    </section>
  );
}

function VerificationPart() {
  const store = useStore();
  const runs = store.runs.slice().sort((a, b) => b.date.localeCompare(a.date) || a.report.localeCompare(b.report));
  const run = runs.filter((item) => runFileName(item.date, item.report) === store.auditRun)[0] ?? latestRun();
  const record = useMemo(() => {
    if (!run) return null;
    const first = loadersOf(store.events, runFileName(run.date, run.report)).first;
    const verifier = first ? { name: first.byName || first.by, at: first.at } : run.loadedByName ? { name: run.loadedByName, at: run.loadedAt ?? '' } : null;
    return verificationRecord(run, previousRun(run), CHECK_PACKS, verifier);
  }, [run, store.events, store.runs]);
  if (!run || !record) return <p className={box}>No CI report is loaded yet. Load one first: its verification record is made from it.</p>;
  const modules = ['completeness', 'correctness', 'compliance'];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select aria-label="Report" className={SELECT} value={runFileName(run.date, run.report)} onChange={(event) => update({ auditRun: event.target.value })}>
          {runs.map((item) => <option key={runFileName(item.date, item.report)} value={runFileName(item.date, item.report)}>{yearDate(item.date)} · {item.report}</option>)}
        </select>
        <Button small onClick={() => window.print()}><Icon name="print" className="size-3.5" />Print</Button>
        <Button small onClick={() => downloadText(verificationCsv(record), `${record.date}_verification-record.csv`)}><Icon name="export" className="size-3.5" />Export</Button>
        <span className="text-xs text-muted">Print, then choose "Save as PDF" to keep it as a file.</span>
      </div>
      <article className={cx(box, 'space-y-4')} aria-label="Verification record">
        <header>
          <h2 className="text-lg font-semibold">Verification record · report of {longDate(record.date)}</h2>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="inline text-muted">Report: </dt><dd className="inline font-semibold">{record.report}{record.relationshipReport ? ` (with ${record.relationshipReport})` : ''}</dd></div>
            <div><dt className="inline text-muted">Verifier: </dt><dd className="inline font-semibold">{record.verifier || 'not known (loaded by an earlier version)'}{record.loadedAt ? `, ${localTime(record.loadedAt, true)}` : ''}</dd></div>
            <div><dt className="inline text-muted">CIs in the report: </dt><dd className="inline font-semibold">{record.cis.toLocaleString('en-GB')}</dd></div>
            <div><dt className="inline text-muted">Compared with: </dt><dd className="inline font-semibold">{formal(record.previous) || 'no earlier report in the active memory, so nothing is counted as new or verified'}</dd></div>
          </dl>
          <p className="mt-2 text-sm">Issues found: <b>{record.totals.toSolve.toLocaleString('en-GB')} to solve</b>, {record.totals.other.toLocaleString('en-GB')} other findings (waiting, known, to check). New since the last report: <b>{record.totals.newSince}</b>. Verified since the last report: <b>{record.totals.verifiedSince}</b>.</p>
        </header>
        {modules.map((module) => {
          const checks = record.checks.filter((check) => check.module === module);
          if (!checks.length) return null;
          return (
            <div key={module} className="overflow-x-auto">
              <h3 className="text-sm font-semibold text-ink">{MODULE_WORD[module]}</h3>
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted"><tr className="border-b border-line">
                  {['Check', 'Tested', 'To solve', 'Other', 'New', 'Verified', 'Not tested, and why'].map((head) => <th key={head} className={cx(th, COL[colOf(head)])}>{head}</th>)}
                </tr></thead>
                <tbody>
                  {checks.map((check) => (
                    <tr key={check.checkId} className="border-b border-line">
                      <td className={cx(td, 'font-semibold')}>{check.label}</td>
                      <td className={cx(td, 'whitespace-nowrap')}>{check.wasTested ? testedText(check) : '–'}</td>
                      <td className={cx(td, COL.num)}>{check.toSolve ? <>{check.toSolve} <span className="text-xs text-muted">({plural(check.toSolveCis, 'CI')})</span></> : 0}</td>
                      <td className={cx(td, COL.num)}>{check.other}</td>
                      <td className={cx(td, COL.num)}>{check.newSince}</td>
                      <td className={cx(td, COL.num)}>{check.verifiedSince}</td>
                      <td className={cx(td, 'text-xs text-muted')}>{formal(check.notTested.join(' '))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        {record.general.length > 0 && (
          <div><h3 className="text-sm font-semibold text-ink">Notes on the load</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">{record.general.map((note) => <li key={note}>{formal(note)}</li>)}</ul></div>
        )}
        <p className="text-xs text-muted">The lifecycle review is kept under Lifecycle on this page.</p>
        <p className="text-xs text-muted">Made by the SACM Workbench on {longDate(today())} from the run saved in the team folder.</p>
      </article>
    </div>
  );
}

type PeriodKind = 'month' | 'quarter' | 'dates';

function ExportPart() {
  const store = useStore();
  const now = today();
  const [kind, setKind] = useState<PeriodKind>('month');
  const [month, setMonth] = useState(now.slice(0, 7));
  const [from, setFrom] = useState(`${now.slice(0, 7)}-01`);
  const [to, setTo] = useState(now);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const period: Period = kind === 'month' ? monthPeriod(month) : kind === 'quarter' ? quarterPeriod(`${month}-01`) : { from, to };
  const make = async (): Promise<void> => {
    if (period.from > period.to) { toast('The first date is after the last one.'); return; }
    setBusy(true);
    try {
      const history = await readHistory();
      setSummary(auditSummary({ period, runs: history.runs, events: history.events, replies: history.replies, packs: CHECK_PACKS, today: now, notes: history.notes }));
    } finally { setBusy(false); }
  };
  const files = summary ? auditCsvFiles(summary, labelOf) : null;
  const stem = summary ? `audit_${summary.period.from}_${summary.period.to}` : '';
  return (
    <div className="space-y-4">
      <div className={cx(box, 'flex flex-wrap items-end gap-3 print:hidden')}>
        <Field label="Period">
          <select className={SELECT} value={kind} onChange={(event) => setKind(event.target.value as PeriodKind)}>
            <option value="month">A month</option><option value="quarter">A quarter</option><option value="dates">Two dates</option>
          </select>
        </Field>
        {kind !== 'dates' ? (
          <Field label={kind === 'month' ? 'Month' : 'A month of the quarter'}><input type="month" className={cx(inputClass, 'w-auto')} value={month} onChange={(event) => setMonth(event.target.value)} /></Field>
        ) : <>
          <Field label="From"><input type="date" className={cx(inputClass, 'w-auto')} value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
          <Field label="To"><input type="date" className={cx(inputClass, 'w-auto')} value={to} onChange={(event) => setTo(event.target.value)} /></Field>
        </>}
        <Button kind="primary" disabled={busy} onClick={() => void make()}><Icon name="export" />{busy ? 'Reading' : 'Export'}</Button>
        <p className="w-full text-xs text-muted">{yearDate(period.from)} to {yearDate(period.to)}. Reads every report and journal in the team folder, the archive too, so it also covers cases that have left the screen. {store.mode === 'files' ? 'Report files only: nothing was saved, so there is little to export.' : ''}</p>
      </div>
      {summary && files && (
        <>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button small onClick={() => window.print()}><Icon name="print" className="size-3.5" />Print</Button>
            {Object.keys(files).map((name) => <Button key={name} small onClick={() => downloadText(files[name]!, `${stem}_${name}`)}><Icon name="export" className="size-3.5" />{name}</Button>)}
          </div>
          <AuditReport summary={summary} />
        </>
      )}
    </div>
  );
}

function AuditReport({ summary }: { summary: AuditSummary }) {
  const toSolveOpen = summary.open.filter((row) => row.state === 'open' && !row.exception);
  const oldest = toSolveOpen.slice(0, 15);
  return (
    <article className={cx(box, 'space-y-4')} aria-label="Audit summary">
      <header>
        <h2 className="text-lg font-semibold">SACM audit report · {longDate(summary.period.from)} to {longDate(summary.period.to)}</h2>
        <p className="mt-1 text-sm">{plural(summary.loads.length, 'report')} checked · {summary.found.reduce((sum, row) => sum + row.findings, 0).toLocaleString('en-GB')} findings to solve · {plural(summary.actions.length, 'action')} · {plural(summary.verified.length, 'case')} verified{summary.verified.length ? ` (on average in ${summary.days.average} days, the longest ${summary.days.longest})` : ''} · {plural(toSolveOpen.length, 'case')} still to solve · {plural(summary.exceptions.length, 'decision')} not to follow up</p>
        {summary.notes.map((note) => <p key={note} className="mt-1 text-xs text-amber">{note}</p>)}
      </header>
      <Part title="Verification records (reports checked)">
        <Table head={['Report date', 'Report', 'Verifier', 'To solve']} rows={summary.loads.map((load) => [yearDate(load.date), load.report, load.verifier, load.toSolve.toLocaleString('en-GB')])} empty="No report in this period." />
      </Part>
      <Part title="Findings to solve, per check">
        <Table head={['Check', 'Findings', 'CIs', 'New']} rows={summary.found.map((row) => [row.check, String(row.findings), String(row.cis), String(row.newInPeriod)])} empty="Nothing to solve was found." />
      </Part>
      <Part title="Actions taken">
        <Table head={['Action', 'Number']} rows={summary.actionCounts.map((row) => [row.action, String(row.count)])} empty="No action in this period." />
        <p className="text-xs text-muted">Every action with who and when is in actions.csv.</p>
      </Part>
      <Part title="Still to solve at the end of the period, oldest first">
        <Table head={['CI', 'Check', 'First seen', 'Age (days)', 'Person asked']} rows={oldest.map((row) => [row.ciName, row.check, yearDate(row.firstSeen), String(row.ageDays), row.contact])} empty="Nothing left to solve." />
        {toSolveOpen.length > oldest.length && <p className="text-xs text-muted">The {oldest.length} oldest of {toSolveOpen.length}; all are in open.csv.</p>}
      </Part>
      <Part title="Not followed up (SACM decisions)">
        <Table head={['CI', 'Check', 'Reason', 'By', 'Review on', 'State']} rows={summary.exceptions.slice(0, 30).map((line) => [line.ciName, labelOf(line.checkId), line.reason, line.byName, line.reviewOn ? yearDate(line.reviewOn) : 'none', exceptionStateWord(line)])} empty="None." />
      </Part>
      <p className="text-xs text-muted">Made by the SACM Workbench on {longDate(today())} from the reports, journals and archive of the team folder.</p>
    </article>
  );
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-1.5 break-inside-avoid"><h3 className="text-sm font-semibold text-ink">{title}</h3>{children}</section>;
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted"><tr className="border-b border-line">{head.map((cell) => <th key={cell} className={cx(th, COL[colOf(cell)])}>{cell}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index} className="border-b border-line">{row.map((cell, at) => <td key={at} className={cx(td, COL[colOf(head[at] ?? '')])}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function ExceptionsPart() {
  const store = useStore();
  const [adding, setAdding] = useState(false);
  const [show, setShow] = useState<'running' | 'all'>('running');
  const facts = useMemo(() => new Map(store.cases.map((item) => [item.key, item.fact])), [store.cases]);
  const lines = useMemo(() => exceptionLines(store.events, facts, today()), [store.events, facts]);
  const shown = show === 'running' ? lines.filter((line) => line.state === 'running') : lines;
  const [ending, setEnding] = useState<ExceptionLine | null>(null);
  const ended = (line: ExceptionLine): void => setEnding(line);
  return (
    <div className="space-y-4">
      {ending && (
        <ConfirmDialog title={`Follow ${ending.ciName} again?`} confirm="Follow again" onClose={() => setEnding(null)}
          onConfirm={() => { const line = ending; void endException(line.event, line.target).then(() => toast(`${line.ciName} is followed up again from today.`)); }}>
          <p>From today its {ending.standing ? 'findings are' : 'case is'} to solve again.</p>
        </ConfirmDialog>
      )}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select aria-label="Which ones" className={SELECT} value={show} onChange={(event) => setShow(event.target.value as 'running' | 'all')}>
          <option value="running">Not followed up now</option><option value="all">All, also the ones followed up again</option>
        </select>
        <Button small kind="primary" disabled={state.mode === 'files' && !state.user.email} onClick={() => setAdding(true)}><Icon name="plus" className="size-3.5" />Add CI</Button>
        <Button small onClick={() => downloadText(exceptionsCsv(shown, labelOf), `${today()}_not-followed-up.csv`)} disabled={!shown.length}><Icon name="export" className="size-3.5" />Export</Button>
        <Button small onClick={() => window.print()}><Icon name="print" className="size-3.5" />Print</Button>
      </div>
      <article className={box} aria-label="Not followed up">
        <h2 className="text-lg font-semibold">Not followed up</h2>
        <p className="mb-3 text-sm text-muted">{plural(lines.filter((line) => line.state === 'running').length, 'decision')} not to follow up. On the review date the case is to solve again. Criticality exceptions are not here: the owner requests them in the Service Portal, and the report shows them.</p>
        {!shown.length ? <p className="text-sm text-muted">Nothing {show === 'running' ? 'is set aside now' : 'yet'}. Choose Stop following on a case, or Add CI here.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr className="border-b border-line">
                <th className={th}>CI</th><th className={th}>Check</th><th className={th}>Reason</th><th className={cx(th, COL.name)}>Decided by</th><th className={cx(th, COL.date)}>Review on</th><th className={th}>State</th><th className={cx(th, 'print:hidden')} />
              </tr></thead>
              <tbody>
                {shown.map((line) => (
                  <tr key={`${line.target}|${line.event.id}`} className="border-b border-line">
                    <td className={td}>
                      <button type="button" className="font-semibold hover:underline" onClick={() => line.ciKey && store.cases.some((item) => item.fact.ciKey === line.ciKey) && update({ openCi: line.ciKey })}>{line.ciName}</button>
                      {line.standing && <span className="ml-1"><Chip tone="blue">entered for the CI</Chip></span>}
                    </td>
                    <td className={td}>{labelOf(line.checkId)}</td>
                    <td className={td}>{line.reason}{line.note && <span className="block text-xs text-muted">{line.note}</span>}</td>
                    <td className={cx(td, COL.name)}>{line.byName}<span className="block text-xs text-muted">{localDay(line.at, true)}</span></td>
                    <td className={cx(td, COL.date)}>{line.reviewOn ? yearDate(line.reviewOn) : <Chip tone="amber">none</Chip>}</td>
                    <td className={td}><Chip tone={line.state === 'running' ? 'green' : 'grey'}>{exceptionStateWord(line)}</Chip></td>
                    <td className={cx(td, 'print:hidden')}>{line.state === 'running' && <Button small kind="ghost" onClick={() => ended(line)}><Icon name="undo" className="size-3.5" />Follow again</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {lines.some((line) => line.legacy && line.state === 'running') && <p className="mt-2 text-xs text-amber">Some were "Waived" before version 0.12, without a reason or review date. Open the case and choose "Not followed up" again to give them one.</p>}
      </article>
      {adding && <ExceptionDialog keys={[]} standing title="Add a CI not to follow up" onClose={() => setAdding(false)} />}
    </div>
  );
}

/** The lifecycle review (instruction 2.13): a sample drawn once on the button, compared with EPO by hand, and its evidence file. */
function LifecyclePart() {
  const store = useStore();
  const config = reviewConfig(REFERENCES);
  const reviews = store.reviews;
  const [chosen, setChosen] = useState('');
  const [show, setShow] = useState<'all' | 'todo'>('all');
  const [busy, setBusy] = useState(false);
  const review: Review | null = reviews.filter((item) => item.id === chosen)[0] ?? reviews[reviews.length - 1] ?? null;
  const marks = useMemo(() => (review ? marksOf(review, store.events) : new Map()), [review, store.events]);
  const systems = useMemo(() => (store.epo ? systemsById(store.epo.systems) : null), [store.epo]);
  const [askNew, setAskNew] = useState(false);
  const begin = async (sure = false): Promise<void> => {
    if (!sure && review) { setAskNew(true); return; }
    setBusy(true);
    try {
      const why = await startLifecycleReview();
      if (why) toast(why); else { setChosen(''); toast('The sample is drawn and saved in the team folder.'); }
    } finally { setBusy(false); }
  };
  if (!config) return <p className={box}>The reference data of the lifecycle review is missing (reference/lifecycle).</p>;
  const startButton = <><Button kind={review ? 'secondary' : 'primary'} small={!!review} disabled={busy || !store.savedRuns.length} onClick={() => void begin()}><Icon name="review" className={review ? 'size-3.5' : 'size-4'} />New review</Button>{askNew && (
    <ConfirmDialog title="Start a new review?" confirm="New review" onClose={() => setAskNew(false)} onConfirm={() => void begin(true)}>
      <p>{review && reviewProgress(review, marks).checked < review.items.length ? 'The review on the screen is not finished. ' : ''}A new sample is drawn from the latest CI report. The old review is kept, with its answers.</p>
    </ConfirmDialog>
  )}</>;
  if (!review) {
    return (
      <div className={cx(box, 'space-y-3')}>
        <h2 className="text-lg font-semibold">Lifecycle review</h2>
        <p className="text-sm text-muted">The SACM instruction asks, twice a year, to compare the status of a sample of CIs with EPO and to keep the evidence. The button draws {config.sample} CIs by chance from the latest CI report and {config.underRetirement} of the CIs in status {config.underRetirementStatus}, only from the classes EPO holds ({config.classes.map((id) => CLASS_WORD[id] ?? id.replace(/_/g, ' ')).join(', ')}). The sample is saved in the team folder, so every manager sees the same list. Nothing starts on its own.</p>
        {startButton}
        {!store.savedRuns.length && <p className="text-xs text-muted">Load a CI report first: the sample is drawn from it.</p>}
        {store.mode === 'files' && <p className="text-xs text-amber">Report files only: nothing is saved, so the review is lost when you close the page. Choose the team folder to keep it.</p>}
      </div>
    );
  }
  const progress = reviewProgress(review, marks);
  const differs = review.items.filter((item) => config.opensCase.indexOf(marks.get(item.ciKey)?.result ?? '') >= 0).length;
  const shown = review.items.filter((item) => show === 'all' || !marks.has(item.ciKey));
  const agree = agreeingWithEpo(review, marks, systems);
  const evidence = (): void => downloadText(csvText(EVIDENCE_COLUMNS, evidenceRows(review, marks, store.cases, config, systems)), `${review.id}_evidence.csv`);
  const part = (group: ReviewItem['group'], title: string) => {
    const rows = shown.filter((item) => item.group === group);
    const all = review.items.filter((item) => item.group === group);
    if (!all.length) return null;
    return (
      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold text-ink">{title} · {all.filter((item) => marks.has(item.ciKey)).length} of {all.length} checked</h3>
        {!rows.length ? <p className="text-sm text-muted">All checked.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr className="border-b border-line">
                <th className={th}>CI</th><th className={th}>EPO ID</th><th className={th}>Status in ServiceNow</th><th className={th}>Status in EPO</th><th className={th}>In EPO it is</th><th className={th}>Note</th><th className={cx(th, COL.name)}>Checked by</th>
              </tr></thead>
              <tbody>{rows.map((item) => <ReviewRow key={item.ciKey} review={review} item={item} epo={epoStatusOf(item, systems)} hasEpo={!!systems} />)}</tbody>
            </table>
          </div>
        )}
      </section>
    );
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {reviews.length > 1 && (
          <select aria-label="Review" className={SELECT} value={review.id} onChange={(event) => setChosen(event.target.value)}>
            {reviews.slice().reverse().map((item) => <option key={item.id} value={item.id}>Review of {yearDate(item.date)}</option>)}
          </select>
        )}
        <select aria-label="Which CIs" className={SELECT} value={show} onChange={(event) => setShow(event.target.value as 'all' | 'todo')}>
          <option value="all">All CIs of the sample</option><option value="todo">Only the ones not checked yet</option>
        </select>
        {agree.length > 0 && <Button small onClick={() => void markSameAsEpo(review, agree).then((count) => toast(`${plural(count, 'CI')} marked Same in EPO.`))}
          data-tip={`Mark the ${plural(agree.length, 'CI')} that agree with EPO as Same in EPO. From the EPO systems report of ${yearDate(store.epo?.date ?? '')}; only CIs not checked yet.`}><Icon name="fixed" className="size-3.5" />Mark {agree.length} same</Button>}
        <Button small kind="primary" onClick={evidence}><Icon name="export" className="size-4" />Export</Button>
        <Button small onClick={() => window.print()}><Icon name="print" className="size-3.5" />Print</Button>
        <span className="ml-auto">{startButton}</span>
      </div>
      <article className={cx(box, 'space-y-4')} aria-label="Lifecycle review">
        <header>
          <h2 className="text-lg font-semibold">Lifecycle review of {longDate(review.date)}</h2>
          <p className="mt-1 text-sm"><b>{progress.checked} of {progress.total} checked</b>{differs ? ` · ${plural(differs, 'CI')} not the same as in EPO` : ''}. Sample drawn from {review.report} (report of {longDate(review.reportDate)}).</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.checked}>
            <div className="h-full bg-accent" style={{ width: `${progress.total ? Math.round(100 * progress.checked / progress.total) : 0}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted print:hidden">{store.epo ? `Status in EPO comes from the EPO systems report of ${yearDate(store.epo.date)}. Mark the CIs that agree in one click, then check the others by hand. ` : 'Load the EPO systems report to see the status in EPO here. '}Look each CI up in EPO and say what you see. "Not the same" opens a line on the card Lifecycle review: SACM copies the status of EPO or reports the sync, and writes to the owner only when EPO itself looks wrong. Your name and the time are saved with each answer.</p>
        </header>
        {part('sample', 'Sample by chance')}
        {part('under-retirement', `In status ${config.underRetirementStatus}`)}
      </article>
    </div>
  );
}

function ReviewRow({ review, item, epo, hasEpo }: { review: Review; item: ReviewItem; epo: { status: string; words: string }; hasEpo: boolean }) {
  const store = useStore();
  const config = reviewConfig(REFERENCES)!;
  const mark = useMemo(() => marksOf(review, store.events).get(item.ciKey), [review, store.events, item.ciKey]);
  const [note, setNote] = useState(mark?.note ?? '');
  const opened = mark && config.opensCase.indexOf(mark.result) >= 0 ? store.cases.filter((found) => found.key === reviewCaseKey(item.ciKey))[0] : undefined;
  return (
    <tr className="border-b border-line">
      <td className={td}><span className="font-semibold">{item.name}</span><span className="block text-xs text-muted">{item.classLabel}</span></td>
      <td className={td}>{item.epoId || <span className="text-muted">none</span>}</td>
      <td className={td}>{item.status}</td>
      <td className={cx(td, epo.words && epo.status !== item.status && 'font-semibold text-red')}>{epo.words || <span className="text-xs text-muted">{hasEpo ? (item.epoId ? 'not in the EPO report' : 'no EPO ID') : '-'}</span>}</td>
      <td className={td}>
        <div className="flex flex-wrap gap-1 print:hidden">
          {config.results.map((result) => (
            <button key={result.id} type="button" aria-pressed={mark?.result === result.id} onClick={() => void markReview(review, item.ciKey, result.id, note)}
              className="rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ring-line-strong hover:bg-surface-2 aria-pressed:bg-accent-soft aria-pressed:ring-accent">
              {result.label}
            </button>
          ))}
        </div>
        <span className="hidden print:inline">{mark ? config.results.filter((result) => result.id === mark.result)[0]?.label ?? mark.result : 'Not checked yet'}</span>
        {opened && <button type="button" className="mt-1 block text-xs text-accent hover:underline print:hidden" onClick={() => update({ openCi: item.ciKey })}>Case: {opened.status}</button>}
      </td>
      <td className={td}>
        <input className={cx(inputClass, 'min-w-40 py-1 text-xs print:hidden')} aria-label={`Note for ${item.name}`} placeholder="What EPO shows" value={note} onChange={(event) => setNote(event.target.value)}
          onBlur={() => { if (mark && note.trim() !== mark.note) void markReview(review, item.ciKey, mark.result, note); }} />
        <span className="hidden text-xs print:inline">{mark?.note}</span>
      </td>
      <td className={cx(td, COL.name, 'text-xs text-muted')}>{mark ? <>{mark.byName}<span className="block">{localTime(mark.at, true)}</span></> : ''}</td>
    </tr>
  );
}
