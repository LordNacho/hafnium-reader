// Extends app.json. SLIM_ANDROID_DEV=1 (set by the "development" profile in eas.json) builds a smaller
// Android APK for sideloading: 64-bit ARM only, with native libraries compressed. Store builds keep all ABIs.
module.exports = ({ config }) => {
  if (process.env.SLIM_ANDROID_DEV === '1') {
    config.plugins = [
      ...(config.plugins ?? []),
      ['expo-build-properties', { android: { buildArchs: ['arm64-v8a'], useLegacyPackaging: true } }],
    ];
  }
  return config;
};
