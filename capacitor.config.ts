import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stacey.ouroboros',
  appName: 'Ouroboros',
  webDir: 'out/web',
  server: {
    // Phase B will extend this for dev-server mode via env var.
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
