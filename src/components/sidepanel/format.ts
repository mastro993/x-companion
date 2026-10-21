import { PROVIDERS } from '@/lib/providers';
import type { Status } from '@/lib/settings';

/** "sk-ant-…a1b2". Values too short to mask safely are hidden entirely. */
export function maskKey(key: string): string {
  if (!key) return '—';
  return key.length > 10 ? `${key.slice(0, 6)}…${key.slice(-4)}` : '…';
}

/** One-line next step for the header. */
export function statusHint(status: Status): string {
  if (status.ready) return `Replies: ${PROVIDERS[status.provider].label} · ${status.model.label}`;
  switch (status.reason) {
    case 'no-provider':
      return 'Choose a provider';
    case 'no-key':
      // getStatus always sets the provider here. Every label takes "an": OpenAI, Anthropic, xAI (Grok), OpenRouter.
      return `Add an ${PROVIDERS[status.provider!].label} API key`;
  }
}

/** Keep password managers from offering to save or fill API keys. */
export const NO_AUTOFILL = {
  autoComplete: 'off',
  spellCheck: false,
  'data-1p-ignore': true,
  'data-lpignore': 'true',
} as const;
