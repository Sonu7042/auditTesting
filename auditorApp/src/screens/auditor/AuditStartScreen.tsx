import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '../../components/common/AppIcon';
import { auditorApi } from '../../api/auditor.api';
import { BrandLogo } from '../../components/common/BrandLogo';
import MenuIcon from '../../assets/auditor/menu.svg';
import { AuditorStackParamList } from '../../navigation/navigationTypes';
import { useAuditContext } from '../../store/AuditContext';
import { useAuth } from '../../store/AuthContext';
import { AuditReport, AuditTimer } from '../../types/domain';
import { useAppTheme } from '../../store/ThemeContext';

const DAY = 86400000;
const formatTime = (milliseconds: number) => {
  const seconds = Math.floor(Math.min(Math.max(milliseconds, 0), DAY) / 1000);
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(
    Math.floor((seconds % 3600) / 60),
  ).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
const timerStart = (timer: AuditTimer | null) => {
  const value = new Date(timer?.startedAt || '').getTime();
  return Number.isFinite(value)
    ? value
    : Date.now() - Math.max(timer?.elapsedMs || 0, 0);
};

export function AuditStartScreen({
  navigation,
  route,
}: NativeStackScreenProps<AuditorStackParamList, 'AuditOverview'>) {
  const { isDark } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const compact = width < 370 || height < 700;
  const tablet = width >= 700;
  const largeTablet = width >= 1000;
  const insets = useSafeAreaInsets();
  const { project, audit } = useAuditContext();
  const { user } = useAuth();
  const { projectId, auditId } = route.params;
  const [timer, setTimer] = useState<AuditTimer | null>(null),
    [report, setReport] = useState<AuditReport | null>(null),
    [now, setNow] = useState(Date.now()),
    [loading, setLoading] = useState(true),
    [completing, setCompleting] = useState(false),
    [error, setError] = useState('');
  const isComplete = Boolean(
    report && ['Completed', 'Closed'].includes(report.status),
  );
  const inProgress = Boolean(
    timer?.startedAt && !timer.isStopped && !timer.isExpired && !isComplete,
  );
  const load = useCallback(async () => {
    setError('');
    try {
      const [reports, nextTimer] = await Promise.all([
        auditorApi.reports(),
        auditorApi.timer(projectId, auditId),
      ]);
      setReport(
        reports.find(
          item =>
            String(item.projectId) === String(projectId) &&
            String(item.auditId) === String(auditId),
        ) || null,
      );
      setTimer(nextTimer);
      setNow(Date.now());
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [auditId, projectId]);
  useEffect(() => {
    load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(load, 60000);
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') load();
    });
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
      app.remove();
    };
  }, [load]);
  const remaining = useMemo(
    () =>
      isComplete || timer?.isStopped || timer?.isExpired
        ? 0
        : DAY - (now - timerStart(timer)),
    [isComplete, now, timer],
  );
  const goBack = () => {
    const proceed = () => navigation.replace('ProjectSelection');
    if (!inProgress) return proceed();
    Alert.alert(
      'Audit is in progress',
      `The timer for ${
        project?.projectName || 'this project'
      } will continue running if you leave.`,
      [
        { text: 'Stay here', style: 'cancel' },
        { text: 'Leave audit', style: 'destructive', onPress: proceed },
      ],
    );
  };
  const finish = async () => {
    if (!report || isComplete || !report.auditorSignatureUrl || completing)
      return;
    setCompleting(true);
    try {
      const result = await auditorApi.completeReport(report.id);
      setReport(result);
      setTimer(current =>
        current ? { ...current, isStopped: true } : current,
      );
      Alert.alert(
        'Report completed',
        'The audit report has been completed successfully.',
      );
    } catch (reason) {
      Alert.alert('Unable to complete report', (reason as Error).message);
    } finally {
      setCompleting(false);
    }
  };
  const canComplete = Boolean(
    report && !isComplete && report.auditorSignatureUrl,
  );
  const initials = (user?.fullName || user?.username || 'A')[0].toUpperCase();
  return (
    <View style={[s.screen, isDark && s.screenDark]}>
      <View
        style={[
          s.header,
          compact && s.headerCompact,
          { height: (compact ? 72 : 90) + insets.top, paddingTop: insets.top },
        ]}
      >
        <MenuIcon width={24} height={24} />
        <BrandLogo width={75} />
        <View style={s.flex} />
        <Pressable
          onPress={() => navigation.navigate('Notifications')}
          style={s.bell}
        >
          <Feather name="bell" size={26} color={isDark ? '#F8FAFC' : '#202020'} />
          <View style={s.badge}>
            <Text style={s.badgeText}>3</Text>
          </View>
        </Pressable>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials}</Text>
        </View>
      </View>
      <ScrollView
        style={s.flex}
        contentContainerStyle={[
          s.content,
          compact && s.contentCompact,
          tablet && s.contentTablet,
          largeTablet && s.contentLargeTablet,
        ]}
      >
        <View style={[s.summary, compact && s.summaryCompact, isDark && s.cardDark]}>
          <View style={s.topRow}>
            <Pressable onPress={goBack} style={s.back}>
              <Feather name="arrow-left" size={21} color="#0A58FF" />
              <Text style={s.backText}>Back</Text>
            </Pressable>
            <Pressable
              disabled={!canComplete || completing}
              onPress={finish}
              style={[s.completeButton, isDark && s.completeButtonDark, canComplete && s.completeReady]}
            >
              {completing ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <>
                  <Feather name="file-text" size={15} color="white" />
                  <Text numberOfLines={2} style={s.completeText}>
                    {isComplete
                      ? 'Completed'
                      : report && !report.auditorSignatureUrl
                      ? 'Sign Visit Sheet First'
                      : 'Complete Report'}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
          <View style={s.projectRow}>
            <View style={[s.building, isDark && s.buildingDark]}>
              <Feather name="briefcase" size={23} color="#2459D3" />
            </View>
            <View style={s.flex}>
              <Text numberOfLines={1} style={[s.projectName, isDark && s.textDark]}>
                {project?.projectName || 'Project not selected'}
              </Text>
              <Text numberOfLines={1} style={[s.address, isDark && s.mutedDark]}>
                {project?.siteAddress || 'Site address not available'}
              </Text>
            </View>
          </View>
          <View style={s.infoRow}>
            <View style={s.flex}>
              <Text style={[s.label, isDark && s.mutedDark]}>Company</Text>
              <Text numberOfLines={1} style={[s.info, isDark && s.textDark]}>
                {project?.company?.companyName || 'Company not available'}
              </Text>
            </View>
            <View>
              <Text style={[s.label, isDark && s.mutedDark]}>Visit</Text>
              <Text style={[s.info, isDark && s.textDark]}>
                {new Date().toLocaleDateString('en-GB')}
              </Text>
            </View>
          </View>
          <View style={[s.timerBox, isDark && s.timerBoxDark]}>
            <View style={s.timerLeft}>
              <View style={[s.timerIcon, isDark && s.buildingDark]}>
                <Feather name="clock" size={23} color="#FF334A" />
              </View>
              <View>
                <Text style={[s.label, isDark && s.mutedDark]}>Audit timer</Text>
                <Text style={[s.timerLabel, isDark && s.textDark]}>Time left</Text>
              </View>
            </View>
            <Text style={[s.timerValue, compact && s.timerValueCompact]}>
              {formatTime(remaining)}
            </Text>
          </View>
          {!!error && (
            <Pressable onPress={load}>
              <Text style={s.error}>{error} · Tap to retry</Text>
            </Pressable>
          )}
        </View>
        <View style={[s.auditCard, isDark && s.cardDark]}>
          <View style={s.warning}>
            <Feather name="alert-triangle" size={24} color="#FF8C00" />
          </View>
          <View style={s.flex}>
            <Text numberOfLines={1} style={[s.auditName, isDark && s.textDark]}>
              {project?.projectName || 'Audit'}
            </Text>
            <Text style={[s.auditType, isDark && s.mutedDark]}>
              {audit?.auditType || 'Audit Assessment'}
            </Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Assessment', route.params)}
            style={[s.start, isDark && s.startDark]}
          >
            <Text style={[s.startText, isDark && s.textDark]}>
              {report ? 'View Report' : 'Start Audit'}
            </Text>
          </Pressable>
        </View>
        <View style={s.footer}>
          <Text style={s.footerTitle}>Audit Smartly</Text>
          <Text style={[s.footerSub, isDark && s.mutedDark]}>
            Keep your sites compliant and inspections on track
          </Text>
        </View>
      </ScrollView>
      {loading && (
        <View style={[s.loading, isDark && s.loadingDark]}>
          <ActivityIndicator size="large" color="#2459D3" />
        </View>
      )}
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
  header: {
    height: 90,
    paddingHorizontal: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 17,
  },
  headerCompact: { height: 72, paddingHorizontal: 18 },
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
  avatarText: { color: 'white', fontWeight: '800', fontSize: 17 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 25,
    flexGrow: 1,
  },
  contentCompact: { paddingHorizontal: 14, paddingTop: 4 },
  contentTablet: { width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: 32 },
  contentLargeTablet: { maxWidth: 960 },
  summary: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    elevation: 5,
  },
  summaryCompact: { padding: 16, borderRadius: 17 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 9 },
  backText: { fontSize: 20, color: '#0A58FF' },
  completeButton: {
    minHeight: 45,
    maxWidth: '58%',
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#D4DCEB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  completeButtonDark: { backgroundColor: '#374151' },
  completeReady: { backgroundColor: '#0B8F53' },
  completeText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'white',
    textAlign: 'center',
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginTop: 18,
  },
  building: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectName: { fontSize: 18, fontWeight: '600', color: '#222' },
  address: { fontSize: 13, color: '#687386', marginTop: 5 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 20,
    marginTop: 24,
  },
  label: { fontSize: 13, color: '#697386' },
  info: { fontSize: 17, fontWeight: '700', color: '#292929', marginTop: 6 },
  timerBox: {
    minHeight: 82,
    borderWidth: 1,
    borderColor: '#FFD2D2',
    backgroundColor: '#FFF2F2',
    borderRadius: 15,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  timerBoxDark: { backgroundColor: '#2A1D24', borderColor: '#5A2E36' },
  timerLeft: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  timerIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  timerLabel: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 4 },
  timerValue: {
    fontSize: 23,
    fontWeight: '800',
    color: '#FF334A',
    fontVariant: ['tabular-nums'],
  },
  timerValueCompact: { fontSize: 19 },
  error: { color: '#B42318', fontSize: 12, marginTop: 12 },
  auditCard: {
    minHeight: 97,
    borderWidth: 1,
    borderColor: '#CECECE',
    borderRadius: 15,
    backgroundColor: 'white',
    padding: 20,
    marginTop: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  warning: {
    width: 55,
    height: 55,
    borderRadius: 7,
    backgroundColor: '#FFF0D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  auditName: { fontSize: 17, fontWeight: '600', color: '#333' },
  auditType: { fontSize: 13, color: '#687386', marginTop: 7 },
  start: {
    minWidth: 125,
    height: 53,
    borderWidth: 1,
    borderColor: '#A1A1A1',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  startDark: { borderColor: '#374151' },
  startText: { fontSize: 17, color: '#222' },
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingTop: 55,
    paddingBottom: 4,
  },
  footerTitle: { fontSize: 19, fontWeight: '800', color: '#543BFF' },
  footerSub: {
    fontSize: 14,
    color: '#A1A9BC',
    marginTop: 10,
    textAlign: 'center',
  },
  loading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(242,242,242,.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingDark: { backgroundColor: 'rgba(17,24,39,.65)' },
});
