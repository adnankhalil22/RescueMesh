import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';
import { listRequests } from '../../storage/database';
import { gpsState, type GpsState } from '../../services/location';
import { Button, Card, ConnectionPill, Empty, OfflineBanner, Screen, SectionTitle, type IconName } from '../../components/ui';
import RequestCard from '../../components/RequestCard';
import { colors, radius } from '../../theme';
import type { LocalRequest } from '../../types';
import type { VictimTabScreen } from '../../navigation/types';

const GPS_META: Record<GpsState, { text: string; color: string }> = {
  ready: { text: 'GPS ready', color: colors.green },
  unknown: { text: 'Permission needed', color: colors.amber },
  denied: { text: 'Permission denied', color: colors.red },
  'services-off': { text: 'GPS turned off', color: colors.red },
};

export default function HomeScreen({ navigation }: VictimTabScreen<'Home'>) {
  const { user } = useAuth();
  const { link, counts, syncNow, syncing, revision, lastSync } = useSync();
  const [recent, setRecent] = useState<LocalRequest[]>([]);
  const [gps, setGps] = useState<GpsState>('unknown');
  const insets = useSafeAreaInsets(); // this screen has no header, so clear the status bar / notch ourselves

  const load = useCallback(async () => {
    if (!user) return;
    setRecent((await listRequests(user.id, 3)) ?? []);
    setGps(await gpsState().catch(() => 'unknown' as GpsState));
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    void load();
  }, [revision, load]);

  const linkText = { online: 'Online — API', unreachable: 'Server unreachable', offline: 'Offline', checking: 'Checking…' }[link];
  const linkColor = { online: colors.green, unreachable: colors.amber, offline: colors.red, checking: colors.muted }[link];

  return (
    <Screen edges={[]} onRefresh={load} refreshing={false}>
      <View style={[st.hero, { paddingTop: insets.top + 16 }]}>
        <View style={st.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={st.hello}>Hello, {user?.name.split(' ')[0]}</Text>
            <Text style={st.helloSub}>Press SOS if you need emergency help</Text>
          </View>
          <ConnectionPill />
        </View>

        <Pressable
          onPress={() => navigation.navigate('Sos')}
          accessibilityRole="button"
          accessibilityLabel="SOS. Request emergency help"
          style={({ pressed }) => [st.sosOuter, pressed && { transform: [{ scale: 0.97 }] }]}
        >
          <View style={st.sosMid}>
            <View style={st.sosInner}>
              <Text style={st.sosText}>SOS</Text>
              <Text style={st.sosSub}>Tap for help</Text>
            </View>
          </View>
        </Pressable>
      </View>

      <OfflineBanner />

      <View style={st.grid}>
        <StatusTile icon="radio-outline" label="Communication" value={linkText} color={linkColor} />
        <StatusTile icon="navigate-outline" label="Location" value={GPS_META[gps].text} color={GPS_META[gps].color} />
      </View>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={[st.tileIcon, { backgroundColor: counts.unsent ? colors.amberSoft : colors.greenSoft }]}>
            <Ionicons name={counts.unsent ? 'time-outline' : 'checkmark-done'} size={22} color={counts.unsent ? colors.amber : colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.tileLabel}>Pending offline messages</Text>
            <Text style={st.tileValueBig}>{counts.unsent}</Text>
            <Text style={st.small}>
              {counts.unsent
                ? 'Saved on this phone. Will send automatically when online.'
                : lastSync
                  ? `All delivered · last sync ${new Date(lastSync.at).toLocaleTimeString()}`
                  : 'Nothing waiting to be sent.'}
              {counts.failed ? ` ${counts.failed} failed.` : ''}
            </Text>
          </View>
        </View>
        {counts.unsent > 0 && (
          <Button title={link === 'online' ? 'Send now' : 'Try to send now'} icon="sync" variant="ghost" loading={syncing} onPress={() => void syncNow()} style={{ marginTop: 12 }} />
        )}
      </Card>

      <SectionTitle
        right={
          recent.length ? (
            <Text style={st.link} onPress={() => navigation.navigate('MyRequests')}>
              See all
            </Text>
          ) : null
        }
      >
        Recent emergency requests
      </SectionTitle>
      {recent.length === 0 ? (
        <Card>
          <Empty icon="shield-checkmark-outline" text="You have not sent any SOS requests." />
        </Card>
      ) : (
        recent.map((r) => <RequestCard key={r.id} item={r} onPress={() => navigation.navigate('RequestDetails', { id: r.id })} />)
      )}
    </Screen>
  );
}

function StatusTile({ icon, label, value, color }: { icon: IconName; label: string; value: string; color: string }) {
  return (
    <View style={st.tile}>
      <View style={[st.tileIcon, { backgroundColor: `${color}1a` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={st.tileLabel}>{label}</Text>
      <Text style={[st.tileValue, { color }]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: colors.navy, marginHorizontal: -16, marginTop: -16, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, marginBottom: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hello: { color: colors.white, fontSize: 22, fontWeight: '800' },
  helloSub: { color: '#94a3b8', marginTop: 2 },
  sosOuter: { alignSelf: 'center', marginTop: 24, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(220,38,38,0.15)', alignItems: 'center', justifyContent: 'center' },
  sosMid: { width: 184, height: 184, borderRadius: 92, backgroundColor: 'rgba(220,38,38,0.3)', alignItems: 'center', justifyContent: 'center' },
  sosInner: { width: 150, height: 150, borderRadius: 75, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#fca5a5' },
  sosText: { color: colors.white, fontSize: 44, fontWeight: '900', letterSpacing: 2 },
  sosSub: { color: '#fee2e2', fontSize: 13, fontWeight: '600' },
  grid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  tile: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 4 },
  tileIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  tileLabel: { color: colors.muted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  tileValue: { fontSize: 15, fontWeight: '700' },
  tileValueBig: { fontSize: 26, fontWeight: '800', color: colors.text },
  small: { color: colors.muted, fontSize: 13 },
  link: { color: colors.red, fontWeight: '700' },
});
