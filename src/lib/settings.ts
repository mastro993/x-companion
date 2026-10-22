import { storage } from 'wxt/utils/storage';
import { type ModelOption, PROVIDER_IDS, PROVIDERS, type ProviderId } from './providers';

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

/** What the app works with. Storage keeps the API keys apart, see getSettings. */
export interface Settings {
  activeProvider: ProviderId | null;
  providers: Partial<Record<ProviderId, ProviderSettings>>;
  style: StyleGuide;
  projects: Project[];
}

type StoredSettings = Omit<Settings, 'providers'> & {
  providers: Partial<Record<ProviderId, { model: ModelOption }>>;
};
type ApiKeys = Partial<Record<ProviderId, string>>;

export const MAX_STYLE_FIELD_LENGTH = 1000;
export const MAX_PROJECTS = 10;
export const MAX_PROJECT_FIELD_LENGTH: Record<ProjectField, number> = {
  name: 60,
  description: 300,
  link: 200,
};

const EMPTY_STYLE: StyleGuide = { persona: '', audience: '', voice: '', rules: '' };

export const DEFAULT_SETTINGS: Settings = {
  activeProvider: null,
  providers: {},
  style: EMPTY_STYLE,
  projects: [],
};

// The background restricts storage.local to TRUSTED_CONTEXTS, so content scripts can't read it.
const keysItem = storage.defineItem<ApiKeys>('local:apiKeys', { fallback: {} });

export const settingsItem = storage.defineItem<StoredSettings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
  version: 4,
  migrations: {
    // v1 kept one free-form style (tone plus pasted replies), which is what `voice` holds.
    // It could reach 2000 chars; the panel flags anything over the new limit.
    // A v2 value can lack the version meta (WXT writes it separately on the first save),
    // so anything that isn't the v1 string passes through.
    2: (v1: Omit<Settings, 'style'> & { style: string | StyleGuide }) =>
      typeof v1.style === 'string' ? { ...v1, style: { ...EMPTY_STYLE, voice: v1.style } } : v1,
    // Same caveat: a value may already have projects.
    3: (v2: Omit<Settings, 'projects'> & { projects?: Project[] }) => ({
      ...v2,
      projects: v2.projects ?? [],
    }),
    // Moves the keys into their own item, so style and project saves stop rewriting them. Same
    // caveat, and the service worker and the panel can run this at once: both write the same keys.
    4: async (v3: Settings) => {
      const [stored, keys] = split(v3);
      if (Object.keys(keys).length) {
        await keysItem.setValue({ ...keys, ...(await keysItem.getValue()) });
      }
      return stored;
    },
  },
});

function split({ providers, ...rest }: Settings): [StoredSettings, ApiKeys] {
  const models: StoredSettings['providers'] = {};
  const keys: ApiKeys = {};
  for (const id of PROVIDER_IDS) {
    const p = providers[id];
    if (!p) continue;
    models[id] = { model: p.model };
    if (p.apiKey) keys[id] = p.apiKey;
  }
  return [{ ...rest, providers: models }, keys];
}

function merge(stored: StoredSettings, keys: ApiKeys): Settings {
  const providers: Settings['providers'] = {};
  for (const id of PROVIDER_IDS) {
    const model = stored.providers[id]?.model;
    const apiKey = keys[id];
    if (model || apiKey) {
      providers[id] = { apiKey: apiKey ?? '', model: model ?? PROVIDERS[id].defaultModel };
    }
  }
  return { ...stored, providers };
}

export async function getSettings(): Promise<Settings> {
  // Settings first: its migration may still be moving keys into keysItem.
  const stored = await settingsItem.getValue();
  return merge(stored, await keysItem.getValue());
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Writes only the parts of `next` that differ from `prev` (everything without `prev`), so a style
 * edit never rewrites the keys.
 */
export async function saveSettings(next: Settings, prev?: Settings): Promise<void> {
  const [stored, keys] = split(next);
  const [prevStored, prevKeys] = prev ? split(prev) : [];
  if (!same(keys, prevKeys)) await keysItem.setValue(keys);
  if (!same(stored, prevStored)) await settingsItem.setValue(stored);
}

/** Calls `onChange` after any write to the settings or the keys. Returns the unwatch function. */
export function watchSettings(onChange: () => void): () => void {
  const unwatch = [settingsItem, keysItem].map((item) => item.watch(onChange));
  return () => unwatch.forEach((u) => u());
}

/**
 * Calls `onReady` when a write flips whether actions can run, and after the first write either way.
 * No baseline read: a write can be what wakes the service worker, and the read would see its result.
 */
export function watchReady(onReady: (ready: boolean) => void): () => void {
  // Chained so each change compares against the one before it.
  let last: Promise<boolean | undefined> = Promise.resolve(undefined);
  return watchSettings(() => {
    last = last.then(async (was) => {
      const ready = await getSettings().then((s) => getStatus(s).ready, () => was);
      if (ready !== undefined && ready !== was) onReady(ready);
      return ready;
    });
  });
}

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
