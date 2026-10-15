import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { PreviousNcReviewList } from '../../components/common/PreviousNcReviewList';
import { AuditorStackParamList } from '../../navigation/navigationTypes';
import { PreviousNC } from '../../types/domain';
import { findOpenChecklistReview } from '../../utils/previousNcReviews';
import { useAppTheme } from '../../store/ThemeContext';
type P = NativeStackScreenProps<AuditorStackParamList, 'ChecklistResponse'>;
type Photo = Asset & { existingId?: string };
export function ChecklistResponseScreen({ navigation, route }: P) {
  const { isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tablet = width >= 768;
  const headerStyle = [
    s.header,
    isDark && s.headerDark,
    { height: 72 + insets.top, paddingTop: insets.top },
  ];
  const { auditId, question, responseType, projectId, documentFlow } =
    route.params;
  const existing = question.auditResponses?.find(
    (x: any) => x.responseType === responseType,
  );
  const compliance = responseType === 'COMPLIANCE';
  const [observation, setObservation] = useState(existing?.observation || ''),
    [risk, setRisk] = useState(existing?.riskAssessment || ''),
    [description, setDescription] = useState(existing?.description1 || ''),
    [action, setAction] = useState(existing?.description2 || ''),
    [photos, setPhotos] = useState<Photo[]>(
      (existing?.evidence || [])
        .filter((x: any) => x.evidenceType !== 'action')
        .map((x: any) => ({
          uri: x.imageUrl,
          fileName: x.imageName,
          existingId: x.id,
        })),
    ),
    [actionPhotos, setActionPhotos] = useState<Photo[]>(
      (existing?.evidence || [])
        .filter((x: any) => x.evidenceType === 'action')
        .map((x: any) => ({
          uri: x.imageUrl,
          fileName: x.imageName,
          existingId: x.id,
        })),
    ),
    [saving, setSaving] = useState(false);
  const [previousReview, setPreviousReview] = useState<PreviousNC | null>(null),
    [checkingPrevious, setCheckingPrevious] = useState(!compliance);
  useEffect(() => {
    if (compliance) return;
    let alive = true;
    auditorApi
      .previousNcReviews(auditId)
      .then(reviews => {
        if (alive)
          setPreviousReview(
            findOpenChecklistReview(reviews, question.questionNumber),
          );
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setCheckingPrevious(false);
      });
    return () => {
      alive = false;
    };
  }, [auditId, compliance, question.questionNumber]);
  const pick = async (camera: boolean, target: 'evidence' | 'action') => {
    const result = camera
      ? await launchCamera({ mediaType: 'photo', quality: 0.8 })
      : await launchImageLibrary({
          mediaType: 'photo',
          selectionLimit: 0,
          quality: 0.8,
        });
    if (result.didCancel) return;
    if (result.errorMessage)
      return Alert.alert('Photo unavailable', result.errorMessage);
    const set = target === 'evidence' ? setPhotos : setActionPhotos;
    set(v => [...v, ...(result.assets || [])]);
  };
  const valid = compliance
    ? photos.length > 0
    : Boolean(risk && description.trim() && action.trim() && photos.length);
  const save = async () => {
    if (!valid)
      return Alert.alert(
        'Required details missing',
        compliance
          ? 'Add at least one compliance photo.'
          : 'Select risk, enter both descriptions, and add non-compliance evidence.',
      );
    const all = [
      ...photos.map(p => ({ p, type: compliance ? 'compliance' : 'evidence' })),
      ...actionPhotos.map(p => ({ p, type: 'action' })),
    ];
    const form = new FormData();
    form.append('questionId', question.id);
    form.append('auditId', auditId);
    form.append('responseType', responseType);
    if (compliance) form.append('observation', observation);
    else {
      form.append('riskAssessment', risk);
      form.append('description1', description);
      form.append('description2', action);
    }
    form.append(
      'keepEvidenceIds',
      JSON.stringify(all.map(x => x.p.existingId).filter(Boolean)),
    );
    const fresh = all.filter(x => !x.p.existingId);
    form.append('imageTypes', JSON.stringify(fresh.map(x => x.type)));
    fresh.forEach(({ p }) =>
      form.append('images', {
        uri: p.uri,
        name: p.fileName || `photo-${Date.now()}.jpg`,
        type: p.type || 'image/jpeg',
      } as any),
    );
    setSaving(true);
    try {
      await auditorApi.saveQuestionResponse(form);
      if (documentFlow && projectId && !compliance) {
        await auditorApi.updateDocumentStatus(
          projectId,
          question.id,
          'Not Approved',
          description.trim(),
        );
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  if (!compliance && checkingPrevious)
    return (
      <View style={[s.screen, isDark && s.screenDark]}>
        <ActivityIndicator style={s.loader} size="large" color="#0754AD" />
      </View>
    );
  if (!compliance && previousReview)
    return (
      <View style={[s.screen, isDark && s.screenDark]}>
        <View style={headerStyle}>
          <Pressable onPress={navigation.goBack} style={s.back}>
            <Feather name="chevron-left" size={22} color="#0754AD" />
            <Text style={s.backText}>Back</Text>
          </Pressable>
        </View>
        <ScrollView style={s.scroll} contentContainerStyle={[s.body, tablet && s.bodyTablet]}>
          <Text style={[s.title, isDark && s.textDark]}>Previous Non-Compliance Pending</Text>
          <Text style={[s.question, isDark && s.mutedDark]}>
            {question.questionNumber} - {question.text}
          </Text>
          <Text style={s.previousNote}>
            This question has a non-compliance carried over from the previous
            audit cycle. Close it below before recording a new response.
          </Text>
          <PreviousNcReviewList
            reviews={[previousReview]}
            auditId={auditId}
            onClosed={() => setPreviousReview(null)}
          />
        </ScrollView>
      </View>
    );
  return (
    <View style={[s.screen, isDark && s.screenDark]}>
      <View style={headerStyle}>
        <Pressable onPress={navigation.goBack} style={s.back}>
          <Feather name="chevron-left" size={22} color="#0754AD" />
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
              <Feather name="check" size={18} color="white" />
              <Text style={s.saveText}>Save</Text>
            </>
          )}
        </Pressable>
      </View>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.body, tablet && s.bodyTablet]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[s.title, isDark && s.textDark]}>
          {compliance ? 'Compliance Evaluation' : 'Non-Compliance Evaluation'}
        </Text>
        <Text style={[s.question, isDark && s.mutedDark]}>
          {question.questionNumber} - {question.text}
        </Text>
        {!compliance && (
          <>
            <Text style={[s.label, isDark && s.textDark]}>Risk assessment *</Text>
            <View style={s.risks}>
              {['MINOR', 'MAJOR', 'CRITICAL'].map(x => (
                <Pressable
                  key={x}
                  onPress={() => setRisk(x)}
                  style={[s.risk, isDark && s.riskDark, risk === x && s.riskOn]}
                >
                  <Text style={[s.riskText, isDark && s.textDark, risk === x && s.white]}>{x}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[s.label, isDark && s.textDark]}>Describe the non-compliance *</Text>
            <TextInput
              multiline
              value={description}
              onChangeText={setDescription}
              style={[s.input, isDark && s.inputDark]}
              placeholder="What was observed?"
              placeholderTextColor={isDark ? '#6B7280' : undefined}
            />
          </>
        )}
        <PhotoBlock
          title={
            compliance
              ? 'Add photos of correct assignment *'
              : 'Non-compliance evidence *'
          }
          value={photos}
          setValue={setPhotos}
          pick={v => pick(v, 'evidence')}
          isDark={isDark}
        />
        {!compliance && (
          <>
            <Text style={[s.label, isDark && s.textDark]}>Corrective action *</Text>
            <TextInput
              multiline
              value={action}
              onChangeText={setAction}
              style={[s.input, isDark && s.inputDark]}
              placeholder="Recommended corrective action"
              placeholderTextColor={isDark ? '#6B7280' : undefined}
            />
            <PhotoBlock
              title="Corrective-action photos (optional)"
              value={actionPhotos}
              setValue={setActionPhotos}
              pick={v => pick(v, 'action')}
              isDark={isDark}
            />
          </>
        )}
        {compliance && (
          <>
            <Text style={[s.label, isDark && s.textDark]}>Save note (optional)</Text>
            <TextInput
              multiline
              value={observation}
              onChangeText={setObservation}
              style={[s.input, isDark && s.inputDark]}
              placeholder="Enter your observation for this item..."
              placeholderTextColor={isDark ? '#6B7280' : undefined}
            />
          </>
        )}
        <View style={s.footer}>
          <Text style={s.footerTitle}>Audit Smartly</Text>
          <Text style={[s.footerSub, isDark && s.mutedDark]}>
            Keep your sites compliant and inspections on track
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
function PhotoBlock({
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
    <View>
      <Text style={[s.label, isDark && s.textDark]}>{title}</Text>
      {value.length ? (
        <View style={s.photoGrid}>
          {value.map((p, i) => (
            <View key={`${p.uri}-${i}`} style={[s.photoBox, tablet && s.photoBoxTablet]}>
              <Image source={{ uri: p.uri }} style={s.photo} />
              <Pressable
                onPress={() => setValue(v => v.filter((_, j) => j !== i))}
                style={s.remove}
              >
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
        <Pressable onPress={() => pick(true)} style={s.camera}>
          <Feather name="camera" color="white" size={18} />
          <Text style={s.white}>Camera</Text>
        </Pressable>
        <Pressable onPress={() => pick(false)} style={[s.gallery, isDark && s.galleryDark]}>
          <Feather name="image" color="#00875A" size={18} />
          <Text style={s.green}>Gallery</Text>
        </Pressable>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F7F8' },
  screenDark: { backgroundColor: '#111827' },
  textDark: { color: '#F8FAFC' },
  mutedDark: { color: '#9CA3AF' },
  scroll: { flex: 1 },
  header: {
    height: 72,
    paddingHorizontal: 18,
    backgroundColor: 'white',
    elevation: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerDark: { backgroundColor: '#1F2937' },
  back: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: '#0754AD', fontSize: 16 },
  save: {
    height: 42,
    minWidth: 100,
    borderRadius: 9,
    backgroundColor: '#0754AD',
    flexDirection: 'row',
    gap: 8,
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
  loader: { marginTop: 70 },
  title: { fontSize: 22, fontWeight: '800', color: '#292B2F' },
  question: {
    fontSize: 14,
    lineHeight: 21,
    color: '#333',
    marginTop: 8,
    marginBottom: 24,
  },
  previousNote: {
    fontSize: 13,
    lineHeight: 19,
    color: '#B45309',
    backgroundColor: '#FFF3E0',
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
  },
  label: { fontSize: 16, fontWeight: '600', marginTop: 18, marginBottom: 10 },
  input: {
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#CED2D8',
    borderRadius: 10,
    backgroundColor: 'white',
    padding: 14,
    fontSize: 15,
  },
  inputDark: { backgroundColor: '#1F2937', borderColor: '#374151', color: '#F8FAFC' },
  risks: { flexDirection: 'row', gap: 10 },
  risk: {
    flex: 1,
    height: 43,
    borderWidth: 1,
    borderColor: '#C9CFD8',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
  },
  riskDark: { backgroundColor: '#1F2937', borderColor: '#374151' },
  riskOn: { backgroundColor: '#E54C42', borderColor: '#E54C42' },
  riskText: { fontSize: 12, fontWeight: '700' },
  white: { color: 'white', fontWeight: '600' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoBox: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: '#DDD',
  },
  photoBoxTablet: { width: '23.5%' },
  photo: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute',
    right: 7,
    top: 7,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E64141',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    height: 90,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C9CFD8',
    borderRadius: 10,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyDark: { backgroundColor: '#1F2937', borderColor: '#374151' },
  muted: { color: '#7B8492' },
  pickers: { flexDirection: 'row', gap: 12, marginTop: 12 },
  camera: {
    flex: 1,
    height: 46,
    borderRadius: 9,
    backgroundColor: '#00875A',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gallery: {
    flex: 1,
    height: 46,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#00875A',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryDark: { backgroundColor: '#1F2937' },
  green: { color: '#00875A', fontWeight: '600' },
  footer: { alignItems: 'center', paddingTop: 55 },
  footerTitle: { color: '#5046EF', fontSize: 18, fontWeight: '800' },
  footerSub: { color: '#98A2B3', marginTop: 8, textAlign: 'center' },
});
