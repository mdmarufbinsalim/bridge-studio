import { PermissionsAndroid } from 'react-native';

/**
 * Foreground-service audio (and Bluetooth SCO routing) requires these to be
 * runtime-granted, not just declared in the manifest — declaring them alone
 * still throws a SecurityException when the native module tries to start.
 */
export async function requestMicrophonePermissions(): Promise<void> {
  const results = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);

  const recordAudioGranted = results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
  if (!recordAudioGranted) {
    throw new Error('Microphone permission was not granted');
  }
}
