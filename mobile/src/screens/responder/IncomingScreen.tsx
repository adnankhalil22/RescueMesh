import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';
import { api, describeError, isNetworkError } from '../../services/api';
import { kv } from '../../storage/kv';
import { TYPE_ICON, TYPE_LABEL } from '../../constants';
import { Card, ConnectionPill, Empty, ErrorText, PriorityBadge, Screen, StatusBadge, type IconName } from '../../components/ui';
import { timeAgo } from '../../components/RequestCard';
import { colors, priorityColor, radius } from '../../theme';
import type { ServerEmergency } from '../../types';
import type { ResponderTabScreen } from '../../navigation/types';

type Filter = 'active' | 'mine' | 'all';
const RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

export default function IncomingScreen({ navigation }: ResponderTabScreen<'Incoming'>) {
  const { user } = useAuth();
  const { online } = useSync();
  const [items, setItems] = useState<ServerEmergency[]>([]);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('active');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets(); // no header on this screen: clear the status bar / notch

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await api.emergencies();
      setItems(data);
      setCachedAt(null);
      setError(null);
      await kv.setCache('responderCache', data);
    } catch (e) {
      // Without a connection, show the last list fetched (clearly labelled as cached).
      const cache = await kv.getCache<ServerEmergency[]>('responderCache');
      if (cache) {
        setItems(cache.data);
        setCachedAt(cache.at);
      }
      if (!isNetworkError(e)) setError(describeError(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    if (!online) return;
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [online, load]);

  const visible = useMemo(() => {
    const list = items.filter((e) =>
      filter === 'all' ? true : filter === 'mine' ? e.responder?.id === user?.id && !['RESOLVED', 'CANCELLED'].includes(e.status) : !['RESOLVED', 'CANCELLED'].includes(e.status),
    );
    return list.sort((a, b) => RANK[a.priority] - RANK[b.priority] || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [items, filter, user]);

  const pendingCount = items.filter((e) => e.status === 'PENDING').length;

  return (
    <Screen edges={[]} onRefresh={load} refreshing={refreshing}>
      <View style={[st.hero, { paddingTop: insets.top + 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={st.heroTitle}>Incoming emergencies</Text>
            <Text style={st.heroSub}>
              {pendingCount} waiting for a responder · {user?.organization ?? user?.name}
            </Text>
          </View>
          <ConnectionPill />
        </View>
        <View style={st.filters}>
          {(['active', 'mine', 'all'] as Filter[]).map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)} style={[st.filter, filter === f && st.filterOn]} accessibilityRole="tab" accessibilityState={{ selected: filter === f }}>
              <Text style={[st.filterText, filter === f && { color: colors.navy }]}>{f === 'active' ? 'Active' : f === 'mine' ? 'Assigned to me' : 'All'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {cachedAt && (
        <View style={st.cached}>
          <Ionicons name="cloud-offline" size={18} color={colors.amber} />
          <Text style={{ flex: 1, color: '#78350f' }}>Offline — showing the list from {new Date(cachedAt).toLocaleTimeString()}. Status changes need a connection.</Text>
        </View>
      )}
      <ErrorText>{error}</ErrorText>

      {visible.length === 0 ? (
        <Card>
          <Empty icon="checkmark-done-circle-outline" text={filter === 'mine' ? 'Nothing assigned to you.' : 'No emergencies in this view.'} />
        </Card>
      ) : (
        visible.map((e) => (
          <Pressable key={e.id} onPress={() => navigation.navigate('ResponderDetail', { id: e.id })} style={({ pressed }) => [st.item, { borderLeftColor: priorityColor[e.priority] }, pressed && { opacity: 0.85 }]}>
            <View style={st.itemTop}>
              <Ionicons name={TYPE_ICON[e.type] as IconName} size={20} color={priorityColor[e.priority]} />
              <Text style={st.itemTitle}>{TYPE_LABEL[e.type]}</Text>
              <Text style={st.time}>{timeAgo(Date.parse(e.createdAt))}</Text>
            </View>
            {!!e.description && (
              <Text style={st.desc} numberOfLines={2}>
                {e.description}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <PriorityBadge priority={e.priority} />
              <StatusBadge status={e.status} />
              <Text style={st.meta}>
                {e.peopleCount} {e.peopleCount === 1 ? 'person' : 'people'} · {e.reporterName}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: colors.navy, marginHorizontal: -16, marginTop: -16, padding: 20, paddingTop: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, marginBottom: 16 },
  heroTitle: { color: colors.white, fontSize: 22, fontWeight: '800' },
  heroSub: { color: '#94a3b8', marginTop: 2 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 16 },
  filter: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.navy3 },
  filterOn: { backgroundColor: colors.white },
  filterText: { color: '#cbd5e1', fontWeight: '700', fontSize: 13 },
  cached: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.amberSoft, padding: 12, borderRadius: radius.md, marginBottom: 12 },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 5, gap: 8 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  time: { fontSize: 12, color: colors.muted },
  desc: { color: colors.text, fontSize: 14 },
  meta: { color: colors.muted, fontSize: 12 },
});
