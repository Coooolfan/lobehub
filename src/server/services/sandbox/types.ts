import type {
  ISandboxService,
  SandboxExportFileResult,
} from '@lobechat/builtin-tool-cloud-sandbox';

import type { FileService } from '@/server/services/file';
import type { MarketService } from '@/server/services/market';

export type SandboxProviderKind = 'market' | 'onlyboxes';

export interface SandboxSessionContext {
  topicId: string;
  userId: string;
}

export interface SandboxServiceOptions extends SandboxSessionContext {
  fileService?: FileService;
  marketService: MarketService;
}

export interface SandboxProviderCapabilities {
  backgroundCommands: boolean;
  exportFile: boolean;
  files: boolean;
  languages: string[];
  persistentSession: boolean;
  shell: boolean;
}

export interface SandboxProvider extends ISandboxService {
  readonly capabilities: SandboxProviderCapabilities;
  readonly kind: SandboxProviderKind;
}

export interface SandboxFileExporter {
  exportAndUploadFile: (path: string, filename: string) => Promise<SandboxExportFileResult>;
}
