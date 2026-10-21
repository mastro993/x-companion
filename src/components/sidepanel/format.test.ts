import { describe, expect, it } from 'vitest';
import { PROVIDERS } from '@/lib/providers';
import { maskKey, statusHint } from './format';

describe('maskKey', () => {
  it.each([
    ['', '—'],
    ['short', '…'],
    ['0123456789', '…'],
    ['sk-ant-api03-abcdefa1b2', 'sk-ant…a1b2'],
  ])('%j -> %j', (key, masked) => expect(maskKey(key)).toBe(masked));
});

describe('statusHint', () => {
  const model = PROVIDERS.anthropic.defaultModel;
  it.each([
    [{ ready: true, provider: 'anthropic', model } as const, 'Replies: Anthropic · Claude Haiku 5.5'],
    [{ ready: false, reason: 'no-provider', provider: null } as const, 'Choose a provider'],
    [{ ready: false, reason: 'no-key', provider: 'xai' } as const, 'Add your xAI (Grok) API key'],
  ])('%o', (status, hint) => expect(statusHint(status)).toBe(hint));
});
