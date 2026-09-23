import '../global.css';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { store } from '../store/index';

function ThemedRoot() {
  const { colorScheme } = useColorScheme();
  return (
    <View className={colorScheme === 'dark' ? 'dark flex-1' : 'flex-1'}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <ThemedRoot />
      </SafeAreaProvider>
    </Provider>
  );
}
