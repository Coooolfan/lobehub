import { appEnv } from '@/envs/app';

import { MarketSandboxProvider } from './providers/market';
import { OnlyboxesSandboxProvider } from './providers/onlyboxes';
import type { SandboxProvider, SandboxProviderKind, SandboxServiceOptions } from './types';

export const getSandboxProviderKind = (): SandboxProviderKind => {
  return appEnv.SANDBOX_PROVIDER || 'market';
};

export const createSandboxService = (options: SandboxServiceOptions): SandboxProvider => {
  switch (getSandboxProviderKind()) {
    case 'onlyboxes': {
      return new OnlyboxesSandboxProvider(options);
    }

    case 'market': {
      return new MarketSandboxProvider(options);
    }
  }
};
