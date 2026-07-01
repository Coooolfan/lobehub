// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { credsRouter } from './creds';

const { mockInjectSandboxCredentials } = vi.hoisted(() => ({
  mockInjectSandboxCredentials: vi.fn(),
}));

vi.mock('@/libs/trpc/lambda/middleware', () => ({
  marketUserInfo: vi.fn((opts: any) => opts.next({ ctx: opts.ctx })),
  requireMarketAuth: vi.fn((opts: any) => opts.next({ ctx: opts.ctx })),
  serverDatabase: vi.fn((opts: any) => opts.next({ ctx: opts.ctx })),
}));

vi.mock('@/server/services/market', () => ({
  MarketService: vi.fn(() => ({ market: { creds: {} } })),
}));

vi.mock('@/server/services/sandbox/credentials', () => ({
  injectSandboxCredentials: mockInjectSandboxCredentials,
}));

describe('credsRouter.inject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInjectSandboxCredentials.mockResolvedValue({
      credentials: { env: {}, files: [], headers: {} },
      notFound: [],
      success: true,
      unsupportedInSandbox: [],
    });
  });

  it('uses the authenticated context userId for sandbox injection', async () => {
    const caller = credsRouter.createCaller({ serverDB: {}, userId: 'ctx-user' } as any);

    await caller.inject({
      keys: ['openai'],
      sandbox: true,
      topicId: 'topic-1',
      userId: 'request-user',
    } as any);

    expect(mockInjectSandboxCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        keys: ['openai'],
        sandbox: true,
        topicId: 'topic-1',
        userId: 'ctx-user',
      }),
    );
  });
});
