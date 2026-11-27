import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.noematch.minatosenki',
  appName: '港区女子戦記',
  webDir: 'www',
  server: {
    // 本番は www/ に同梱したオフライン動作が原則。オンライン必須にしない。
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#15161f',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#15161f',
      showSpinner: false,
    },
  },
};

export default config;
