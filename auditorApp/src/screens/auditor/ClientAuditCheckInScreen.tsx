import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Image, Linking, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from '@react-native-community/geolocation';
import {launchCamera, Asset} from 'react-native-image-picker';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Feather from '../../components/common/AppIcon';
import {auditorApi} from '../../api/auditor.api';
import {AuditorHeader} from '../../components/common/AuditorHeader';
import {AuditorStackParamList} from '../../navigation/navigationTypes';
import {ClientAuditSession} from '../../types/domain';
import {useAppTheme} from '../../store/ThemeContext';

type Props = NativeStackScreenProps<AuditorStackParamList, 'ClientAuditCheckIn'>;
type Coordinates = {latitude:number; longitude:number; accuracy:number};
const DEVICE_ID_KEY = 'client_audit_device_id';

Geolocation.setRNConfiguration({
  skipPermissionRequests: false,
  authorizationLevel: 'whenInUse',
  locationProvider: 'auto',
});

const getDeviceId = async () => {
  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;
  const generated = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, generated);
  return generated;
};

export function ClientAuditCheckInScreen({navigation, route}: Props) {
  const {isDark} = useAppTheme();
  const [details, setDetails] = useState<any>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [photo, setPhoto] = useState<Asset | null>(null);
  const [session, setSession] = useState<ClientAuditSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const response = await auditorApi.clientAuditCheckInDetails(route.params.jobId);
      setDetails(response.job);
      if (response.session) {
        const full = await auditorApi.clientAuditSession(route.params.jobId);
        setSession(full.session);
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [route.params.jobId]);

  useEffect(() => { load(); }, [load]);

  const captureLocation = async () => {
    setError('');
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
        title: 'Audit site location', message: 'Your live GPS location is required to verify site check-in.', buttonPositive: 'Allow',
      });
      if (result !== PermissionsAndroid.RESULTS.GRANTED) { setError('Location permission is required.'); return; }
    } else {
      const granted = await new Promise<boolean>(resolve => Geolocation.requestAuthorization(() => resolve(true), () => resolve(false)));
      if (!granted) { setError('Location permission is required.'); return; }
    }
    setLocating(true);
    const acceptPosition = (position: any) => {
      setCoordinates({latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy});
      setLocating(false);
    };
    const showLocationError = () => {
      setError('Location timed out. Turn on Precise Location and Google Location Accuracy, move near a window/open area, then retry.');
      setLocating(false);
    };

    // Try a fresh GPS fix first. Physical devices can take longer indoors; if
    // GPS times out, fall back to the recent network-assisted location.
    Geolocation.getCurrentPosition(
      acceptPosition,
      () => Geolocation.getCurrentPosition(
        acceptPosition,
        showLocationError,
        {enableHighAccuracy: false, timeout: 20000, maximumAge: 120000},
      ),
      {enableHighAccuracy: true, timeout: 45000, maximumAge: 10000},
    );
  };

  const capturePhoto = async () => {
    setError('');
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (result !== PermissionsAndroid.RESULTS.GRANTED) { setError('Camera permission is required.'); return; }
    }
    const result = await launchCamera({mediaType: 'photo', cameraType: 'back', quality: 0.8, saveToPhotos: false});
    if (result.errorMessage) setError(result.errorMessage);
    else if (result.assets?.[0]?.uri) setPhoto(result.assets[0]);
  };

  const checkIn = async () => {
    if (!coordinates || !photo?.uri) { setError('Capture live GPS location and a site photo first.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const form = new FormData();
      form.append('latitude', String(coordinates.latitude));
      form.append('longitude', String(coordinates.longitude));
      form.append('accuracy', String(coordinates.accuracy));
      form.append('deviceId', await getDeviceId());
      form.append('source', 'LIVE_CAMERA');
      form.append('checkInPhoto', {uri: photo.uri, type: photo.type || 'image/jpeg', name: photo.fileName || `check-in-${Date.now()}.jpg`} as any);
      const response = await auditorApi.checkInClientAudit(route.params.jobId, form);
      setSession(response.session);
      Alert.alert('Check-in verified', response.message);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[s.screen, isDark && s.screenDark]}>
      <AuditorHeader navigation={navigation} />
      <ScrollView contentContainerStyle={s.content}>
        <Pressable onPress={() => navigation.goBack()} style={s.back}><Feather name="arrow-left" size={18} color={isDark ? '#fff' : '#111'} /><Text style={[s.backText, isDark && s.textDark]}>Schedule</Text></Pressable>
        <Text style={[s.title, isDark && s.textDark]}>Site check-in</Text>
        {loading ? <ActivityIndicator color="#154A95" /> : details && (
          <>
            <View style={[s.card, isDark && s.cardDark]}>
              <Text style={[s.siteName, isDark && s.textDark]}>{details.location.dealerName} - {details.location.locationName}</Text>
              <Text style={s.muted}>{details.location.address}</Text>
              <Text style={[s.info, isDark && s.textDark]}>Window: {new Date(details.scheduledStart).toLocaleString('en-IN')} – {new Date(details.scheduledEnd).toLocaleString('en-IN')}</Text>
              <Text style={[s.info, isDark && s.textDark]}>Allowed radius: {details.location.geofenceRadiusM} m</Text>
            </View>

            {session ? (
              <View style={[s.successCard, isDark && s.cardDark]}>
                <Feather name="check-circle" size={34} color="#15803D" />
                <Text style={s.successTitle}>Checked in successfully</Text>
                <Text style={s.muted}>{Math.round(session.distanceFromSiteM)} m from site · GPS accuracy {Math.round(session.gpsAccuracy)} m</Text>
                <Text style={[s.modulesTitle, isDark && s.textDark]}>Unlocked checklist modules</Text>
                {(session.modules || []).map(module => <View key={module.moduleCode} style={s.moduleRow}><Text style={[s.moduleName, isDark && s.textDark]}>{module.moduleCode.replace(/_/g, ' ')}</Text><Text style={s.moduleCount}>{module.questionCount} questions</Text></View>)}
                <Pressable style={s.primaryButton} onPress={() => navigation.navigate('ClientAuditModules', {jobId: route.params.jobId})}><Text style={s.primaryText}>Start audit questions</Text></Pressable>
              </View>
            ) : (
              <View style={[s.card, isDark && s.cardDark]}>
                <Text style={[s.stepTitle, isDark && s.textDark]}>1. Capture live location</Text>
                <Pressable disabled={locating} onPress={captureLocation} style={s.secondaryButton}><Feather name="crosshair" size={17} color="#154A95" /><Text style={s.secondaryText}>{locating ? 'Reading GPS…' : coordinates ? 'Refresh location' : 'Get live location'}</Text></Pressable>
                {coordinates && <Text style={s.okText}>GPS ready · accuracy {Math.round(coordinates.accuracy)} m</Text>}

                <Text style={[s.stepTitle, isDark && s.textDark]}>2. Take site photo</Text>
                <Pressable onPress={capturePhoto} style={s.secondaryButton}><Feather name="camera" size={17} color="#154A95" /><Text style={s.secondaryText}>{photo ? 'Retake live photo' : 'Open camera'}</Text></Pressable>
                {photo?.uri && <Image source={{uri: photo.uri}} style={s.preview} />}

                <Pressable disabled={submitting || !coordinates || !photo} onPress={checkIn} style={[s.primaryButton, (submitting || !coordinates || !photo) && s.disabled]}>
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Verify & unlock checklist</Text>}
                </Pressable>
              </View>
            )}
          </>
        )}
        {!!error && <View style={s.errorBox}><Text style={s.error}>{error}</Text>{error.toLowerCase().includes('location') && <Pressable onPress={() => Linking.openSettings()}><Text style={s.settingsLink}>Open app settings</Text></Pressable>}</View>}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:'#F3F4F6'},screenDark:{backgroundColor:'#111827'},content:{padding:18,paddingBottom:40},textDark:{color:'#F8FAFC'},
  back:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:14},backText:{fontSize:14,fontWeight:'700',color:'#111'},title:{fontSize:26,fontWeight:'900',color:'#111',marginBottom:16},
  card:{backgroundColor:'#fff',borderRadius:18,padding:17,marginBottom:14,borderWidth:1,borderColor:'#E5E7EB'},cardDark:{backgroundColor:'#1F2937',borderColor:'#374151'},siteName:{fontSize:17,fontWeight:'800',color:'#111'},muted:{fontSize:13,color:'#6B7280',marginTop:5},info:{fontSize:13,color:'#111',marginTop:10},
  stepTitle:{fontSize:15,fontWeight:'800',color:'#111',marginTop:6,marginBottom:10},secondaryButton:{height:46,borderRadius:12,borderWidth:1,borderColor:'#154A95',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},secondaryText:{fontSize:14,fontWeight:'700',color:'#154A95'},okText:{fontSize:12,color:'#15803D',fontWeight:'700',marginTop:8,marginBottom:18},preview:{height:190,borderRadius:12,marginTop:10,backgroundColor:'#E5E7EB'},
  primaryButton:{height:50,borderRadius:12,backgroundColor:'#154A95',alignItems:'center',justifyContent:'center',marginTop:20},disabled:{opacity:.45},primaryText:{color:'#fff',fontSize:14,fontWeight:'800'},errorBox:{backgroundColor:'#FEF2F2',borderRadius:12,padding:13,marginTop:4},error:{color:'#DC2626'},settingsLink:{color:'#154A95',fontWeight:'800',marginTop:10},
  successCard:{backgroundColor:'#F0FDF4',borderRadius:18,padding:18,borderWidth:1,borderColor:'#BBF7D0'},successTitle:{fontSize:18,fontWeight:'900',color:'#15803D',marginTop:10},modulesTitle:{fontSize:15,fontWeight:'800',marginTop:20,marginBottom:8,color:'#111'},moduleRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:10,borderTopWidth:1,borderTopColor:'#E5E7EB'},moduleName:{fontSize:13,fontWeight:'700',color:'#111',flex:1},moduleCount:{fontSize:12,color:'#6B7280'},
});
