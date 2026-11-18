// The strips above the screens: Since your last visit, and what the app tidied in the team folder.
import { closeFolderNotes } from '../state/folder.ts';
import { update } from '../state/store.ts';
import { useStore } from '../state/use-store.ts';
import { Button, Icon, IconButton } from '../ui/basics.tsx';

const dayWords = (at: string): string => {
  const date = new Date(`${at.slice(0, 19)}Z`);
  if (Number.isNaN(date.getTime())) return at;
  return `${date.toLocaleDateString('en-GB', { weekday: 'long' })} ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

/** Since your last visit: a short strip when the app opens. */
export function SinceStrip() {
  const store = useStore();
  if (!store.since) return null;
  return (
    <div role="note" className="flex flex-wrap items-start gap-2 rounded-xl bg-blue-soft px-4 py-2.5 text-sm text-blue ring-1 ring-blue-line">
      <Icon name="clock" className="mt-0.5 size-4" />
      <p className="flex-1"><b>Since {dayWords(store.since.at)}:</b> {store.since.lines.join(', ')}.</p>
      <Button small kind="ghost" onClick={() => update({ view: 'activity' })}>Activity</Button>
      <Button small kind="ghost" aria-label="Close" onClick={() => update({ since: null })}><Icon name="close" className="size-3.5" /></Button>
    </div>
  );
}

/** What the app tidied in the team folder (conflict copies), until closed. */
export function FolderNotes() {
  const store = useStore();
  if (!store.folderNotes.length) return null;
  return (
    <div role="note" className="flex items-start gap-2 rounded-xl bg-amber-soft px-4 py-2.5 text-sm text-amber ring-1 ring-amber-line">
      <Icon name="warn" className="mt-0.5 size-4" />
      <div className="flex-1 space-y-0.5">{store.folderNotes.map((note) => <p key={note}>{note}</p>)}</div>
      <IconButton icon="close" label="Close" onClick={closeFolderNotes} />
    </div>
  );
}
