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

/** Something the user built, which the AI may mention. `id` only keys the panel's list. */
export interface Project {
  id: string;
  name: string;
  description: string;
  link: string;
}
export type ProjectField = Exclude<keyof Project, 'id'>;

export interface Settings {
  activeProvider: ProviderId | null;
  providers: Partial<Record<ProviderId, ProviderSettings>>;
  style: StyleGuide;
  projects: Project[];
}

export const MAX_STYLE_FIELD_LENGTH = 1000;
export const MAX_PROJECTS = 10;
export const MAX_PROJECT_FIELD_LENGTH: Record<ProjectField, number> = {
  name: 60,
  description: 300,
  link: 200,
};

const EMPTY_STYLE: StyleGuide = { persona: '', audience: '', voice: '', rules: '' };

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: { activeProvider: null, providers: {}, style: EMPTY_STYLE, projects: [] },
  version: 3,
  migrations: {
    // v1 kept one free-form style (tone plus pasted replies), which is what `voice` holds.
    // It could reach 2000 chars; the panel flags anything over the new limit.
    // A v2 value can lack the version meta (WXT writes it separately on the first save),
    // so anything that isn't the v1 string passes through.
    2: (v1: Omit<Settings, 'style'> & { style: string | StyleGuide }) =>
      typeof v1.style === 'string' ? { ...v1, style: { ...EMPTY_STYLE, voice: v1.style } } : v1,
    // Same caveat: a value may already have projects.
    3: (v2: Omit<Settings, 'projects'> & { projects?: Project[] }): Settings => ({
      ...v2,
      projects: v2.projects ?? [],
    }),
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
