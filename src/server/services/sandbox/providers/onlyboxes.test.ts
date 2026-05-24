import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileService } from '@/server/services/file';
import type { MarketService } from '@/server/services/market';

describe('OnlyboxesSandboxProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doMock('@/envs/app', () => ({
      appEnv: {
        ONLYBOXES_API_TOKEN: 'obx-token',
        ONLYBOXES_BASE_URL: 'https://onlyboxes.example.com/',
        ONLYBOXES_LEASE_TTL_SEC: 120,
      },
    }));
  });

  it('maps runCommand to the terminal command endpoint with a persistent session', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          exit_code: 0,
          session_id: 'lobe-user-1-topic-1',
          stderr: '',
          stdout: 'ok\n',
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { OnlyboxesSandboxProvider } = await import('./onlyboxes');
    const provider = new OnlyboxesSandboxProvider({
      marketService: {} as MarketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    const result = await provider.callTool('runCommand', { command: 'echo ok' });

    expect(result).toMatchObject({
      result: { exitCode: 0, stdout: 'ok\n' },
      success: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://onlyboxes.example.com/api/v1/commands/terminal',
      expect.objectContaining({
        body: JSON.stringify({
          command: 'echo ok',
          create_if_missing: true,
          lease_ttl_sec: 120,
          session_id: 'lobe-user-1-topic-1',
          timeout_ms: 60_000,
        }),
        method: 'POST',
      }),
    );
  });

  it('treats non-zero terminal exit codes as successful tool transport results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            exit_code: 2,
            session_id: 'lobe-user-1-topic-1',
            stderr: 'failed\n',
            stdout: 'partial\n',
          }),
          { status: 200 },
        );
      }),
    );

    const { OnlyboxesSandboxProvider } = await import('./onlyboxes');
    const provider = new OnlyboxesSandboxProvider({
      marketService: {} as MarketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    const result = await provider.callTool('runCommand', { command: 'exit 2' });

    expect(result).toMatchObject({
      result: {
        exitCode: 2,
        stderr: 'failed\n',
        stdout: 'partial\n',
        success: false,
      },
      success: true,
    });
  });

  it('returns a provider error when background command submission fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: 'no_worker',
              message: 'no compatible worker',
            },
            status: 'failed',
          }),
          { status: 200 },
        );
      }),
    );

    const { OnlyboxesSandboxProvider } = await import('./onlyboxes');
    const provider = new OnlyboxesSandboxProvider({
      marketService: {} as MarketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    const result = await provider.callTool('runCommand', {
      background: true,
      command: 'sleep 10',
    });

    expect(result).toMatchObject({
      error: { message: 'no compatible worker' },
      result: null,
      success: false,
    });
  });

  it('unwraps JSON output from terminal-backed file operations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            exit_code: 0,
            session_id: 'lobe-user-1-topic-1',
            stderr: '',
            stdout: JSON.stringify({
              files: [{ isDirectory: false, name: 'a.txt' }],
              totalCount: 1,
            }),
          }),
          { status: 200 },
        );
      }),
    );

    const { OnlyboxesSandboxProvider } = await import('./onlyboxes');
    const provider = new OnlyboxesSandboxProvider({
      marketService: {} as MarketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    const result = await provider.callTool('listLocalFiles', { directoryPath: '/workspace' });

    expect(result).toMatchObject({
      result: {
        files: [{ isDirectory: false, name: 'a.txt' }],
        totalCount: 1,
      },
      success: true,
    });
  });

  it('writes files through chunked terminal scripts instead of embedding content in one command', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            exit_code: 0,
            session_id: 'lobe-user-1-topic-1',
            stderr: '',
            stdout: JSON.stringify({ success: true }),
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            exit_code: 0,
            session_id: 'lobe-user-1-topic-1',
            stderr: '',
            stdout: JSON.stringify({ bytesWritten: 11, success: true }),
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { OnlyboxesSandboxProvider } = await import('./onlyboxes');
    const provider = new OnlyboxesSandboxProvider({
      marketService: {} as MarketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    const result = await provider.callTool('writeLocalFile', {
      content: 'hello world',
      createDirectories: true,
      path: '/workspace/report.txt',
    });

    expect(result).toMatchObject({
      result: { bytesWritten: 11, success: true },
      success: true,
    });
    const firstCallBody = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
      command: string;
    };
    const secondCallBody = JSON.parse(String(fetchMock.mock.calls[1][1].body)) as {
      command: string;
    };
    expect(firstCallBody.command).toContain("path.write_bytes(b'')");
    expect(secondCallBody.command).toContain("path.open('ab')");
    expect(firstCallBody.command).not.toContain('hello world');
    expect(secondCallBody.command).not.toContain('hello world');
  });

  it('ensures a terminal session exists before exporting files through terminalResource', async () => {
    vi.doMock('@/server/modules/S3', () => ({
      FileS3: vi.fn(() => ({
        createPreSignedUrl: vi.fn(async () => 'https://uploads.example.com/put'),
        getFileMetadata: vi.fn(async () => ({
          contentLength: 12,
          contentType: 'text/plain',
        })),
      })),
    }));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            exit_code: 0,
            session_id: 'lobe-user-1-topic-1',
            stderr: '',
            stdout: '',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: {
              file_path: '/workspace/report.txt',
              mime_type: 'text/plain',
              session_id: 'lobe-user-1-topic-1',
              size_bytes: 12,
            },
            status: 'succeeded',
            task_id: 'task-1',
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const fileService = {
      createFileRecord: vi.fn(async () => ({ fileId: 'file-1', url: '/f/file-1' })),
    } as unknown as FileService;

    const { OnlyboxesSandboxProvider } = await import('./onlyboxes');
    const provider = new OnlyboxesSandboxProvider({
      fileService,
      marketService: {} as MarketService,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    const result = await provider.exportAndUploadFile('/workspace/report.txt', 'report.txt');

    expect(result).toMatchObject({
      fileId: 'file-1',
      mimeType: 'text/plain',
      success: true,
      url: '/f/file-1',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://onlyboxes.example.com/api/v1/commands/terminal',
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://onlyboxes.example.com/api/v1/tasks',
      expect.objectContaining({
        body: JSON.stringify({
          capability: 'terminalResource',
          input: {
            action: 'export',
            file_path: '/workspace/report.txt',
            session_id: 'lobe-user-1-topic-1',
            signed_url: 'https://uploads.example.com/put',
          },
          mode: 'sync',
          timeout_ms: 60_000,
          wait_ms: 60_000,
        }),
      }),
    );
  });
});
