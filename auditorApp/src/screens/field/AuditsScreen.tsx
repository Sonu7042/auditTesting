import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {fieldApi} from '../../api/field.api';
import {useAuth} from '../../store/AuthContext';
import {useOutbox, withPending} from '../../store/OutboxContext';
import {Job} from '../../types/field';
import {Badge, Button, Card, Chips, Empty, ErrorBox, Loading, PageTitle, Progress, Screen} from '../../ui/kit';
import {c, Tone} from '../../ui/theme';
import {useLoad} from '../../ui/useLoad';
import {checkInOpensAt, DISCIPLINE_SHORT, facilityName, fmtDay, fmtTime, inCheckInWindow, JobPhase, jobPhase, jobTitle, mySession, sameDay, TRACK_DISCIPLINES, trackLabel, trackOf} from '../../utils/field';
import {TabProps} from '../../navigation/fieldTypes';

type Filter = 'ACTIVE' | 'UPCOMING' | 'DONE';
const bucket = (p: JobPhase): Filter | null => (p === 'IN_PROGRESS' || p === 'TODAY' ? 'ACTIVE' : p === 'UPCOMING' ? 'UPCOMING' : p === 'DONE' || p === 'MISSED' ? 'DONE' : null);

export function AuditsScreen({navigation}: TabProps<'Audits'>) {
  const {user} = useAuth();
  const uid = user?.id;
  const {pendingFor, cachedSession} = useOutbox();
  const [filter, setFilter] = useState<Filter>('ACTIVE');

  const {data, error, loading, refreshing, refresh} = useLoad(async () => {
    const jobs = await fieldApi.jobs();
    const progress: Record<string, {done: number; total: number}> = {};
    await Promise.all(
      jobs
        .filter(j => jobPhase(j, uid) === 'IN_PROGRESS')
        .map(async j => {
          const session = await fieldApi.session(j.id).catch(() => cachedSession(j.id));
          if (!session) return;
          const qs = withPending(session, pendingFor(j.id)).modules.flatMap(m => m.sections.flatMap(s => s.questions));
          progress[j.id] = {done: qs.filter(q => q.response?.responseStatus === 'SUBMITTED').length, total: qs.length};
        }),
    );
    return {jobs, progress};
  }, [uid]);

  const jobs = (data?.jobs || []).filter(j => bucket(jobPhase(j, uid)));
  const count = (f: Filter) => jobs.filter(j => bucket(jobPhase(j, uid)) === f).length;
  const shown = jobs
    .filter(j => bucket(jobPhase(j, uid)) === filter)
    .sort((a, b) => (filter === 'DONE' ? b.scheduledStart.localeCompare(a.scheduledStart) : a.scheduledStart.localeCompare(b.scheduledStart)))
    .sort((a, b) => Number(jobPhase(b, uid) === 'IN_PROGRESS') - Number(jobPhase(a, uid) === 'IN_PROGRESS'));

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <PageTitle title="My audits" subtitle="Open one to read the briefing, check in and answer the checklist." />
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          {key: 'ACTIVE', label: `Active ${count('ACTIVE')}`},
          {key: 'UPCOMING', label: `Upcoming ${count('UPCOMING')}`},
          {key: 'DONE', label: `Done ${count('DONE')}`},
        ]}
      />
      {loading && !data && <Loading />}
      {!!error && <ErrorBox message={error} onRetry={refresh} />}
      {data && !shown.length && <Empty title={filter === 'ACTIVE' ? 'Nothing active today' : filter === 'UPCOMING' ? 'No upcoming audits' : 'No finished audits yet'} body={filter === 'ACTIVE' ? 'Audits planned for today and audits you have started show here.' : undefined} />}
      {shown.map(job => (
        <JobCard
          key={job.id}
          job={job}
          uid={uid}
          progress={data?.progress[job.id]}
          onResume={() => navigation.navigate('AuditOverview', {jobId: job.id})}
          onBriefing={() => navigation.navigate('Briefing', {jobId: job.id})}
          onCheckIn={() => navigation.navigate('CheckIn', {jobId: job.id})}
          onReports={() => navigation.navigate('Tabs', {screen: 'Reports'})}
        />
      ))}
    </Screen>
  );
}

export function phaseBadge(job: Job, uid?: string): {label: string; tone: Tone} {
  const p = jobPhase(job, uid);
  if (p === 'IN_PROGRESS') return {label: 'In progress', tone: 'amber'};
  if (p === 'DONE') return {label: 'Completed', tone: 'green'};
  if (p === 'MISSED') return {label: 'Missed', tone: 'red'};
  if (p === 'TODAY') return inCheckInWindow(job) ? {label: 'Check-in open', tone: 'green'} : {label: `Check-in ${fmtTime(checkInOpensAt(job))}`, tone: 'blue'};
  return {label: 'Scheduled', tone: 'gray'};
}

function JobCard({job, uid, progress, onResume, onBriefing, onCheckIn, onReports}: {job: Job; uid?: string; progress?: {done: number; total: number}; onResume: () => void; onBriefing: () => void; onCheckIn: () => void; onReports: () => void}) {
  const phase = jobPhase(job, uid);
  const badge = phaseBadge(job, uid);
  const track = trackOf(job, uid);
  const session = mySession(job, uid);
  const when =
    phase === 'IN_PROGRESS' && session
      ? `Started ${fmtTime(session.checkedInAt)}${sameDay(session.checkedInAt, new Date()) ? ' today' : ` on ${fmtDay(session.checkedInAt)}`}`
      : `${sameDay(job.scheduledStart, new Date()) ? 'Today' : fmtDay(job.scheduledStart) + ','} ${fmtTime(job.scheduledStart)} to ${fmtTime(job.scheduledEnd)}`;
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <Card style={[phase === 'IN_PROGRESS' && st.activeCard, {gap: 10}]}>
      <View style={st.head}>
        <Text style={st.title}>{jobTitle(job)}</Text>
        <Badge label={badge.label} tone={badge.tone} />
      </View>
      <Text style={st.sub}>
        {facilityName(job)} · {when}
      </Text>
      <View style={st.tags}>
        <Badge label={trackLabel(track)} tone="dark" style={st.tagShape} />
        <Badge label={(TRACK_DISCIPLINES[track] || []).map(d => DISCIPLINE_SHORT[d].replace(' and life', '')).join(', ')} tone="gray" style={st.tagShape} />
      </View>
      {phase === 'IN_PROGRESS' && (
        <>
          {progress && (
            <View style={{gap: 6}}>
              <View style={st.progressRow}>
                <Text style={st.sub}>
                  {progress.done} of {progress.total} points answered
                </Text>
                <Text style={st.sub}>{pct}%</Text>
              </View>
              <Progress value={pct} />
            </View>
          )}
          <Button label="Resume audit" onPress={onResume} />
        </>
      )}
      {phase === 'TODAY' && (
        <View style={st.actions}>
          <Button label="Open briefing" variant="secondary" style={{flex: 1}} onPress={onBriefing} />
          {inCheckInWindow(job) && <Button label="Check in" style={{flex: 1}} onPress={onCheckIn} />}
        </View>
      )}
      {phase === 'UPCOMING' && <Button label="Open briefing" variant="secondary" onPress={onBriefing} />}
      {phase === 'DONE' && <Button label="See the report" variant="secondary" onPress={onReports} />}
    </Card>
  );
}

const st = StyleSheet.create({
  activeCard: {borderColor: c.green, borderWidth: 1.5},
  head: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10},
  title: {flex: 1, fontSize: 17, fontWeight: '700', color: c.text},
  sub: {fontSize: 13.5, color: c.muted},
  tags: {flexDirection: 'row', gap: 6, flexWrap: 'wrap'},
  tagShape: {borderRadius: 6},
  progressRow: {flexDirection: 'row', justifyContent: 'space-between'},
  actions: {flexDirection: 'row', gap: 10},
});
