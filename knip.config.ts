import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    'src/main/main.ts',
    'src/preload/preload.ts',
    'src/preload/preloadSupplementalApis.ts',
    'src/renderer/index.tsx',
    'electron.vite.config.ts',
  ],
  project: ['src/**/*.{ts,tsx}'],
  ignore: [
    'src/renderer/types/**/*',
    'out/**/*',
    'dist/**/*',
  ],
  ignoreDependencies: [
    // electron-vite handles these implicitly
    '@vitejs/plugin-react',
    'autoprefixer',
    'postcss',
    'tailwindcss',
    'electron',
    'electron-builder',
    'vite-plugin-monaco-editor',
    // type-only deps
    '@types/*',
  ],
  ignoreBinaries: [
    'electron-vite',
    'electron-builder',
  ],
};

export default config;
