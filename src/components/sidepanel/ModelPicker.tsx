import { RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import type { ModelOption } from '@/lib/providers';

interface Props {
  hasKey: boolean;
  value: ModelOption | null;
  models: ModelOption[] | null;
  loading: boolean;
  onChange: (model: ModelOption) => void;
  onRefresh: () => void;
}

const LIMIT = 50;

const matches = (m: ModelOption, query: string) =>
  `${m.label} ${m.id}`.toLowerCase().includes(query.toLowerCase());

export function ModelPicker({ hasKey, value, models, loading, onChange, onRefresh }: Props) {
  // Prefer the listed entry so the input and the ticked item show the same label.
  const selected = hasKey ? (models?.find((m) => m.id === value?.id) ?? value) : null;
  // Selected first: it stays selectable before the list loads, if the list no longer has it,
  // and when it sorts past the display limit.
  const items = selected
    ? [selected, ...(models ?? []).filter((m) => m.id !== selected.id)]
    : (models ?? []);

  return (
    <Field data-disabled={!hasKey || undefined}>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor="model">Model</FieldLabel>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Refresh models"
          disabled={!hasKey || loading}
          focusableWhenDisabled
          onClick={onRefresh}
        >
          {loading ? <Spinner aria-hidden /> : <RefreshCwIcon />}
        </Button>
      </div>
      <Combobox
        items={items}
        value={selected}
        onValueChange={(m) => m && onChange(m)}
        itemToStringLabel={(m) => m.label}
        itemToStringValue={(m) => m.id}
        isItemEqualToValue={(a, b) => a.id === b.id}
        filter={matches}
        limit={LIMIT}
        disabled={!hasKey}
      >
        <ComboboxInput
          id="model"
          className="w-full"
          placeholder={hasKey ? 'Search models…' : 'Add a key to load models'}
          disabled={!hasKey}
          triggerLabel="Show models"
        />
        <ComboboxContent>
          {loading ? (
            <div className="flex flex-col gap-1 p-1" aria-busy="true" aria-label="Loading models">
              <Skeleton className="h-7" />
              <Skeleton className="h-7" />
              <Skeleton className="h-7" />
            </div>
          ) : (
            <>
              <ComboboxEmpty>No models found</ComboboxEmpty>
              <ComboboxList>
                {(m: ModelOption) => (
                  <ComboboxItem key={m.id} value={m}>
                    <span className="truncate">{m.label}</span>
                  </ComboboxItem>
                )}
              </ComboboxList>
              {/* ponytail: also shown while a query narrows the list; switch to
                  useFilteredItems() if that confuses anyone. */}
              {items.length > LIMIT && (
                <div className="border-t px-2 py-1.5 text-xs text-muted-foreground group-data-empty/combobox-content:hidden">
                  Showing {LIMIT} of {items.length}. Type to search.
                </div>
              )}
            </>
          )}
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}
