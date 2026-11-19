import { useCallback, useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';
import { api } from '../../services/api';
import { clearDelivered, listOutbox } from '../../storage/database';
import { defaultApiUrl, kv } from '../../storage/kv';
import type { OutboxItem } from '../../sync/syncEngine';
import { Button, Card, DeliveryBadge, Field, Row, Screen, SectionTitle } from '../../components/ui';
import { colors } from '../../theme';

export default function SettingsScreen() {
  const { user } = useAuth();
  const sync = useSync();
  const [url, setUrl] = useState(sync.apiUrl);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setUrl(sync.apiUrl), [sync.apiUrl]);
  useEffect(() => {
    void kv.getDeviceId().then(setDeviceId);
  }, []);

  const loadOutbox = useCallback(async () => {
    if (user) setOutbox(await listOutbox(user.id, 20));
  }, [user]);
  useEffect(() => {
    void loadOutbox();
  }, [loadOutbox, sync.revision]);

  const testAndSave = async () => {
    const clean = url.trim().replace(/\/$/, '');
    if (!/^https?:\/\/.+/.test(clean)) return setTest({ ok: false, text: 'Use a full address like http://192.168.1.10:4000' });
    setTesting(true);
    setTest(null);
    try {
      await api.health(clean);
      await sync.setApiUrl(clean);
      setTest({ ok: true, text: 'Connected. Server address saved.' });
      void sync.checkServer();
    } catch (e) {
      setTest({ ok: false, text: `Could not reach ${clean}: ${e instanceof Error ? e.message : 'error'}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Screen>
      <SectionTitle>Server connection</SectionTitle>
      <Card>
        <Field label="RescueMesh server address" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        {test && <Text style={{ color: test.ok ? colors.green : colors.red, marginBottom: 10 }}>{test.text}</Text>}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Reset" variant="ghost" onPress={() => setUrl(defaultApiUrl())} style={{ flex: 1 }} />
          <Button title="Test & save" icon="checkmark" onPress={testAndSave} loading={testing} style={{ flex: 2 }} />
        </View>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 10 }}>
          On a phone, use your computer's network address (shown when the backend starts), not "localhost".
        </Text>
      </Card>

      <SectionTitle>Offline mode</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: colors.text, fontSize: 15 }}>Simulate no connectivity</Text>
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>
              Blocks all network use by this app, exactly as if there were no signal. Use it to demonstrate offline SOS and automatic sync.
            </Text>
          </View>
          <Switch value={sync.forceOffline} onValueChange={(v) => void sync.setForceOffline(v)} accessibilityLabel="Simulate no connectivity" />
        </View>
      </Card>

      <SectionTitle>Communication channels</SectionTitle>
      <Card>
        {sync.transports.map((t) => (
          <Row key={t.id} label={t.label} value={<Text style={{ color: t.available ? colors.green : colors.muted, fontWeight: '600', textAlign: 'right' }}>{t.description}</Text>} />
        ))}
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
          The LoRa bridge is the integration point for ESP32 + LoRa hardware. No hardware is paired, so it is never used for delivery.
        </Text>
      </Card>

      {user && (
        <>
          <SectionTitle>Outbox ({sync.counts.unsent} unsent)</SectionTitle>
          <Card>
            {outbox.length === 0 ? (
              <Text style={{ color: colors.muted }}>No messages.</Text>
            ) : (
              outbox.map((o) => (
                <View key={o.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{o.packet.type}</Text>
                    <DeliveryBadge status={o.status} />
                  </View>
                  <Text style={{ fontFamily: 'monospace', fontSize: 11, color: colors.muted }}>{o.id}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    {new Date(o.createdAt).toLocaleString()} · {o.attempts} attempt(s){o.lastError ? ` · ${o.lastError}` : ''}
                  </Text>
                </View>
              ))
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Button title="Sync now" icon="sync" onPress={() => void sync.syncNow()} loading={sync.syncing} style={{ flex: 1 }} />
              <Button
                title="Clear sent"
                variant="ghost"
                onPress={async () => {
                  const n = await clearDelivered(user.id);
                  setNotice(`${n} delivered location/status message(s) removed. SOS records are kept.`);
                  void loadOutbox();
                }}
                style={{ flex: 1 }}
              />
            </View>
            {notice && <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>{notice}</Text>}
            {sync.lastSync && (
              <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>
                Last sync {new Date(sync.lastSync.at).toLocaleTimeString()}: {sync.lastSync.summary.delivered} delivered, {sync.lastSync.summary.retrying} retrying,{' '}
                {sync.lastSync.summary.failed} failed
              </Text>
            )}
          </Card>
        </>
      )}

      <SectionTitle>About</SectionTitle>
      <Card>
        <Row label="Device node ID" value={deviceId} />
        <Row label="App version" value={Constants.expoConfig?.version ?? '1.0.0'} />
        <Row label="Connection" value={sync.link} />
      </Card>
    </Screen>
  );
}
