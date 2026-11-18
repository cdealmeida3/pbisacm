import { settingsLines } from '../view/setup.ts';
import { record } from './journal.ts';
import { changed, rebuild, state } from './store.ts';
import { markVisit, saveTeam } from './team.ts';
import type { CardsAs, Settings, User } from './store.ts';

/**
 * Who is working (kept in this browser) and the team settings (data/settings.json). A change of the settings is a journal line.
 */

export async function saveSettings(user: User, settings: Settings | null, addToTeam = false): Promise<void> {
  // A known email gets the name of the team list, so one person never becomes two.
  const known = state.team.filter((member) => member.email.toLowerCase() === user.email.toLowerCase())[0];
  if (known) user = { name: known.name, email: user.email };
  const firstTime = !state.user.email;
  state.user = user;
  if (firstTime) markVisit();
  if (addToTeam && !known) await saveTeam(state.team.concat([user]));
  try { localStorage.setItem('sacm-workbench.user', JSON.stringify(user)); } catch { /* private window */ }
  if (settings) {
    // Only the fields that changed are recorded, by the label of the screen; a save that changes nothing writes nothing (F54).
    const lines = settingsLines(state.settings, settings);
    const repair = state.unusableSettings.length > 0;
    state.settings = settings;
    if (lines.length || repair) { await state.workspace!.writeText('data/settings.json', JSON.stringify(settings)); state.unusableSettings = []; }
    if (lines.length) await record('settings', [], { text: `Team settings changed. ${lines.join('; ')}` });
  }
  state.askUser = false;
  rebuild();
}

export function rememberedUser(): void {
  try { const saved = JSON.parse(localStorage.getItem('sacm-workbench.user') ?? '') as User; if (saved && saved.email) state.user = saved; } catch { /* first visit */ }
  try {
    state.cardsAs = localStorage.getItem(VIEW_KEY) === 'lines' ? 'lines' : 'cards';
    state.myDayFolded = localStorage.getItem(FOLD_KEY) === 'folded';
  } catch { /* private window */ }
}

const VIEW_KEY = 'sacm-workbench.cards-as';
const FOLD_KEY = 'sacm-workbench.my-day';

/** Cards or Lines, and My day folded or open: kept in this browser only, per person and computer (D217). */
export function chooseLook(values: { cardsAs?: CardsAs; myDayFolded?: boolean }): void {
  if (values.cardsAs) state.cardsAs = values.cardsAs;
  if (values.myDayFolded !== undefined) state.myDayFolded = values.myDayFolded;
  try {
    localStorage.setItem(VIEW_KEY, state.cardsAs);
    localStorage.setItem(FOLD_KEY, state.myDayFolded ? 'folded' : 'open');
  } catch { /* private window */ }
  changed();
}
