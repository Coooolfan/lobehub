import type {
  SandboxCallToolResult,
  SandboxExportFileResult,
} from '@lobechat/builtin-tool-cloud-sandbox';
import type { CodeInterpreterToolName } from '@lobehub/market-sdk';
import debug from 'debug';
import { sha256 } from 'js-sha256';

import { FileS3 } from '@/server/modules/S3';

import type { SandboxProvider, SandboxProviderCapabilities, SandboxServiceOptions } from '../types';

const log = debug('lobe-server:sandbox:market');

export class MarketSandboxProvider implements SandboxProvider {
  readonly capabilities = {
    backgroundCommands: true,
    exportFile: true,
    files: true,
    languages: ['python', 'javascript', 'typescript'],
    persistentSession: true,
    shell: true,
  } as const satisfies SandboxProviderCapabilities;

  readonly kind = 'market';

  private readonly options: SandboxServiceOptions;

  constructor(options: SandboxServiceOptions) {
    this.options = options;
  }

  async callTool(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<SandboxCallToolResult> {
    const { marketService, topicId, userId } = this.options;

    log('Calling sandbox tool: %s with params: %O, topicId: %s', toolName, params, topicId);

    try {
      const response = await marketService
        .getSDK()
        .plugins.runBuildInTool(toolName as CodeInterpreterToolName, params as never, {
          topicId,
          userId,
        });

      log('Sandbox tool %s response: %O', toolName, response);

      if (!response.success) {
        return {
          error: {
            message: response.error?.message || 'Unknown error',
            name: response.error?.code,
          },
          result: null,
          sessionExpiredAndRecreated: false,
          success: false,
        };
      }

      return {
        result: response.data?.result,
        sessionExpiredAndRecreated: response.data?.sessionExpiredAndRecreated || false,
        success: true,
      };
    } catch (error) {
      log('Error calling sandbox tool %s: %O', toolName, error);

      return {
        error: {
          message: (error as Error).message,
          name: (error as Error).name,
        },
        result: null,
        sessionExpiredAndRecreated: false,
        success: false,
      };
    }
  }

  async exportAndUploadFile(path: string, filename: string): Promise<SandboxExportFileResult> {
    const { fileService, marketService, topicId, userId } = this.options;

    if (!fileService) {
      return {
        error: { message: 'fileService is required for sandbox file export' },
        filename,
        success: false,
      };
    }

    log('Exporting file: %s from path: %s, topicId: %s', filename, path, topicId);

    try {
      const s3 = new FileS3();
      const now = Date.now();
      const today = new Date(now).toISOString().split('T')[0];
      const key = `code-interpreter-exports/${today}/${topicId}/${filename}`;
      const uploadUrl = await s3.createPreSignedUrl(key);

      const response = await marketService.exportFile({
        path,
        topicId,
        uploadUrl,
        userId,
      });

      log('Sandbox exportFile response: %O', response);

      if (!response.success) {
        return {
          error: { message: response.error?.message || 'Failed to export file from sandbox' },
          filename,
          success: false,
        };
      }

      const result = response.data?.result;
      const uploadSuccess = result?.success !== false;

      if (!uploadSuccess) {
        return {
          error: { message: result?.error || 'Failed to upload file from sandbox' },
          filename,
          success: false,
        };
      }

      const metadata = await s3.getFileMetadata(key);
      const fileSize = metadata.contentLength;
      const mimeType = metadata.contentType || result?.mimeType || 'application/octet-stream';
      const fileHash = sha256(key + now.toString());

      const { fileId, url } = await fileService.createFileRecord({
        fileHash,
        fileType: mimeType,
        name: filename,
        size: fileSize,
        url: key,
      });

      return {
        fileId,
        filename,
        mimeType,
        size: fileSize,
        success: true,
        url,
      };
    } catch (error) {
      log('Error exporting file: %O', error);

      return {
        error: { message: (error as Error).message },
        filename,
        success: false,
      };
    }
  }
}

/** @deprecated Use MarketSandboxProvider. */
export class ServerSandboxService extends MarketSandboxProvider {}
