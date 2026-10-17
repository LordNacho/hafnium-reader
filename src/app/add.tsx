import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addFeed } from '../sync';
import { useColors } from '../theme';

export default function AddFeedScreen() {
  const colors = useColors();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const id = await addFeed(url);
      router.replace({ pathname: '/articles', params: { feedId: String(id) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.label, { color: colors.muted }]}>Feed or website address</Text>
      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="example.com/blog"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        onSubmitEditing={submit}
        autoFocus
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
      />
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Pressable onPress={submit} disabled={busy} style={[styles.button, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Subscribe</Text>}
      </Pressable>
      <Text style={[styles.hint, { color: colors.muted }]}>
        Paste a feed URL, or a site’s homepage and the feed will be found automatically.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12 },
  label: { fontSize: 13 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  button: { borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 18 },
});
