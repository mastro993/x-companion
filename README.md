# x-companion

x-companion is a Chromium extension that drafts replies on X (x.com) in your own writing style. It adds a **Generate** button to X's reply composer. Click it, and the extension sends the post you are replying to, along with your style notes, to the AI provider you picked. The draft lands in the reply box for you to edit. You post it yourself.

You bring your own API key. OpenAI, Anthropic, xAI (Grok) and OpenRouter are supported.

## Privacy and security

- **Your keys stay in your browser.** API keys and settings are kept in `chrome.storage.local`, restricted to trusted extension contexts (`setAccessLevel('TRUSTED_CONTEXTS')`). Only the background service worker and the side panel can read them; the content script running on x.com cannot. Keys are not synced across devices. They are stored unencrypted in your browser profile, like any extension storage.
- **Post text only goes to your provider.** When you click Generate, the extension sends the post's author handle, its text, any quoted post, and image alt text to the provider you selected, and nowhere else. There is no backend, analytics or telemetry. OpenAI requests are sent with `store: false`.
- **It never posts.** The extension only replaces the text in the reply box. Nothing is sent to X until you click Reply.
- **Minimal permissions:** `storage` and `sidePanel`, plus host access to x.com and the four provider APIs. It does not request the `tabs` permission.
- **The page can't drive it.** The content script only acts on real (trusted) user clicks. The background checks that messages come from an x.com tab, validates their shape and caps field lengths. Post text is wrapped in delimiters, and the prompt tells the model to treat it as material, not instructions.

## Requirements

- A Chromium browser, version 140 or newer: Chrome, Edge, or Opera 135.0.5973.123+.
  - **Brave:** Brave's sidebar has no entry for extension panels. Open the panel from the toolbar icon instead.
  - **Arc:** not supported. Its side panel API does nothing.
- Node.js 22.12+ and pnpm, to build from source.
- An API key from one of the supported providers.

## Build

Install dependencies once. This also runs `wxt prepare`, which generates the TypeScript config in `.wxt/`.

```sh
pnpm install
```

### Development build

```sh
pnpm dev
```

- Builds into `.output/chrome-mv3-dev`, starts a dev server on `localhost:3000`, and opens Chrome at x.com/home with the extension loaded.
- That Chrome window uses its own persistent profile in `.wxt/chrome-data`. Log in to X there once, and the login is kept for later runs.
- Saving a file rebuilds automatically. The side panel hot-reloads. Background and content-script changes reload the extension; reload the x.com tab if the button doesn't come back.
- Run only one `pnpm dev` per checkout. A second one takes the next port and overwrites `.output/chrome-mv3-dev`, which breaks the first session.
- Dev builds also get the `tabs` and `scripting` permissions (WXT adds them for reloading). Check anything permission-related with a production build.
- Personal overrides go in a `web-ext.config.ts` at the repo root. It's gitignored, so it only affects you.

  **Open Brave (or another Chromium browser) instead of Chrome.** Point the `chrome` binary at it, and give it its own profile, because Chromium refuses a profile created by a newer browser version:

  ```ts
  // web-ext.config.ts
  import { resolve } from 'node:path';
  import { defineWebExtConfig } from 'wxt';

  export default defineWebExtConfig({
    binaries: { chrome: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' },
    chromiumProfile: resolve('.wxt/brave-data'),
  });
  ```

  **Use your everyday browser profile instead.** Set `disabled: true` in that file, then load `.output/chrome-mv3-dev` unpacked while `pnpm dev` runs.

### Production build

```sh
pnpm build   # .output/chrome-mv3
pnpm zip     # .output/x-companion-<version>-chrome.zip, for the Chrome Web Store
```

### Load the build in your browser

1. Open the extensions page: `chrome://extensions` (Chrome), `edge://extensions` (Edge) or `brave://extensions` (Brave).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select `.output/chrome-mv3`.
4. Optionally, pin x-companion to the toolbar.

After a rebuild, click the reload icon on the extension's card. x.com tabs that were already open need a page reload before the button shows up. The same applies after installing, updating, reloading or re-enabling the extension.

## Usage

1. Open x.com and click the x-companion toolbar icon. The side panel opens; it is only available on x.com tabs.
2. On the **Provider** tab, choose a provider and paste your API key. The key is saved on paste, Enter or blur, then verified by loading the provider's model list. Each provider starts with a sensible default model; change it if you like.
3. On the **Style** tab, describe how you write and paste two or three of your own past replies. Examples carry your style better than adjectives. Changes save automatically.
4. Once the header shows **Ready**, open a reply: the reply dialog, or the inline reply box on a post's page. Click **Generate**, then review and edit the draft before posting.

Until setup is complete, the button is greyed out, and clicking it opens the side panel. Errors such as a bad key, rate limits or timeouts appear in a short message next to the button.

Keys for other providers can be saved under **Other saved keys** without switching the active provider. **Remove** asks for confirmation inline.

## How it works

- **Background service worker** (`src/entrypoints/background.ts`)
  - Enables the side panel and toolbar icon per tab, on x.com only. The manifest has no global `side_panel` entry, so the panel never follows you to other sites.
  - Answers the content script: current ready status, opening the side panel, and generating a reply.
  - Calls the provider API directly, with a 60 s timeout. A keepalive holds the service worker open during long calls.
  - Pushes ready-status changes to open x.com tabs.
- **Content script** (`src/entrypoints/x.content/`, logic in `src/lib/x-dom.ts`)
  - Watches the page for reply composers: the reply dialog, the inline composer on a post page, and the narrow-layout `/compose/post` page.
  - Inserts the button before X's Reply button. New-post, quote and home composers get no button.
  - Reads the target post: the author, the text with emoji, any quoted post, image alt text, and whether "Show more" cut it off.
  - Fills the Draft.js editor with a synthetic paste, then checks the result. It never imports settings or storage code.
- **Side panel** (`src/entrypoints/sidepanel/`, `src/components/sidepanel/`)
  - Built with React 19, shadcn/ui (Base UI) and Tailwind v4, in X's colour palette.
  - Follows the system light or dark theme.
  - All state lives in extension storage.
- **LLM adapters** (`src/lib/llm.ts`, `src/lib/prompt.ts`)
  - Two request paths: Chat Completions (OpenAI, xAI, OpenRouter) and Anthropic Messages. No SDKs.
  - Low reasoning effort is requested when the model supports it.
  - Replies are capped at 280 characters by the prompt.

## Project structure

```
src/
  entrypoints/
    background.ts          service worker: panel per tab, messaging, LLM calls
    x.content/             content script + button CSS for x.com
    sidepanel/             side panel page (index.html, main.tsx, App.tsx)
  components/
    sidepanel/             panel UI: status header, provider/key/model, style
    ui/                    shadcn/ui components
  hooks/                   useSettings (storage-backed), useModels
  lib/
    providers.ts           provider ids, labels, default models
    settings.ts            settings storage item + getStatus
    messages.ts            content <-> background message types
    llm.ts, prompt.ts      provider HTTP adapters, reply prompt
    background-utils.ts    URL check + untrusted message validation
    x-dom.ts               every X selector and DOM routine
  assets/tailwind.css      theme tokens (side panel only)
public/icon/               toolbar and store icons
wxt.config.ts              manifest (permissions, hosts, minimum Chrome)
```

## Testing

### Automated checks

```sh
pnpm test                                # all unit tests, once
pnpm vitest                              # watch mode
pnpm vitest run src/lib/x-dom.test.ts    # a single file
pnpm compile                             # TypeScript type check
pnpm build                               # catches bundling and manifest errors
```

Run `pnpm compile`, `pnpm test` and `pnpm build` before committing.

The unit tests use Vitest; DOM tests run in happy-dom. They cover:

- provider request and response handling, with `fetch` stubbed
- the prompt builder and message validation
- settings status
- the side panel's key field and model reload
- the X DOM logic, against hand-written fixtures

Nothing calls a real provider, and nothing loads the real x.com, so also test by hand after changes.

### Manual test on x.com

You need an X account and an API key for at least one provider. Use `pnpm dev`, or load a production build as described above.

1. **x.com only.** On an x.com tab, click the toolbar icon and the side panel opens. Switch to any other site: the panel hides and the icon is greyed out. Switch back and it returns.
2. **Setup.**
   - On the **Provider** tab, choose a provider and paste your key. You should see "Key verified · N models".
   - Paste a wrong key and you should see "Invalid API key".
   - Pick a model.
   - On the **Style** tab, write a style. The header should change to **Ready**.
3. **Button placement.**
   - **Generate** appears left of **Reply** in:
     - the reply dialog (the reply icon under a post on the timeline)
     - the inline reply box on a post's own page
   - It does **not** appear in the home "What's happening?" box, the new-post dialog or the quote dialog.
4. **Not ready.**
   - Clear the style: the button turns grey.
   - Clicking it opens the side panel.
   - Restore the style: the button becomes active without reloading the page.
5. **Generate.**
   - Click **Generate**. It shows "Generating…", then the draft appears in the reply box.
   - Check that:
     - X's **Reply** button is enabled
     - you can edit the text
     - nothing was posted
   - Run it again on a box that already has text: the text is replaced, not appended. Multi-line drafts keep their line breaks.
6. **Errors.** With a bad key, or with the network offline, a short message appears next to the button for about 6 seconds.
7. **Each provider** you have a key for: switch the active provider and generate once.
8. **Narrow window.** Shrink the window until X switches to its narrow layout, where replies open as a `/compose/post` page. The button should still appear and fill the box.
9. **Themes.** Under X's Default and Lights out themes the button stays readable. After switching theme, reopen the composer.

### Debugging

- **Service worker** (provider calls, messaging): on the extensions page, click the **service worker** link on the x-companion card.
- **Side panel:** right-click inside the panel and choose **Inspect**.
- **Content script:** open DevTools on the x.com tab and pick **x-companion** in the Console's context dropdown.
- **Stored settings:** run `await chrome.storage.local.get()` in the service-worker console. The output includes your API keys, so don't paste it anywhere.

## Known limitations

- **Long posts:** only the visible part of a long post ("Show more") is sent. The model is told the post is truncated.
- **X markup changes** can break composer detection or filling. All X selectors live in `src/lib/x-dom.ts`. If the filled text can't be verified, the button shows an error. Check the reply box, since X may have accepted part of it.
- **Some composers get no button:** in a multi-post reply thread only the first box gets one, and inline reply boxes under individual comments get none.
- **Theme switches:** the button picks up X's text colour when it is inserted, so after switching X's theme it updates once the composer re-opens.
- **xAI** is called through its Chat Completions endpoint, which xAI now labels legacy (it recommends the Responses API). It still works, and no shutdown date has been announced.
- **Model lists** are fetched live when the panel opens or the provider or key changes. OpenAI and xAI models are shown by their raw ids.
