import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';
import { Camera, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseConnectionUri } from '../lib/connectionUri';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const hasScanned = useRef(false);
  const insets = useSafeAreaInsets();

  const onBarcodeScanned = (result: BarcodeScanningResult): void => {
    if (hasScanned.current) return;
    const parsed = parseConnectionUri(result.data);
    if (!parsed) return;

    hasScanned.current = true;
    router.replace({
      pathname: '/',
      params: { scannedHost: parsed.host, scannedPort: String(parsed.port) },
    });
  };

  if (!permission) {
    return <View className="flex-1 bg-background" />;
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-surface">
          <Camera size={28} color="#8E8E93" />
        </View>
        <Text className="text-center text-foreground">
          Camera access is needed to scan the connection QR code shown by the desktop server.
        </Text>
        <Pressable className="rounded-lg bg-primary px-6 py-3" onPress={() => void requestPermission()}>
          <Text className="font-semibold text-background">Grant camera access</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text className="text-muted">Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onBarcodeScanned}
      />
      <View className="absolute inset-0 items-center justify-center">
        <View className="h-64 w-64 rounded-2xl border-2 border-primary/70" />
      </View>
      <View className="absolute inset-x-0 items-center px-6" style={{ top: insets.top + 24 }}>
        <Text className="text-center text-white">Point your camera at the QR code on your PC</Text>
      </View>
      <Pressable
        className="absolute right-5 h-11 w-11 items-center justify-center rounded-full bg-black/50"
        style={{ top: insets.top + 12 }}
        onPress={() => router.back()}
      >
        <X size={22} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}
