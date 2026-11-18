// SACM's hand work in ServiceNow (build W5): open the record of a line there, and copy the value to set. The app never writes to ServiceNow.
import type { MouseEvent } from 'react';
import { recordSearch } from '../../core/cases/record-search.ts';
import type { SearchFact } from '../../core/cases/record-search.ts';
import { toast } from '../state/store.ts';
import { useStore } from '../state/use-store.ts';
import { Button, Icon } from './basics.tsx';

/** The first words of a value, for a toast or a tooltip: a long description is not repeated in full. */
const shortOf = (value: string): string => (value.length > 60 ? `${value.slice(0, 57).trimEnd()} (and more)` : value);

/** Copies one value to set (D243). A click on it does not open the line. */
export function CopyValue({ value, what }: { value: string; what: string }) {
  const copy = (event: MouseEvent): void => {
    event.stopPropagation();
    void navigator.clipboard.writeText(value).then(() => toast(`Copied: ${shortOf(value)}`), () => toast('The copy did not work. Select the text and copy it.'));
  };
  return <Button small kind="ghost" onClick={copy} aria-label={`Copy the value for ${what}`} data-tip={`Copy "${shortOf(value)}"`} data-copy><Icon name="copy" />Copy</Button>;
}

/**
 * Opens the record of a line in the ServiceNow of the team, in a new tab (D244): a list of its table filtered on its
 * name. Nothing when the address is not set in Settings.
 */
export function ServiceNowLink({ fact, what }: { fact: SearchFact; what: string }) {
  const store = useStore();
  const link = recordSearch(store.settings.serviceNowAddress ?? '', fact);
  if (!link) return null;
  return (
    <a href={link} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} aria-label={`Find ${what} in ServiceNow`} data-tip="Find the record in ServiceNow, in a new tab" data-servicenow
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold whitespace-nowrap text-accent ring-1 ring-inset ring-line-strong transition hover:bg-surface-2">
      <Icon name="link" />ServiceNow
    </a>
  );
}
