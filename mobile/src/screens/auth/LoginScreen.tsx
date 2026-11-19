import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';
import { describeError } from '../../services/api';
import { Button, ConnectionPill, ErrorText, Field } from '../../components/ui';
import { colors } from '../../theme';
import type { RootScreen } from '../../navigation/types';

export default function LoginScreen({ navigation }: RootScreen<'Login'>) {
  const { login } = useAuth();
  const { apiUrl, link } = useSync();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.navy }} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">
          <View style={st.header}>
            <View style={st.logo}>
              <Text style={st.plus}>+</Text>
            </View>
            <Text style={st.brand}>RescueMesh</Text>
            <Text style={st.tag}>Emergency help, even when networks fail</Text>
            <View style={{ marginTop: 14 }}>
              <ConnectionPill />
            </View>
          </View>

          <View style={st.sheet}>
            <Text style={st.title}>Sign in</Text>
            <ErrorText>{error}</ErrorText>
            {link !== 'online' && link !== 'checking' && (
              <Text style={st.hint}>Signing in needs a connection to the server once. After that, SOS works offline.</Text>
            )}
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} />
            <Button title="Sign in" onPress={submit} loading={busy} variant="danger" big />
            <Pressable onPress={() => navigation.navigate('Register')} style={st.link} accessibilityRole="link">
              <Text style={st.linkText}>
                New here? <Text style={{ fontWeight: '700', color: colors.red }}>Create an account</Text>
              </Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Settings')} style={st.server} accessibilityRole="button">
              <Ionicons name="server-outline" size={16} color={colors.muted} />
              <Text style={st.serverText} numberOfLines={1}>
                Server: {apiUrl || '…'} (change)
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  scroll: { flexGrow: 1 },
  header: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
  logo: { width: 64, height: 64, borderRadius: 18, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  plus: { color: colors.white, fontSize: 44, fontWeight: '900', lineHeight: 50 },
  brand: { color: colors.white, fontSize: 28, fontWeight: '800', marginTop: 14 },
  tag: { color: '#94a3b8', fontSize: 14, marginTop: 4 },
  sheet: { flexGrow: 1, backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 16 },
  hint: { color: colors.muted, marginBottom: 12, fontSize: 13 },
  link: { alignItems: 'center', paddingVertical: 18 },
  linkText: { color: colors.muted, fontSize: 15 },
  server: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  serverText: { color: colors.muted, fontSize: 12, flexShrink: 1 },
});
