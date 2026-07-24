import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/hooks';

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** The app's one segmented control: outlined chips, accent fill when selected. */
export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const colors = useThemeColors();
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              { borderColor: selected ? colors.accent : colors.border },
              selected && { backgroundColor: colors.accent },
            ]}
          >
            <Text style={[styles.label, { color: selected ? colors.surface : colors.text }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  segment: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  label: { fontSize: 14 },
});
