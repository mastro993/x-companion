// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { listModels } from '@/lib/llm';
import { PROVIDERS } from '@/lib/providers';
import type { Settings } from '@/lib/settings';
import { ProviderTab } from '../ProviderTab';

vi.mock('@/lib/llm', () => ({ listModels: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('reloads models when the stored key changes elsewhere', async () => {
  const model = PROVIDERS.openai.defaultModel;
  vi.mocked(listModels).mockResolvedValue([model]);
  const withKey = (apiKey: string): Settings => ({
    activeProvider: 'openai',
    providers: { openai: { apiKey, model } },
    style: { persona: '', audience: '', voice: '', rules: '' },
    projects: [],
  });
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  const render = (s: Settings) => act(async () => root.render(<ProviderTab settings={s} />));

  await render(withKey('sk-a'));
  expect(container.textContent).toContain('Key verified · 1 model');

  await render(withKey('')); // e.g. removed in another tab's panel
  expect(container.textContent).not.toContain('Key verified');

  await render(withKey('sk-b'));
  expect(vi.mocked(listModels).mock.calls).toEqual([
    ['openai', 'sk-a'],
    ['openai', 'sk-b'],
  ]);
});
