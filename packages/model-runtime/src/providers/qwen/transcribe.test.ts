// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentRuntimeErrorType } from '../../types/error';
import { LobeQwenAI } from './index';
import { QWEN_AUDIO_ASR_FLASH_MODEL } from './transcribe';

vi.mock('@lobechat/business-model-bank/model-config', () => ({
  loadModels: vi.fn().mockResolvedValue([]),
}));

const wavBytes = new Uint8Array([1, 2, 3, 4]);
const wavFile = new File([wavBytes], 'speech.wav', { type: 'audio/wav' });
const wavDataUri = `data:audio/wav;base64,${Buffer.from(wavBytes).toString('base64')}`;

const jsonResponse = (body: unknown, status = 200) => Response.json(body, { status });

const dashScopeSuccess = (usage?: Record<string, number>) =>
  jsonResponse({
    output: { text: '你好，世界' },
    request_id: 'req-1',
    ...(usage ? { usage } : {}),
  });

describe('LobeQwenAI transcribe qwen-audio-3.1-asr-flash', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const requestBody = () => {
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    return JSON.parse(String(init?.body));
  };

  it('posts a Base64 Data URI to DashScope multimodal-generation and returns output.text', async () => {
    fetchMock.mockResolvedValue(
      dashScopeSuccess({ input_tokens: 120, output_tokens: 8, total_tokens: 128 }),
    );
    const onUsage = vi.fn();
    const runtime = new LobeQwenAI({ apiKey: 'test-key' });

    await expect(
      runtime.transcribe(
        { file: wavFile, language: 'zh-CN', model: QWEN_AUDIO_ASR_FLASH_MODEL },
        { headers: { 'X-Request-Id': 'trace-1' }, onUsage },
      ),
    ).resolves.toEqual({ text: '你好，世界' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    );
    expect(init.method).toBe('POST');

    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-key');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-DashScope-SSE')).toBe('disable');
    expect(headers.get('X-DashScope-Async')).toBeNull();
    expect(headers.get('X-Request-Id')).toBe('trace-1');

    expect(requestBody()).toEqual({
      input: {
        messages: [
          {
            content: [{ input_audio: { data: wavDataUri }, type: 'input_audio' }],
            role: 'user',
          },
        ],
      },
      model: QWEN_AUDIO_ASR_FLASH_MODEL,
      parameters: { format: 'wav', language_hints: ['zh'] },
    });
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        inputAudioTokens: 120,
        inputTextTokens: 0,
        outputTextTokens: 8,
        totalInputTokens: 120,
        totalOutputTokens: 8,
        totalTokens: 128,
      }),
    );
  });

  it('strips the compatible-mode suffix and reads the sentence fallback', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ output: { sentence: { text: 'fallback' } }, usage: { duration: 4 } }),
    );
    const onUsage = vi.fn();
    const runtime = new LobeQwenAI({
      apiKey: 'intl-key',
      baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    });
    const mp3 = new File([wavBytes], 'clip.mp3', { type: 'audio/mpeg' });

    await expect(
      runtime.transcribe({ file: mp3, model: QWEN_AUDIO_ASR_FLASH_MODEL }, { onUsage }),
    ).resolves.toEqual({ text: 'fallback' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    );
    expect(requestBody().parameters).toEqual({ format: 'mp3' });
    expect(requestBody().input.messages[0].content[0].input_audio.data).toMatch(
      /^data:audio\/mpeg;base64,/,
    );
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('uses a mapped model id and forwards the abort signal', async () => {
    fetchMock.mockResolvedValue(dashScopeSuccess());
    const controller = new AbortController();
    const runtime = new LobeQwenAI({
      apiKey: 'test-key',
      baseURL: 'https://workspace.example.maas.aliyuncs.com',
      modelIdMapping: { 'custom-asr': QWEN_AUDIO_ASR_FLASH_MODEL },
    });
    const blob = new Blob([wavBytes], { type: '' });

    await runtime.transcribe(
      { file: blob, fileName: 'voice.wav', model: 'custom-asr' },
      { signal: controller.signal },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://workspace.example.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    );
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toBe(controller.signal);
    expect(requestBody().model).toBe(QWEN_AUDIO_ASR_FLASH_MODEL);
    expect(requestBody().parameters.format).toBe('wav');
  });

  it('keeps other Qwen models on the OpenAI transcription client', async () => {
    const runtime = new LobeQwenAI({ apiKey: 'test-key' });
    const create = vi
      .spyOn(runtime.client.audio.transcriptions, 'create')
      .mockResolvedValue({ text: 'whisper text' } as never);

    await expect(runtime.transcribe({ file: wavFile, model: 'qwen3-asr-flash' })).resolves.toEqual({
      text: 'whisper text',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'qwen3-asr-flash' }),
      expect.any(Object),
    );
  });

  it('reports an invalid API key when DashScope returns 401', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'InvalidApiKey', message: 'Invalid API-key' }, 401),
    );
    const runtime = new LobeQwenAI({ apiKey: 'bad-key' });

    await expect(
      runtime.transcribe({ file: wavFile, model: QWEN_AUDIO_ASR_FLASH_MODEL }),
    ).rejects.toMatchObject({
      errorType: AgentRuntimeErrorType.InvalidProviderAPIKey,
      provider: 'qwen',
    });
  });

  it('fails when the response has no transcript', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ output: {}, request_id: 'req-2' }));
    const runtime = new LobeQwenAI({ apiKey: 'test-key' });

    await expect(
      runtime.transcribe({ file: wavFile, model: QWEN_AUDIO_ASR_FLASH_MODEL }),
    ).rejects.toMatchObject({
      errorType: AgentRuntimeErrorType.AgentRuntimeError,
      message: expect.stringContaining('output.text'),
      provider: 'qwen',
    });
  });
});
