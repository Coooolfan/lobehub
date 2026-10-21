import { isRecord, pickString } from '@lobechat/utils/object';
import createDebug from 'debug';

import type { ASROptions, ASRPayload } from '../../types/asr';

const log = createDebug('lobe-model-runtime:qwen:transcribe');

/** Sync short-audio model. Other Qwen ids stay on the OpenAI transcription client. */
export const QWEN_AUDIO_ASR_FLASH_MODEL = 'qwen-audio-3.1-asr-flash';

const GENERATION_PATH = '/api/v1/services/aigc/multimodal-generation/generation';
const COMPATIBLE_MODE_SUFFIX = '/compatible-mode/v1';
const DEFAULT_DASHSCOPE_ORIGIN = 'https://dashscope.aliyuncs.com';

const AUDIO_BY_MIME: Record<string, { format: string; mimeType: string }> = {
  'audio/aac': { format: 'aac', mimeType: 'audio/aac' },
  'audio/flac': { format: 'flac', mimeType: 'audio/flac' },
  'audio/mp3': { format: 'mp3', mimeType: 'audio/mpeg' },
  'audio/mp4': { format: 'm4a', mimeType: 'audio/mp4' },
  'audio/mpeg': { format: 'mp3', mimeType: 'audio/mpeg' },
  'audio/ogg': { format: 'ogg', mimeType: 'audio/ogg' },
  'audio/opus': { format: 'opus', mimeType: 'audio/opus' },
  'audio/wav': { format: 'wav', mimeType: 'audio/wav' },
  'audio/wave': { format: 'wav', mimeType: 'audio/wav' },
  'audio/webm': { format: 'webm', mimeType: 'audio/webm' },
  'audio/x-m4a': { format: 'm4a', mimeType: 'audio/mp4' },
  'audio/x-wav': { format: 'wav', mimeType: 'audio/wav' },
};

const AUDIO_BY_EXT: Record<string, { format: string; mimeType: string }> = {
  aac: { format: 'aac', mimeType: 'audio/aac' },
  flac: { format: 'flac', mimeType: 'audio/flac' },
  m4a: { format: 'm4a', mimeType: 'audio/mp4' },
  mp3: { format: 'mp3', mimeType: 'audio/mpeg' },
  ogg: { format: 'ogg', mimeType: 'audio/ogg' },
  opus: { format: 'opus', mimeType: 'audio/opus' },
  wav: { format: 'wav', mimeType: 'audio/wav' },
  webm: { format: 'webm', mimeType: 'audio/webm' },
};

/** Voice messages are already 16 kHz WAV, and `parameters.format` is required. */
const DEFAULT_AUDIO = { format: 'wav', mimeType: 'audio/wav' };

export interface QwenAsrTokenUsage {
  input_tokens: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface QwenAudioAsrFlashTranscription {
  text: string;
  usage?: QwenAsrTokenUsage;
}

export interface CreateQwenAudioAsrFlashTranscriptionOptions {
  apiKey: string;
  baseURL?: string;
  headers?: ASROptions['headers'];
  payload: ASRPayload;
  requestModel: string;
  signal?: AbortSignal;
}

const resolveDashScopeOrigin = (baseURL?: string): string => {
  if (!baseURL) return DEFAULT_DASHSCOPE_ORIGIN;

  const suffixIndex = baseURL.indexOf(COMPATIBLE_MODE_SUFFIX);
  const origin = (suffixIndex > -1 ? baseURL.slice(0, suffixIndex) : baseURL).replace(/\/$/, '');

  return origin || DEFAULT_DASHSCOPE_ORIGIN;
};

const resolveAudio = (file: Blob, fileName?: string): { format: string; mimeType: string } => {
  const mediaType = file.type.split(';')[0]?.trim().toLowerCase();
  const fromMime = mediaType ? AUDIO_BY_MIME[mediaType] : undefined;
  if (fromMime) return fromMime;

  const name = fileName || (file instanceof File ? file.name : undefined);
  const ext = name?.split('.').pop()?.toLowerCase();

  return (ext && AUDIO_BY_EXT[ext]) || DEFAULT_AUDIO;
};

const languageHint = (language?: string): string | undefined => {
  const hint = language?.split('-')[0]?.trim().toLowerCase();
  return hint || undefined;
};

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body: unknown = await response.json();
    if (!isRecord(body)) return response.statusText;

    return pickString(body.message) || pickString(body.code) || response.statusText;
  } catch (error) {
    console.error('Failed to parse DashScope ASR error response', error);
    return response.statusText;
  }
};

const readTranscript = (body: unknown): string | undefined => {
  if (!isRecord(body) || !isRecord(body.output)) return undefined;

  const text = pickString(body.output.text);
  if (text !== undefined) return text;

  return isRecord(body.output.sentence) ? pickString(body.output.sentence.text) : undefined;
};

const readUsage = (body: unknown): QwenAsrTokenUsage | undefined => {
  if (!isRecord(body) || !isRecord(body.usage)) return undefined;
  if (typeof body.usage.input_tokens !== 'number') return undefined;

  return {
    input_tokens: body.usage.input_tokens,
    ...(typeof body.usage.output_tokens === 'number'
      ? { output_tokens: body.usage.output_tokens }
      : {}),
    ...(typeof body.usage.total_tokens === 'number'
      ? { total_tokens: body.usage.total_tokens }
      : {}),
  };
};

const applyHeaders = (headers: Headers, extra?: ASROptions['headers']) => {
  if (!extra) return;

  for (const [key, value] of Object.entries(extra)) {
    if (typeof value === 'string') headers.set(key, value);
  }
};

/**
 * Transcribe one recording with Qwen-Audio-3.1-ASR-Flash.
 *
 * The request is a single sync POST. Audio is a Base64 Data URI, and the
 * transcript is `output.text`. Token usage is present for this model; duration-only
 * usage from other Flash models is ignored.
 *
 * @see https://www.alibabacloud.com/help/zh/model-studio/fun-asr-flash-recorded-speech-recognition-http-api
 */
export const createQwenAudioAsrFlashTranscription = async ({
  apiKey,
  baseURL,
  headers,
  payload,
  requestModel,
  signal,
}: CreateQwenAudioAsrFlashTranscriptionOptions): Promise<QwenAudioAsrFlashTranscription> => {
  const { format, mimeType } = resolveAudio(payload.file, payload.fileName);
  const audioBase64 = Buffer.from(await payload.file.arrayBuffer()).toString('base64');
  const hint = languageHint(payload.language);
  const url = `${resolveDashScopeOrigin(baseURL)}${GENERATION_PATH}`;

  log('transcribe %s via %s, %d bytes, format %s', requestModel, url, payload.file.size, format);

  const requestHeaders = new Headers({
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-DashScope-SSE': 'disable',
  });
  applyHeaders(requestHeaders, headers);

  const response = await fetch(url, {
    body: JSON.stringify({
      input: {
        messages: [
          {
            content: [
              {
                input_audio: { data: `data:${mimeType};base64,${audioBase64}` },
                type: 'input_audio',
              },
            ],
            role: 'user',
          },
        ],
      },
      model: requestModel,
      parameters: {
        format,
        ...(hint ? { language_hints: [hint] } : {}),
      },
    }),
    headers: requestHeaders,
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    const error = new Error(`DashScope ASR failed (${response.status}): ${message}`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    console.error('DashScope ASR response was not JSON', error);
    throw new Error('DashScope ASR response was not JSON', { cause: error });
  }

  const text = readTranscript(body);
  if (text === undefined) throw new Error('DashScope ASR response did not include output.text');

  log('transcription completed, text length %d', text.length);

  return { text, usage: readUsage(body) };
};
