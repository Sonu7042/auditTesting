import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../../theme';
export const LoadingState = ({ label = 'Loading...' }: { label?: string }) => (
  <View style={s.center}>
    <ActivityIndicator color={colors.primary} />
    <Text style={s.muted}>{label}</Text>
  </View>
);
export const EmptyState = ({ message }: { message: string }) => (
  <View style={s.card}>
    <Text style={s.muted}>{message}</Text>
  </View>
);
export const ErrorState = ({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) => (
  <View style={[s.card, s.error]}>
    <Text style={{ color: colors.danger }}>{message}</Text>
    {retry && (
      <Pressable onPress={retry}>
        <Text style={s.retry}>Retry</Text>
      </Pressable>
    )}
  </View>
);
const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16 },
  muted: { color: colors.muted },
  error: { borderWidth: 1, borderColor: '#FECACA' },
  retry: { color: colors.primary, fontWeight: '700', marginTop: 12 },
});
