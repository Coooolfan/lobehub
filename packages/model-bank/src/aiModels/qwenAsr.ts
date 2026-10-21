import type { AIASRModelCard } from '../types/aiModel';

/**
 * Short-audio sync ASR. `qwen-audio-3.1-asr-flash` is called through DashScope
 * `POST /api/v1/services/aigc/multimodal-generation/generation`, not
 * `compatible-mode/v1/audio/transcriptions`.
 *
 * @see https://www.alibabacloud.com/help/zh/model-studio/fun-asr-flash-recorded-speech-recognition-http-api
 */
export const qwenAsrModels: AIASRModelCard[] = [
  {
    contextWindowTokens: 8192,
    description:
      'Qwen Audio 3.1 ASR Flash transcribes recordings up to 5 minutes, with punctuation, inverse text normalization, and multilingual or dialect speech. Output is capped at 1024 tokens. Beijing list price is 0.8 CNY per million audio input tokens and 2.7 CNY per million text output tokens.',
    displayName: 'Qwen Audio 3.1 ASR Flash',
    enabled: true,
    family: 'qwen',
    id: 'qwen-audio-3.1-asr-flash',
    maxOutput: 1024,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'audioInput', rate: 0.8, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 2.7, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'asr',
  },
];
