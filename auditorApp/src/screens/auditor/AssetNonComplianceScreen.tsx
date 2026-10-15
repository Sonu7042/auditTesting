import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '../../components/common/AppIcon';
import {
  launchCamera,
  launchImageLibrary,
  Asset,
} from 'react-native-image-picker';
import { auditorApi } from '../../api/auditor.api';
import { AuditorStackParamList } from '../../navigation/navigationTypes';
import { useAppTheme } from '../../store/ThemeContext';
type P = NativeStackScreenProps<AuditorStackParamList, 'AssetNonCompliance'>;
type Photo = Asset;
const titles = {
  workforce: 'Workforce',
  machinery: 'Machinery',
  chemical: 'Chemical',
};
export function AssetNonComplianceScreen({ navigation, route }: P) {
  const { isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tablet = width >= 768;
  const { projectId, auditId, kind } = route.params;
  const [data, setData] = useState<Record<string, string>>({}),
    [evidence, setEvidence] = useState<Photo[]>([]),
    [action, setAction] = useState<Photo[]>([]),
    [saving, setSaving] = useState(false);
  const set = (key: string, value: string) =>
    setData(v => ({ ...v, [key]: value }));
  const valid =
    kind === 'workforce'
      ? Boolean(
          data.company?.trim() &&
            data.name?.trim() &&
            data.role?.trim() &&
            /^\d{10}$/.test(data.phone || '') &&
            data.description2?.trim(),
        )
      : Boolean(
          data.name?.trim() &&
            data.description1?.trim() &&
            data.description2?.trim() &&
            evidence.length,
        );
  const pick = async (camera: boolean, target: 'evidence' | 'action') => {
    const result = camera
      ? await launchCamera({ mediaType: 'photo', quality: 0.8 })
      : await launchImageLibrary({
          mediaType: 'photo',
          selectionLimit: 0,
          quality: 0.8,
        });
    if (result.errorMessage)
      return Alert.alert('Photo unavailable', result.errorMessage);
    const update = target === 'evidence' ? setEvidence : setAction;
    update(v => [...v, ...(result.assets || [])]);
  };
  const save = async () => {
    if (!valid)
      return Alert.alert(
        'Required details missing',
        'Complete all required fields and evidence.',
      );
    const form = new FormData();
    form.append('projectId', projectId);
    form.append('auditId', auditId);
    if (kind === 'workforce') {
      form.append('subcontractedCompany', data.company);
      form.append('workforce', data.name);
      form.append('workforceRole', data.role);
      form.append('phoneNumber', data.phone);
      form.append('description1', data.description2);
      form.append('description2', data.description2);
    } else {
      form.append(
        kind === 'machinery' ? 'machineryName' : 'chemicalName',
        data.name,
      );
      form.append('description1', data.description1);
      form.append('description2', data.description2);
    }
    const photos = [
      ...evidence.map(p => ({ p, type: 'evidence' })),
      ...action.map(p => ({ p, type: 'action' })),
    ];
    form.append('imageTypes', JSON.stringify(photos.map(x => x.type)));
    photos.forEach(({ p }) =>
      form.append('images', {
        uri: p.uri,
        name: p.fileName || `evidence-${Date.now()}.jpg`,
        type: p.type || 'image/jpeg',
      } as any),
    );
    setSaving(true);
    try {
      await auditorApi.saveAssetNonCompliance(kind, form);
      Alert.alert('Saved', 'Non-conformity saved successfully.', [
        { text: 'OK', onPress: navigation.goBack },
      ]);
    } catch (e) {
      Alert.alert('Unable to save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <KeyboardAvoidingView
      style={[s.screen, isDark && s.screenDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[s.header, isDark && s.headerDark, { height: 72 + insets.top, paddingTop: insets.top }]}
      >
        <Pressable onPress={navigation.goBack} style={s.back}>
          <Feather name="arrow-left" size={20} color="#0754AD" />
          <Text style={s.backText}>Back</Text>
        </Pressable>
        <Pressable
          disabled={!valid || saving}
          onPress={save}
          style={[s.save, !valid && s.disabled]}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Feather name="save" size={16} color="white" />
              <Text style={s.saveText}>Save</Text>
            </>
          )}
        </Pressable>
      </View>
      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.body, tablet && s.bodyTablet]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[s.title, isDark && s.textDark]}>{titles[kind]} Non-Compliance</Text>
        {kind === 'workforce' && (
          <Field
            label="Subcontracted company *"
            value={data.company}
            onChange={v => set('company', v)}
            placeholder="Write company name"
            isDark={isDark}
          />
        )}
        <Field
          label={`${titles[kind]} *`}
          value={data.name}
          onChange={v => set('name', v)}
          placeholder={`Write ${titles[kind].toLowerCase()} name`}
          isDark={isDark}
        />
        {kind === 'workforce' && (
          <View style={s.two}>
            <View style={s.flex}>
              <Field
                label="Role *"
                value={data.role}
                onChange={v => set('role', v)}
                placeholder="Worker role"
                isDark={isDark}
              />
            </View>
            <View style={s.flex}>
              <Field
                label="Phone number *"
                value={data.phone}
                onChange={v => set('phone', v.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit phone"
                keyboardType="phone-pad"
                isDark={isDark}
              />
            </View>
          </View>
        )}
        {kind !== 'workforce' && (
          <>
            <Field
              label="Describe the non-compliance *"
              value={data.description1}
              onChange={v => set('description1', v)}
              placeholder="Description of the report"
              multiline
              isDark={isDark}
            />
            <Photos
              title="Supporting evidence *"
              value={evidence}
              setValue={setEvidence}
              pick={c => pick(c, 'evidence')}
              isDark={isDark}
            />
          </>
        )}
        <Field
          label="Describe the corrective action taken *"
          value={data.description2}
          onChange={v => set('description2', v)}
          placeholder="Description of the report"
          multiline
          isDark={isDark}
        />
        <Photos
          title="Supporting evidence of the resolution"
          value={action}
          setValue={setAction}
          pick={c => pick(c, 'action')}
          isDark={isDark}
        />
        <View style={s.footer}>
          <Text style={s.footerTitle}>Audit Smartly</Text>
          <Text style={s.footerSub}>
            Keep your sites compliant and inspections on track
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  keyboardType,
  isDark,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: any;
  isDark?: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={[s.label, isDark && s.textDark]}>{label}</Text>
      <TextInput
        value={value || ''}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={isDark ? '#6B7280' : undefined}
        multiline={multiline}
        keyboardType={keyboardType}
        style={[s.input, isDark && s.inputDark, multiline && s.area]}
      />
    </View>
  );
}
function Photos({
  title,
  value,
  setValue,
  pick,
  isDark,
}: {
  title: string;
  value: Photo[];
  setValue: React.Dispatch<React.SetStateAction<Photo[]>>;
  pick: (camera: boolean) => void;
  isDark?: boolean;
}) {
  const { width } = useWindowDimensions();
  const tablet = width >= 768;
  return (
    <View style={[s.photoSection, isDark && s.photoSectionDark]}>
      <Text style={[s.label, isDark && s.textDark]}>{title}</Text>
      {value.length ? (
        <View style={s.grid}>
          {value.map((p, i) => (
            <View key={`${p.uri}-${i}`} style={[s.photoBox, tablet && s.photoBoxTablet]}>
              <Image source={{ uri: p.uri }} style={s.photo} />
              <Pressable
                onPress={() => setValue(v => v.filter((_, j) => j !== i))}
                style={s.remove}
              >
                <Feather name="x" color="white" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <View style={[s.empty, isDark && s.emptyDark]}>
          <Text style={[s.muted, isDark && s.textDark]}>No photos added yet.</Text>
        </View>
      )}
      <View style={s.buttons}>
        <Pressable onPress={() => pick(true)} style={s.camera}>
          <Feather name="camera" color="white" />
          <Text style={s.white}>Camera</Text>
        </Pressable>
        <Pressable onPress={() => pick(false)} style={[s.gallery, isDark && s.galleryDark]}>
          <Feather name="image" color="#00956F" />
          <Text style={s.green}>Gallery</Text>
        </Pressable>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F4F4' },
  screenDark: { backgroundColor: '#111827' },
  textDark: { color: '#F8FAFC' },
  header: {
    height: 72,
    backgroundColor: 'white',
    elevation: 3,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerDark: { backgroundColor: '#1F2937' },
  back: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  backText: { color: '#0754AD', fontSize: 16 },
  save: {
    height: 44,
    minWidth: 100,
    borderRadius: 9,
    backgroundColor: '#0754AD',
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
  saveText: { color: 'white', fontWeight: '700' },
  body: {
    padding: 20,
    paddingBottom: 45,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  bodyTablet: { maxWidth: 880, padding: 32 },
  title: { fontSize: 23, fontWeight: '800', marginBottom: 6 },
  field: { marginTop: 18 },
  label: { fontSize: 16, fontWeight: '600', lineHeight: 23, marginBottom: 9 },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 11,
    backgroundColor: 'white',
    paddingHorizontal: 14,
    fontSize: 15,
  },
  inputDark: { backgroundColor: '#1F2937', borderColor: '#374151', color: '#F8FAFC' },
  area: { height: 150, textAlignVertical: 'top', paddingTop: 14 },
  two: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  photoSection: {
    marginTop: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#D5D8DD',
    borderRadius: 18,
    backgroundColor: 'white',
  },
  photoSectionDark: { backgroundColor: '#1F2937', borderColor: '#374151' },
  empty: {
    height: 70,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D2D7DF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyDark: { backgroundColor: '#111827', borderColor: '#374151' },
  muted: { color: '#778195' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  photoBox: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 9,
    overflow: 'hidden',
  },
  photoBoxTablet: { width: '23.5%' },
  photo: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute',
    right: 5,
    top: 5,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E5484D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 14 },
  camera: {
    flex: 1,
    height: 48,
    borderRadius: 7,
    backgroundColor: '#00956F',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gallery: {
    flex: 1,
    height: 48,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#00956F',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryDark: { backgroundColor: '#1F2937' },
  white: { color: 'white', fontWeight: '600' },
  green: { color: '#00956F', fontWeight: '600' },
  footer: { alignItems: 'center', marginTop: 54 },
  footerTitle: { fontSize: 18, fontWeight: '800', color: '#5046EF' },
  footerSub: { color: '#98A2B3', marginTop: 8, textAlign: 'center' },
});
