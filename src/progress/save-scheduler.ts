export interface SaveScheduler<T> {
  push(item: T): void;
  flush(): Promise<void>;
  cancel(): void;
}

interface Pending<T> {
  item: T;
}

/**
 * Trailing-debounce scheduler. `push` remembers the latest item and (re)starts
 * a timer; when the timer fires the pending item is saved once. `flush` saves
 * pending work immediately, `cancel` drops it. Save errors are logged and
 * swallowed so the reader never crashes.
 */
export function createSaveScheduler<T>(
  save: (item: T) => Promise<void> | void,
  delayMs = 1000,
): SaveScheduler<T> {
  let pending: Pending<T> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const takePending = (): Pending<T> | null => {
    const current = pending;
    pending = null;
    return current;
  };

  const run = async (item: T): Promise<void> => {
    try {
      await save(item);
    } catch (err) {
      console.warn('[save-scheduler] save failed', err);
    }
  };

  return {
    push(item: T): void {
      pending = { item };
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        const current = takePending();
        if (current) void run(current.item);
      }, delayMs);
    },

    flush(): Promise<void> {
      clearTimer();
      const current = takePending();
      if (!current) return Promise.resolve();
      return run(current.item);
    },

    cancel(): void {
      clearTimer();
      pending = null;
    },
  };
}
