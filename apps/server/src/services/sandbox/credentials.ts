import type { InjectCredsResponse } from '@lobehub/market-types';
import debug from 'debug';

import type { MarketService } from '@/server/services/market';

import { createSandboxService } from './factory';

const log = debug('lobe-server:sandbox:credentials');

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

const getPlaintextValues = (credential: MarketCredentialWithPlaintext) => {
  return Object.fromEntries(Object.entries(credential.plaintext || {}));
};

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
    `${credentialEnvPrefix}_HEADER_${headerEnvName}`,
  ]);
};

const isKvCredential = (
  credential: MarketCredentialSummary | undefined,
): credential is MarketCredentialSummary =>
  credential?.type === 'kv-env' || credential?.type === 'kv-header';

const summarizeSecretRecord = (record: Record<string, string> | undefined) =>
  Object.fromEntries(
    Object.entries(record || {}).map(([name, value]) => [
      name,
      {
        hasValue: value.length > 0,
        masked: value.includes('*'),
      },
    ]),
  );

const summarizeCredentials = (credentials: InjectedCredentials) => ({
  env: summarizeSecretRecord(credentials.env),
  files: credentials.files.map((file) => {
    const record = file as typeof file & Record<string, unknown>;

    return {
      envName: file.envName,
      fields: Object.keys(record).sort(),
      fileName: file.fileName,
      hasContent: typeof record.content === 'string' && record.content.length > 0,
      hasDownloadUrl: typeof record.downloadUrl === 'string' && record.downloadUrl.length > 0,
      hasSignedUrl: typeof record.signedUrl === 'string' && record.signedUrl.length > 0,
      hasUrl: typeof record.url === 'string' && record.url.length > 0,
      key: file.key,
      mimeType: file.mimeType,
    };
  }),
  headers: summarizeSecretRecord(credentials.headers),
});

const summarizeInjectResponse = (result: InjectCredsResponse) => ({
  credentials: summarizeCredentials(result.credentials),
  missing: result.missing?.map((item) => ({ key: item.key, type: item.type })),
  success: result.success,
  unsupportedInSandbox: result.unsupportedInSandbox,
});

const stringifySummary = (summary: unknown) => JSON.stringify(summary, null, 2);

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

  log(
    'resolving plaintext kv credentials: %O',
    requestedKvCredentials.map((credential) => ({
      id: credential.id,
      key: credential.key,
      type: credential.type,
    })),
  );

  const decryptedCredentials = await Promise.all(
    requestedKvCredentials.map((credential) =>
      marketService.market.creds.get(credential.id, { decrypt: true }),
    ),
  );
  log(
    'decrypted kv credential shape: %s',
    stringifySummary(
      decryptedCredentials.map((credential) => ({
        key: credential.key,
        plaintextKeys: Object.keys(credential.plaintext || {}).sort(),
        type: credential.type,
      })),
    ),
  );
  const plaintextEnv: Record<string, string> = {};
  const plaintextHeaders: Record<string, string> = {};
  const kvHeaderEnvNames = new Set<string>();

  for (const credential of decryptedCredentials) {
    const plaintextValues = getPlaintextValues(credential);

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

  if (Object.keys(plaintextEnv).length === 0 && Object.keys(plaintextHeaders).length === 0) {
    return credentials;
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
  log('market inject response shape: %s', stringifySummary(summarizeInjectResponse(result)));

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
  const resolvedResult = credentials === result.credentials ? result : { ...result, credentials };

  log(
    'sandbox credential injection shape: %s',
    stringifySummary(summarizeCredentials(credentials)),
  );

  const sandboxService = createSandboxService({ marketService, topicId, userId });
  const injection = await sandboxService.injectCredentials({
    credentials,
  });

  if (!injection.success) {
    throw new Error(injection.error?.message || 'Failed to inject credentials into sandbox');
  }

  return resolvedResult;
};
