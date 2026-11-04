import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pl.fado.trailhome',
  appName: 'Fado: Tropem do Domu',
  webDir: 'dist',
  backgroundColor: '#2a1b2e',
  android: {
    allowMixedContent: false,
    backgroundColor: '#2a1b2e',
  },
  plugins: {
    SplashScreen: { launchAutoHide: true },
  },
};

export default config;
