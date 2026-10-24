import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, Vibration, View} from 'react-native';
import {Icon, Screen} from '../../../ui/kit';
import {c, mono} from '../../../ui/theme';
import {PIN_TRIES, useAuth} from '../../../store/AuthContext';

const weak = (pin: string) => {
  if (/^(\d)\1{3}$/.test(pin)) return true;
  const d = pin.split('').map(Number);
  const up = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const down = d.every((x, i) => i === 0 || x === d[i - 1] - 1);
  return up || down;
};

export function PinScreen() {
  const {hasPin, completePin, logout, user} = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [first, setFirst] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (pin.length !== 4) return;
    const run = async () => {
      if (hasPin) {
        const ok = await completePin(pin);
        if (!ok) {
          Vibration.vibrate(80);
          const used = tries + 1;
          setTries(used);
          setError(`Wrong PIN. ${Math.max(0, PIN_TRIES - used)} tries left before you are signed out.`);
          setPin('');
        }
        return;
      }
      if (step === 1) {
        if (weak(pin)) {
          setError('That PIN is too easy to guess. Avoid 1234 and repeated digits.');
          setPin('');
          return;
        }
        setFirst(pin);
        setPin('');
        setError('');
        setStep(2);
        return;
      }
      if (pin !== first) {
        Vibration.vibrate(80);
        setError('The PINs do not match. Choose the PIN again.');
        setPin('');
        setFirst('');
        setStep(1);
        return;
      }
      await completePin(pin);
    };
    const t = setTimeout(run, 120);
    return () => clearTimeout(t);
  }, [pin, hasPin, step, first, completePin, tries]);

  const press = (k: string) => {
    setError(e => (pin.length === 0 ? e : ''));
    setPin(p => (k === 'del' ? p.slice(0, -1) : p.length < 4 ? p + k : p));
  };

  const title = hasPin ? 'Enter your PIN' : step === 1 ? 'Choose a 4-digit PIN' : 'Repeat your PIN';
  const lead = hasPin
    ? `Welcome back${user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}. Unlock the app with the PIN you set on this tablet.`
    : step === 1
    ? 'The PIN unlocks the app on this tablet. It stays on this device and is never sent to the server.'
    : 'Enter the same PIN again to confirm it.';

  return (
    <Screen scroll={false} contentStyle={st.content}>
      <View style={st.top}>
        <Text style={st.logo}>bexex</Text>
        {!hasPin && <Text style={st.step}>Step {step} of 2</Text>}
      </View>
      <Text style={st.title}>{title}</Text>
      <Text style={st.lead}>{lead}</Text>
      <View style={st.dots}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={[st.dot, i < pin.length && st.dotOn]} />
        ))}
      </View>
      <Text style={[st.hint, !!error && {color: c.red}]}>{error || (hasPin ? ' ' : 'Avoid 1234 and repeated digits.')}</Text>
      <View style={st.pad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) =>
          k === '' ? (
            <View key={i} style={st.keyGap} />
          ) : (
            <Pressable key={i} accessibilityLabel={k === 'del' ? 'Delete' : k} onPress={() => press(k)} style={({pressed}) => [st.key, k === 'del' && st.keyDel, pressed && {backgroundColor: c.greenSoft}]}>
              {k === 'del' ? <Icon name="delete" size={24} color={c.text} /> : <Text style={st.keyText}>{k}</Text>}
            </Pressable>
          ),
        )}
      </View>
      <View style={st.foot}>
        <Text style={st.footText}>
          Not you?{' '}
          <Text style={st.link} onPress={logout}>
            Sign in with another account
          </Text>
        </Text>
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  content: {flex: 1, padding: 22, paddingTop: 36},
  top: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 34},
  logo: {fontSize: 26, fontWeight: '800', color: c.text, letterSpacing: -1},
  step: {fontFamily: mono, fontSize: 13, color: c.muted},
  title: {fontSize: 28, fontWeight: '800', color: c.text},
  lead: {fontSize: 15, color: c.muted, lineHeight: 21, marginTop: 10},
  dots: {flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 34},
  dot: {width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: c.faint},
  dotOn: {backgroundColor: c.green, borderColor: c.green},
  hint: {textAlign: 'center', fontSize: 13.5, color: c.muted, marginTop: 14, minHeight: 20, paddingHorizontal: 10},
  pad: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginTop: 26},
  key: {width: '31.5%', height: 62, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center'},
  keyDel: {backgroundColor: '#F7F7F5'},
  keyGap: {width: '31.5%', height: 62},
  keyText: {fontSize: 24, fontWeight: '500', color: c.text},
  foot: {flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 6},
  footText: {fontSize: 14, color: c.muted},
  link: {color: c.green, fontWeight: '700', textDecorationLine: 'underline'},
});
