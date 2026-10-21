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
  keyPlaceholder: string;
  keysUrl: string;
  defaultModel: ModelOption;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: {
    label: 'OpenAI',
    keyPlaceholder: 'sk-…',
    keysUrl: 'https://platform.openai.com/api-keys',
    defaultModel: { id: 'gpt-6-luna', label: 'gpt-6-luna', lowEffort: true },
  },
  anthropic: {
    label: 'Anthropic',
    keyPlaceholder: 'sk-ant-…',
    keysUrl: 'https://platform.claude.com/settings/keys',
    defaultModel: { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', lowEffort: true },
  },
  xai: {
    label: 'xAI (Grok)',
    keyPlaceholder: 'xai-…',
    keysUrl: 'https://console.x.ai',
    defaultModel: { id: 'grok-4.3', label: 'grok-4.3', lowEffort: true },
  },
  deepseek: {
    label: 'DeepSeek',
    keyPlaceholder: 'sk-…',
    keysUrl: 'https://platform.deepseek.com/api_keys',
    defaultModel: { id: 'deepseek-flash', label: 'DeepSeek-V4.1-Flash', lowEffort: true },
  },
  openrouter: {
    label: 'OpenRouter',
    keyPlaceholder: 'sk-or-…',
    keysUrl: 'https://openrouter.ai/settings/keys',
    defaultModel: {
      id: 'anthropic/claude-haiku-5.5',
      label: 'Anthropic: Claude Haiku 5.5',
      lowEffort: true,
    },
  },
};
