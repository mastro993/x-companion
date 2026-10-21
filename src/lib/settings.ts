import { storage } from 'wxt/utils/storage';
import type { ModelOption, ProviderId } from './providers';

export interface ProviderSettings {
  apiKey: string;
  model: ModelOption;
}

export interface Settings {
  activeProvider: ProviderId | null;
  providers: Partial<Record<ProviderId, ProviderSettings>>;
  style: string;
}

export const MAX_STYLE_LENGTH = 2000;

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: { activeProvider: null, providers: {}, style: '' },
});

export type Status =
  | { ready: true; provider: ProviderId; model: ModelOption }
  | {
      ready: false;
      reason: 'no-provider' | 'no-key' | 'no-style';
      provider: ProviderId | null;
    };

/** Pure. Order of checks: provider, key (trimmed), style (trimmed). Every saved key has a model. */
export function getStatus(s: Settings): Status {
  const provider = s.activeProvider;
  if (!provider) return { ready: false, reason: 'no-provider', provider: null };
  const p = s.providers[provider];
  if (!p?.apiKey.trim()) return { ready: false, reason: 'no-key', provider };
  if (!s.style.trim()) return { ready: false, reason: 'no-style', provider };
  return { ready: true, provider, model: p.model };
}
