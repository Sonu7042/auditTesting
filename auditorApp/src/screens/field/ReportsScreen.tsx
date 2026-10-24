import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {fieldApi} from '../../api/field.api';
import {useAuth} from '../../store/AuthContext';
import {NonCompliance, Report} from '../../types/field';
import {Badge, Card, Chips, Empty, ErrorBox, Loading, Mono, PageTitle, Screen} from '../../ui/kit';
import {c} from '../../ui/theme';
import {useLoad} from '../../ui/useLoad';
import {fmtDay, isLead, isReturned, lastAction, openCorrections, ratingTone, REPORT_STATUS, reportBucket, scoreReport, jobTitle} from '../../utils/field';
import {TabProps} from '../../navigation/fieldTypes';

type Filter = 'ALL' | 'ME' | 'QC' | 'ISSUED';

export const capaWaiting = (r: Report, ncs: NonCompliance[]) => ncs.filter(n => n.jobId === r.jobId).length;

export const needsMe = (r: Report, uid: string | undefined, ncs: NonCompliance[]) =>
  (isReturned(r) && openCorrections(r).length > 0 && isLead(r.job, uid)) || (r.status === 'DRAFT' && isLead(r.job, uid)) || (capaWaiting(r, ncs) > 0 && isLead(r.job, uid));

export function reportAction(r: Report, uid: string | undefined, ncs: NonCompliance[]): {text: string; color: string} {
  const lead = isLead(r.job, uid);
  if (isReturned(r)) {
    const n = openCorrections(r).length;
    return lead ? {text: `Action: fix ${n} correction point${n === 1 ? '' : 's'}`, color: c.red} : {text: 'Returned to the lead auditor', color: c.red};
  }
  if (r.status === 'DRAFT') return lead ? {text: 'Action: review and submit to QC', color: c.amber} : {text: 'Waiting for the lead auditor to submit', color: c.muted};
  if (['UNDER_REVIEW', 'CORRECTION_SUBMITTED', 'APPROVED'].includes(r.status)) {
    const since = lastAction(r, 'SUBMIT')?.createdAt || r.updatedAt;
    return {text: r.status === 'APPROVED' ? 'Approved, waiting to be issued' : `With Back-Admin since ${fmtDay(since)}`, color: c.muted};
  }
  const capa = capaWaiting(r, ncs);
  const tail = capa ? ` · ${capa} CAPA to verify` : '';
  if (r.status === 'SIGNED_OFF') return {text: `Dealer signed ${fmtDay(r.signedAt)}${tail}`, color: c.green};
  return {text: `Issued ${fmtDay(r.publishedAt)} · waiting for dealer sign-off${tail}`, color: c.green};
}

export function ReportsScreen({navigation}: TabProps<'Reports'>) {
  const {user} = useAuth();
  const uid = user?.id;
  const [filter, setFilter] = useState<Filter>('ALL');
  const {data, error, loading, refreshing, refresh} = useLoad(async () => {
    const [reports, ncs] = await Promise.all([fieldApi.reports(), fieldApi.ncs({status: 'CAPA_SUBMITTED'}).catch(() => [] as NonCompliance[])]);
    return {reports, ncs};
  }, []);

  const reports = data?.reports || [];
  const ncs = data?.ncs || [];
  const pick = (f: Filter) => reports.filter(r => (f === 'ALL' ? true : f === 'ME' ? needsMe(r, uid, ncs) : f === 'QC' ? reportBucket(r) === 'WITH_QC' : reportBucket(r) === 'ISSUED'));
  const shown = pick(filter).sort((a, b) => Number(needsMe(b, uid, ncs)) - Number(needsMe(a, uid, ncs)));

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <PageTitle title="My reports" subtitle="Reports from your audits, from draft to the dealer's sign-off." />
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          {key: 'ALL', label: `All ${reports.length}`},
          {key: 'ME', label: `Needs me ${pick('ME').length}`},
          {key: 'QC', label: `With QC ${pick('QC').length}`},
          {key: 'ISSUED', label: `Issued ${pick('ISSUED').length}`},
        ]}
      />
      {loading && !data && <Loading />}
      {!!error && <ErrorBox message={error} onRetry={refresh} />}
      {data && !shown.length && <Empty title="No reports here" body="A report is drafted when every auditor on the audit has submitted." icon="file-text" />}
      {shown.map(r => {
        const score = scoreReport(r);
        const status = REPORT_STATUS[r.status] || {label: r.status, tone: 'gray' as const};
        const action = reportAction(r, uid, ncs);
        return (
          <Card key={r.id} onPress={() => navigation.navigate('ReportDetail', {reportId: r.id})} style={[{gap: 8}, isReturned(r) && st.returned]}>
            <View style={st.head}>
              <Text style={st.title}>{jobTitle(r.job)}</Text>
              <Badge label={status.label} tone={status.tone} />
            </View>
            <Mono>{r.reportNumber}</Mono>
            <View style={st.scoreRow}>
              <Text style={st.score}>{score.percent == null ? '—' : `${score.percent}%`}</Text>
              {score.rating && <Badge label={`Rating ${score.rating}`} tone={ratingTone(score.rating)} style={{borderRadius: 6}} />}
              <View style={{flex: 1}} />
              <Text style={st.findings}>
                {score.findings} finding{score.findings === 1 ? '' : 's'}
              </Text>
            </View>
            <Text style={[st.action, {color: action.color}]}>{action.text}</Text>
          </Card>
        );
      })}
    </Screen>
  );
}

const st = StyleSheet.create({
  returned: {borderColor: c.red, borderWidth: 1.5},
  head: {flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start'},
  title: {flex: 1, fontSize: 17, fontWeight: '700', color: c.text},
  scoreRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  score: {fontSize: 21, fontWeight: '700', color: c.text},
  findings: {fontSize: 13, color: c.muted},
  action: {fontSize: 13.5, fontWeight: '600'},
});
