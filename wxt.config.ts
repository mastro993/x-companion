import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

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
    ],
  },
  hooks: {
    // Tab-specific panels only: a manifest default_path registers a GLOBAL panel that
    // stays visible on every tab, even after setOptions({ tabId, enabled: false }).
    'build:manifestGenerated': (_, manifest) => {
      delete manifest.side_panel;
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
