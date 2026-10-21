# Contributing to x-companion

This guide covers how to run x-companion locally, how the code is organized, the rules the code follows, and how to test a change before you open a pull request. For what the extension does and how to install it, see the [README](README.md).

x-companion is in early development, so expect parts of the code and this guide to change.

## Set up your environment

You need Node.js 22.12+, pnpm and a Chromium browser, version 140 or newer. Install dependencies once:

```sh
pnpm install
```

The install also runs `wxt prepare`, which generates the TypeScript config in `.wxt/`.

## Run a development build

This command builds into `.output/chrome-mv3-dev`, starts a dev server on `localhost:3000` and opens Chrome at x.com/home with the extension loaded:

```sh
pnpm dev
```

How the dev session behaves:

- **Persistent profile**: the Chrome window uses its own profile in `.wxt/chrome-data`. Log in to X there once, and later runs keep the login.
- **Fixed extension ID**: dev builds carry a manifest `key`, so their extension ID is always `mogjdmpkbfcfdgedklmkjoploiamddcf`, wherever the checkout lives. Production builds have no key.
- **Rebuilds**: saving a file rebuilds automatically. The side panel hot-reloads. Background and content-script changes reload the extension; if the controls don't come back, reload the x.com tab.
- **One session per checkout**: a second `pnpm dev` takes the next port and overwrites `.output/chrome-mv3-dev`, which breaks the first session.
- **Extra permissions**: WXT adds the `tabs` and `scripting` permissions to dev builds so it can reload the extension. Check anything permission-related with a production build.

### Use another browser or profile

Personal overrides go in a `web-ext.config.ts` at the repo root. The file is gitignored, so it affects only your checkout.

To open Brave (or another Chromium browser) instead of Chrome, point the `chrome` binary at it. Give it its own profile, because Chromium refuses a profile that a newer browser version created:

```ts
// web-ext.config.ts
import { resolve } from 'node:path';
import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
  binaries: {
    chrome: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  },
  chromiumProfile: resolve('.wxt/brave-data'),
});
```

To use your everyday browser profile instead, set `disabled: true` in that file. Then load `.output/chrome-mv3-dev` unpacked while `pnpm dev` runs.

To apply your overrides to every checkout and worktree, put them in `~/.webextrc` instead. It ranks below a checkout's `web-ext.config.ts`, and it uses `key=value` lines:

```ini
# ~/.webextrc
binaries.chrome=/Applications/Brave Browser.app/Contents/MacOS/Brave Browser
chromiumProfile=/Users/you/.wxt-brave-profile
```

With an absolute `chromiumProfile`, every checkout shares one profile. Thanks to the fixed extension ID, the X login and the side panel's settings (API keys, style guide) carry over between checkouts. The catch is that only one `pnpm dev` session can run at a time.

## Build for production

`pnpm build` writes the extension to `.output/chrome-mv3`, and `pnpm zip` packages it as the zip that releases ship:

```sh
pnpm build   # .output/chrome-mv3
pnpm zip     # .output/x-companion-<version>-chrome.zip
```

To load the build, follow the steps in the README's [build from source section](README.md#build-from-source). After each rebuild, click the reload icon on the extension's card, then reload any open x.com tab.

## Release a version

The owner releases by hand with the **Release** workflow (`.github/workflows/release.yml`). On the repository's **Actions** tab, pick **Release**, click **Run workflow** on `main` and choose a bump:

- **patch** for fixes, for example `0.1.0` to `0.1.1`
- **minor** for new features, for example `0.1.0` to `0.2.0`
- **major** for breaking changes, for example `0.1.0` to `1.0.0`

The workflow type checks and tests the code, bumps the version in `package.json`, and builds the zip. It then pushes a `chore(release): v<version>` commit and a `v<version>` tag to `main`, and publishes a GitHub release with the zip attached. The release notes list the pull requests merged since the previous tag, by title, so write titles that read well in a changelog.

The `main` ruleset only accepts changes through pull requests, so the workflow pushes with a deploy key, which the ruleset lets bypass it. The key's private half is stored in the `RELEASE_DEPLOY_KEY` Actions secret, and its public half is a deploy key on the repository with write access.

If `main` moves while the workflow runs, for example because someone merged a pull request or another release finished first, the push fails and nothing is released. Start a new run with **Run workflow**: **Re-run jobs** on the failed run reuses its old commit and fails the same way.

## How the extension works

x-companion has three parts that talk through extension messages, plus the provider adapters the background uses.

- **Background service worker** (`src/entrypoints/background.ts`):
  - Enables the side panel and toolbar icon per tab, on x.com only. The manifest has no global `side_panel` entry, so the panel never follows you to other sites.
  - Answers the content script: it reports the ready status, opens the side panel and runs actions (generate or rewrite a reply). Regenerate reaches it as a plain generate, without the draft.
  - Calls the provider API directly, with a 60s timeout. A keepalive holds the service worker open during long calls.
  - Pushes ready-status changes to open x.com tabs.
- **Content script** (`src/entrypoints/x.content/`, logic in `src/lib/x-dom.ts`):
  - Watches the page for reply composers: the reply dialog, the inline composer on a post page and the narrow-layout `/compose/post` page.
  - Inserts the controls before X's **Reply** button: **Generate** on an empty box, then the **Regenerate** icon and **Rewrite** with its menu once the box has text. New-post, quote and home composers get no controls.
  - The Rewrite menu is a native popover with CSS anchor positioning, so it sits in the top layer and X's overflow can't clip it.
  - Reads the target post: the author, the text with emoji, any quoted post, image alt text and whether **Show more** cut it off.
  - Fills the Draft.js editor with a synthetic paste, then checks the result. A result is dropped if the box changed while the action ran.
- **Side panel** (`src/entrypoints/sidepanel/`, `src/components/sidepanel/`):
  - Built with React 19, shadcn/ui (Base UI) and Tailwind v4, in X's colour palette.
  - Follows the system light or dark theme.
  - Keeps all state in extension storage.
- **Large language model (LLM) adapters** (`src/lib/llm.ts`):
  - Two request paths: Chat Completions (OpenAI, xAI, DeepSeek, OpenRouter) and Anthropic Messages.
  - Request low reasoning effort when the model supports it.
- **Jev adapter** (`src/lib/jev.ts`), not used yet:
  - Asks [Jev](https://docs.typesafe.ai/introduction), TypeSafe's decision model, typed questions about some state: yes/no, pick one option or rate on a scale. The answers come back typed, with probabilities instead of text.
  - Sends the same System One request to TypeSafe with a TypeSafe key, or to OpenRouter with an OpenRouter key.
  - The host list includes `https://api.typesafe.ai/*` for the TypeSafe route, because TypeSafe's CORS rules reject extension origins.
- **Prompts** (`src/lib/prompts/`):
  - One file per action. Each exports a `PromptBuilder`: a function from `PromptConfig` (the context, meaning the post and the reply box text, plus the style guide and projects) to a system and user message.
  - `PROMPTS` in `index.ts` maps each action in `ACTIONS` (`src/lib/messages.ts`) to its prompt. To add an action, add its ID there, write its prompt file and register it, then give it a label in `src/lib/x-dom.ts`.
  - The rewrite actions share `rewrite.ts`, so each of their files holds only its instruction. The shared blocks (style guide, projects, the post and its context, delimiter stripping) live in `shared.ts`.
  - A fresh reply is capped at 280 characters. A rewrite keeps that cap, or the draft's length if it's longer.

## Project structure

The source tree groups code by extension entrypoint, with shared logic in `src/lib/`:

```text
src/
  entrypoints/
    background.ts          service worker: panel per tab, messaging, LLM calls
    x.content/             content script + button CSS for x.com
    sidepanel/             side panel page (index.html, main.tsx, App.tsx)
  components/
    sidepanel/             panel UI: status header, provider/key/model, style, projects
    ui/                    shadcn/ui components
  hooks/                   useSettings (storage-backed), useModels, useAutosave
  lib/
    providers.ts           provider ids, labels, default models
    settings.ts            settings storage item + getStatus
    messages.ts            content <-> background message types
    llm.ts                 provider HTTP adapters
    jev.ts                 Jev decision-model adapter (not used yet)
    prompts/               one prompt per action, shared prompt blocks
    background-utils.ts    URL check + untrusted message validation
    x-dom.ts               every X selector and DOM routine
  assets/tailwind.css      theme tokens (side panel only)
public/icon/               toolbar and store icons
wxt.config.ts              manifest (permissions, hosts, minimum Chrome)
```

## Code guidelines

These rules keep the extension small and private, and they limit the work when X changes its page:

- **Keep X selectors in one file**: every X selector and DOM routine lives in `src/lib/x-dom.ts`. When X changes its markup, that file is the only one to update.
- **Keep the content script away from storage**: the content script runs on x.com and must never import settings or storage code. It asks the background for anything it needs.
- **Treat messages as untrusted**: validate every message that reaches the background in `src/lib/background-utils.ts`, and cap the length of any new field.
- **Call providers over plain HTTP**: the adapters use `fetch`, with no provider SDKs. To add a provider, extend `src/lib/providers.ts`, the matching request path in `src/lib/llm.ts` and the host list in `wxt.config.ts`.
- **Reuse shadcn/ui components**: build side panel UI from the components in `src/components/ui/`. Add missing ones with the shadcn CLI rather than writing your own.
- **Don't add permissions lightly**: every permission and host in `wxt.config.ts` shows up in the install prompt. Explain any new one in your pull request.
- **Update the docs with the code**: if a change affects behaviour described in the README or this guide, update that text in the same pull request.

## Test your change

Unit tests cover the logic, but they never call a real provider or load the real x.com. Run the automated checks, then test by hand on x.com.

### Run the automated checks

Run `pnpm compile`, `pnpm test` and `pnpm build` before every commit. The CI workflow runs the same three checks on every pull request and every push to `main`:

```sh
pnpm test                                # all unit tests, once
pnpm vitest                              # watch mode
pnpm vitest run src/lib/x-dom.test.ts    # a single file
pnpm compile                             # TypeScript type check
pnpm build                               # catches bundling and manifest errors
```

The unit tests use Vitest, and the DOM tests run in happy-dom. They cover:

- provider request and response handling, with `fetch` stubbed
- the prompts and message validation
- settings status and the stored-settings migration
- the side panel's key field, model reload, style guide saving and project list
- the X DOM logic, against hand-written fixtures

When you fix a bug, add a test that fails without the fix if the code can be tested in happy-dom.

### Test by hand on x.com

You need an X account and an API key for at least one provider. Use `pnpm dev`, or load a production build. Then check each area:

1. **x.com only**: on an x.com tab, click the toolbar icon, and the side panel opens. Switch to any other site, and the panel hides while the icon greys out. Switch back, and both return.
2. **Setup**:
   - On the **Provider** tab, choose a provider and paste your key. The panel shows “Key verified · N models”, and the header changes to **Ready** with the style guide still empty.
   - Paste a wrong key. The panel shows “Invalid API key”.
   - Pick a model.
   - On the **Style** tab, fill in each section. Each one shows **Saved** shortly after you stop typing. Switch to **Provider** and back: each section kept its text.
   - On the **Projects** tab, add a project. Its **Name** field gets focus. Fill in the fields: the card shows **Saved** shortly after you stop typing. Switch tabs and back: the project kept its text. **Remove** asks to confirm, and **Cancel** keeps it. **Add project** turns off at 10 projects.
3. **Placement**:
   - **Generate** appears left of **Reply** in the reply dialog (the reply icon under a timeline post) and in the inline reply box on a post's own page.
   - Type a character: **Generate** becomes **Rewrite**, with the **Regenerate** icon on its left. Delete it: **Generate** comes back alone.
   - No controls appear in the home “What's happening?” box, the new-post dialog or the quote dialog.
4. **Not ready**:
   - Clear the active provider's API key. The controls turn grey.
   - Click **Generate**, then type something and click **Regenerate** and **Rewrite**. Each opens the side panel, and no menu opens.
   - Paste the key again. The controls become active without a page reload.
5. **Generate**:
   - Click **Generate**. It shows “Generating…”, then the draft appears in the reply box and the control becomes **Rewrite**.
   - Confirm that X's **Reply** button is enabled, that you can edit the text, and that nothing was posted.
   - Type into the box while it shows “Generating…”. The result is dropped with a message, and your text stays.
   - With text in the box, click **Regenerate**. The Rewrite pill shows “Regenerating…”, then a fresh reply replaces the text.
6. **Rewrite**:
   - Click **Rewrite**. A menu with **Polish**, **Punchier** and **Match style** opens under it, or above it when there's no room below. Clicking outside it or pressing Escape closes it.
   - Pick each action on a multi-line draft. The pill shows its progress (“Polishing…”, “Rewriting…”), then the rewrite replaces the draft and keeps its line breaks.
   - **Polish** on a draft that needs no fixes leaves the box as it was.
7. **Errors**: use a bad key, or go offline, and run an action. A short message appears next to the controls for about 6s.
8. **Each provider**: for every provider you have a key for, switch the active provider and generate once.
9. **Narrow window**: shrink the window until X switches to its narrow layout, where replies open as a `/compose/post` page. The controls still appear, switch between Generate and Rewrite as you type, and fill the box.
10. **Themes**: under X's Default and Lights out themes, the controls and the Rewrite menu stay readable. After you switch theme, reopen the composer.

## Debug the extension

Each part of the extension has its own DevTools console:

- **Service worker** (provider calls, messaging): on the extensions page, click the **service worker** link on the x-companion card.
- **Side panel**: right-click inside the panel and choose **Inspect**.
- **Content script**: open DevTools on the x.com tab and pick **x-companion** in the Console's context dropdown.
- **Stored settings**: run `await chrome.storage.local.get()` in the service worker console.

> [!CAUTION]
> The stored settings output includes your API keys. Don't paste it into issues, pull requests or chats.

## Open a pull request

Branch from `main` and keep each pull request to one change:

- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/), for example `feat: add Gemini provider` or `fix: detect the inline reply box`.
- **Checks**: `pnpm compile`, `pnpm test` and `pnpm build` pass, and you ran the manual tests that your change touches.
- **Description**: say what changed, why, and how you tested it. For side panel or composer control changes, add before and after screenshots with no API keys or personal data in them.
- **Review**: automated Claude reviews run on the owner's pull requests. Other pull requests get one only after the owner adds the `claude-review` label.
