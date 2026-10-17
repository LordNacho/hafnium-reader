import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { listFeeds } from '../db';
import { DIRECTORY, DIRECTORY_CATEGORIES, searchDirectory } from '../directory';
import { hostOf } from '../lib/pageFilter';
import { addFeed, findFeeds, type FeedCandidate } from '../sync';
import { useColors } from '../theme';

type Row =
  | { kind: 'feed'; key: string; title: string; url: string; folder: string | null; detail: string }
  | { kind: 'lookup'; key: string; query: string };

export default function AddFeedScreen() {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [subscribed, setSubscribed] = useState<Set<string>>(new Set());
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [found, setFound] = useState<{ query: string; feeds: FeedCandidate[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listFeeds().then((feeds) => setSubscribed(new Set(feeds.map((f) => f.url))));
  }, []);

  const trimmed = query.trim();
  const looksLikeAddress = /[.:/]/.test(trimmed) && !/\s/.test(trimmed);

  const subscribe = async (url: string, folder: string | null) => {
    setBusyUrl(url);
    setError(null);
    try {
      await addFeed(url, folder);
      setSubscribed((s) => new Set(s).add(url));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/already subscribed/i.test(message)) setSubscribed((s) => new Set(s).add(url));
      else setError(message);
    } finally {
      setBusyUrl(null);
    }
  };

  const lookup = async () => {
    if (!looksLikeAddress) return;
    setLookingUp(true);
    setError(null);
    setFound(null);
    try {
      const feeds = await findFeeds(trimmed);
      if (feeds.length === 0) setError(`No feed found at ${trimmed}. Try searching for the site by name.`);
      else if (feeds.length === 1) await subscribe(feeds[0].url, null);
      else setFound({ query: trimmed, feeds });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLookingUp(false);
    }
  };

  const sections = useMemo(() => {
    const feedRow = (f: { title: string; url: string }, folder: string | null, detail: string): Row => ({
      kind: 'feed',
      key: f.url,
      title: f.title,
      url: f.url,
      folder,
      detail,
    });
    const out: { title: string; data: Row[] }[] = [];
    if (found && found.query === trimmed) {
      out.push({ title: `Feeds on ${hostOf(found.feeds[0].url) || found.query}`, data: found.feeds.map((f) => feedRow(f, null, f.url)) });
    }
    if (looksLikeAddress && !(found && found.query === trimmed)) {
      out.push({ title: 'Website', data: [{ kind: 'lookup', key: 'lookup', query: trimmed }] });
    }
    if (trimmed) {
      const results = searchDirectory(trimmed);
      if (results.length) out.push({ title: 'From the directory', data: results.map((f) => feedRow(f, f.category, `${f.category} · ${hostOf(f.url)}`)) });
    } else {
      for (const category of DIRECTORY_CATEGORIES) {
        out.push({
          title: category,
          data: DIRECTORY.filter((f) => f.category === category).map((f) => feedRow(f, f.category, hostOf(f.url))),
        });
      }
    }
    return out;
  }, [trimmed, looksLikeAddress, found]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: 'Add feeds',
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Text style={[styles.headerButton, { color: colors.accent }]}>Done</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setError(null);
          }}
          placeholder="Search by name, or enter a website"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={lookup}
          clearButtonMode="while-editing"
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionHeader, { color: colors.muted, backgroundColor: colors.surface }]}>{section.title.toUpperCase()}</Text>
        )}
        renderItem={({ item }) => {
          if (item.kind === 'lookup') {
            return (
              <Pressable onPress={lookup} disabled={lookingUp} style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                <View style={styles.rowText}>
                  <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                    Find feeds at {item.query}
                  </Text>
                  <Text style={[styles.detail, { color: colors.muted }]}>Looks on the site for its RSS or Atom feeds</Text>
                </View>
                {lookingUp ? <ActivityIndicator color={colors.accent} /> : <Text style={[styles.action, { color: colors.accent }]}>Find</Text>}
              </Pressable>
            );
          }
          const added = subscribed.has(item.url);
          return (
            <Pressable
              onPress={() => !added && busyUrl === null && subscribe(item.url, item.folder)}
              style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed && !added ? 0.6 : 1 }]}
              accessibilityLabel={added ? `${item.title}, subscribed` : `Subscribe to ${item.title}`}
            >
              <View style={styles.rowText}>
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.detail, { color: colors.muted }]} numberOfLines={1}>
                  {item.detail}
                </Text>
              </View>
              {busyUrl === item.url ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={[styles.action, { color: added ? colors.muted : colors.accent }]}>{added ? 'Added ✓' : 'Add'}</Text>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.muted }]}>
            Nothing in the directory matches “{trimmed}”. Enter the site’s address instead, for example theguardian.com.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerButton: { fontSize: 16, fontWeight: '500' },
  searchWrap: { padding: 12, gap: 8 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  error: { fontSize: 14 },
  sectionHeader: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, paddingHorizontal: 16, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, minWidth: 0 },
  title: { fontSize: 16 },
  detail: { fontSize: 13, marginTop: 2 },
  action: { fontSize: 15, fontWeight: '600' },
  empty: { padding: 24, textAlign: 'center', lineHeight: 20 },
});
