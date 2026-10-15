import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '../../components/common/AppIcon';
import {useAppTheme} from '../../store/ThemeContext';
import SignatureScreen from 'react-native-signature-canvas';
import ThumbDownIcon from '../../assets/auditor/thumb-down.svg';
import { auditorApi } from '../../api/auditor.api';
import { AuditorStackParamList } from '../../navigation/navigationTypes';
import { useAuditContext } from '../../store/AuditContext';
import { AuditReport } from '../../types/domain';

type P = NativeStackScreenProps<AuditorStackParamList, 'VisitSheet'>;
type Finding = {
  id: string;
  category: string;
  subcategory: string;
  question: any;
  response: any;
};
type CategoryGroup = {
  key: string;
  label: string;
  count: number;
  subcategories: { key: string; label: string; rows: Finding[] }[];
};
const text = (value?: string) => value?.trim() || '-';

export function VisitSheetScreen({ navigation, route }: P) {
  const {isDark} = useAppTheme();
  const insets = useSafeAreaInsets();
  const { projectId, auditId } = route.params,
    { project, audit } = useAuditContext(),
    signature = useRef<any>(null),
    { width } = useWindowDimensions(),
    wide = width >= 700,
    largeTablet = width >= 1024;
  const [sections, setSections] = useState<any[]>([]),
    [report, setReport] = useState<AuditReport | null>(null),
    [busy, setBusy] = useState(true),
    [saving, setSaving] = useState(false),
    [signing, setSigning] = useState(false),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<Finding | null>(null),
    [preview, setPreview] = useState<any>(null),
    [scrollEnabled, setScrollEnabled] = useState(true),
    [hasInk, setHasInk] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [data, reports] = await Promise.all([
        auditorApi.checklist(auditId),
        auditorApi.reports(),
      ]);
      setSections(data?.sections || []);
      setReport(
        reports.find(
          r =>
            String(r.projectId) === String(projectId) &&
            String(r.auditId) === String(auditId),
        ) || null,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [auditId, projectId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const findings = useMemo<Finding[]>(
    () =>
      sections.flatMap(s =>
        (s.questions || []).flatMap((q: any) => {
          const r = (q.auditResponses || []).find(
            (x: any) => x.responseType === 'NON_COMPLIANCE',
          );
          return r
            ? [
                {
                  id: `${s.id}-${q.id}-${r.id || 'nc'}`,
                  category: [s.mainMenuNumber, s.mainMenu || 'Checklist']
                    .filter(Boolean)
                    .join(' '),
                  subcategory: [s.sectionNumber, s.title || 'Subcategory']
                    .filter(Boolean)
                    .join(' '),
                  question: q,
                  response: r,
                },
              ]
            : [];
        }),
      ),
    [sections],
  );
  const groups = useMemo<CategoryGroup[]>(() => {
    const map = new Map<string, CategoryGroup>();
    sections.forEach(section => {
      const category = [section.mainMenuNumber, section.mainMenu || 'Checklist']
        .filter(Boolean)
        .join(' ');
      const subcategory = [
        section.sectionNumber,
        section.title || 'Subcategory',
      ]
        .filter(Boolean)
        .join(' ');
      const key = `${section.mainMenuNumber || ''}-${
        section.mainMenu || 'Checklist'
      }`;
      const rows = findings.filter(
        item => item.category === category && item.subcategory === subcategory,
      );
      const group = map.get(key) || {
        key,
        label: category,
        count: 0,
        subcategories: [],
      };
      if (rows.length) {
        group.subcategories.push({
          key: String(section.id),
          label: subcategory,
          rows,
        });
        group.count += rows.length;
      }
      map.set(key, group);
    });
    return [...map.values()];
  }, [findings, sections]);
  const save = async (data: string) => {
    if (saving) return;
    setSaving(true);
    try {
      if (!report) {
        const [p, draftRaw] = await Promise.all([
          auditorApi.progress(projectId, auditId).catch(() => ({ visitedSections: [] })),
          AsyncStorage.getItem(`@auditportal/assessment/${projectId}:${auditId}`),
        ]);
        const draft = draftRaw ? JSON.parse(draftRaw) : {};
        if (!draft.technicalDescription?.trim() || !draft.observations?.trim()) {
          throw new Error(
            'Enter the technical description and observations on the assessment screen before signing.',
          );
        }
        await auditorApi.saveReport({
          projectId,
          auditId,
          technicalDescription: draft.technicalDescription.trim(),
          observations: draft.observations.trim(),
          visitedSections: p?.visitedSections || [],
          status: 'Open',
        });
      }
      const saved = await auditorApi.saveSignature(projectId, auditId, data);
      setReport(saved);
      const p = await auditorApi.progress(projectId, auditId);
      await auditorApi.updateProgress(
        projectId,
        auditId,
        Array.from(new Set([...(p?.visitedSections || []), 6])),
      );
      signature.current?.clearSignature();
      setHasInk(false);
      setSigning(false);
      Alert.alert('Signature saved', 'Visit Sheet signed successfully.');
    } catch (e) {
      Alert.alert('Could not save signature', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const clearDraft = () => {
    if (saving) return;
    signature.current?.clearSignature();
    setHasInk(false);
  };
  const confirmSignature = () => {
    if (!hasInk || saving) return;
    signature.current?.readSignature();
  };
  const signAgain = async () => {
    if (saving) return;
    setSaving(true);
    try {
      setReport(await auditorApi.clearSignature(projectId, auditId));
      signature.current?.clearSignature();
      setHasInk(false);
      setSigning(true);
    } catch (e) {
      Alert.alert('Could not clear signature', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={[s.screen, isDark && s.screenDark]}>
      <View style={[s.header, isDark && s.cardDark, {height: 68 + insets.top, paddingTop: insets.top}]}>
        <Pressable onPress={navigation.goBack} style={s.row}>
          <Feather name="arrow-left" size={21} color="#0B4AA8" />
          <Text style={s.back}>Back</Text>
        </Pressable>
        <View style={s.count}>
          <ThumbDownIcon width={13} height={13} />
          <Text style={s.countText}>{findings.length}</Text>
        </View>
      </View>
      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.body, wide && s.wide, largeTablet && s.wideLarge]}
        scrollEnabled={scrollEnabled}
      >
        <View style={[s.hero, isDark && s.cardDark]}>
          <View style={s.heroIcon}>
            <Feather name="clipboard" size={22} color="#E33D43" />
          </View>
          <View style={s.flex}>
            <Text style={[s.title, isDark && s.textDark]}>Visit Sheet</Text>
            <Text style={[s.sub, isDark && s.mutedDark]}>
              {audit?.auditType || 'Audit'} -{' '}
              {project?.projectName || 'Selected project'}
            </Text>
          </View>
        </View>
        <Section title="Assessment Summary" icon="file-text" isDark={isDark}>
          <View style={[s.summary, wide && s.summaryWide]}>
            <Summary
              label="Technical description of the report"
              value={report?.technicalDescription || 'Not provided'}
              wide={wide}
              isDark={isDark}
            />
            <Summary
              label="Observations"
              value={report?.observations || 'Not provided'}
              wide={wide}
              isDark={isDark}
            />
          </View>
        </Section>
        {busy ? (
          <State isDark={isDark}>
            <ActivityIndicator size="large" color="#0B4AA8" />
            <Text style={[s.muted, isDark && s.mutedDark]}>Loading visit sheet...</Text>
          </State>
        ) : error ? (
          <Pressable onPress={load}>
            <State isDark={isDark}>
              <Text style={s.error}>{error}</Text>
              <Text style={s.retry}>Tap to retry</Text>
            </State>
          </Pressable>
        ) : findings.length === 0 ? (
          <State isDark={isDark}>
            <Feather name="check-circle" size={28} color="#00966D" />
            <Text style={[s.emptyTitle, isDark && s.textDark]}>No non-conformities recorded</Text>
            <Text style={[s.muted, isDark && s.mutedDark]}>All checklist responses are compliant.</Text>
          </State>
        ) : (
          <VisitTable groups={groups} onSelect={setSelected} isDark={isDark} />
        )}
        {!busy && !error && (
          <Section title="Auditor Digital Signature" icon="edit-3" isDark={isDark}>
            <View style={s.signatureContent}>
              {report?.auditorSignatureUrl && !signing ? (
                <>
                  <View style={[s.saved, isDark && s.savedDark]}>
                    <Image
                      source={{ uri: report.auditorSignatureUrl }}
                      resizeMode="contain"
                      style={s.image}
                    />
                  </View>
                  <View style={s.savedRow}>
                    <Text style={s.savedText}>✓ Signature saved</Text>
                    <Pressable
                      disabled={saving}
                      onPress={signAgain}
                      style={s.again}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color="#C62828" />
                      ) : (
                        <Feather name="rotate-ccw" size={15} color="#C62828" />
                      )}
                      <Text style={s.againText}>Sign again</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={[s.hint, isDark && s.mutedDark]}>
                    Sign inside the box using your finger or stylus.
                  </Text>
                  <View
                    style={s.signatureBox}
                    onTouchStart={() => setScrollEnabled(false)}
                    onTouchEnd={() => setScrollEnabled(true)}
                    onTouchCancel={() => setScrollEnabled(true)}
                  >
                    <SignatureScreen
                      ref={signature}
                      onOK={save}
                      onBegin={() => setHasInk(true)}
                      onClear={() => setHasInk(false)}
                      onEmpty={() =>
                        Alert.alert(
                          'Signature required',
                          'Please sign inside the box.',
                        )
                      }
                      androidHardwareAccelerationDisabled
                      webStyle={
                        'html,body{width:100%;height:100%;overscroll-behavior:none}.m-signature-pad {box-shadow:none;border:none;height:100%}.m-signature-pad--body{border:1px dashed #c9d0da;border-radius:10px;touch-action:none}.m-signature-pad--body canvas{touch-action:none}.m-signature-pad--footer{display:none}'
                      }
                    />
                  </View>
                  <View style={s.signatureActions}>
                    <Pressable
                      disabled={!hasInk}
                      onPress={clearDraft}
                      style={[s.clearButton, !hasInk && s.disabled]}
                    >
                      <Feather name="rotate-ccw" size={14} color="#4B5563" />
                      <Text style={s.clearText}>Clear</Text>
                    </Pressable>
                    <Pressable
                      disabled={!hasInk || saving}
                      onPress={confirmSignature}
                      style={[
                        s.saveSignatureButton,
                        (!hasInk || saving) && s.disabled,
                      ]}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Feather name="save" size={14} color="white" />
                      )}
                      <Text style={s.saveSignatureText}>
                        {saving ? 'Saving...' : 'Save signature'}
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </Section>
        )}
        <View style={s.footer}>
          <Text style={s.footerTitle}>Audit Smartly</Text>
          <Text style={[s.muted, isDark && s.mutedDark]}>
            Keep your sites compliant and inspections on track
          </Text>
        </View>
      </ScrollView>
      <Details
        item={selected}
        close={() => setSelected(null)}
        preview={setPreview}
        isDark={isDark}
      />
      <Preview item={preview} close={() => setPreview(null)} />
    </View>
  );
}

function VisitTable({
  groups,
  onSelect,
  isDark,
}: {
  groups: CategoryGroup[];
  onSelect: (item: Finding) => void;
  isDark?: boolean;
}) {
  return (
    <View style={[s.tableCard, isDark && s.cardDark]}>
      <ScrollView horizontal showsHorizontalScrollIndicator persistentScrollbar>
        <View style={s.table}>
          <View style={[s.tableHead, isDark && s.tableHeadDark]}>
            <Text style={[s.columnHead, isDark && s.textDark, s.questionColumn]}>Question</Text>
            <Text style={[s.columnHead, isDark && s.textDark, s.riskColumn]}>Risk</Text>
            <Text style={[s.columnHead, isDark && s.textDark, s.descriptionColumn]}>
              Non-compliance
            </Text>
            <Text style={[s.columnHead, isDark && s.textDark, s.actionColumn]}>
              Corrective action
            </Text>
          </View>
          {groups.map(group => (
            <View key={group.key}>
              <View style={[s.categoryRow, isDark && s.categoryRowDark]}>
                <Text style={s.tableLabel}>CATEGORY</Text>
                <Text numberOfLines={1} style={[s.tableCategory, isDark && s.textDark]}>
                  {group.label}
                </Text>
                <Text style={s.tableBadge}>{group.count} NC</Text>
              </View>
              {group.subcategories.map(subcategory => (
                <View key={subcategory.key}>
                  <View style={[s.subcategoryRow, isDark && s.subcategoryRowDark]}>
                    <Text style={s.subcategoryLabel}>SUBCATEGORY</Text>
                    <Text style={[s.tableSubcategory, isDark && s.textDark]}>{subcategory.label}</Text>
                  </View>
                  {subcategory.rows.map(item => (
                    <Pressable
                      key={item.id}
                      onPress={() => onSelect(item)}
                      style={({ pressed }) => [
                        s.tableRow,
                        isDark && s.tableRowDark,
                        pressed && s.pressed,
                      ]}
                    >
                      <View style={[s.cell, isDark && s.cellDark, s.questionColumn]}>
                        <Text style={[s.tableQuestionNumber, isDark && s.textDark]}>
                          {item.question.questionNumber || '-'}
                        </Text>
                        <Text style={[s.tableQuestion, isDark && s.textDark]}>
                          {item.question.text}
                        </Text>
                      </View>
                      <View style={[s.cell, isDark && s.cellDark, s.riskColumn]}>
                        <Text style={s.tableRisk}>
                          {text(item.response.riskAssessment)}
                        </Text>
                      </View>
                      <View style={[s.cell, isDark && s.cellDark, s.descriptionColumn]}>
                        <Text style={[s.cellText, isDark && s.mutedDark]}>
                          {text(item.response.description1)}
                        </Text>
                      </View>
                      <View style={[s.cell, isDark && s.cellDark, s.actionColumn]}>
                        <Text style={[s.cellText, isDark && s.mutedDark]}>
                          {text(item.response.description2)}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  icon,
  children,
  isDark,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  isDark?: boolean;
}) {
  return (
    <View style={[s.section, isDark && s.sectionDark]}>
      <View style={[s.sectionHead, isDark && s.sectionHeadDark]}>
        <Feather name={icon} size={17} color="#173B67" />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}
function Summary({
  label,
  value,
  wide,
  isDark,
}: {
  label: string;
  value: string;
  wide: boolean;
  isDark?: boolean;
}) {
  return (
    <View style={[s.summaryItem, isDark && s.summaryItemDark, wide && s.summaryItemWide]}>
      <Text style={[s.label, isDark && s.mutedDark]}>{label}</Text>
      <Text style={[s.summaryText, isDark && s.textDark]}>{value}</Text>
    </View>
  );
}
function State({ children, isDark }: { children: React.ReactNode; isDark?: boolean }) {
  return <View style={[s.state, isDark && s.cardDark]}>{children}</View>;
}
function Details({
  item,
  close,
  preview,
  isDark,
}: {
  item: Finding | null;
  close: () => void;
  preview: (x: any) => void;
  isDark?: boolean;
}) {
  const { width } = useWindowDimensions();
  const tablet = width >= 700;
  if (!item) return null;
  const evidence = (item.response.evidence || []).filter(
      (x: any) => x.evidenceType !== 'action',
    ),
    actions = (item.response.evidence || []).filter(
      (x: any) => x.evidenceType === 'action',
    );
  return (
    <Modal transparent animationType="slide" visible onRequestClose={close}>
      <View style={s.backdrop}>
        <View style={[s.sheet, tablet && s.sheetTablet, isDark && s.cardDark]}>
          <View style={[s.modalHead, isDark && s.modalHeadDark]}>
            <View style={s.flex}>
              <Text style={[s.modalTitle, isDark && s.textDark]}>NC Details</Text>
              <Text style={[s.qNo, isDark && s.mutedDark]}>
                {item.question.questionNumber || 'Question'}
              </Text>
            </View>
            <Pressable onPress={close} style={[s.close, isDark && s.closeDark]}>
              <Feather name="x" size={20} color={isDark ? '#F8FAFC' : undefined} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.modalBody}>
            <Detail label="Category" value={item.category} isDark={isDark} />
            <Detail label="Subcategory" value={item.subcategory} isDark={isDark} />
            <Detail label="Question" value={item.question.text} red isDark={isDark} />
            <Detail
              label="Risk assessment"
              value={text(item.response.riskAssessment)}
              isDark={isDark}
            />
            <Detail
              label="Non-compliance"
              value={text(item.response.description1)}
              isDark={isDark}
            />
            <Gallery label="Evidence" files={evidence} open={preview} isDark={isDark} />
            <Detail
              label="Corrective action"
              value={text(item.response.description2)}
              isDark={isDark}
            />
            <Gallery label="Resolution" files={actions} open={preview} isDark={isDark} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
function Detail({
  label,
  value,
  red,
  isDark,
}: {
  label: string;
  value: string;
  red?: boolean;
  isDark?: boolean;
}) {
  return (
    <View style={[s.detail, isDark && s.detailDark]}>
      <Text style={[s.detailLabel, isDark && s.mutedDark, red && s.red]}>{label}</Text>
      <Text style={[s.detailText, isDark && s.textDark]}>{value}</Text>
    </View>
  );
}
function Gallery({
  label,
  files,
  open,
  isDark,
}: {
  label: string;
  files: any[];
  open: (x: any) => void;
  isDark?: boolean;
}) {
  if (!files.length) return null;
  return (
    <View>
      <Text style={[s.detailLabel, isDark && s.mutedDark]}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.gallery}
      >
        {files.map((f, i) => (
          <Pressable key={f.id || i} onPress={() => open(f)} style={s.thumbBox}>
            <Image
              source={{ uri: f.imageUrl || f.url || f.uri }}
              style={s.thumb}
            />
            <View style={s.eye}>
              <Feather name="eye" size={15} color="white" />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
function Preview({ item, close }: { item: any; close: () => void }) {
  const insets = useSafeAreaInsets();
  const uri = item?.imageUrl || item?.url || item?.uri;
  return (
    <Modal
      transparent
      animationType="fade"
      visible={!!item}
      onRequestClose={close}
    >
      <View style={s.preview}>
        <Pressable onPress={close} style={[s.previewClose, {top: insets.top + 18}]}>
          <Feather name="x" size={23} color="white" />
        </Pressable>
        {uri && (
          <Image source={{ uri }} resizeMode="contain" style={s.previewImage} />
        )}
        <Text style={s.previewText}>
          {item?.imageName || item?.name || 'Evidence'}
        </Text>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F5F7' },
  screenDark: { backgroundColor: '#111827' },
  textDark: { color: '#F8FAFC' },
  mutedDark: { color: '#9CA3AF' },
  cardDark: { backgroundColor: '#1F2937' },
  header: {
    height: 68,
    paddingHorizontal: 20,
    backgroundColor: 'white',
    elevation: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  back: { color: '#0B4AA8', fontSize: 16 },
  count: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#FFF0F0',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  countText: { fontSize: 12, fontWeight: '700', color: '#C62828' },
  body: { padding: 20, paddingBottom: 42 },
  wide: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    paddingHorizontal: 24,
  },
  wideLarge: { maxWidth: 980 },
  hero: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    elevation: 2,
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FFF0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  title: { fontSize: 21, fontWeight: '800', color: '#20242A' },
  sub: { fontSize: 12, color: '#667085', marginTop: 5 },
  section: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#D9DDE5',
    borderRadius: 16,
    backgroundColor: 'white',
    overflow: 'hidden',
  },
  sectionDark: { borderColor: '#374151', backgroundColor: '#1F2937' },
  sectionHead: {
    height: 48,
    paddingHorizontal: 16,
    backgroundColor: '#EEF4FF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#E4E7EC',
  },
  sectionHeadDark: { backgroundColor: '#1E293B', borderBottomColor: '#374151' },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#173B67' },
  summary: { flexDirection: 'column' },
  summaryWide: { flexDirection: 'row' },
  summaryItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E4E7EC',
  },
  summaryItemDark: { borderBottomColor: '#374151' },
  summaryItemWide: {
    width: '50%',
    borderBottomWidth: 0,
    borderRightWidth: 1,
    borderRightColor: '#E4E7EC',
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#667085',
    textTransform: 'uppercase',
  },
  summaryText: { fontSize: 14, lineHeight: 21, color: '#303744', marginTop: 8 },
  state: {
    marginTop: 16,
    minHeight: 135,
    padding: 24,
    borderRadius: 16,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  muted: { fontSize: 12, color: '#7C8594', textAlign: 'center' },
  error: { fontSize: 13, color: '#B42318', textAlign: 'center' },
  retry: { color: '#0B4AA8', fontWeight: '700' },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#27364B' },
  tableCard: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#D4DAE3',
    borderRadius: 17,
    backgroundColor: 'white',
    overflow: 'hidden',
    elevation: 2,
  },
  table: { width: 900 },
  tableHead: {
    height: 51,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderBottomWidth: 1,
    borderBottomColor: '#D4DAE3',
  },
  tableHeadDark: { backgroundColor: '#1E293B', borderBottomColor: '#374151' },
  columnHead: {
    paddingHorizontal: 15,
    fontSize: 13,
    fontWeight: '700',
    color: '#152D51',
  },
  questionColumn: { width: 430 },
  riskColumn: { width: 120 },
  descriptionColumn: { width: 175 },
  actionColumn: { width: 175 },
  categoryRow: {
    minHeight: 56,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#DCEBFF',
    borderBottomWidth: 1,
    borderBottomColor: '#B8CBE2',
  },
  categoryRowDark: { backgroundColor: '#1E293B', borderBottomColor: '#374151' },
  tableLabel: { fontSize: 10, color: '#55708F' },
  tableCategory: {
    maxWidth: 650,
    fontSize: 16,
    fontWeight: '700',
    color: '#123F75',
  },
  tableBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D1262E',
    backgroundColor: 'white',
    borderRadius: 13,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  subcategoryRow: {
    minHeight: 47,
    paddingHorizontal: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F7F8FA',
    borderBottomWidth: 1,
    borderBottomColor: '#D9DDE5',
  },
  subcategoryRowDark: { backgroundColor: '#111827', borderBottomColor: '#374151' },
  subcategoryLabel: { fontSize: 10, color: '#8B94A3' },
  tableSubcategory: { fontSize: 13, fontWeight: '700', color: '#27364B' },
  tableRow: {
    minHeight: 170,
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E5EA',
  },
  tableRowDark: { backgroundColor: '#1F2937', borderBottomColor: '#374151' },
  cell: {
    paddingHorizontal: 15,
    paddingVertical: 18,
    borderRightWidth: 1,
    borderRightColor: '#E2E5EA',
  },
  cellDark: { borderRightColor: '#374151' },
  tableQuestionNumber: { fontSize: 12, fontWeight: '700', color: '#202B3C' },
  tableQuestion: {
    marginTop: 11,
    fontSize: 13,
    lineHeight: 22,
    color: '#263349',
  },
  tableRisk: {
    alignSelf: 'flex-start',
    borderRadius: 13,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 11,
    color: '#9A6700',
    backgroundColor: '#FFF8E7',
  },
  cellText: { fontSize: 12, lineHeight: 20, color: '#4D596B' },
  list: { marginTop: 20, gap: 12 },
  caption: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: '#667085',
  },
  group: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D9DDE5',
    overflow: 'hidden',
    backgroundColor: 'white',
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#DCEBFF',
    padding: 15,
  },
  groupTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#173B67',
    marginTop: 3,
  },
  badge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#C62828',
    backgroundColor: 'white',
    borderRadius: 13,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  finding: { padding: 15, borderTopWidth: 1, borderTopColor: '#E4E7EC' },
  pressed: { backgroundColor: '#F3F7FF' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF3B30' },
  qNo: { fontSize: 11, color: '#717B8C', fontWeight: '600' },
  subcategory: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4E5D72',
    marginTop: 8,
  },
  question: { fontSize: 14, lineHeight: 21, color: '#1D2530', marginTop: 7 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  ncTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E13238',
    backgroundColor: '#FFF2F2',
    borderRadius: 14,
    padding: 7,
  },
  riskTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9A6700',
    backgroundColor: '#FFF8E7',
    borderRadius: 14,
    padding: 7,
  },
  signatureContent: { padding: 15 },
  hint: { fontSize: 12, color: '#667085', marginBottom: 10 },
  signatureBox: { height: 285, borderRadius: 11, overflow: 'hidden' },
  saved: {
    height: 175,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#E0E4EA',
    padding: 10,
  },
  savedDark: { borderColor: '#374151', backgroundColor: '#111827' },
  image: { width: '100%', height: '100%' },
  savedRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savedText: { fontSize: 12, fontWeight: '700', color: '#087A55' },
  again: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: '#F0C5C5',
    paddingHorizontal: 13,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  againText: { fontSize: 12, fontWeight: '700', color: '#C62828' },
  signatureActions: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  clearButton: {
    height: 40,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    paddingHorizontal: 14,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  clearText: { fontSize: 12, fontWeight: '700', color: '#4B5563' },
  saveSignatureButton: {
    height: 40,
    backgroundColor: '#0B4AA8',
    paddingHorizontal: 14,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  saveSignatureText: { fontSize: 12, fontWeight: '700', color: 'white' },
  disabled: { opacity: 0.4 },
  footer: { alignItems: 'center', marginTop: 48 },
  footerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#5146F2',
    marginBottom: 8,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: 'white',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  sheetTablet: { width: '100%', maxWidth: 640, alignSelf: 'center', borderRadius: 22, marginBottom: 30 },
  modalHead: {
    height: 67,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E4E7EC',
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalHeadDark: { borderBottomColor: '#374151' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#20242A' },
  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#DDE1E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeDark: { borderColor: '#374151' },
  modalBody: { padding: 17, paddingBottom: 35, gap: 12 },
  detail: { borderRadius: 12, backgroundColor: '#F7F8FA', padding: 13 },
  detailDark: { backgroundColor: '#111827' },
  detailLabel: { fontSize: 11, fontWeight: '800', color: '#4C596C' },
  red: { color: '#C62828' },
  detailText: { fontSize: 13, lineHeight: 20, color: '#303744', marginTop: 5 },
  gallery: { gap: 10, paddingTop: 9 },
  thumbBox: {
    width: 92,
    height: 78,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: '#EEF1F5',
  },
  thumb: { width: '100%', height: '100%' },
  eye: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(11,74,168,.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  previewClose: {
    position: 'absolute',
    zIndex: 2,
    top: 45,
    right: 18,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: { width: '100%', height: '78%' },
  previewText: { fontSize: 12, color: 'white', marginTop: 12 },
});
