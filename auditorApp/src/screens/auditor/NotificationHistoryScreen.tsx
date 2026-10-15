import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '../../components/common/AppIcon';
import { notificationApi } from '../../api/notification.api';
import { AuditorHeader } from '../../components/common/AuditorHeader';
import { AuditorStackParamList } from '../../navigation/navigationTypes';
import { useNotifications } from '../../store/NotificationContext';
import { useAppTheme } from '../../store/ThemeContext';
import { AppNotification } from '../../types/domain';

const format = (value: string) =>
  new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
export function NotificationHistoryScreen({
  navigation,
}: NativeStackScreenProps<AuditorStackParamList, 'Notifications'>) {
  const { isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const tablet = width >= 768;
  const [data, setData] = useState<AppNotification[]>([]),
    [busy, setBusy] = useState(true);
  const { refresh: refreshUnread } = useNotifications();
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await notificationApi.history();
      setData(result?.data || result?.data?.data || []);
    } catch (e) {
      Alert.alert('Unable to load notifications', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    load();
    refreshUnread();
  }, [load, refreshUnread]);
  const open = async (item: AppNotification) => {
    if (!item.isRead) {
      await notificationApi.read(item.id);
      setData(current =>
        current.map(value =>
          value.id === item.id ? { ...value, isRead: true } : value,
        ),
      );
      refreshUnread();
    }
  };
  const remove = async (id: string) => {
    const previous = data;
    setData(current => current.filter(item => item.id !== id));
    try {
      await notificationApi.remove(id);
      refreshUnread();
    } catch {
      setData(previous);
    }
  };
  return (
    <View style={[s.screen, isDark && s.screenDark]}>
      <AuditorHeader navigation={navigation} />
      <View style={[s.inner, tablet && s.innerTablet]}>
        <View style={s.header}>
          <Text style={[s.title, tablet && s.titleTablet, isDark && s.textDark]}>Notifications</Text>
          <Pressable disabled={busy} onPress={load} style={s.refresh}>
            <Feather name="refresh-cw" size={13} color={isDark ? '#9CA3AF' : '#555'} />
            <Text style={[s.refreshText, isDark && s.mutedDark]}>
              {busy ? 'Refreshing' : 'Refresh Notifications'}
            </Text>
          </Pressable>
        </View>
        {busy && !data.length ? (
          <ActivityIndicator style={s.loader} color="#5646EF" />
        ) : (
          <FlatList
            key={tablet ? 'grid' : 'list'}
            style={s.flex}
            data={data}
            numColumns={tablet ? 2 : 1}
            columnWrapperStyle={tablet ? s.row : undefined}
            refreshing={busy}
            onRefresh={load}
            keyExtractor={item => item.id}
            contentContainerStyle={s.list}
            ListEmptyComponent={
              <Text style={[s.empty, isDark && s.mutedDark]}>No notifications available</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => open(item)}
                style={[s.card, tablet && s.cardTablet, isDark && s.cardDark, !item.isRead && (isDark ? s.unreadDark : s.unread)]}
              >
                <View style={s.icon}>
                  <Feather name="bell" size={23} color="white" />
                </View>
                <View style={s.flex}>
                  <Text numberOfLines={1} style={[s.name, isDark && s.textDark]}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={2} style={[s.message, isDark && s.mutedDark]}>
                    {item.message}
                  </Text>
                  <Text style={[s.time, isDark && s.mutedDark]}>{format(item.createdAt)}</Text>
                </View>
                <Pressable hitSlop={10} onPress={() => remove(item.id)}>
                  <Feather name="x" size={18} color={isDark ? '#9CA3AF' : '#777'} />
                </Pressable>
              </Pressable>
            )}
          />
        )}
        <View style={s.footer}>
          <Text style={s.footerTitle}>Audit Smartly</Text>
          <Text style={[s.footerText, isDark && s.mutedDark]}>
            Keep your sites compliant and inspections on track
          </Text>
        </View>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F1F1F1' },
  screenDark: { backgroundColor: '#111827' },
  textDark: { color: '#F8FAFC' },
  mutedDark: { color: '#9CA3AF' },
  cardDark: { backgroundColor: '#1F2937' },
  unreadDark: { backgroundColor: '#26344A' },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  innerTablet: { maxWidth: 980, paddingHorizontal: 32 },
  header: {
    paddingTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 21, fontWeight: '700', color: '#161616' },
  titleTablet: { fontSize: 26 },
  row: { gap: 15 },
  refresh: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  refreshText: { fontSize: 11, textDecorationLine: 'underline', color: '#555' },
  loader: { marginTop: 60 },
  list: { paddingTop: 27, paddingBottom: 20, gap: 15 },
  card: {
    minHeight: 82,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    elevation: 4,
  },
  cardTablet: { flex: 1, maxWidth: '48.5%' },
  unread: { backgroundColor: '#E9EDFF' },
  icon: {
    width: 50,
    height: 50,
    borderRadius: 9,
    backgroundColor: '#5646EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#1E1E1E' },
  message: { fontSize: 13, color: '#3F3F46', marginTop: 3 },
  time: { fontSize: 11, color: '#888', marginTop: 4 },
  empty: { textAlign: 'center', color: '#687386', paddingTop: 80 },
  footer: { alignItems: 'center', paddingVertical: 24 },
  footerTitle: { fontWeight: '800', color: '#4F46E5' },
  footerText: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
    textAlign: 'center',
  },
});
