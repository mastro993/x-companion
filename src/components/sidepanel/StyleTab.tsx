import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { updateSettings } from '@/hooks/use-settings';
import {
  MAX_STYLE_FIELD_LENGTH,
  settingsItem,
  STYLE_FIELDS,
  type Settings,
  type StyleField,
} from '@/lib/settings';

const SAVE_DELAY_MS = 400;

const SECTIONS: Record<StyleField, { label: string; description: string; placeholder: string }> = {
  persona: {
    label: 'Persona',
    description: 'Describe who you are and your main interests.',
    placeholder: 'e.g. "Indie iOS developer. Ships small apps, talks pricing and building in public."',
  },
  audience: {
    label: 'Audience',
    description: "Describe the people you're speaking to and what resonates with them.",
    placeholder: 'e.g. "Indie makers and developers. They trust numbers from real launches over hot takes."',
  },
  voice: {
    label: 'Style & Vocabulary',
    description: 'Share tone, structure, and signature phrases so the AI can mimic your voice.',
    placeholder:
      'e.g. "Casual and direct, short sentences, often says \'imo\'."\n\nPaste 2–3 of your past replies: examples carry style better than adjectives.',
  },
  rules: {
    label: 'Rules',
    description: "Add specific dos and don'ts the AI must always respect.",
    placeholder: 'e.g. "No hashtags. Never mention my own apps. Always reply in English."',
  },
};

export function StyleTab({ settings }: { settings: Settings }) {
  return (
    <FieldSet>
      <FieldLegend>Style Guide</FieldLegend>
      <FieldDescription>
        Customize how the AI writes for your account. Every section is optional.
      </FieldDescription>
      <FieldGroup>
        {STYLE_FIELDS.map((field) => (
          <StyleSection key={field} field={field} settings={settings} />
        ))}
      </FieldGroup>
    </FieldSet>
  );
}

const withSection = (s: Settings, field: StyleField, text: string): Settings => ({
  ...s,
  style: { ...s.style, [field]: text },
});

function StyleSection({ field, settings }: { field: StyleField; settings: Settings }) {
  const { label, description, placeholder } = SECTIONS[field];
  const value = settings.style[field];
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(settings);
  latest.current = settings;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const text = pending.current;
    if (text === null) return;
    pending.current = null;
    void updateSettings((s) => withSection(s, field, text)).then(() => setSaved(true));
  }, [field]);

  useEffect(() => {
    // The panel is being torn down: updateSettings' read round trip would never finish,
    // so write the last known settings in a single call.
    const onPageHide = () => {
      const text = pending.current;
      if (text === null) return;
      pending.current = null;
      void settingsItem.setValue(withSection(latest.current, field, text));
    };
    addEventListener('pagehide', onPageHide);
    return () => {
      removeEventListener('pagehide', onPageHide);
      flush(); // switching tabs unmounts this panel
    };
  }, [field, flush]);

  // Follow changes made elsewhere (another tab's panel) unless the user has unsaved edits.
  useEffect(() => {
    if (pending.current === null) setDraft(value);
  }, [value]);

  const id = `style-${field}`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldDescription id={`${id}-help`}>{description}</FieldDescription>
      <InputGroup>
        <InputGroupTextarea
          id={id}
          className="min-h-24"
          value={draft}
          maxLength={MAX_STYLE_FIELD_LENGTH}
          // Only text migrated from the old 2000-char style can be over the limit.
          aria-invalid={draft.length > MAX_STYLE_FIELD_LENGTH}
          aria-describedby={`${id}-help ${id}-count`}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.target.value);
            setSaved(false);
            pending.current = e.target.value;
            clearTimeout(timer.current);
            timer.current = setTimeout(flush, SAVE_DELAY_MS);
          }}
          onBlur={flush}
        />
        <InputGroupAddon align="block-end" className="justify-between">
          <InputGroupText role="status" className="text-xs">
            {saved && 'Saved'}
          </InputGroupText>
          <InputGroupText id={`${id}-count`} className="text-xs tabular-nums">
            {draft.length}/{MAX_STYLE_FIELD_LENGTH}
          </InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}
