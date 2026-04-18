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
  plugins: {
    SplashScreen: {
      // launchAutoHide: false — we call SplashScreen.hide() manually in App.tsx
      // after config + theme bootstrap so there is no flash of unstyled content.
      // backgroundColor matches --surface-base dark default (modern theme bg).
      // Hex is legal here — this is a native-boundary config value, not a CSS token.
      launchShowDuration: 1500,
      launchAutoHide: false,
      backgroundColor: '#0b0b0d',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
