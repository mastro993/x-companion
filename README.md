# x-companion

> [!WARNING]
> x-companion is in early development. Expect rough edges and bugs, and review every draft before you post it. Please [report problems](https://github.com/mastro993/x-companion/issues) you run into.

x-companion is a Chromium extension that drafts replies on X (x.com) in your own writing style. It adds three controls to X's reply composer:

- **Generate**, on an empty reply box: drafts a reply to the post.
- **Regenerate**, an icon left of **Rewrite** once the box has text: drafts a fresh reply to the post from scratch and replaces the box's text with it.
- **Rewrite**, once the box has text: a menu that reworks your draft. **Polish** fixes typos, grammar and awkward phrasing with the smallest edits. **Punchier** makes it clearer and catchier. **Match style** brings it closer to your style guide.

The extension sends the post, your draft, your style guide and your projects to the AI provider you chose, then writes the result into the reply box. You edit it and post it yourself.

You bring your own API key from one of these providers:

- OpenAI
- Anthropic
- xAI (Grok)
- OpenRouter

## Privacy and security

x-companion has no backend. It talks only to x.com and the provider you pick:

- **Your keys stay in your browser**: API keys and settings live in `chrome.storage.local`, restricted to trusted extension contexts (`setAccessLevel('TRUSTED_CONTEXTS')`). Only the background service worker and the side panel can read them; the content script on x.com can't. Keys aren't synced across devices, and like all extension storage, they're stored unencrypted in your browser profile.
- **Post text goes only to your provider**: when you run an action, the extension sends the post's author handle, its text, any quoted post and image alt text to the provider you selected, along with your style guide, your projects and, for a rewrite, the text in the reply box. There's no analytics or telemetry. OpenAI requests are sent with `store: false`.
- **It never posts**: the extension only replaces the text in the reply box. Nothing reaches X until you click **Reply**.
- **Minimal permissions**: `storage` and `sidePanel`, plus host access to x.com and the four provider APIs. It doesn't request the `tabs` permission.
- **The page can't drive it**: the content script acts only on real (trusted) user clicks. The background checks that each message comes from an x.com tab, validates its shape and caps field lengths. The prompt wraps post text and your draft in delimiters and tells the model to treat them as material, not instructions.

## Requirements

To install x-companion, you need:

- A Chromium browser, version 140 or newer: Chrome, Edge, or Opera 135.0.5973.123+
  - **Brave**: Brave's sidebar has no entry for extension panels, so open the panel from the toolbar icon instead
  - **Arc**: not supported, because its side panel API does nothing
- An API key from one of the supported providers

## Install

x-companion isn't in the Chrome Web Store yet, so you load it as an unpacked extension. Each [release](https://github.com/mastro993/x-companion/releases) has a ready-made build:

1. Download `x-companion-<version>-chrome.zip` from the [latest release](https://github.com/mastro993/x-companion/releases/latest).
2. Unzip it. You usually get a folder named `x-companion-<version>-chrome`, with `manifest.json` directly inside. Rename it to `x-companion` and move it to a place you'll keep, for example your home folder. The browser runs the extension from this folder and ties its settings to the folder's path, so don't move, rename or delete it later.
3. Open the extensions page: `chrome://extensions` (Chrome), `edge://extensions` (Edge) or `brave://extensions` (Brave).
4. Turn on **Developer mode**.
5. Click **Load unpacked** and select the folder.
6. Optionally, pin x-companion to the toolbar.

Reload any x.com tab that was open before you installed. The x-companion controls appear only after a page reload, and the same applies after you update, reload or re-enable the extension.

### Update

The browser doesn't update unpacked extensions, so you update x-companion by hand. Your API keys, style guide and projects carry over:

1. Download the zip from the [latest release](https://github.com/mastro993/x-companion/releases/latest).
2. Unzip it, then swap the folders: delete your `x-companion` folder, rename the new folder to `x-companion` and move it to the same place. `manifest.json` must sit directly inside it, not in a subfolder.
3. On the extensions page, click the reload icon on the x-companion card.
4. Reload any open x.com tab.

Don't remove the extension or load the new version from another folder: either way, the browser treats it as a new extension and your settings are lost.

### Build from source

To build x-companion yourself, you need Node.js 22.12+ and pnpm. These commands clone the repository and write a production build to `.output/chrome-mv3`:

```sh
git clone https://github.com/mastro993/x-companion.git
cd x-companion
pnpm install
pnpm build
```

Load `.output/chrome-mv3` as in steps 3 to 6 of [Install](#install). To update, run `git pull`, `pnpm install` and `pnpm build`, then reload the extension and any open x.com tab.

## Set up and generate a reply

Setup takes one tab in the side panel, plus an optional style guide and project list. Once a provider and key are set, the controls are ready on every reply box:

1. Open x.com and click the x-companion toolbar icon. The side panel opens; it's available only on x.com tabs.
2. On the **Provider** tab, choose a provider and paste your API key. The key is saved when you paste it, press Enter or leave the field. The panel then verifies the key by loading the provider's model list. Each provider starts with a default model, which you can change.
3. Optionally, fill in the style guide on the **Style** tab. It has four sections, and each one holds up to 1000 characters:
   - **Persona**: who you are and your main interests.
   - **Audience**: the people you're speaking to and what resonates with them.
   - **Style & Vocabulary**: your tone, structure and signature phrases. Paste two or three of your past replies here: examples teach the model your style better than adjectives do.
   - **Rules**: dos and don'ts the AI must always respect, such as "no hashtags" or "always reply in English".

   Only the sections you fill in are sent with each request. Changes save automatically.
4. Optionally, add what you build on the **Projects** tab, up to 10 projects. Each one has a name, a description of up to 300 characters and a link. A fresh reply mentions a project only when it fits the post, and only with the facts you wrote. Projects without a name aren't sent. **Remove** asks you to confirm inline.
5. When the header shows **Ready**, open a reply: the reply dialog, or the inline reply box on a post's page. On an empty box, click **Generate**. Once the box has text, whether a draft or your own, click **Rewrite** and pick **Polish**, **Punchier** or **Match style**, or click the **Regenerate** icon for a fresh reply that replaces the text. Review and edit the result before you post.

Until a provider and key are set, the controls are greyed out, and clicking them opens the side panel. If an action fails, for example from a bad key, a rate limit or a timeout, a short message appears next to the controls. If you edit the reply box while an action runs, the result is dropped so it can't overwrite your edit.

To keep keys for other providers without switching the active one, save them under **Other saved keys**. **Remove** asks you to confirm inline before it deletes a key.

## Known limitations

These gaps are known and not yet fixed:

- **Long posts**: only the visible part of a long post (before **Show more**) is sent. The prompt tells the model the post is truncated.
- **X markup changes**: X can change its page structure at any time, which can stop the controls from appearing or from filling the box. If the extension can't verify the filled text, the controls show an error. Check the reply box, because X may have accepted part of the draft.
- **Composers without controls**: in a multi-post reply thread, only the first box gets controls. Inline reply boxes under individual comments, new posts and quotes get none.
- **Theme switches**: the controls copy X's text colour when they're inserted. After you switch X's theme, close and reopen the composer to update it.
- **xAI**: x-companion calls xAI's Chat Completions endpoint, which xAI now labels legacy in favour of its Responses API. The endpoint still works, and xAI hasn't announced a shutdown date.
- **Model lists**: the panel fetches models live when it opens, and when you change the provider or key. OpenAI and xAI models show their raw IDs.

## Contributing

To build, test or change x-companion, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
