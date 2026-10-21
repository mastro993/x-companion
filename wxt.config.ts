import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// Public half of a throwaway key; the private half was discarded. Unpacked builds derive their ID
// from their path, so this pins the dev build's to mogjdmpkbfcfdgedklmkjoploiamddcf. Storage (API
// keys, style guide) then carries over between checkouts that share a browser profile.
const DEV_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs8PjsusxDMaps3b67cJqeh/vvTm4ktbqtqfZsqHEryupi2tGZ67DVZHup7Celnx3/3bNSxIOVNdfN1RsvYSGCE1e7lEzKUXYwr/U4QWybgvGnYM+4867HELwiW87bFkkjGZemHuJVQOIijy07bBIuLU0nHtSWHNRBXacouxXVil35DBNWYPA1+SPlbSzdutLxx0TAmpc88RKVk8VThTeiEL+XkxjZ8oqSbrliaAwJs88hHcTbs0AmndDP+eePoYPaJYIKhvTHI2o6ZkmCu3eBRvC3JImNGZ19TQxr+T4pqMKFc6OK/C8wZ1Hg6ssd17dDGB9YGohex3GFajqgG/m9wIDAQAB';

export default defineConfig({
  srcDir: 'src',
  imports: false,
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    // storage.local.setAccessLevel for all areas.
    minimum_chrome_version: '140',
    // Required for sidePanel.setPanelBehavior({ openPanelOnActionClick }).
    action: { default_title: 'x-companion' },
    permissions: ['storage', 'sidePanel'],
    host_permissions: [
      // Also makes tab.url visible on x.com tabs, so no `tabs` permission.
      'https://x.com/*',
      'https://api.openai.com/*',
      'https://api.anthropic.com/*',
      'https://api.x.ai/*',
      'https://openrouter.ai/*',
      // Jev with a TypeSafe key (src/lib/jev.ts). TypeSafe's CORS rejects extension origins.
      'https://api.typesafe.ai/*',
    ],
  },
  hooks: {
    // Tab-specific panels only: a manifest default_path registers a GLOBAL panel that
    // stays visible on every tab, even after setOptions({ tabId, enabled: false }).
    'build:manifestGenerated': (wxt, manifest) => {
      delete manifest.side_panel;
      // Dev only: the Chrome Web Store rejects uploads whose manifest has a key.
      if (wxt.config.command === 'serve') manifest.key = DEV_KEY;
    },
    // web-ext needs the profile dir (default or a local web-ext.config.ts override) to exist.
    'server:created': (wxt) => {
      const profile = wxt.config.webExt.config?.chromiumProfile;
      if (profile) mkdirSync(profile, { recursive: true });
    },
  },
  // Persistent dev profile keeps the x.com login between `pnpm dev` runs. A scalar (not
  // chromiumArgs, which merge) so a local web-ext.config.ts can point another browser elsewhere.
  webExt: {
    chromiumProfile: resolve('.wxt/chrome-data'),
    keepProfileChanges: true,
    startUrls: ['https://x.com/home'],
  },
});
