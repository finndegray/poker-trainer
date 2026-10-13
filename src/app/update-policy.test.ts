import { describe, expect, it, vi } from 'vitest';
import { createUpdatePolicy } from './update-policy';

function setup(hidden = false) {
  const calls: string[] = [];
  const state = { hidden };
  const deps = {
    flush: vi.fn(async () => {
      calls.push('flush');
    }),
    reload: vi.fn(() => {
      calls.push('reload');
    }),
    activate: vi.fn(async () => {
      calls.push('activate');
    }),
    isHidden: () => state.hidden,
    showNotice: vi.fn(() => {
      calls.push('notice');
    }),
  };
  return { policy: createUpdatePolicy(deps), deps, calls, state };
}

describe('update policy', () => {
  it('shows the notice when a new version is waiting, without activating it', () => {
    const { policy, deps } = setup();
    policy.onNeedRefresh();
    expect(deps.showNotice).toHaveBeenCalledOnce();
    expect(deps.activate).not.toHaveBeenCalled();
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('does not reload a visible tab when the new version takes control', async () => {
    const { policy, deps, calls } = setup(false);
    await policy.onNeedReload();
    expect(deps.reload).not.toHaveBeenCalled();
    expect(calls).toEqual(['flush', 'notice']);
  });

  it('reloads after flushing when the tab is hidden', async () => {
    const { policy, calls } = setup(true);
    await policy.onNeedReload();
    expect(calls).toEqual(['flush', 'reload']);
  });

  it('reloads a deferred update once the tab becomes hidden', async () => {
    const { policy, deps, calls, state } = setup(false);
    await policy.onNeedReload();
    state.hidden = true;
    await policy.onHidden();
    expect(deps.reload).toHaveBeenCalledOnce();
    expect(calls.slice(-2)).toEqual(['flush', 'reload']);
  });

  it('does not reload a deferred update when the tab became visible again during the flush', async () => {
    const { policy, deps, calls, state } = setup(false);
    await policy.onNeedReload();
    state.hidden = true;
    deps.flush.mockImplementationOnce(async () => {
      calls.push('flush');
      state.hidden = false;
    });
    await policy.onHidden();
    expect(deps.reload).not.toHaveBeenCalled();

    state.hidden = true;
    await policy.onHidden();
    expect(deps.reload).toHaveBeenCalledOnce();
  });

  it('activates a waiting version when the tab becomes hidden', async () => {
    const { policy, deps, calls } = setup(false);
    policy.onNeedRefresh();
    await policy.onHidden();
    expect(calls).toEqual(['notice', 'flush', 'activate']);
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('does nothing on hide without an update', async () => {
    const { policy, calls } = setup(false);
    await policy.onHidden();
    expect(calls).toEqual([]);
  });

  it('applies on request: flush, activate, then reload even though the tab is visible', async () => {
    const { policy, calls } = setup(false);
    policy.onNeedRefresh();
    await policy.applyNow();
    expect(calls).toEqual(['notice', 'flush', 'activate']);
    await policy.onNeedReload();
    expect(calls.slice(-2)).toEqual(['flush', 'reload']);
  });

  it('reloads directly on request when the new version already took control', async () => {
    const { policy, deps, calls } = setup(false);
    await policy.onNeedReload();
    await policy.applyNow();
    expect(deps.activate).not.toHaveBeenCalled();
    expect(calls.slice(-2)).toEqual(['flush', 'reload']);
  });
});
