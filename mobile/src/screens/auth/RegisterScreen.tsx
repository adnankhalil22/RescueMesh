import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { describeError } from '../../services/api';
import { Button, Card, ErrorText, Field, Screen } from '../../components/ui';
import { colors } from '../../theme';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '', bloodGroup: '', emergencyContact: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  const submit = async () => {
    setError(null);
    if (form.name.trim().length < 2) return setError('Please enter your full name.');
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Please enter a valid email address.');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        bloodGroup: form.bloodGroup.trim() || undefined,
        emergencyContact: form.emergencyContact.trim() || undefined,
      });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Text style={{ color: colors.muted, marginBottom: 12 }}>
          Your details help responders reach and treat you. Accounts created here are citizen accounts; responder access is granted by an administrator.
        </Text>
        <ErrorText>{error}</ErrorText>
        <Card>
          <Field label="Full name *" value={form.name} onChangeText={set('name')} autoComplete="name" />
          <Field label="Email *" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" />
          <Field label="Phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
          <Field label="Password * (min. 8 characters)" value={form.password} onChangeText={set('password')} secureTextEntry />
          <Field label="Confirm password *" value={form.confirm} onChangeText={set('confirm')} secureTextEntry />
        </Card>
        <Card>
          <Field label="Blood group" value={form.bloodGroup} onChangeText={set('bloodGroup')} placeholder="e.g. O+" autoCapitalize="characters" maxLength={5} />
          <Field label="Emergency contact" value={form.emergencyContact} onChangeText={set('emergencyContact')} placeholder="Name and phone number" />
        </Card>
        <Button title="Create account" onPress={submit} loading={busy} variant="danger" big />
      </Screen>
    </KeyboardAvoidingView>
  );
}
