import { storage } from 'wxt/utils/storage';
import type { ModelOption, ProviderId } from './providers';

export interface ProviderSettings {
  apiKey: string;
  model: ModelOption;
}

/** Style guide sections, in panel and prompt order. Every section is optional. */
export const STYLE_FIELDS = ['persona', 'audience', 'voice', 'rules'] as const;
export type StyleField = (typeof STYLE_FIELDS)[number];
export type StyleGuide = Record<StyleField, string>;

export interface Settings {
  activeProvider: ProviderId | null;
  providers: Partial<Record<ProviderId, ProviderSettings>>;
  style: StyleGuide;
}

export const MAX_STYLE_FIELD_LENGTH = 1000;

const EMPTY_STYLE: StyleGuide = { persona: '', audience: '', voice: '', rules: '' };

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: { activeProvider: null, providers: {}, style: EMPTY_STYLE },
  version: 2,
  migrations: {
    // v1 kept one free-form style (tone plus pasted replies), which is what `voice` holds.
    // It could reach 2000 chars; the panel flags anything over the new limit.
    // A v2 value can lack the version meta (WXT writes it separately on the first save),
    // so anything that isn't the v1 string passes through.
    2: (v1: Omit<Settings, 'style'> & { style: string | StyleGuide }): Settings =>
      typeof v1.style === 'string'
        ? { ...v1, style: { ...EMPTY_STYLE, voice: v1.style } }
        : (v1 as Settings),
  },
});

export type Status =
  | { ready: true; provider: ProviderId; model: ModelOption }
  | { ready: false; reason: 'no-provider' | 'no-key'; provider: ProviderId | null };

/** Pure. Order of checks: provider, key (trimmed). Every saved key has a model. */
export function getStatus(s: Settings): Status {
  const provider = s.activeProvider;
  if (!provider) return { ready: false, reason: 'no-provider', provider: null };
  const p = s.providers[provider];
  if (!p?.apiKey.trim()) return { ready: false, reason: 'no-key', provider };
  return { ready: true, provider, model: p.model };
}
