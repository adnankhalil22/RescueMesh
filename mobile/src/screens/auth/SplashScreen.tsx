import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../../theme';

export default function SplashScreen() {
  return (
    <View style={st.root} accessibilityLabel="RescueMesh is starting">
      <StatusBar style="light" />
      <View style={st.ring}>
        <View style={st.logo}>
          <Text style={st.plus}>+</Text>
        </View>
      </View>
      <Text style={st.title}>RescueMesh</Text>
      <Text style={st.subtitle}>Intelligent Disaster Emergency{'\n'}Communication Network</Text>
      <ActivityIndicator color={colors.white} style={{ marginTop: 36 }} />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', padding: 24 },
  ring: { width: 132, height: 132, borderRadius: 66, borderWidth: 10, borderColor: 'rgba(220,38,38,0.25)', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 92, height: 92, borderRadius: 24, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  plus: { color: colors.white, fontSize: 64, fontWeight: '900', lineHeight: 70 },
  title: { color: colors.white, fontSize: 32, fontWeight: '800', marginTop: 24, letterSpacing: 0.5 },
  subtitle: { color: '#94a3b8', fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 22 },
});
