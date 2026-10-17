import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { PixelRatio, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { LINE_HEIGHTS, useAppearance, type Appearance } from '../../appearance';
import { getArticle, setRead, setStarred, type Article } from '../../db';
import { notifyDataChanged } from '../../events';
import { escapeHtml, stripMedia, upgradeInsecureMedia } from '../../lib/html';
import { useColors, type Colors } from '../../theme';

export default function ArticleScreen() {
  const { id, ids } = useLocalSearchParams<{ id: string; ids?: string }>();
  const colors = useColors();
  const appearance = useAppearance();
  const [article, setArticle] = useState<Article | null>(null);

  useEffect(() => {
    let cancelled = false;
    getArticle(Number(id)).then(async (a) => {
      if (cancelled || !a) return;
      setArticle(a);
      if (!a.is_read) {
        await setRead(a.id, true);
        notifyDataChanged();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const siblings = useMemo(() => (ids ? ids.split(',') : []), [ids]);
  const index = siblings.indexOf(String(id));
  const go = (delta: number) => {
    const next = siblings[index + delta];
    if (next) router.replace({ pathname: '/article/[id]', params: { id: next, ids } });
  };

  const html = useMemo(() => (article ? renderArticle(article, colors, appearance) : ''), [article, colors, appearance]);

  if (!article) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  const toggleStar = async () => {
    await setStarred(article.id, !article.is_starred);
    setArticle({ ...article, is_starred: article.is_starred ? 0 : 1 });
    notifyDataChanged();
  };

  // Any navigation away from the rendered article opens in the system browser instead.
  const onNavigate = (req: WebViewNavigation) => {
    if (/^https?:/i.test(req.url)) {
      WebBrowser.openBrowserAsync(req.url);
      return false;
    }
    return true;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={styles.headerButtons}>
              <Pressable onPress={toggleStar} hitSlop={10}>
                <Text style={[styles.headerButton, { color: colors.accent }]}>{article.is_starred ? '★' : '☆'}</Text>
              </Pressable>
              {article.url && (
                <Pressable onPress={() => Share.share({ message: article.url!, url: article.url! })} hitSlop={10}>
                  <Text style={[styles.headerButton, { color: colors.accent }]}>Share</Text>
                </Pressable>
              )}
            </View>
          ),
        }}
      />
      <WebView
        originWhitelist={['about:*', 'data:*']}
        source={{ html }}
        onShouldStartLoadWithRequest={onNavigate}
        style={{ backgroundColor: colors.background }}
        setSupportMultipleWindows={false}
      />
      <View style={[styles.toolbar, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <ToolbarButton label="‹ Prev" disabled={index <= 0} onPress={() => go(-1)} />
        <ToolbarButton
          label={article.is_read ? 'Mark unread' : 'Mark read'}
          onPress={async () => {
            await setRead(article.id, !article.is_read);
            setArticle({ ...article, is_read: article.is_read ? 0 : 1 });
            notifyDataChanged();
          }}
        />
        <ToolbarButton label="Open site" disabled={!article.url} onPress={() => article.url && WebBrowser.openBrowserAsync(article.url)} />
        <ToolbarButton label="Next ›" disabled={index < 0 || index >= siblings.length - 1} onPress={() => go(1)} />
      </View>
    </View>
  );
}

function ToolbarButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={styles.toolbarButton}>
      <Text style={{ color: disabled ? colors.border : colors.accent, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

const SANS_STACK = "-apple-system, system-ui, Roboto, 'Helvetica Neue', sans-serif";
const SERIF_STACK = "Georgia, 'Iowan Old Style', 'Noto Serif', 'Times New Roman', serif";

function renderArticle(a: Article, c: Colors, ap: Appearance): string {
  // The WebView doesn't follow the phone's text-size setting on its own, so apply it here too.
  const fontSize = (18 * ap.textScale * PixelRatio.getFontScale()).toFixed(1);
  const family = ap.readerFont === 'serif' ? SERIF_STACK : SANS_STACK;
  const date = new Date(a.sort_at).toLocaleString();
  const byline = [a.feed_title, a.author, date].filter(Boolean).map((s) => escapeHtml(String(s))).join(' · ');
  const content = ap.showImages ? upgradeInsecureMedia(a.content) : stripMedia(a.content);
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="${c.isDark ? 'dark' : 'light'}">
<style>
  html { -webkit-text-size-adjust: 100%; }
  body { padding: 20px 18px 48px; background: ${c.background}; color: ${c.text};
         font-family: ${family}; font-size: ${fontSize}px; line-height: ${LINE_HEIGHTS[ap.lineSpacing]};
         word-wrap: break-word; max-width: 42em; margin: 0 auto; }
  h1.title { font-size: 1.45em; line-height: 1.25; margin: 0 0 6px; }
  .byline { color: ${c.muted}; font-family: ${SANS_STACK}; font-size: 0.75em; margin-bottom: 24px; }
  a { color: ${c.accent}; }
  img, video, iframe, figure, table { max-width: 100% !important; height: auto; }
  ${c.isDark ? 'img { opacity: 0.9; }' : ''}
  figure { margin: 1em 0; }
  figcaption { color: ${c.muted}; font-size: 0.8em; }
  pre, code { font-size: 0.85em; background: ${c.surface}; border-radius: 4px; }
  pre { padding: 12px; overflow-x: auto; }
  blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid ${c.border}; color: ${c.muted}; }
  hr { border: 0; border-top: 1px solid ${c.border}; }
</style></head><body>
<h1 class="title">${escapeHtml(a.title)}</h1>
<div class="byline">${byline}</div>
<div class="content">${content || `<p style="color:${c.muted}">This feed only provides a headline. Tap “Open site” to read the full article.</p>`}</div>
</body></html>`;
}

const styles = StyleSheet.create({
  headerButtons: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  headerButton: { fontSize: 18, fontWeight: '500' },
  toolbar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth },
  toolbarButton: { paddingHorizontal: 6 },
});
