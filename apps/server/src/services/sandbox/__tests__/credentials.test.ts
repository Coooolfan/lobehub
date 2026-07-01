import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MarketService } from '@/server/services/market';

import { injectSandboxCredentials } from '../credentials';
import type { SandboxService } from '../types';

type SandboxCredentialService = Pick<SandboxService, 'injectCredentials' | 'kind'>;

const injectCredentials = vi.fn<SandboxService['injectCredentials']>();
const sandboxService: SandboxCredentialService = {
  injectCredentials,
  kind: 'onlyboxes',
};
const createSandboxService = vi.fn<() => SandboxCredentialService>(() => sandboxService);

const createMarketService = () =>
  ({
    market: {
      creds: {
        get: vi.fn(),
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
        list: vi.fn(async () => ({
          data: [],
        })),
      },
    },
  }) as unknown as MarketService;

describe('injectSandboxCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSandboxService.mockReturnValue(sandboxService);
    injectCredentials.mockResolvedValue({ success: true });
  });

  it('delegates decrypted credentials to the configured sandbox provider', async () => {
    const marketService = createMarketService();
    const result = await injectSandboxCredentials({
      createSandboxService,
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
    expect(createSandboxService).toHaveBeenCalledWith({
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });
    expect(sandboxService.injectCredentials).toHaveBeenCalledWith({
      credentials: {
        env: { OPENAI_API_KEY: 'sk-test' },
        files: [],
        headers: {},
      },
    });
    expect(marketService.market.creds.list).toHaveBeenCalledTimes(1);
    expect(marketService.market.creds.get).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('does not call the sandbox provider when sandbox injection is disabled', async () => {
    const marketService = createMarketService();
    await injectSandboxCredentials({
      createSandboxService,
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
    expect(marketService.market.creds.list).not.toHaveBeenCalled();
    expect(marketService.market.creds.get).not.toHaveBeenCalled();
    expect(createSandboxService).not.toHaveBeenCalled();
  });

  it('keeps Market-managed sandbox injection unchanged for the market provider', async () => {
    const marketSandboxService: SandboxCredentialService = {
      injectCredentials: vi.fn(),
      kind: 'market',
    };
    createSandboxService.mockReturnValue(marketSandboxService);

    const marketService = createMarketService();
    vi.mocked(marketService.market.creds.inject).mockResolvedValue({
      credentials: {
        env: { DEEPSEEK_SK_HEADER_SK: 'sk-******st' },
        files: [],
        headers: {},
      },
      notFound: [],
      success: true,
      unsupportedInSandbox: [],
    });

    const result = await injectSandboxCredentials({
      createSandboxService,
      keys: ['deepseek-sk'],
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(createSandboxService).toHaveBeenCalledWith({
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });
    expect(marketService.market.creds.list).not.toHaveBeenCalled();
    expect(marketService.market.creds.get).not.toHaveBeenCalled();
    expect(marketSandboxService.injectCredentials).not.toHaveBeenCalled();
    expect(result.credentials.env).toEqual({ DEEPSEEK_SK_HEADER_SK: 'sk-******st' });
  });

  it('resolves requested KV env credentials from decrypted plaintext before sandbox injection', async () => {
    const marketService = createMarketService();
    vi.mocked(marketService.market.creds.inject).mockResolvedValue({
      credentials: {
        env: { https_proxy: 'http://masked.example.com' },
        files: [],
        headers: {},
      },
      notFound: [],
      success: true,
      unsupportedInSandbox: [],
    });
    vi.mocked(marketService.market.creds.list).mockResolvedValue({
      data: [
        {
          createdAt: '2026-06-26T00:00:00.000Z',
          id: 42,
          key: 'github-token',
          name: 'GitHub token',
          type: 'kv-env',
          updatedAt: '2026-06-26T00:00:00.000Z',
        },
      ],
    });
    vi.mocked(marketService.market.creds.get).mockResolvedValue({
      createdAt: '2026-06-26T00:00:00.000Z',
      id: 42,
      key: 'github-token',
      name: 'GitHub token',
      plaintext: { https_proxy: 'http://proxy.example.com' },
      type: 'kv-env',
      updatedAt: '2026-06-26T00:00:00.000Z',
    });

    const result = await injectSandboxCredentials({
      createSandboxService,
      keys: ['github-token'],
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(marketService.market.creds.list).toHaveBeenCalledTimes(1);
    expect(marketService.market.creds.get).toHaveBeenCalledWith(42, { decrypt: true });
    expect(sandboxService.injectCredentials).toHaveBeenCalledWith({
      credentials: {
        env: { https_proxy: 'http://proxy.example.com' },
        files: [],
        headers: {},
      },
    });
    expect(result.credentials.env).toEqual({ https_proxy: 'http://masked.example.com' });
  });

  it('keeps Market injected env when the requested credential is not KV env', async () => {
    const marketService = createMarketService();
    vi.mocked(marketService.market.creds.inject).mockResolvedValue({
      credentials: {
        env: { GH_TOKEN: 'gi******Ch' },
        files: [],
        headers: {},
      },
      notFound: [],
      success: true,
      unsupportedInSandbox: [],
    });
    vi.mocked(marketService.market.creds.list).mockResolvedValue({
      data: [
        {
          createdAt: '2026-06-26T00:00:00.000Z',
          id: 42,
          key: 'github-token',
          name: 'GitHub token',
          type: 'oauth',
          updatedAt: '2026-06-26T00:00:00.000Z',
        },
      ],
    });

    const result = await injectSandboxCredentials({
      createSandboxService,
      keys: ['github-token'],
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(marketService.market.creds.get).not.toHaveBeenCalled();
    expect(sandboxService.injectCredentials).toHaveBeenCalledWith({
      credentials: {
        env: { GH_TOKEN: 'gi******Ch' },
        files: [],
        headers: {},
      },
    });
    expect(result.credentials.env).toEqual({ GH_TOKEN: 'gi******Ch' });
  });

  it('resolves requested KV header credentials from decrypted plaintext before sandbox injection', async () => {
    const marketService = createMarketService();
    vi.mocked(marketService.market.creds.inject).mockResolvedValue({
      credentials: {
        env: { DEEPSEEK_SK_HEADER_SK: 'sk-******st' },
        files: [],
        headers: {},
      },
      notFound: [],
      success: true,
      unsupportedInSandbox: [],
    });
    vi.mocked(marketService.market.creds.list).mockResolvedValue({
      data: [
        {
          createdAt: '2026-06-26T00:00:00.000Z',
          id: 43,
          key: 'deepseek-sk',
          name: 'DeepSeek header',
          type: 'kv-header',
          updatedAt: '2026-06-26T00:00:00.000Z',
        },
      ],
    });
    vi.mocked(marketService.market.creds.get).mockResolvedValue({
      createdAt: '2026-06-26T00:00:00.000Z',
      id: 43,
      key: 'deepseek-sk',
      name: 'DeepSeek header',
      plaintext: { SK: 'sk-deepseek-test' },
      type: 'kv-header',
      updatedAt: '2026-06-26T00:00:00.000Z',
    });

    const result = await injectSandboxCredentials({
      createSandboxService,
      keys: ['deepseek-sk'],
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(marketService.market.creds.list).toHaveBeenCalledTimes(1);
    expect(marketService.market.creds.get).toHaveBeenCalledWith(43, { decrypt: true });
    expect(createSandboxService).toHaveBeenCalledWith({
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });
    expect(sandboxService.injectCredentials).toHaveBeenCalledWith({
      credentials: {
        env: { DEEPSEEK_SK_HEADER_SK: 'sk-deepseek-test' },
        files: [],
        headers: { SK: 'sk-deepseek-test' },
      },
    });
    expect(result.credentials.env).toEqual({ DEEPSEEK_SK_HEADER_SK: 'sk-******st' });
    expect(result.credentials.headers).toEqual({});
  });

  it('uses the documented KV header env name when Market does not return one', async () => {
    const marketService = createMarketService();
    vi.mocked(marketService.market.creds.inject).mockResolvedValue({
      credentials: {
        env: {},
        files: [],
        headers: { 'X-Api-Key': 'sk-******st' },
      },
      notFound: [],
      success: true,
      unsupportedInSandbox: [],
    });
    vi.mocked(marketService.market.creds.list).mockResolvedValue({
      data: [
        {
          createdAt: '2026-06-26T00:00:00.000Z',
          id: 44,
          key: 'custom-api',
          name: 'Custom API header',
          type: 'kv-header',
          updatedAt: '2026-06-26T00:00:00.000Z',
        },
      ],
    });
    vi.mocked(marketService.market.creds.get).mockResolvedValue({
      createdAt: '2026-06-26T00:00:00.000Z',
      id: 44,
      key: 'custom-api',
      name: 'Custom API header',
      plaintext: { 'X-Api-Key': 'sk-custom-test' },
      type: 'kv-header',
      updatedAt: '2026-06-26T00:00:00.000Z',
    });

    const result = await injectSandboxCredentials({
      createSandboxService,
      keys: ['custom-api'],
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(sandboxService.injectCredentials).toHaveBeenCalledWith({
      credentials: {
        env: { CUSTOM_API_HEADER_X_API_KEY: 'sk-custom-test' },
        files: [],
        headers: { 'X-Api-Key': 'sk-custom-test' },
      },
    });
    expect(result.credentials.env).toEqual({});
    expect(result.credentials.headers).toEqual({ 'X-Api-Key': 'sk-******st' });
  });

  it('does not overwrite a KV env credential that collides with a legacy KV header alias', async () => {
    const marketService = createMarketService();
    vi.mocked(marketService.market.creds.inject).mockResolvedValue({
      credentials: {
        env: { FOO_BAR: 'masked-env' },
        files: [],
        headers: {},
      },
      notFound: [],
      success: true,
      unsupportedInSandbox: [],
    });
    vi.mocked(marketService.market.creds.list).mockResolvedValue({
      data: [
        {
          createdAt: '2026-06-26T00:00:00.000Z',
          id: 45,
          key: 'foo',
          name: 'Foo header',
          type: 'kv-header',
          updatedAt: '2026-06-26T00:00:00.000Z',
        },
        {
          createdAt: '2026-06-26T00:00:00.000Z',
          id: 46,
          key: 'foo-env',
          name: 'Foo env',
          type: 'kv-env',
          updatedAt: '2026-06-26T00:00:00.000Z',
        },
      ],
    });
    vi.mocked(marketService.market.creds.get).mockImplementation(async (id) => {
      if (id === 45) {
        return {
          createdAt: '2026-06-26T00:00:00.000Z',
          id: 45,
          key: 'foo',
          name: 'Foo header',
          plaintext: { BAR: 'header-secret' } as Record<string, string>,
          type: 'kv-header',
          updatedAt: '2026-06-26T00:00:00.000Z',
        };
      }

      return {
        createdAt: '2026-06-26T00:00:00.000Z',
        id: 46,
        key: 'foo-env',
        name: 'Foo env',
        plaintext: { FOO_BAR: 'env-secret' } as Record<string, string>,
        type: 'kv-env',
        updatedAt: '2026-06-26T00:00:00.000Z',
      };
    });

    await injectSandboxCredentials({
      createSandboxService,
      keys: ['foo', 'foo-env'],
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(sandboxService.injectCredentials).toHaveBeenCalledWith({
      credentials: {
        env: {
          FOO_BAR: 'env-secret',
          FOO_HEADER_BAR: 'header-secret',
        },
        files: [],
        headers: { BAR: 'header-secret' },
      },
    });
  });

  it('calls the sandbox provider when only non-KV header credentials are returned', async () => {
    const marketService = createMarketService();
    vi.mocked(marketService.market.creds.inject).mockResolvedValue({
      credentials: {
        env: {},
        files: [],
        headers: { AUTHORIZATION: 'Bearer ghp_test' },
      },
      notFound: [],
      success: true,
      unsupportedInSandbox: [],
    });

    const result = await injectSandboxCredentials({
      createSandboxService,
      keys: ['oauth-header'],
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(marketService.market.creds.get).not.toHaveBeenCalled();
    expect(sandboxService.injectCredentials).toHaveBeenCalledWith({
      credentials: {
        env: {},
        files: [],
        headers: { AUTHORIZATION: 'Bearer ghp_test' },
      },
    });
    expect(result.credentials.headers).toEqual({ AUTHORIZATION: 'Bearer ghp_test' });
  });

  it('does not list Market credentials when only file credentials are returned', async () => {
    const marketService = createMarketService();
    vi.mocked(marketService.market.creds.inject).mockResolvedValue({
      credentials: {
        env: {},
        files: [
          {
            content: 'https://files.example.com/credentials.json',
            envName: 'GOOGLE_APPLICATION_CREDENTIALS',
            fileName: 'credentials.json',
            key: 'gcp-sa',
            mimeType: 'application/json',
          },
        ],
        headers: {},
      },
      notFound: [],
      success: true,
      unsupportedInSandbox: [],
    });

    const result = await injectSandboxCredentials({
      createSandboxService,
      keys: ['gcp-sa'],
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(marketService.market.creds.list).not.toHaveBeenCalled();
    expect(marketService.market.creds.get).not.toHaveBeenCalled();
    expect(sandboxService.injectCredentials).toHaveBeenCalledWith({
      credentials: {
        env: {},
        files: [
          {
            content: 'https://files.example.com/credentials.json',
            envName: 'GOOGLE_APPLICATION_CREDENTIALS',
            fileName: 'credentials.json',
            key: 'gcp-sa',
            mimeType: 'application/json',
          },
        ],
        headers: {},
      },
    });
    expect(result.credentials.files).toHaveLength(1);
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

    const result = await injectSandboxCredentials({
      createSandboxService,
      keys: ['openai'],
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(result.success).toBe(false);
    expect(createSandboxService).not.toHaveBeenCalled();
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

    const result = await injectSandboxCredentials({
      createSandboxService,
      keys: ['openai', 'missing-key'],
      marketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(result.success).toBe(false);
    expect(sandboxService.injectCredentials).toHaveBeenCalledWith({
      credentials: {
        env: { OPENAI_API_KEY: 'sk-test' },
        files: [],
        headers: {},
      },
    });
  });

  it('throws when the sandbox provider cannot write the credentials', async () => {
    injectCredentials.mockResolvedValue({
      error: { message: 'write failed' },
      success: false,
    });

    const marketService = createMarketService();

    await expect(
      injectSandboxCredentials({
        createSandboxService,
        keys: ['openai'],
        marketService,
        topicId: 'topic-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow('write failed');
  });
});
