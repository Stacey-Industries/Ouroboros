import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.stacey.ouroboros',
  appName: 'Ouroboros',
  webDir: 'out/web',
  server: {
    androidScheme: 'https',
    ...(serverUrl ? { url: serverUrl, cleartext: serverUrl.startsWith('http://') } : {}),
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
