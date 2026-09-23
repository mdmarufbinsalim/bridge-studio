import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';

const BAR_COUNT = 17;
const ANIMATION_MS = 120;

/**
 * A live equalizer: bar heights are derived from the current audio level plus a fixed per-bar
 * randomized multiplier (so bars move at different rates instead of snapping in lockstep) and a
 * center boost so the shape reads as a waveform rather than a flat block.
 */
export function AudioVisualizer({
  level,
  active,
  color = '#34D399',
  height = 200,
}: {
  level: number;
  active: boolean;
  color?: string;
  height?: number;
}) {
  const minHeight = Math.max(4, height * 0.03);
  const [bars] = useState(() => Array.from({ length: BAR_COUNT }, () => new Animated.Value(minHeight)));
  const [multipliers] = useState(() => Array.from({ length: BAR_COUNT }, () => 0.55 + Math.random() * 0.9));

  useEffect(() => {
    const animations = bars.map((bar, i) => {
      const distanceFromCenter = Math.abs(i - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
      const centerBoost = 1 - distanceFromCenter * 0.45;
      const raw = active ? minHeight + level * multipliers[i] * centerBoost * (height - minHeight) : minHeight;
      const target = Math.max(minHeight, Math.min(height, raw));
      return Animated.timing(bar, { toValue: target, duration: ANIMATION_MS, useNativeDriver: false });
    });
    Animated.parallel(animations).start();
  }, [level, active, bars, multipliers, height, minHeight]);

  return (
    <View className="flex-row items-center justify-center gap-2" style={{ height }}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={{
            width: 6,
            height: bar,
            borderRadius: 3,
            backgroundColor: color,
            opacity: active ? 1 : 0.25,
          }}
        />
      ))}
    </View>
  );
}
