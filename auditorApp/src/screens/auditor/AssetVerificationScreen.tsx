import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '../../components/common/AppIcon';
import {useAppTheme} from '../../store/ThemeContext';
import { auditorApi } from '../../api/auditor.api';
import { AuditorStackParamList } from '../../navigation/navigationTypes';
import { filterCurrentAuditRecords } from '../../utils/auditRecordVisibility';
type P = NativeStackScreenProps<AuditorStackParamList, 'AssetVerification'>;
const meta = {
  workforce: {
    title: 'Workforce',
    plural: 'workers',
    id: (x: any) => x.id || x._id || x.workerId,
    name: (x: any) => x.fullName,
    lines: (x: any) => [
      `Phone : ${x.phoneNumber || '-'}`,
      `Role : ${x.workerRole || '-'}`,
    ],
    section: 3,
  },
  machinery: {
    title: 'Machinery',
    plural: 'machineries',
    id: (x: any) => x.id,
    name: (x: any) => x.machineryName,
    lines: (x: any) => [
      `ID : ${x.machineryId || '-'}`,
      `Inspection document : ${x.inspectionDocumentName || '-'}`,
    ],
    section: 4,
  },
  chemical: {
    title: 'Chemical Product',
    plural: 'chemicals',
    id: (x: any) => x.id,
    name: (x: any) => x.chemicalName,
    lines: (x: any) => [
      `ID : ${x.chemicalId || '-'}`,
      `Safety data sheet : ${x.safetyDataSheetName || '-'}`,
    ],
    section: 5,
  },
};
export function AssetVerificationScreen({ navigation, route }: P) {
  const {isDark} = useAppTheme();
  const insets = useSafeAreaInsets();
  const { projectId, auditId, kind } = route.params,
    m = meta[kind],
    { width } = useWindowDimensions(),
    tablet = width >= 700,
    cols = width >= 1024 ? 4 : width >= 700 ? 3 : width >= 390 ? 2 : 1;
  const [items, setItems] = useState<any[]>([]),
    [checked, setChecked] = useState<string[]>([]),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [selectedItem, setSelectedItem] = useState<any | null>(null);
  const key = `@auditportal/${kind}/${projectId}:${auditId}`;
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [raw, timer] = await Promise.all([
        kind === 'workforce'
          ? auditorApi.workforce(projectId)
          : kind === 'machinery'
          ? auditorApi.machinery(projectId)
          : auditorApi.chemicals(projectId),
        auditId
          ? auditorApi.timer(projectId, auditId).catch(() => null)
          : Promise.resolve(null),
      ]);
      const list = filterCurrentAuditRecords(
        raw.filter((x: any) => x.status === 'Approved'),
        timer?.startedAt,
      );
      setItems(list);
      if (kind === 'workforce') {
        const saved = JSON.parse((await AsyncStorage.getItem(key)) || '[]');
        setChecked(saved);
      } else {
        const saved = await auditorApi.assetVerification(
          kind,
          projectId,
          auditId,
        );
        setChecked(
          (
            saved?.[
              kind === 'machinery' ? 'checkedMachineries' : 'checkedChemicals'
            ] || []
          ).map((x: any) => x.id),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [auditId, key, kind, projectId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const shown = useMemo(
    () =>
      items.filter(x =>
        `${m.name(x)} ${m.lines(x).join(' ')}`
          .toLowerCase()
          .includes(query.toLowerCase().trim()),
      ),
    [items, m, query],
  );
  const all = items.length > 0 && items.every(x => checked.includes(m.id(x)));
  const toggle = (id: string) =>
    setChecked(v => (v.includes(id) ? v.filter(x => x !== id) : [...v, id]));
  const save = async () => {
    if (!all)
      return Alert.alert(
        'Verification incomplete',
        `Check every ${m.title.toLowerCase()} record before saving.`,
      );
    setSaving(true);
    try {
      const selected = items.filter(x => checked.includes(m.id(x)));
      if (kind === 'workforce')
        await AsyncStorage.setItem(key, JSON.stringify(checked));
      else
        await auditorApi.saveAssetVerification(kind, {
          projectId,
          auditId,
          [kind === 'machinery' ? 'checkedMachineries' : 'checkedChemicals']:
            selected,
        });
      const p = await auditorApi.progress(projectId, auditId),
        visited = Array.isArray(p?.visitedSections) ? p.visitedSections : [];
      await auditorApi.updateProgress(
        projectId,
        auditId,
        Array.from(new Set([...visited, m.section])),
      );
      Alert.alert('Saved', `${m.title} verification saved successfully.`);
    } catch (e) {
      Alert.alert('Unable to save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={[s.screen, isDark && s.screenDark]}>
      <View style={[s.header, isDark && s.headerDark, {height: 70 + insets.top, paddingTop: insets.top}]}>
        <Pressable onPress={navigation.goBack} style={s.back}>
          <Feather name="arrow-left" color="#0754AD" size={20} />
          <Text style={s.backText}>Back</Text>
        </Pressable>
        <Pressable
          disabled={!all || saving}
          onPress={save}
          style={[s.save, !all && s.disabled]}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Feather name="save" color="white" size={16} />
              <Text style={s.saveText}>Save</Text>
            </>
          )}
        </Pressable>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={[s.body, tablet && s.bodyTablet]}>
        <View style={[s.searchCard, isDark && s.cardDark]}>
          <Text style={[s.title, isDark && s.textDark]}>{m.title}</Text>
          <Text style={[s.sub, isDark && s.mutedDark]}>
            {items.length} admin-approved {m.plural}
          </Text>
          <View style={[s.search, isDark && s.searchDark]}>
            <Feather name="search" color="#9CA3AF" size={16} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Insert text to filter"
              placeholderTextColor={isDark ? '#6B7280' : undefined}
              style={[s.searchInput, isDark && s.textDark]}
            />
          </View>
        </View>
        {busy ? (
          <ActivityIndicator style={s.loader} size="large" color="#0754AD" />
        ) : error ? (
          <Pressable onPress={load} style={s.error}>
            <Text style={s.errorText}>
              {error}
              {'\n'}Tap to retry
            </Text>
          </Pressable>
        ) : (
          <View style={s.grid}>
            {shown.map(x => {
              const id = m.id(x),
                on = checked.includes(id);
              return (
                <View
                  key={id}
                  style={[
                    s.card,
                    isDark && s.cardDark,
                    { width: `${100 / cols - 2}%` },
                    on && s.cardOn,
                  ]}
                >
                  <Text style={s.name}>Name : {m.name(x) || '-'}</Text>
                  {m.lines(x).map(line => (
                    <Text key={line} style={s.line}>
                      {line}
                    </Text>
                  ))}
                  <Pressable
                    onPress={() =>
                      kind === 'workforce' ? toggle(id) : setSelectedItem(x)
                    }
                    style={[s.check, on && s.checked]}
                  >
                    <Feather name="check-circle" color="white" size={16} />
                    <Text style={s.checkText}>{on ? 'Checked' : 'Check'}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
        <Text style={s.footer}>Audit Smartly</Text>
      </ScrollView>
      <AssetDetailsModal
        visible={Boolean(selectedItem)}
        item={selectedItem}
        kind={kind}
        checked={selectedItem ? checked.includes(m.id(selectedItem)) : false}
        onClose={() => setSelectedItem(null)}
        onCheck={() => {
          if (selectedItem) toggle(m.id(selectedItem));
          setSelectedItem(null);
        }}
        isDark={isDark}
      />
    </View>
  );
}

function AssetDetailsModal({
  visible,
  item,
  kind,
  checked,
  onClose,
  onCheck,
  isDark,
}: {
  visible: boolean;
  item: any;
  kind: 'workforce' | 'machinery' | 'chemical';
  checked: boolean;
  onClose: () => void;
  onCheck: () => void;
  isDark?: boolean;
}) {
  if (!item || kind === 'workforce') return null;
  const machinery = kind === 'machinery';
  const title = machinery ? 'Machinery Verification' : 'Chemical Verification';
  const name = machinery ? item.machineryName : item.chemicalName;
  const documentName = machinery
    ? item.inspectionDocumentName
    : item.safetyDataSheetName;
  const documentUrl = machinery
    ? item.inspectionDocumentUrl 
    : item.safetyDataSheetUrl;
  const documentType = machinery
    ? item.inspectionDocumentType
    : item.safetyDataSheetType;
  const imageName = machinery ? item.machineryImageName : item.chemicalImageName;
  const imageUrl = machinery ? item.machineryImageUrl : item.chemicalImageUrl;
  const isImage = (type?: string, url?: string) =>
    Boolean(type?.startsWith('image/') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url || ''));
  const openDocument = async () => {
    if (!documentUrl) return;
    try {
      await Linking.openURL(documentUrl);
    } catch {
      Alert.alert('Unable to open document');
    }
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.modalShade}>
        <View style={[s.modalCard, isDark && s.modalCardDark]}>
          <View style={[s.modalHeader, isDark && s.modalHeaderDark]}>
            <Text style={[s.modalTitle, isDark && s.textDark]}>{title}</Text>
            <Pressable onPress={onClose} style={[s.close, isDark && s.closeDark]} hitSlop={8}>
              <Feather name="x" size={21} color={isDark ? '#F8FAFC' : '#344054'} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.modalBody}>
            <DetailLabel label="Name" value={name} isDark={isDark} />
            <DetailLabel
              label={machinery ? 'Inspection' : 'SDS'}
              value={documentName}
              large
              isDark={isDark}
            />
            {documentUrl ? (
              isImage(documentType, documentUrl) ? (
                <Pressable onPress={openDocument} style={[s.documentFrame, isDark && s.cardDark]}>
                  <Image
                    source={{ uri: documentUrl }}
                    style={s.documentPreview}
                    resizeMode="contain"
                  />
                </Pressable>
              ) : (
                <Pressable onPress={openDocument} style={[s.openDocument, isDark && s.cardDark]}>
                  <Feather name="file-text" size={22} color="#0754AD" />
                  <Text style={s.openDocumentText}>Open inspection document</Text>
                </Pressable>
              )
            ) : (
              <View style={s.noPreview}>
                <Feather name="file-text" size={24} color="#98A2B3" />
                <Text style={[s.noPreviewText, isDark && s.mutedDark]}>No document uploaded</Text>
              </View>
            )}
            <DetailLabel label="Image" value={imageName} isDark={isDark} />
            <View style={[s.assetFrame, isDark && s.cardDark]}>
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={s.assetImage} resizeMode="contain" />
              ) : (
                <View style={s.noPreview}>
                  <Feather name="image" size={24} color="#98A2B3" />
                  <Text style={[s.noPreviewText, isDark && s.mutedDark]}>No {machinery ? 'machinery' : 'chemical'} image uploaded</Text>
                </View>
              )}
            </View>
          </ScrollView>
          <View style={[s.modalFooter, isDark && s.modalHeaderDark]}>
            <Pressable onPress={onCheck} style={[s.modalCheck, checked && s.checked]}>
              <Feather name="check-circle" size={21} color="white" />
              <Text style={s.modalCheckText}>{checked ? 'Checked' : 'Check'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DetailLabel({ label, value, large, isDark }: { label: string; value?: string; large?: boolean; isDark?: boolean }) {
  return (
    <Text style={[s.detailText, isDark && s.textDark, large && s.detailLarge]}>
      <Text style={s.detailLabel}>{label} : </Text>
      {value || '-'}
    </Text>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F5F6' },
  screenDark: { backgroundColor: '#111827' },
  textDark: { color: '#F8FAFC' },
  mutedDark: { color: '#9CA3AF' },
  cardDark: { backgroundColor: '#1F2937' },
  scroll: { flex: 1 },
  header: {
    height: 70,
    backgroundColor: 'white',
    paddingHorizontal: 18,
    elevation: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerDark: { backgroundColor: '#1F2937' },
  back: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  backText: { color: '#0754AD', fontSize: 16 },
  save: {
    height: 42,
    minWidth: 96,
    borderRadius: 8,
    backgroundColor: '#0754AD',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
  saveText: { color: 'white', fontWeight: '700' },
  body: { padding: 16, paddingBottom: 92 },
  bodyTablet: { maxWidth: 1180, width: '100%', alignSelf: 'center', padding: 28 },
  searchCard: {
    padding: 18,
    backgroundColor: 'white',
    borderRadius: 16,
    elevation: 3,
  },
  title: { fontSize: 21, fontWeight: '700', color: '#374151' },
  sub: { fontSize: 12, marginTop: 6, color: '#444' },
  search: {
    height: 44,
    marginTop: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#CECECE',
    backgroundColor: '#F2F2F2',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  searchDark: { backgroundColor: '#111827', borderColor: '#374151' },
  searchInput: { flex: 1, marginLeft: 8 },
  loader: { marginTop: 60 },
  error: {
    padding: 20,
    marginTop: 18,
    backgroundColor: '#FDECEC',
    borderRadius: 12,
  },
  errorText: { color: '#B42318', textAlign: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 16,
  },
  card: {
    minWidth: 0,
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 14,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardOn: { borderColor: '#118546' },
  name: { fontSize: 13, fontWeight: '700', color: '#087B6A' },
  line: { fontSize: 12, lineHeight: 20, color: '#087B6A' },
  check: {
    height: 40,
    borderRadius: 7,
    backgroundColor: '#107C10',
    marginTop: 13,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: { backgroundColor: '#14532D' },
  checkText: { color: 'white', fontWeight: '700' },
  footer: {
    marginTop: 52,
    textAlign: 'center',
    color: '#5046EF',
    fontSize: 18,
    fontWeight: '800',
  },
  modalShade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.42)',
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '94%',
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#F7F7F7',
  },
  modalCardDark: { backgroundColor: '#111827' },
  modalHeader: {
    minHeight: 80,
    paddingHorizontal: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalHeaderDark: { backgroundColor: '#1F2937', borderColor: '#374151' },
  modalTitle: { fontSize: 21, fontWeight: '600', color: '#1F2937' },
  close: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F4F4F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeDark: { borderColor: '#374151', backgroundColor: '#1F2937' },
  modalBody: { padding: 20, paddingBottom: 26 },
  detailText: { fontSize: 16, lineHeight: 24, color: '#30343B', marginBottom: 14 },
  detailLarge: { fontSize: 18, lineHeight: 28 },
  detailLabel: { color: '#00966E', fontWeight: '600' },
  documentFrame: {
    minHeight: 210,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: 'white',
    padding: 8,
    marginBottom: 24,
  },
  documentPreview: { width: '100%', height: 230 },
  openDocument: {
    minHeight: 90,
    borderRadius: 12,
    backgroundColor: 'white',
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  openDocumentText: { color: '#0754AD', fontWeight: '700' },
  noPreview: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: 9 },
  noPreviewText: { color: '#667085', textAlign: 'center' },
  assetFrame: { minHeight: 220, borderRadius: 14, backgroundColor: 'white', padding: 12 },
  assetImage: { width: '100%', height: 270 },
  modalFooter: {
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    padding: 18,
  },
  modalCheck: {
    height: 60,
    borderRadius: 12,
    backgroundColor: '#079315',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  modalCheckText: { color: 'white', fontSize: 17, fontWeight: '700' },
});
