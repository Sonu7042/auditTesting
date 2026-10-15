import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Feather from '../../components/common/AppIcon';
import {auditorApi} from '../../api/auditor.api';
import {AuditorHeader} from '../../components/common/AuditorHeader';
import CalendarIllustration from '../../assets/auditor/Calendar-Schedule-page.svg';
import CalendarDaysIcon from '../../assets/header/calendar_days.svg';
import ChevronDownIcon from '../../assets/header/chevron_down.svg';
import ChevronRightIcon from '../../assets/header/chevron_right.svg';
import FooterImage from '../../assets/auditor/footer-icon.png';
import {AuditorStackParamList} from '../../navigation/navigationTypes';
import {AuditSchedule, ClientAuditJob} from '../../types/domain';
import {useAppTheme} from '../../store/ThemeContext';

const WEEK_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const formatDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const formatScheduleDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date not available';
  return date.toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'});
};

interface CalendarDay {
  dateKey: string;
  day: number;
  muted: boolean;
  hasSchedule: boolean;
}

const getCalendarDays = (currentMonth: Date, scheduledDateKeys: Set<string>): CalendarDay[] => {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPreviousMonth = new Date(year, month, 0).getDate();
  const monthStartOffset = (firstDayOfMonth.getDay() + 6) % 7;

  return Array.from({length: 42}, (_, index) => {
    const dayNumber = index - monthStartOffset + 1;
    let date: Date;
    let muted = false;

    if (dayNumber <= 0) {
      date = new Date(year, month - 1, daysInPreviousMonth + dayNumber);
      muted = true;
    } else if (dayNumber > daysInMonth) {
      date = new Date(year, month + 1, dayNumber - daysInMonth);
      muted = true;
    } else {
      date = new Date(year, month, dayNumber);
    }

    const dateKey = formatDateKey(date);
    return {dateKey, day: date.getDate(), muted, hasSchedule: !muted && scheduledDateKeys.has(dateKey)};
  });
};

interface ScheduleItem {
  id: string;
  company: string;
  detail: string;
  date: string;
  dateKey: string;
  rawDate: Date;
  auditType: string;
  numberOfAudits: number | string;
  frequency: string;
  auditors: string[];
  status: string;
  clientJobId?: string;
}

export function ScheduleScreen({navigation}: NativeStackScreenProps<AuditorStackParamList, 'Schedule'>) {
  const {isDark} = useAppTheme();
  const {width} = useWindowDimensions();
  const tablet = width >= 600;
  const largeTablet = width >= 1000;
  const narrow = width < 360;
  const cellHeight = largeTablet ? 118 : tablet ? 104 : narrow ? 66 : 78;

  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [expandedId, setExpandedId] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [schedules, setSchedules] = useState<AuditSchedule[]>([]);
  const [clientJobs, setClientJobs] = useState<ClientAuditJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [legacySchedules, assignedClientJobs] = await Promise.all([
        auditorApi.schedules(),
        auditorApi.clientAuditJobs(),
      ]);
      setSchedules(legacySchedules);
      setClientJobs(assignedClientJobs);
    } catch (reason) {
      setError((reason as Error).message || 'Unable to load scheduled projects.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const scheduleItems = useMemo<ScheduleItem[]>(
    () =>
      [
        ...schedules.map(schedule => {
          const date = new Date(schedule.date);
          const audit = schedule.audit;
          const project = schedule.project;
          const auditType = audit?.auditType || 'Scheduled Audit';

          return {
            id: schedule.id,
            company: project?.projectName || project?.company?.companyName || 'Project not available',
            detail: `${project?.siteAddress || 'Site'} - ${auditType}`,
            date: formatScheduleDate(schedule.date),
            dateKey: formatDateKey(date),
            rawDate: date,
            auditType,
            numberOfAudits: audit?.numberOfAudits ?? '-',
            frequency: audit?.frequency || '-',
            auditors: (schedule.auditors || []).map(item => item.user?.fullName).filter(Boolean) as string[],
            status: 'SCHEDULED',
          };
        }),
        ...clientJobs.map(job => {
          const date = new Date(job.scheduledStart);
          return {
            id: `client-${job.id}`,
            company: `${job.location.dealerName} - ${job.location.locationName}`,
            detail: `${job.location.address} - ${job.auditType}`,
            date: formatScheduleDate(job.scheduledStart),
            dateKey: formatDateKey(date),
            rawDate: date,
            auditType: job.auditType,
            numberOfAudits: job.snapshot.itemCount,
            frequency: job.auditCycle,
            auditors: job.assignments.map(item => item.auditor?.fullName).filter(Boolean) as string[],
            clientJobId: job.id,
            status: job.status,
          };
        }),
      ]
        .sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime()),
    [schedules, clientJobs],
  );

  const currentMonthSchedules = useMemo(() => {
    const now = new Date();
    return scheduleItems.filter(item => item.rawDate.getMonth() === now.getMonth() && item.rawDate.getFullYear() === now.getFullYear());
  }, [scheduleItems]);

  const scheduledDateKeys = useMemo(() => new Set(scheduleItems.map(item => item.dateKey)), [scheduleItems]);
  const calendarDays = useMemo(() => getCalendarDays(currentMonth, scheduledDateKeys), [currentMonth, scheduledDateKeys]);
  const monthLabel = currentMonth.toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
  const monthlyAuditLoad = Math.min(100, Math.round((currentMonthSchedules.length / 10) * 100));
  const changeMonth = (offset: number) => setCurrentMonth(previous => new Date(previous.getFullYear(), previous.getMonth() + offset, 1));

  return (
    <View style={[s.screen, isDark && s.screenDark]}>
      <AuditorHeader navigation={navigation} />
      <Text style={[s.title, tablet && s.titleTablet, largeTablet && s.titleLargeTablet, isDark && s.textDark]}>Schedule</Text>
      {loading ? (
        <ActivityIndicator style={s.loader} color="#154A95" />
      ) : (
        <FlatList
          style={s.flex}
          data={currentMonthSchedules}
          keyExtractor={item => item.id}
          refreshing={refreshing}
          onRefresh={() => load(true)}
          contentContainerStyle={[s.list, tablet && s.listTablet, largeTablet && s.listLargeTablet]}
          ListHeaderComponent={
            <View>
              <View style={s.loadCard}>
                <View style={s.flex}>
                  <Text style={s.loadLabel}>Monthly Audit Load</Text>
                  <View style={s.loadRow}>
                    <Text style={s.loadPercent}>{monthlyAuditLoad}%</Text>
                    <Text style={s.loadCaption}>Capacity used</Text>
                  </View>
                  <View style={s.loadTrack}>
                    <View style={[s.loadFill, {width: `${monthlyAuditLoad}%`}]} />
                  </View>
                </View>
                <View style={s.loadIcon}>
                  <CalendarIllustration width={30} height={30} />
                </View>
              </View>

              <View style={[s.toggleRow, isDark && s.cardDark]}>
                <Pressable onPress={() => setView('list')} style={[s.toggleButton, view === 'list' && (isDark ? s.toggleButtonActiveDark : s.toggleButtonActive)]}>
                  <Feather name="menu" size={16} color={view === 'list' ? (isDark ? '#F8FAFC' : '#000') : '#A3A3A3'} />
                  <Text style={[s.toggleText, view === 'list' && (isDark ? s.textDark : s.toggleTextActive)]}>List</Text>
                </Pressable>
                <Pressable onPress={() => setView('calendar')} style={[s.toggleButton, view === 'calendar' && (isDark ? s.toggleButtonActiveDark : s.toggleButtonActive)]}>
                  <Feather name="calendar" size={16} color={view === 'calendar' ? (isDark ? '#F8FAFC' : '#000') : '#A3A3A3'} />
                  <Text style={[s.toggleText, view === 'calendar' && (isDark ? s.textDark : s.toggleTextActive)]}>Calendar</Text>
                </Pressable>
              </View>

              {view === 'calendar' && (
                <View style={[s.calendarCard, isDark && s.cardDark]}>
                  <View style={[s.calendarHeader, isDark && s.calendarHeaderDark]}>
                    <Pressable onPress={() => changeMonth(-1)} style={[s.calendarNavButton, isDark && s.calendarNavButtonDark]}>
                      <Feather name="chevron-left" size={20} color={isDark ? '#F8FAFC' : '#222'} />
                    </Pressable>
                    <Text style={[s.monthLabel, tablet && s.monthLabelTablet, isDark && s.textDark]}>{monthLabel}</Text>
                    <Pressable onPress={() => changeMonth(1)} style={[s.calendarNavButton, isDark && s.calendarNavButtonDark]}>
                      <Feather name="chevron-right" size={20} color={isDark ? '#F8FAFC' : '#222'} />
                    </Pressable>
                  </View>

                  <View style={[s.weekRow, isDark && s.weekRowDark]}>
                    {WEEK_LABELS.map((label, index) => (
                      <View key={`${label}-${index}`} style={[s.weekCell, isDark && s.weekCellDark, index === 6 && s.weekCellSunday]}>
                        <Text style={[s.weekText, isDark && s.mutedDark, index === 6 && s.weekTextSunday]}>{label}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={[s.daysGrid, isDark && s.weekRowDark]}>
                    {calendarDays.map(item => (
                      <View key={item.dateKey} style={[s.dayCell, isDark && s.dayCellDarkBorder, {height: cellHeight}, item.muted ? (isDark ? s.dayCellMutedDark : s.dayCellMuted) : item.hasSchedule ? s.dayCellScheduled : (isDark ? s.dayCellNormalDark : s.dayCellNormal)]}>
                        <Text style={[s.dayNumber, item.muted ? (isDark ? s.mutedDark : s.dayNumberMuted) : item.hasSchedule ? s.dayNumberScheduled : (isDark ? s.textDark : s.dayNumberNormal)]}>{item.day}</Text>
                        {item.hasSchedule && (
                          <>
                            <View style={s.dayDot} />
                            {!narrow && <Text numberOfLines={1} style={s.dayScheduleLabel}>Scheduled Audit</Text>}
                          </>
                        )}
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <Text style={[s.upcomingHeading, isDark && s.textDark]}>Upcoming Schedule</Text>

              {!!error && (
                <View style={s.errorCard}>
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={!error ? <View style={[s.emptyCard, isDark && s.cardDark]}><Text style={[s.emptyText, isDark && s.mutedDark]}>No scheduled projects found.</Text></View> : undefined}
          ListFooterComponent={
            <View style={s.footer}>
              <View style={s.footerRow}>
                <Image source={FooterImage} style={s.footerImage} resizeMode="contain" />
                <View>
                  <Text style={s.footerTitle}>Audit Smartly</Text>
                  <Text style={[s.footerSub, isDark && s.mutedDark]}>Compliance made simple</Text>
                </View>
              </View>
              <View style={[s.footerLine, isDark && s.footerLineDark]} />
              <Text style={[s.footerNote, isDark && s.mutedDark]}>Built for auditors to inspect faster, report smarter, and stay compliant.</Text>
            </View>
          }
          renderItem={({item}) => {
            const expanded = expandedId === item.id;
            const remainingCount = scheduleItems.filter(schedule => schedule.auditType === item.auditType).length;
            return (
              <View style={[s.card, isDark && s.cardDark]}>
                <View style={s.cardRow}>
                  <View style={s.flex}>
                    <View style={s.cardTop}>
                      <Text style={[s.cardTitle, isDark && s.textDark]}>{item.company}</Text>
                      <View style={s.statusPill}>
                        <Text style={s.statusText}>{item.status}</Text>
                      </View>
                    </View>
                    <Text style={[s.cardDetail, isDark && s.mutedDark]}>{item.detail}</Text>
                    <View style={s.cardDateRow}>
                      <CalendarDaysIcon
                        width={narrow ? 13 : tablet ? 16 : 14}
                        height={narrow ? 13 : tablet ? 16 : 14}
                        color={isDark ? '#F8FAFC' : '#000'}
                      />
                      <Text style={[s.cardDate, isDark && s.textDark]}>{item.date}</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => setExpandedId(expanded ? '' : item.id)} style={[s.expandButton, isDark && s.expandButtonDark]}>
                    {expanded ? (
                      <ChevronDownIcon
                        width={narrow ? 14 : tablet ? 18 : 16}
                        height={narrow ? 14 : tablet ? 18 : 16}
                        color={isDark ? '#F8FAFC' : '#222'}
                      />
                    ) : (
                      <ChevronRightIcon
                        width={narrow ? 14 : tablet ? 18 : 16}
                        height={narrow ? 14 : tablet ? 18 : 16}
                        color={isDark ? '#F8FAFC' : '#222'}
                      />
                    )}
                  </Pressable>
                </View>

                {expanded && (
                  <View style={[s.expanded, isDark && s.expandedDark]}>
                    <View style={s.expandedTop}>
                      <Text style={[s.expandedHeading, isDark && s.textDark]}>Audit Type</Text>
                      <View style={s.auditTypePill}>
                        <Text style={s.auditTypeText}>{item.auditType}</Text>
                      </View>
                    </View>

                    <Text style={[s.expandedHeading, isDark && s.textDark]}>Total Audit and Remaining Audit Timeline</Text>
                    <View style={s.statsRow}>
                      <View style={[s.statBox, isDark && s.statBoxDark]}>
                        <Text style={[s.statText, isDark && s.textDark]}>{item.numberOfAudits}</Text>
                      </View>
                      <View style={[s.statBox, isDark && s.statBoxDark]}>
                        <Text style={[s.statText, isDark && s.textDark]}>{remainingCount}</Text>
                      </View>
                      <View style={[s.statBox, isDark && s.statBoxDark]}>
                        <Text style={[s.statText, isDark && s.textDark]}>{item.frequency}</Text>
                      </View>
                    </View>

                    {item.auditors.length > 0 && <Text style={[s.auditorsText, isDark && s.mutedDark]}>Auditors: {item.auditors.join(', ')}</Text>}
                    {item.clientJobId && (
                      <Pressable style={s.checkInButton} onPress={() => navigation.navigate('ClientAuditCheckIn', {jobId: item.clientJobId!})}>
                        <Feather name="map-pin" size={16} color="#fff" />
                        <Text style={s.checkInButtonText}>Site check-in</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#F3F4F6'},
  screenDark: {backgroundColor: '#111827'},
  textDark: {color: '#F8FAFC'},
  mutedDark: {color: '#9CA3AF'},
  cardDark: {backgroundColor: '#1F2937'},
  title: {fontSize: 26, fontWeight: '800', color: '#2B2B2B', paddingHorizontal: 20, marginTop: 12},
  titleTablet: {fontSize: 30, paddingHorizontal: 28, width: '100%', maxWidth: 860, alignSelf: 'center'},
  titleLargeTablet: {maxWidth: 1000},
  loader: {marginTop: 60},
  flex: {flex: 1},
  list: {paddingHorizontal: 20, paddingBottom: 30, gap: 12},
  listTablet: {maxWidth: 860, alignSelf: 'center', width: '100%', paddingHorizontal: 28},
  listLargeTablet: {maxWidth: 1000},
  loadCard: {marginTop: 10, borderRadius: 20, backgroundColor: '#003D9B', paddingHorizontal: 20, paddingVertical: 22, flexDirection: 'row', alignItems: 'center', gap: 16, elevation: 4},
  loadLabel: {fontSize: 14, fontWeight: '600', color: 'white'},
  loadRow: {flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 10},
  loadPercent: {fontSize: 40, fontWeight: '800', color: 'white'},
  loadCaption: {fontSize: 13, color: 'rgba(255,255,255,0.9)', marginBottom: 4},
  loadTrack: {height: 9, borderRadius: 5, backgroundColor: '#0D5BD4', marginTop: 14, overflow: 'hidden'},
  loadFill: {height: '100%', borderRadius: 5, backgroundColor: '#1EA7FF'},
  loadIcon: {width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center'},
  toggleRow: {marginTop: 16, flexDirection: 'row', backgroundColor: 'white', borderRadius: 16, padding: 6, gap: 6, elevation: 2},
  toggleButton: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 11},
  toggleButtonActive: {backgroundColor: '#F1F1F1', borderWidth: 1, borderColor: '#CECECE'},
  toggleButtonActiveDark: {backgroundColor: '#111827', borderWidth: 1, borderColor: '#374151'},
  toggleText: {fontSize: 14, fontWeight: '600', color: '#A3A3A3'},
  toggleTextActive: {color: '#000'},
  calendarCard: {marginTop: 16, borderRadius: 20, backgroundColor: 'white', overflow: 'hidden', elevation: 3},
  calendarHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 18, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: '#E8E8E8'},
  calendarHeaderDark: {backgroundColor: '#111827', borderBottomColor: '#374151'},
  calendarNavButton: {width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#E5E5E5', backgroundColor: 'white', alignItems: 'center', justifyContent: 'center'},
  calendarNavButtonDark: {backgroundColor: '#1F2937', borderColor: '#374151'},
  monthLabel: {fontSize: 20, fontWeight: '700', color: '#222', minWidth: 150, textAlign: 'center'},
  monthLabelTablet: {fontSize: 26, minWidth: 220},
  weekRow: {flexDirection: 'row', borderWidth: 1, borderColor: '#DCDCDC'},
  weekRowDark: {borderColor: '#374151'},
  weekCell: {flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAFA', borderRightWidth: 1, borderRightColor: '#DCDCDC'},
  weekCellDark: {backgroundColor: '#111827', borderRightColor: '#374151'},
  weekCellSunday: {backgroundColor: '#B5B5B5', borderRightWidth: 0},
  weekText: {fontSize: 13, fontWeight: '600', color: '#555'},
  weekTextSunday: {color: '#222'},
  daysGrid: {flexDirection: 'row', flexWrap: 'wrap', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#DCDCDC'},
  dayCell: {width: '14.2857%', padding: 6, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#DCDCDC'},
  dayCellDarkBorder: {borderColor: '#374151'},
  dayCellMuted: {backgroundColor: '#FAFAFA'},
  dayCellMutedDark: {backgroundColor: '#161F2E'},
  dayCellNormal: {backgroundColor: 'white'},
  dayCellNormalDark: {backgroundColor: '#1F2937'},
  dayCellScheduled: {backgroundColor: 'rgba(0,135,90,0.1)', borderWidth: 2, borderColor: '#22C55E'},
  dayNumber: {fontSize: 14, fontWeight: '600'},
  dayNumberMuted: {color: '#BEBEBE'},
  dayNumberNormal: {color: '#222'},
  dayNumberScheduled: {color: '#00875A'},
  dayDot: {width: 7, height: 7, borderRadius: 4, backgroundColor: '#16A34A', marginTop: 6},
  dayScheduleLabel: {fontSize: 9, fontWeight: '600', color: '#166534', marginTop: 3},
  upcomingHeading: {fontSize: 20, fontWeight: '800', color: '#111', marginTop: 24, marginBottom: 4},
  errorCard: {borderRadius: 16, borderWidth: 1, borderColor: '#FEE2E2', backgroundColor: '#FEF2F2', padding: 14, marginTop: 8},
  errorText: {color: '#DC2626', fontSize: 13},
  emptyCard: {borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: 'white', padding: 16, marginTop: 8},
  emptyText: {color: '#737373', fontSize: 13},
  card: {borderRadius: 18, borderWidth: 1, borderColor: '#C3C6D6', backgroundColor: 'white', padding: 16},
  cardRow: {flexDirection: 'row', gap: 12},
  cardTop: {flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap'},
  cardTitle: {fontSize: 16, fontWeight: '800', color: '#000'},
  statusPill: {backgroundColor: '#ADECFF', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3},
  statusText: {fontSize: 10, fontWeight: '700', color: '#004E5D'},
  cardDetail: {fontSize: 13, color: '#434654', marginTop: 4},
  cardDateRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6},
  cardDate: {fontSize: 12, color: '#000'},
  expandButton: {width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#C3C6D6', alignItems: 'center', justifyContent: 'center'},
  expandButtonDark: {borderColor: '#374151'},
  expanded: {marginTop: 18, borderTopWidth: 1, borderTopColor: '#EDEDED', paddingTop: 18},
  expandedDark: {borderTopColor: '#374151'},
  expandedTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10},
  expandedHeading: {fontSize: 14, fontWeight: '800', color: '#111'},
  auditTypePill: {backgroundColor: '#BFDBFE', borderWidth: 1, borderColor: '#70B8E4', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5},
  auditTypeText: {fontSize: 11, color: '#003D9B', fontWeight: '600'},
  statsRow: {flexDirection: 'row', gap: 10, marginTop: 12},
  statBox: {flex: 1, height: 40, borderWidth: 1, borderColor: '#CECECE', borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  statBoxDark: {borderColor: '#374151', backgroundColor: '#111827'},
  statText: {fontSize: 13, color: '#222', fontWeight: '600'},
  auditorsText: {fontSize: 12, color: '#000', marginTop: 14},
  checkInButton: {marginTop: 16, minHeight: 46, borderRadius: 12, backgroundColor: '#154A95', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8},
  checkInButtonText: {color: '#fff', fontSize: 14, fontWeight: '800'},
  footer: {alignItems: 'center', paddingTop: 30, paddingBottom: 6},
  footerRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  footerImage: {width: 40, height: 40},
  footerTitle: {fontSize: 17, fontWeight: '800', color: '#003D9B'},
  footerSub: {fontSize: 12, color: '#8490A4', marginTop: 3},
  footerLine: {width: 80, height: 1, backgroundColor: '#E5E7EB', marginVertical: 10},
  footerLineDark: {backgroundColor: '#374151'},
  footerNote: {fontSize: 11, color: '#A2ABBC', textAlign: 'center'},
});
