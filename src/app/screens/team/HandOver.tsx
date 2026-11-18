// Hand over, opened from My work.
import { useState } from 'react';
import { state, toast } from '../../state/store.ts';
import { handOver, teamNames } from '../../state/team.ts';
import { Button, Dialog, Field, Icon, inputClass, plural } from '../../ui/basics.tsx';

/** Hand over: "Hand over to (name)", with a note. For holidays and sick days. */
export function HandOverDialog({ count, onClose }: { count: number; onClose: () => void }) {
  const others = teamNames().filter((name) => name !== state.user.name);
  const [to, setTo] = useState(others[0] ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const give = async (): Promise<void> => {
    setBusy(true);
    const done = await handOver(to, note);
    toast(done ? `${plural(done, 'case')} handed over to ${to}.` : 'Nothing to hand over.');
    onClose();
  };
  return (
    <Dialog title="Hand over" onClose={onClose} actions={<>
      <Button kind="ghost" onClick={onClose}>Cancel</Button>
      <Button kind="primary" disabled={!to || !count || busy} onClick={() => void give()}><Icon name="handover" />{to ? `Hand over to ${to}` : 'Hand over'}</Button>
    </>}>
      <p>Your {plural(count, 'open case')} go to a colleague, for example before a holiday. Your note shows on each of them.</p>
      {others.length ? (
        <Field label="Colleague">
          <select className={inputClass} value={to} onChange={(event) => setTo(event.target.value)}>
            {others.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </Field>
      ) : <p className="rounded-lg bg-amber-soft px-3 py-2 text-amber">Nobody else is on the team list yet. Add your colleagues in Settings, Team.</p>}
      <Field label="Note" hint="For example: on leave until 20 November; the index systems are waiting for a reply.">
        <textarea rows={3} className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
    </Dialog>
  );
}
