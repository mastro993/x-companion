import { describe, expect, it } from 'vitest';
import { PROVIDERS } from './providers';
import { getStatus, type Settings } from './settings';

const model = PROVIDERS.openai.defaultModel;
const complete: Settings = {
  activeProvider: 'openai',
  providers: { openai: { apiKey: 'sk-test', model } },
  style: 'dry, short',
};

describe('getStatus', () => {
  it.each<[string, Settings, ReturnType<typeof getStatus>]>([
    [
      'no provider beats every other gap',
      { activeProvider: null, providers: {}, style: '' },
      { ready: false, reason: 'no-provider', provider: null },
    ],
    [
      'active provider without saved settings',
      { ...complete, providers: { anthropic: { apiKey: 'k', model } } },
      { ready: false, reason: 'no-key', provider: 'openai' },
    ],
    [
      'whitespace-only key, before missing style',
      { ...complete, providers: { openai: { apiKey: '  ', model } }, style: '' },
      { ready: false, reason: 'no-key', provider: 'openai' },
    ],
    [
      'whitespace-only style',
      { ...complete, style: ' \n ' },
      { ready: false, reason: 'no-style', provider: 'openai' },
    ],
    ['everything configured', complete, { ready: true, provider: 'openai', model }],
  ])('%s', (_, settings, expected) => {
    expect(getStatus(settings)).toEqual(expected);
  });
});
