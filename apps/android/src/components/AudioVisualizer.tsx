import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

const BAR_COUNT = 9;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 44;
const ANIMATION_MS = 120;

/**
 * A small live equalizer: BAR_COUNT bars whose target heights are derived
 * from the current audio level plus a fixed per-bar randomized multiplier
 * (so bars move at different rates instead of all snapping in lockstep,
 * reading as organic rather than mechanical) and a center boost so the
 * shape reads as a waveform rather than a flat block.
 */
export function AudioVisualizer({
  level,
  active,
  color = '#34D399',
}: {
  level: number;
  active: boolean;
  color?: string;
}) {
  const bars = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(MIN_HEIGHT))).current;
  const multipliers = useRef(Array.from({ length: BAR_COUNT }, () => 0.55 + Math.random() * 0.9)).current;

  useEffect(() => {
    const animations = bars.map((bar, i) => {
      const distanceFromCenter = Math.abs(i - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
      const centerBoost = 1 - distanceFromCenter * 0.45;
      const raw = active ? MIN_HEIGHT + level * multipliers[i] * centerBoost * (MAX_HEIGHT - MIN_HEIGHT) : MIN_HEIGHT;
      const target = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, raw));
      return Animated.timing(bar, {
        toValue: target,
        duration: ANIMATION_MS,
        useNativeDriver: false,
      });
    });
    Animated.parallel(animations).start();
  }, [level, active, bars, multipliers]);

  return (
    <View className="flex-row items-center justify-center gap-1.5" style={{ height: MAX_HEIGHT }}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={{
            width: 4,
            height: bar,
            borderRadius: 2,
            backgroundColor: color,
            opacity: active ? 1 : 0.3,
          }}
        />
      ))}
    </View>
  );
}
