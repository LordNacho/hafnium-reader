import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { DARK_PAGE_SCRIPT, hostOf, isAdNavigation, PAGE_FILTER_SCRIPT, preparePageHtml } from '../lib/pageFilter';
import { loadSettings, saveSetting } from '../settings';
import { downloadPage } from '../sync';
import { useColors } from '../theme';

type Doc = { key: string; html: string; baseUrl: string } | { key: string; error: string };

/**
 * The original web page, shown in-app with JavaScript off by default so timed pop-ups, cookie walls and most
 * ads never run. With JavaScript off the app downloads the page itself, which also lets it darken pages in a
 * dark theme. JavaScript can be turned on per site (remembered); "Browser" opens the full browser.
 */
export default function PageScreen() {
  const { url } = useLocalSearchParams<{ url: string }>();
  const colors = useColors();
  const host = hostOf(url ?? '');
  const [jsAllowed, setJsAllowed] = useState<boolean | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const docKey = `${url}|${colors.isDark ? 'dark' : 'light'}`;

  useEffect(() => {
    loadSettings().then((s) => setJsAllowed(s.jsSites.includes(host)));
  }, [host]);

  useEffect(() => {
    if (jsAllowed !== false || !url) return;
    let cancelled = false;
    downloadPage(url)
      .then(({ html, url: finalUrl }) => {
        if (!cancelled) setDoc({ key: docKey, html: preparePageHtml(html, finalUrl, colors.isDark), baseUrl: finalUrl });
      })
      .catch((e) => {
        if (!cancelled) setDoc({ key: docKey, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [jsAllowed, url, docKey, colors.isDark]);

  const toggleJs = async () => {
    const s = await loadSettings();
    const next = !jsAllowed;
    const sites = next ? [...new Set([...s.jsSites, host])] : s.jsSites.filter((h) => h !== host);
    await saveSetting('jsSites', sites);
    setJsAllowed(next);
  };

  const openInBrowser = () => url && WebBrowser.openBrowserAsync(url);
  const currentDoc = doc && doc.key === docKey ? doc : null;

  // JavaScript off: the page was loaded from our own copy, so links open the next page the same way.
  const onNavigateNoJs = (req: WebViewNavigation & { isTopFrame?: boolean }) => {
    const target = req.url;
    if (!/^https?:/i.test(target)) return true; // about:blank / data: for the initial load
    if (req.isTopFrame === false) return !isAdNavigation(target); // embedded frames
    if (currentDoc && 'baseUrl' in currentDoc && (target === currentDoc.baseUrl || target.startsWith(`${currentDoc.baseUrl}#`))) return true;
    if (!isAdNavigation(target)) router.push({ pathname: '/page', params: { url: target } });
    return false;
  };

  const header = (
    <Stack.Screen
      options={{
        title: host,
        headerRight: () => (
          <View style={styles.headerButtons}>
            {jsAllowed !== null && (
              <Pressable
                onPress={toggleJs}
                hitSlop={10}
                accessibilityLabel={`JavaScript is ${jsAllowed ? 'on' : 'off'} for ${host}. Tap to turn it ${jsAllowed ? 'off' : 'on'}.`}
              >
                <Text style={[styles.headerButton, { color: colors.accent }]}>JS: {jsAllowed ? 'On' : 'Off'}</Text>
              </Pressable>
            )}
            <Pressable onPress={openInBrowser} hitSlop={10}>
              <Text style={[styles.headerButton, { color: colors.accent }]}>Browser</Text>
            </Pressable>
          </View>
        ),
      }}
    />
  );

  if (jsAllowed === null || !url) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
      </View>
    );
  }

  if (jsAllowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <WebView
          // Remount when JavaScript or the theme changes so the page reloads with the new setting.
          key={`js|${colors.isDark}`}
          source={{ uri: url }}
          javaScriptEnabled
          domStorageEnabled
          injectedJavaScriptBeforeContentLoaded={PAGE_FILTER_SCRIPT + (colors.isDark ? DARK_PAGE_SCRIPT : '')}
          onShouldStartLoadWithRequest={(req) => !isAdNavigation(req.url)}
          setSupportMultipleWindows={false}
          startInLoadingState
          style={{ backgroundColor: colors.background }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {header}
      <View style={[styles.hint, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.hintText, { color: colors.muted }]}>
          JavaScript is off for this site, so pop-ups and most ads can’t run. If the page looks broken, tap JS: Off.
        </Text>
      </View>
      {!currentDoc ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
      ) : 'error' in currentDoc ? (
        <View style={styles.error}>
          <Text style={{ color: colors.text, textAlign: 'center' }}>Couldn’t load this page. {currentDoc.error}</Text>
          <Pressable onPress={openInBrowser} hitSlop={8}>
            <Text style={[styles.headerButton, { color: colors.accent }]}>Open in browser</Text>
          </Pressable>
        </View>
      ) : (
        <WebView
          key={currentDoc.key}
          originWhitelist={['*']}
          source={{ html: currentDoc.html, baseUrl: currentDoc.baseUrl }}
          javaScriptEnabled={false}
          onShouldStartLoadWithRequest={onNavigateNoJs}
          setSupportMultipleWindows={false}
          style={{ backgroundColor: colors.background }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerButtons: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  headerButton: { fontSize: 16, fontWeight: '500' },
  hint: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  hintText: { fontSize: 13 },
  error: { padding: 24, gap: 12, alignItems: 'center' },
});
