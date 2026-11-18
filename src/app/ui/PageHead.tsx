// The head of a page: the way back, the title, a line of text and the page's buttons.
import type { ReactNode } from 'react';
import { state, update } from '../state/store.ts';
import { Icon } from './basics.tsx';

export function PageHead({ title, text, children, back = 'overview' }: { title: string; text: string; children?: ReactNode; back?: 'overview' | 'mywork' | 'activity' | 'audit' | 'contracts' | 'backlog' }) {
  return (
    <div className="space-y-3">
      <nav className="flex items-center gap-1 text-sm text-muted">
        <button type="button" onClick={() => update({ view: back, openCard: back === 'overview' ? state.openCard : '' })} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-surface-2 hover:text-ink">
          <Icon name="back" className="size-4" />{back === 'overview' ? 'My day' : back === 'mywork' ? 'My work' : back === 'audit' ? 'Audit' : back === 'contracts' ? 'Contract changes' : back === 'backlog' ? 'Mapping backlog' : 'Activity'}
        </button>
        <Icon name="right" className="size-3.5" /><span className="text-ink">{title}</span>
      </nav>
      <div className="flex flex-wrap items-start gap-3 rounded-xl bg-surface p-4 shadow-sm ring-1 ring-line">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-muted">{text}</p>
        </div>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  );
}
