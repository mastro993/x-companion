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
import { useAutosave } from '@/hooks/use-autosave';
import { MAX_STYLE_FIELD_LENGTH, STYLE_FIELDS, type Settings, type StyleField } from '@/lib/settings';

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

function StyleSection({ field, settings }: { field: StyleField; settings: Settings }) {
  const { label, description, placeholder } = SECTIONS[field];
  const { draft, status, onChange, flush } = useAutosave(settings, settings.style[field], (s, text) => ({
    ...s,
    style: { ...s.style, [field]: text },
  }));

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
          onChange={(e) => onChange(e.target.value)}
          onBlur={flush}
        />
        <InputGroupAddon align="block-end" className="justify-between">
          <InputGroupText role="status" className="text-xs">
            {status === 'saved' && 'Saved'}
          </InputGroupText>
          <InputGroupText id={`${id}-count`} className="text-xs tabular-nums">
            {draft.length}/{MAX_STYLE_FIELD_LENGTH}
          </InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}
