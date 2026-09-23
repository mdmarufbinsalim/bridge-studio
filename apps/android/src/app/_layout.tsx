import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { useColorScheme } from 'nativewind';
import { store } from '../store/index';

function ThemedStatusBar() {
  const { colorScheme } = useColorScheme();
  return <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <Provider store={store}>
      <ThemedStatusBar />
      <Stack screenOptions={{ headerShown: false }} />
    </Provider>
  );
}
