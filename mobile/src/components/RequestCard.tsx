import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPE_ICON, TYPE_LABEL } from '../constants';
import { colors, priorityColor, radius } from '../theme';
import type { LocalRequest } from '../types';
import { DeliveryBadge, StatusBadge, type IconName } from './ui';

export function timeAgo(ms: number, now = Date.now()) {
  const sec = Math.max(0, Math.round((now - ms) / 1000));
  if (sec < 60) return 'just now';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return new Date(ms).toLocaleDateString();
}

export default function RequestCard({ item, onPress }: { item: LocalRequest; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.card, pressed && { opacity: 0.85 }]} accessibilityRole="button">
      <View style={[st.icon, { backgroundColor: `${priorityColor[item.priority]}1a` }]}>
        <Ionicons name={TYPE_ICON[item.type] as IconName} size={22} color={priorityColor[item.priority]} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={st.title}>{TYPE_LABEL[item.type]}</Text>
          <Text style={st.time}>{timeAgo(item.createdAt)}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {item.deliveryStatus === 'DELIVERED' ? <StatusBadge status={item.status} /> : <DeliveryBadge status={item.deliveryStatus} />}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  time: { fontSize: 12, color: colors.muted },
});
