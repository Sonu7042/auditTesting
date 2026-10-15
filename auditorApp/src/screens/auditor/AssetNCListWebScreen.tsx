import React, { useCallback, useMemo, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '../../components/common/AppIcon';
import { launchImageLibrary } from 'react-native-image-picker';
import { auditorApi } from '../../api/auditor.api';
import { PreviousNcReviewList } from '../../components/common/PreviousNcReviewList';
import { AuditorStackParamList } from '../../navigation/navigationTypes';
import { useAuditContext } from '../../store/AuditContext';
import { PreviousNC } from '../../types/domain';
import { getBaseSourceType, isUnresolved } from '../../utils/previousNcReviews';
import { useAppTheme } from '../../store/ThemeContext';
type P = NativeStackScreenProps<
  AuditorStackParamList,
  'AssetNonComplianceList'
>;
const labels = {
  workforce: 'Workforce',
  machinery: 'Machinery',
  chemical: 'Chemical',
};
export function AssetNonComplianceListScreen({ navigation, route }: P) {
  const { isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tablet = width >= 768;
  const { projectId, auditId, kind } = route.params,
    { project } = useAuditContext();
  const [records, setRecords] = useState<any[]>([]),
    [previousReviews, setPreviousReviews] = useState<PreviousNC[]>([]),
    [search, setSearch] = useState(''),
    [busy, setBusy] = useState(true),
    [uploading, setUploading] = useState(''),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [current, reviews] = await Promise.all([
        auditorApi.assetNonCompliances(kind, projectId, auditId),
        auditorApi.previousNcReviews(auditId),
      ]);
      setRecords(current);
      setPreviousReviews(
        reviews.filter(
          r =>
            isUnresolved(r) &&
            getBaseSourceType(r.sourceType) === kind.toUpperCase(),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [auditId, kind, projectId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter(x =>
      `${x.workforce || ''} ${x.workforceRole || ''} ${x.phoneNumber || ''} ${
        x.subcontractedCompany || ''
      } ${x.machineryName || ''} ${x.chemicalName || ''} ${
        x.description1 || ''
      } ${x.description2 || ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [records, search]);
  const close = async (recordId: string) => {
    const picked = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 0,
      quality: 0.8,
    });
    if (picked.errorMessage)
      return Alert.alert('Image unavailable', picked.errorMessage);
    if (!picked.assets?.length) return;
    const form = new FormData();
    picked.assets.forEach(item =>
      form.append('images', {
        uri: item.uri,
        name: item.fileName || `closure-${Date.now()}.jpg`,
        type: item.type || 'image/jpeg',
      } as any),
    );
    setUploading(recordId);
    setError('');
    try {
      const updated = await auditorApi.closeAssetNonCompliance(
        kind,
        recordId,
        form,
      );
      setRecords(v => v.map(x => (x.id === recordId ? updated : x)));
      Alert.alert(
        'NC closed',
        'Corrective-action evidence uploaded successfully.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading('');
    }
  };
  return (
    <View style={[s.screen, isDark && s.screenDark]}>
      <View
        style={[s.header, isDark && s.headerDark, { height: 68 + insets.top, paddingTop: insets.top }]}
      >
        <Pressable onPress={navigation.goBack} style={s.back}>
          <Feather name="arrow-left" size={21} color="#174EA6" />
          <Text style={s.backText}>Back</Text>
        </Pressable>
      </View>
      <ScrollView style={s.flex} contentContainerStyle={[s.body, tablet && s.bodyTablet]}>
        <View style={[s.searchCard, isDark && s.cardDark]}>
          <Text style={[s.title, isDark && s.textDark]}>{labels[kind]} non-conformities</Text>
          <Text style={[s.subtitle, isDark && s.mutedDark]}>
            {records.length} records for{' '}
            {project?.projectName || 'this project'}
          </Text>
          <View style={[s.search, isDark && s.searchDark]}>
            <Feather name="search" size={18} color="#98A2B3" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search non-conformities"
              placeholderTextColor={isDark ? '#6B7280' : undefined}
              style={[s.input, isDark && s.textDark]}
            />
          </View>
        </View>
        {previousReviews.length > 0 && (
          <View style={s.previousSection}>
            <Text style={s.previousTitle}>Previous cycle non-compliances</Text>
            <PreviousNcReviewList
              reviews={previousReviews}
              auditId={auditId}
              onClosed={id =>
                setPreviousReviews(v => v.filter(r => r.id !== id))
              }
            />
          </View>
        )}
        {busy ? (
          <ActivityIndicator style={s.loader} color="#0754AD" size="large" />
        ) : error ? (
          <Pressable onPress={load} style={s.error}>
            <Text style={s.errorText}>
              {error}
              {'\n'}Tap to retry
            </Text>
          </Pressable>
        ) : shown.length === 0 ? (
          <View style={[s.empty, isDark && s.cardDark]}>
            <Text style={[s.muted, isDark && s.mutedDark]}>
              {records.length
                ? 'No non-conformities match your search.'
                : `No ${labels[
                    kind
                  ].toLowerCase()} non-conformities created yet.`}
            </Text>
          </View>
        ) : (
          shown.map((item, index) => (
            <Record
              key={item.id || index}
              item={item}
              kind={kind}
              uploading={uploading === item.id}
              onClose={() => close(item.id)}
              isDark={isDark}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}
function Record({
  item,
  kind,
  uploading,
  onClose,
  isDark,
}: {
  item: any;
  kind: 'workforce' | 'machinery' | 'chemical';
  uploading: boolean;
  onClose: () => void;
  isDark?: boolean;
}) {
  const evidence = (item.evidence || []).filter(
      (x: any) => x.evidenceType !== 'action',
    ),
    resolution = (item.evidence || []).filter(
      (x: any) => x.evidenceType === 'action',
    ),
    closed = resolution.length > 0,
    name =
      item.workforce ||
      item.machineryName ||
      item.chemicalName ||
      'Non-conformity';
  return (
    <View style={[s.card, isDark && s.cardDark]}>
      <View style={s.cardHead}>
        <View style={s.flex}>
          <Text style={[s.name, isDark && s.textDark]}>{name}</Text>
          {item.subcontractedCompany && (
            <Text style={[s.company, isDark && s.mutedDark]}>{item.subcontractedCompany}</Text>
          )}
          <Text style={[s.meta, isDark && s.mutedDark]}>
            {kind === 'workforce'
              ? [item.workforceRole, item.phoneNumber]
                  .filter(Boolean)
                  .join(' · ')
              : labels[kind]}
          </Text>
        </View>
        <Text style={[s.status, closed ? s.closed : s.open]}>
          {closed ? 'CLOSED' : 'OPEN'}
        </Text>
      </View>
      <Panel title="NON COMPLIANCE" color="#00875A" text={item.description1} isDark={isDark} />
      <Panel
        title="CORRECTIVE ACTION"
        color="#2563EB"
        text={item.description2}
        isDark={isDark}
      />
      {evidence.length > 0 && <Gallery label="Evidence" items={evidence} isDark={isDark} />}{' '}
      {resolution.length > 0 && (
        <Gallery label="Resolution" items={resolution} isDark={isDark} />
      )}{' '}
      {!closed && (
        <View style={[s.closeBox, isDark && s.closeBoxDark]}>
          <Text style={[s.closeHelp, isDark && s.textDark]}>
            Upload corrective-action image to close this NC.
          </Text>
          <Pressable
            disabled={uploading}
            onPress={onClose}
            style={[s.closeButton, uploading && s.disabled]}
          >
            {uploading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Feather name="image" size={17} color="white" />
                <Text style={s.closeText}>Upload close image</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
      <View style={[s.divider, isDark && s.dividerDark]} />
      <Text style={[s.created, isDark && s.mutedDark]}>
        Created{' '}
        {item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}
      </Text>
    </View>
  );
}
function Panel({
  title,
  color,
  text,
  isDark,
}: {
  title: string;
  color: string;
  text?: string;
  isDark?: boolean;
}) {
  return (
    <View style={[s.panel, isDark && s.panelDark]}>
      <Text style={[s.panelTitle, { color }]}>{title}</Text>
      <Text style={[s.panelText, isDark && s.textDark]}>{text || '-'}</Text>
    </View>
  );
}
function Gallery({ label, items, isDark }: { label: string; items: any[]; isDark?: boolean }) {
  return (
    <View style={s.gallery}>
      <Text style={[s.galleryLabel, isDark && s.mutedDark]}>
        <Feather name="image" /> {label} ({items.length})
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {items.map(x => (
          <Image key={x.id} source={{ uri: x.imageUrl }} style={s.image} />
        ))}
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F4F4' },
  screenDark: { backgroundColor: '#111827' },
  textDark: { color: '#F8FAFC' },
  mutedDark: { color: '#9CA3AF' },
  cardDark: { backgroundColor: '#1F2937' },
  header: {
    height: 68,
    backgroundColor: 'white',
    elevation: 3,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  headerDark: { backgroundColor: '#1F2937' },
  back: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  backText: { color: '#174EA6', fontSize: 17 },
  body: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: 20,
    paddingBottom: 50,
  },
  bodyTablet: { maxWidth: 920, padding: 32 },
  searchCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    elevation: 3,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#27354A' },
  subtitle: { fontSize: 11, color: '#98A2B3', marginTop: 6 },
  search: {
    height: 52,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    marginTop: 18,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchDark: { backgroundColor: '#111827', borderColor: '#374151' },
  input: { flex: 1, fontSize: 14 },
  previousSection: { marginTop: 20 },
  previousTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#B45309',
    marginBottom: 12,
  },
  loader: { marginTop: 60 },
  error: {
    marginTop: 18,
    padding: 18,
    backgroundColor: '#FDECEC',
    borderRadius: 12,
  },
  errorText: { textAlign: 'center', color: '#B42318' },
  empty: {
    padding: 30,
    backgroundColor: 'white',
    borderRadius: 15,
    marginTop: 18,
  },
  muted: { textAlign: 'center', color: '#667085' },
  card: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    elevation: 3,
    marginTop: 20,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  flex: { flex: 1 },
  name: { fontSize: 17, fontWeight: '800', color: '#24324A' },
  company: { fontSize: 13, color: '#667085', marginTop: 7 },
  meta: { fontSize: 12, color: '#667085', marginTop: 8 },
  status: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    overflow: 'hidden',
  },
  open: { backgroundColor: '#FFF8E8', color: '#B54708' },
  closed: { backgroundColor: '#ECFDF3', color: '#027A48' },
  panel: {
    backgroundColor: '#F8FAFC',
    borderRadius: 15,
    padding: 16,
    marginTop: 16,
  },
  panelDark: { backgroundColor: '#111827' },
  panelTitle: { fontSize: 12, fontWeight: '800' },
  panelText: { fontSize: 14, lineHeight: 21, color: '#374151', marginTop: 10 },
  gallery: { marginTop: 15 },
  galleryLabel: { fontSize: 12, color: '#667085', marginBottom: 8 },
  image: { width: 92, height: 92, borderRadius: 9, marginRight: 9 },
  closeBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#6594DA',
    backgroundColor: '#F5F8FF',
    borderRadius: 15,
    padding: 16,
    marginTop: 16,
  },
  closeBoxDark: { backgroundColor: '#1E293B', borderColor: '#3B5A8A' },
  closeHelp: { fontSize: 12, color: '#174EA6', marginBottom: 11 },
  closeButton: {
    height: 50,
    borderRadius: 9,
    backgroundColor: '#1554B7',
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.55 },
  closeText: { color: 'white', fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#ECEEF1', marginTop: 17 },
  dividerDark: { backgroundColor: '#374151' },
  created: { fontSize: 10, color: '#98A2B3', marginTop: 15 },
});
