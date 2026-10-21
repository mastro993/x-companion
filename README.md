# x-companion

> [!WARNING]
> x-companion is in early development. Expect rough edges and bugs, and review every draft before you post it. Please [report problems](https://github.com/mastro993/x-companion/issues) you run into.

x-companion is a Chromium extension that drafts replies on X (x.com) in your own writing style. It adds a **Generate** button to X's reply composer. When you click it, the extension sends the post and your style notes to the AI provider you chose, then writes the draft into the reply box. You edit it and post it yourself.

You bring your own API key from one of these providers:

- OpenAI
- Anthropic
- xAI (Grok)
- OpenRouter

## Privacy and security

x-companion has no backend. It talks only to x.com and the provider you pick:

- **Your keys stay in your browser**: API keys and settings live in `chrome.storage.local`, restricted to trusted extension contexts (`setAccessLevel('TRUSTED_CONTEXTS')`). Only the background service worker and the side panel can read them; the content script on x.com can't. Keys aren't synced across devices, and like all extension storage, they're stored unencrypted in your browser profile.
- **Post text goes only to your provider**: when you click **Generate**, the extension sends the post's author handle, its text, any quoted post and image alt text to the provider you selected. There's no analytics or telemetry. OpenAI requests are sent with `store: false`.
- **It never posts**: the extension only replaces the text in the reply box. Nothing reaches X until you click **Reply**.
- **Minimal permissions**: `storage` and `sidePanel`, plus host access to x.com and the four provider APIs. It doesn't request the `tabs` permission.
- **The page can't drive it**: the content script acts only on real (trusted) user clicks. The background checks that each message comes from an x.com tab, validates its shape and caps field lengths. The prompt wraps post text in delimiters and tells the model to treat it as material, not instructions.

## Requirements

To install x-companion, you need:

- A Chromium browser, version 140 or newer: Chrome, Edge, or Opera 135.0.5973.123+
  - **Brave**: Brave's sidebar has no entry for extension panels, so open the panel from the toolbar icon instead
  - **Arc**: not supported, because its side panel API does nothing
- Node.js 22.12+ and pnpm, to build from source
- An API key from one of the supported providers

## Install from source

x-companion isn't in the Chrome Web Store yet, so you build it and load it unpacked. These commands clone the repository and write a production build to `.output/chrome-mv3`:

```sh
git clone https://github.com/mastro993/x-companion.git
cd x-companion
pnpm install
pnpm build
```

Then load the build into your browser:

1. Open the extensions page: `chrome://extensions` (Chrome), `edge://extensions` (Edge) or `brave://extensions` (Brave).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select `.output/chrome-mv3`.
4. Optionally, pin x-companion to the toolbar.

Reload any x.com tab that was open before you installed. The **Generate** button appears only after a page reload, and the same applies after you update, reload or re-enable the extension.

## Set up and generate a reply

Setup takes two tabs in the side panel. Once both are filled in, the button is ready on every reply box:

1. Open x.com and click the x-companion toolbar icon. The side panel opens; it's available only on x.com tabs.
2. On the **Provider** tab, choose a provider and paste your API key. The key is saved when you paste it, press Enter or leave the field. The panel then verifies the key by loading the provider's model list. Each provider starts with a default model, which you can change.
3. On the **Style** tab, describe how you write and paste two or three of your past replies. Examples teach the model your style better than adjectives do. Changes save automatically.
4. When the header shows **Ready**, open a reply: the reply dialog, or the inline reply box on a post's page. Click **Generate**, then review and edit the draft before you post.

Until setup is complete, the button is greyed out, and clicking it opens the side panel. If generation fails, for example from a bad key, a rate limit or a timeout, a short message appears next to the button.

To keep keys for other providers without switching the active one, save them under **Other saved keys**. **Remove** asks you to confirm inline before it deletes a key.

## Known limitations

These gaps are known and not yet fixed:

- **Long posts**: only the visible part of a long post (before **Show more**) is sent. The prompt tells the model the post is truncated.
- **X markup changes**: X can change its page structure at any time, which can stop the button from appearing or from filling the box. If the extension can't verify the filled text, the button shows an error. Check the reply box, because X may have accepted part of the draft.
- **Composers without a button**: in a multi-post reply thread, only the first box gets a button. Inline reply boxes under individual comments get none.
- **Theme switches**: the button copies X's text colour when it's inserted. After you switch X's theme, close and reopen the composer to update it.
- **xAI**: x-companion calls xAI's Chat Completions endpoint, which xAI now labels legacy in favour of its Responses API. The endpoint still works, and xAI hasn't announced a shutdown date.
- **Model lists**: the panel fetches models live when it opens, and when you change the provider or key. OpenAI and xAI models show their raw IDs.

## Contributing

To build, test or change x-companion, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
