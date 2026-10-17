// Extends app.json with native build settings from expo-build-properties.
//
// Every Android release build: keep the no-arg constructors WorkManager creates by reflection.
// expo-background-task uses WorkManager; SDK 58 (AGP 9) runs R8 in full mode, which strips them and the app
// crashes at launch. Workaround from https://github.com/expo/expo/issues/51337 until expo-background-task ships the rules.
//
// SLIM_ANDROID_DEV=1 (set by the "development" and "preview" profiles in eas.json) additionally builds a smaller
// APK for sideloading: 64-bit ARM only, with native libraries compressed. Store builds keep all ABIs.
const WORKMANAGER_KEEP_RULES = [
  '-keep class * extends androidx.room.RoomDatabase { <init>(); }',
  '-keep class * extends androidx.work.InputMerger { <init>(); }',
].join('\n');

module.exports = ({ config }) => {
  const android = { extraProguardRules: WORKMANAGER_KEEP_RULES };
  if (process.env.SLIM_ANDROID_DEV === '1') {
    android.buildArchs = ['arm64-v8a'];
    android.useLegacyPackaging = true;
  }
  config.plugins = [...(config.plugins ?? []), ['expo-build-properties', { android }]];
  return config;
};
