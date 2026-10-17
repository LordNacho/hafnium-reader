import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { listFeeds } from '../db';
import { DIRECTORY, DIRECTORY_CATEGORIES, searchDirectory } from '../directory';
import { hostOf } from '../lib/pageFilter';
import { guessDomain, searchSitesOnline, type SiteResult } from '../onlineSearch';
import { addFeed, findFeeds, type FeedCandidate } from '../sync';
import { useColors } from '../theme';

type Row =
  | { kind: 'feed'; key: string; title: string; url: string; folder: string | null; detail: string }
  | { kind: 'site'; key: string; title: string; detail: string; address: string }
  | { kind: 'webSearch'; key: string; query: string };

export default function AddFeedScreen() {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [subscribed, setSubscribed] = useState<Set<string>>(new Set());
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  /** Address currently being checked for feeds. */
  const [lookingUp, setLookingUp] = useState<string | null>(null);
  const [found, setFound] = useState<{ query: string; site: string; feeds: FeedCandidate[] } | null>(null);
  const [online, setOnline] = useState<{ query: string; sites: SiteResult[] } | null>(null);
  const [searchingOnline, setSearchingOnline] = useState(false);
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

  /** Look for feeds at a website; subscribe straight away if there is one, otherwise let the user choose. */
  const lookUpSite = async (address: string) => {
    setLookingUp(address);
    setError(null);
    try {
      const feeds = await findFeeds(address);
      if (feeds.length === 0) setError(`No feed found at ${hostOf(address) || address}.`);
      else if (feeds.length === 1) await subscribe(feeds[0].url, null);
      else setFound({ query: trimmed, site: hostOf(feeds[0].url) || address, feeds });
    } catch (e) {
      setError(`Couldn’t check ${hostOf(address) || address}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLookingUp(null);
    }
  };

  const searchWeb = async () => {
    setSearchingOnline(true);
    setError(null);
    try {
      setOnline({ query: trimmed, sites: await searchSitesOnline(trimmed) });
    } catch (e) {
      setError(`Online search didn’t work: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSearchingOnline(false);
    }
  };

  const sections = useMemo(() => {
    const feedRow = (f: { title: string; url: string }, folder: string | null, detail: string): Row => ({
      kind: 'feed',
      key: `feed:${f.url}`,
      title: f.title,
      url: f.url,
      folder,
      detail,
    });
    const siteRow = (title: string, detail: string, address: string): Row => ({ kind: 'site', key: `site:${address}`, title, detail, address });
    const out: { title: string; note?: string; data: Row[] }[] = [];

    if (found && found.query === trimmed) {
      out.push({ title: `Feeds on ${found.site}`, data: found.feeds.map((f) => feedRow(f, null, f.url)) });
    }
    if (looksLikeAddress) {
      out.push({ title: 'Website', data: [siteRow(`Find feeds at ${trimmed}`, 'Looks on the site for its RSS or Atom feeds', trimmed)] });
    }
    if (trimmed) {
      const results = searchDirectory(trimmed);
      if (results.length) out.push({ title: 'From the directory', data: results.map((f) => feedRow(f, f.category, `${f.category} · ${hostOf(f.url)}`)) });
      if (!looksLikeAddress && trimmed.length >= 2) {
        if (online && online.query === trimmed) {
          const rows = online.sites.map((s) => siteRow(s.title, [s.description, hostOf(s.url)].filter(Boolean).join(' · '), s.url));
          const guess = guessDomain(trimmed);
          if (guess && !online.sites.some((s) => hostOf(s.url) === guess)) {
            rows.push(siteRow(`Try ${guess}`, 'A guess based on the name', guess));
          }
          out.push({ title: 'On the web', note: rows.length ? undefined : 'Nothing found. Try the site’s address instead.', data: rows });
        } else {
          out.push({
            title: 'On the web',
            note: 'Searching sends your search words to Wikidata, Wikipedia’s open database, to find matching websites.',
            data: [{ kind: 'webSearch', key: 'webSearch', query: trimmed }],
          });
        }
      }
    } else {
      for (const category of DIRECTORY_CATEGORIES) {
        out.push({
          title: category,
          data: DIRECTORY.filter((f) => f.category === category).map((f) => feedRow(f, f.category, hostOf(f.url))),
        });
      }
    }
    return out;
  }, [trimmed, looksLikeAddress, found, online]);

  const actionText = (label: string, busy: boolean) =>
    busy ? <ActivityIndicator color={colors.accent} /> : <Text style={[styles.action, { color: colors.accent }]}>{label}</Text>;

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
          onSubmitEditing={() => (looksLikeAddress ? lookUpSite(trimmed) : trimmed.length >= 2 && searchWeb())}
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
          <View style={{ backgroundColor: colors.surface }}>
            <Text style={[styles.sectionHeader, { color: colors.muted }]}>{section.title.toUpperCase()}</Text>
            {section.note && <Text style={[styles.sectionNote, { color: colors.muted }]}>{section.note}</Text>}
          </View>
        )}
        renderItem={({ item }) => {
          if (item.kind === 'webSearch') {
            return (
              <Pressable onPress={searchWeb} disabled={searchingOnline} style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                <View style={styles.rowText}>
                  <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                    Search the web for “{item.query}”
                  </Text>
                </View>
                {actionText('Search', searchingOnline)}
              </Pressable>
            );
          }
          if (item.kind === 'site') {
            return (
              <Pressable
                onPress={() => lookUpSite(item.address)}
                disabled={lookingUp !== null}
                style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[styles.detail, { color: colors.muted }]} numberOfLines={2}>
                    {item.detail}
                  </Text>
                </View>
                {actionText('Find feeds', lookingUp === item.address)}
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerButton: { fontSize: 16, fontWeight: '500' },
  searchWrap: { padding: 12, gap: 8 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  error: { fontSize: 14 },
  sectionHeader: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
  sectionNote: { fontSize: 12, lineHeight: 16, paddingHorizontal: 16, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, minWidth: 0 },
  title: { fontSize: 16 },
  detail: { fontSize: 13, marginTop: 2 },
  action: { fontSize: 15, fontWeight: '600' },
});
