import {PermissionsAndroid, Platform} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {launchCamera} from 'react-native-image-picker';

Geolocation.setRNConfiguration({skipPermissionRequests: false, authorizationLevel: 'whenInUse', locationProvider: 'auto'});

export type Shot ={uri: string; type: string; name: string; size: number; takenAt: string; lat?: number; lng?: number; accuracy?: number};

export async function askCamera() {
  if (Platform.OS !== 'android') return true;
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

export async function askLocation() {
  if (Platform.OS === 'android') {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
      title: 'Site location',
      message: 'Your GPS location is needed to verify you are at the audit site.',
      buttonPositive: 'Allow',
    });
    return r === PermissionsAndroid.RESULTS.GRANTED;
  }
  return new Promise<boolean>(resolve => Geolocation.requestAuthorization(() => resolve(true), () => resolve(false)));
}

export type Fix = {latitude: number; longitude: number; accuracy: number; at: number};

export function readLocation(highAccuracy = true): Promise<Fix> {
  return new Promise((resolve, reject) => {
    const ok = (p: any) => resolve({latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now()});
    Geolocation.getCurrentPosition(
      ok,
      () => Geolocation.getCurrentPosition(ok, () => reject(new Error('Could not read GPS. Turn on precise location, move to an open area and retry.')), {enableHighAccuracy: false, timeout: 20000, maximumAge: 120000}),
      {enableHighAccuracy: highAccuracy, timeout: 30000, maximumAge: 10000},
    );
  });
}

let lastFix: Fix | null = null;
export const rememberFix = (fix: Fix) => {
  lastFix = fix;
};

/* Opens the device camera (never the gallery) and records when and where the photo was taken. */
export async function takePhoto(): Promise<Shot | null> {
  if (!(await askCamera())) throw new Error('Camera permission is needed to take evidence photos.');
  const result = await launchCamera({mediaType: 'photo', cameraType: 'back', quality: 0.7, maxWidth: 1920, maxHeight: 1920, saveToPhotos: false});
  if (result.errorMessage) throw new Error(result.errorMessage);
  const a = result.assets?.[0];
  if (!a?.uri) return null;
  const shot: Shot = {uri: a.uri, type: a.type || 'image/jpeg', name: a.fileName || `photo-${Date.now()}.jpg`, size: a.fileSize || 0, takenAt: new Date().toISOString()};
  const fresh = lastFix && Date.now() - lastFix.at < 5 * 60000 ? lastFix : null;
  if (fresh) Object.assign(shot, {lat: fresh.latitude, lng: fresh.longitude, accuracy: fresh.accuracy});
  readLocation(false)
    .then(rememberFix)
    .catch(() => undefined);
  return shot;
}

export const fileOf = (shot: Pick<Shot, 'uri' | 'type' | 'name'>) => ({uri: shot.uri, type: shot.type, name: shot.name}) as any;

export const distanceM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
