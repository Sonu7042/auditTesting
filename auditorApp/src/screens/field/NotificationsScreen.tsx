import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {fieldApi} from '../../api/field.api';
import {useNotifications} from '../../store/NotificationContext';
import {AppNotice} from '../../types/field';
import {Chips, Empty, ErrorBox, Icon, Loading, Screen, SectionLabel} from '../../ui/kit';
import {c} from '../../ui/theme';
import {useLoad} from '../../ui/useLoad';
import {fmtDay, fmtTime, sameDay} from '../../utils/field';
import {FieldStackParamList, StackProps} from '../../navigation/fieldTypes';

type Kind = {icon: string; fg: string; bg: string; card: string; action?: string; go?: [keyof FieldStackParamList, any]};

const idFrom = (link?: string | null, segment = 'reports-hub') => {
  const m = new RegExp(`${segment}/([\\w-]+)`).exec(link || '');
  return m?.[1];
};

function kindOf(n: AppNotice): Kind {
  const t = `${n.type} ${n.title}`.toLowerCase();
  const reportId = idFrom(n.link);
  if (t.includes('return') || t.includes('correction')) return {icon: 'flag', fg: c.red, bg: c.redSoft, card: '#FFF7F6', action: 'Open correction tasks', go: reportId ? ['ReportDetail', {reportId}] : ['Tabs', {screen: 'Reports'}]};
  if (n.type === 'CLIENT_NC_CAPA_SUBMITTED' || t.includes('capa')) return {icon: 'file-text', fg: c.amber, bg: c.amberSoft, card: '#FFFAF0', action: 'Verify now', go: ['CapaVerify', {}]};
  if (n.type === 'REPORT_CLARIFICATION') return {icon: 'message-square', fg: c.blue, bg: c.blueSoft, card: '#F6F9FE', action: 'Answer', go: reportId ? ['DealerQuestions', {reportId}] : ['Tabs', {screen: 'Reports'}]};
  if (['AUDIT_SCHEDULED', 'AUDITOR_ASSIGNED', 'AUDIT_RESCHEDULED'].includes(n.type)) return {icon: 'calendar', fg: c.green, bg: c.greenSoft, card: '#F5FAF6', action: 'Open my audits', go: ['Tabs', {screen: 'Audits'}]};
  if (t.includes('card') || t.includes('training') || t.includes('certificate')) return {icon: 'id-card', fg: c.muted, bg: '#ECECE8', card: c.surface, go: ['Profile', undefined]};
  return {icon: 'bell', fg: c.muted, bg: '#ECECE8', card: c.surface};
}

export function NotificationsScreen({navigation}: StackProps<'Notifications'>) {
  const {refresh: refreshBell} = useNotifications();
  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'ACTION'>('ALL');
  const {data, setData, error, loading, refresh, refreshing} = useLoad(() => fieldApi.notifications(), []);

  const list = data || [];
  const unread = list.filter(n => !n.isRead);
  const shown = list.filter(n => (filter === 'UNREAD' ? !n.isRead : filter === 'ACTION' ? !n.isRead && !!kindOf(n).action : true));
  const today = shown.filter(n => sameDay(n.createdAt, new Date()));
  const earlier = shown.filter(n => !sameDay(n.createdAt, new Date()));

  const markAll = async () => {
    setData(list.map(n => ({...n, isRead: true})));
    await fieldApi.markAllRead().catch(() => undefined);
    refreshBell();
  };
  const open = async (n: AppNotice) => {
    const k = kindOf(n);
    if (!n.isRead) {
      setData(list.map(x => (x.id === n.id ? {...x, isRead: true} : x)));
      fieldApi
        .markRead(n.id)
        .then(refreshBell)
        .catch(() => undefined);
    }
    if (k.go) (navigation.navigate as any)(k.go[0], k.go[1]);
  };

  const render = (n: AppNotice) => {
    const k = kindOf(n);
    return (
      <Pressable key={n.id} onPress={() => open(n)} style={({pressed}) => [st.card, {backgroundColor: n.isRead ? c.surface : k.card}, pressed && {opacity: 0.75}]}>
        <View style={[st.icon, {backgroundColor: k.bg}]}>
          <Icon name={k.icon} size={18} color={k.fg} />
        </View>
        <View style={{flex: 1, gap: 3}}>
          <View style={st.titleRow}>
            <Text style={[st.title, n.isRead && {fontWeight: '600'}]} numberOfLines={1}>
              {n.title}
            </Text>
            <Text style={st.time}>{sameDay(n.createdAt, new Date()) ? fmtTime(n.createdAt) : fmtDay(n.createdAt)}</Text>
          </View>
          <Text style={st.message}>{n.message}</Text>
          {!!k.action && !n.isRead && <Text style={[st.action, {color: k.fg}]}>{k.action}</Text>}
        </View>
      </Pressable>
    );
  };

  return (
    <Screen
      title="Notifications"
      onBack={navigation.goBack}
      refreshing={refreshing}
      onRefresh={refresh}
      right={
        unread.length ? (
          <Pressable hitSlop={8} onPress={markAll}>
            <Text style={st.markAll}>Mark all read</Text>
          </Pressable>
        ) : undefined
      }>
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          {key: 'ALL', label: 'All'},
          {key: 'UNREAD', label: `Unread ${unread.length}`},
          {key: 'ACTION', label: 'Needs action'},
        ]}
      />
      {loading && !data && <Loading />}
      {!!error && <ErrorBox message={error} onRetry={refresh} />}
      {data && !shown.length && <Empty title="You are all caught up" icon="bell" />}
      {today.length > 0 && <SectionLabel>Today</SectionLabel>}
      {today.map(render)}
      {earlier.length > 0 && <SectionLabel style={{marginTop: 6}}>Earlier</SectionLabel>}
      {earlier.map(render)}
    </Screen>
  );
}

const st = StyleSheet.create({
  markAll: {color: c.green, fontWeight: '700', fontSize: 14},
  card: {flexDirection: 'row', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: c.line, padding: 14},
  icon: {width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  titleRow: {flexDirection: 'row', justifyContent: 'space-between', gap: 8},
  title: {flex: 1, fontSize: 15, fontWeight: '800', color: c.text},
  time: {fontSize: 12, color: c.muted},
  message: {fontSize: 13.5, color: c.muted, lineHeight: 19},
  action: {fontSize: 13.5, fontWeight: '700', marginTop: 2},
});
