import { useEffect, useState } from 'react';
import { PROVIDERS, type ProviderId } from '@/lib/providers';
import { getSettings, saveSettings, type Settings, watchSettings } from '@/lib/settings';

/** Live view of stored settings; null until the first read resolves. */
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    let latest = 0;
    // Every change re-reads everything; only the newest read lands.
    const refresh = () => {
      const call = ++latest;
      void getSettings().then((value) => call === latest && setSettings(value));
    };
    const unwatch = watchSettings(refresh);
    refresh();
    return unwatch;
  }, []);
  return settings;
}

let queue: Promise<void> = Promise.resolve();

/**
 * Applies `update` to the latest stored value. Writes are serialized so edits to
 * different fields never overwrite each other. A failed write rejects the returned
 * promise only, so later writes still run.
 */
export function updateSettings(update: (s: Settings) => Settings): Promise<void> {
  const run = queue.then(async () => {
    const prev = await getSettings();
    await saveSettings(update(prev), prev);
  });
  queue = run.catch(() => {});
  return run;
}

/** Stores a key for `provider`, keeping its model or falling back to the provider default. */
export function setProviderKey(s: Settings, provider: ProviderId, apiKey: string): Settings {
  const model = s.providers[provider]?.model ?? PROVIDERS[provider].defaultModel;
  return { ...s, providers: { ...s.providers, [provider]: { apiKey, model } } };
}
