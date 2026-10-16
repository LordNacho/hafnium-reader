import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { listArticles, markAllRead, type ArticleFilter, type ArticleSummary } from '../db';
import { useDataVersion } from '../events';
import { loadSettings, saveSetting } from '../settings';
import { syncAll } from '../sync';
import { relativeTime, useColors, useFontSize } from '../theme';

export default function ArticlesScreen() {
  const params = useLocalSearchParams<{ feedId?: string; folder?: string; starred?: string; title?: string }>();
  const colors = useColors();
  const fs = useFontSize();
  const version = useDataVersion();
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [unreadOnly, setUnreadOnly] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const starred = params.starred === '1';
  const filter = useMemo<ArticleFilter>(
    () => ({
      feedId: params.feedId ? Number(params.feedId) : undefined,
      folder: params.folder,
      starred,
      unreadOnly: !starred && !!unreadOnly,
    }),
    [params.feedId, params.folder, starred, unreadOnly],
  );

  useEffect(() => {
    loadSettings().then((s) => setUnreadOnly(s.unreadOnly));
  }, []);

  useEffect(() => {
    if (unreadOnly === null) return;
    listArticles(filter).then(setArticles);
  }, [filter, version, unreadOnly]);

  const toggleUnread = () => {
    const next = !unreadOnly;
    setUnreadOnly(next);
    saveSetting('unreadOnly', next);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncAll(filter.feedId);
    } finally {
      setRefreshing(false);
    }
  }, [filter.feedId]);

  const ids = articles.map((a) => a.id).join(',');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: params.title ?? 'Articles',
          headerRight: () =>
            starred ? null : (
              <View style={styles.headerButtons}>
                <Pressable onPress={toggleUnread} hitSlop={10}>
                  <Text style={[styles.headerButton, { color: colors.accent }]}>{unreadOnly ? 'Unread' : 'All'}</Text>
                </Pressable>
                <Pressable onPress={() => markAllRead(filter).then(() => listArticles(filter).then(setArticles))} hitSlop={10}>
                  <Text style={[styles.headerButton, { color: colors.accent }]}>Mark read</Text>
                </Pressable>
              </View>
            ),
        }}
      />
      <FlatList
        data={articles}
        keyExtractor={(a) => String(a.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/article/[id]', params: { id: String(item.id), ids } })}
            style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
          >
            <View style={styles.meta}>
              <Text style={[styles.metaText, { color: colors.muted, fontSize: fs(12) }]} numberOfLines={1}>
                {item.is_starred ? '★ ' : ''}
                {filter.feedId ? '' : item.feed_title + ' · '}
                {relativeTime(item.sort_at)}
              </Text>
            </View>
            <Text
              style={[
                styles.title,
                { color: item.is_read ? colors.muted : colors.text, fontWeight: item.is_read ? '400' : '600', fontSize: fs(16), lineHeight: fs(21) },
              ]}
              numberOfLines={3}
            >
              {item.title}
            </Text>
            {!!item.preview && (
              <Text style={[styles.preview, { color: colors.muted, fontSize: fs(14), lineHeight: fs(19) }]} numberOfLines={2}>
                {item.preview}
              </Text>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: colors.muted }}>{starred ? 'Nothing starred yet.' : unreadOnly ? 'All caught up.' : 'No articles saved.'}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerButtons: { flexDirection: 'row', gap: 18 },
  headerButton: { fontSize: 16, fontWeight: '500' },
  row: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  meta: { flexDirection: 'row' },
  metaText: { fontSize: 12 },
  title: { fontSize: 16, lineHeight: 21 },
  preview: { fontSize: 14, lineHeight: 19 },
  empty: { padding: 40, alignItems: 'center' },
});
