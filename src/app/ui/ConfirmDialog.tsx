// The app's own question before an action on many things, in the style of "Remove this load": no grey box of the browser.
import type { ReactNode } from 'react';
import { Button, Dialog } from './basics.tsx';

/** One question, Cancel and one button that names the action. `onConfirm` runs, then the dialog closes. */
export function ConfirmDialog({ title, children, confirm, danger, onConfirm, onClose }: { title: string; children: ReactNode; confirm: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog title={title} onClose={onClose} actions={<>
      <Button kind="ghost" onClick={onClose}>Cancel</Button>
      <Button kind={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>{confirm}</Button>
    </>}>
      <div className="space-y-2 text-ink">{children}</div>
    </Dialog>
  );
}
