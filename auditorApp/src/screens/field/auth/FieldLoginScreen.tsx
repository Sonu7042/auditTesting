import React, {useState} from 'react';
import {Alert, Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import {Button, Card, ErrorBox, Field, Screen, Toggle} from '../../../ui/kit';
import {c, mono} from '../../../ui/theme';
import {useAuth} from '../../../store/AuthContext';

const VERSION = require('../../../../package.json').version as string;
export const SUPPORT_EMAIL = 'support@bexex.com';

const CONDITIONS =
  'This app is for authorised Bexex field auditors only.\n\n' +
  '• Audit data, photos and reports are confidential and belong to the client.\n' +
  '• Do not share your login, PIN or screenshots of client data.\n' +
  '• Evidence must be captured on site with the in-app camera.\n' +
  '• Your location is recorded at check-in and while you audit.';

export function FieldLoginScreen() {
  const {login} = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!username.trim() || !password) return setError('Enter your username (or email) and password.');
    if (!accepted) return setError('Accept the conditions to continue.');
    setBusy(true);
    try {
      await login(username, password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={st.content}>
      <View style={st.brand}>
        <Text style={st.logo}>bexex</Text>
        <Text style={st.app}>AUDITOR APP</Text>
        <Text style={st.lead}>Sign in to see your audits, training and reports.</Text>
      </View>
      <Card style={st.card}>
        <Field label="Username or email" value={username} onChangeText={setUsername} autoCapitalize="characters" autoCorrect={false} inputStyle={st.monoInput} returnKeyType="next" />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={submit}
          right={
            <Pressable hitSlop={8} onPress={() => setShow(v => !v)} style={st.show}>
              <Text style={st.link}>{show ? 'Hide' : 'Show'}</Text>
            </Pressable>
          }
        />
        <View style={st.accept}>
          <Toggle value={accepted} onChange={setAccepted} />
          <Text style={st.acceptText}>
            I have read and accept the{' '}
            <Text style={st.linkU} onPress={() => Alert.alert('Conditions', CONDITIONS)}>
              conditions
            </Text>
            . The information in this app is confidential.
          </Text>
        </View>
        {!!error && <ErrorBox message={error} />}
        <Button label="Log in" onPress={submit} loading={busy} />
      </Card>
      <View style={st.note}>
        <Text style={st.noteText}>First login? Use the one-time password you were sent. You will choose your own password next.</Text>
      </View>
      <View style={st.foot}>
        <Text style={st.linkU} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
          Contact support
        </Text>
        <Text style={st.version}>v {VERSION}</Text>
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  content: {padding: 22, paddingTop: 60, flexGrow: 1, gap: 16},
  brand: {marginBottom: 8},
  logo: {fontSize: 46, fontWeight: '800', color: c.text, letterSpacing: -2},
  app: {fontFamily: mono, fontSize: 12, letterSpacing: 2.5, color: c.muted, marginTop: 4},
  lead: {fontSize: 15.5, color: c.muted, marginTop: 14, lineHeight: 22},
  card: {gap: 16, padding: 18, borderRadius: 20},
  monoInput: {fontFamily: mono, letterSpacing: 0.5},
  show: {paddingHorizontal: 13},
  link: {color: c.green, fontWeight: '700', fontSize: 14},
  linkU: {color: c.green, fontWeight: '700', textDecorationLine: 'underline'},
  accept: {flexDirection: 'row', gap: 10, alignItems: 'flex-start'},
  acceptText: {flex: 1, fontSize: 14, color: c.text, lineHeight: 20},
  note: {backgroundColor: c.blueSoft, borderRadius: 14, padding: 14},
  noteText: {fontSize: 13.5, color: c.blue, lineHeight: 19},
  foot: {flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 30},
  version: {fontFamily: mono, fontSize: 12, color: c.muted},
});
