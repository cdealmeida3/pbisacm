// The mapping backlog (D200 to D205): one line per CI to map, its stage, the invitation, "Tell Process Management" and the capability sheet.
import { useMemo, useState } from 'react';
import { mappingConfig } from '../../../core/mapping/backlog.ts';
import { recordTeams } from '../../../core/cases/record-teams.ts';
import { recipientOf } from '../../../core/messages/messages.ts';
import { CHECK_PACKS, REFERENCES } from '../../platform/bundle.ts';
import { latestRun, update } from '../../state/store.ts';
import { useStore } from '../../state/use-store.ts';
import { backlogLines, stageCounts, teamCases, toTell } from '../../view/backlog.ts';
import { exportBacklogCsv, exportCapabilityCsv } from '../../view/exports.ts';
import { ownerGroups } from '../../view/groups.ts';
import type { BacklogLine } from '../../view/backlog.ts';
import type { CardSummary } from '../../view/cards.ts';
import type { OwnerGroup } from '../../view/groups.ts';
import { ComposeDialog } from '../../ui/ComposeDialog.tsx';
import { PageHead } from '../../ui/PageHead.tsx';
import { download } from '../../ui/download.ts';
import { StageDots } from '../../ui/stages.tsx';
import { Button, Chip, Icon, Pager, STATE_ICON, STATE_WORD, Toggle, cx, inputClass, pageOf, plural, shortDate } from '../../ui/basics.tsx';

const labelOf = (checkId: string): string => CHECK_PACKS.filter((pack) => pack.id === checkId)[0]?.cardLabel ?? checkId;
const STATES = ['open', 'waiting', 'known'] as const;
const STATE_LABEL: Record<string, string> = { open: 'To solve', waiting: 'Waiting', known: 'Planned' };

/** The next step of a line: invite the owner while it is to plan and nobody was written to, else where the follow-up stands. */
function NextStep({ line, invite }: { line: BacklogLine; invite: () => void }) {
  const item = line.item;
  if (item.state !== 'open') return <Chip tone="grey" icon={STATE_ICON[item.state]} title={item.fact.stateWhy}>{STATE_LABEL[item.state] ?? STATE_WORD[item.state]}</Chip>;
  if (item.overLimit) return <Button small onClick={invite}><Icon name="escalate" className="size-4" />Escalate</Button>;
  if (item.reminderDue) return <Button small onClick={invite}><Icon name="remind" className="size-4" />Reminder</Button>;
  if (item.messages.length) return <Chip tone={item.status === 'Answered' ? 'violet' : 'blue'} icon={item.status === 'Answered' ? 'replies' : 'mail'}>{item.status === 'Answered' ? 'Answered' : `Invited ${shortDate(item.lastMessageOn)}`}</Chip>;
  if (line.stageIndex > 0) return <span className="text-xs text-muted">Set the next stage</span>;
  return <Button small kind="primary" onClick={invite}><Icon name="mail" className="size-4" />Invite</Button>;
}

/** The page Backlog: opened from the header, or as the card Mapping backlog of the overview. */
export function BacklogPage({ card }: { card?: CardSummary }) {
  const store = useStore();
  const config = mappingConfig(REFERENCES);
  const checkId = card?.id ?? 'MAPPING';
  const [search, setSearch] = useState('');
  const [state, setState] = useState<string>('open');
  const [stage, setStage] = useState('');
  const [page, setPage] = useState(0);
  const [compose, setCompose] = useState<{ group: OwnerGroup; title: string } | null>(null);
  const all = useMemo(() => (config ? backlogLines(store.cases, store.events, store.people, config, checkId, labelOf) : []), [store.cases, store.events, store.people, checkId]);
  const run = latestRun();
  const team = config?.processMissing ? recordTeams(REFERENCES).filter((one) => one.id === config.processMissing!.team)[0] : undefined;
  const teamPeople = team ? store.settings.teams[team.id]?.people.filter((person) => person.email) ?? [] : [];
  const tell = toTell(all);
  const inState = all.filter((line) => !state || line.state === state);
  const counts = config ? stageCounts(inState, config) : [];
  const needle = search.trim().toLowerCase();
  const shown = inState.filter((line) => (!stage || line.stage.id === stage) && (!needle || `${line.item.fact.ciName} ${line.owner} ${line.item.fact.detail}`.toLowerCase().includes(needle)));
  const at = pageOf(shown, page);
  const recipient = (fact: BacklogLine['item']['fact']) => recipientOf(fact, store.settings);
  const invite = (line: BacklogLine): void => {
    const group = ownerGroups([line.item], store.people, recipient)[0];
    if (group) setCompose({ group, title: `Invite to a mapping session: ${line.owner || line.item.fact.ciName}` });
  };
  const tellTeam = (): void => {
    if (!team) return;
    const group = ownerGroups(teamCases(tell, team), store.people, recipient)[0];
    if (group) setCompose({ group, title: `Tell ${team.name}` });
  };
  const tested = !!run && run.tested.some((entry) => entry.split(':')[0] === checkId);
  const notes = card?.notes ?? [];
  const capabilities = run?.capabilities;
  return (
    <section aria-label="Mapping backlog" className="min-w-0 space-y-4" data-kind="mapping">
      <PageHead title="Mapping backlog" text="One case per CI to map. Invite the owner to a mapping session, map the CI in the Service Mapping Workspace, make the changes in ServiceNow and set the stage. A case is solved when a later report no longer shows it.">
        {team && <Button onClick={tellTeam} disabled={!tell.length || !teamPeople.length} data-tip={!teamPeople.length ? `Type the people of ${team.name} in Settings first` : tell.length ? undefined : 'No CI is marked "the process does not exist", or the team was told already'}><Icon name="mail" />Tell {team.name}{tell.length ? ` (${tell.length})` : ''}</Button>}
        <Button onClick={() => download(exportBacklogCsv(shown, (word) => STATE_LABEL[word] ?? STATE_WORD[word] ?? word), 'Mapping backlog')} disabled={!shown.length}><Icon name="export" />Export</Button>
        <Button onClick={() => download(exportCapabilityCsv(capabilities ?? []), 'Capability sheet')} disabled={!capabilities} data-tip={capabilities ? 'Every Business Capability, for the talks with Enterprise Architecture and Process Management' : 'Load the CI report with a Relationship report first'}><Icon name="file" />Capability sheet</Button>
      </PageHead>
      {!config && <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink">The mapping backlog needs its reference data (reference/mapping-backlog), which is missing.</p>}
      {run && !tested && <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink" data-grey><Icon name="nottested" className="mr-1 inline size-4" />Not tested with the latest report. {notes[0] ?? 'Load the Relationship report with the CI report.'}</p>}
      {team && tell.length > 0 && !teamPeople.length && <p className="rounded-xl bg-amber-soft px-4 py-3 text-sm text-amber ring-1 ring-amber-line">{plural(tell.length, 'CI is', 'CIs are')} marked "the process does not exist", but {team.name} has nobody in Settings. <button type="button" className="font-semibold underline" onClick={() => update({ openSettings: true })}>Open Settings</button></p>}
      <div className="flex flex-wrap items-center gap-2" data-toolbar>
        <label className="relative">
          <span className="sr-only">Search the backlog</span>
          <Icon name="search" className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted" />
          <input type="search" placeholder="Search CI, owner, reason" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} className={cx(inputClass.replace('w-full ', ''), 'w-64 py-1.5 pl-8')} />
        </label>
        <Toggle label={`All ${all.length}`} checked={!state} onChange={() => { setState(''); setPage(0); }} />
        {STATES.map((one) => <Toggle key={one} label={`${STATE_LABEL[one]} ${all.filter((line) => line.state === one).length}`} icon={STATE_ICON[one]} checked={state === one} onChange={(on) => { setState(on ? one : ''); setPage(0); }} />)}
      </div>
      {counts.length > 0 && (
        <div role="group" aria-label="Stages" className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted">Stage</span>
          {counts.map((entry) => <Toggle key={entry.stage.id} label={`${entry.stage.label} ${entry.count}`} checked={stage === entry.stage.id} onChange={(on) => { setStage(on ? entry.stage.id : ''); setPage(0); }} />)}
        </div>
      )}
      {config && tested && !all.length && <p className="text-sm text-muted">Nothing to map: every CI has the relationships the model asks for.</p>}
      {all.length > 0 && !shown.length && <p className="text-sm text-muted">Nothing matches the filters.</p>}
      {shown.length > 0 && (
        <div className="overflow-x-auto rounded-xl bg-surface shadow-sm ring-1 ring-line">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr><th className="px-4 py-2 font-semibold">CI</th><th className="px-3 py-2 font-semibold">Owner</th><th className="px-3 py-2 font-semibold">Why</th><th className="px-3 py-2 font-semibold">Stage</th><th className="px-3 py-2 font-semibold">Since</th><th className="px-4 py-2 text-right font-semibold">Next step</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {at.shown.map((line) => (
                <tr key={line.item.key} data-line={line.item.fact.ciName} className="align-top">
                  <td className="px-4 py-2.5">
                    <button type="button" data-rows className="min-h-6 text-left font-semibold underline decoration-line-strong decoration-dotted underline-offset-2 hover:decoration-solid" onClick={() => update({ openCi: line.item.fact.ciKey, openCard: checkId })}>{line.item.fact.ciName}</button>
                    <div className="text-xs text-muted">{line.item.fact.classLabel}</div>
                  </td>
                  <td className="px-3 py-2.5">{line.owner || <span className="text-muted">Nobody</span>}</td>
                  <td className="px-3 py-2.5">
                    <ul className="space-y-0.5 text-xs text-ink">{line.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {line.criticality.map((label) => <Chip key={label} tone="blue" icon="eye" title="A criticality line of the same CI: check it in the session">{label}</Chip>)}
                      {line.processMissing && <Chip tone={line.toldOn ? 'green' : 'amber'} icon="note">{line.toldOn ? `Process Management told ${shortDate(line.toldOn)}` : 'No process: tell Process Management'}</Chip>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><StageDots stages={line.stages} index={line.stageIndex} /></td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted">{shortDate(line.item.firstSeen)}</td>
                  <td className="px-4 py-2.5 text-right"><NextStep line={line} invite={() => invite(line)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager total={shown.length} from={at.from} to={at.to} page={at.page} pages={at.pages} onPage={setPage} word="CIs" />
      {compose && <ComposeDialog group={compose.group} title={compose.title} onClose={() => setCompose(null)} />}
    </section>
  );
}
