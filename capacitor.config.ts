import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.skyautomationtech.inventory',
  appName: 'Sky Automation Tech Inventory',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
