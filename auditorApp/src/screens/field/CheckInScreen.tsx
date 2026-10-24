import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, Linking, Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from '@react-native-community/geolocation';
import {fieldApi} from '../../api/field.api';
import {useAuth} from '../../store/AuthContext';
import {useOutbox} from '../../store/OutboxContext';
import {Button, ErrorBox, Icon, Loading, Screen} from '../../ui/kit';
import {c, mono} from '../../ui/theme';
import {useLoad} from '../../ui/useLoad';
import {askLocation, distanceM, Fix, fileOf, rememberFix, Shot, takePhoto} from '../../utils/camera';
import {checkInClosesAt, checkInOpensAt, facilityName, fmtTime, inCheckInWindow, jobTitle} from '../../utils/field';
import {StackProps} from '../../navigation/fieldTypes';

const MAX_ACCURACY_M = 100;
const DEVICE_ID_KEY = 'client_audit_device_id';
const deviceId = async () => {
  const saved = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (saved) return saved;
  const id = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
};

type Check = {label: string; value: string; state: 'ok' | 'fail' | 'wait'};

export function CheckInScreen({navigation, route}: StackProps<'CheckIn'>) {
  const {user} = useAuth();
  const uid = user?.id;
  const {cacheSession} = useOutbox();
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [photo, setPhoto] = useState<Shot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());
  const watch = useRef<number | null>(null);

  const {data, error: loadError, loading, refresh} = useLoad(async () => {
    const jobs = await fieldApi.jobs();
    const job = jobs.find(j => j.id === route.params.jobId);
    if (!job) throw new Error('This audit is no longer assigned to you.');
    const busyElsewhere = jobs.some(j => j.id !== job.id && (j.sessions || []).some(s => s.auditorId === uid && s.status === 'IN_PROGRESS'));
    return {job, busyElsewhere};
  }, [route.params.jobId, uid]);

  const startGps = useCallback(async () => {
    setGpsError('');
    if (!(await askLocation())) {
      setGpsError('Location permission is needed to check in.');
      return;
    }
    if (watch.current != null) Geolocation.clearWatch(watch.current);
    watch.current = Geolocation.watchPosition(
      p => {
        const f = {latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now()};
        rememberFix(f);
        setFix(f);
        setGpsError('');
      },
      () => setGpsError('Waiting for GPS. Turn on precise location and move to an open area.'),
      {enableHighAccuracy: true, distanceFilter: 3, interval: 4000, fastestInterval: 2000} as any,
    );
  }, []);

  useEffect(() => {
    startGps();
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => {
      clearInterval(t);
      if (watch.current != null) Geolocation.clearWatch(watch.current);
    };
  }, [startGps]);

  if (loading && !data) return <Screen dark title="Check in" onBack={navigation.goBack}><Loading /></Screen>;
  if (!data) return <Screen dark title="Check in" onBack={navigation.goBack}><ErrorBox message={loadError} onRetry={refresh} /></Screen>;

  const {job, busyElsewhere} = data;
  const loc = job.location;
  const distance = fix ? distanceM(fix.latitude, fix.longitude, loc.latitude, loc.longitude) : null;
  const demo = !!job.isDemo;
  const checks: Check[] = [
    {label: 'Inside the site radius', value: distance == null ? 'Reading GPS…' : `${Math.round(distance)} m of ${loc.geofenceRadiusM} m`, state: demo ? 'ok' : distance == null ? 'wait' : distance <= loc.geofenceRadiusM ? 'ok' : 'fail'},
    {label: 'GPS accuracy', value: fix ? `±${Math.round(fix.accuracy)} m (max ${MAX_ACCURACY_M} m)` : '—', state: demo ? 'ok' : !fix ? 'wait' : fix.accuracy <= MAX_ACCURACY_M ? 'ok' : 'fail'},
    {label: 'Within the audit window', value: inCheckInWindow(job, now) ? fmtTime(now) : `${fmtTime(checkInOpensAt(job))} to ${fmtTime(checkInClosesAt(job))}`, state: inCheckInWindow(job, now) ? 'ok' : 'fail'},
    {label: 'No other audit in progress', value: busyElsewhere ? 'Finish the other one' : 'Clear', state: busyElsewhere ? 'fail' : 'ok'},
  ];
  const allOk = checks.every(x => x.state === 'ok');

  const shoot = async () => {
    setError('');
    try {
      const shot = await takePhoto();
      if (shot) setPhoto(shot);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submit = async () => {
    if (!photo) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      if (fix) {
        form.append('latitude', String(fix.latitude));
        form.append('longitude', String(fix.longitude));
        form.append('accuracy', String(fix.accuracy));
      }
      form.append('deviceId', await deviceId());
      form.append('source', 'LIVE_CAMERA');
      form.append('checkInPhoto', fileOf(photo));
      const res = await fieldApi.checkIn(job.id, form);
      await cacheSession(res.session);
      navigation.replace('AuditOverview', {jobId: job.id});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      dark
      title="Check in"
      onBack={navigation.goBack}
      right={
        <View style={st.sitePill}>
          <Text style={st.sitePillText} numberOfLines={1}>
            {jobTitle(job)}
          </Text>
        </View>
      }
      footer={
        photo ? (
          <View style={st.footRow}>
            <Button label="Retake" variant="outlineDark" style={{flex: 1}} onPress={shoot} disabled={busy} />
            <Button label="Verify and check in" style={{flex: 2}} onPress={submit} loading={busy} disabled={!allOk} />
          </View>
        ) : (
          <View style={st.shutterWrap}>
            <Pressable accessibilityLabel="Take the check-in photo" onPress={shoot} style={({pressed}) => [st.shutter, pressed && {opacity: 0.7}]}>
              <View style={st.shutterInner} />
            </Pressable>
            <Text style={st.footNote}>Camera only. Gallery photos are not accepted.</Text>
          </View>
        )
      }>
      <View style={st.frame}>
        {photo ? <Image source={{uri: photo.uri}} style={StyleSheet.absoluteFill} resizeMode="cover" /> : (
          <View style={st.preview}>
            <Icon name="camera" size={40} color="#8E948E" />
            <Text style={st.previewText}>Tap the shutter to open the camera</Text>
          </View>
        )}
        {['tl', 'tr', 'bl', 'br'].map(k => (
          <View key={k} style={[st.corner, st[k as 'tl']]} />
        ))}
        <View style={st.frameCaption}>
          <Text style={st.frameCaptionText}>
            {photo
              ? `${fmtTime(photo.takenAt)}${fix ? ` · ${fix.latitude.toFixed(4)}, ${fix.longitude.toFixed(4)} ±${Math.round(fix.accuracy)} m` : ''}`
              : `Frame the ${facilityName(job).toLowerCase()} entrance with the signboard. GPS and time are recorded with the photo.`}
          </Text>
        </View>
      </View>

      <View style={{gap: 8}}>
        {checks.map(ch => (
          <View key={ch.label} style={st.check}>
            <View style={[st.checkIcon, ch.state === 'ok' && {backgroundColor: c.green}, ch.state === 'fail' && {backgroundColor: c.red}]}>
              {ch.state === 'wait' ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name={ch.state === 'ok' ? 'check' : 'x'} size={14} color="#FFFFFF" />}
            </View>
            <Text style={st.checkLabel}>{ch.label}</Text>
            <Text style={[st.checkValue, ch.state === 'fail' && {color: '#FF9C92'}]}>{ch.value}</Text>
          </View>
        ))}
      </View>
      {demo && <Text style={st.demo}>Demo audit: site checks are relaxed.</Text>}
      {!!gpsError && (
        <View style={st.warn}>
          <Text style={st.warnText}>{gpsError}</Text>
          <Text style={st.warnLink} onPress={() => (gpsError.includes('permission') ? Linking.openSettings() : startGps())}>
            {gpsError.includes('permission') ? 'Open settings' : 'Retry'}
          </Text>
        </View>
      )}
      {!!error && <ErrorBox message={error} />}
    </Screen>
  );
}

const corner = {position: 'absolute' as const, width: 34, height: 34, borderColor: '#9FD3AE'};
const st = StyleSheet.create({
  sitePill: {backgroundColor: '#24452F', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 190},
  sitePillText: {color: '#CDEBD5', fontSize: 12, fontWeight: '700'},
  frame: {height: 360, borderRadius: 22, backgroundColor: '#232723', overflow: 'hidden', justifyContent: 'center'},
  preview: {alignItems: 'center', gap: 10},
  previewText: {color: '#A6ACA6', fontSize: 14},
  corner,
  tl: {top: 16, left: 16, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8},
  tr: {top: 16, right: 16, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8},
  bl: {bottom: 16, left: 16, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8},
  br: {bottom: 16, right: 16, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8},
  frameCaption: {position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, paddingBottom: 18, backgroundColor: 'rgba(0,0,0,0.45)'},
  frameCaptionText: {color: '#FFFFFF', fontSize: 13, lineHeight: 18},
  check: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.inkSoft, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13},
  checkIcon: {width: 24, height: 24, borderRadius: 12, backgroundColor: '#4A504A', alignItems: 'center', justifyContent: 'center'},
  checkLabel: {flex: 1, color: '#FFFFFF', fontSize: 15},
  checkValue: {fontFamily: mono, color: '#B9BEB8', fontSize: 12.5},
  demo: {color: '#9FD3AE', fontSize: 13, textAlign: 'center'},
  warn: {flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#3A2E16', borderRadius: 12, padding: 12},
  warnText: {flex: 1, color: '#F5D79E', fontSize: 13, lineHeight: 18},
  warnLink: {color: '#FFFFFF', fontWeight: '800', fontSize: 13},
  shutterWrap: {alignItems: 'center', gap: 10},
  shutter: {width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center'},
  shutterInner: {width: 62, height: 62, borderRadius: 31, backgroundColor: '#FFFFFF'},
  footNote: {color: '#A6ACA6', fontSize: 12.5},
  footRow: {flexDirection: 'row', gap: 10},
});
