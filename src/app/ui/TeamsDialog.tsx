// Teams chat: the deep link with the text ready, and the confirmation that it was started.
import { useEffect, useState } from 'react';
import { chatMessage, recipientOf } from '../../core/messages/messages.ts';
import { CHECK_PACKS } from '../platform/bundle.ts';
import { messageSettings, recordSent } from '../state/messages.ts';
import { newRef } from '../state/store.ts';
import { colleagueContacts, recheckColleagues } from '../state/team.ts';
import { TEAMS_LIMIT, teamsLink } from '../view/groups.ts';
import type { CardSummary } from '../view/cards.ts';
import type { OwnerGroup } from '../view/groups.ts';
import { DoubleContactBox } from './people.tsx';
import type { DoubleContact } from '../../core/team/team.ts';
import { Button, Dialog, Field, Icon, Why, inputClass, plural } from './basics.tsx';

/**
 * "Teams chat": opens Teams with a new chat with the person asked, as the email does (D163), and a first message written
 * for a chat. The other people of the group can be added, or get a chat of their own.
 * The app does not connect to Teams. It cannot see the chat, so the manager confirms that it was started.
 */
export function TeamsDialog({ group, card, onClose, onEmail }: { group: OwnerGroup; card: CardSummary; onClose: () => void; onEmail: () => void }) {
  const withEmail = group.people.filter((person) => person.email && person.active !== false);
  // The chat opens with the person asked only; the others are listed and can be ticked.
  const settings = messageSettings();
  const askedEmails = new Set(group.open.map((item) => recipientOf(item.fact, settings).email.toLowerCase()).filter(Boolean));
  const asked = withEmail.filter((person) => askedEmails.has(person.email.toLowerCase()));
  const [chosen, setChosen] = useState<Set<string>>(() => new Set((asked.length ? asked.slice(0, 1) : withEmail.slice(0, 1)).map((person) => person.id)));
  const first = withEmail.filter((person) => chosen.has(person.id))[0] ?? asked[0];
  const lastRef = group.open.map((item) => item.messages[item.messages.length - 1]?.ref ?? '').filter(Boolean).sort().pop();
  const [ref] = useState(() => lastRef ?? newRef());
  const [topic, setTopic] = useState(`SACM: ${card.label} on ${plural(group.open.length ? new Set(group.open.map((item) => item.fact.ciKey)).size : group.rows.length, 'CI')} [${ref}]`);
  const [message, setMessage] = useState(() => chatMessage(group.open, CHECK_PACKS, settings, ref, first?.email ?? ''));
  const [opened, setOpened] = useState(false);
  const [done, setDone] = useState(false);
  const emails = withEmail.filter((person) => chosen.has(person.id)).map((person) => person.email);
  const tooMany = emails.length > TEAMS_LIMIT;
  // The chat is recorded on the cases of the people in it (all the open cases when none of them is the person asked).
  const inChat = new Set(emails.map((email) => email.toLowerCase()));
  const theirs = group.open.filter((item) => inChat.has(recipientOf(item.fact, settings).email.toLowerCase()));
  const keys = (theirs.length ? theirs : group.open).map((item) => item.key);
  const contacted = group.memory.emails + group.memory.reminders + group.memory.teams > 0;
  const [found, setFound] = useState<DoubleContact[]>([]);
  // Pressing "Teams chat" reads the colleagues' journals again, like "Email the group".
  useEffect(() => {
    let live = true;
    void recheckColleagues().then(() => { if (live) setFound(colleagueContacts(withEmail.map((person) => person.email), keys)); });
    return () => { live = false; };
  }, []);

  const confirm = async (): Promise<void> => {
    await recordSent(keys, [], { ref, to: emails.join('; '), subject: topic, kind: contacted ? 'reminder' : 'first', channel: 'teams', text: message });
    setDone(true);
  };

  return (
    <Dialog title="Teams chat" onClose={onClose} wide actions={done ? <Button kind="primary" onClick={onClose}>Close</Button> : opened ? <>
      <span className="mr-auto text-sm whitespace-nowrap text-muted">Did you start the chat?</span>
      <Button kind="secondary" onClick={() => setOpened(false)}>No</Button>
      <Button kind="primary" onClick={() => void confirm()}>Yes</Button>
    </> : <>
      <Button kind="ghost" className="mr-auto" onClick={onEmail} data-tip="Write an email instead of a chat"><Icon name="mail" />Email</Button>
      {!emails.length && <Why>Tick a person first</Why>}
      <Button kind="ghost" onClick={onClose}>Cancel</Button>
      <a href={teamsLink(emails, topic, message)} target="_blank" rel="noreferrer" onClick={() => setOpened(true)} aria-disabled={!emails.length} data-tip="Open a new chat in Teams with this message"
        className={`inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold whitespace-nowrap text-on-accent hover:bg-accent-hover ${emails.length ? '' : 'pointer-events-none opacity-40'}`}>
        <Icon name="teams" />Teams
      </a>
    </>}>
      {!done && <DoubleContactBox found={found} keys={keys} onGiven={onClose} onAnyway={() => setFound([])} anywayLabel="Chat anyway" />}
      {done ? <p className="rounded-lg bg-green-soft px-3 py-2 text-green"><Icon name="ok" className="mr-1 inline size-4" />Recorded as a Teams contact on {plural(new Set((theirs.length ? theirs : group.open).map((item) => item.fact.ciKey)).size, 'CI')}. It counts like a message for the reminder.</p> : <>
        <p className="text-muted">Teams opens a new chat with this message. Send it there; the app asks you afterwards.</p>
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-xs font-semibold text-muted">People in the chat</legend>
          {withEmail.map((person) => (
            <label key={person.id} className="flex min-h-6 items-center gap-2">
              <input type="checkbox" className="size-[18px] accent-accent" checked={chosen.has(person.id)} onChange={(event) => {
                const next = new Set(chosen);
                if (event.target.checked) next.add(person.id); else next.delete(person.id);
                setChosen(next);
              }} />
              <span>{person.name}</span><span className="text-xs text-muted">{person.email}{askedEmails.has(person.email.toLowerCase()) ? ' · asked' : ''}</span>
              {!chosen.has(person.id) && <a href={teamsLink([person.email], topic, chatMessage(group.open, CHECK_PACKS, settings, ref, person.email))} target="_blank" rel="noreferrer" className="text-xs font-semibold text-accent underline decoration-dotted">Chat</a>}
            </label>
          ))}
          {withEmail.length === 0 && <p className="text-amber">Nobody in this group has an email address.</p>}
        </fieldset>
        {tooMany && <p className="rounded-lg bg-amber-soft px-3 py-2 text-amber" data-tip={`A Teams link works well up to about ${TEAMS_LIMIT} people`}>{emails.length} people is a lot for one chat. An email is better here.</p>}
        <Field label="Chat name"><input className={inputClass} value={topic} onChange={(event) => setTopic(event.target.value)} /></Field>
        <Field label="First message" hint="Nothing is sent until you press send in Teams.">
          <textarea rows={8} className={inputClass} value={message} onChange={(event) => setMessage(event.target.value)} />
        </Field>
      </>}
    </Dialog>
  );
}
