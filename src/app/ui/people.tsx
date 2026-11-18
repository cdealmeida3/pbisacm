// Shared parts about people: the link to a person's page, the Assign menu, and the warning before a double contact.
import { useState } from 'react';
import { DOUBLE_CONTACT_HOURS } from '../../core/team/team.ts';
import { record, recordAll } from '../state/journal.ts';
import { messageText } from '../state/messages.ts';
import { localTime, state, toast } from '../state/store.ts';
import { openPerson, teamNames } from '../state/team.ts';
import { useStore } from '../state/use-store.ts';
import { Button, Icon, cx } from './basics.tsx';
import { MenuButton, MenuItem, MenuLine } from './parts.tsx';
import type { DoubleContact } from '../../core/team/team.ts';

/** A person's name that opens their page (everything open with them). */
export function PersonLink({ id, name, className, title }: { id: string; name: string; className?: string; title?: string }) {
  if (!id) return <span className={className}>{name}</span>;
  return (
    <button type="button" data-tip={title ?? `Everything open with ${name}`} className={cx('inline-flex min-h-6 items-center text-left underline decoration-line-strong decoration-dotted underline-offset-2 hover:decoration-solid hover:decoration-current', className)}
      onClick={(event) => { event.stopPropagation(); openPerson(id); }}>
      {name}
    </button>
  );
}

/**
 * The lines of a menu that give cases to somebody (L3): Take (to me), then "Assign to" and each colleague of the team
 * list, and Nobody when somebody has them. `close` closes the menu.
 */
export function AssignItems({ keys, current, close }: { keys: string[]; current: string; close: () => void }) {
  useStore();
  const names = teamNames().filter((name) => name !== current && name !== state.user.name);
  const give = (name: string): void => { close(); void record('assign', keys, { text: name }).then(() => toast(name ? `Assigned to ${name}.` : 'Assigned to nobody.')); };
  return <>
    {current !== state.user.name && <MenuItem icon="take" label="Take" tip="Assign to me" onClick={() => give(state.user.name)} />}
    {(names.length > 0 || !!current) && <MenuLine heading="Assign to" />}
    {names.map((name) => <MenuItem key={name} icon="assign" label={name} onClick={() => give(name)} />)}
    {current && <MenuItem icon="minus" label="Nobody" tip="Take the assignment away" onClick={() => give('')} />}
  </>;
}

/** The Assign menu: Take, and the colleagues of the team list. `current`: who has the cases now (shown in the tooltip). */
export function AssignMenu({ keys, current, label = 'Assign', up }: { keys: string[]; current: string; label?: string; up?: boolean }) {
  if (!keys.length) return null;
  return (
    <MenuButton label={label} icon="assign" kind="secondary" caret up={up} tip={current && current !== 'Several' ? `Assigned to ${current}` : current ? 'Assigned to several people' : 'Assigned to nobody'}>
      {(close) => <AssignItems keys={keys} current={current} close={close} />}
    </MenuButton>
  );
}

const when = (at: string): string => {
  const date = new Date(`${at.slice(0, 19)}Z`);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const time = localTime(at).split(' ').pop();
  if (date.toDateString() === today.toDateString()) return `today at ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `yesterday at ${time}`;
  return `on ${localTime(at)}`;
};

/**
 * The warning before a double contact (U071): one line per colleague who wrote to the same person, or about the same CIs,
 * not long ago, and three ways on: Open the colleague's message, Give my CIs to the colleague for their reminder, or Write
 * anyway. How far back the app looks is the tooltip of the line.
 */
export function DoubleContactBox({ found, keys, onAnyway, onGiven, anywayLabel = 'Write anyway' }: { found: DoubleContact[]; keys: string[]; onAnyway: () => void; onGiven: () => void; anywayLabel?: string }) {
  const [shown, setShown] = useState<Record<string, string>>({});
  if (!found.length) return null;
  const show = async (item: DoubleContact): Promise<void> => {
    const text = await messageText(item.event);
    setShown({ ...shown, [item.event.id]: text || 'The text of this message is not in the folder (it was sent from Outlook or Teams).' });
  };
  const give = async (item: DoubleContact): Promise<void> => {
    const name = item.event.byName || item.event.by;
    await recordAll([
      { type: 'assign', keys, values: { text: name } },
      { type: 'note', keys, values: { text: `Given to ${name} to add to the reminder after ${item.event.ref ?? 'their message'}.` } }
    ]);
    toast(`Given to ${name}, with a note.`);
    onGiven();
  };
  const lookBack = `The app looks back ${DOUBLE_CONTACT_HOURS} hours. A colleague's work can take a few minutes to arrive through OneDrive.`;
  return (
    <div role="alert" className="space-y-2 rounded-xl bg-amber-soft p-3 text-sm text-ink ring-1 ring-amber-line">
      {found.map((item, index) => {
        const name = item.event.byName || item.event.by;
        const cis = item.sameCis ? (item.sameCis === 1 ? '1 of these CIs' : `${item.sameCis} of these CIs`) : 'these CIs';
        const what = item.samePerson ? 'wrote to this person' : `wrote about ${cis}`;
        const about = item.samePerson && item.sameCis ? ` about ${cis}` : '';
        const first = name.split(/\s+/)[0] ?? name;
        return (
          <div key={item.event.id} className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1" data-tip={lookBack}><Icon name="warn" className="mr-1 inline size-4 text-amber" /><b>{name}</b> {what} {when(item.event.at)}{about}{item.event.channel === 'teams' ? ' (Teams chat)' : ''}.</p>
              <Button small onClick={() => void show(item)} data-tip={`Open the message of ${name}`}><Icon name="replies" className="size-3.5" />Open</Button>
              <Button small onClick={() => void give(item)} data-tip={`Give my CIs to ${name} for their reminder, with a note`}><Icon name="handover" className="size-3.5" />Give to {first}</Button>
              {index === found.length - 1 && <Button small onClick={onAnyway}>{anywayLabel}</Button>}
            </div>
            {shown[item.event.id] !== undefined && (
              <div className="rounded-lg bg-surface p-2 text-xs text-ink ring-1 ring-amber-line">
                <p className="font-semibold">{item.event.subject}</p>
                <p className="text-muted">To {item.event.to}{item.event.cc ? `, Cc ${item.event.cc}` : ''} · {item.event.ref}</p>
                <pre className="mt-1 max-h-48 overflow-y-auto font-sans whitespace-pre-wrap">{shown[item.event.id]}</pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
