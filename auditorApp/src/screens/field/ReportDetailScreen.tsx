import React, {useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {fieldApi} from '../../api/field.api';
import {useAuth} from '../../store/AuthContext';
import {Clarification, LifecycleStage, NonCompliance, Report} from '../../types/field';
import {Badge, Button, Card, ErrorBox, Field, Icon, Loading, Screen} from '../../ui/kit';
import {c, mono} from '../../ui/theme';
import {useLoad} from '../../ui/useLoad';
import {downloadAndShare, MIME} from '../../utils/files';
import {fmtDay, isLead, isReturned, jobTitle, openCorrections, partnerOf, ratingTone, REPORT_STATUS, scoreReport} from '../../utils/field';
import {StackProps} from '../../navigation/fieldTypes';

type Step = {title: string; detail: string; state: 'DONE' | 'CURRENT' | 'ALERT' | 'PENDING'};

const finishedAt = (r: Report) => {
  const first = [...(r.job.sessions || [])].sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt))[0];
  return first?.completion?.completedAt || first?.endedAt || null;
};

function buildSteps(r: Report, stages: LifecycleStage[] | null, uid: string | undefined, ncs: number): Step[] {
  const get = (k: string) => stages?.find(s => s.key === k);
  const state = (k: string, fallback: Step['state']): Step['state'] => {
    const s = get(k);
    return s ? (s.state === 'DONE' ? 'DONE' : s.state === 'CURRENT' ? 'CURRENT' : 'PENDING') : fallback;
  };
  const partner = partnerOf(r.job, uid);
  const done = finishedAt(r);
  const submit = r.history.filter(h => h.action === 'SUBMIT').pop();
  const returns = r.history.filter(h => h.action === 'RETURN' || h.action === 'CORRECTION_RAISED').length;
  const open = openCorrections(r).length;
  const late = done && submit ? (new Date(submit.createdAt).getTime() - new Date(done).getTime()) / 36e5 > 24 : false;
  const issued = ['PUBLISHED', 'SIGNED_OFF'].includes(r.status);
  const review = state('review', ['UNDER_REVIEW', 'CORRECTION_REQUIRED', 'RETURNED', 'CORRECTION_SUBMITTED'].includes(r.status) ? 'CURRENT' : issued || r.status === 'APPROVED' ? 'DONE' : 'PENDING');
  return [
    {title: 'Audit completed', detail: `${partner ? `You and ${partner.auditor.fullName}` : 'You'}${done ? `, ${fmtDay(done)}` : ''}`, state: state('audit', 'DONE')},
    {title: 'Report submitted to QC', detail: submit ? `${isLead(r.job, uid) ? 'By you' : 'By the lead auditor'}, ${late ? 'after 24 hours' : 'within 24 hours'}` : 'The lead auditor reviews the draft and submits it', state: state('submitted', submit ? 'DONE' : 'CURRENT')},
    {
      title: 'Back-Admin review',
      detail: isReturned(r) ? `Returned ${returns === 1 ? 'once' : `${returns} times`} · ${open} correction point${open === 1 ? '' : 's'} open` : r.status === 'CORRECTION_SUBMITTED' ? 'Your corrections are being checked' : review === 'DONE' ? 'Approved' : 'Checks the answers, photos and score',
      state: isReturned(r) ? 'ALERT' : review,
    },
    {title: 'Issued to the dealer', detail: issued ? `Revision ${r.revision}, ${fmtDay(r.publishedAt)}` : 'After QC approves', state: state('issued', issued ? 'DONE' : r.status === 'APPROVED' ? 'CURRENT' : 'PENDING')},
    {title: 'Dealer approval', detail: r.status === 'SIGNED_OFF' ? `Signed by ${r.signedByName}${r.signedByDesignation ? `, ${r.signedByDesignation}` : ''}` : 'Questions, changes, then a named signature', state: state('approval', r.status === 'SIGNED_OFF' ? 'DONE' : r.status === 'PUBLISHED' ? 'CURRENT' : 'PENDING')},
    {title: 'CAPA on findings', detail: ncs ? `${ncs} waiting for you to verify` : get('capa')?.detail || "You verify the dealer's evidence", state: state('capa', 'PENDING')},
  ];
}

export function ReportDetailScreen({navigation, route}: StackProps<'ReportDetail'>) {
  const {reportId} = route.params;
  const {user} = useAuth();
  const uid = user?.id;
  const [delay, setDelay] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const {data, error: loadError, loading, refresh, refreshing, reload} = useLoad(async () => {
    const report = (await fieldApi.reports()).find(r => r.id === reportId);
    if (!report) throw new Error('This report is not available.');
    const [life, questions, ncs] = await Promise.all([
      fieldApi.lifecycle(reportId).catch(() => null),
      ['PUBLISHED', 'SIGNED_OFF'].includes(report.status) ? fieldApi.clarifications(reportId).catch(() => [] as Clarification[]) : Promise.resolve([] as Clarification[]),
      fieldApi.ncs({status: 'CAPA_SUBMITTED'}).catch(() => [] as NonCompliance[]),
    ]);
    return {report, stages: life?.stages || null, questions, capa: ncs.filter(n => n.jobId === report.jobId)};
  }, [reportId]);

  if (loading && !data) return <Screen title="Report" onBack={navigation.goBack}><Loading /></Screen>;
  if (!data) return <Screen title="Report" onBack={navigation.goBack}><ErrorBox message={loadError} onRetry={refresh} /></Screen>;

  const r = data.report;
  const lead = isLead(r.job, uid);
  const score = scoreReport(r);
  const status = REPORT_STATUS[r.status] || {label: r.status, tone: 'gray' as const};
  const open = openCorrections(r);
  const done = finishedAt(r);
  const late = r.status === 'DRAFT' && done ? (Date.now() - new Date(done).getTime()) / 36e5 > 24 : false;
  const openQuestions = data.questions.filter(q => q.status === 'OPEN');
  const steps = buildSteps(r, data.stages, uid, data.capa.length);
  const file = `${r.reportNumber}${r.revision > 1 ? `-rev${r.revision}` : ''}`;

  const download = async (kind: 'pdf' | 'docx') => {
    setBusy(kind);
    setError('');
    try {
      if (kind === 'pdf') await downloadAndShare(`/client-audit-reports/${r.id}/pdf`, `${file}.pdf`, MIME.pdf);
      else await downloadAndShare(`/client-qc/reports/${r.id}/docx`, `${file}.docx`, MIME.docx);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const submit = async () => {
    setBusy('submit');
    setError('');
    try {
      const res = await fieldApi.reviewReport(r.id, 'SUBMIT', delay.trim() || undefined);
      Alert.alert('Sent to QC', res.message);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const primary =
    isReturned(r) && lead && open.length ? (
      <Button label={`Open correction tasks (${open.length})`} onPress={() => navigation.navigate('Correction', {reportId: r.id})} />
    ) : r.status === 'DRAFT' && lead ? (
      <Button label="Submit to QC" onPress={submit} loading={busy === 'submit'} disabled={late && delay.trim().length < 5} />
    ) : data.capa.length && lead ? (
      <Button label={`Verify CAPA (${data.capa.length})`} onPress={() => navigation.navigate('CapaVerify', {jobId: r.jobId})} />
    ) : null;

  return (
    <Screen
      title={jobTitle(r.job)}
      subtitle={`${r.reportNumber} · revision ${r.revision}`}
      onBack={navigation.goBack}
      right={<Badge label={status.label} tone={status.tone} />}
      refreshing={refreshing}
      onRefresh={refresh}
      footer={
        <>
          {primary}
          <View style={st.row}>
            <Button label="View PDF" variant="secondary" small style={{flex: 1}} loading={busy === 'pdf'} onPress={() => download('pdf')} />
            <Button label="Share Word file" variant="secondary" small style={{flex: 1}} loading={busy === 'docx'} onPress={() => download('docx')} />
          </View>
        </>
      }>
      <View style={st.tiles}>
        <Tile label="Audit score" value={score.percent == null ? '—' : `${score.percent}%`} />
        <Tile label="Rating" value={score.rating || '—'} color={score.rating ? (ratingTone(score.rating) === 'green' ? c.green : ratingTone(score.rating) === 'red' ? c.red : c.amber) : undefined} />
        <Tile label="Findings" value={String(score.findings)} />
      </View>

      {isReturned(r) && (
        <Card tone="red">
          <Text style={st.alertText}>
            <Text style={st.bold}>QC asked for changes. </Text>
            {r.reviewRemarks ? `"${r.reviewRemarks}" ` : ''}
            {lead ? `Fix the ${open.length} correction point${open.length === 1 ? '' : 's'}, then submit again.` : 'The lead auditor fixes the correction points.'}
          </Text>
        </Card>
      )}
      {r.status === 'CORRECTION_SUBMITTED' && (
        <Card tone="blue">
          <Text style={[st.alertText, {color: c.blue}]}>Your corrections are with QC. You will be told if anything else is needed.</Text>
        </Card>
      )}
      {r.status === 'DRAFT' && lead && (
        <Card tone="amber" style={{gap: 10}}>
          <Text style={[st.alertText, {color: c.amber}]}>
            {late ? 'This report is more than 24 hours past the audit. Give the reason for the delay, then submit.' : 'Check the draft (View PDF), then submit it to QC. Reports are due within 24 hours of the audit.'}
          </Text>
          {late && <Field value={delay} onChangeText={setDelay} placeholder="For example: no network at the site" multiline />}
        </Card>
      )}

      <Card style={{gap: 2}}>
        <Text style={st.h3}>Where this report is</Text>
        {steps.map((s, i) => (
          <View key={s.title} style={st.step}>
            <View style={st.rail}>
              <View style={[st.node, s.state === 'DONE' && st.nodeDone, s.state === 'ALERT' && st.nodeAlert, s.state === 'CURRENT' && st.nodeCurrent]}>
                {s.state === 'DONE' ? <Icon name="check" size={13} color="#FFFFFF" /> : s.state === 'ALERT' ? <Text style={st.nodeBang}>!</Text> : <Text style={[st.nodeNum, s.state === 'CURRENT' && {color: c.green}]}>{i + 1}</Text>}
              </View>
              {i < steps.length - 1 && <View style={[st.bar, s.state === 'DONE' && {backgroundColor: c.greenLine}]} />}
            </View>
            <View style={st.stepBody}>
              <Text style={[st.stepTitle, s.state === 'ALERT' && {color: c.red}, s.state === 'PENDING' && {color: c.muted}]}>{s.title}</Text>
              <Text style={st.stepDetail}>{s.detail}</Text>
            </View>
          </View>
        ))}
      </Card>

      {openQuestions.length > 0 && (
        <Card tone="blue" style={{gap: 10}}>
          <Text style={[st.alertText, {color: c.blue}]}>
            <Text style={st.bold}>The dealer asked {openQuestions.length === 1 ? 'a question' : `${openQuestions.length} questions`}. </Text>
            {lead ? 'Answer before they sign off.' : 'The lead auditor or Back-Admin answers.'}
          </Text>
          <Button small variant="secondary" label="Read and answer" onPress={() => navigation.navigate('DealerQuestions', {reportId: r.id})} />
        </Card>
      )}
      {!!error && <ErrorBox message={error} />}
    </Screen>
  );
}

function Tile({label, value, color}: {label: string; value: string; color?: string}) {
  return (
    <View style={st.tile}>
      <Text style={st.tileLabel}>{label}</Text>
      <Text style={[st.tileValue, color ? {color} : null]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  row: {flexDirection: 'row', gap: 10},
  tiles: {flexDirection: 'row', gap: 10},
  tile: {flex: 1, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.line, padding: 12},
  tileLabel: {fontSize: 12.5, color: c.muted},
  tileValue: {fontSize: 27, fontWeight: '700', color: c.text, marginTop: 2, fontFamily: mono},
  alertText: {fontSize: 13.5, color: c.red, lineHeight: 19},
  bold: {fontWeight: '800'},
  h3: {fontSize: 16, fontWeight: '800', color: c.text, marginBottom: 10},
  step: {flexDirection: 'row', gap: 12},
  rail: {alignItems: 'center', width: 24},
  node: {width: 24, height: 24, borderRadius: 12, backgroundColor: '#E6E7E3', alignItems: 'center', justifyContent: 'center'},
  nodeDone: {backgroundColor: c.green},
  nodeAlert: {backgroundColor: c.red},
  nodeCurrent: {backgroundColor: c.greenSoft, borderWidth: 1.5, borderColor: c.green},
  nodeBang: {color: '#FFFFFF', fontWeight: '900', fontSize: 13},
  nodeNum: {fontSize: 12, fontWeight: '700', color: c.muted},
  bar: {flex: 1, width: 2, backgroundColor: c.line, marginVertical: 2, minHeight: 14},
  stepBody: {flex: 1, paddingBottom: 14},
  stepTitle: {fontSize: 15, fontWeight: '700', color: c.text},
  stepDetail: {fontSize: 13, color: c.muted, marginTop: 2, lineHeight: 18},
});
