import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { hostOf, isAdNavigation, PAGE_FILTER_SCRIPT } from '../lib/pageFilter';
import { loadSettings, saveSetting } from '../settings';
import { useColors } from '../theme';

/**
 * The original web page, shown in-app with JavaScript off by default so timed pop-ups, cookie walls and most
 * ads never run. JavaScript can be turned on per site (remembered); "Browser" opens the full browser.
 */
export default function PageScreen() {
  const { url } = useLocalSearchParams<{ url: string }>();
  const colors = useColors();
  const host = hostOf(url ?? '');
  const [jsAllowed, setJsAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    loadSettings().then((s) => setJsAllowed(s.jsSites.includes(host)));
  }, [host]);

  const toggleJs = async () => {
    const s = await loadSettings();
    const next = !jsAllowed;
    const sites = next ? [...new Set([...s.jsSites, host])] : s.jsSites.filter((h) => h !== host);
    await saveSetting('jsSites', sites);
    setJsAllowed(next);
  };

  const onNavigate = (req: WebViewNavigation) => !isAdNavigation(req.url);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: host,
          headerRight: () => (
            <View style={styles.headerButtons}>
              {jsAllowed !== null && (
                <Pressable onPress={toggleJs} hitSlop={10} accessibilityLabel={`JavaScript is ${jsAllowed ? 'on' : 'off'} for ${host}. Tap to turn it ${jsAllowed ? 'off' : 'on'}.`}>
                  <Text style={[styles.headerButton, { color: colors.accent }]}>JS: {jsAllowed ? 'On' : 'Off'}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => url && WebBrowser.openBrowserAsync(url)} hitSlop={10}>
                <Text style={[styles.headerButton, { color: colors.accent }]}>Browser</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      {jsAllowed === null || !url ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
      ) : (
        <>
          {!jsAllowed && (
            <View style={[styles.hint, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.hintText, { color: colors.muted }]}>
                JavaScript is off for this site, so pop-ups and most ads can’t run. If the page looks broken, tap JS: Off.
              </Text>
            </View>
          )}
          <WebView
            // Remount when JavaScript is toggled so the page reloads with the new setting.
            key={jsAllowed ? 'js' : 'nojs'}
            source={{ uri: url }}
            javaScriptEnabled={jsAllowed}
            domStorageEnabled={jsAllowed}
            injectedJavaScriptBeforeContentLoaded={jsAllowed ? PAGE_FILTER_SCRIPT : undefined}
            onShouldStartLoadWithRequest={onNavigate}
            setSupportMultipleWindows={false}
            startInLoadingState
            style={{ backgroundColor: colors.background }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerButtons: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  headerButton: { fontSize: 16, fontWeight: '500' },
  hint: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  hintText: { fontSize: 13 },
});
