// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiKeyField } from './ApiKeyField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => (document.body.innerHTML = ''));

function setup() {
  const onCommit = vi.fn();
  const container = document.body.appendChild(document.createElement('div'));
  act(() =>
    createRoot(container).render(
      <ApiKeyField
        provider="openai"
        savedKey="sk-old-123456"
        checking={false}
        error=""
        modelCount={null}
        onCommit={onCommit}
      />,
    ),
  );
  return { input: container.querySelector('input')!, onCommit };
}

function paste(input: HTMLInputElement, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  act(() => input.dispatchEvent(event));
}

it('a paste replaces the saved key instead of appending to it', () => {
  const { input, onCommit } = setup();
  paste(input, '  sk-new-999999\n');
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('sk-new-999999');
  expect(input.value).toBe('sk-new-999999');
});

it('an empty paste neither removes the key nor makes the next keystroke commit', () => {
  const { input, onCommit } = setup();
  paste(input, '');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setValue.call(input, 's');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(onCommit).not.toHaveBeenCalled();
});
