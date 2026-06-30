import type { InjectCredsResponse } from '@lobehub/market-types';

import type { MarketService } from '@/server/services/market';

import { createSandboxService as defaultCreateSandboxService } from './factory';

type InjectedCredentials = InjectCredsResponse['credentials'];
type MarketCredentialSummary = Awaited<
  ReturnType<MarketService['market']['creds']['list']>
>['data'][number];

type CreateSandboxServiceForCredentials = (
  options: Parameters<typeof defaultCreateSandboxService>[0],
) => Pick<ReturnType<typeof defaultCreateSandboxService>, 'injectCredentials'>;

interface InjectSandboxCredentialsParams {
  createSandboxService?: CreateSandboxServiceForCredentials;
  keys: string[];
  marketService: MarketService;
  sandbox?: boolean;
  topicId: string;
  userId: string;
}

const normalizeEnvNameSegment = (value: string) =>
  value.replaceAll(/[^A-Z0-9]/gi, '_').toUpperCase();

const getKvHeaderEnvName = (credentialKey: string, headerName: string) =>
  `${normalizeEnvNameSegment(credentialKey)}_HEADER_${normalizeEnvNameSegment(headerName)}`;

const getKvHeaderEnvNameCandidates = (credentialKey: string, headerName: string) => {
  const credentialEnvPrefix = normalizeEnvNameSegment(credentialKey);
  const headerEnvName = normalizeEnvNameSegment(headerName);

  return new Set([
    getKvHeaderEnvName(credentialKey, headerName),
    `${credentialEnvPrefix}_${headerEnvName}`,
  ]);
};

const isKvCredential = (
  credential: MarketCredentialSummary | undefined,
): credential is MarketCredentialSummary =>
  credential?.type === 'kv-env' || credential?.type === 'kv-header';

const resolveKvPlaintextCredentials = async ({
  credentials,
  keys,
  marketService,
}: {
  credentials: InjectedCredentials;
  keys: string[];
  marketService: MarketService;
}): Promise<InjectedCredentials> => {
  if (
    Object.keys(credentials.env || {}).length === 0 &&
    Object.keys(credentials.headers || {}).length === 0
  ) {
    return credentials;
  }

  const credentialsList = await marketService.market.creds.list();
  const credentialsByKey = new Map(
    credentialsList.data.map((credential) => [credential.key, credential]),
  );
  const requestedKvCredentials = keys
    .map((key) => credentialsByKey.get(key))
    .filter(isKvCredential);

  if (requestedKvCredentials.length === 0) return credentials;

  const decryptedCredentials = await Promise.all(
    requestedKvCredentials.map((credential) =>
      marketService.market.creds.get(credential.id, { decrypt: true }),
    ),
  );
  const plaintextEnv: Record<string, string> = {};
  const plaintextHeaders: Record<string, string> = {};
  const kvHeaderEnvNames = new Set<string>();

  for (const credential of decryptedCredentials) {
    const plaintextValues = credential.plaintext || {};

    if (credential.type === 'kv-env') {
      Object.assign(plaintextEnv, plaintextValues);
      continue;
    }

    if (credential.type === 'kv-header') {
      Object.assign(plaintextHeaders, plaintextValues);

      for (const [headerName, value] of Object.entries(plaintextValues)) {
        const envNameCandidates = getKvHeaderEnvNameCandidates(credential.key, headerName);
        const matchedEnvNames = [...envNameCandidates].filter((envName) =>
          Object.hasOwn(credentials.env || {}, envName),
        );
        const envNames =
          matchedEnvNames.length > 0
            ? matchedEnvNames
            : [getKvHeaderEnvName(credential.key, headerName)];

        for (const envName of envNameCandidates) {
          kvHeaderEnvNames.add(envName);
        }
        for (const envName of envNames) {
          plaintextEnv[envName] = value;
        }
      }
    }
  }

  return {
    ...credentials,
    env: {
      ...Object.fromEntries(
        Object.entries(credentials.env || {}).filter(([name]) => !kvHeaderEnvNames.has(name)),
      ),
      ...plaintextEnv,
    },
    headers: {
      ...credentials.headers,
      ...plaintextHeaders,
    },
  };
};

export const injectSandboxCredentials = async ({
  createSandboxService = defaultCreateSandboxService,
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
    Object.keys(result.credentials.env || {}).length > 0 ||
    result.credentials.files.length > 0 ||
    Object.keys(result.credentials.headers || {}).length > 0;

  if (!sandbox || !hasCredentialsToInject) return result;

  const credentials = await resolveKvPlaintextCredentials({
    credentials: result.credentials,
    keys,
    marketService,
  });

  const sandboxService = createSandboxService({ marketService, topicId, userId });
  const injection = await sandboxService.injectCredentials({
    credentials,
  });

  if (!injection.success) {
    throw new Error(injection.error?.message || 'Failed to inject credentials into sandbox');
  }

  return result;
};
