import { useCallback, useEffect, useRef, useState } from 'react';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { updateSettings } from '@/hooks/use-settings';
import { MAX_STYLE_LENGTH, settingsItem, type Settings } from '@/lib/settings';

const SAVE_DELAY_MS = 400;

export function StyleTab({ settings }: { settings: Settings }) {
  const [draft, setDraft] = useState(settings.style);
  const [saved, setSaved] = useState(false);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(settings);
  latest.current = settings;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const style = pending.current;
    if (style === null) return;
    pending.current = null;
    void updateSettings((s) => ({ ...s, style })).then(() => setSaved(true));
  }, []);

  useEffect(() => {
    // The panel is being torn down: updateSettings' read round trip would never finish,
    // so write the last known settings in a single call.
    const onPageHide = () => {
      const style = pending.current;
      if (style === null) return;
      pending.current = null;
      void settingsItem.setValue({ ...latest.current, style });
    };
    addEventListener('pagehide', onPageHide);
    return () => {
      removeEventListener('pagehide', onPageHide);
      flush(); // switching tabs unmounts this panel
    };
  }, [flush]);

  // Follow changes made elsewhere (another tab's panel) unless the user has unsaved edits.
  useEffect(() => {
    if (pending.current === null) setDraft(settings.style);
  }, [settings.style]);

  return (
    <Field>
      <FieldLabel htmlFor="style">Writing style</FieldLabel>
      <Textarea
        id="style"
        className="min-h-48"
        value={draft}
        maxLength={MAX_STYLE_LENGTH}
        aria-describedby="style-help style-count"
        placeholder={
          'Describe your tone, e.g. "dry humor, short, no hashtags or emojis".\n\nThen paste 2–3 of your own past replies.'
        }
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
          pending.current = e.target.value;
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, SAVE_DELAY_MS);
        }}
        onBlur={flush}
      />
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span role="status">{saved && 'Saved'}</span>
        <span id="style-count">
          {draft.length}/{MAX_STYLE_LENGTH}
        </span>
      </div>
      <FieldDescription id="style-help">
        Used for every reply. Examples of your own replies carry style better than adjectives.
      </FieldDescription>
    </Field>
  );
}
