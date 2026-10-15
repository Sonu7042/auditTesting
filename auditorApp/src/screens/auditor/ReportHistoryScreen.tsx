import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from '../../components/common/AppIcon';
import {auditorApi} from '../../api/auditor.api';
import {AuditorHeader} from '../../components/common/AuditorHeader';
import SearchIcon from '../../assets/search_icon.svg';
import {AuditorStackParamList} from '../../navigation/navigationTypes';
import {useAuditContext} from '../../store/AuditContext';
import {AuditReport} from '../../types/domain';
import {downloadAuditReport, ReportDownloadFormat} from '../../utils/downloadReport';
import {useAppTheme} from '../../store/ThemeContext';

const VISITED_REPORTS_KEY = '@auditportal/auditor-visited-reports';
const isCompleted = (status?: string) => ['Completed', 'Closed'].includes(status || '');
const reportKeyOf = (item: AuditReport) => item.id || `${item.projectId}:${item.auditId}`;

const formatDate = (value?: string) => {
  if (!value) return 'Date not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date not available';
  return date.toLocaleDateString('en-GB', {day: '2-digit', month: '2-digit', year: 'numeric'});
};

export function ReportHistoryScreen({navigation}: NativeStackScreenProps<AuditorStackParamList, 'Reports'>) {
  const {isDark} = useAppTheme();
  const {width} = useWindowDimensions();
  const tablet = width >= 768;
  const [data, setData] = useState<AuditReport[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [visitedReports, setVisitedReports] = useState<string[]>([]);
  const [downloadKey, setDownloadKey] = useState('');
  const {select} = useAuditContext();

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setBusy(true);
    setError('');
    try {
      setData(await auditorApi.reports());
    } catch (reason) {
      setError((reason as Error).message || 'Unable to load saved reports.');
    } finally {
      setBusy(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(VISITED_REPORTS_KEY).then(raw => {
      try {
        setVisitedReports(raw ? JSON.parse(raw) : []);
      } catch {
        setVisitedReports([]);
      }
    });
  }, []));

  const filtered = useMemo(
    () => data.filter(item => `${item.project?.projectName || ''} ${item.project?.company?.companyName || ''} ${item.audit?.auditType || ''}`.toLowerCase().includes(query.trim().toLowerCase())),
    [data, query],
  );

  const open = async (item: AuditReport) => {
    if (item.project && item.audit) await select(item.project, item.audit);
    const key = reportKeyOf(item);
    setVisitedReports(current => {
      if (current.includes(key)) return current;
      const next = [...current, key];
      AsyncStorage.setItem(VISITED_REPORTS_KEY, JSON.stringify(next));
      return next;
    });
    navigation.navigate('Assessment', {projectId: item.project?.id || item.projectId, auditId: item.audit?.id || item.auditId});
  };

  const download = async (item: AuditReport, format: ReportDownloadFormat) => {
    const key = `${item.id}:${format}`;
    setDownloadKey(key);
    try {
      await downloadAuditReport(item, format);
    } catch (reason) {
      Alert.alert('Download failed', (reason as Error).message || 'Unable to download the report.');
    } finally {
      setDownloadKey('');
    }
  };

  const chooseReportDownload = (item: AuditReport) => {
    Alert.alert('Download report', undefined, [
      {text: 'Excel download', onPress: () => download(item, 'excel')},
      {text: 'Word download', onPress: () => download(item, 'word')},
      {text: 'Cancel', style: 'cancel'},
    ]);
  };

  return (
    <View style={[s.screen, isDark && s.screenDark]}>
      <AuditorHeader navigation={navigation} />
      <View style={[s.inner, tablet && s.innerTablet]}>
      <Text style={[s.title, tablet && s.titleTablet, isDark && s.textDark]}>Report History</Text>
      <View style={[s.search, isDark && s.searchDark]}>
        <SearchIcon width={18} height={18} />
        <TextInput style={[s.searchInput, isDark && s.textDark]} placeholder="Search By Origin ..." placeholderTextColor={isDark ? '#6B7280' : undefined} value={query} onChangeText={setQuery} />
      </View>
      {busy ? (
        <ActivityIndicator style={s.loader} color="#174D9C" />
      ) : (
        <FlatList
          style={s.flex}
          data={filtered}
          refreshing={refreshing}
          onRefresh={() => load(true)}
          keyExtractor={reportKeyOf}
          contentContainerStyle={s.list}
          ListEmptyComponent={<Text style={[s.empty, isDark && s.cardDark, isDark && s.textDark, error ? s.error : undefined]}>{error || 'No saved reports found.'}</Text>}
          ListFooterComponent={filtered.length ? <View style={s.footer}><Text style={s.footerTitle}>Audit Smartly</Text><Text style={[s.footerSub, isDark && s.mutedDark]}>Keep your sites compliant and inspections on track</Text></View> : undefined}
          renderItem={({item, index}) => {
            const key = reportKeyOf(item);
            const visited = visitedReports.includes(key);
            const canDownloadReport = isCompleted(item.status);
            const canDownloadOpenNc = isCompleted(item.status) && Boolean(item.openNonComplianceCount) && Boolean(item.auditorSignatureUrl);
            const visitDate = item.audit?.schedules?.[0]?.date || item.createdAt || item.updatedAt;

            return (
              <Pressable onPress={() => open(item)} style={[s.card, isDark && s.cardDark]}>
                <View style={s.row}>
                  <View style={s.number}>
                    <Text style={s.numberText}>{index + 1}.</Text>
                  </View>
                  <View style={s.flex}>
                    <Text style={[s.company, isDark && s.mutedDark]}>{item.project?.company?.companyName || 'Company not available'}</Text>
                    <Text style={[s.project, isDark && s.textDark]}>{item.project?.projectName || 'Project not available'}</Text>
                    <Text style={s.cycle}>Audit cycle {item.audit?.cycleNumber || 1}</Text>
                  </View>
                  <View style={s.actions}>
                    {canDownloadReport && (
                      <Pressable accessibilityLabel="Download audit report" disabled={Boolean(downloadKey)} onPress={event => {event.stopPropagation(); chooseReportDownload(item);}} style={s.downloadButton}>
                        {downloadKey.startsWith(`${item.id}:`) && downloadKey !== `${item.id}:open-nc` ? <ActivityIndicator size="small" color="white" /> : <Feather name="download" size={16} color="white" />}
                      </Pressable>
                    )}
                    {canDownloadOpenNc && (
                      <Pressable accessibilityLabel="Download open non-compliance report" disabled={Boolean(downloadKey)} onPress={event => {event.stopPropagation(); download(item, 'open-nc');}} style={s.openNcButton}>
                        {downloadKey === `${item.id}:open-nc` ? <ActivityIndicator size="small" color="white" /> : <Feather name="file-minus" size={16} color="white" />}
                      </Pressable>
                    )}
                  </View>
                </View>

                {visited && (
                  <View style={s.visitedBadge}>
                    <Feather name="check-circle" size={22} color="#0B8F53" />
                  </View>
                )}

                <View style={[s.details, isDark && s.detailsDark]}>
                  <View style={s.flex}>
                    <Text style={[s.label, isDark && s.mutedDark]}>Auditor</Text>
                    <Text style={[s.value, isDark && s.textDark]}>{item.auditor?.fullName || 'Auditor'}</Text>
                  </View>
                  <View style={s.flex}>
                    <Text style={[s.label, isDark && s.mutedDark]}>Checklist Template</Text>
                    <Text style={[s.value, isDark && s.textDark]}>{item.audit?.checklistTemplate?.name || item.audit?.checklistType || 'Checklist not available'}</Text>
                  </View>
                </View>

                <View style={s.grid}>
                  <View style={[s.gridBox, isDark && s.gridBoxDark]}>
                    <Text style={[s.gridLabel, s.gridLabelEmerald]}>Visit Date</Text>
                    <Text style={[s.gridValue, isDark && s.textDark]}>{formatDate(visitDate)}</Text>
                  </View>
                  <View style={[s.gridBox, isDark && s.gridBoxDark]}>
                    <Text style={[s.gridLabel, s.gridLabelRed]}>Date Closed</Text>
                    <Text style={[s.gridValue, isDark && s.textDark]}>{formatDate(item.updatedAt)}</Text>
                  </View>
                  <View style={[s.gridBox, isDark && s.gridBoxDark]}>
                    <Text style={[s.gridLabel, s.gridLabelRed]}>Non-Compliance</Text>
                    <Text style={[s.gridCount, isDark && s.textDark]}>{String(item.nonComplianceCount || 0).padStart(2, '0')}</Text>
                  </View>
                  <View style={[s.gridBox, isDark && s.gridBoxDark]}>
                    <Text style={[s.gridLabel, s.gridLabelPurple]}>Status</Text>
                    <View style={[s.statusPill, item.status === 'Open' ? s.statusPillOpen : s.statusPillDone]}>
                      <Text style={s.statusText}>{item.status}</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#F3F4F6'},
  screenDark: {backgroundColor: '#111827'},
  textDark: {color: '#F8FAFC'},
  mutedDark: {color: '#9CA3AF'},
  cardDark: {backgroundColor: '#1F2937'},
  inner: {flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 20},
  innerTablet: {maxWidth: 860, paddingHorizontal: 32},
  title: {fontSize: 26, fontWeight: '800', color: '#2B2B2B', marginTop: 12},
  titleTablet: {fontSize: 30},
  search: {height: 52, backgroundColor: 'white', borderRadius: 13, borderWidth: 1, borderColor: '#D8D8D8', paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 17},
  searchDark: {backgroundColor: '#1F2937', borderColor: '#374151'},
  searchInput: {flex: 1, color: '#333'},
  loader: {marginTop: 50},
  list: {paddingVertical: 22, gap: 16},
  empty: {backgroundColor: 'white', padding: 22, borderRadius: 18, color: '#687386'},
  error: {backgroundColor: '#FEF2F2', color: '#DC2626', borderWidth: 1, borderColor: '#FEE2E2'},
  card: {backgroundColor: 'white', borderRadius: 22, padding: 17, elevation: 4},
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: 12},
  number: {width: 43, height: 43, borderRadius: 22, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center'},
  numberText: {color: 'white', fontWeight: '700'},
  flex: {flex: 1},
  company: {fontSize: 12, color: '#7B8494'},
  project: {fontSize: 18, fontWeight: '700', color: '#333', marginTop: 2},
  cycle: {fontSize: 12, color: '#1D5EC4', marginTop: 4},
  actions: {flexDirection: 'row', gap: 8},
  downloadButton: {width: 34, height: 34, borderRadius: 9, backgroundColor: '#0B8F53', alignItems: 'center', justifyContent: 'center'},
  openNcButton: {width: 34, height: 34, borderRadius: 9, backgroundColor: '#C62828', alignItems: 'center', justifyContent: 'center'},
  visitedBadge: {position: 'absolute', right: 16, top: 16},
  details: {flexDirection: 'row', gap: 14, marginTop: 20},
  detailsDark: {},
  label: {fontSize: 11, color: '#7B8494'},
  value: {fontSize: 14, fontWeight: '600', color: '#333', marginTop: 4},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18},
  gridBox: {width: '47%', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 11},
  gridBoxDark: {backgroundColor: '#111827', borderColor: '#374151'},
  gridLabel: {fontSize: 11, fontWeight: '600'},
  gridLabelEmerald: {color: '#059669'},
  gridLabelRed: {color: '#EF4444'},
  gridLabelPurple: {color: '#7C3AED'},
  gridValue: {fontSize: 13, fontWeight: '700', color: '#1E293B', marginTop: 4},
  gridCount: {fontSize: 17, fontWeight: '800', color: '#1E293B', marginTop: 4},
  statusPill: {alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 5, marginTop: 6},
  statusPillOpen: {backgroundColor: '#F59E0B'},
  statusPillDone: {backgroundColor: '#059669'},
  statusText: {fontSize: 11, fontWeight: '700', color: 'white'},
  footer: {alignItems: 'center', paddingTop: 46, paddingBottom: 28},
  footerTitle: {fontSize: 18, fontWeight: '800', color: '#4F46E5'},
  footerSub: {fontSize: 13, color: '#9CA3AF', marginTop: 8, textAlign: 'center'},
});
