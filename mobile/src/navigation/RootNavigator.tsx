import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { colors } from '../theme';
import type { IconName } from '../components/ui';
import type { ResponderTabParams, RootStackParams, VictimTabParams } from './types';
import SplashScreen from '../screens/auth/SplashScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import HomeScreen from '../screens/victim/HomeScreen';
import SosScreen from '../screens/victim/SosScreen';
import LocationScreen from '../screens/victim/LocationScreen';
import MyRequestsScreen from '../screens/victim/MyRequestsScreen';
import RequestDetailsScreen from '../screens/victim/RequestDetailsScreen';
import ProfileScreen from '../screens/shared/ProfileScreen';
import SettingsScreen from '../screens/shared/SettingsScreen';
import IncomingScreen from '../screens/responder/IncomingScreen';
import ResponderDetailScreen from '../screens/responder/ResponderDetailScreen';

const Stack = createNativeStackNavigator<RootStackParams>();
const VictimTab = createBottomTabNavigator<VictimTabParams>();
const ResponderTab = createBottomTabNavigator<ResponderTabParams>();

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.red } };

const headerStyle = {
  headerStyle: { backgroundColor: colors.navy },
  headerTintColor: colors.white,
  headerTitleStyle: { fontWeight: '700' as const },
};

const tabIcon =
  (name: IconName) =>
  ({ color, size }: { color: string; size: number }) => <Ionicons name={name} size={size} color={color} />;

const tabOptions = {
  ...headerStyle,
  tabBarActiveTintColor: colors.red,
  tabBarInactiveTintColor: colors.muted,
  tabBarLabelStyle: { fontSize: 12, fontWeight: '600' as const },
};

function VictimTabs() {
  const { counts } = useSync();
  return (
    <VictimTab.Navigator screenOptions={tabOptions}>
      <VictimTab.Screen name="Home" component={HomeScreen} options={{ headerShown: false, tabBarIcon: tabIcon('home') }} />
      <VictimTab.Screen
        name="MyRequests"
        component={MyRequestsScreen}
        options={{ title: 'My Requests', tabBarIcon: tabIcon('list'), tabBarBadge: counts.unsent || undefined }}
      />
      <VictimTab.Screen name="Location" component={LocationScreen} options={{ title: 'My Location', tabBarIcon: tabIcon('location') }} />
      <VictimTab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: tabIcon('person-circle') }} />
    </VictimTab.Navigator>
  );
}

function ResponderTabs() {
  return (
    <ResponderTab.Navigator screenOptions={tabOptions}>
      <ResponderTab.Screen name="Incoming" component={IncomingScreen} options={{ headerShown: false, title: 'Emergencies', tabBarIcon: tabIcon('alert-circle') }} />
      <ResponderTab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: tabIcon('person-circle') }} />
    </ResponderTab.Navigator>
  );
}

export default function RootNavigator() {
  const { user, restoring } = useAuth();
  if (restoring) return <SplashScreen />;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={headerStyle}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create account' }} />
          </>
        ) : user.role === 'VICTIM' ? (
          <>
            <Stack.Screen name="VictimTabs" component={VictimTabs} options={{ headerShown: false }} />
            <Stack.Screen name="Sos" component={SosScreen} options={{ title: 'Emergency SOS', headerStyle: { backgroundColor: colors.red } }} />
            <Stack.Screen name="RequestDetails" component={RequestDetailsScreen} options={{ title: 'Request status' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="ResponderTabs" component={ResponderTabs} options={{ headerShown: false }} />
            <Stack.Screen name="ResponderDetail" component={ResponderDetailScreen} options={{ title: 'Emergency details' }} />
          </>
        )}
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
