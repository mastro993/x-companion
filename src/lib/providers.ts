export const PROVIDER_IDS = ['openai', 'anthropic', 'xai', 'deepseek', 'openrouter'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ModelOption {
  id: string;
  label: string;
  /** Model accepts reasoning effort "low"; sent to keep replies fast and cheap. */
  lowEffort: boolean;
}

export interface ProviderInfo {
  label: string;
  /** How the provider's keys start. Undocumented, so it only ever triggers a warning. */
  keyPrefix: string;
  keysUrl: string;
  defaultModel: ModelOption;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: {
    label: 'OpenAI',
    keyPrefix: 'sk-',
    keysUrl: 'https://platform.openai.com/api-keys',
    defaultModel: { id: 'gpt-6-luna', label: 'gpt-6-luna', lowEffort: true },
  },
  anthropic: {
    label: 'Anthropic',
    keyPrefix: 'sk-ant-',
    keysUrl: 'https://platform.claude.com/settings/keys',
    defaultModel: { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', lowEffort: true },
  },
  xai: {
    label: 'xAI (Grok)',
    keyPrefix: 'xai-',
    keysUrl: 'https://console.x.ai',
    defaultModel: { id: 'grok-4.3', label: 'grok-4.3', lowEffort: true },
  },
  deepseek: {
    label: 'DeepSeek',
    keyPrefix: 'sk-',
    keysUrl: 'https://platform.deepseek.com/api_keys',
    defaultModel: { id: 'deepseek-flash', label: 'DeepSeek-V4.1-Flash', lowEffort: true },
  },
  openrouter: {
    label: 'OpenRouter',
    keyPrefix: 'sk-or-',
    keysUrl: 'https://openrouter.ai/settings/keys',
    defaultModel: {
      id: 'anthropic/claude-haiku-5.5',
      label: 'Anthropic: Claude Haiku 5.5',
      lowEffort: true,
    },
  },
};

/** Warn-only check. A longer matching prefix is another provider's: sk-ant- isn't an OpenAI sk- key. */
export function looksLikeKeyFor(provider: ProviderId, key: string): boolean {
  const own = PROVIDERS[provider].keyPrefix;
  return (
    key.startsWith(own) &&
    !PROVIDER_IDS.some((id) => {
      const other = PROVIDERS[id].keyPrefix;
      return other.length > own.length && key.startsWith(other);
    })
  );
}
