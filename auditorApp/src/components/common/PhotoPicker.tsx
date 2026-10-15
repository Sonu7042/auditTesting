import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import Feather from './AppIcon';
import {Asset, launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {useAppTheme} from '../../store/ThemeContext';

export type PickedPhoto = Asset & {existingId?: string};

export function PhotoPicker({
  label,
  photos,
  onChange,
  allowCamera = true,
}: {
  label: string;
  photos: PickedPhoto[];
  onChange: (next: PickedPhoto[]) => void;
  allowCamera?: boolean;
}) {
  const {isDark} = useAppTheme();
  const pick = async (camera: boolean) => {
    const result = camera
      ? await launchCamera({mediaType: 'photo', quality: 0.8})
      : await launchImageLibrary({mediaType: 'photo', selectionLimit: 0, quality: 0.8});
    if (result.didCancel) return;
    if (result.errorMessage) return;
    onChange([...photos, ...(result.assets || [])]);
  };

  return (
    <View>
      <Text style={[s.label, isDark && s.labelDark]}>{label}</Text>
      {photos.length ? (
        <View style={s.grid}>
          {photos.map((photo, index) => (
            <View key={`${photo.uri}-${index}`} style={s.box}>
              <Image source={{uri: photo.uri}} style={s.image} />
              <Pressable
                onPress={() => onChange(photos.filter((_, i) => i !== index))}
                style={s.remove}>
                <Feather name="x" color="white" size={15} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <View style={[s.empty, isDark && s.emptyDark]}>
          <Text style={[s.muted, isDark && s.mutedDark]}>No photos added yet.</Text>
        </View>
      )}
      <View style={s.pickers}>
        {allowCamera && (
          <Pressable onPress={() => pick(true)} style={s.camera}>
            <Feather name="camera" color="white" size={18} />
            <Text style={s.cameraText}>Camera</Text>
          </Pressable>
        )}
        <Pressable onPress={() => pick(false)} style={[s.gallery, isDark && s.galleryDark]}>
          <Feather name="image" color="#00875A" size={18} />
          <Text style={s.galleryText}>Gallery</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  label: {fontSize: 15, fontWeight: '600', marginBottom: 10, color: '#111'},
  labelDark: {color: '#F1F5F9'},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  box: {width: '31%', aspectRatio: 1, borderRadius: 11, overflow: 'hidden', backgroundColor: '#DDD'},
  image: {width: '100%', height: '100%'},
  remove: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E64141',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    height: 80,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C9CFD8',
    borderRadius: 10,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyDark: {backgroundColor: '#1F2937', borderColor: '#374151'},
  muted: {color: '#7B8492'},
  mutedDark: {color: '#9CA3AF'},
  pickers: {flexDirection: 'row', gap: 12, marginTop: 12},
  camera: {
    flex: 1,
    height: 44,
    borderRadius: 9,
    backgroundColor: '#00875A',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraText: {color: 'white', fontWeight: '600'},
  gallery: {
    flex: 1,
    height: 44,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#00875A',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryDark: {backgroundColor: '#1F2937'},
  galleryText: {color: '#00875A', fontWeight: '600'},
});
