import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '../../components/common/AppIcon';
import { auditorApi } from '../../api/auditor.api';
import { AuditorHeader } from '../../components/common/AuditorHeader';
import FooterImage from '../../assets/auditor/footer-icon.png';
import { AuditorStackParamList } from '../../navigation/navigationTypes';
import { useAuditContext } from '../../store/AuditContext';
import { useAuth } from '../../store/AuthContext';
import { Audit, AuditTimer, Project } from '../../types/domain';
import { useAppTheme } from '../../store/ThemeContext';

const DAY = 86400000;
const key = (projectId: string, auditId: string) => `${projectId}:${auditId}`;
const running = (timer?: AuditTimer) =>
  Boolean(timer?.startedAt && !timer.isStopped && !timer.isExpired);
const remaining = (timer: AuditTimer, now: number) => {
  const start = new Date(timer.startedAt || '').getTime();
  return Math.max(
    Number.isFinite(start) ? DAY - (now - start) : timer.remainingMs || 0,
    0,
  );
};
const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(
    Math.floor((seconds % 3600) / 60),
  ).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
const latestSeries = (audits: Audit[] = []) => {
  const map = new Map<string, Audit>();
  [...audits]
    .sort(
      (a, b) =>
        (b.cycleNumber || 1) - (a.cycleNumber || 1) ||
        String(b.id).localeCompare(String(a.id)),
    )
    .forEach(audit => {
      const series = `${audit.auditType}:${
        audit.checklistType || audit.checklistTemplate?.id || ''
      }`;
      if (!map.has(series)) map.set(series, audit);
    });
  return [...map.values()];
};

export function ProjectSelectionNativeScreen({
  navigation,
}: NativeStackScreenProps<AuditorStackParamList, 'ProjectSelection'>) {
  const { isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const narrow = width < 380;
  const tablet = width >= 768;
  const largeTablet = width >= 1024;
  const { user } = useAuth();
  const {
    project: storedProject,
    audit: storedAudit,
    select,
    clear,
  } = useAuditContext();
  const [projects, setProjects] = useState<Project[]>([]),
    [query, setQuery] = useState(''),
    [selectedId, setSelectedId] = useState(storedProject?.id || ''),
    [expandedId, setExpandedId] = useState(''),
    [auditIds, setAuditIds] = useState<Record<string, string>>(
      storedProject && storedAudit
        ? { [storedProject.id]: storedAudit.id }
        : {},
    ),
    [timers, setTimers] = useState<Record<string, AuditTimer>>({}),
    [busy, setBusy] = useState(true),
    [opening, setOpening] = useState(false),
    [error, setError] = useState(''),
    [now, setNow] = useState(Date.now());
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const all = await auditorApi.projects();
      const assigned = all.filter(
        project =>
          !user?.id ||
          (project.audits || []).some(audit =>
            (audit.auditors || []).some(
              person => String(person.userId) === String(user.id),
            ),
          ),
      );
      const requests = assigned.flatMap(project =>
        (project.audits || []).map(async audit => ({
          projectId: project.id,
          auditId: audit.id,
          timer: await auditorApi.timer(project.id, audit.id),
        })),
      );
      const results = await Promise.allSettled(requests);
      const next: Record<string, AuditTimer> = {};
      let first: { projectId: string; auditId: string } | undefined;
      results.forEach(result => {
        if (result.status === 'fulfilled' && running(result.value.timer)) {
          next[key(result.value.projectId, result.value.auditId)] =
            result.value.timer;
          if (!first) first = result.value;
        }
      });
      setProjects(assigned);
      setTimers(next);
      if (first) {
        setSelectedId(current => current || first!.projectId);
        setExpandedId(current => current || first!.projectId);
        setAuditIds(current => ({
          ...current,
          [first!.projectId]: current[first!.projectId] || first!.auditId,
        }));
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }, [user?.id]);
  useEffect(() => {
    load();
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [load]);
  const filtered = useMemo(
    () =>
      projects.filter(project =>
        `${project.projectName} ${project.company?.companyName || ''} ${
          project.siteAddress || ''
        }`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [projects, query],
  );
  const chosenProject = projects.find(
    project => String(project.id) === String(selectedId),
  );
  const selectedAudit = (project: Project) => {
    const audits = latestSeries(project.audits);
    return (
      audits.find(audit => String(audit.id) === String(auditIds[project.id])) ||
      audits[0]
    );
  };
  const choose = async (project: Project) => {
    if (selectedId === project.id) {
      setSelectedId('');
      await clear();
      return;
    }
    const audit = selectedAudit(project);
    setSelectedId(project.id);
    setExpandedId(project.id);
    if (audit) {
      setAuditIds(current => ({ ...current, [project.id]: audit.id }));
      await select(project, audit);
    }
  };
  const next = async () => {
    if (!chosenProject || opening) return;
    let audit = selectedAudit(chosenProject);
    if (!audit)
      return Alert.alert(
        'Audit unavailable',
        'No audit type is assigned to this project.',
      );
    setOpening(true);
    setError('');
    try {
      const [timer, reports] = await Promise.all([
        auditorApi.timer(chosenProject.id, audit.id),
        auditorApi.reports(),
      ]);
      const report = reports.find(
        item =>
          String(item.projectId) === String(chosenProject.id) &&
          String(item.auditId) === String(audit.id),
      );
      if (
        timer?.isStopped ||
        timer?.isExpired ||
        ['Completed', 'Closed'].includes(report?.status || '')
      )
        audit = await auditorApi.reAudit(audit.id);
      const nextProject = {
        ...(audit.project || chosenProject),
        audits: [
          audit,
          ...(chosenProject.audits || []).filter(
            item => String(item.id) !== String(audit.id),
          ),
        ],
      };
      await select(nextProject, audit);
      const started = await auditorApi.startTimer(nextProject.id, audit.id);
      if (!running(started))
        throw new Error(
          'The new audit timer could not be started. Please try again.',
        );
      navigation.replace('AuditOverview', {
        projectId: nextProject.id,
        auditId: audit.id,
      });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setOpening(false);
    }
  };
  return (
    <View style={[s.screen, isDark && s.screenDark]}>
      <AuditorHeader navigation={navigation} />
      <View style={[s.nav, isDark && s.navDark]}>
        <Pressable onPress={() => navigation.goBack()} style={s.navButton}>
          <Feather name="arrow-left" size={20} color="#2459D3" />
          <Text style={s.navText}>Back</Text>
        </Pressable>
        <Pressable
          disabled={!chosenProject || opening}
          onPress={next}
          style={s.navButton}
        >
          <Text
            style={[s.navText, (!chosenProject || opening) && s.disabledText]}
          >
            {opening ? 'Opening...' : 'Next'}
          </Text>
          <Feather
            name="arrow-right"
            size={20}
            color={!chosenProject || opening ? '#9CA3AF' : '#2459D3'}
          />
        </Pressable>
      </View>
      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.content, narrow && s.contentNarrow, tablet && s.contentTablet, largeTablet && s.contentLargeTablet]}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[s.title, isDark && s.textDark]}>Select Project</Text>
        <View style={[s.search, isDark && s.searchDark]}>
          <Feather name="search" size={20} color="#9AA4B5" />
          <TextInput
            style={[s.searchInput, isDark && s.textDark]}
            placeholder="Search By Company Name ..."
            placeholderTextColor={isDark ? '#6B7280' : undefined}
            value={query}
            onChangeText={setQuery}
          />
        </View>
        {!!error && (
          <Pressable onPress={load} style={s.error}>
            <Text style={s.errorText}>{error} · Tap to retry</Text>
          </Pressable>
        )}
        {busy && !projects.length ? (
          <ActivityIndicator style={s.loader} color="#2459D3" />
        ) : (
          filtered.map(project => {
            const audits = latestSeries(project.audits);
            const audit = selectedAudit(project);
            const isSelected = selectedId === project.id;
            const isExpanded = expandedId === project.id;
            const runningAudit = (project.audits || []).find(item =>
              running(timers[key(project.id, item.id)]),
            );
            const timer = runningAudit
              ? timers[key(project.id, runningAudit.id)]
              : undefined;
            return (
              <Pressable
                key={project.id}
                onPress={() =>
                  setExpandedId(current =>
                    current === project.id ? '' : project.id,
                  )
                }
                style={[s.card, isDark && s.cardDark, isSelected && s.selected]}
              >
                <View style={s.projectRow}>
                  <View style={[s.building, isDark && s.buildingDark]}>
                    <Feather name="briefcase" size={23} color="#2459D3" />
                  </View>
                  <View style={s.projectInfo}>
                    <Text numberOfLines={1} style={[s.projectName, isDark && s.textDark]}>
                      {project.projectName}
                    </Text>
                    <Text numberOfLines={1} style={[s.address, isDark && s.mutedDark]}>
                      {project.siteAddress || 'Site address not available'}
                    </Text>
                    {timer && (
                      <Text style={s.timer}>
                        <Feather name="clock" size={13} /> Audit in progress ·{' '}
                        {clock(remaining(timer, now))} left
                      </Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => choose(project)}
                    style={[s.selectButton, isSelected && s.selectedButton]}
                  >
                    <Text style={s.selectText}>
                      {isSelected ? 'Selected' : 'Select'}
                    </Text>
                  </Pressable>
                </View>
                {isExpanded && (
                  <View style={[s.expanded, isDark && s.expandedDark]}>
                    <View style={s.twoColumns}>
                      <View style={s.flex}>
                        <Text style={[s.label, isDark && s.mutedDark]}>Company</Text>
                        <Text numberOfLines={1} style={[s.value, isDark && s.textDark]}>
                          {project.company?.companyName ||
                            'Company not available'}
                        </Text>
                      </View>
                      <View style={s.flex}>
                        <Text style={[s.label, isDark && s.mutedDark]}>Visit</Text>
                        <Text style={[s.value, isDark && s.textDark]}>
                          {new Date().toLocaleDateString('en-GB')}
                        </Text>
                      </View>
                    </View>
                    <Text style={[s.auditLabel, isDark && s.mutedDark]}>Audit Types</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={s.auditChoices}
                    >
                      {audits.map(item => (
                        <Pressable
                          key={item.id}
                          onPress={async () => {
                            setAuditIds(current => ({
                              ...current,
                              [project.id]: item.id,
                            }));
                            if (isSelected) await select(project, item);
                          }}
                          style={[
                            s.auditChoice,
                            isDark && s.auditChoiceDark,
                            audit?.id === item.id && s.auditChoiceSelected,
                          ]}
                        >
                          <Text
                            style={[
                              s.auditChoiceText,
                              isDark && s.textDark,
                              audit?.id === item.id &&
                                s.auditChoiceTextSelected,
                            ]}
                          >
                            {item.auditType}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    {audit && (
                      <View style={s.auditGrid}>
                        <Detail
                          label="Checklist"
                          value={
                            audit.checklistTemplate?.name ||
                            audit.checklistType ||
                            'Not available'
                          }
                          isDark={isDark}
                        />
                        <Detail
                          label="Frequency"
                          value={audit.frequency || 'Not available'}
                          isDark={isDark}
                        />
                        <Detail
                          label="Remaining audits"
                          value={String(
                            Math.max(
                              (audit.numberOfAudits || 0) -
                                (audit.schedules?.length || 0),
                              0,
                            ),
                          )}
                          isDark={isDark}
                        />
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })
        )}
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
    </View>
  );
}
function Detail({ label, value, isDark }: { label: string; value: string; isDark?: boolean }) {
  return (
    <View style={[s.detail, isDark && s.detailDark]}>
      <Text style={[s.label, isDark && s.mutedDark]}>{label}</Text>
      <Text numberOfLines={2} style={[s.value, isDark && s.textDark]}>
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
  nav: {
    height: 72,
    backgroundColor: 'white',
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 3,
  },
  navDark: { backgroundColor: '#1F2937' },
  navButton: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navText: { fontSize: 18, color: '#2459D3' },
  disabledText: { color: '#9CA3AF' },
  content: { padding: 24, paddingBottom: 30, gap: 18 },
  contentNarrow: { padding: 15 },
  contentTablet: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: 32, gap: 22 },
  contentLargeTablet: { maxWidth: 980 },
  title: { fontSize: 32, fontWeight: '800', color: '#2A211D' },
  search: {
    height: 61,
    backgroundColor: 'white',
    borderRadius: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    elevation: 3,
  },
  searchDark: { backgroundColor: '#1F2937' },
  searchInput: { flex: 1, fontSize: 16, color: '#333' },
  loader: { marginTop: 50 },
  error: { backgroundColor: '#FDECEC', borderRadius: 12, padding: 13 },
  errorText: { color: '#B42318' },
  card: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 15,
    borderWidth: 1,
    borderColor: 'transparent',
    elevation: 3,
  },
  selected: { borderColor: '#0757D2' },
  projectRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  building: {
    width: 50,
    height: 50,
    borderRadius: 9,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectInfo: { flex: 1, minWidth: 0 },
  projectName: { fontSize: 18, fontWeight: '700', color: '#111' },
  address: { fontSize: 13, color: '#5F6978', marginTop: 4 },
  timer: { fontSize: 12, fontWeight: '600', color: '#C34B0A', marginTop: 6 },
  selectButton: {
    minWidth: 100,
    height: 47,
    borderRadius: 10,
    backgroundColor: '#0757BE',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  selectedButton: { backgroundColor: '#252525' },
  selectText: { fontSize: 15, fontWeight: '700', color: 'white' },
  expanded: {
    borderTopWidth: 1,
    borderTopColor: '#EEF0F2',
    marginTop: 15,
    paddingTop: 15,
  },
  expandedDark: { borderTopColor: '#374151' },
  twoColumns: { flexDirection: 'row', gap: 15 },
  flex: { flex: 1 },
  label: { fontSize: 11, color: '#7A8493' },
  value: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 4 },
  auditLabel: { fontSize: 12, color: '#333', marginTop: 17 },
  auditChoices: { gap: 8, paddingVertical: 10 },
  auditChoice: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#D8DCE3',
    backgroundColor: 'white',
  },
  auditChoiceDark: { backgroundColor: '#111827', borderColor: '#374151' },
  auditChoiceSelected: { backgroundColor: '#EAF0FF', borderColor: '#2459D3' },
  auditChoiceText: { fontSize: 12, color: '#4B5563' },
  auditChoiceTextSelected: { color: '#174D9C', fontWeight: '700' },
  auditGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  detail: {
    width: '48%',
    minHeight: 58,
    borderWidth: 1,
    borderColor: '#E1E4E9',
    borderRadius: 9,
    padding: 10,
  },
  detailDark: { borderColor: '#374151' },
  footer: { alignItems: 'center', paddingTop: 90 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerImage: { width: 44, height: 44 },
  footerTitle: { fontSize: 19, fontWeight: '800', color: '#07419B' },
  footerSub: { fontSize: 13, color: '#8490A4', marginTop: 4 },
  footerNote: {
    fontSize: 12,
    color: '#A2ABBC',
    textAlign: 'center',
    marginTop: 35,
  },
});
