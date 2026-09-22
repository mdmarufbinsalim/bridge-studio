import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { store } from '../store/index.js';

export default function RootLayout() {
  return (
    <Provider store={store}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </Provider>
  );
}
