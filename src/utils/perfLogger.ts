export interface PerfStatsSnapshot {
  appStartMs: number;
  loginScreenMs: number | null;
  loginClickToDashboardMs: number | null;
  firestoreReads: number;
  firestoreWrites: number;
  activeListeners: number;
  peakListeners: number;
  listenerHistory: Array<{ name: string; action: 'attach' | 'detach'; atMs: number; activeCount: number }>;
  screenReads: Record<string, { reads: number; writes: number; listeners: number }>;
  timings: Record<string, number[]>;
}

const IS_DEV = Boolean((import.meta as any)?.env?.DEV);

let currentScreen = 'startup';
let loginClickTime: number | null = null;
const activeTimerStarts = new Map<string, number>();

const state: PerfStatsSnapshot = {
  appStartMs: typeof performance !== 'undefined' ? performance.now() : 0,
  loginScreenMs: null,
  loginClickToDashboardMs: null,
  firestoreReads: 0,
  firestoreWrites: 0,
  activeListeners: 0,
  peakListeners: 0,
  listenerHistory: [],
  screenReads: {},
  timings: {},
};

function ensureScreenBucket(screen: string) {
  if (!state.screenReads[screen]) {
    state.screenReads[screen] = { reads: 0, writes: 0, listeners: 0 };
  }
  return state.screenReads[screen];
}

export function perfSetScreen(screen: string): void {
  if (!IS_DEV) return;
  currentScreen = screen || 'unknown';
  ensureScreenBucket(currentScreen);
}

export function perfMarkLoginScreenVisible(): void {
  if (!IS_DEV || state.loginScreenMs !== null) return;
  state.loginScreenMs = Math.round(performance.now());
  console.info(`[SAT PERF] App start -> Login screen: ${state.loginScreenMs} ms`);
}

export function perfMarkLoginClicked(): void {
  if (!IS_DEV) return;
  loginClickTime = performance.now();
}

export function perfMarkDashboardVisible(): void {
  if (!IS_DEV) return;
  if (loginClickTime !== null && state.loginClickToDashboardMs === null) {
    state.loginClickToDashboardMs = Math.round(performance.now() - loginClickTime);
    console.info(
      `[SAT PERF] Login click -> Dashboard visible: ${state.loginClickToDashboardMs} ms | Startup reads: ${state.firestoreReads} | Active listeners: ${state.activeListeners}`
    );
  }
}

export function perfTrackRead(
  docCountOrLabel: number | string = 1,
  labelOrCount?: string | number
): void {
  if (!IS_DEV) return;
  const count =
    typeof docCountOrLabel === 'number'
      ? Math.max(0, docCountOrLabel)
      : typeof labelOrCount === 'number'
        ? Math.max(0, labelOrCount)
        : 1;
  const label =
    typeof docCountOrLabel === 'string'
      ? docCountOrLabel
      : typeof labelOrCount === 'string'
        ? labelOrCount
        : undefined;
  state.firestoreReads += count;
  ensureScreenBucket(currentScreen).reads += count;
  if (label && count >= 25) {
    console.debug(`[SAT PERF] Read (${label}): ${count} docs on [${currentScreen}]`);
  }
}

export function perfTrackWrite(
  writeCountOrLabel: number | string = 1,
  labelOrCount?: string | number
): void {
  if (!IS_DEV) return;
  const count =
    typeof writeCountOrLabel === 'number'
      ? Math.max(0, writeCountOrLabel)
      : typeof labelOrCount === 'number'
        ? Math.max(0, labelOrCount)
        : 1;
  state.firestoreWrites += count;
  ensureScreenBucket(currentScreen).writes += count;
}

export function perfTrackListener(name: string): () => void {
  if (!IS_DEV) return () => {};
  state.activeListeners += 1;
  if (state.activeListeners > state.peakListeners) {
    state.peakListeners = state.activeListeners;
  }
  ensureScreenBucket(currentScreen).listeners += 1;
  state.listenerHistory.push({
    name,
    action: 'attach',
    atMs: Math.round(performance.now()),
    activeCount: state.activeListeners,
  });
  let detached = false;
  return () => {
    if (detached) return;
    detached = true;
    state.activeListeners = Math.max(0, state.activeListeners - 1);
    state.listenerHistory.push({
      name,
      action: 'detach',
      atMs: Math.round(performance.now()),
      activeCount: state.activeListeners,
    });
  };
}

export function trackFirestoreRead(
  op: string,
  target: string,
  count: number = 1,
  fromCache: boolean = false
): void {
  if (!IS_DEV) return;
  if (fromCache) return;
  perfTrackRead(count, `${op}:${target}`);
}

export function trackFirestoreWrite(op: string, target: string, count: number = 1): void {
  if (!IS_DEV) return;
  perfTrackWrite(count, `${op}:${target}`);
}

export function trackListenerOpen(label: string): () => void {
  return perfTrackListener(label);
}

export function perfStartTimer(name: string): void {
  if (!IS_DEV) return;
  activeTimerStarts.set(name, performance.now());
}

export function perfEndTimer(name: string, meta?: string): number {
  if (!IS_DEV) return 0;
  const start = activeTimerStarts.get(name);
  if (start === undefined) return 0;
  activeTimerStarts.delete(name);
  const elapsed = Math.round(performance.now() - start);
  if (!state.timings[name]) state.timings[name] = [];
  state.timings[name].push(elapsed);
  console.info(`[SAT PERF] ${name}: ${elapsed} ms${meta ? ` (${meta})` : ''}`);
  return elapsed;
}

export async function perfTimeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!IS_DEV) return fn();
  perfStartTimer(name);
  try {
    return await fn();
  } finally {
    perfEndTimer(name);
  }
}

export function getPerfSnapshot(): PerfStatsSnapshot {
  return {
    ...state,
    listenerHistory: [...state.listenerHistory],
    screenReads: { ...state.screenReads },
    timings: { ...state.timings },
  };
}

export function resetPerfStats(): void {
  if (!IS_DEV) return;
  state.firestoreReads = 0;
  state.firestoreWrites = 0;
  state.listenerHistory = [];
  state.screenReads = {};
  state.timings = {};
  state.loginClickToDashboardMs = null;
  loginClickTime = null;
}

if (IS_DEV && typeof window !== 'undefined') {
  (window as any).__SAT_PERF__ = {
    getSummary: getPerfSnapshot,
    logSummary: () => console.table(getPerfSnapshot().screenReads),
    reset: resetPerfStats,
  };
}
