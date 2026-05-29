// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('getServerConfig', () => {
  beforeEach(() => {
    // Reset modules to clear the cached config
    vi.resetModules();
  });

  describe('index url', () => {
    it('should return default URLs when no environment variables are set', async () => {
      const { getAppConfig } = await import('../app');
      const config = getAppConfig();
      expect(config.AGENTS_INDEX_URL).toBe(
        'https://registry.npmmirror.com/@lobehub/agents-index/v1/files/public',
      );
      expect(config.PLUGINS_INDEX_URL).toBe(
        'https://registry.npmmirror.com/@lobehub/plugins-index/v1/files/public',
      );
    });

    it('should return custom URLs when environment variables are set', async () => {
      process.env.AGENTS_INDEX_URL = 'https://custom-agents-url.com';
      process.env.PLUGINS_INDEX_URL = 'https://custom-plugins-url.com';
      const { getAppConfig } = await import('../app');
      const config = getAppConfig();
      expect(config.AGENTS_INDEX_URL).toBe('https://custom-agents-url.com');
      expect(config.PLUGINS_INDEX_URL).toBe('https://custom-plugins-url.com');
    });

    it('should return default URLs when environment variables are empty string', async () => {
      process.env.AGENTS_INDEX_URL = '';
      process.env.PLUGINS_INDEX_URL = '';

      const { getAppConfig } = await import('../app');
      const config = getAppConfig();
      expect(config.AGENTS_INDEX_URL).toBe(
        'https://registry.npmmirror.com/@lobehub/agents-index/v1/files/public',
      );
      expect(config.PLUGINS_INDEX_URL).toBe(
        'https://registry.npmmirror.com/@lobehub/plugins-index/v1/files/public',
      );
    });
  });

  describe('INTERNAL_APP_URL', () => {
    it('should default to APP_URL when INTERNAL_APP_URL is not set', async () => {
      process.env.APP_URL = 'https://example.com';
      delete process.env.INTERNAL_APP_URL;

      const { getAppConfig } = await import('../app');
      const config = getAppConfig();
      expect(config.INTERNAL_APP_URL).toBe('https://example.com');
    });

    it('should use INTERNAL_APP_URL when explicitly set', async () => {
      process.env.APP_URL = 'https://public.example.com';
      process.env.INTERNAL_APP_URL = 'http://localhost:3210';

      const { getAppConfig } = await import('../app');
      const config = getAppConfig();
      expect(config.INTERNAL_APP_URL).toBe('http://localhost:3210');
    });

    it('should use INTERNAL_APP_URL over APP_URL when both are set', async () => {
      process.env.APP_URL = 'https://public.example.com';
      process.env.INTERNAL_APP_URL = 'http://internal-service:3210';

      const { getAppConfig } = await import('../app');
      const config = getAppConfig();
      expect(config.APP_URL).toBe('https://public.example.com');
      expect(config.INTERNAL_APP_URL).toBe('http://internal-service:3210');
    });

    it('should handle localhost INTERNAL_APP_URL for bypassing CDN', async () => {
      process.env.APP_URL = 'https://cloudflare-proxied.com';
      process.env.INTERNAL_APP_URL = 'http://127.0.0.1:3210';

      const { getAppConfig } = await import('../app');
      const config = getAppConfig();
      expect(config.INTERNAL_APP_URL).toBe('http://127.0.0.1:3210');
    });
  });

  describe('cloud sandbox env', () => {
    beforeEach(() => {
      delete process.env.SANDBOX_PROVIDER;
      delete process.env.ONLYBOXES_BASE_URL;
      delete process.env.ONLYBOXES_JIT_ISSUER;
      delete process.env.ONLYBOXES_JIT_SIGNING_KEY;
      delete process.env.ONLYBOXES_JIT_TTL_SEC;
      delete process.env.ONLYBOXES_LEASE_TTL_SEC;
    });

    it('should treat docker empty string defaults as unset optional values', async () => {
      process.env.SANDBOX_PROVIDER = '';
      process.env.ONLYBOXES_BASE_URL = '';
      process.env.ONLYBOXES_JIT_ISSUER = '';
      process.env.ONLYBOXES_JIT_SIGNING_KEY = '';
      process.env.ONLYBOXES_JIT_TTL_SEC = '';
      process.env.ONLYBOXES_LEASE_TTL_SEC = '';

      const { getAppConfig } = await import('../app');
      const config = getAppConfig();

      expect(config.SANDBOX_PROVIDER).toBeUndefined();
      expect(config.ONLYBOXES_BASE_URL).toBeUndefined();
      expect(config.ONLYBOXES_JIT_ISSUER).toBeUndefined();
      expect(config.ONLYBOXES_JIT_SIGNING_KEY).toBeUndefined();
      expect(config.ONLYBOXES_JIT_TTL_SEC).toBeUndefined();
      expect(config.ONLYBOXES_LEASE_TTL_SEC).toBeUndefined();
    });

    it('should parse configured sandbox values', async () => {
      process.env.SANDBOX_PROVIDER = 'onlyboxes';
      process.env.ONLYBOXES_BASE_URL = 'https://onlyboxes.example.com';
      process.env.ONLYBOXES_JIT_ISSUER = 'lobehub-test';
      process.env.ONLYBOXES_JIT_SIGNING_KEY = 'jit-signing-key';
      process.env.ONLYBOXES_JIT_TTL_SEC = '900';
      process.env.ONLYBOXES_LEASE_TTL_SEC = '3600';

      const { getAppConfig } = await import('../app');
      const config = getAppConfig();

      expect(config.SANDBOX_PROVIDER).toBe('onlyboxes');
      expect(config.ONLYBOXES_BASE_URL).toBe('https://onlyboxes.example.com');
      expect(config.ONLYBOXES_JIT_ISSUER).toBe('lobehub-test');
      expect(config.ONLYBOXES_JIT_SIGNING_KEY).toBe('jit-signing-key');
      expect(config.ONLYBOXES_JIT_TTL_SEC).toBe(900);
      expect(config.ONLYBOXES_LEASE_TTL_SEC).toBe(3600);
    });
  });
});

describe('APP_URL fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    // Clean up all related env vars
    delete process.env.APP_URL;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_BRANCH_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  });

  it('should use APP_URL when explicitly set', async () => {
    process.env.APP_URL = 'https://custom-app.com';
    process.env.VERCEL = '1';

    const { getAppConfig } = await import('../app');
    const config = getAppConfig();
    expect(config.APP_URL).toBe('https://custom-app.com');
  });

  describe('Vercel environment', () => {
    it('should use VERCEL_PROJECT_PRODUCTION_URL in production', async () => {
      process.env.VERCEL = '1';
      process.env.VERCEL_ENV = 'production';
      process.env.VERCEL_PROJECT_PRODUCTION_URL = 'lobechat.vercel.app';
      process.env.VERCEL_BRANCH_URL = 'lobechat-git-main-org.vercel.app';
      process.env.VERCEL_URL = 'lobechat-abc123.vercel.app';

      const { getAppConfig } = await import('../app');
      const config = getAppConfig();
      expect(config.APP_URL).toBe('https://lobechat.vercel.app');
    });

    it('should use VERCEL_URL in preview environment', async () => {
      process.env.VERCEL = '1';
      process.env.VERCEL_ENV = 'preview';
      process.env.VERCEL_BRANCH_URL = 'lobechat-git-feature-org.vercel.app';
      process.env.VERCEL_URL = 'lobechat-abc123.vercel.app';

      const { getAppConfig } = await import('../app');
      const config = getAppConfig();
      expect(config.APP_URL).toBe('https://lobechat-abc123.vercel.app');
    });

    it('should fallback to VERCEL_BRANCH_URL when VERCEL_URL is not set', async () => {
      process.env.VERCEL = '1';
      process.env.VERCEL_ENV = 'preview';
      process.env.VERCEL_BRANCH_URL = 'lobechat-git-feature-org.vercel.app';

      const { getAppConfig } = await import('../app');
      const config = getAppConfig();
      expect(config.APP_URL).toBe('https://lobechat-git-feature-org.vercel.app');
    });
  });

  describe('local environment', () => {
    it('should use localhost:3010 in development', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      const { getAppConfig } = await import('../app');
      const config = getAppConfig();
      expect(config.APP_URL).toBe('http://localhost:3010');
    });

    it('should use localhost:3210 in non-development', async () => {
      vi.stubEnv('NODE_ENV', 'test');

      const { getAppConfig } = await import('../app');
      const config = getAppConfig();
      expect(config.APP_URL).toBe('http://localhost:3210');
    });
  });
});
