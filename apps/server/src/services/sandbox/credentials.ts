import type { InjectCredsResponse } from '@lobehub/market-types';

import type { MarketService } from '@/server/services/market';

import { createSandboxService } from './factory';

interface InjectSandboxCredentialsParams {
  keys: string[];
  marketService: MarketService;
  sandbox?: boolean;
  topicId: string;
  userId: string;
}

export const injectSandboxCredentials = async ({
  keys,
  marketService,
  sandbox = true,
  topicId,
  userId,
}: InjectSandboxCredentialsParams): Promise<InjectCredsResponse> => {
  const result = (await marketService.market.creds.inject({
    keys,
    sandbox,
    topicId,
    userId,
  })) as InjectCredsResponse;

  const hasCredentialsToInject =
    Object.keys(result.credentials.env).length > 0 || result.credentials.files.length > 0;

  if (!sandbox || !hasCredentialsToInject) return result;

  const sandboxService = createSandboxService({ marketService, topicId, userId });
  const injection = await sandboxService.injectCredentials({
    credentials: result.credentials,
  });

  if (!injection.success) {
    throw new Error(injection.error?.message || 'Failed to inject credentials into sandbox');
  }

  return result;
};
