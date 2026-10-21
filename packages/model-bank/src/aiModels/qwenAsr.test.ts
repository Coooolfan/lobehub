import { describe, expect, it } from 'vitest';

import { ModelProvider } from '../const/modelProvider';
import { LOBE_DEFAULT_MODEL_LIST, qwen } from './index';
import { qwenAsrModels } from './qwenAsr';

describe('qwenAsrModels', () => {
  it('registers qwen-audio-3.1-asr-flash as an enabled Qwen ASR model', () => {
    expect(qwenAsrModels).toEqual([
      expect.objectContaining({
        displayName: 'Qwen Audio 3.1 ASR Flash',
        enabled: true,
        id: 'qwen-audio-3.1-asr-flash',
        maxOutput: 1024,
        pricing: {
          currency: 'CNY',
          units: [
            { name: 'audioInput', rate: 0.8, strategy: 'fixed', unit: 'millionTokens' },
            { name: 'textOutput', rate: 2.7, strategy: 'fixed', unit: 'millionTokens' },
          ],
        },
        type: 'asr',
      }),
    ]);

    expect(qwen).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'qwen-audio-3.1-asr-flash', type: 'asr' }),
      ]),
    );

    expect(LOBE_DEFAULT_MODEL_LIST).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          enabled: true,
          id: 'qwen-audio-3.1-asr-flash',
          providerId: ModelProvider.Qwen,
          type: 'asr',
        }),
      ]),
    );
  });
});
