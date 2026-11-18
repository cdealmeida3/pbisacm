// The stages of a case of the mapping backlog (D201): the dots with the word of the stage, and the buttons that set it.
import { record } from '../state/journal.ts';
import { toast } from '../state/store.ts';
import { cx } from './basics.tsx';
import type { Stage } from '../../core/mapping/backlog.ts';

/** The steps of a case as dots, the current one filled in the accent colour, and its word. */
export function StageDots({ stages, index }: { stages: Stage[]; index: number }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" data-tip={stages.map((stage, at) => `${at + 1}. ${stage.label}`).join(' · ')}>
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {stages.map((stage, at) => <span key={stage.id} className={cx('size-2 rounded-full ring-1', at < index ? 'bg-grey ring-line-strong' : at === index ? 'bg-accent ring-accent' : 'bg-surface ring-line-strong')} />)}
      </span>
      <span className="text-xs font-semibold">{stages[index]?.label ?? ''}</span>
    </span>
  );
}

/** The buttons that set the stage of a case: one per step of its class, the current one pressed. Any order. */
export function StagePicker({ keys, stages, index }: { keys: string[]; stages: Stage[]; index: number }) {
  const set = (stage: Stage): void => { void record('stage', keys, { text: stage.id }).then(() => toast(`Stage set to ${stage.label}.`)); };
  return (
    <div role="group" aria-label="Stage" className="flex flex-wrap gap-1">
      {stages.map((stage, at) => (
        <button key={stage.id} type="button" aria-pressed={at === index} onClick={() => { if (at !== index) set(stage); }}
          className={cx('rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', at === index ? 'bg-accent-soft text-ink ring-accent' : 'bg-surface text-ink ring-line-strong hover:bg-surface-2')}>
          {at + 1}. {stage.label}
        </button>
      ))}
    </div>
  );
}
