import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';
import { api, describeError } from '../../services/api';
import { Button, Card, ErrorText, Field, Row, Screen, SectionTitle } from '../../components/ui';
import { colors } from '../../theme';
import type { RootStackParams } from '../../navigation/types';

const ROLE_LABEL = { VICTIM: 'Citizen', RESPONDER: 'Responder', ADMIN: 'Administrator' } as const;

export default function ProfileScreen() {
  const { user, logout, updateUser } = useAuth();
  const { online, counts } = useSync();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    bloodGroup: user?.bloodGroup ?? '',
    emergencyContact: user?.emergencyContact ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  if (!user) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateProfile(user.id, {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        bloodGroup: form.bloodGroup.trim() || null,
        emergencyContact: form.emergencyContact.trim() || null,
      });
      await updateUser(updated);
      setEditing(false);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={st.head}>
        <View style={st.avatar}>
          <Text style={st.avatarText}>{user.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={st.name}>{user.name}</Text>
        <Text style={st.meta}>
          {user.email} · {ROLE_LABEL[user.role]}
        </Text>
      </View>
      <ErrorText>{error}</ErrorText>

      {editing ? (
        <Card>
          <Field label="Full name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
          <Field label="Phone" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
          <Field label="Blood group" value={form.bloodGroup} onChangeText={(v) => setForm({ ...form, bloodGroup: v })} autoCapitalize="characters" maxLength={5} />
          <Field label="Emergency contact" value={form.emergencyContact} onChangeText={(v) => setForm({ ...form, emergencyContact: v })} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} style={{ flex: 1 }} />
            <Button title="Save" onPress={save} loading={busy} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : (
        <Card>
          <Row label="Phone" value={user.phone ?? '—'} icon="call" />
          <Row label="Blood group" value={user.bloodGroup ?? '—'} icon="water" />
          <Row label="Emergency contact" value={user.emergencyContact ?? '—'} icon="people" />
          {user.organization && <Row label="Organization" value={user.organization} icon="business" />}
          <Button
            title={online ? 'Edit profile' : 'Edit profile (needs connection)'}
            variant="ghost"
            icon="create"
            disabled={!online}
            onPress={() => setEditing(true)}
            style={{ marginTop: 12 }}
          />
        </Card>
      )}

      <SectionTitle>App</SectionTitle>
      <Button title="Settings" icon="settings" variant="ghost" onPress={() => navigation.navigate('Settings')} />
      <View style={{ height: 10 }} />
      {confirmLogout ? (
        <Card style={{ borderColor: colors.red }}>
          <Text style={{ color: colors.text, marginBottom: 10 }}>
            {counts.unsent
              ? `${counts.unsent} message(s) have not been sent yet. They stay on this phone and will be sent after you sign in again with this account.`
              : 'Sign out of RescueMesh on this phone?'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Stay" variant="ghost" onPress={() => setConfirmLogout(false)} style={{ flex: 1 }} />
            <Button title="Sign out" variant="danger" onPress={() => void logout()} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : (
        <Button title="Sign out" icon="log-out" variant="ghost" onPress={() => setConfirmLogout(true)} />
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  head: { alignItems: 'center', paddingVertical: 16 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.navy3, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 32, fontWeight: '800' },
  name: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 10 },
  meta: { color: colors.muted, marginTop: 2 },
});
