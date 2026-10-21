import { useEffect, useState } from 'react';
import { PROVIDERS, type ProviderId } from '@/lib/providers';
import { settingsItem, type Settings } from '@/lib/settings';

/** Live view of stored settings; null until the first read resolves. */
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    let changed = false;
    const unwatch = settingsItem.watch((value) => {
      changed = true;
      setSettings(value);
    });
    // A change seen by the watcher is newer than this initial read.
    void settingsItem.getValue().then((value) => changed || setSettings(value));
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
  const run = queue.then(async () => settingsItem.setValue(update(await settingsItem.getValue())));
  queue = run.catch(() => {});
  return run;
}

/** Stores a key for `provider`, keeping its model or falling back to the provider default. */
export function setProviderKey(s: Settings, provider: ProviderId, apiKey: string): Settings {
  const model = s.providers[provider]?.model ?? PROVIDERS[provider].defaultModel;
  return { ...s, providers: { ...s.providers, [provider]: { apiKey, model } } };
}
