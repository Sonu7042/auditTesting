import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '../../components/common/AppIcon';
import { auditorApi } from '../../api/auditor.api';
import { BrandLogo } from '../../components/common/BrandLogo';
import MenuIcon from '../../assets/auditor/menu.svg';
import FooterImage from '../../assets/auditor/footer-icon.png';
import PreventiveIcon from '../../assets/auditor/preventiv-icon.svg';
import PlanIcon from '../../assets/auditor/plan-icon.svg';
import WorkforceIcon from '../../assets/auditor/workforce-icon.svg';
import MachineryIcon from '../../assets/auditor/machinery.svg';
import ChemicalIcon from '../../assets/auditor/chemical-icon.svg';
import FlowsheetIcon from '../../assets/auditor/flowsheet.svg';
import { AuditorStackParamList } from '../../navigation/navigationTypes';
import { useAuditContext } from '../../store/AuditContext';
import { useAuth } from '../../store/AuthContext';
import { AuditReport, AuditTimer } from '../../types/domain';
import { useAppTheme } from '../../store/ThemeContext';
import {
  groupReviewsBySection,
  SectionKey,
} from '../../utils/previousNcReviews';

const DAY = 86400000;
const sections = [
  {
    id: 1,
    title: 'Control Measures',
    icon: PreventiveIcon,
    sectionKey: 'CONTROL_MEASURES' as SectionKey,
  },
  {
    id: 2,
    title: 'Records & Documents',
    icon: PlanIcon,
    sectionKey: 'RECORDS_DOCUMENTS' as SectionKey,
  },
  {
    id: 3,
    title: 'Workforce',
    icon: WorkforceIcon,
    sectionKey: 'WORKFORCE' as SectionKey,
  },
  {
    id: 4,
    title: 'Machinery',
    icon: MachineryIcon,
    sectionKey: 'MACHINERY' as SectionKey,
  },
  {
    id: 5,
    title: 'Chemical Product',
    icon: ChemicalIcon,
    sectionKey: 'CHEMICAL' as SectionKey,
  },
  { id: 6, title: 'Visit Sheet', icon: FlowsheetIcon, sectionKey: null },
];
const clock = (ms: number) => {
  const total = Math.floor(Math.min(Math.max(ms, 0), DAY) / 1000);
  return `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(
    Math.floor((total % 3600) / 60),
  ).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const timerStart = (timer: AuditTimer | null) => {
  const value = new Date(timer?.startedAt || '').getTime();
  return Number.isFinite(value)
    ? value
    : Date.now() - Math.max(timer?.elapsedMs || 0, 0);
};

export function AuditAssessmentNativeScreen({
  navigation,
  route,
}: NativeStackScreenProps<AuditorStackParamList, 'Assessment'>) {
  const { isDark } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const narrow = width < 375;
  const tiny = width < 340;
  const short = height < 720;
  const tablet = width >= 600;
  const largeTablet = width >= 1024;
  const sectionWidth = largeTablet ? '23.5%' : tablet ? '31.5%' : tiny ? '100%' : '48%';
  const insets = useSafeAreaInsets();
  const { project, audit } = useAuditContext();
  const { user } = useAuth();
  const { projectId, auditId } = route.params;
  const draftKey = `@auditportal/assessment/${projectId}:${auditId}`;
  const [description, setDescription] = useState(''),
    [observations, setObservations] = useState(''),
    [visited, setVisited] = useState<number[]>([]),
    [timer, setTimer] = useState<AuditTimer | null>(null),
    [report, setReport] = useState<AuditReport | null>(null),
    [busy, setBusy] = useState(true),
    [saving, setSaving] = useState(false),
    [opening, setOpening] = useState<number | null>(null),
    [now, setNow] = useState(Date.now()),
    [help, setHelp] = useState(false),
    [technicalFocused, setTechnicalFocused] = useState(false),
    [observationFocused, setObservationFocused] = useState(false),
    [previousNc, setPreviousNc] = useState<Record<SectionKey, any[]>>(
      {} as Record<SectionKey, any[]>,
    );
  const readOnly = Boolean(
    report && ['Completed', 'Closed'].includes(report.status),
  );
  const isApproved = (item: any) =>
    (item?.approvalStatus || 'Approved') === 'Approved';
  const hasDueDate = (question: any) =>
    Boolean(question?.dueDate) ||
    Boolean(String(question?.dueDateText || '').trim());
  const load = useCallback(async () => {
    try {
      const [reports, progress, nextTimer, draft, reviews] = await Promise.all([
        auditorApi.reports(),
        auditorApi.progress(projectId, auditId),
        auditorApi.timer(projectId, auditId),
        AsyncStorage.getItem(draftKey),
        auditorApi.previousNcReviews(auditId),
      ]);
      const existing =
        reports.find(
          item =>
            String(item.projectId) === String(projectId) &&
            String(item.auditId) === String(auditId),
        ) || null;
      const saved = draft ? JSON.parse(draft) : {};
      setReport(existing);
      setDescription(
        existing?.technicalDescription || saved.technicalDescription || '',
      );
      setObservations(existing?.observations || saved.observations || '');
      const progressVisited = Array.isArray(progress?.visitedSections)
        ? progress.visitedSections
        : [];
      const reportComplete = Boolean(
        existing && ['Completed', 'Closed'].includes(existing.status),
      );
      let nextVisited =
        reportComplete && Array.isArray(existing?.visitedSections)
          ? existing.visitedSections
          : progressVisited;
      if (!reportComplete) {
        try {
          const checklist = await auditorApi.checklist(auditId);
          const approvedSections = (checklist?.sections || []).filter(
            isApproved,
          );
          const controlMeasureQuestions = approvedSections.flatMap(
            (section: any) =>
              (section.questions || []).filter(
                (question: any) =>
                  !hasDueDate(question) && isApproved(question),
              ),
          );
          const documentQuestions = approvedSections.flatMap((section: any) =>
            (section.questions || []).filter(
              (question: any) => hasDueDate(question) && isApproved(question),
            ),
          );
          const controlMeasuresComplete =
            controlMeasureQuestions.length > 0 &&
            controlMeasureQuestions.every((question: any) =>
              (question.auditResponses || []).some((response: any) =>
                ['COMPLIANCE', 'NON_COMPLIANCE', 'NOT_APPLICABLE'].includes(
                  response.responseType,
                ),
              ),
            );
          const recordsAndDocumentsComplete =
            documentQuestions.length > 0 &&
            documentQuestions.every(
              (question: any) =>
                Boolean(question.documentDueDate) &&
                Boolean(question.documentImageUrl),
            );
          const afterControlMeasures = controlMeasuresComplete
            ? Array.from(new Set([...progressVisited, 1]))
            : progressVisited.filter((id: number) => id !== 1);
          nextVisited = recordsAndDocumentsComplete
            ? Array.from(new Set([...afterControlMeasures, 2]))
            : afterControlMeasures.filter((id: number) => id !== 2);
          if (
            nextVisited.length !== progressVisited.length ||
            nextVisited.some((id: number) => !progressVisited.includes(id))
          ) {
            await auditorApi.updateProgress(projectId, auditId, nextVisited);
          }
        } catch {
          nextVisited = progressVisited;
        }
      }
      setVisited(nextVisited);
      setTimer(nextTimer);
      setPreviousNc(groupReviewsBySection(reviews));
      setNow(Date.now());
    } catch (reason) {
      Alert.alert('Unable to load assessment', (reason as Error).message);
    } finally {
      setBusy(false);
    }
  }, [auditId, draftKey, projectId]);
  useEffect(() => {
    load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') load();
    });
    const focus = navigation.addListener('focus', load);
    return () => {
      clearInterval(tick);
      app.remove();
      focus();
    };
  }, [load, navigation]);
  useEffect(() => {
    if (!busy && !readOnly)
      AsyncStorage.setItem(
        draftKey,
        JSON.stringify({ technicalDescription: description, observations }),
      );
  }, [busy, description, draftKey, observations, readOnly]);
  const remaining = useMemo(
    () =>
      readOnly || timer?.isStopped || timer?.isExpired
        ? 0
        : DAY - (now - timerStart(timer)),
    [now, readOnly, timer],
  );
  const beforeVisitComplete = [1, 2, 3, 4, 5].every(id => visited.includes(id));
  const canVisit =
    description.trim() !== '' &&
    observations.trim() !== '' &&
    beforeVisitComplete;
  const canSave = !readOnly && canVisit && visited.includes(6);
  const back = () => {
    const proceed = () => navigation.goBack();
    if (readOnly || timer?.isStopped || timer?.isExpired) return proceed();
    Alert.alert(
      'Audit assessment is in progress',
      `The timer for ${
        project?.projectName || 'this project'
      } will continue running if you leave.`,
      [
        { text: 'Stay here', style: 'cancel' },
        { text: 'Leave assessment', style: 'destructive', onPress: proceed },
      ],
    );
  };
  const openSection = async (id: number) => {
    if (readOnly || opening !== null) return;
    if (id === 6 && !canVisit)
      return Alert.alert(
        'Complete other sections first',
        'Enter the technical description and observations, then complete all other assessment sections before opening the Visit Sheet.',
      );
    setOpening(id);
    try {
      const meta = sections.find(section => section.id === id);
      const target: {
        screen: keyof AuditorStackParamList;
        params: any;
      } | null =
        id === 1
          ? { screen: 'ControlMeasures', params: { projectId, auditId } }
          : id === 2
          ? { screen: 'Documents', params: { projectId, auditId } }
          : id === 3
          ? {
              screen: 'AssetVerification',
              params: { projectId, auditId, kind: 'workforce' },
            }
          : id === 4
          ? {
              screen: 'AssetVerification',
              params: { projectId, auditId, kind: 'machinery' },
            }
          : id === 5
          ? {
              screen: 'AssetVerification',
              params: { projectId, auditId, kind: 'chemical' },
            }
          : id === 6
          ? { screen: 'VisitSheet', params: { projectId, auditId } }
          : null;
      if (!target) return;
      const openReviews = meta?.sectionKey
        ? previousNc[meta.sectionKey]?.length || 0
        : 0;
      if (openReviews > 0 && meta?.sectionKey) {
        navigation.navigate('PreviousNcReview', {
          projectId,
          auditId,
          sectionKey: meta.sectionKey,
          returnScreen: target.screen,
          returnParams: target.params,
        });
      } else navigation.navigate(target.screen as any, target.params);
    } catch (reason) {
      Alert.alert('Unable to open section', (reason as Error).message);
    } finally {
      setOpening(null);
    }
  };
  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await auditorApi.saveReport({
        projectId,
        auditId,
        technicalDescription: description.trim(),
        observations: observations.trim(),
        visitedSections: visited,
        status: 'Open',
      });
      await AsyncStorage.removeItem(draftKey);
      Alert.alert('Report saved', 'Audit report saved successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (reason) {
      Alert.alert('Save failed', (reason as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const initials = (user?.fullName || user?.username || 'A')[0].toUpperCase();
  const visit = audit?.schedules?.[0]?.date
    ? new Date(audit.schedules[0].date).toLocaleDateString('en-GB')
    : new Date().toLocaleDateString('en-GB');
  if (busy)
    return (
      <View style={[s.loading, isDark && s.screenDark]}>
        <ActivityIndicator size="large" color="#2459D3" />
      </View>
    );
  return (
    <KeyboardAvoidingView
      style={[s.screen, isDark && s.screenDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          s.header,
          (narrow || short) && s.headerCompact,
          {
            height: (narrow || short ? 68 : 90) + insets.top,
            paddingTop: insets.top,
          },
        ]}
      >
        <MenuIcon width={narrow ? 22 : 24} height={narrow ? 22 : 24} />
        <BrandLogo width={narrow ? 68 : 75} />
        <View style={s.flex} />
        <Pressable
          onPress={() => navigation.navigate('Notifications')}
          style={s.bell}
        >
          <Feather name="bell" size={narrow ? 24 : 26} color={isDark ? '#F8FAFC' : undefined} />
          <View style={s.badge}>
            <Text style={s.badgeText}>3</Text>
          </View>
        </Pressable>
        <View style={[s.avatar, narrow && s.avatarCompact]}>
          <Text style={s.avatarText}>{initials}</Text>
        </View>
      </View>
      <View style={[s.nav, isDark && s.navDark, (narrow || short) && s.navCompact]}>
        <Pressable onPress={back} style={s.back}>
          <Feather name="chevron-left" size={22} color="#064AAB" />
          <Text style={[s.backText, narrow && s.backTextCompact]}>Back</Text>
        </Pressable>
        <Pressable
          disabled={!canSave || saving}
          onPress={save}
          style={[s.save, narrow && s.saveCompact, canSave && s.saveReady]}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Feather name="save" size={18} color="white" />
              <Text style={s.saveText}>{readOnly ? 'Completed' : 'Save'}</Text>
            </>
          )}
        </Pressable>
      </View>
      <ScrollView
        style={s.flex}
        contentContainerStyle={[
          s.content,
          narrow && s.contentNarrow,
          tablet && s.contentTablet,
          largeTablet && s.contentLargeTablet,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[s.projectCard, isDark && s.cardDark, narrow && s.cardCompact]}>
          <View style={s.projectHead}>
            <View style={[s.building, isDark && s.buildingDark, narrow && s.buildingCompact]}>
              <Feather
                name="briefcase"
                size={narrow ? 22 : 25}
                color="#2459D3"
              />
            </View>
            <View style={s.flex}>
              <Text numberOfLines={2} style={[s.projectName, isDark && s.textDark]}>
                {project?.projectName || 'Project'}
              </Text>
              <Text numberOfLines={2} style={[s.address, isDark && s.mutedDark]}>
                {project?.siteAddress || 'Site address not available'}
              </Text>
            </View>
          </View>
          <View style={[s.divider, isDark && s.dividerDark]} />
          <View style={s.details}>
            <Detail
              label="Company"
              value={project?.company?.companyName || 'Company not available'}
              isDark={isDark}
            />
            <Detail label="Visit" value={visit} isDark={isDark} />
            <Detail label="Time Left" value={clock(remaining)} danger isDark={isDark} />
            <Detail
              label="Audit Type"
              value={audit?.auditType || 'Audit Assessment'}
              isDark={isDark}
            />
          </View>
        </View>
        <View style={[s.form, isDark && s.cardDark, narrow && s.cardCompact]}>
          <Text style={[s.fieldLabel, isDark && s.textDark]}>Technical description of the report</Text>
          <TextInput
            editable={!readOnly}
            multiline
            value={description}
            onChangeText={setDescription}
            onFocus={() => setTechnicalFocused(true)}
            onBlur={() => setTechnicalFocused(Boolean(description.trim()))}
            placeholder="Description of the report"
            placeholderTextColor="#AAB3C2"
            style={[s.input, isDark && s.inputDark, technicalFocused && s.inputExpanded]}
          />
          <Text style={[s.fieldLabel, isDark && s.textDark]}>Observations</Text>
          <TextInput
            editable={!readOnly}
            multiline
            value={observations}
            onChangeText={setObservations}
            onFocus={() => setObservationFocused(true)}
            onBlur={() => setObservationFocused(Boolean(observations.trim()))}
            placeholder="Observations of the report"
            placeholderTextColor="#AAB3C2"
            style={[s.input, isDark && s.inputDark, observationFocused && s.inputExpanded]}
          />
        </View>
        <View style={s.sectionTitle}>
          <Text style={[s.sectionHeading, isDark && s.textDark, narrow && s.sectionHeadingCompact]}>
            Assess the sections by clicking on each one
          </Text>
          <Pressable hitSlop={12} onPress={() => setHelp(true)}>
            <Feather name="help-circle" size={24} color="#0A58FF" />
          </Pressable>
        </View>
        <View style={s.grid}>
          {sections.map(section => {
            const locked = section.id === 6 && !canVisit;
            const done = visited.includes(section.id);
            const pendingReviews = section.sectionKey
              ? previousNc[section.sectionKey]?.length || 0
              : 0;
            return (
              <Pressable
                key={section.id}
                disabled={readOnly || opening !== null || locked}
                onPress={() => openSection(section.id)}
                style={[
                  s.section,
                  isDark && s.cardDark,
                  { width: sectionWidth },
                  narrow && s.sectionCompact,
                  locked && s.locked,
                ]}
              >
                {done && (
                  <Feather
                    name="check-circle"
                    size={23}
                    color="#00A84F"
                    style={s.check}
                  />
                )}
                <section.icon
                  width={narrow ? 38 : 44}
                  height={narrow ? 38 : 44}
                />
                <Text
                  style={[
                    s.sectionName,
                    isDark && s.textDark,
                    narrow && s.sectionNameCompact,
                    locked && s.lockedText,
                  ]}
                >
                  {section.title}
                </Text>
                {pendingReviews > 0 && (
                  <Text style={s.lockText}>
                    Review {pendingReviews} previous non-compliance(s) first
                  </Text>
                )}
                {locked && (
                  <Text style={s.lockText}>
                    Complete the report details and all other sections first
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
        <View style={s.footer}>
          <View style={s.footerRow}>
            <Image
              source={FooterImage}
              style={s.footerImage}
              resizeMode="contain"
            />
            <View>
              <Text style={s.footerTitle}>Audit Smartly</Text>
              <Text style={[s.footerSub, isDark && s.mutedDark]}>Compliance made simple</Text>
            </View>
          </View>
          <Text style={[s.footerNote, isDark && s.mutedDark]}>
            Built for auditors to inspect faster, report smarter, and stay
            compliant.
          </Text>
        </View>
      </ScrollView>
      <Modal
        transparent
        visible={help}
        animationType="slide"
        onRequestClose={() => setHelp(false)}
      >
        <Pressable style={s.modalBack} onPress={() => setHelp(false)}>
          <Pressable
            style={[s.guide, isDark && s.cardDark, tablet && s.guideTablet]}
            onPress={event => event.stopPropagation()}
          >
            <View style={s.handle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.guideHead}>
                <View style={s.flex}>
                  <Text style={[s.guideTitle, isDark && s.textDark]}>Assessment Guide</Text>
                  <Text style={[s.guideSub, isDark && s.mutedDark]}>
                    Complete all sections before submitting the audit
                  </Text>
                </View>
                <Pressable hitSlop={12} onPress={() => setHelp(false)}>
                  <Feather name="x" size={23} color={isDark ? '#F8FAFC' : undefined} />
                </Pressable>
              </View>
              <Text style={s.guideInfo}>
                Please assess every section carefully. Completed sections ensure
                a complete and compliant audit report.
              </Text>
              {sections.slice(0, 5).map(item => (
                <View key={item.id} style={[s.guideItem, isDark && s.guideItemDark]}>
                  <Text style={[s.guideItemTitle, isDark && s.textDark]}>{item.title}</Text>
                  <Text style={[s.guideSub, isDark && s.mutedDark]}>
                    Complete required checks and upload supporting evidence.
                  </Text>
                </View>
              ))}
              <Pressable onPress={() => setHelp(false)} style={s.gotIt}>
                <Text style={s.gotText}>Got It</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}
function Detail({
  label,
  value,
  danger,
  isDark,
}: {
  label: string;
  value: string;
  danger?: boolean;
  isDark?: boolean;
}) {
  return (
    <View style={s.detail}>
      <Text style={[s.detailLabel, isDark && s.mutedDark]}>{label}</Text>
      <Text numberOfLines={2} style={[s.detailValue, isDark && s.textDark, danger && s.danger]}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F2F2F2' },
  screenDark: { backgroundColor: '#111827' },
  textDark: { color: '#F8FAFC' },
  mutedDark: { color: '#9CA3AF' },
  cardDark: { backgroundColor: '#1F2937' },
  buildingDark: { backgroundColor: '#26344A' },
  dividerDark: { backgroundColor: '#374151' },
  navDark: { backgroundColor: '#1F2937' },
  inputDark: { backgroundColor: '#111827', borderColor: '#374151', color: '#F8FAFC' },
  guideItemDark: { borderColor: '#374151' },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F2',
  },
  header: {
    height: 90,
    paddingHorizontal: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 17,
  },
  headerCompact: { height: 68, paddingHorizontal: 14, gap: 11 },
  flex: { flex: 1 },
  bell: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 0,
    top: 0,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF3B48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: 'white' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#29394D',
    borderWidth: 3,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  avatarCompact: { width: 40, height: 40, borderRadius: 20 },
  avatarText: { color: 'white', fontWeight: '800', fontSize: 17 },
  nav: {
    height: 91,
    backgroundColor: 'white',
    paddingHorizontal: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 3,
  },
  navCompact: { height: 70, paddingHorizontal: 14 },
  back: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { fontSize: 19, color: '#064AAB' },
  backTextCompact: { fontSize: 17 },
  save: {
    minWidth: 116,
    height: 50,
    borderRadius: 10,
    backgroundColor: '#9DA6B5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  saveCompact: { minWidth: 100, height: 46 },
  saveReady: { backgroundColor: '#0757BE' },
  saveText: { fontSize: 17, color: 'white', fontWeight: '600' },
  content: {
    width: '100%',
    maxWidth: 850,
    alignSelf: 'center',
    padding: 24,
    paddingBottom: 35,
    gap: 28,
  },
  contentNarrow: { padding: 14, gap: 22 },
  contentTablet: { paddingHorizontal: 32 },
  contentLargeTablet: { maxWidth: 1080 },
  projectCard: {
    backgroundColor: 'white',
    borderRadius: 17,
    padding: 20,
    elevation: 5,
  },
  cardCompact: { padding: 15 },
  projectHead: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  building: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: '#EAF0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buildingCompact: { width: 50, height: 50 },
  projectName: { fontSize: 18, fontWeight: '700', color: '#171717' },
  address: { fontSize: 15, color: '#687386', marginTop: 7 },
  divider: { height: 1, backgroundColor: '#343434', marginVertical: 20 },
  details: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 22 },
  detail: { width: '50%', paddingRight: 8 },
  detailLabel: { fontSize: 15, color: '#687386' },
  detailValue: {
    fontSize: 17,
    color: '#191919',
    marginTop: 6,
    fontWeight: '600',
  },
  danger: { color: '#FF334A' },
  form: {
    backgroundColor: 'white',
    borderRadius: 17,
    padding: 20,
    elevation: 5,
    gap: 11,
  },
  fieldLabel: { fontSize: 16, fontWeight: '600', color: '#111' },
  input: {
    minHeight: 61,
    maxHeight: 160,
    borderWidth: 1,
    borderColor: '#CAD1DE',
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 16,
    color: '#222',
    textAlignVertical: 'top',
    marginBottom: 9,
  },
  inputExpanded: { minHeight: 110, borderColor: '#3779E5' },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionHeading: { fontSize: 18, fontWeight: '700', color: '#111', flex: 1 },
  sectionHeadingCompact: { fontSize: 16, lineHeight: 22 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 24,
  },
  section: {
    minHeight: 166,
    borderRadius: 16,
    backgroundColor: 'white',
    padding: 25,
    justifyContent: 'center',
    alignItems: 'flex-start',
    elevation: 4,
  },
  sectionCompact: { minHeight: 145, padding: 18 },
  locked: { opacity: 0.58 },
  check: { position: 'absolute', right: 14, top: 14 },
  sectionName: { fontSize: 16, color: '#111', marginTop: 23, lineHeight: 23 },
  sectionNameCompact: { fontSize: 14, marginTop: 16, lineHeight: 20 },
  lockedText: { color: '#666' },
  lockText: { fontSize: 11, lineHeight: 17, color: '#E47B45', marginTop: 12 },
  footer: { alignItems: 'center', paddingTop: 36 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerImage: { width: 44, height: 44 },
  footerTitle: { fontSize: 19, fontWeight: '800', color: '#07419B' },
  footerSub: { fontSize: 13, color: '#8490A4', marginTop: 5 },
  footerNote: {
    fontSize: 12,
    color: '#A2ABBC',
    textAlign: 'center',
    marginTop: 35,
  },
  modalBack: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.45)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  guide: {
    width: '100%',
    maxHeight: '78%',
    backgroundColor: 'white',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
  },
  guideTablet: { maxWidth: 560, borderRadius: 28, marginBottom: 30 },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 17,
  },
  guideHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 17,
  },
  guideTitle: { fontSize: 20, fontWeight: '800' },
  guideSub: { fontSize: 12, color: '#687386', marginTop: 5 },
  guideInfo: {
    backgroundColor: '#EFF6FF',
    color: '#1E4F91',
    padding: 14,
    borderRadius: 12,
    lineHeight: 20,
  },
  guideItem: {
    borderWidth: 1,
    borderColor: '#E3E5E9',
    borderRadius: 11,
    padding: 12,
    marginTop: 10,
  },
  guideItemTitle: { fontSize: 14, fontWeight: '700' },
  gotIt: {
    height: 50,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
  },
  gotText: { color: 'white', fontWeight: '700' },
});
