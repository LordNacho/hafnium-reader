import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { LINE_HEIGHTS, updateAppearance, useAppearance } from '../appearance';
import { configureBackgroundRefresh } from '../background';
import { deleteReadArticles, storageStats } from '../db';
import { notifyDataChanged, useDataVersion } from '../events';
import { buildOpml, parseOpml } from '../lib/opml';
import { DEFAULT_SETTINGS, loadSettings, saveSetting, type Settings, type ThemeName } from '../settings';
import {
  downloadFullTextBatch,
  exportFeeds,
  fullTextCounts,
  fullTextWaitingForWifi,
  importFeeds,
  prune,
  syncAll,
  type FullTextCounts,
} from '../sync';
import { SERIF_FONT, useColors, useFontSize } from '../theme';

const SITE = 'https://reader.hafnium.ltd';
const CONTACT_EMAIL = 'info@hafnium.ltd';
const THEMES: ThemeName[] = ['system', 'light', 'dark', 'sepia'];
const TEXT_SCALES = [0.85, 1, 1.15, 1.3, 1.5];
const FONTS: Settings['readerFont'][] = ['sans', 'serif'];
const SPACINGS: Settings['lineSpacing'][] = ['compact', 'normal', 'relaxed'];
const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
const FULLTEXT_OPTIONS: Settings['fullText'][] = ['off', 'wifi', 'always'];
const FULLTEXT_LABELS: Record<Settings['fullText'], string> = { off: 'Off', wifi: 'On Wi-Fi', always: 'Always' };
const STORAGE_LIMITS = [50, 100, 250, 500, 1000, 0];
const formatMB = (mb: number) => (mb === 0 ? 'No limit' : mb >= 1000 ? `${mb / 1000} GB` : `${mb} MB`);
const ARTICLE_LIMITS = [25, 50, 100, 200, 500];
const AGE_LIMITS = [7, 14, 30, 90, 365];
const INTERVALS = [15, 30, 60, 180, 360, 720];

export default function SettingsScreen() {
  const colors = useColors();
  const appearance = useAppearance();
  const version = useDataVersion();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof storageStats>> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fullTextBusy, setFullTextBusy] = useState(false);
  const [fullTextResult, setFullTextResult] = useState<string | null>(null);
  const [waitingForWifi, setWaitingForWifi] = useState(false);
  const [counts, setCounts] = useState<FullTextCounts | null>(null);

  useEffect(() => {
    fullTextWaitingForWifi().then(setWaitingForWifi);
    fullTextCounts().then(setCounts);
  }, [settings.fullText, version]);

  const downloadFullTextNow = async () => {
    setFullTextBusy(true);
    setFullTextResult(null);
    try {
      const r = await downloadFullTextBatch({ manual: true });
      const parts: string[] = [];
      if (r.saved > 0) parts.push(`Saved ${r.saved} full article${r.saved === 1 ? '' : 's'}.`);
      if (r.failed > 0) parts.push(`${r.failed} couldn’t be downloaded. ${r.firstError ?? ''}`.trim());
      if (!parts.length) {
        parts.push(
          r.checked > 0
            ? 'Nothing more to download: those articles’ feeds already include the full text, or the sites offered no more.'
            : 'Every article already has its full text, or its feed includes it.',
        );
      }
      setFullTextResult(parts.join(' '));
    } catch (e) {
      setFullTextResult(`Couldn’t download: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setFullTextBusy(false);
    }
  };

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);
  useEffect(() => {
    storageStats().then(setStats);
  }, [version]);

  const update = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
    await saveSetting(key, value);
    if (key === 'backgroundRefresh' || key === 'refreshIntervalMinutes') await configureBackgroundRefresh();
    if (key === 'fullText' && value !== 'off') downloadFullTextBatch().catch(() => {});
    if (key === 'maxArticlesPerFeed' || key === 'maxAgeDays' || key === 'maxStorageMB') {
      await prune();
      notifyDataChanged();
    }
  };

  const importOpml = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (res.canceled) return;
    setBusy('Importing…');
    try {
      const feeds = parseOpml(await new File(res.assets[0].uri).text());
      const added = await importFeeds(feeds);
      setBusy('Downloading articles…');
      const r = await syncAll();
      Alert.alert('Import complete', `${added} new feed(s) of ${feeds.length} in the file. ${r.newArticles} articles downloaded${r.errors ? `, ${r.errors} feed(s) failed` : ''}.`);
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const exportOpml = async () => {
    try {
      const file = new File(Paths.cache, 'subscriptions.opml');
      if (file.exists) file.delete();
      file.create();
      file.write(buildOpml(await exportFeeds()));
      await Sharing.shareAsync(file.uri, { mimeType: 'text/x-opml', dialogTitle: 'Export subscriptions', UTI: 'public.xml' });
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    }
  };

  const section = (title: string) => <Text style={[styles.section, { color: colors.muted }]}>{title.toUpperCase()}</Text>;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      {section('Appearance')}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Choice label="Theme" options={THEMES} value={appearance.theme} onChange={(v) => updateAppearance('theme', v)} format={capitalize} />
        <Choice
          label="Text size"
          options={TEXT_SCALES}
          value={appearance.textScale}
          onChange={(v) => updateAppearance('textScale', v)}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <Choice label="Reading font" options={FONTS} value={appearance.readerFont} onChange={(v) => updateAppearance('readerFont', v)} format={capitalize} />
        <Choice label="Line spacing" options={SPACINGS} value={appearance.lineSpacing} onChange={(v) => updateAppearance('lineSpacing', v)} format={capitalize} />
        <ToggleRow label="Show images in articles" value={appearance.showImages} onChange={(v) => updateAppearance('showImages', v)} />
        <ReaderPreview />
      </View>

      {section('Subscriptions')}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <ActionRow label="Import OPML…" detail="From The Old Reader, Feedly, Inoreader, etc." onPress={importOpml} />
        <ActionRow label="Export OPML…" onPress={exportOpml} />
        {busy && (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.muted }}>{busy}</Text>
          </View>
        )}
      </View>

      {section('Offline storage')}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Choice label="Storage limit" options={STORAGE_LIMITS} value={settings.maxStorageMB} onChange={(v) => update('maxStorageMB', v)} format={formatMB} />
        <Text style={[styles.note, { color: colors.muted }]}>When articles take more space than this, the oldest are removed, read ones first.</Text>
        <Choice label="Keep per feed" unit="articles" options={ARTICLE_LIMITS} value={settings.maxArticlesPerFeed} onChange={(v) => update('maxArticlesPerFeed', v)} />
        <Choice label="Keep articles for" unit="days" options={AGE_LIMITS} value={settings.maxAgeDays} onChange={(v) => update('maxAgeDays', v)} />
        <Text style={[styles.note, { color: colors.muted }]}>Starred articles are always kept.</Text>
        <Choice
          label="Download full articles"
          options={FULLTEXT_OPTIONS}
          value={settings.fullText}
          onChange={(v) => update('fullText', v)}
          format={(v) => FULLTEXT_LABELS[v]}
        />
        <Text style={[styles.note, { color: colors.muted }]}>
          When a feed only gives a summary, the app downloads the linked article and keeps the readable text, newest unread first, until the storage limit is nearly reached. This runs after each refresh. Text a site loads only when you tap, and paywalled articles, stay as summaries.
        </Text>
        {waitingForWifi && (
          <Text style={[styles.note, { color: colors.muted }]}>Waiting for Wi-Fi: automatic downloads will start when you’re on Wi-Fi.</Text>
        )}
        {fullTextBusy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.muted }}>Downloading full articles…</Text>
          </View>
        ) : (
          <ActionRow label="Download full articles now" detail="Uses mobile data if you’re not on Wi-Fi." onPress={downloadFullTextNow} />
        )}
        {fullTextResult && <Text style={[styles.note, { color: colors.muted }]}>{fullTextResult}</Text>}
        {counts && (
          <Text style={[styles.note, { color: colors.muted }]}>
            Full text: {counts.saved} saved · {counts.failed} failed · {counts.notNeeded} not needed · {counts.notTried} not tried yet
          </Text>
        )}
        {stats && (
          <Text style={[styles.note, { color: colors.muted }]}>
            {stats.feeds} feeds · {stats.articles} articles ({stats.unread} unread, {stats.starred} starred) · {(stats.bytes / 1_000_000).toFixed(1)} MB
            {settings.maxStorageMB > 0 ? ` of ${formatMB(settings.maxStorageMB)}` : ''}
          </Text>
        )}
        <ActionRow
          label="Delete read articles"
          destructive
          onPress={() =>
            Alert.alert('Delete read articles?', 'Starred articles are kept.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => deleteReadArticles().then(notifyDataChanged) },
            ])
          }
        />
      </View>

      {section('Refresh')}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <ToggleRow label="Refresh in background" value={settings.backgroundRefresh} onChange={(v) => update('backgroundRefresh', v)} />
        <Choice
          label="Every"
          unit="min"
          options={INTERVALS}
          value={settings.refreshIntervalMinutes}
          onChange={(v) => update('refreshIntervalMinutes', v)}
          format={(v) => (v >= 60 ? `${v / 60}h` : `${v}m`)}
        />
        <ToggleRow label="Background refresh on Wi-Fi only" value={settings.wifiOnly} onChange={(v) => update('wifiOnly', v)} />
        <Text style={[styles.note, { color: colors.muted }]}>
          The phone decides exactly when background refresh runs; the interval is a minimum. The app also refreshes when opened.
        </Text>
      </View>

      {section('Contact us')}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <ActionRow label={`Email: ${CONTACT_EMAIL}`} detail="Questions, problems or feedback about the app." onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=Hafnium%20Reader`)} />
        <ActionRow label="Website: reader.hafnium.ltd" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/contact.html`)} />
        <ActionRow label="Help and support" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/support.html`)} />
        <ActionRow label="Privacy policy" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/privacy.html`)} />
        <Text style={[styles.note, { color: colors.muted }]}>
          Hafnium Reader {Constants.expoConfig?.version} is made by Hafnium Research. Articles come from the feeds you subscribe to; to contact a publisher about an article, use the contact details on its website.
        </Text>
      </View>
    </ScrollView>
  );
}

function ActionRow({ label, detail, onPress, destructive }: { label: string; detail?: string; onPress: () => void; destructive?: boolean }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <Text style={{ color: destructive ? colors.danger : colors.accent, fontSize: 16 }}>{label}</Text>
      {detail && <Text style={[styles.note, { color: colors.muted }]}>{detail}</Text>}
    </Pressable>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const colors = useColors();
  return (
    <View style={[styles.row, styles.toggle]}>
      <Text style={{ color: colors.text, fontSize: 16, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent }} />
    </View>
  );
}

/** A sample paragraph styled like the reader, so appearance changes are visible immediately. */
function ReaderPreview() {
  const colors = useColors();
  const fs = useFontSize();
  const { readerFont, lineSpacing } = useAppearance();
  const size = fs(18);
  return (
    <View style={[styles.preview, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Text style={{ color: colors.text, fontSize: Math.round(size * 1.2), fontWeight: '700', fontFamily: readerFont === 'serif' ? SERIF_FONT : undefined }}>
        The quick brown fox
      </Text>
      <Text style={{ color: colors.muted, fontSize: fs(12), marginVertical: 4 }}>Preview · 2 min read</Text>
      <Text
        style={{
          color: colors.text,
          fontSize: size,
          lineHeight: Math.round(size * LINE_HEIGHTS[lineSpacing]),
          fontFamily: readerFont === 'serif' ? SERIF_FONT : undefined,
        }}
      >
        Articles are saved on your phone, so you can read them anywhere — on a plane, in the{' '}
        <Text style={{ color: colors.accent, textDecorationLine: 'underline' }}>underground</Text>, or with no signal at all.
      </Text>
    </View>
  );
}

function Choice<T extends string | number>({
  label,
  unit,
  options,
  value,
  onChange,
  format = (v) => String(v),
}: {
  label: string;
  unit?: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.text, fontSize: 16, marginBottom: 8 }}>
        {label} {unit && <Text style={{ color: colors.muted }}>({unit})</Text>}
      </Text>
      <View style={styles.chips}>
        {options.map((o) => {
          const selected = o === value;
          return (
            <Pressable
              key={o}
              onPress={() => onChange(o)}
              style={[styles.chip, { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accent : 'transparent' }]}
            >
              <Text style={{ color: selected ? '#fff' : colors.text, fontVariant: ['tabular-nums'] }}>{format(o)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  section: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, marginTop: 16, marginBottom: 6, marginLeft: 4 },
  card: { borderRadius: 10, paddingVertical: 4 },
  row: { paddingHorizontal: 14, paddingVertical: 10 },
  toggle: { flexDirection: 'row', alignItems: 'center' },
  note: { fontSize: 13, lineHeight: 18, paddingHorizontal: 14, paddingBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
  preview: { margin: 14, marginTop: 6, padding: 16, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  busy: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
});
