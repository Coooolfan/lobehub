import type { InjectCredsResponse } from '@lobehub/market-types';

import type { MarketService } from '@/server/services/market';

import { createSandboxService } from './factory';

type InjectedCredentials = InjectCredsResponse['credentials'];
type MarketCredentialSummary = Awaited<
  ReturnType<MarketService['market']['creds']['list']>
>['data'][number];
type MarketCredentialWithPlaintext = Awaited<ReturnType<MarketService['market']['creds']['get']>>;

interface InjectSandboxCredentialsParams {
  keys: string[];
  marketService: MarketService;
  sandbox?: boolean;
  topicId: string;
  userId: string;
}

const normalizeEnvName = (name: string) => name.toUpperCase();

const getPlaintextValues = (credential: MarketCredentialWithPlaintext) => {
  return Object.fromEntries(
    Object.entries(credential.plaintext || {}).map(([name, value]) => [
      normalizeEnvName(name),
      value,
    ]),
  );
};

const isKvEnvCredential = (
  credential: MarketCredentialSummary | undefined,
): credential is MarketCredentialSummary => credential?.type === 'kv-env';

const resolveKvEnvPlaintextCredentials = async ({
  credentials,
  keys,
  marketService,
}: {
  credentials: InjectedCredentials;
  keys: string[];
  marketService: MarketService;
}): Promise<InjectedCredentials> => {
  const credentialsList = await marketService.market.creds.list();
  const credentialsByKey = new Map(
    credentialsList.data.map((credential) => [credential.key, credential]),
  );
  const requestedKvEnvCredentials = keys
    .map((key) => credentialsByKey.get(key))
    .filter(isKvEnvCredential);

  if (requestedKvEnvCredentials.length === 0) return credentials;

  const decryptedCredentials = await Promise.all(
    requestedKvEnvCredentials.map((credential) =>
      marketService.market.creds.get(credential.id, { decrypt: true }),
    ),
  );
  const plaintextEnv = decryptedCredentials.reduce<Record<string, string>>(
    (env, credential) => ({
      ...env,
      ...getPlaintextValues(credential),
    }),
    {},
  );

  if (Object.keys(plaintextEnv).length === 0) return credentials;

  return {
    ...credentials,
    env: {
      ...credentials.env,
      ...plaintextEnv,
    },
  };
};

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

  const credentials = await resolveKvEnvPlaintextCredentials({
    credentials: result.credentials,
    keys,
    marketService,
  });
  const resolvedResult = credentials === result.credentials ? result : { ...result, credentials };

  const sandboxService = createSandboxService({ marketService, topicId, userId });
  const injection = await sandboxService.injectCredentials({
    credentials,
  });

  if (!injection.success) {
    throw new Error(injection.error?.message || 'Failed to inject credentials into sandbox');
  }

  return resolvedResult;
};
