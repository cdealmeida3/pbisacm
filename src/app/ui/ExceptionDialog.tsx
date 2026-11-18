// The Not followed up dialog, opened from a case and from the Audit page.
import { useMemo, useState } from 'react';
import { EXCEPTION_REASONS, addMonths } from '../../core/audit/audit.ts';
import { CHECK_PACKS } from '../platform/bundle.ts';
import { acceptException, addStandingException } from '../state/audit.ts';
import { today } from '../state/store.ts';
import { useStore } from '../state/use-store.ts';
import { Button, Dialog, Field, Icon, inputClass, plural } from './basics.tsx';
import { DateField } from './parts.tsx';

/** Exception accepted: a reason from the short list, a review date (default from Settings) and a note. */
export function ExceptionDialog({ keys, title, onClose, standing }: { keys: string[]; title: string; onClose: () => void; standing?: boolean }) {
  const store = useStore();
  const [reason, setReason] = useState<string>(EXCEPTION_REASONS[0]);
  const [reviewOn, setReviewOn] = useState(addMonths(today(), store.settings.exceptionMonths || 6));
  const [note, setNote] = useState('');
  const [ciName, setCiName] = useState('');
  const [checkId, setCheckId] = useState('*');
  const names = useMemo(() => Array.from(new Set(store.cases.map((item) => item.fact.ciName))).sort().slice(0, 2000), [store.cases]);
  const needsNote = reason === 'Other' && !note.trim();
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(reviewOn) && reviewOn > today() && !needsNote && (!standing || !!ciName.trim());
  const save = async (): Promise<void> => {
    if (standing) await addStandingException(ciName, checkId, reason, reviewOn, note);
    else await acceptException(keys, reason, reviewOn, note);
    onClose();
  };
  return (
    <Dialog title={title} onClose={onClose} actions={<>
      <Button kind="ghost" onClick={onClose}>Cancel</Button>
      <Button kind="primary" disabled={!valid} onClick={() => void save()}><Icon name="stop" />Stop following</Button>
    </>}>
      <p className="text-muted">{standing
        ? 'For a CI that should never be raised, for example a known exception of the SACM instruction. The checks still run; its findings are listed as not followed up.'
        : `The ${plural(keys.length, 'problem')} ${keys.length === 1 ? 'is' : 'are'} not followed up, with this reason, until the review date. Then ${keys.length === 1 ? 'it is' : 'they are'} to solve again.`}</p>
      {standing && <>
        <Field label="CI name" hint="As in ServiceNow. Every CI of this name is covered.">
          <input className={inputClass} list="exception-ci-names" value={ciName} onChange={(event) => setCiName(event.target.value)} />
          <datalist id="exception-ci-names">{names.map((name) => <option key={name} value={name} />)}</datalist>
        </Field>
        <Field label="Check">
          <select className={inputClass} value={checkId} onChange={(event) => setCheckId(event.target.value)}>
            <option value="*">Every check</option>
            {CHECK_PACKS.map((pack) => <option key={pack.id} value={pack.id}>{pack.cardLabel ?? pack.title}</option>)}
          </select>
        </Field>
      </>}
      <Field label="Reason">
        <select className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)}>
          {EXCEPTION_REASONS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </Field>
      <div className="space-y-1">
        <span className="block text-xs font-semibold text-muted">Review date</span>
        <DateField label="Review date" value={reviewOn} min={today()} onChange={setReviewOn} />
        <span className="block text-xs text-muted">{store.settings.exceptionMonths || 6} months from today, as in Settings.</span>
      </div>
      <Field label={reason === 'Other' ? 'Note (needed for Other)' : 'Note'} hint="Who agreed, a request number, a reference.">
        <textarea rows={2} className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <p className="text-xs text-muted">Your name and the time are saved with it.</p>
    </Dialog>
  );
}
