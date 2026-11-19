import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

export type VictimTabParams = {
  Home: undefined;
  MyRequests: undefined;
  Location: undefined;
  Profile: undefined;
};

export type ResponderTabParams = {
  Incoming: undefined;
  Profile: undefined;
};

export type RootStackParams = {
  Login: undefined;
  Register: undefined;
  VictimTabs: NavigatorScreenParams<VictimTabParams>;
  ResponderTabs: NavigatorScreenParams<ResponderTabParams>;
  Sos: undefined;
  RequestDetails: { id: string; justCreated?: boolean };
  ResponderDetail: { id: string };
  Settings: undefined;
};

export type RootScreen<K extends keyof RootStackParams> = NativeStackScreenProps<RootStackParams, K>;
export type VictimTabScreen<K extends keyof VictimTabParams> = CompositeScreenProps<
  BottomTabScreenProps<VictimTabParams, K>,
  NativeStackScreenProps<RootStackParams>
>;
export type ResponderTabScreen<K extends keyof ResponderTabParams> = CompositeScreenProps<
  BottomTabScreenProps<ResponderTabParams, K>,
  NativeStackScreenProps<RootStackParams>
>;
