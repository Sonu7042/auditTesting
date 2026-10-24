import React from 'react';
import {Alert, Linking, StyleSheet, Text, View} from 'react-native';
import {useAuth} from '../../store/AuthContext';
import {useNotifications} from '../../store/NotificationContext';
import {useOutbox} from '../../store/OutboxContext';
import {Badge, Card, Icon, PageTitle, Row, Screen} from '../../ui/kit';
import {c, mono} from '../../ui/theme';
import {TabProps} from '../../navigation/fieldTypes';
import {SUPPORT_EMAIL} from './auth/FieldLoginScreen';

const VERSION = require('../../../package.json').version as string;

export function MoreScreen({navigation}: TabProps<'More'>) {
  const {user, logout} = useAuth();
  const {unreadCount} = useNotifications();
  const {items, online} = useOutbox();
  const initials = (user?.fullName || '?')
    .split(' ')
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const icon = (name: string) => (
    <View style={st.icon}>
      <Icon name={name} size={19} color={c.green} />
    </View>
  );

  const signOut = () =>
    Alert.alert('Sign out', items.length ? `${items.length} answer(s) have not uploaded yet. They stay on this tablet and upload after you sign in again.` : 'You will need your password and PIN to sign in again.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Sign out', style: 'destructive', onPress: logout},
    ]);

  return (
    <Screen>
      <PageTitle title="More" />
      <Card onPress={() => navigation.navigate('Profile')} style={st.me}>
        <View style={st.avatar}>
          <Text style={st.avatarText}>{initials}</Text>
        </View>
        <View style={{flex: 1}}>
          <Text style={st.name}>{user?.fullName}</Text>
          <Text style={st.code}>{user?.username}</Text>
        </View>
        <Icon name="chevron-right" size={18} color={c.muted} />
      </Card>
      <Card style={st.list}>
        <Row left={icon('id-card')} title="Profile and ID card" sub="Your card, authority letter and details" onPress={() => navigation.navigate('Profile')} />
        <Row left={icon('graduation-cap')} title="Training and certificate" sub="Video, quiz, demo checklist and refresher" onPress={() => navigation.navigate('Training')} />
        <Row left={icon('bell')} title="Notifications" right={unreadCount ? <Badge label={`${unreadCount} new`} tone="red" /> : undefined} onPress={() => navigation.navigate('Notifications')} />
        <Row
          left={icon(online ? 'wifi' : 'cloud-off')}
          title="Offline and sync"
          sub={online ? 'Online' : 'Offline, saving on this tablet'}
          right={items.length ? <Badge label={`${items.length} waiting`} tone="amber" /> : undefined}
          onPress={() => navigation.navigate('OfflineSync')}
          last
        />
      </Card>
      <Card style={st.list}>
        <Row left={icon('folder-open')} title="Project audits" sub="Earlier project-based audits and reports" onPress={() => navigation.navigate('Legacy')} />
        <Row left={icon('mail')} title="Contact support" sub={SUPPORT_EMAIL} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
        <Row left={<View style={[st.icon, {backgroundColor: c.redSoft}]}><Icon name="log-out" size={19} color={c.red} /></View>} title="Sign out" onPress={signOut} last />
      </Card>
      <Text style={st.version}>Bexex Auditor App · v {VERSION}</Text>
    </Screen>
  );
}

const st = StyleSheet.create({
  me: {flexDirection: 'row', alignItems: 'center', gap: 14},
  avatar: {width: 50, height: 50, borderRadius: 14, backgroundColor: c.greenSoft, alignItems: 'center', justifyContent: 'center'},
  avatarText: {fontSize: 18, fontWeight: '800', color: c.green},
  name: {fontSize: 17, fontWeight: '700', color: c.text},
  code: {fontFamily: mono, fontSize: 12.5, color: c.green, marginTop: 2},
  list: {paddingVertical: 2},
  icon: {width: 36, height: 36, borderRadius: 10, backgroundColor: c.greenSoft, alignItems: 'center', justifyContent: 'center'},
  version: {textAlign: 'center', fontFamily: mono, fontSize: 12, color: c.faint, marginTop: 6},
});
