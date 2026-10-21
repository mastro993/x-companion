import { describe, expect, it } from 'vitest';
import { PROVIDERS } from '@/lib/providers';
import type { Settings } from '@/lib/settings';
import { setProviderKey } from './use-settings';

describe('setProviderKey', () => {
  const custom = { id: 'gpt-x', label: 'GPT X', lowEffort: false };
  const base: Settings = {
    activeProvider: 'anthropic',
    providers: { openai: { apiKey: 'old', model: custom } },
    style: { persona: '', audience: '', voice: 's', rules: '' },
    projects: [],
  };

  it('picks the provider default model when none is saved, leaving the rest alone', () => {
    expect(setProviderKey(base, 'anthropic', 'sk-ant-1')).toEqual({
      ...base,
      providers: { ...base.providers, anthropic: { apiKey: 'sk-ant-1', model: PROVIDERS.anthropic.defaultModel } },
    });
  });

  it('keeps the saved model when replacing or removing a key', () => {
    expect(setProviderKey(base, 'openai', 'new').providers.openai).toEqual({ apiKey: 'new', model: custom });
    expect(setProviderKey(base, 'openai', '').providers.openai).toEqual({ apiKey: '', model: custom });
  });
});
