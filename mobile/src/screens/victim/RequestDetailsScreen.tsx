import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';
import { getRequest, requeue, upsertFromServer } from '../../storage/database';
import { api, describeError, isNetworkError } from '../../services/api';
import { DELIVERY_LABEL, PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL } from '../../constants';
import { Button, Card, DeliveryBadge, ErrorText, OfflineBanner, PriorityBadge, Row, Screen, SectionTitle, StatusBadge } from '../../components/ui';
import { colors, deliveryColor } from '../../theme';
import type { DeliveryStatus, LocalRequest, ServerEmergency } from '../../types';
import type { RootScreen } from '../../navigation/types';

const STEPS: DeliveryStatus[] = ['PENDING', 'QUEUED', 'SENT', 'DELIVERED'];

export default function RequestDetailsScreen({ route }: RootScreen<'RequestDetails'>) {
  const { id, justCreated } = route.params;
  const { user } = useAuth();
  const { online, revision, bump, syncNow, syncing } = useSync();
  const [item, setItem] = useState<LocalRequest | null>(null);
  const [server, setServer] = useState<ServerEmergency | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItem(await getRequest(id));
    if (online && user) {
      try {
        const s = await api.emergency(id);
        setServer(s);
        await upsertFromServer(user.id, [s]);
        setItem(await getRequest(id));
      } catch (e) {
        // 404 simply means it has not been synchronised yet
        if (!isNetworkError(e) && !/not found/i.test(describeError(e))) setError(describeError(e));
      }
    }
  }, [id, online, user]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  // Keep the status fresh while the screen is open.
  useEffect(() => {
    if (!online) return;
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [online, load]);

  if (!item) {
    return (
      <Screen>
        <Text style={{ color: colors.muted }}>Loading…</Text>
      </Screen>
    );
  }

  const status = server?.status ?? item.status;
  const reached = STEPS.indexOf(item.deliveryStatus);

  const retry = async () => {
    await requeue(item.messageId);
    bump();
    await syncNow();
  };

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.setStatus(item.id, 'CANCELLED', 'Cancelled by reporter from mobile app');
      await load();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {justCreated && (
        <View style={[st.banner, { backgroundColor: item.deliveryStatus === 'DELIVERED' ? colors.greenSoft : colors.amberSoft }]}>
          <Ionicons name={item.deliveryStatus === 'DELIVERED' ? 'checkmark-circle' : 'save'} size={22} color={item.deliveryStatus === 'DELIVERED' ? colors.green : colors.amber} />
          <Text style={st.bannerText}>
            {item.deliveryStatus === 'DELIVERED'
              ? 'Your SOS has reached the emergency operations center.'
              : 'Your SOS is saved on this phone and will be sent as soon as there is a connection.'}
          </Text>
        </View>
      )}
      <OfflineBanner />
      <ErrorText>{error}</ErrorText>

      <Card>
        <Text style={st.title}>{TYPE_LABEL[item.type]}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <PriorityBadge priority={item.priority} />
          {item.deliveryStatus === 'DELIVERED' ? <StatusBadge status={status} /> : <DeliveryBadge status={item.deliveryStatus} />}
        </View>
        {!!item.description && <Text style={st.desc}>{item.description}</Text>}
      </Card>

      <SectionTitle>Delivery status</SectionTitle>
      <Card>
        {item.deliveryStatus === 'FAILED' ? (
          <View style={{ gap: 8 }}>
            <DeliveryBadge status="FAILED" />
            <Text style={{ color: colors.redDark }}>{item.lastError}</Text>
          </View>
        ) : (
          <View style={st.steps}>
            {STEPS.map((step, i) => {
              const done = i <= reached;
              return (
                <View key={step} style={st.step}>
                  <View style={[st.stepDot, { backgroundColor: done ? deliveryColor[step] : colors.border }]}>
                    {done && <Ionicons name="checkmark" size={14} color={colors.white} />}
                  </View>
                  <Text style={[st.stepText, done && { color: colors.text, fontWeight: '700' }]}>{step}</Text>
                </View>
              );
            })}
          </View>
        )}
        <Text style={st.small}>
          {DELIVERY_LABEL[item.deliveryStatus]}
          {item.attempts ? ` · ${item.attempts} attempt(s)` : ''}
          {item.lastError && item.deliveryStatus !== 'FAILED' ? ` · last error: ${item.lastError}` : ''}
        </Text>
        {item.deliveryStatus !== 'DELIVERED' && (
          <Button title={item.deliveryStatus === 'FAILED' ? 'Re-queue and retry' : 'Retry now'} icon="refresh" variant="ghost" onPress={retry} loading={syncing} style={{ marginTop: 12 }} />
        )}
      </Card>

      <SectionTitle>Response</SectionTitle>
      <Card>
        <Row label="Status" value={STATUS_LABEL[status]} icon="pulse" />
        <Row label="Responder" value={server?.responder?.name ?? item.responderName ?? 'Not assigned yet'} icon="person" />
        {server?.responder?.phone && (
          <Row label="Responder phone" value={<Text style={st.link} onPress={() => Linking.openURL(`tel:${server.responder!.phone}`)}>{server.responder.phone}</Text>} icon="call" />
        )}
        {server?.history?.slice(-4).map((h) => (
          <Row key={h.id} label={new Date(h.createdAt).toLocaleTimeString()} value={`${STATUS_LABEL[h.status]}${h.note ? ` — ${h.note}` : ''}`} />
        ))}
        {!online && <Text style={st.small}>Responder updates appear when you are online.</Text>}
      </Card>

      <SectionTitle>Details</SectionTitle>
      <Card>
        <Row label="Request ID" value={<Text selectable style={st.mono}>{item.id}</Text>} />
        <Row label="Message ID" value={<Text selectable style={st.mono}>{item.messageId}</Text>} />
        <Row label="Priority" value={PRIORITY_LABEL[item.priority]} />
        <Row label="People" value={item.peopleCount} />
        <Row label="Location" value={`${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`} />
        <Row label="Accuracy" value={item.accuracy ? `± ${Math.round(item.accuracy)} m` : '—'} />
        <Row label="Created" value={new Date(item.createdAt).toLocaleString()} />
      </Card>

      {online && ['PENDING', 'ACCEPTED'].includes(status) && item.deliveryStatus === 'DELIVERED' && (
        <Button title="Cancel this request (help no longer needed)" variant="ghost" icon="close-circle" onPress={cancel} loading={busy} />
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  banner: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, borderRadius: 14, marginBottom: 12 },
  bannerText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  desc: { marginTop: 10, color: colors.text, fontSize: 15, lineHeight: 21 },
  steps: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  step: { alignItems: 'center', flex: 1, gap: 4 },
  stepDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 11, color: colors.muted },
  small: { color: colors.muted, fontSize: 13, marginTop: 4 },
  mono: { fontFamily: 'monospace', fontSize: 11, color: colors.text, textAlign: 'right' },
  link: { color: colors.blue, fontWeight: '700' },
});
