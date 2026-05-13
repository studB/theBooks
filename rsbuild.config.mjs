import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      index: './src/main.jsx',
    },
  },
  html: {
    template: './src/index.html',
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  output: {
    distPath: {
      root: 'dist',
    },
  },
});
