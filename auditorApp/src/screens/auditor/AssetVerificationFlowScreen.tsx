import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuditorStackParamList } from '../../navigation/navigationTypes';
import { AssetVerificationScreen } from './AssetVerificationScreen';
import { AssetNonComplianceScreen } from './AssetNonComplianceScreen';
import { AssetNonComplianceListScreen } from './AssetNCListWebScreen';
import { useAppTheme } from '../../store/ThemeContext';
type P = NativeStackScreenProps<AuditorStackParamList, 'AssetVerification'>;
export function AssetVerificationFlowScreen(props: P) {
  const { isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tablet = width >= 768;
  const [mode, setMode] = useState<'main' | 'create' | 'list'>('main'),
    params = props.route.params;
  if (mode === 'create')
    return (
      <AssetNonComplianceScreen
        navigation={
          { ...props.navigation, goBack: () => setMode('main') } as any
        }
        route={{ ...props.route, name: 'AssetNonCompliance', params } as any}
      />
    );
  if (mode === 'list')
    return (
      <AssetNonComplianceListScreen
        navigation={
          { ...props.navigation, goBack: () => setMode('main') } as any
        }
        route={
          { ...props.route, name: 'AssetNonComplianceList', params } as any
        }
      />
    );
  return (
    <View style={[s.screen, isDark && s.screenDark]}>
      <AssetVerificationScreen {...props} />
      <View style={[s.bar, tablet && s.barTablet, isDark && s.barDark, {bottom: insets.bottom + 8}]}>
        <Pressable onPress={() => setMode('create')} style={s.create}>
          <Text style={s.white}>Create non-conformity</Text>
        </Pressable>
        <Pressable onPress={() => setMode('list')} style={[s.list, isDark && s.listDark]}>
          <Text style={[s.gray, isDark && s.white]}>See non-conformities</Text>
        </Pressable>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1 },
  screenDark: { backgroundColor: '#111827' },
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 8,
    padding: 8,
    backgroundColor: 'white',
    borderRadius: 13,
    elevation: 10,
    flexDirection: 'row',
    gap: 9,
  },
  barTablet: {
    maxWidth: 620,
    width: '100%',
    alignSelf: 'center',
    padding: 10,
  },
  barDark: { backgroundColor: '#1F2937' },
  listDark: { borderColor: '#374151' },
  create: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#00875A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CECECE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  white: { color: 'white', fontSize: 12, fontWeight: '700' },
  gray: { color: '#586171', fontSize: 12, fontWeight: '700' },
});
