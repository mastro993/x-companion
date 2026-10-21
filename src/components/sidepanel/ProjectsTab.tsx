import { PlusIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { useAutosave } from '@/hooks/use-autosave';
import { updateSettings } from '@/hooks/use-settings';
import {
  MAX_PROJECT_FIELD_LENGTH,
  MAX_PROJECTS,
  type Project,
  type ProjectField,
  type Settings,
} from '@/lib/settings';

export function ProjectsTab({ settings }: { settings: Settings }) {
  const { projects } = settings;
  const [added, setAdded] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  function add() {
    const id = crypto.randomUUID();
    setAdded(id); // focuses the new card's name once it renders
    void updateSettings((s) => ({
      ...s,
      projects: [...s.projects, { id, name: '', description: '', link: '' }],
    }));
  }

  function remove(id: string) {
    void updateSettings((s) => ({ ...s, projects: s.projects.filter((p) => p.id !== id) }));
    addButton.current?.focus();
  }

  return (
    <FieldSet>
      <FieldLegend>Projects</FieldLegend>
      <FieldDescription>
        Add what you build, up to {MAX_PROJECTS}. The AI mentions a project only when it fits, using
        only what you write here. Projects without a name are skipped.
      </FieldDescription>
      {projects.length > 0 && (
        <ul className="flex flex-col gap-4">
          {projects.map((p, i) => (
            <ProjectCard
              key={p.id}
              project={p}
              position={i + 1}
              settings={settings}
              autoFocus={p.id === added}
              onRemove={() => remove(p.id)}
            />
          ))}
        </ul>
      )}
      <Button
        ref={addButton}
        variant="outline"
        className="self-start"
        disabled={projects.length >= MAX_PROJECTS}
        focusableWhenDisabled
        onClick={add}
      >
        <PlusIcon data-icon="inline-start" />
        Add project
      </Button>
    </FieldSet>
  );
}

const PLACEHOLDERS: Record<ProjectField, string> = {
  name: 'e.g. "Acme Notes"',
  description: 'e.g. "Markdown notes app for small teams. 2k paying users, built solo."',
  link: 'e.g. "https://acme.app"',
};

function ProjectCard({
  project,
  position,
  settings,
  autoFocus,
  onRemove,
}: {
  project: Project;
  position: number;
  settings: Settings;
  autoFocus: boolean;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const removeButton = useRef<HTMLButtonElement>(null);
  const confirmId = useId();

  const apply = (field: ProjectField) => (s: Settings, text: string) => ({
    ...s,
    // A project removed meanwhile (here or in another panel) stays removed.
    projects: s.projects.map((p) => (p.id === project.id ? { ...p, [field]: text } : p)),
  });
  const fields = {
    name: useAutosave(settings, project.name, apply('name')),
    description: useAutosave(settings, project.description, apply('description')),
    link: useAutosave(settings, project.link, apply('link')),
  };
  const statuses = Object.values(fields).map((f) => f.status);
  const saved = statuses.includes('saved') && !statuses.includes('editing');
  const label = fields.name.draft.trim() || `project ${position}`;

  const id = (field: ProjectField) => `project-${project.id}-${field}`;
  const control = (field: ProjectField) => ({
    id: id(field),
    value: fields[field].draft,
    maxLength: MAX_PROJECT_FIELD_LENGTH[field],
    placeholder: PLACEHOLDERS[field],
    onChange: (e: { target: { value: string } }) => fields[field].onChange(e.target.value),
    onBlur: fields[field].flush,
  });

  return (
    <li className="rounded-lg border p-3">
      {/* min-w-0: a fieldset defaults to min-content width, which overflows narrow panels. */}
      <FieldSet className="min-w-0 gap-3">
        <FieldLegend className="sr-only">Project {position}</FieldLegend>
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor={id('name')}>Name</FieldLabel>
            <Input {...control('name')} autoFocus={autoFocus} />
          </Field>
          <Field>
            <FieldLabel htmlFor={id('description')}>Description</FieldLabel>
            <InputGroup>
              <InputGroupTextarea
                {...control('description')}
                className="min-h-16"
                aria-describedby={`${id('description')}-count`}
              />
              <InputGroupAddon align="block-end" className="justify-end">
                <InputGroupText id={`${id('description')}-count`} className="text-xs tabular-nums">
                  {fields.description.draft.length}/{MAX_PROJECT_FIELD_LENGTH.description}
                </InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor={id('link')}>Link</FieldLabel>
            <Input {...control('link')} type="url" />
          </Field>
        </FieldGroup>
        {confirming ? (
          <div role="group" aria-labelledby={confirmId} className="flex items-center gap-2">
            <span id={confirmId} className="min-w-0 flex-1 truncate">
              Remove {label}?
            </span>
            <Button size="xs" variant="destructive" onClick={onRemove}>
              Remove
            </Button>
            {/* The safe choice gets focus, so a repeated Enter doesn't remove the project. */}
            <Button
              size="xs"
              variant="ghost"
              autoFocus
              onClick={() => {
                flushSync(() => setConfirming(false));
                removeButton.current?.focus();
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span role="status" className="text-xs text-muted-foreground">
              {saved && 'Saved'}
            </span>
            <Button ref={removeButton} size="xs" variant="ghost" onClick={() => setConfirming(true)}>
              Remove
              <span className="sr-only"> {label}</span>
            </Button>
          </div>
        )}
      </FieldSet>
    </li>
  );
}
