// Settings, Mailboxes: the people of a team that is the contact for the record of a class (Process Management).
import { useState } from 'react';
import { toast } from '../../state/store.ts';
import { Button, Field, Icon, inputClass } from '../../ui/basics.tsx';
import type { TeamPeople } from '../../../core/cases/record-teams.ts';

const isEmail = (value: string): boolean => /^\S+@\S+$/.test(value);

/**
 * The name a message to the team greets and its people, each with name and email (D195). `label`: the name of the team in
 * reference/record-teams. Every person gets the message; nobody else is copied.
 */
export function TeamPeopleEditor({ label, team, onChange }: { label: string; team: TeamPeople; onChange: (team: TeamPeople) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const add = (): void => {
    if (!name.trim() || !isEmail(email.trim())) { toast('Please enter a name and a valid email.'); return; }
    onChange({ ...team, people: team.people.filter((person) => person.email.toLowerCase() !== email.trim().toLowerCase()).concat([{ name: name.trim(), email: email.trim() }]) });
    setName(''); setEmail('');
  };
  return (
    <fieldset className="space-y-2" aria-label={`${label} team`}>
      <Field label="Name" hint="How the message greets the team."><input className={inputClass} value={team.name} onChange={(event) => onChange({ ...team, name: event.target.value })} /></Field>
      <p className="text-xs text-muted">Each person gets the message about the records of the team. Without anybody here it cannot be written.</p>
      <ul className="space-y-1">
        {team.people.map((person) => (
          <li key={person.email} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5">
            <span className="min-w-0 flex-1 break-words"><b className="font-semibold">{person.name}</b> <span className="text-xs break-all text-muted">{person.email}</span></span>
            <Button small kind="ghost" aria-label={`Take ${person.name} off the ${label} team`} data-tip="Take off the list" onClick={() => onChange({ ...team, people: team.people.filter((other) => other !== person) })}><Icon name="minus" className="size-3.5" /></Button>
          </li>
        ))}
        {!team.people.length && <li className="text-xs text-muted">Nobody yet.</li>}
      </ul>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]">
        <input className={inputClass} aria-label={`Name of a person of the ${label} team`} placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <input type="email" className={inputClass} aria-label={`Email of a person of the ${label} team`} placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <Button small onClick={add}><Icon name="useradd" className="size-4" />Add</Button>
      </div>
    </fieldset>
  );
}
