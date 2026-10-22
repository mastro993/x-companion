import { useCallback, useEffect, useRef, useState } from 'react';
import { saveSettings, type Settings } from '@/lib/settings';
import { updateSettings } from './use-settings';

const SAVE_DELAY_MS = 400;

/**
 * Local draft of one stored text value, written back through `apply`. Saves shortly after the
 * last edit, on blur and on unmount, and follows outside changes while there are no unsaved edits.
 */
export function useAutosave(
  settings: Settings,
  value: string,
  apply: (s: Settings, text: string) => Settings,
) {
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState<'idle' | 'editing' | 'saved'>('idle');
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ settings, apply });
  latest.current = { settings, apply };

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const text = pending.current;
    if (text === null) return;
    pending.current = null;
    void updateSettings((s) => latest.current.apply(s, text)).then(() => {
      if (pending.current === null) setStatus('saved'); // else typing resumed meanwhile
    });
  }, []);

  useEffect(() => {
    // The panel is being torn down: updateSettings' read round trip would never finish,
    // so write the last known settings in a single call. Only changed parts are written, so
    // this stale snapshot never rewrites the keys.
    const onPageHide = () => {
      const text = pending.current;
      if (text === null) return;
      pending.current = null;
      const { settings, apply } = latest.current;
      void saveSettings(apply(settings, text), settings);
    };
    addEventListener('pagehide', onPageHide);
    return () => {
      removeEventListener('pagehide', onPageHide);
      flush(); // switching tabs unmounts the panel
    };
  }, [flush]);

  // Follow changes made elsewhere (another tab's panel) unless the user has unsaved edits.
  useEffect(() => {
    if (pending.current === null) setDraft(value);
  }, [value]);

  const onChange = (text: string) => {
    setDraft(text);
    setStatus('editing');
    pending.current = text;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  return { draft, status, onChange, flush };
}
