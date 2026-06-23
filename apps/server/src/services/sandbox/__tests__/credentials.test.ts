import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MarketService } from '@/server/services/market';

const mocks = vi.hoisted(() => {
  const sandboxService = {
    injectCredentials: vi.fn(),
  };

  return {
    createSandboxService: vi.fn(() => sandboxService),
    sandboxService,
  };
});

vi.mock('../factory', () => ({
  createSandboxService: mocks.createSandboxService,
}));

const createMarketService = () =>
  ({
    market: {
      creds: {
        inject: vi.fn(async () => ({
          credentials: {
            env: { OPENAI_API_KEY: 'sk-test' },
            files: [],
            headers: {},
          },
          notFound: [],
          success: true,
          unsupportedInSandbox: [],
        })),
      },
    },
  }) as unknown as MarketService;

describe('injectSandboxCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sandboxService.injectCredentials.mockResolvedValue({
      credentials: {
        env: { OPENAI_API_KEY: 'sk-test' },
        files: [],
        headers: {},
      },
      success: true,
    });
  });

  it('delegates decrypted credentials to the configured sandbox provider', async () => {
    const marketService = createMarketService();
    const { injectSandboxCredentials } = await import('../credentials');

    const result = await injectSandboxCredentials({
      keys: ['openai'],
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(marketService.market.creds.inject).toHaveBeenCalledWith({
      keys: ['openai'],
      sandbox: true,
      topicId: 'topic-1',
      userId: 'user-1',
    });
    expect(mocks.createSandboxService).toHaveBeenCalledWith({
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });
    expect(mocks.sandboxService.injectCredentials).toHaveBeenCalledWith({
      credentials: {
        env: { OPENAI_API_KEY: 'sk-test' },
        files: [],
        headers: {},
      },
    });
    expect(result.success).toBe(true);
  });

  it('does not call the sandbox provider when sandbox injection is disabled', async () => {
    const marketService = createMarketService();
    const { injectSandboxCredentials } = await import('../credentials');

    await injectSandboxCredentials({
      keys: ['openai'],
      marketService,
      sandbox: false,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(marketService.market.creds.inject).toHaveBeenCalledWith({
      keys: ['openai'],
      sandbox: false,
      topicId: 'topic-1',
      userId: 'user-1',
    });
    expect(mocks.createSandboxService).not.toHaveBeenCalled();
  });

  it('does not call the sandbox provider when Market returns no injectable credentials', async () => {
    const marketService = createMarketService();
    vi.mocked(marketService.market.creds.inject).mockResolvedValue({
      credentials: {
        env: {},
        files: [],
        headers: {},
      },
      notFound: ['openai'],
      success: false,
      unsupportedInSandbox: [],
    });

    const { injectSandboxCredentials } = await import('../credentials');

    const result = await injectSandboxCredentials({
      keys: ['openai'],
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(result.success).toBe(false);
    expect(mocks.createSandboxService).not.toHaveBeenCalled();
  });

  it('injects available credentials even when some requested keys are missing', async () => {
    const marketService = createMarketService();
    vi.mocked(marketService.market.creds.inject).mockResolvedValue({
      credentials: {
        env: { OPENAI_API_KEY: 'sk-test' },
        files: [],
        headers: {},
      },
      notFound: ['missing-key'],
      success: false,
      unsupportedInSandbox: [],
    });

    const { injectSandboxCredentials } = await import('../credentials');

    const result = await injectSandboxCredentials({
      keys: ['openai', 'missing-key'],
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(result.success).toBe(false);
    expect(mocks.sandboxService.injectCredentials).toHaveBeenCalledWith({
      credentials: {
        env: { OPENAI_API_KEY: 'sk-test' },
        files: [],
        headers: {},
      },
    });
  });

  it('throws when the sandbox provider cannot write the credentials', async () => {
    mocks.sandboxService.injectCredentials.mockResolvedValue({
      credentials: {
        env: {},
        files: [],
        headers: {},
      },
      error: { message: 'write failed' },
      success: false,
    });

    const marketService = createMarketService();
    const { injectSandboxCredentials } = await import('../credentials');

    await expect(
      injectSandboxCredentials({
        keys: ['openai'],
        marketService,
        topicId: 'topic-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow('write failed');
  });
});
