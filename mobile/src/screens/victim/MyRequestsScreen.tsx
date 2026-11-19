import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';
import { listRequests, upsertFromServer } from '../../storage/database';
import { api, describeError, isNetworkError } from '../../services/api';
import { Card, Empty, ErrorText, OfflineBanner, Screen } from '../../components/ui';
import RequestCard from '../../components/RequestCard';
import { colors } from '../../theme';
import type { LocalRequest } from '../../types';
import type { VictimTabScreen } from '../../navigation/types';

export default function MyRequestsScreen({ navigation }: VictimTabScreen<'MyRequests'>) {
  const { user } = useAuth();
  const { online, revision } = useSync();
  const [items, setItems] = useState<LocalRequest[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLocal = useCallback(async () => {
    if (user) setItems(await listRequests(user.id));
  }, [user]);

  /** Pull the latest responder status from the server when online. */
  const refresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    setError(null);
    try {
      if (online) await upsertFromServer(user.id, await api.myEmergencies());
    } catch (e) {
      if (!isNetworkError(e)) setError(describeError(e));
    } finally {
      await loadLocal();
      setRefreshing(false);
    }
  }, [user, online, loadLocal]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  useEffect(() => {
    void loadLocal();
  }, [revision, loadLocal]);

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <OfflineBanner />
      <ErrorText>{error}</ErrorText>
      <Text style={{ color: colors.muted, marginBottom: 12 }}>
        {online ? 'Pull down to refresh responder updates.' : 'Showing requests stored on this phone.'}
      </Text>
      {items.length === 0 ? (
        <Card>
          <Empty text="No emergency requests yet." />
        </Card>
      ) : (
        items.map((r) => <RequestCard key={r.id} item={r} onPress={() => navigation.navigate('RequestDetails', { id: r.id })} />)
      )}
    </Screen>
  );
}
