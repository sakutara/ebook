import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaveScheduler } from '../../src/progress/save-scheduler';

describe('save-scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('progress.save.relocate: 5 pushes within 1 s produce one save with the last item', () => {
    const save = vi.fn();
    const scheduler = createSaveScheduler<number>(save, 1000);

    for (let i = 1; i <= 5; i++) {
      scheduler.push(i);
      if (i < 5) vi.advanceTimersByTime(200);
    }
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(5);
  });

  it('progress.save.hidden: flush 200 ms after a push saves immediately', async () => {
    const save = vi.fn();
    const scheduler = createSaveScheduler<string>(save, 1000);

    scheduler.push('a');
    vi.advanceTimersByTime(200);
    await scheduler.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('a');

    vi.advanceTimersByTime(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('save-scheduler: flush with nothing pending does not save', async () => {
    const save = vi.fn();
    const scheduler = createSaveScheduler<string>(save, 1000);

    await expect(scheduler.flush()).resolves.toBeUndefined();
    expect(save).not.toHaveBeenCalled();
  });

  it('save-scheduler: cancel drops the pending item', () => {
    const save = vi.fn();
    const scheduler = createSaveScheduler<string>(save, 1000);

    scheduler.push('x');
    scheduler.cancel();
    vi.advanceTimersByTime(5000);
    expect(save).not.toHaveBeenCalled();
  });

  it('save-scheduler: a failing save does not throw from flush', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const save = vi.fn().mockRejectedValue(new Error('disk full'));
    const scheduler = createSaveScheduler<string>(save, 1000);

    scheduler.push('boom');
    await expect(scheduler.flush()).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledWith('boom');
    expect(warn).toHaveBeenCalled();

    // pending was cleared: a later flush does not retry the save
    await scheduler.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
