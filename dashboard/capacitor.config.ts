import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.practice.tracker.kiosk',
  appName: 'Practice Tracker Kiosk',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
  },
}

export default config
