// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiKeyField } from './ApiKeyField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => (document.body.innerHTML = ''));

function setup(savedKey = '') {
  const onCommit = vi.fn();
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  const render = (key: string) =>
    act(() =>
      root.render(
        <ApiKeyField
          provider="openai"
          savedKey={key}
          checking={false}
          error=""
          modelCount={null}
          onCommit={onCommit}
        />,
      ),
    );
  render(savedKey);
  const button = (name: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(name))!;
  return { container, input: () => container.querySelector('input'), button, render, onCommit };
}

function paste(input: HTMLInputElement, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  act(() => input.dispatchEvent(event));
}

it('never puts the saved key in the DOM', () => {
  const { container, input, button } = setup('sk-old-1234567890');
  expect(input()).toBeNull();
  expect(container.textContent).toContain('sk-old…7890');
  act(() => button('Replace').click());
  expect(input()!.value).toBe('');
  expect(container.innerHTML).not.toContain('sk-old-1234567890');
});

it('saves a pasted key right away, trimmed', () => {
  const { input, onCommit } = setup();
  paste(input()!, '  sk-new-999999\n');
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('sk-new-999999');
  expect(input()!.value).toBe('');
});

it.each(['hunter', 'sk-ant-api03-abcdef'])(
  'holds a paste that does not look like an OpenAI key (%s) until Save',
  (text) => {
    const { container, input, button, onCommit } = setup();
    paste(input()!, text);
    expect(onCommit).not.toHaveBeenCalled();
    expect(container.textContent).toContain("This doesn't look like a key for OpenAI.");
    act(() => button('Save').click());
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(text);
  },
);

it('removes the key only after confirming', () => {
  const { button, onCommit } = setup('sk-old-1234567890');
  act(() => button('Remove').click());
  act(() => button('Cancel').click());
  expect(onCommit).not.toHaveBeenCalled();
  act(() => button('Remove').click());
  act(() => button('Remove').click()); // the confirm button
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('');
});

it('an empty paste neither saves nor clears the draft', () => {
  const { input, onCommit } = setup();
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setValue.call(input(), 'sk-');
    input()!.dispatchEvent(new Event('input', { bubbles: true }));
  });
  paste(input()!, '');
  expect(input()!.value).toBe('sk-');
  expect(onCommit).not.toHaveBeenCalled();
});
