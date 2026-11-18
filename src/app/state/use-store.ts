import { useSyncExternalStore } from 'react';
import { state, storeVersion, subscribe } from './store.ts';

/* The one link between the state and React. The rest of src/app/state/ does not import React, so it runs under node:test. */

/** Re-renders the component whenever the state changes. */
export function useStore(): typeof state { useSyncExternalStore(subscribe, storeVersion); return state; }
