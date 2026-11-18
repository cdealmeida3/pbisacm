// The shell: the header, the start screen and which screen is shown. Only the shell imports the screens.
import { useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION, CHECK_PACKS, REFERENCES, packFolder } from '../platform/bundle.ts';
import { recordTeams } from '../../core/cases/record-teams.ts';
import { canPickFolder, pickFolder, rememberedFolder } from '../platform/workspace.ts';
import { refresh, start } from '../state/folder.ts';
import { loadLatestReport, startDemo, startFiles } from '../state/loading.ts';
import { latestRun, toast, update } from '../state/store.ts';
import { useStore } from '../state/use-store.ts';
import { cardKind, cardSummaries, sinceReport, sinceText } from '../view/cards.ts';
import { myWork } from '../../core/team/team.ts';
import { ActivityPage, MyWorkPage, PersonPage } from '../screens/team/Pages.tsx';
import { AuditPage } from '../screens/audit/Audit.tsx';
import { BacklogPage } from '../screens/backlog/Backlog.tsx';
import { ContractChangesPage } from '../screens/contracts/Contracts.tsx';
import { FolderNotes, SinceStrip } from './Notes.tsx';
import { CardView } from '../screens/card/CardView.tsx';
import { CasePanel } from '../screens/case/CasePanel.tsx';
import { MyDayHead, MyDayPage } from '../screens/myday/MyDay.tsx';
import { CardList, Overview } from '../screens/overview/Overview.tsx';
import { PickReportsDialog, ReportsStrip } from '../screens/reports/Reports.tsx';
import { SettingsDialog } from '../screens/settings/Settings.tsx';
import { setupLeft, setupSteps } from '../view/setup.ts';
import type { SettingsPart } from '../view/setup.ts';
import { Button, Chip, Icon, IconButton, Logo, cx, initialsOf, shortDate } from '../ui/basics.tsx';
import { EmptyState, MenuButton, MenuItem, MenuNote, TipLayer } from '../ui/parts.tsx';
import type { IconName } from '../ui/icons.ts';

function ThemeButton() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = (): void => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('sacm-workbench.theme', next ? 'dark' : 'light'); } catch { /* private window */ }
    setDark(next);
  };
  return <IconButton icon={dark ? 'sun' : 'moon'} label={dark ? 'Light mode' : 'Dark mode'} onClick={toggle} />;
}

/** "More": the actions of the header used less often (Choose reports, Refresh). Opens on a click; Escape or a click outside closes it. */
function MoreMenu({ pick }: { pick: () => void }) {
  const store = useStore();
  return (
    <MenuButton label="More">
      {(close) => <>
        <MenuItem icon="folder" label="Choose reports" tip="Choose which report files to load" onClick={() => { close(); pick(); }} />
        {store.mode === 'folder' && <MenuItem icon="refresh" label="Refresh" tip="Read again what colleagues did" onClick={() => { close(); void refresh().then((note) => toast(note || 'Read again from the folder.')); }} />}
        {store.mode === 'folder' && store.readAt && <MenuNote>Last read {store.readAt.slice(11, 16)}</MenuNote>}
      </>}
    </MenuButton>
  );
}

/**
 * The header (version 0.30, build L2): the logo and name with the report of the day and the mode chip; the pages; Load,
 * More, Settings with the set-up counter, light or dark, and the initials of the person working. Always one row: below
 * 1250 px the pages show their icon only, the open one keeps its word.
 */
function Header({ settings, pick }: { settings: (part?: SettingsPart) => void; pick: () => void }) {
  const store = useStore();
  const run = latestRun();
  const mine = useMemo(() => myWork(store.cases, store.user.name).length, [store.cases, store.user.name]);
  const left = store.mode === 'folder' ? setupLeft(setupSteps(store.mode, store.team, store.settings, recordTeams(REFERENCES))) : '';
  const steps = Number(/\d+/.exec(left)?.[0] ?? 0);
  const go = (view: typeof store.view): void => update({ view, openCi: '', ...(view === 'overview' ? { openCard: '' } : {}) });
  // The open page: a light fill and a coral line under it (coral is decoration only, never a button or a state).
  const page = (view: typeof store.view, icon: IconName, label: string, tip: string, count = 0) => {
    const on = store.view === view;
    return (
      <button type="button" aria-current={on ? 'page' : undefined} onClick={() => go(view)} data-tip={tip} aria-label={count ? `${label} ${count}` : label}
        className={cx('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition',
          on ? 'bg-accent-soft text-ink shadow-[inset_0_-3px_0_var(--wb-deco)]' : 'text-muted hover:bg-surface-2 hover:text-ink')}>
        <Icon name={icon} /><span className={cx(!on && 'max-[1250px]:sr-only')}>{label}</span>
        {count > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-2 px-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line-strong">{count}</span>}
      </button>
    );
  };
  return (
    <header className="z-20 print:hidden sm:sticky sm:top-0 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-[1600px] items-center gap-3 px-4 max-sm:flex-wrap max-sm:py-2 sm:px-6" data-header>
        <button type="button" data-rows className="flex min-w-0 shrink-0 items-center gap-2.5 text-left" onClick={() => go('overview')} aria-label="My day" data-tip="My day">
          <Logo size={28} />
          <span data-rows className="flex flex-col max-[1100px]:hidden">
            <span className="text-sm leading-tight font-bold whitespace-nowrap">SACM Workbench</span>
            <span className="text-xs whitespace-nowrap text-muted" data-header-report>{run ? `Report ${shortDate(run.date)} · ${run.cis.toLocaleString('en-GB')} CIs` : 'No report yet'}</span>
          </span>
        </button>
        {store.mode === 'demo' && <Chip tone="grey" title="Invented data. Load a real file to replace it">Demo</Chip>}
        {store.mode === 'files' && <Chip tone="grey" title="Report files only: nothing is saved">Files only</Chip>}
        <nav aria-label="Pages" className="flex min-w-0 flex-1 items-center justify-center gap-1 max-sm:order-last max-sm:basis-full">
          {page('overview', 'myday', 'My day', 'Replies, reminders, escalations, what is new, and all the cards')}
          {page('mywork', 'me', 'My work', 'Everything assigned to me', mine)}
          {page('backlog', 'backlog', 'Backlog', 'The mapping backlog: one case per CI to map')}
          {store.mode !== 'files' && page('activity', 'activity', 'Activity', 'Everything the team did')}
          {page('audit', 'audit', 'Audit', 'Verification records, audit export and exceptions')}
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <Button onClick={() => (store.mode === 'files' ? pick() : void loadLatestReport())} data-tip={store.mode === 'files' ? 'Choose the report files to load' : 'Load the newest report of each kind from the reports folder'}><Icon name="load" />Load</Button>
          {store.mode !== 'files' && <MoreMenu pick={pick} />}
          <span className="relative inline-flex">
            <IconButton icon="settings" label="Settings" onClick={() => settings()} data-tip={left ? `Settings · set-up: ${left}` : 'Settings'} data-setup={left || undefined} />
            {steps > 0 && <span aria-hidden="true" className="pointer-events-none absolute -top-1 -right-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-on-accent">{steps}</span>}
          </span>
          <ThemeButton />
          <button type="button" onClick={() => settings('me')} aria-label={store.user.name ? `${store.user.name}: Settings, Me` : 'Me: Settings'} data-tip={store.user.name ? `${store.user.name} · Settings, Me` : 'Settings, Me'}
            className="ml-1 inline-flex size-9 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-ink ring-1 ring-inset ring-line-strong">{initialsOf(store.user.name)}</button>
        </div>
      </div>
    </header>
  );
}

/**
 * The start screen (version 0.30): one main button, Open folder; the links Open files and Try the demo. A folder chosen
 * before opens again with the same button (its name is the tooltip); Another folder chooses a new one.
 */
function Welcome() {
  const [remembered, setRemembered] = useState<Awaited<ReturnType<typeof rememberedFolder>>>(null);
  const files = useRef<HTMLInputElement>(null);
  useEffect(() => { if (canPickFolder()) void rememberedFolder().then(setRemembered); }, []);
  const open = async (handle: typeof remembered): Promise<void> => {
    try { const workspace = await pickFolder(handle); if (workspace) await start(workspace, 'folder'); } catch { toast('No folder was opened.'); }
  };
  const link = 'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold whitespace-nowrap text-accent hover:bg-surface-2';
  return (
    <div className="grid min-h-screen place-items-center px-4 py-12">
      <div className="flex flex-col items-center gap-3 rounded-xl bg-surface px-14 py-10 text-center shadow-sm ring-1 ring-line max-sm:px-6">
        <Logo size={56} />
        <h1 className="text-[26px] font-bold">SACM Workbench</h1>
        <p className="text-muted">Data quality work, in one place</p>
        {canPickFolder()
          ? <Button kind="primary" className="mt-2 h-10 px-6" onClick={() => void open(remembered)} data-tip={remembered ? `Open the team folder "${remembered.name}"` : 'Choose the team folder: reports, messages and history are shared with the team'}><Icon name="folder" />Open folder</Button>
          : <p className="text-sm text-amber">This browser cannot open a folder. Use Edge or Chrome.</p>}
        <div className="flex flex-wrap justify-center gap-4">
          {remembered && <button type="button" className={link} onClick={() => void open(null)} data-tip="Choose another team folder"><Icon name="folder" />Another folder</button>}
          <input ref={files} type="file" accept=".csv,.xlsx" multiple hidden onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (picked.length) void startFiles(picked);
          }} />
          <button type="button" className={link} onClick={() => files.current?.click()} data-tip="A quick look at .csv or .xlsx reports: nothing is saved and no message can go from the shared mailbox"><Icon name="file" />Open files</button>
          <button type="button" className={link} onClick={() => void startDemo()} data-tip="See how it works with a small invented report: nothing is saved"><Icon name="right" />Try the demo</button>
        </div>
        <p className="text-xs text-muted">Nothing happens on its own. You press Load, Send and Get replies.</p>
        <p className="text-xs text-muted">Everything stays on this computer and in the team folder. No network connection. Version {APP_VERSION}</p>
      </div>
    </div>
  );
}

export function App() {
  const store = useStore();
  const [settingsOpen, setSettingsOpen] = useState<SettingsPart | '' | 'auto'>('');
  const [picking, setPicking] = useState(false);
  const run = latestRun();
  const relationships = store.relationship ? store.relationship.relationships.length : undefined;
  const epoSystems = store.epo ? store.epo.systems.length : undefined;
  const contractFiles = !!store.solusi && !!store.contracts;
  const cards = useMemo(() => cardSummaries(CHECK_PACKS, run, store.cases, store.people, relationships, epoSystems, contractFiles), [run, store.cases, store.people, relationships, epoSystems, contractFiles]);
  const card = cards.filter((candidate) => candidate.id === store.openCard)[0];
  // New and solved since the report before (D172): from the runs the folder keeps, nothing new is saved.
  const since = useMemo(() => sinceReport(store.runs, cards), [store.runs, cards]);
  const pick = (): void => setPicking(true);

  if (!store.workspace) return <><Welcome /><Toast /><TipLayer /></>;
  const reports = <ReportsStrip cards={cards} />;
  const first = !run ? (
    <div className="space-y-4">
      <MyDayHead reports={reports} />
      <EmptyState icon="load" title="No CI report loaded yet" text={store.mode === 'files' ? 'The checks run on the CI report. Choose a .csv or .xlsx file.' : 'The checks run on the CI report. Load reads the newest reports of the "reports" folder.'}
        action={<Button kind="primary" onClick={() => (store.mode === 'files' ? pick() : void loadLatestReport())}><Icon name="load" />Load</Button>} />
    </div>
  ) : card ? (
    <div className="xl:grid xl:grid-cols-[264px_minmax(0,1fr)] xl:items-start xl:gap-6">
      <div className="hidden xl:sticky xl:top-20 xl:block xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pr-1">
        <CardList cards={cards} since={since} folderOf={packFolder} />
      </div>
      {cardKind(card.pack) === 'mapping' ? <BacklogPage key={card.id} card={card} /> : <CardView key={card.id} card={card} />}
    </div>
  ) : (
    <div className="space-y-6">
      <MyDayPage cards={cards} since={since} sinceLine={since ? sinceText(since, shortDate) : ''} reports={reports} />
      <div className="space-y-3">
        <h2 className="text-lg font-bold">All cards</h2>
        <Overview cards={cards} since={since} folderOf={packFolder} />
      </div>
    </div>
  );
  return (
    <div className="min-h-screen">
      <Header settings={(part) => setSettingsOpen(part ?? 'auto')} pick={pick} />
      <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 print:max-w-none print:p-0">
        <div className="space-y-5 empty:hidden print:hidden"><FolderNotes /><SinceStrip /></div>
        {store.view === 'backlog' ? <BacklogPage card={cards.filter((candidate) => cardKind(candidate.pack) === 'mapping')[0]} /> : store.view === 'audit' ? <AuditPage /> : store.view === 'contracts' ? <ContractChangesPage /> : store.view === 'mywork' ? <MyWorkPage /> : store.view === 'activity' ? <ActivityPage /> : store.view === 'person' ? <PersonPage /> : first}
      </main>
      {store.openCi && <CasePanel />}
      {picking && <PickReportsDialog onClose={() => setPicking(false)} />}
      {(settingsOpen || store.askUser || store.openSettings) && <SettingsDialog first={store.askUser} part={settingsOpen && settingsOpen !== 'auto' ? settingsOpen : store.openSettings ? 'requests' : undefined} onClose={() => { setSettingsOpen(''); update({ askUser: !store.user.email, openSettings: false }); }} />}
      <Toast />
      <TipLayer />
    </div>
  );
}

function Toast() {
  const store = useStore();
  return (
    <div role="status" aria-live="polite" className={cx('fixed right-5 bottom-5 z-50 w-fit max-w-[min(26rem,90vw)] rounded-lg bg-tip px-4 py-3 text-sm text-tip-ink shadow-xl transition',
      store.toast ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0')}>
      {store.toast}
      {store.toast && store.toastAction && <button type="button" className="ml-3 inline-flex h-6 items-center font-semibold underline" onClick={() => { store.toastAction?.run(); }}>{store.toastAction.label}</button>}
    </div>
  );
}
