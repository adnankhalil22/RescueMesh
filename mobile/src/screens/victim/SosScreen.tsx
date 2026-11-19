import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';
import { describeFixAge, getFix, LocationError, type Fix } from '../../services/location';
import { createSos } from '../../services/sos';
import { EMERGENCY_TYPES, PRIORITIES, PRIORITY_LABEL } from '../../constants';
import { Button, Card, ErrorText, OfflineBanner, Screen, SectionTitle, type IconName } from '../../components/ui';
import { colors, priorityColor, radius } from '../../theme';
import type { EmergencyType, Priority } from '../../types';
import type { RootScreen } from '../../navigation/types';

export default function SosScreen({ navigation }: RootScreen<'Sos'>) {
  const { user } = useAuth();
  const { online, bump } = useSync();
  const [type, setType] = useState<EmergencyType | null>(null);
  const [priority, setPriority] = useState<Priority>('HIGH');
  const [people, setPeople] = useState(1);
  const [description, setDescription] = useState('');
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback(async () => {
    setGpsBusy(true);
    setGpsError(null);
    setNeedsSettings(false);
    try {
      setFix(await getFix());
    } catch (e) {
      setGpsError(e instanceof Error ? e.message : 'Could not get your location');
      setNeedsSettings(e instanceof LocationError && (e.reason === 'permission-blocked' || e.reason === 'services-off'));
    } finally {
      setGpsBusy(false);
    }
  }, []);

  // Start acquiring GPS immediately — it is the slowest step.
  useEffect(() => {
    void locate();
  }, [locate]);

  const chooseType = (t: (typeof EMERGENCY_TYPES)[number]) => {
    setType(t.key);
    setPriority(t.defaultPriority);
  };

  const send = async () => {
    if (!user) return;
    if (!type) return setError('Choose what kind of emergency this is.');
    if (!fix) return setError('Your location is needed so responders can find you. Tap "Retry GPS".');
    setSending(true);
    setError(null);
    try {
      const { requestId } = await createSos(user, { type, priority, description, peopleCount: people, fix }, online);
      bump(); // triggers immediate sync if online
      navigation.replace('RequestDetails', { id: requestId, justCreated: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the SOS');
      setSending(false);
    }
  };

  return (
    <Screen>
      <OfflineBanner />

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[st.gpsIcon, { backgroundColor: fix ? colors.greenSoft : gpsError ? colors.redSoft : colors.amberSoft }]}>
          {gpsBusy ? <ActivityIndicator color={colors.amber} /> : <Ionicons name={fix ? 'location' : 'location-outline'} size={22} color={fix ? colors.green : gpsError ? colors.red : colors.amber} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.gpsTitle}>{fix ? 'Location found' : gpsBusy ? 'Finding your location…' : 'Location not available'}</Text>
          <Text style={st.gpsSub}>
            {fix
              ? `${fix.latitude.toFixed(5)}, ${fix.longitude.toFixed(5)}${fix.accuracy ? ` · ±${Math.round(fix.accuracy)} m` : ''} · ${describeFixAge(fix)}`
              : gpsError ?? 'GPS works without internet'}
          </Text>
        </View>
        {!gpsBusy && (
          <Pressable onPress={locate} accessibilityRole="button" style={st.retry}>
            <Text style={{ color: colors.blue, fontWeight: '700' }}>{fix ? 'Refresh' : 'Retry GPS'}</Text>
          </Pressable>
        )}
      </Card>
      {needsSettings && (
        <Button title="Open phone settings" icon="settings" variant="ghost" onPress={() => void Linking.openSettings()} style={{ marginBottom: 12 }} />
      )}
      {fix?.source === 'stale' && (
        <Text style={[st.hint, { marginTop: -4, marginBottom: 10, color: colors.amber }]}>
          Using an older saved position because a live GPS fix is not available. Tap Refresh outdoors for a better fix.
        </Text>
      )}

      <SectionTitle>1. What is the emergency?</SectionTitle>
      <View style={st.types}>
        {EMERGENCY_TYPES.map((t) => {
          const active = type === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => chooseType(t)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[st.type, active && st.typeActive]}
            >
              <Ionicons name={t.icon as IconName} size={28} color={active ? colors.white : colors.red} />
              <Text style={[st.typeText, active && { color: colors.white }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionTitle>2. Priority</SectionTitle>
      <View style={st.chips}>
        {PRIORITIES.map((p) => {
          const active = priority === p;
          return (
            <Pressable
              key={p}
              onPress={() => setPriority(p)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[st.chip, { borderColor: priorityColor[p] }, active && { backgroundColor: priorityColor[p] }]}
            >
              <Text style={[st.chipText, { color: active ? colors.white : priorityColor[p] }]}>{PRIORITY_LABEL[p]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={st.hint}>Set automatically from the emergency type — change it if needed.</Text>

      <SectionTitle>3. People needing help</SectionTitle>
      <Card style={st.stepper}>
        <Pressable style={st.stepBtn} onPress={() => setPeople(Math.max(1, people - 1))} accessibilityLabel="Fewer people">
          <Ionicons name="remove" size={26} color={colors.text} />
        </Pressable>
        <Text style={st.stepValue}>{people}</Text>
        <Pressable style={st.stepBtn} onPress={() => setPeople(Math.min(999, people + 1))} accessibilityLabel="More people">
          <Ionicons name="add" size={26} color={colors.text} />
        </Pressable>
      </Card>

      <SectionTitle>4. Details (optional)</SectionTitle>
      <TextInput
        style={st.input}
        multiline
        maxLength={1000}
        placeholder="e.g. Water rising, we are on the roof. One person injured."
        placeholderTextColor="#94a3b8"
        value={description}
        onChangeText={setDescription}
      />

      <ErrorText>{error}</ErrorText>
      <Button
        title={online ? 'SEND SOS' : 'SAVE SOS (send when online)'}
        icon="alert-circle"
        variant="danger"
        big
        loading={sending}
        disabled={!type || !fix}
        onPress={send}
      />
      <Text style={[st.hint, { textAlign: 'center', marginTop: 10 }]}>
        {online
          ? 'Your request is saved on this phone first, then sent to responders.'
          : 'No connection: your request will be stored safely and sent automatically.'}
      </Text>
    </Screen>
  );
}

const st = StyleSheet.create({
  gpsIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  gpsTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  gpsSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  retry: { padding: 8 },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  type: { width: '48%', flexGrow: 1, minHeight: 92, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', padding: 10, gap: 6 },
  typeActive: { backgroundColor: colors.red, borderColor: colors.redDark },
  typeText: { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: 'center' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, borderWidth: 2, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  chipText: { fontWeight: '800', fontSize: 14 },
  hint: { color: colors.muted, fontSize: 12, marginTop: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 28, fontWeight: '800', color: colors.text },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, minHeight: 90, fontSize: 16, color: colors.text, textAlignVertical: 'top', marginBottom: 14 },
});
