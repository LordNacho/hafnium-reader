import { Link, router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { deleteFeed, listFeeds, markAllRead, type Feed } from '../db';
import { useDataVersion } from '../events';
import { SAMPLE_FEEDS } from '../sampleFeeds';
import { importFeeds, syncAll } from '../sync';
import { relativeTime, useColors, useFontSize } from '../theme';

type Row =
  | { kind: 'smart'; key: string; title: string; count: number; params: Record<string, string> }
  | { kind: 'feed'; key: string; feed: Feed };

export default function FeedsScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const version = useDataVersion();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingSamples, setLoadingSamples] = useState(false);

  useEffect(() => {
    listFeeds().then(setFeeds);
  }, [version]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await syncAll();
      if (r.errors) Alert.alert('Refresh finished', `${r.newArticles} new articles. ${r.errors} feed(s) failed — see the feed list for details.`);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const sections = useMemo(() => {
    const totalUnread = feeds.reduce((n, f) => n + f.unread, 0);
    const smart: Row[] = [
      { kind: 'smart', key: 'all', title: 'All articles', count: totalUnread, params: { title: 'All articles' } },
      { kind: 'smart', key: 'starred', title: 'Starred', count: 0, params: { starred: '1', title: 'Starred' } },
    ];
    const byFolder = new Map<string, Feed[]>();
    for (const f of feeds) {
      const k = f.folder ?? '';
      byFolder.set(k, [...(byFolder.get(k) ?? []), f]);
    }
    return [
      { title: '', folder: null as string | null, data: smart },
      ...[...byFolder].map(([folder, list]) => ({
        title: folder || 'Feeds',
        folder: folder || null,
        data: list.map((feed): Row => ({ kind: 'feed', key: `f${feed.id}`, feed })),
      })),
    ];
  }, [feeds]);

  const startWithSamples = async () => {
    setLoadingSamples(true);
    try {
      await importFeeds(SAMPLE_FEEDS);
      const r = await syncAll();
      if (r.errors) Alert.alert('Sample feeds added', `${r.newArticles} articles downloaded. ${r.errors} feed(s) couldn’t be reached; they’ll retry on the next refresh.`);
    } catch (e) {
      Alert.alert('Couldn’t add sample feeds', e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSamples(false);
    }
  };

  const feedMenu = (feed: Feed) =>
    Alert.alert(feed.title, feed.last_error ? `Last error: ${feed.last_error}` : feed.url, [
      { text: 'Mark all read', onPress: () => markAllRead({ feedId: feed.id }).then(() => listFeeds().then(setFeeds)) },
      { text: 'Refresh', onPress: () => syncAll(feed.id) },
      {
        text: 'Unsubscribe',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Unsubscribe?', `Remove ${feed.title} and its saved articles?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Unsubscribe', style: 'destructive', onPress: () => deleteFeed(feed.id).then(() => listFeeds().then(setFeeds)) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerButtons}>
              <Link href="/add" asChild>
                <Pressable hitSlop={10}>
                  <Text style={[styles.headerButton, { color: colors.accent }]}>Add</Text>
                </Pressable>
              </Link>
              <Link href="/settings" asChild>
                <Pressable hitSlop={10}>
                  <Text style={[styles.headerButton, { color: colors.accent }]}>Settings</Text>
                </Pressable>
              </Link>
            </View>
          ),
        }}
      />
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.key}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Pressable
              onPress={() => section.folder && router.push({ pathname: '/articles', params: { folder: section.folder, title: section.folder } })}
              style={[styles.sectionHeader, { backgroundColor: colors.surface }]}
            >
              <Text style={[styles.sectionTitle, { color: colors.muted }]}>{section.title.toUpperCase()}</Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.kind === 'smart') {
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/articles', params: item.params })}
                style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.title, styles.smart, { color: colors.text, fontSize: fs(16) }]}>{item.title}</Text>
                {item.count > 0 && <Badge n={item.count} />}
              </Pressable>
            );
          }
          const f = item.feed;
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/articles', params: { feedId: String(f.id), title: f.title } })}
              onLongPress={() => feedMenu(f)}
              style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.text, fontSize: fs(16) }]} numberOfLines={1}>
                  {f.title}
                </Text>
                {f.last_error ? (
                  <Text style={[styles.sub, { color: colors.danger }]} numberOfLines={1}>
                    {f.last_error}
                  </Text>
                ) : f.last_fetched_at ? (
                  <Text style={[styles.sub, { color: colors.muted }]}>Updated {relativeTime(f.last_fetched_at)}</Text>
                ) : (
                  <Text style={[styles.sub, { color: colors.muted }]}>Not fetched yet</Text>
                )}
              </View>
              {f.unread > 0 && <Badge n={f.unread} />}
            </Pressable>
          );
        }}
        ListFooterComponent={
          feeds.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No feeds yet</Text>
              <Text style={[styles.sub, { color: colors.muted, textAlign: 'center' }]}>
                Import an OPML file from The Old Reader in Settings, or tap Add to subscribe to a site.
              </Text>
              <Pressable
                onPress={startWithSamples}
                disabled={loadingSamples}
                style={[styles.sampleButton, { backgroundColor: colors.accent, opacity: loadingSamples ? 0.6 : 1 }]}
              >
                {loadingSamples ? (
                  <ActivityIndicator color={colors.isDark ? colors.background : '#ffffff'} />
                ) : (
                  <Text style={[styles.sampleButtonText, { color: colors.isDark ? colors.background : '#ffffff' }]}>Start with sample feeds</Text>
                )}
              </Pressable>
              <Text style={[styles.sub, { color: colors.muted, textAlign: 'center' }]}>
                Adds {SAMPLE_FEEDS.length} feeds on news, technology, science and comics. Unsubscribe from any of them later.
              </Text>
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

function Badge({ n }: { n: number }) {
  const colors = useColors();
  return (
    <View style={[styles.badge, { backgroundColor: colors.badge }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{n > 999 ? '999+' : n}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerButtons: { flexDirection: 'row', gap: 18 },
  headerButton: { fontSize: 16, fontWeight: '500' },
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 6 },
  sectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 16 },
  smart: { fontWeight: '600', flex: 1 },
  sub: { fontSize: 13, marginTop: 2 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
  badgeText: { fontSize: 13, fontVariant: ['tabular-nums'] },
  empty: { padding: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  sampleButton: { marginTop: 12, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20, minWidth: 240, alignItems: 'center' },
  sampleButtonText: { fontSize: 16, fontWeight: '600' },
});
