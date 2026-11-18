// My day (version 0.30, build L2 of the new look, D216): the first page. Four boxes of the team's daily work (replies to
// read, reminders due, to escalate, new since the last report), or one line of counters when folded. The numbers are
// worked out in view/myday.ts.
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CHECK_PACKS } from '../../platform/bundle.ts';
import { getReplies } from '../../state/messages.ts';
import { chooseLook } from '../../state/settings.ts';
import { localTime, setFilters, today, update } from '../../state/store.ts';
import { useStore } from '../../state/use-store.ts';
import { BOX_ROWS, myDay } from '../../view/myday.ts';
import { stepWords } from '../../view/groups.ts';
import type { MyDay, MyDayBox, MyDayRow } from '../../view/myday.ts';
import type { CardSummary, SinceReport } from '../../view/cards.ts';
import type { OwnerGroup } from '../../view/groups.ts';
import { ComposeDialog } from '../../ui/ComposeDialog.tsx';
import { Button, Dialog, Icon, cx, plural, shortDate } from '../../ui/basics.tsx';
import { Counter, TABLE } from '../../ui/parts.tsx';
import type { IconName } from '../../ui/icons.ts';

/** "Friday 13 Nov": the day of the page head. */
const dayWords = (iso: string): string => {
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : `${date.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })} ${shortDate(iso)}`;
};

/** "today 09:14", "12 Nov 09:14": when a reply came. */
const replyTime = (at: string): string => {
  const shown = localTime(at);
  return at.slice(0, 10) === today() ? `today ${shown.slice(-5)}` : shown;
};

function whenOf(row: MyDayRow): string {
  if (row.whenKind === 'time') return replyTime(row.when);
  if (row.whenKind === 'asked') return row.when ? `asked ${shortDate(row.when)}` : '';
  if (row.whenKind === 'report') return `since ${shortDate(row.when)}`;
  return row.when;
}

const TOP: Record<string, string> = { violet: 'border-t-violet', amber: 'border-t-amber', red: 'border-t-red', grey: 'border-t-grey-line' };
const ICON_TONE: Record<string, string> = { violet: 'text-violet', amber: 'text-amber', red: 'text-red', grey: 'text-muted' };

/** One box: its title and count, up to three rows, and "All N" when there are more. A box with nothing says so in one line. */
function Box({ id, icon, tone, title, box, empty, all, action, row }: {
  id: string; icon: IconName; tone: 'violet' | 'amber' | 'red' | 'grey'; title: string; box: MyDayBox; empty: string; all: () => void; action?: ReactNode; row: (row: MyDayRow) => ReactNode;
}) {
  return (
    <section aria-label={title} data-myday={id} className={cx('flex min-w-0 flex-col gap-1 rounded-xl border-t-4 bg-surface px-5 pt-3.5 pb-3 shadow-sm', TOP[tone])}>
      <div className="flex min-h-8 items-center gap-2">
        <Icon name={icon} className={cx('size-5', ICON_TONE[tone])} />
        <h2 className="text-base font-bold whitespace-nowrap">{title}</h2>
        {box.total > 0 && <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-2 px-1.5 text-xs font-semibold ring-1 ring-inset ring-line-strong" data-count>{box.total}</span>}
        <span className="flex-1" />
        {action}
      </div>
      {!box.total && <p className="py-2 text-sm text-muted" data-empty>{empty}</p>}
      {box.rows.slice(0, BOX_ROWS).map((one) => (
        <div key={one.key} className="flex min-h-12 min-w-0 items-center gap-3 max-sm:flex-wrap" data-row>
          <div className="flex min-w-0 flex-1 flex-col">
            <b className="text-sm font-semibold whitespace-nowrap max-sm:whitespace-normal">{one.who}</b>
            <span className="text-xs whitespace-nowrap text-muted max-sm:whitespace-normal">{one.what}</span>
          </div>
          <span className="text-xs whitespace-nowrap text-muted">{whenOf(one)}</span>
          {row(one)}
        </div>
      ))}
      {box.total > BOX_ROWS && <Button kind="ghost" small className="self-start" onClick={all}>All {box.total}<Icon name="right" className="size-3.5" /></Button>}
    </section>
  );
}

/** The messages that wait in the outbox, as a window (opened from the counter "1 in outbox"). */
function OutboxDialog({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const nameOf = (email: string): string => store.team.filter((member) => member.email.toLowerCase() === email.toLowerCase())[0]?.name ?? (email.toLowerCase() === store.user.email.toLowerCase() ? store.user.name : email);
  return (
    <Dialog title="Messages in the outbox" onClose={onClose} wide actions={<Button kind="primary" onClick={onClose}>Close</Button>}>
      <p className="text-muted" data-tip="The sending flow sends them and moves them to sent. The days to a reminder start when a message is really sent. If the flow is not set up yet, send from Outlook">Waiting for the sending flow. Refresh to check.</p>
      <table className={TABLE.table}>
        <thead className={TABLE.head}><tr><th className={TABLE.thWindow}>To</th><th className={TABLE.thWindow}>Subject</th><th className={TABLE.thWindow}>By</th><th className={TABLE.thWindow}>When</th></tr></thead>
        <tbody className={TABLE.body}>
          {store.outbox.map((message) => (
            <tr key={message.file} className={TABLE.line}>
              <td className={TABLE.td}>{message.to}</td><td className={TABLE.td}>{message.subject}</td><td className={cx(TABLE.td, 'whitespace-nowrap')}>{nameOf(message.by)}</td><td className={cx(TABLE.td, 'whitespace-nowrap')}>{localTime(message.at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

/** My day folded: one line of counters (Replies, reminders, answered, escalations, outbox). */
function Counters({ day, since, outbox }: { day: MyDay; since: boolean; outbox: () => void }) {
  const store = useStore();
  const folder = store.mode !== 'files';
  return (
    <div className="flex flex-wrap items-center gap-2" data-myday-line>
      {folder && <Button onClick={() => void getReplies()} data-tip="Read the replies the shared mailbox filed"><Icon name="replies" />Get replies</Button>}
      {folder && <Counter icon="bell" text={plural(day.reminders.total, 'reminder')} tone="amber" {...(day.reminders.total ? { onClick: () => setFilters({ due: true }) } : {})} />}
      {folder && <Counter icon="replies" text={`${day.answered} answered`} tone="violet" {...(day.answered ? { onClick: () => update({ view: 'mywork', openCi: '' }) } : {})} />}
      {folder && <Counter icon="escalate" text={plural(day.escalate.total, 'escalation')} tone="red" {...(day.escalate.total ? { onClick: () => setFilters({ escalations: true }) } : {})} />}
      {store.outbox.length > 0 && <Counter icon="outbox" text={`${store.outbox.length} in outbox`} tone="amber" onClick={outbox} />}
      {since && <Counter icon="since" text={`${day.added.toLocaleString('en-GB')} new`} tone="red" {...(day.fresh.total ? { onClick: () => setFilters({ fresh: true }) } : {})} />}
    </div>
  );
}

/** The head of My day: the title, the day, the buttons at the right, and the Reports line under it. */
export function MyDayHead({ reports, right }: { reports: ReactNode; right?: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-[22px] font-bold whitespace-nowrap">My day</h1>
        <span className="text-sm whitespace-nowrap text-muted">{dayWords(today())}</span>
        <span className="flex-1" />
        {right}
      </div>
      {reports}
    </div>
  );
}

/**
 * The page head of My day and its boxes. `reports` is the Reports line of the shell, shown under the title. Without a team
 * folder (report files only) there are no messages: only the box New since the last report.
 */
export function MyDayPage({ cards, since, sinceLine, reports }: { cards: CardSummary[]; since: SinceReport | null; sinceLine: string; reports: ReactNode }) {
  const store = useStore();
  const [writing, setWriting] = useState<OwnerGroup | null>(null);
  const [outbox, setOutbox] = useState(false);
  const day = useMemo(() => myDay({ packs: CHECK_PACKS, groups: store.groups, cases: store.cases, cards, since, people: store.people, settings: store.settings, user: store.user.name, today: today() }),
    [store.groups, store.cases, cards, since, store.people, store.settings, store.user.name]);
  const folder = store.mode !== 'files';
  const folded = store.myDayFolded;
  const write = (row: MyDayRow): void => { if (row.group) setWriting(row.group); };
  const escalateWord = (row: MyDayRow): string => (row.next ? stepWords(row.next).button : 'Escalate');
  return (
    <div className="space-y-4" data-myday-page>
      <MyDayHead reports={reports} right={<>
        {!folded && store.outbox.length > 0 && <Counter icon="outbox" text={`${store.outbox.length} in outbox`} tone="amber" onClick={() => setOutbox(true)} />}
        <Button kind="ghost" onClick={() => chooseLook({ myDayFolded: !folded })} aria-expanded={!folded} data-tip={folded ? 'Show the four boxes of My day' : 'Fold My day into one line'}>
          <Icon name={folded ? 'right' : 'down'} />{folded ? 'Show' : 'Hide'}
        </Button>
      </>} />
      {folded ? <Counters day={day} since={!!since} outbox={() => setOutbox(true)} /> : (
        <div className="grid gap-3.5 min-[1250px]:grid-cols-2">
          {folder && <Box id="replies" icon="replies" tone="violet" title="Replies to read" box={day.replies} empty="No reply to read." all={() => update({ view: 'mywork', openCi: '' })}
            action={<Button small onClick={() => void getReplies()} data-tip="Read the replies the shared mailbox filed"><Icon name="replies" />Get replies</Button>}
            row={(row) => <Button kind="primary" small onClick={() => update({ openCi: row.ciKey, openCard: row.checkId })}><Icon name="replies" />Reply</Button>} />}
          {folder && <Box id="reminders" icon="bell" tone="amber" title="Reminders due" box={day.reminders} empty="No reminder is due." all={() => setFilters({ due: true })}
            row={(row) => <Button small onClick={() => write(row)} disabled={!row.group}><Icon name="remind" />Remind</Button>} />}
          {folder && <Box id="escalate" icon="escalate" tone="red" title="To escalate" box={day.escalate} empty="Nothing to escalate." all={() => setFilters({ escalations: true })}
            row={(row) => <Button small onClick={() => write(row)} disabled={!row.group}><Icon name="escalate" />{escalateWord(row)}</Button>} />}
          <Box id="new" icon="since" tone="grey" title="New since the last report" box={day.fresh} empty={since ? 'Nothing new since the report before.' : 'One report only: nothing to compare with yet.'} all={() => setFilters({ fresh: true })}
            row={(row) => <Button small onClick={() => update({ openCard: row.checkId, openCi: '' })}><Icon name="right" />Open</Button>} />
        </div>
      )}
      {!folded && since && <p className="text-xs text-muted" data-since-total><Icon name="since" className="mr-1 inline size-3.5" />{sinceLine}</p>}
      {writing && <ComposeDialog group={writing} onClose={() => setWriting(null)} />}
      {outbox && <OutboxDialog onClose={() => setOutbox(false)} />}
    </div>
  );
}
