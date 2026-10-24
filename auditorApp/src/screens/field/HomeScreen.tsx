import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {fieldApi} from '../../api/field.api';
import {useAuth} from '../../store/AuthContext';
import {useNotifications} from '../../store/NotificationContext';
import {useOutbox} from '../../store/OutboxContext';
import {Job, NonCompliance, Report, Training} from '../../types/field';
import {Button, Card, ErrorBox, Icon, Loading, Screen} from '../../ui/kit';
import {c, mono} from '../../ui/theme';
import {useLoad} from '../../ui/useLoad';
import {
  checkInOpensAt,
  DISCIPLINE,
  fmtDate,
  fmtLongDay,
  fmtTime,
  inCheckInWindow,
  isLead,
  isReturned,
  jobPhase,
  jobTitle,
  mySession,
  openCorrections,
  partnerOf,
  TRACK_DISCIPLINES,
  trackLabel,
  trackOf,
} from '../../utils/field';
import {TabProps} from '../../navigation/fieldTypes';

type Attention = {key: string; tone: string; title: string; sub: string; go: () => void};

const settle = async <T,>(p: Promise<T>, fallback: T) => {
  try {
    return await p;
  } catch {
    return fallback;
  }
};

export function HomeScreen({navigation}: TabProps<'Home'>) {
  const {user} = useAuth();
  const uid = user?.id;
  const {unreadCount, refresh: refreshBell} = useNotifications();
  const {items: waiting} = useOutbox();

  const {data, error, loading, refreshing, refresh} = useLoad(async () => {
    refreshBell();
    const [jobs, reports, ncs, training] = await Promise.all([
      fieldApi.jobs(),
      settle(fieldApi.reports(), [] as Report[]),
      settle(fieldApi.ncs({status: 'CAPA_SUBMITTED'}), [] as NonCompliance[]),
      settle(fieldApi.training(), null as Training | null),
    ]);
    const published = reports.filter(r => r.status === 'PUBLISHED' && isLead(r.job, uid));
    const questions = await Promise.all(published.map(r => settle(fieldApi.clarifications(r.id), []).then(list => ({report: r, open: list.filter(x => x.status === 'OPEN').length}))));
    return {jobs, reports, ncs, training, questions};
  }, [uid]);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = user?.fullName?.split(' ')[0] || '';

  const jobs = data?.jobs || [];
  const active = jobs.find(j => jobPhase(j, uid) === 'IN_PROGRESS');
  const today = active || jobs.find(j => jobPhase(j, uid) === 'TODAY');
  const next = today ? null : jobs.filter(j => jobPhase(j, uid) === 'UPCOMING').sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))[0];

  const monthJobs = jobs.filter(j => j.status !== 'CANCELLED' && new Date(j.scheduledStart).getMonth() === now.getMonth() && new Date(j.scheduledStart).getFullYear() === now.getFullYear());
  const submitted = monthJobs.filter(j => mySession(j, uid)?.status === 'COMPLETED').length;
  const scored = (data?.reports || []).filter(r => r.qcScore != null);
  const qc = scored.length ? Math.round(scored.reduce((a, r) => a + Number(r.qcScore), 0) / scored.length) : null;

  const attention: Attention[] = [];
  if (data) {
    const onb = data.training?.onboarding;
    if (onb && onb.status !== 'APPROVED') attention.push({key: 'training', tone: c.blue, title: onb.status === 'UNDER_REVIEW' ? 'Training sent for review' : 'Finish your training', sub: onb.status === 'UNDER_REVIEW' ? 'Back-Admin is checking your quiz and demo' : 'Video, quiz and demo checklist', go: () => navigation.navigate('Training')});
    for (const r of data.reports.filter(isReturned)) {
      const n = openCorrections(r).length;
      attention.push({key: `ret-${r.id}`, tone: c.red, title: 'Report returned by QC', sub: `${jobTitle(r.job)}, ${n} change${n === 1 ? '' : 's'} asked`, go: () => navigation.navigate('ReportDetail', {reportId: r.id})});
    }
    for (const r of data.reports.filter(x => x.status === 'DRAFT' && isLead(x.job, uid))) {
      attention.push({key: `draft-${r.id}`, tone: c.amber, title: 'Review and submit a report', sub: `${jobTitle(r.job)}, draft ready for QC`, go: () => navigation.navigate('ReportDetail', {reportId: r.id})});
    }
    const byJob = new Map<string, NonCompliance[]>();
    for (const nc of data.ncs) {
      const job = nc.response.session.job;
      if (!job.assignments.some(a => a.auditorId === uid && a.assignmentRole === 'LEAD')) continue;
      byJob.set(job.id, [...(byJob.get(job.id) || []), nc]);
    }
    for (const [jobId, list] of byJob) {
      const loc = list[0].response.session.job.location;
      attention.push({key: `capa-${jobId}`, tone: c.amber, title: `Verify ${list.length} CAPA submission${list.length === 1 ? '' : 's'}`, sub: `${loc.dealerName}, ${loc.locationName}, evidence uploaded`, go: () => navigation.navigate('CapaVerify', {jobId})});
    }
    for (const q of data.questions.filter(x => x.open)) {
      attention.push({key: `q-${q.report.id}`, tone: c.blue, title: q.open === 1 ? 'Answer a dealer question' : `Answer ${q.open} dealer questions`, sub: `${jobTitle(q.report.job)} report`, go: () => navigation.navigate('DealerQuestions', {reportId: q.report.id})});
    }
  }
  if (waiting.length) attention.push({key: 'outbox', tone: c.amber, title: `${waiting.length} answer${waiting.length === 1 ? '' : 's'} waiting to upload`, sub: 'Saved on this tablet, uploads when online', go: () => navigation.navigate('OfflineSync')});

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={st.top}>
        <View style={{flex: 1}}>
          <Text style={st.date}>{fmtLongDay(now)}</Text>
          <Text style={st.hello}>
            {greeting}
            {first ? `, ${first}` : ''}
          </Text>
        </View>
        <Pressable accessibilityLabel="Notifications" onPress={() => navigation.navigate('Notifications')} style={st.bell}>
          <Icon name="bell" size={22} color={c.text} />
          {unreadCount > 0 && (
            <View style={st.bellBadge}>
              <Text style={st.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {loading && !data ? <Loading /> : null}
      {!!error && !data && <ErrorBox message={error} onRetry={refresh} />}

      {data && (today || next) && <TodayCard job={(today || next)!} uid={uid} upcoming={!today} onBriefing={j => navigation.navigate('Briefing', {jobId: j.id})} onCheckIn={j => navigation.navigate('CheckIn', {jobId: j.id})} onResume={j => navigation.navigate('AuditOverview', {jobId: j.id})} />}
      {data && !today && !next && (
        <Card>
          <Text style={st.noneTitle}>No audit planned</Text>
          <Text style={st.noneBody}>Back-Admin will assign your next audit. You get a notification when it is planned.</Text>
        </Card>
      )}

      {data && (
        <View style={st.stats}>
          <Stat value={String(monthJobs.length)} label="Audits this month" />
          <Stat value={String(submitted)} label="Submitted" />
          <Stat value={qc == null ? '—' : `${qc}%`} label="QC score" />
        </View>
      )}

      {data && attention.length > 0 && (
        <>
          <Text style={st.h2}>Needs your attention</Text>
          {attention.map(a => (
            <Pressable key={a.key} onPress={a.go} style={({pressed}) => [st.att, pressed && {opacity: 0.7}]}>
              <View style={[st.attDot, {backgroundColor: a.tone}]} />
              <View style={{flex: 1}}>
                <Text style={st.attTitle}>{a.title}</Text>
                <Text style={st.attSub} numberOfLines={1}>
                  {a.sub}
                </Text>
              </View>
              <Icon name="chevron-right" size={18} color={c.muted} />
            </Pressable>
          ))}
        </>
      )}

      {data?.training?.onboarding.status === 'APPROVED' && data.training.onboarding.expiresAt && <CertBanner training={data.training} onPress={() => navigation.navigate('Training')} />}
    </Screen>
  );
}

function TodayCard({job, uid, upcoming, onBriefing, onCheckIn, onResume}: {job: Job; uid?: string; upcoming: boolean; onBriefing: (j: Job) => void; onCheckIn: (j: Job) => void; onResume: (j: Job) => void}) {
  const phase = jobPhase(job, uid);
  const track = trackOf(job, uid);
  const partner = partnerOf(job, uid);
  const open = inCheckInWindow(job);
  const label = upcoming ? `NEXT · ${fmtDate(job.scheduledStart).toUpperCase()}` : 'TODAY';
  const pill = phase === 'IN_PROGRESS' ? 'In progress' : upcoming ? null : open ? 'Check-in open' : `Check-in opens ${fmtTime(checkInOpensAt(job))}`;
  return (
    <View style={st.today}>
      <View style={st.todayTop}>
        <Text style={st.todayLabel}>{label}</Text>
        {pill && (
          <View style={st.todayPill}>
            <Text style={st.todayPillText}>{pill}</Text>
          </View>
        )}
      </View>
      <Text style={st.todayTitle}>{jobTitle(job)}</Text>
      <Text style={st.todaySub} numberOfLines={1}>
        {[job.location.locationCode, job.location.address].filter(Boolean).join(' · ')}
      </Text>
      <View style={st.tags}>
        <View style={[st.tag, st.tagOn]}>
          <Text style={[st.tagText, {color: c.text}]}>{trackLabel(track)}</Text>
        </View>
        {(TRACK_DISCIPLINES[track] || []).map(d => (
          <View key={d} style={st.tag}>
            <Text style={st.tagText}>{DISCIPLINE[d]}</Text>
          </View>
        ))}
      </View>
      <Text style={st.todayTime}>
        {fmtTime(job.scheduledStart)} to {fmtTime(job.scheduledEnd)}
        {partner ? ` · With ${partner.auditor.fullName}${partner.track !== 'ALL' ? ` (Track ${partner.track})` : ''}` : ''}
      </Text>
      <View style={st.todayActions}>
        <Button label="Open briefing" variant="light" small style={{flex: 1}} onPress={() => onBriefing(job)} />
        {phase === 'IN_PROGRESS' ? (
          <Button label="Resume audit" variant="outlineDark" small style={{flex: 1}} onPress={() => onResume(job)} />
        ) : (
          <Button label="Check in" variant="outlineDark" small style={{flex: 1}} disabled={upcoming || !open || phase === 'DONE'} onPress={() => onCheckIn(job)} />
        )}
      </View>
    </View>
  );
}

function CertBanner({training, onPress}: {training: Training; onPress: () => void}) {
  const o = training.onboarding;
  const expires = new Date(o.expiresAt!);
  const opens = new Date(expires.getTime() - 30 * 864e5);
  const due = o.refresherDue;
  return (
    <Pressable onPress={onPress} style={[st.cert, due && {backgroundColor: c.amberSoft}]}>
      <View style={st.certIcon}>
        <Icon name="award" size={20} color={due ? c.amber : c.green} />
      </View>
      <Text style={[st.certText, due && {color: c.amber}]}>
        <Text style={{fontWeight: '800'}}>{o.expired ? 'Certificate ended.' : `Certified until ${fmtDate(expires)}.`}</Text>{' '}
        {due ? 'Refresher training is open now.' : `Refresher training opens on ${fmtDate(opens).replace(/ \d{4}$/, '')}.`}
      </Text>
    </Pressable>
  );
}

function Stat({value, label}: {value: string; label: string}) {
  return (
    <View style={st.stat}>
      <Text style={st.statValue}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  top: {flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6},
  date: {fontSize: 14, color: c.muted},
  hello: {fontSize: 27, fontWeight: '800', color: c.text, marginTop: 2, letterSpacing: -0.3},
  bell: {width: 46, height: 46, borderRadius: 23, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center'},
  bellBadge: {position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: c.red, alignItems: 'center', justifyContent: 'center'},
  bellBadgeText: {color: '#FFFFFF', fontSize: 11, fontWeight: '800'},
  today: {backgroundColor: c.ink, borderRadius: 20, padding: 18, gap: 8},
  todayTop: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  todayLabel: {fontFamily: mono, fontSize: 12, letterSpacing: 2, color: '#9FD3AE'},
  todayPill: {backgroundColor: '#24452F', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4},
  todayPillText: {color: '#CDEBD5', fontSize: 12, fontWeight: '700'},
  todayTitle: {fontSize: 23, fontWeight: '800', color: '#FFFFFF', marginTop: 4},
  todaySub: {fontSize: 13.5, color: '#B9BEB8'},
  tags: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4},
  tag: {backgroundColor: c.inkSoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4},
  tagOn: {backgroundColor: '#FFFFFF'},
  tagText: {color: '#DADDD9', fontSize: 12.5, fontWeight: '600'},
  todayTime: {fontSize: 13.5, color: '#DADDD9', marginTop: 2},
  todayActions: {flexDirection: 'row', gap: 10, marginTop: 8},
  noneTitle: {fontSize: 16, fontWeight: '700', color: c.text},
  noneBody: {fontSize: 13.5, color: c.muted, marginTop: 4, lineHeight: 19},
  stats: {flexDirection: 'row', gap: 10},
  stat: {flex: 1, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.line, padding: 12, minHeight: 84},
  statValue: {fontSize: 25, fontWeight: '700', color: c.text},
  statLabel: {fontSize: 12.5, color: c.muted, marginTop: 4},
  h2: {fontSize: 17, fontWeight: '800', color: c.text, marginTop: 6},
  att: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.line, paddingHorizontal: 14, paddingVertical: 12},
  attDot: {width: 8, height: 8, borderRadius: 4},
  attTitle: {fontSize: 15, fontWeight: '600', color: c.text},
  attSub: {fontSize: 12.5, color: c.muted, marginTop: 2},
  cert: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.greenSoft, borderRadius: 14, padding: 14, marginTop: 4},
  certIcon: {width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center'},
  certText: {flex: 1, fontSize: 13.5, color: c.greenDark, lineHeight: 19},
});
