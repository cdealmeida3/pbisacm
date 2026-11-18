// Settings: a window in four parts (Set-up, Me, Team, Mailboxes). The first visit asks only who is working.
import { useState } from 'react';
import { REQUESTS, requestName } from '../../../core/messages/messages.ts';
import { saveSettings } from '../../state/settings.ts';
import { NUMBER_RANGES, rangeText, settingNumber, state, toast, update } from '../../state/store.ts';
import type { NumberSetting } from '../../state/store.ts';
import { saveTeam } from '../../state/team.ts';
import { writeTeam } from '../../../core/team/team.ts';
import { setupLeft, setupSteps } from '../../view/setup.ts';
import type { SettingsPart } from '../../view/setup.ts';
import { TeamEditor } from './TeamEditor.tsx';
import { TeamPeopleEditor } from './TeamPeopleEditor.tsx';
import { REFERENCES } from '../../platform/bundle.ts';
import { recordTeams } from '../../../core/cases/record-teams.ts';
import { serviceNowAddress } from '../../../core/cases/record-search.ts';
import type { TeamPeople } from '../../../core/cases/record-teams.ts';
import { Button, Dialog, Field, Icon, cx, inputClass } from '../../ui/basics.tsx';
import { CountBadge, Tabs } from '../../ui/parts.tsx';

const isEmail = (value: string): boolean => /^\S+@\S+$/.test(value);

const NUMBER_LABELS: Record<NumberSetting, string> = {
  reminderDays: 'Working days before a reminder is due', maxReminders: 'Reminders before Escalate', staleDays: 'Days before a report counts as old',
  exceptionMonths: 'Months until "Not followed up" is reviewed', underRetirementDays: 'Days before Under retirement is too long', readyDays: 'Days before Ready is too long'
};

const PARTS: Array<{ id: SettingsPart; label: string; text: string }> = [
  { id: 'setup', label: 'Set-up', text: 'What a team fills in once. Press a line to go to its part.' },
  { id: 'me', label: 'Me', text: 'Your name and email sign everything you do. They are kept in this browser.' },
  { id: 'rules', label: 'Team', text: 'For the whole team, saved in the team folder: who works here and the days the app counts with.' },
  { id: 'requests', label: 'Mailboxes', text: 'For the whole team, saved in the team folder: who gets the messages, what they name, and where ServiceNow is.' }
];
/** The short label of a number on the screen and the word after its field (U088); the long one stays in Activity. */
const NUMBER_FIELDS: Record<NumberSetting, { label: string; unit: string; hint?: string }> = {
  reminderDays: { label: 'Reminder after', unit: 'working days' },
  maxReminders: { label: 'Reminders', unit: 'then Escalate' },
  exceptionMonths: { label: 'Review after', unit: 'months', hint: 'Proposed by Stop following.' },
  staleDays: { label: 'Report old after', unit: 'days', hint: 'The Reports line warns.' },
  underRetirementDays: { label: 'Under retirement too long', unit: 'days', hint: 'From the last change of the record.' },
  readyDays: { label: 'Ready too long', unit: 'days', hint: 'From the day the CI was created.' }
};
const heading = 'pt-1 text-sm font-semibold text-ink';
/** The teams that are the contact for the record of a class (reference/record-teams): Process Management. */
const RECORD_TEAMS = recordTeams(REFERENCES);
/** A team as typed: its name, else the name of the reference file, and only people with a name and an email. */
const cleanTeam = (team: TeamPeople | undefined, name: string): TeamPeople => ({
  name: (team?.name ?? '').trim() || name,
  people: (team?.people ?? []).map((person) => ({ name: person.name.trim(), email: person.email.trim() })).filter((person) => person.name && isEmail(person.email))
});

/**
 * Who is working (kept in this browser) and, for the whole team, the settings in the workspace folder. `first`: the first
 * visit, only "Who is working?". `part`: the part to open; without it Set-up while a step is left, else Me.
 */
export function SettingsDialog({ first, part, onClose }: { first: boolean; part?: SettingsPart; onClose: () => void }) {
  const [name, setName] = useState(state.user.name);
  const [email, setEmail] = useState(state.user.email);
  const [team, setTeam] = useState({ ...state.settings, requests: { ...state.settings.requests }, teams: { ...state.settings.teams } });
  const [members, setMembers] = useState(state.team);
  const onList = members.some((member) => member.email.toLowerCase() === email.trim().toLowerCase());
  const [addMe, setAddMe] = useState(true);
  // "Not saved yet" as soon as a field changes (U087): what is typed against what the window opened with.
  const [opened] = useState(() => JSON.stringify([name, email, team, members]));
  const dirty = JSON.stringify([name, email, team, members]) !== opened;
  const [leaving, setLeaving] = useState(false);
  // The set-up list reads what is typed, so a tick shows before Save.
  const steps = setupSteps(state.mode, members, team, RECORD_TEAMS);
  const [shown, setShown] = useState<SettingsPart>(() => part ?? (state.mode === 'folder' && setupLeft(setupSteps(state.mode, state.team, state.settings, RECORD_TEAMS)) ? 'setup' : 'me'));
  const setLink = (id: string) => (event: { target: { value: string } }) =>
    setTeam({ ...team, requests: { ...team.requests, [id]: { name: requestName(id, team.requests[id]?.name), link: event.target.value } } });
  const set = (key: keyof typeof team) => (event: { target: { value: string } }) => setTeam({ ...team, [key]: event.target.value });
  // A number that is empty, not whole or out of its range is refused, with a red line under its field (F11).
  const [errors, setErrors] = useState<Partial<Record<NumberSetting, string>>>({});
  const number = (key: NumberSetting): number => settingNumber(key, team[key])!;
  const numberField = (key: NumberSetting) => ({
    type: 'number', min: String(NUMBER_RANGES[key].min), max: String(NUMBER_RANGES[key].max), step: '1', className: inputClass,
    value: String(team[key]), onChange: set(key), 'aria-invalid': errors[key] ? true : undefined
  });
  const save = async (close: () => void): Promise<void> => {
    if (!name.trim() || !isEmail(email.trim())) { setShown('me'); toast('Please enter your name and a valid email.'); return; }
    if (!first) {
      const wrong = Object.fromEntries((Object.keys(NUMBER_RANGES) as NumberSetting[]).filter((key) => settingNumber(key, team[key]) === null).map((key) => [key, `Not saved. ${rangeText(key)}`]));
      setErrors(wrong);
      if (Object.keys(wrong).length) { setShown('rules'); toast('Some numbers cannot be used. See the red lines.'); return; }
    }
    if (!first && writeTeam(members) !== writeTeam(state.team)) await saveTeam(members);
    await saveSettings({ name: name.trim(), email: email.trim() }, first ? null : {
      portalLink: /^https:\/\//i.test(team.portalLink.trim()) ? team.portalLink.trim() : '',
      signature: team.signature.trim() || 'SACM team',
      reminderDays: number('reminderDays'),
      maxReminders: number('maxReminders'),
      epoOwnerName: team.epoOwnerName.trim(),
      epoOwnerEmail: isEmail(team.epoOwnerEmail.trim()) ? team.epoOwnerEmail.trim() : '',
      procurementName: team.procurementName.trim() || 'Procurement',
      procurementEmail: isEmail(team.procurementEmail.trim()) ? team.procurementEmail.trim() : '',
      procurementLeadName: team.procurementLeadName.trim(),
      procurementLeadEmail: isEmail(team.procurementLeadEmail.trim()) ? team.procurementLeadEmail.trim() : '',
      staleDays: number('staleDays'),
      exceptionMonths: number('exceptionMonths'),
      underRetirementDays: number('underRetirementDays'),
      readyDays: number('readyDays'),
      serviceNowAddress: serviceNowAddress(team.serviceNowAddress ?? ''),
      teams: Object.fromEntries(RECORD_TEAMS.map((one) => [one.id, cleanTeam(team.teams[one.id], one.name)])),
      // The name of a request is the one of the Service Portal (D41): only its link is typed.
      requests: Object.fromEntries(REQUESTS.map((request) => {
        const link = (team.requests[request.id]?.link ?? '').trim();
        return [request.id, { name: requestName(request.id, team.requests[request.id]?.name), link: /^https:\/\//i.test(link) ? link : '' }];
      }))
    }, first && addMe && state.mode !== 'files');
    close();
  };
  const me = <>
    {members.length > 0 && (
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted">Choose yourself from the team list</p>
        <div className="flex flex-wrap gap-1.5">
          {members.map((member) => (
            <button key={member.email} type="button" onClick={() => { setName(member.name); setEmail(member.email); }} aria-pressed={member.email.toLowerCase() === email.trim().toLowerCase()}
              className="rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ring-line-strong hover:bg-surface-2 aria-pressed:bg-accent-soft aria-pressed:ring-accent">
              {member.name}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">Not on the list? Type your name and email below.</p>
      </div>
    )}
    <div className={cx(!first && 'grid gap-3 sm:grid-cols-2')}>
      <Field label="Your name"><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Your email"><input type="email" className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
    </div>
    {first && !onList && state.mode !== 'files' && (
      <label className="flex min-h-6 items-center gap-2 text-sm">
        <input type="checkbox" checked={addMe} onChange={(event) => setAddMe(event.target.checked)} className="size-5" />
        Add me to the team list of this folder
      </label>
    )}
  </>;
  if (first) {
    return (
      <Dialog title="Who is working?" onClose={onClose} actions={<Button kind="primary" onClick={() => void save(onClose)}>Save</Button>}>
        <p className="text-muted">{PARTS[1]!.text}</p>
        {me}
      </Dialog>
    );
  }
  const left = setupLeft(steps);
  /** A number with its short label and its unit after the field: "Reminder after [5] working days". */
  const numberLine = (key: NumberSetting) => (
    <Field label={NUMBER_FIELDS[key].label} hint={NUMBER_FIELDS[key].hint} error={errors[key]}>
      <span className="flex items-center gap-2"><input {...numberField(key)} className={cx(inputClass.replace('w-full ', ''), 'w-20')} /><span className="text-sm whitespace-nowrap text-muted">{NUMBER_FIELDS[key].unit}</span></span>
    </Field>
  );
  /** A heading and two fields, Name and Email (U088: "Procurement mailbox" with Name and Email). */
  const person = (title: string, name: keyof typeof team, email: keyof typeof team, hints: { name?: string; email?: string }) => (
    <fieldset className="space-y-2" aria-label={title}>
      <legend className={heading}>{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" hint={hints.name}><input className={inputClass} value={String(team[name])} onChange={set(name)} /></Field>
        <Field label="Email" hint={hints.email}><input type="email" className={inputClass} value={String(team[email])} onChange={set(email)} /></Field>
      </div>
    </fieldset>
  );
  // Close or Cancel with changes not saved asks first, in the footer (U087).
  const guard = (): boolean => { if (!dirty) return true; setLeaving(true); return false; };
  const footer = leaving ? <>
    <span className="mr-auto text-sm whitespace-nowrap text-amber"><Icon name="warn" className="mr-1 inline size-4" />Close without saving?</span>
    <Button kind="ghost" onClick={() => setLeaving(false)}>Keep editing</Button>
    <Button kind="danger" onClick={onClose}>Close</Button>
  </> : <>
    {/* Without a team folder (report files only, the demo) the way back to the start screen is here, not in the header (F52). */}
    {state.mode !== 'folder' && <Button kind="ghost" className="mr-auto" onClick={() => { onClose(); update({ workspace: null }); }}><Icon name="back" />Start screen</Button>}
    {dirty && <span className="text-sm whitespace-nowrap text-muted" data-not-saved data-tip="Changes are recorded with your name and the time when you save">Not saved yet</span>}
    <Button kind="ghost" onClick={() => { if (guard()) onClose(); }}>Cancel</Button>
    <Button kind="primary" onClick={() => void save(onClose)}>Save</Button>
  </>;
  return (
    <Dialog title="Settings" wide onClose={onClose} guard={guard} actions={footer}>
      <Tabs label="Parts of Settings" value={shown} onChange={setShown} tabs={PARTS.map((item) => ({ id: item.id, label: item.id === 'setup' && left ? <>{item.label}<CountBadge n={steps.filter((step) => !step.done).length} /></> : item.label }))} />
      <p className="text-muted">{PARTS.filter((item) => item.id === shown)[0]!.text}</p>
      {shown === 'setup' && <>
        <ul className="space-y-1.5" aria-label="Set-up list">
          {steps.map((step) => (
            <li key={step.id}>
              <button type="button" disabled={step.part === 'setup'} onClick={() => setShown(step.part)} data-done={step.done}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left ring-1 ring-inset ring-line enabled:hover:bg-surface-2">
                <span aria-hidden="true" className={cx('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', step.done ? 'bg-green text-surface' : 'ring-1 ring-inset ring-line-strong')}>{step.done && <Icon name="check" className="size-3.5" />}</span>
                <span className="flex-1"><span className="font-semibold">{step.label}</span><span className="sr-only">{step.done ? ' (done)' : ' (to do)'}</span><span className="block text-xs text-muted">{step.note}</span></span>
                {step.part !== 'setup' && <span className="inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap text-accent">{PARTS.filter((item) => item.id === step.part)[0]!.label}<Icon name="right" className="size-3.5" /></span>}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">{left ? 'A tick shows as soon as the field is filled. Save keeps it.' : 'Everything is set up.'}</p>
      </>}
      {shown === 'me' && me}
      {shown === 'rules' && <>
        {state.unusableSettings.length > 0 && <p role="status" className="rounded-lg bg-amber-soft px-3 py-2 text-xs text-amber ring-1 ring-amber-line">The settings file of the team folder holds a number that cannot be used ({state.unusableSettings.map((key) => NUMBER_LABELS[key]).join(', ')}). The app uses the first value instead, shown below. Save to keep it.</p>}
        <TeamEditor members={members} onChange={setMembers} />
        <h3 className={heading}>Follow-up</h3>
        <div className="grid gap-3 sm:grid-cols-3">{numberLine('reminderDays')}{numberLine('maxReminders')}{numberLine('exceptionMonths')}</div>
        <h3 className={heading}>Reports and checks</h3>
        <div className="grid gap-3 sm:grid-cols-3">{numberLine('staleDays')}{numberLine('underRetirementDays')}{numberLine('readyDays')}</div>
      </>}
      {shown === 'requests' && <>
        {person('Procurement mailbox', 'procurementName', 'procurementEmail', { name: 'How the message greets them.', email: 'Gets the problems in Solusi itself.' })}
        {person('Procurement lead', 'procurementLeadName', 'procurementLeadEmail', { email: 'Gets the escalation when the mailbox does not answer.' })}
        {RECORD_TEAMS.map((one) => <div key={one.id} className="space-y-2">
          <h3 className={heading}>{one.name}</h3>
          <TeamPeopleEditor label={one.name} team={team.teams[one.id] ?? { name: one.name, people: [] }} onChange={(value) => setTeam({ ...team, teams: { ...team.teams, [one.id]: value } })} />
        </div>)}
        {person('EPO inventory owner', 'epoOwnerName', 'epoOwnerEmail', { email: 'Only when nobody else can be asked about a fix in EPO.' })}
        <h3 className={heading}>ServiceNow</h3>
        <Field label="Address" hint="The start of any link of your ServiceNow. Each line of a SACM list opens its record there."
          error={team.serviceNowAddress?.trim() && !serviceNowAddress(team.serviceNowAddress) ? 'Not a link: it starts with https://' : undefined}>
          <input type="url" className={inputClass} placeholder="https://" value={team.serviceNowAddress ?? ''} onChange={set('serviceNowAddress')} />
        </Field>
        <h3 className={heading}>Messages</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Service Portal link" hint="The SACM category of the portal."><input type="url" className={inputClass} placeholder="https://" value={team.portalLink} onChange={set('portalLink')} /></Field>
          <Field label="Signature" hint="The last line of every message, under your name."><input className={inputClass} value={team.signature} onChange={set('signature')} /></Field>
        </div>
        <fieldset className="space-y-2">
          <legend className={heading}>Request links</legend>
          <p className="text-xs text-muted" data-tip="There is no request to change Supported by: those messages ask for a reply">The names are those of the Service Portal. A request without a link points to the portal link.</p>
          {REQUESTS.map((request) => (
            <div key={request.id} className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <span className="text-sm font-semibold">{request.name}{request.action && <span className="block text-xs font-normal text-muted">Action "{request.action}"</span>}</span>
              <input type="url" className={inputClass} aria-label={`Link of the request: ${request.name}`} placeholder="https://" value={team.requests[request.id]?.link ?? ''} onChange={setLink(request.id)} />
            </div>
          ))}
        </fieldset>
      </>}
    </Dialog>
  );
}
