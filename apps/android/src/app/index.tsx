import { useRef, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../store/index.js';
import {
  setAddress,
  setMicrophoneEnabled,
  setPlaybackEnabled,
  setStatus,
} from '../store/connectionSlice.js';
import { connectToServer, type BridgeAudioConnection } from '../native/BridgeAudioSession.js';

export default function StatusScreen() {
  const dispatch = useDispatch();
  const connection = useSelector((state: RootState) => state.connection);
  const [hostInput, setHostInput] = useState(connection.host);
  const [portInput, setPortInput] = useState(String(connection.port));
  const connectionRef = useRef<BridgeAudioConnection | undefined>(undefined);

  const statusColor =
    connection.status === 'connected'
      ? 'bg-online'
      : connection.status === 'error'
        ? 'bg-offline'
        : 'bg-muted';

  const onConnect = async (): Promise<void> => {
    const port = Number(portInput);
    dispatch(setAddress({ host: hostInput, port }));
    dispatch(setStatus('connecting'));
    try {
      const bridgeConnection = await connectToServer({ host: hostInput, port });
      connectionRef.current = bridgeConnection;
      dispatch(setStatus('connected'));

      const bridge = bridgeConnection.getAudioBridge();
      if (connection.playbackEnabled) await bridge?.enablePlayback();
      if (connection.microphoneEnabled) await bridge?.enableMicrophone();
    } catch (error) {
      dispatch(setStatus('error'));
      console.error('[bridge-audio] connect failed', error);
    }
  };

  const onTogglePlayback = async (value: boolean): Promise<void> => {
    dispatch(setPlaybackEnabled(value));
    const bridge = connectionRef.current?.getAudioBridge();
    if (value) await bridge?.enablePlayback();
    else await bridge?.disablePlayback();
  };

  const onToggleMicrophone = async (value: boolean): Promise<void> => {
    dispatch(setMicrophoneEnabled(value));
    const bridge = connectionRef.current?.getAudioBridge();
    if (value) await bridge?.enableMicrophone();
    else await bridge?.disableMicrophone();
  };

  return (
    <View className="flex-1 bg-background px-6 pt-20">
      <Text className="text-2xl font-semibold text-foreground">BridgeAudio</Text>
      <Text className="mt-1 text-muted">Linux ↔ Android audio bridge</Text>

      <View className="mt-8 flex-row items-center gap-2">
        <View className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
        <Text className="text-foreground">{connection.status}</Text>
        {connection.errorMessage ? (
          <Text className="text-offline">{connection.errorMessage}</Text>
        ) : null}
      </View>

      <View className="mt-8 gap-3">
        <TextInput
          className="rounded-lg border border-border bg-surface px-4 py-3 text-foreground"
          placeholder="Server IP (e.g. 192.168.1.10)"
          placeholderTextColor="#8E8E93"
          value={hostInput}
          onChangeText={setHostInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          className="rounded-lg border border-border bg-surface px-4 py-3 text-foreground"
          placeholder="Port"
          placeholderTextColor="#8E8E93"
          value={portInput}
          onChangeText={setPortInput}
          keyboardType="number-pad"
        />
        <Pressable
          className="items-center rounded-lg bg-primary py-3"
          onPress={() => void onConnect()}
        >
          <Text className="font-semibold text-background">Connect</Text>
        </Pressable>
      </View>

      <View className="mt-8 gap-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-foreground">Playback (PC → earbuds)</Text>
          <Switch
            value={connection.playbackEnabled}
            onValueChange={(value) => void onTogglePlayback(value)}
          />
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-foreground">Microphone (earbuds → PC)</Text>
          <Switch
            value={connection.microphoneEnabled}
            onValueChange={(value) => void onToggleMicrophone(value)}
          />
        </View>
      </View>
    </View>
  );
}
