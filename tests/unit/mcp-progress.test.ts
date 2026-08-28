import { describe, it, expect, vi } from 'vitest';
import { makeProgressReporter } from '../../src/utils/mcp-progress.js';

const v2Context = (progressToken?: string | number) => {
  const notify = vi.fn().mockResolvedValue(undefined);
  return {
    ctx: {
      sessionId: 'sess',
      mcpReq: {
        id: 1,
        method: 'tools/call',
        ...(progressToken !== undefined ? { _meta: { progressToken } } : {}),
        notify,
      },
      http: {},
    } as any,
    notify,
  };
};

const v1Extra = (progressToken?: string | number) => {
  const sendNotification = vi.fn().mockResolvedValue(undefined);
  return {
    extra: {
      ...(progressToken !== undefined ? { _meta: { progressToken } } : {}),
      sendNotification,
    } as any,
    sendNotification,
  };
};

describe('makeProgressReporter — SDK v2 context', () => {
  it('emits notifications/progress through ctx.mcpReq.notify', () => {
    const { ctx, notify } = v2Context('tok-1');

    makeProgressReporter(ctx)(0, 1, 'fetching');

    expect(notify).toHaveBeenCalledWith({
      method: 'notifications/progress',
      params: { progressToken: 'tok-1', progress: 0, total: 1, message: 'fetching' },
    });
  });

  it('omits total and message when the caller does not pass them', () => {
    const { ctx, notify } = v2Context(7);

    makeProgressReporter(ctx)(3);

    expect(notify).toHaveBeenCalledWith({
      method: 'notifications/progress',
      params: { progressToken: 7, progress: 3 },
    });
  });

  it('stays a no-op when the client did not opt in with a progressToken', () => {
    const { ctx, notify } = v2Context();

    makeProgressReporter(ctx)(1, 1, 'done');

    expect(notify).not.toHaveBeenCalled();
  });

  it('swallows transport rejections — progress is best-effort', async () => {
    const { ctx, notify } = v2Context('tok-2');
    notify.mockRejectedValue(new Error('stream already closed'));

    expect(() => makeProgressReporter(ctx)(1, 1)).not.toThrow();
    await Promise.resolve();
  });
});

describe('makeProgressReporter — SDK v1 extra', () => {
  it('still emits through extra.sendNotification', () => {
    const { extra, sendNotification } = v1Extra('legacy-tok');

    makeProgressReporter(extra)(1, 2, 'half');

    expect(sendNotification).toHaveBeenCalledWith({
      method: 'notifications/progress',
      params: { progressToken: 'legacy-tok', progress: 1, total: 2, message: 'half' },
    });
  });

  it('prefers the v2 context when a bag carries both shapes', () => {
    const { notify } = v2Context('v2-tok');
    const sendNotification = vi.fn().mockResolvedValue(undefined);
    const both: any = {
      _meta: { progressToken: 'v1-tok' },
      sendNotification,
      mcpReq: { _meta: { progressToken: 'v2-tok' }, notify },
    };

    makeProgressReporter(both)(1);

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ progressToken: 'v2-tok' }) }),
    );
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('stays a no-op when a token is present but no transport is', () => {
    expect(() => makeProgressReporter({ _meta: { progressToken: 'x' } } as any)(1)).not.toThrow();
  });
});
