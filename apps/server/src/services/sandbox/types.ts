import type {
  ISandboxService,
  SandboxExportFileResult,
} from '@lobechat/builtin-tool-cloud-sandbox';
import type { LobeChatDatabase } from '@lobechat/database';
import type { InjectCredsResponse } from '@lobehub/market-types';

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
  /** Used to look up topic/session files when bootstrapping the sandbox. */
  serverDB?: LobeChatDatabase;
}

export interface SandboxProviderCapabilities {
  backgroundCommands: boolean;
  exportFile: boolean;
  files: boolean;
  languages: string[];
  persistentSession: boolean;
  shell: boolean;
  skillScripts: boolean;
}

export interface SandboxProvider extends Pick<ISandboxService, 'callTool'> {
  readonly capabilities: SandboxProviderCapabilities;

  exportFileToUploadUrl: (
    request: SandboxProviderFileExportRequest,
  ) => Promise<SandboxProviderFileExportResult>;

  injectCredentials: (
    request: SandboxProviderCredentialInjectRequest,
  ) => Promise<SandboxProviderCredentialInjectResult>;

  readonly kind: SandboxProviderKind;
}

export interface SandboxService extends ISandboxService {
  readonly capabilities: SandboxProviderCapabilities;
  injectCredentials: (
    request: SandboxProviderCredentialInjectRequest,
  ) => Promise<SandboxProviderCredentialInjectResult>;
  readonly kind: SandboxProviderKind;
}

export interface SandboxFileExporter {
  exportAndUploadFile: (path: string, filename: string) => Promise<SandboxExportFileResult>;
}

export interface SandboxProviderFileExportRequest {
  filename: string;
  path: string;
  uploadHeaders?: Record<string, string>;
  uploadUrl: string;
}

export interface SandboxProviderFileExportResult {
  error?: { message: string; name?: string };
  mimeType?: string;
  result?: Record<string, unknown>;
  size?: number;
  success: boolean;
}

export interface SandboxProviderCredentialInjectRequest {
  credentials: InjectCredsResponse['credentials'];
}

export interface SandboxProviderCredentialInjectResult {
  credentials: InjectCredsResponse['credentials'];
  error?: { message: string; name?: string };
  success: boolean;
}

export interface SandboxCommandResult {
  exitCode: number;
  output: string;
  stderr?: string;
  success: boolean;
}
