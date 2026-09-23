import { Pressable } from 'react-native';
import { useColorScheme } from 'nativewind';
import { Moon, Sun } from 'lucide-react-native';

export function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <Pressable
      className="h-10 w-10 items-center justify-center rounded-full bg-surface"
      onPress={toggleColorScheme}
    >
      {isDark ? <Sun size={18} color="#EBEBF0" /> : <Moon size={18} color="#18181B" />}
    </Pressable>
  );
}
