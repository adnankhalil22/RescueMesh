import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';
import { api, describeError } from '../../services/api';
import { PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL } from '../../constants';
import { Button, Card, ErrorText, OfflineBanner, PriorityBadge, Row, Screen, SectionTitle, StatusBadge } from '../../components/ui';
import { colors, radius, statusColor } from '../../theme';
import type { EmergencyStatus, ServerEmergency } from '../../types';
import type { RootScreen } from '../../navigation/types';

const CHANNEL = { ONLINE: 'Online (API)', OFFLINE_SYNC: 'Created offline, synced later', LORA_SIM: 'LoRa mesh (simulated)' } as const;

export default function ResponderDetailScreen({ route }: RootScreen<'ResponderDetail'>) {
  const { id } = route.params;
  const { user } = useAuth();
  const { online } = useSync();
  const [item, setItem] = useState<ServerEmergency | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItem(await api.emergency(id));
      setError(null);
    } catch (e) {
      setError(describeError(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (label: string, fn: () => Promise<ServerEmergency>) => {
    setBusy(label);
    setError(null);
    try {
      setItem(await fn());
      setNote('');
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  };

  if (!item) {
    return (
      <Screen>
        <OfflineBanner />
        <ErrorText>{error}</ErrorText>
        {!error && <Text style={{ color: colors.muted }}>Loading…</Text>}
      </Screen>
    );
  }

  const closed = item.status === 'RESOLVED' || item.status === 'CANCELLED';
  const mine = item.responder?.id === user?.id;
  const setStatus = (s: EmergencyStatus) => act(s, () => api.setStatus(item.id, s, note.trim() || undefined));

  const openMaps = () => {
    const { latitude: la, longitude: lo } = item;
    const url = Platform.OS === 'ios' ? `maps:?daddr=${la},${lo}` : `google.navigation:q=${la},${lo}`;
    Linking.openURL(url).catch(() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=17/${la}/${lo}`));
  };

  return (
    <Screen onRefresh={load} refreshing={false}>
      <OfflineBanner />
      <ErrorText>{error}</ErrorText>

      <Card>
        <Text style={st.title}>{TYPE_LABEL[item.type]}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <PriorityBadge priority={item.priority} />
          <StatusBadge status={item.status} />
        </View>
        {!!item.description && <Text style={st.desc}>{item.description}</Text>}
      </Card>

      <SectionTitle>Reporter location</SectionTitle>
      <Card>
        <Text style={st.coords} selectable>
          {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
        </Text>
        <Text style={{ color: colors.muted, marginBottom: 12 }}>{item.accuracy ? `GPS accuracy ± ${Math.round(item.accuracy)} m` : 'Accuracy unknown'}</Text>
        <Button title="Navigate to location" icon="navigate" onPress={openMaps} />
      </Card>

      <SectionTitle>Actions</SectionTitle>
      <Card>
        {closed ? (
          <Text style={{ color: colors.muted }}>This request is {STATUS_LABEL[item.status].toLowerCase()}.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            <TextInput style={st.note} placeholder="Note for the team (optional)" placeholderTextColor="#94a3b8" value={note} onChangeText={setNote} maxLength={500} />
            {!item.responder && (
              <Button title="Accept emergency" icon="hand-left" variant="danger" big disabled={!online} loading={busy === 'accept'} onPress={() => act('accept', () => api.accept(item.id, note.trim() || undefined))} />
            )}
            {item.status !== 'IN_PROGRESS' && (
              <Button title="Mark In Progress" icon="play-circle" variant="warning" disabled={!online} loading={busy === 'IN_PROGRESS'} onPress={() => setStatus('IN_PROGRESS')} />
            )}
            <Button title="Mark Resolved" icon="checkmark-circle" variant="success" disabled={!online} loading={busy === 'RESOLVED'} onPress={() => setStatus('RESOLVED')} />
            {!online && <Text style={{ color: colors.amber }}>Status updates need a connection to the server.</Text>}
            {item.responder && !mine && <Text style={{ color: colors.muted }}>Assigned to {item.responder.name}.</Text>}
          </View>
        )}
      </Card>

      <SectionTitle>Details</SectionTitle>
      <Card>
        <Row label="Request ID" value={<Text selectable style={st.mono}>{item.code}</Text>} />
        <Row label="Reported by" value={item.reporterName} />
        {item.reporter?.phone && (
          <Row label="Phone" value={<Text style={st.link} onPress={() => Linking.openURL(`tel:${item.reporter!.phone}`)}>{item.reporter.phone}</Text>} />
        )}
        <Row label="People" value={item.peopleCount} />
        <Row label="Priority" value={PRIORITY_LABEL[item.priority]} />
        <Row label="Reported" value={new Date(item.createdAt).toLocaleString()} />
        <Row label="Received" value={new Date(item.receivedAt).toLocaleString()} />
        <Row label="Channel" value={CHANNEL[item.channel]} />
        <Row label="Responder" value={item.responder?.name ?? 'Not assigned'} />
      </Card>

      {item.history && item.history.length > 0 && (
        <>
          <SectionTitle>Timeline</SectionTitle>
          <Card>
            {item.history.map((h) => (
              <View key={h.id} style={st.hist}>
                <View style={[st.histDot, { backgroundColor: statusColor[h.status] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{STATUS_LABEL[h.status]}</Text>
                  {h.note && <Text style={{ color: colors.text }}>{h.note}</Text>}
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {new Date(h.createdAt).toLocaleString()}
                    {h.user ? ` · ${h.user.name}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  desc: { marginTop: 10, fontSize: 15, color: colors.text, lineHeight: 21 },
  coords: { fontSize: 20, fontWeight: '800', color: colors.text },
  note: { backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 15, color: colors.text },
  mono: { fontFamily: 'monospace', color: colors.text },
  link: { color: colors.blue, fontWeight: '700' },
  hist: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  histDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
});
