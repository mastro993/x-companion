import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import type { Status } from '@/lib/settings';
import { statusHint } from './format';

export function StatusHeader({ status }: { status: Status }) {
  const label = status.ready ? 'Ready' : 'Setup needed';
  return (
    <header className="flex flex-col gap-1 border-b px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-lg font-bold">x-companion</h1>
        {/* Announced through the status line below instead. */}
        <Badge variant="outline" aria-hidden>
          <span
            className={cn('size-2 rounded-full', status.ready ? 'bg-success' : 'bg-muted-foreground')}
          />
          {label}
        </Badge>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        <span className="sr-only">{label}: </span>
        {statusHint(status)}
      </p>
    </header>
  );
}
