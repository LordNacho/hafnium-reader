import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { configureBackgroundRefresh } from '../background';
import { deleteReadArticles, storageStats } from '../db';
import { notifyDataChanged, useDataVersion } from '../events';
import { buildOpml, parseOpml } from '../lib/opml';
import { DEFAULT_SETTINGS, loadSettings, saveSetting, type Settings } from '../settings';
import { exportFeeds, importFeeds, prune, syncAll } from '../sync';
import { useColors } from '../theme';

const ARTICLE_LIMITS = [25, 50, 100, 200, 500];
const AGE_LIMITS = [7, 14, 30, 90, 365];
const INTERVALS = [15, 30, 60, 180, 360, 720];

export default function SettingsScreen() {
  const colors = useColors();
  const version = useDataVersion();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof storageStats>> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
    if (key === 'maxArticlesPerFeed' || key === 'maxAgeDays') {
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
        <Choice label="Keep per feed" unit="articles" options={ARTICLE_LIMITS} value={settings.maxArticlesPerFeed} onChange={(v) => update('maxArticlesPerFeed', v)} />
        <Choice label="Keep articles for" unit="days" options={AGE_LIMITS} value={settings.maxAgeDays} onChange={(v) => update('maxAgeDays', v)} />
        <Text style={[styles.note, { color: colors.muted }]}>Starred articles are always kept.</Text>
        {stats && (
          <Text style={[styles.note, { color: colors.muted }]}>
            {stats.feeds} feeds · {stats.articles} articles ({stats.unread} unread, {stats.starred} starred) · {(stats.bytes / 1048576).toFixed(1)} MB
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

function Choice({
  label,
  unit,
  options,
  value,
  onChange,
  format = (v) => String(v),
}: {
  label: string;
  unit: string;
  options: number[];
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.text, fontSize: 16, marginBottom: 8 }}>
        {label} <Text style={{ color: colors.muted }}>({unit})</Text>
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
  busy: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
});
