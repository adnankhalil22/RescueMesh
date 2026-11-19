import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle, type StyleProp, RefreshControl } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, deliveryColor, priorityColor, radius, statusColor } from '../theme';
import { DELIVERY_LABEL, PRIORITY_LABEL, STATUS_LABEL } from '../constants';
import type { DeliveryStatus, EmergencyStatus, Priority } from '../types';
import { useSync, type LinkState } from '../context/SyncContext';

export type IconName = keyof typeof Ionicons.glyphMap;

export function Screen({
  children,
  scroll = true,
  edges = ['bottom'],
  refreshing,
  onRefresh,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={s.screen} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[s.content, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[s.content, { flex: 1 }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

type Variant = 'primary' | 'danger' | 'success' | 'warning' | 'ghost';
export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  big,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
}) {
  const bg = { primary: colors.navy3, danger: colors.red, success: colors.green, warning: colors.amber, ghost: colors.surface }[variant];
  const fg = variant === 'ghost' ? colors.text : colors.white;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        s.btn,
        big && s.btnBig,
        { backgroundColor: bg, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={big ? 22 : 18} color={fg} /> : null}
      <Text style={[s.btnText, big && { fontSize: 18 }, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor="#94a3b8" style={[s.input, props.multiline && { minHeight: 80, textAlignVertical: 'top' }, error && { borderColor: colors.red }]} {...props} />
      {error ? <Text style={s.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function Pill({ label, color, soft = true }: { label: string; color: string; soft?: boolean }) {
  return (
    <View style={[s.pill, { backgroundColor: soft ? `${color}1f` : color }]}>
      <Text style={[s.pillText, { color: soft ? color : colors.white }]}>{label}</Text>
    </View>
  );
}

export const PriorityBadge = ({ priority }: { priority: Priority }) => <Pill label={PRIORITY_LABEL[priority]} color={priorityColor[priority]} soft={false} />;
export const StatusBadge = ({ status }: { status: EmergencyStatus }) => <Pill label={STATUS_LABEL[status]} color={statusColor[status]} />;
export const DeliveryBadge = ({ status }: { status: DeliveryStatus }) => <Pill label={DELIVERY_LABEL[status]} color={deliveryColor[status]} />;

const LINK_META: Record<LinkState, { label: string; color: string; icon: IconName }> = {
  online: { label: 'Online', color: colors.green, icon: 'cloud-done' },
  unreachable: { label: 'Server unreachable', color: colors.amber, icon: 'cloud-offline' },
  offline: { label: 'Offline', color: colors.red, icon: 'cloud-offline' },
  checking: { label: 'Checking…', color: colors.muted, icon: 'sync' },
};

export function ConnectionPill() {
  const { link } = useSync();
  const m = LINK_META[link];
  return (
    <View style={[s.connPill, { borderColor: m.color }]} accessibilityLabel={`Connection: ${m.label}`}>
      <View style={[s.dot, { backgroundColor: m.color }]} />
      <Text style={[s.connText, { color: colors.white }]}>{m.label}</Text>
    </View>
  );
}

/** Explains what offline means, in plain words, wherever it matters. */
export function OfflineBanner() {
  const { link, counts, forceOffline } = useSync();
  if (link === 'online' || link === 'checking') return null;
  return (
    <View style={s.banner} accessibilityRole="alert">
      <Ionicons name="cloud-offline" size={20} color={colors.amber} />
      <Text style={s.bannerText}>
        {forceOffline ? 'Offline mode is on. ' : link === 'offline' ? 'No network connection. ' : 'Cannot reach the RescueMesh server. '}
        SOS requests are saved on this phone and sent automatically when the connection returns.
        {counts.unsent ? ` ${counts.unsent} waiting.` : ''}
      </Text>
    </View>
  );
}

export function Row({ label, value, icon }: { label: string; value: ReactNode; icon?: IconName }) {
  return (
    <View style={s.row}>
      {icon && <Ionicons name={icon} size={18} color={colors.muted} style={{ marginRight: 10 }} />}
      <Text style={s.rowLabel}>{label}</Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{typeof value === 'string' || typeof value === 'number' ? <Text style={s.rowValue}>{value}</Text> : value}</View>
    </View>
  );
}

export function Empty({ icon = 'file-tray-outline', text }: { icon?: IconName; text: string }) {
  return (
    <View style={{ alignItems: 'center', padding: 28 }}>
      <Ionicons name={icon} size={36} color="#cbd5e1" />
      <Text style={{ color: colors.muted, marginTop: 8, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <View style={s.errorBox} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={18} color={colors.red} />
      <Text style={{ color: colors.redDark, flex: 1 }}>{children}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: 16, minHeight: 48 },
  btnBig: { paddingVertical: 18, minHeight: 60 },
  btnText: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text },
  fieldError: { color: colors.red, marginTop: 4, fontSize: 13 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  connPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.06)' },
  connText: { fontSize: 12, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  banner: { flexDirection: 'row', gap: 10, backgroundColor: colors.amberSoft, borderColor: '#fcd34d', borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 12 },
  bannerText: { flex: 1, color: '#78350f', fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabel: { color: colors.muted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  errorBox: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.redSoft, borderRadius: radius.md, padding: 12, marginBottom: 12 },
});
