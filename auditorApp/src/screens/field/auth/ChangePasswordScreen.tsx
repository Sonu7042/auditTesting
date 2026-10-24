import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Button, Card, ErrorBox, Field, Icon, Screen} from '../../../ui/kit';
import {c} from '../../../ui/theme';
import {useAuth} from '../../../store/AuthContext';

export const passwordRules = (current: string, next: string, repeat: string) => [
  {label: 'At least 8 characters', ok: next.length >= 8},
  {label: 'Contains a letter and a number', ok: /[A-Za-z]/.test(next) && /\d/.test(next)},
  {label: 'Different from the one-time password', ok: !!next && next !== current},
  {label: 'Both new passwords match', ok: !!next && next === repeat},
];

const strength = (p: string) => [p.length >= 8, /[A-Za-z]/.test(p) && /\d/.test(p), /[A-Z]/.test(p) && /[a-z]/.test(p), /[^A-Za-z0-9]/.test(p) || p.length >= 12].filter(Boolean).length;

export function ChangePasswordScreen() {
  const {oneTimePassword, changePassword, logout} = useAuth();
  const [current, setCurrent] = useState(oneTimePassword);
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rules = passwordRules(current, next, repeat);
  const ready = !!current && rules.every(r => r.ok);
  const level = next ? strength(next) : 0;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await changePassword(current, next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      contentStyle={st.content}
      footer={
        <>
          <Button label="Save and continue" onPress={save} disabled={!ready} loading={busy} />
          <Text style={st.signOut} onPress={logout}>
            Sign out
          </Text>
        </>
      }>
      <Text style={st.logo}>bexex</Text>
      <Text style={st.title}>Choose your own password</Text>
      <Text style={st.lead}>Your account started with a one-time password. Set a new one to continue. You only do this once.</Text>
      <Card style={st.card}>
        <Field label="One-time password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
        <View style={{gap: 8}}>
          <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" />
          <View style={st.meter}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={[st.bar, i < level && {backgroundColor: level <= 1 ? c.red : level === 2 ? c.amber : c.green}]} />
            ))}
          </View>
        </View>
        <Field label="Repeat the new password" value={repeat} onChangeText={setRepeat} secureTextEntry autoCapitalize="none" onSubmitEditing={() => ready && save()} />
      </Card>
      <View style={st.rules}>
        {rules.map(r => (
          <View key={r.label} style={st.rule}>
            <View style={[st.dot, r.ok && st.dotOk]}>{r.ok && <Icon name="check" size={12} color={c.green} />}</View>
            <Text style={[st.ruleText, r.ok && {color: c.text}]}>{r.label}</Text>
          </View>
        ))}
      </View>
      {!!error && <ErrorBox message={error} />}
    </Screen>
  );
}

const st = StyleSheet.create({
  content: {padding: 22, paddingTop: 40, gap: 14},
  logo: {fontSize: 26, fontWeight: '800', color: c.text, letterSpacing: -1, marginBottom: 20},
  title: {fontSize: 28, fontWeight: '800', color: c.text, lineHeight: 34},
  lead: {fontSize: 15, color: c.muted, lineHeight: 21},
  card: {gap: 16, borderRadius: 20, padding: 18},
  meter: {flexDirection: 'row', gap: 6},
  bar: {flex: 1, height: 5, borderRadius: 3, backgroundColor: c.line},
  rules: {gap: 10, paddingHorizontal: 4},
  rule: {flexDirection: 'row', alignItems: 'center', gap: 10},
  dot: {width: 20, height: 20, borderRadius: 10, backgroundColor: '#E6E7E3', alignItems: 'center', justifyContent: 'center'},
  dotOk: {backgroundColor: c.greenSoft},
  ruleText: {fontSize: 14, color: c.muted},
  signOut: {textAlign: 'center', color: c.muted, fontSize: 14, paddingVertical: 4},
});
