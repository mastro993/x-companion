// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { settingsItem, type Settings } from '@/lib/settings';
import { StyleTab } from './StyleTab';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('saves an edited section on unmount, leaving the other sections alone', async () => {
  const settings: Settings = {
    ...settingsItem.fallback,
    style: { persona: '', audience: '', voice: 'dry', rules: 'no hashtags' },
  };
  await settingsItem.setValue(settings);
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  act(() => root.render(<StyleTab settings={settings} />));

  const persona = container.querySelector<HTMLTextAreaElement>('#style-persona')!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  act(() => {
    setValue.call(persona, 'indie dev');
    persona.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(container.querySelector('#style-persona-count')!.textContent).toBe('9/1000');

  await act(async () => root.unmount()); // switching tabs
  expect((await settingsItem.getValue()).style).toEqual({ ...settings.style, persona: 'indie dev' });
});
