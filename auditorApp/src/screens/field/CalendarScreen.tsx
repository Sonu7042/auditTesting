import React, {useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {fieldApi} from '../../api/field.api';
import {useAuth} from '../../store/AuthContext';
import {Job} from '../../types/field';
import {Badge, Card, Empty, ErrorBox, Icon, Loading, PageTitle, Screen, Segmented} from '../../ui/kit';
import {c} from '../../ui/theme';
import {useLoad} from '../../ui/useLoad';
import {dayKey, fmtLongDay, fmtTime, jobPhase, jobTitle, monthName, partnerOf, trackLabel, trackOf} from '../../utils/field';
import {TabProps} from '../../navigation/fieldTypes';
import {phaseBadge} from './AuditsScreen';

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function CalendarScreen({navigation}: TabProps<'Calendar'>) {
  const {user} = useAuth();
  const uid = user?.id;
  const [mode, setMode] = useState<'MONTH' | 'LIST'>('MONTH');
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(dayKey(today));
  const {data, error, loading, refreshing, refresh} = useLoad(() => fieldApi.jobs(), []);

  const jobs = useMemo(() => (data || []).filter(j => j.status !== 'CANCELLED'), [data]);
  const byDay = useMemo(() => {
    const m = new Map<string, Job[]>();
    for (const j of jobs) m.set(dayKey(j.scheduledStart), [...(m.get(dayKey(j.scheduledStart)) || []), j]);
    return m;
  }, [jobs]);

  const y = cursor.getFullYear();
  const mo = cursor.getMonth();
  const lead = (new Date(y, mo, 1).getDay() + 6) % 7;
  const days = new Date(y, mo + 1, 0).getDate();
  const cells: Array<number | null> = [...Array(lead).fill(null), ...Array.from({length: days}, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const dayJobs = (byDay.get(selected) || []).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  const upcoming = jobs.filter(j => new Date(j.scheduledEnd) >= new Date(today.getFullYear(), today.getMonth(), today.getDate())).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  const open = (j: Job) => navigation.navigate(jobPhase(j, uid) === 'IN_PROGRESS' ? 'AuditOverview' : 'Briefing', {jobId: j.id});

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <PageTitle
        title="Calendar"
        right={
          <Segmented
            style={{width: 150}}
            value={mode}
            onChange={setMode}
            options={[
              {key: 'MONTH', label: 'Month'},
              {key: 'LIST', label: 'List'},
            ]}
          />
        }
      />
      {loading && !data && <Loading />}
      {!!error && <ErrorBox message={error} onRetry={refresh} />}
      {data && mode === 'MONTH' && (
        <>
          <Card style={st.cal}>
            <View style={st.calHead}>
              <Pressable hitSlop={10} accessibilityLabel="Previous month" onPress={() => setCursor(new Date(y, mo - 1, 1))}>
                <Icon name="chevron-left" size={22} color={c.text} />
              </Pressable>
              <Text style={st.month}>
                {monthName(mo)} {y}
              </Text>
              <Pressable hitSlop={10} accessibilityLabel="Next month" onPress={() => setCursor(new Date(y, mo + 1, 1))}>
                <Icon name="chevron-right" size={22} color={c.text} />
              </Pressable>
            </View>
            <View style={st.grid}>
              {WEEK.map((w, i) => (
                <Text key={`w${i}`} style={st.week}>
                  {w}
                </Text>
              ))}
              {cells.map((d, i) => {
                if (!d) return <View key={`e${i}`} style={st.cell} />;
                const key = dayKey(new Date(y, mo, d));
                const on = key === selected;
                const has = byDay.has(key);
                const isToday = key === dayKey(today);
                return (
                  <Pressable key={key} onPress={() => setSelected(key)} style={st.cell}>
                    <View style={[st.day, on && st.dayOn]}>
                      <Text style={[st.dayText, isToday && !on && {color: c.green, fontWeight: '800'}, on && {color: '#FFFFFF', fontWeight: '700'}]}>{d}</Text>
                      <View style={[st.dot, has && {backgroundColor: on ? '#9FD3AE' : c.green}]} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Card>
          <View style={st.dayHead}>
            <Text style={st.dayTitle}>{fmtLongDay(selected).replace(',', '')}</Text>
            <Text style={st.count}>
              {dayJobs.length} audit{dayJobs.length === 1 ? '' : 's'}
            </Text>
          </View>
          {!dayJobs.length && <Text style={st.none}>No audit on this day.</Text>}
          {dayJobs.map(j => (
            <CalendarJob key={j.id} job={j} uid={uid} onPress={() => open(j)} />
          ))}
        </>
      )}
      {data && mode === 'LIST' && (
        <>
          {!upcoming.length && <Empty title="No upcoming audits" icon="calendar" />}
          {upcoming.map((j, i) => (
            <View key={j.id} style={{gap: 8}}>
              {(i === 0 || dayKey(upcoming[i - 1].scheduledStart) !== dayKey(j.scheduledStart)) && <Text style={st.listDay}>{fmtLongDay(j.scheduledStart)}</Text>}
              <CalendarJob job={j} uid={uid} onPress={() => open(j)} />
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

function CalendarJob({job, uid, onPress}: {job: Job; uid?: string; onPress: () => void}) {
  const badge = phaseBadge(job, uid);
  const partner = partnerOf(job, uid);
  const sent = (job.notices || []).filter(n => /^T\d$/.test(n.kind) && n.sentAt).map(n => n.kind.replace('T', 'T-'));
  return (
    <Card onPress={onPress} style={{gap: 8}}>
      <View style={st.jobHead}>
        <Text style={st.jobTitle}>{jobTitle(job)}</Text>
        <Badge label={badge.label} tone={badge.tone} />
      </View>
      <Text style={st.jobSub}>
        {fmtTime(job.scheduledStart)} to {fmtTime(job.scheduledEnd)} · {trackLabel(trackOf(job, uid))}
      </Text>
      <View style={st.tags}>
        {sent.length > 0 && <Badge label={`Dealer notified ${sent.join(', ')}`} tone="gray" style={st.tag} />}
        {partner && <Badge label={`With ${partner.auditor.fullName}`} tone="gray" style={st.tag} />}
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  cal: {padding: 14, borderRadius: 20},
  calHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 12},
  month: {fontSize: 16, fontWeight: '700', color: c.text},
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  week: {width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, fontWeight: '700', color: c.muted, marginBottom: 8},
  cell: {width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3},
  day: {width: 42, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  dayOn: {backgroundColor: c.ink},
  dayText: {fontSize: 15, color: c.text},
  dot: {width: 5, height: 5, borderRadius: 3, marginTop: 4, backgroundColor: 'transparent'},
  dayHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4},
  dayTitle: {fontSize: 17, fontWeight: '800', color: c.text},
  count: {fontSize: 13, color: c.muted},
  none: {fontSize: 13.5, color: c.muted},
  listDay: {fontSize: 13, fontWeight: '700', color: c.muted, marginTop: 6},
  jobHead: {flexDirection: 'row', justifyContent: 'space-between', gap: 10},
  jobTitle: {flex: 1, fontSize: 16, fontWeight: '700', color: c.text},
  jobSub: {fontSize: 13.5, color: c.muted},
  tags: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  tag: {borderRadius: 6},
});
