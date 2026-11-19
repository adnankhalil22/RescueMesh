import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';
import { describeFixAge, getFix, type Fix } from '../../services/location';
import { queueLocationUpdate } from '../../services/sos';
import { listRequests } from '../../storage/database';
import { TYPE_LABEL } from '../../constants';
import { Button, Card, ErrorText, OfflineBanner, Row, Screen, SectionTitle } from '../../components/ui';
import { colors } from '../../theme';
import type { LocalRequest } from '../../types';

export default function LocationScreen() {
  const { user } = useAuth();
  const { online, bump } = useSync();
  const [fix, setFix] = useState<Fix | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState<LocalRequest | null>(null);

  const locate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setFix(await getFix());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get location');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void locate();
    if (user) {
      listRequests(user.id)
        .then((rs) => setActive(rs.find((r) => !['RESOLVED', 'CANCELLED'].includes(r.status)) ?? null))
        .catch(() => setActive(null));
    }
  }, [locate, user]);

  const mapsUrl = fix ? `https://www.openstreetmap.org/?mlat=${fix.latitude}&mlon=${fix.longitude}#map=17/${fix.latitude}/${fix.longitude}` : '';

  const share = async () => {
    if (!fix) return;
    await Share.share({
      message: `RescueMesh — I need help. My location: ${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)}${
        fix.accuracy ? ` (±${Math.round(fix.accuracy)} m)` : ''
      } ${mapsUrl}`,
    });
  };

  const openMaps = () => {
    if (!fix) return;
    const url = Platform.OS === 'ios' ? `maps:?q=${fix.latitude},${fix.longitude}` : `geo:${fix.latitude},${fix.longitude}?q=${fix.latitude},${fix.longitude}(My location)`;
    Linking.openURL(url).catch(() => Linking.openURL(mapsUrl));
  };

  const sendToResponders = async () => {
    if (!fix || !user || !active) return;
    await queueLocationUpdate(user, active.id, fix, online);
    bump();
    setNotice(online ? 'Location update sent to responders.' : 'Location update saved — it will be sent when you are online.');
  };

  return (
    <Screen>
      <OfflineBanner />
      <ErrorText>{error}</ErrorText>
      <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
        <Ionicons name="navigate-circle" size={56} color={fix ? colors.green : colors.muted} />
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 8 }} selectable>
          {fix ? `${fix.latitude.toFixed(5)}, ${fix.longitude.toFixed(5)}` : busy ? 'Locating…' : 'No position'}
        </Text>
        <Text style={{ color: colors.muted, marginTop: 4 }}>GPS works without mobile data or Wi-Fi</Text>
      </Card>

      {fix && (
        <Card>
          <Row label="Accuracy" value={fix.accuracy ? `± ${Math.round(fix.accuracy)} m` : 'Unknown'} icon="locate" />
          <Row label="Fix time" value={new Date(fix.timestamp).toLocaleTimeString()} icon="time" />
          <Row label="Source" value={describeFixAge(fix)} icon="compass" />
        </Card>
      )}

      <View style={{ gap: 10 }}>
        <Button title="Refresh location" icon="refresh" variant="ghost" onPress={locate} loading={busy} />
        <Button title="Share my location" icon="share-social" onPress={share} disabled={!fix} />
        <Button title="Open in maps" icon="map" variant="ghost" onPress={openMaps} disabled={!fix} />
      </View>

      <SectionTitle>Update responders</SectionTitle>
      <Card>
        {active ? (
          <>
            <Text style={{ color: colors.text, marginBottom: 10 }}>
              Send your current position to responders handling your <Text style={{ fontWeight: '700' }}>{TYPE_LABEL[active.type]}</Text> request.
            </Text>
            <Button title="Send location update" icon="send" variant="danger" onPress={sendToResponders} disabled={!fix} />
            {notice && <Text style={{ color: colors.green, marginTop: 10 }}>{notice}</Text>}
          </>
        ) : (
          <Text style={{ color: colors.muted }}>You have no active emergency request. Use SOS to request help.</Text>
        )}
      </Card>
    </Screen>
  );
}
