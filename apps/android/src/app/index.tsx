import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { router, useLocalSearchParams } from 'expo-router';
import { LogOut, Pause, Play, QrCode, Wifi, WifiOff } from 'lucide-react-native';
import type { RootState } from '../store/index';
import { setAddress, setError, setPlaybackEnabled, setStatus } from '../store/connectionSlice';
import { connectToServer, type BridgeAudioConnection } from '../native/BridgeAudioSession';
import { AudioVisualizer } from '../components/AudioVisualizer';
import { PulsingDot } from '../components/PulsingDot';
import { ThemeToggle } from '../components/ThemeToggle';

const LEVEL_POLL_INTERVAL_MS = 150;

export default function StatusScreen() {
  const dispatch = useDispatch();
  const connection = useSelector((state: RootState) => state.connection);
  const params = useLocalSearchParams<{ scannedHost?: string; scannedPort?: string }>();
  const connectionRef = useRef<BridgeAudioConnection | undefined>(undefined);
  const [levels, setLevels] = useState({ playback: 0, mic: 0 });

  const onConnect = async (host: string, port: number): Promise<void> => {
    dispatch(setAddress({ host, port }));
    dispatch(setStatus('connecting'));
    try {
      const bridgeConnection = await connectToServer({ host, port });
      connectionRef.current = bridgeConnection;
      dispatch(setStatus('connected'));

      bridgeConnection.onConnectionLost(() => {
        connectionRef.current = undefined;
        setLevels({ playback: 0, mic: 0 });
        dispatch(setStatus('disconnected'));
      });

      const bridge = bridgeConnection.getAudioBridge();
      if (connection.playbackEnabled) await bridge?.enablePlayback();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch(setError(message));
      console.error('[bridge-audio] connect failed', error);
    }
  };

  const onDisconnect = async (): Promise<void> => {
    await connectionRef.current?.disconnect();
    connectionRef.current = undefined;
    setLevels({ playback: 0, mic: 0 });
    dispatch(setStatus('disconnected'));
  };

  useEffect(() => {
    if (!params.scannedHost || !params.scannedPort) return;
    const port = Number(params.scannedPort);
    router.setParams({ scannedHost: undefined, scannedPort: undefined });
    void onConnect(params.scannedHost, port);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when a fresh scan result arrives
  }, [params.scannedHost, params.scannedPort]);

  useEffect(() => {
    if (connection.status !== 'connected') return;
    const interval = setInterval(() => {
      const bridge = connectionRef.current?.getAudioBridge();
      if (bridge) setLevels(bridge.getLevels());
    }, LEVEL_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [connection.status]);

  const onTogglePlayback = async (): Promise<void> => {
    const value = !connection.playbackEnabled;
    dispatch(setPlaybackEnabled(value));
    const bridge = connectionRef.current?.getAudioBridge();
    if (value) await bridge?.enablePlayback();
    else await bridge?.disablePlayback();
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background px-6 pt-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-surface">
            <Wifi size={22} color="#34D399" />
          </View>
          <View>
            <Text className="text-xl font-semibold text-foreground">BridgeAudio</Text>
            <Text className="text-xs text-muted">Linux ↔ Android audio bridge</Text>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <ThemeToggle />
          {connection.status === 'connected' ? (
            <Pressable
              className="h-10 w-10 items-center justify-center rounded-full border border-offline/40"
              onPress={() => void onDisconnect()}
            >
              <LogOut size={18} color="#FF453A" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {connection.status === 'disconnected' || connection.status === 'error' ? (
        <View className="mt-6 flex-1 items-center justify-center gap-8 pb-6">
          {connection.status === 'error' ? (
            <View className="items-center gap-4">
              <View className="h-24 w-24 items-center justify-center rounded-full bg-surface">
                <WifiOff size={38} color="#FF453A" />
              </View>
              <Text className="text-center text-offline">
                {connection.errorMessage ?? 'Could not connect to the server'}
              </Text>
            </View>
          ) : (
            <View className="items-center gap-4">
              <View className="h-28 w-28 items-center justify-center rounded-full bg-surface">
                <QrCode size={46} color="#34D399" />
              </View>
              <Text className="max-w-[280px] text-center text-muted">
                Open BridgeAudio on your PC and scan the QR code it shows to connect
              </Text>
            </View>
          )}
          <Pressable
            className="w-full flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4 active:opacity-80"
            onPress={() => router.push('/scan')}
          >
            <QrCode size={20} color="#000000" />
            <Text className="text-base font-semibold text-background">Scan QR Code</Text>
          </Pressable>
        </View>
      ) : null}

      {connection.status === 'connecting' ? (
        <View className="mt-6 flex-1 items-center justify-center gap-4 pb-6">
          <ActivityIndicator size="large" color="#34D399" />
          <Text className="text-muted">Connecting to {connection.host}...</Text>
        </View>
      ) : null}

      {connection.status === 'connected' ? (
        <View className="mt-6 flex-1 pb-2">
          <View className="flex-row items-center self-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2">
            <PulsingDot color="#30D158" />
            <Text className="text-sm text-foreground">
              Connected to <Text className="font-semibold">{connection.host}:{connection.port}</Text>
            </Text>
          </View>

          <View className="flex-1 items-center justify-center">
            <AudioVisualizer level={levels.playback} active={connection.playbackEnabled} color="#34D399" height={220} />
            <Text className="mt-6 text-base font-medium text-foreground">
              {connection.playbackEnabled ? 'Playback active' : 'Playback paused'}
            </Text>
            <Text className="text-xs text-muted">PC audio → this device</Text>
          </View>

          <Pressable
            className="w-full flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4 active:opacity-80"
            onPress={() => void onTogglePlayback()}
          >
            {connection.playbackEnabled ? (
              <Pause size={20} color="#000000" />
            ) : (
              <Play size={20} color="#000000" />
            )}
            <Text className="text-base font-semibold text-background">
              {connection.playbackEnabled ? 'Pause' : 'Resume'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
