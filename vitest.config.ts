import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// Default environment is node; DOM tests opt in with `// @vitest-environment happy-dom`.
export default defineConfig({ plugins: [WxtVitest()] });
