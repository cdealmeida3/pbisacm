// Settings, Team: the list of SACM managers.
import { useState } from 'react';
import { toast } from '../../state/store.ts';
import { Button, Icon, inputClass } from '../../ui/basics.tsx';
import type { TeamMember } from '../../../core/team/team.ts';

const isEmail = (value: string): boolean => /^\S+@\S+$/.test(value);

/** Settings, Team: the SACM managers, each with name and email. Stored in the team folder. */
export function TeamEditor({ members, onChange }: { members: TeamMember[]; onChange: (members: TeamMember[]) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const add = (): void => {
    if (!name.trim() || !isEmail(email.trim())) { toast('Please enter a name and a valid email.'); return; }
    onChange(members.filter((member) => member.email.toLowerCase() !== email.trim().toLowerCase()).concat([{ name: name.trim(), email: email.trim() }]));
    setName(''); setEmail('');
  };
  return (
    <fieldset className="space-y-2">
      <legend className="pt-1 text-sm font-semibold text-ink">Managers</legend>
      <p className="text-xs text-muted">The SACM managers of this folder. They fill "Who is working?" and every Assign menu.</p>
      <ul className="space-y-1">
        {members.map((member) => (
          <li key={member.email} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5">
            <span className="min-w-0 flex-1 break-words"><b className="font-semibold">{member.name}</b> <span className="text-xs break-all text-muted">{member.email}</span></span>
            <Button small kind="ghost" aria-label={`Take ${member.name} off the team list`} data-tip="Take off the list" onClick={() => onChange(members.filter((other) => other !== member))}><Icon name="minus" className="size-3.5" /></Button>
          </li>
        ))}
        {!members.length && <li className="text-xs text-muted">Nobody on the list yet.</li>}
      </ul>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]">
        <input className={inputClass} aria-label="Name of the colleague" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <input type="email" className={inputClass} aria-label="Email of the colleague" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <Button small onClick={add}><Icon name="useradd" className="size-4" />Add</Button>
      </div>
    </fieldset>
  );
}
