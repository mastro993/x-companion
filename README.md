# x-companion

> [!WARNING]
> x-companion is in early development. Expect rough edges and bugs, and review every draft before you post it. Please [report problems](https://github.com/mastro993/x-companion/issues) you run into.

x-companion is a Chromium extension that drafts replies and refines posts on X (x.com) in your own writing style. It adds three controls to X's reply composer:

- **Generate**, on an empty reply box: drafts a reply to the post.
- **Refine**, an icon left of **Rewrite** once the box has text: deletes the box's text, then generates a fresh reply from scratch, as **Generate** does on an empty box. If generation fails, your text comes back.
- **Rewrite**, once the box has text: a menu that reworks your draft. **Polish** fixes typos, grammar and awkward phrasing with the smallest edits. **Punchier** makes it clearer and catchier. **Match style** brings it closer to your style guide.

In the new-post composer (the home "What's happening?" box and the **Post** dialog), it adds one control:

- **Refine**: turns your draft into the post you'd publish, with a prompt made for posts: a stronger first line, less filler, in your voice and with your facts. It never writes a post from nothing, so it stays off until the box has a draft.

For a reply, the extension sends the post, the conversation around it, any post it quotes and their images, along with your draft, your style guide and your projects, to the AI provider you chose. It then writes the result into the reply box. For a new post, it sends only your draft, your style guide and your projects. You edit the result and post it yourself.

What the model sees depends on where you reply:

- **On a post's page**: the post, its quoted post and their images, plus the conversation. That's the posts X shows above it, and its author's own posts right below it, such as the rest of a thread, up to 10 on each side.
- **In the reply dialog from a timeline**: the post, its quoted post and their images. A timeline shows posts out of their conversation, so none is sent.

You bring your own API key from one of these providers:

- OpenAI
- Anthropic
- xAI (Grok)
- DeepSeek
- OpenRouter

## Privacy and security

x-companion has no backend. It talks only to x.com and the provider you pick:

- **Your keys stay in your browser**: API keys live in `chrome.storage.local`, apart from your other settings, and storage is restricted to trusted extension contexts (`setAccessLevel('TRUSTED_CONTEXTS')`). Only the background service worker and the side panel can read them; the content script on x.com can't. A saved key shows only masked in the panel, and keys aren't synced across devices.
- **Saved keys aren't encrypted**: like all extension storage, they sit unencrypted in your browser profile, where backups and malware that copies files can reach them, and anyone using your unlocked computer can read them. The **Provider** tab reminds you of this. So give each key a spending limit, as described in [Limit what a key can spend](#limit-what-a-key-can-spend). **Remove** doesn't erase copies already on disk right away, so if you think a key leaked, revoke it with your provider. Full-disk encryption, such as FileVault or BitLocker, protects a lost or stolen laptop.
- **Post content goes only to your provider**: when you run an action, the extension sends the provider you selected the author handle and text of the post, of any post it quotes and of the conversation around it. It also sends the links to their photos and video thumbnails, with their alt text, and your own @handle, so the model knows which posts are yours. Your style guide, your projects and, for a rewrite, the text in the reply box go along too. The provider downloads the pictures from X's image server (`pbs.twimg.com`) itself, so the extension needs no extra permission for them. There's no analytics or telemetry. OpenAI requests are sent with `store: false`.
- **It never posts**: the extension only replaces the text in the reply box. Nothing reaches X until you click **Reply**.
- **Minimal permissions**: `storage` and `sidePanel`, plus host access to x.com, the five provider APIs and TypeSafe's API, which nothing uses yet. It doesn't request the `tabs` permission.
- **The page can't drive it**: the content script acts only on real (trusted) user clicks. The background checks that each message comes from an x.com tab, validates its shape and caps field lengths. It accepts image links only to X's image server, so the page can't make your provider fetch other addresses. The prompt wraps post text and your draft in delimiters and tells the model to treat them as material, not instructions.
- **Errors give nothing away**: before an error message reaches x.com, the background removes your key and anything shaped like a key or an account ID, and shortens the message.

### Limit what a key can spend

Storage can't stop every threat, for example a compromised release or another extension clicking the controls for you. Give x-companion its own key with a spending cap, so a leaked key can't cost much. Where your provider offers it, also set an expiry date, and save only the keys you use:

- **OpenAI**: create a project with a hard monthly spend limit. In it, create a key with **Restricted** permissions that can only list models and make model requests.
- **Anthropic**: create a workspace other than the default one, which can't have a spend limit, and set its monthly spend limit. Then create a key for that workspace only: x-companion can't use a key that covers several workspaces.
- **xAI**: use a team with prepaid credits and a postpaid limit of $0, so the API stops when the credits run out. Restrict the key to the models you use, then check that the panel still shows **Key verified**.
- **DeepSeek**: the account is prepaid and the API stops when the balance runs out, so keep the balance small.
- **OpenRouter**: give the key a credit limit with a monthly reset.

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
2. On the **Provider** tab, choose a provider and paste your API key. A pasted key that starts like the provider's keys (for example `sk-ant-` for Anthropic) is saved right away. Anything else, such as a password or an Anthropic key in the OpenAI field, waits with a warning until you click **Save** or press Enter. OpenAI and DeepSeek keys both start with `sk-`, so the panel can't tell them apart. The panel then verifies the key by loading the provider's model list. Each provider starts with a default model, which you can change. Once saved, the key shows only masked: to change it, click **Replace**.
3. Optionally, fill in the style guide on the **Style** tab. It has four sections, and each one holds up to 1000 characters:
   - **Persona**: who you are and your main interests.
   - **Audience**: the people you're speaking to and what resonates with them.
   - **Style & Vocabulary**: your tone, structure and signature phrases. Paste two or three of your past replies here: examples teach the model your style better than adjectives do.
   - **Rules**: dos and don'ts the AI must always respect, such as "no hashtags" or "always reply in English".

   Only the sections you fill in are sent with each request. Changes save automatically.
4. Optionally, add what you build on the **Projects** tab, up to 10 projects. Each one has a name, a description of up to 300 characters and a link. A fresh reply mentions a project only when it fits the post, and only with the facts you wrote. Projects without a name aren't sent. **Remove** asks you to confirm inline.
5. When the header shows **Ready**, open a reply: the reply dialog, or the inline reply box on a post's page. On an empty box, click **Generate**. Once the box has text, whether a draft or your own, click **Rewrite** and pick **Polish**, **Punchier** or **Match style**, or click the **Refine** icon to delete it and generate a fresh reply. To polish a post of your own, write a draft in the home box or the **Post** dialog and click **Refine**. Review and edit the result before you post.

Until a provider and key are set, the controls are greyed out, and clicking them opens the side panel. If an action fails, for example from a bad key, a rate limit or a timeout, a short message appears next to the controls. If you edit the reply box while an action runs, the result is dropped so it can't overwrite your edit.

To keep keys for other providers without switching the active one, save them under **Other saved keys**. **Remove** asks you to confirm inline before it deletes a key.

## Known limitations

These gaps are known and not yet fixed:

- **Long posts**: only the visible part of a long post (before **Show more**) is sent. That holds for the posts around it and quoted posts too. The prompt tells the model which posts are truncated.
- **Conversations**: the conversation is sent only from a post's page, and only the part X has loaded, up to the 10 nearest posts above the post and 10 below it. X can leave out older posts above a reply, and drops posts far off screen. For a later part of the main author's own thread, its earlier parts are sent. For any other reply below the main post, the posts down to the main post are sent, but not the other replies in between. To give the model a whole conversation, open the post you reply to on its own page.
- **Reply dialog without its post**: the dialog's copy of a post has no images or quoted post. The extension takes them from the matching post on the page, or from the post whose **Reply** button you clicked or that X's `r` shortcut replied to. When it has neither, for example after a page reload, only the copy's text is sent.
- **Link previews and polls**: a link's preview card and a poll's options aren't sent, only the post's own text.
- **Images**: each request sends up to 8 pictures, about 1200 px each: the post's first, then its quoted post's, then the nearest in the conversation. The others are described only by their alt text. For a video or GIF, the model sees only its thumbnail. When the model can't read images, or the provider can't download one, the extension retries once without pictures, and the model goes by the alt text.
- **X markup changes**: X can change its page structure at any time, which can stop the controls from appearing or from filling the box. If the extension can't verify the filled text, the controls show an error. Check the reply box, because X may have accepted part of the draft.
- **Composers without controls**: in a multi-post reply thread or new thread, only the first box gets controls, and post **Refine** works on that box only. Inline reply boxes under individual comments and quotes get none.
- **New post media**: post **Refine** sends only your text, not the photos or videos you attached.
- **Theme switches**: the controls copy X's text colour when they're inserted. After you switch X's theme, close and reopen the composer to update it.
- **xAI**: x-companion calls xAI's Chat Completions endpoint, which xAI now labels legacy in favour of its Responses API. The endpoint still works, and xAI hasn't announced a shutdown date.
- **Model lists**: the panel fetches models live when it opens, and when you change the provider or key. OpenAI and xAI models show their raw IDs.

## Contributing

To build, test or change x-companion, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
