import React, {useRef, useState} from 'react';
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native';
import SignatureView, {SignatureViewRef} from 'react-native-signature-canvas';
import {fieldApi} from '../../api/field.api';
import {useAuth} from '../../store/AuthContext';
import {useOutbox} from '../../store/OutboxContext';
import {Button, Card, ErrorBox, Field, Icon, Loading, Mono, Screen} from '../../ui/kit';
import {c} from '../../ui/theme';
import {useLoad} from '../../ui/useLoad';
import {durationText, partnerOf, trackLabel} from '../../utils/field';
import {StackProps} from '../../navigation/fieldTypes';
import {isAnswered, useSession} from './useSession';

const PAD_STYLE = `.m-signature-pad{box-shadow:none;border:none;margin:0}.m-signature-pad--body{border:none}.m-signature-pad--footer{display:none}body,html{background:#fff;height:100%}`;

export function FinishAuditScreen({navigation, route}: StackProps<'Finish'>) {
  const {jobId} = route.params;
  const {user} = useAuth();
  const outbox = useOutbox();
  const {online, syncing, flush} = outbox;
  const pending = outbox.pendingFor(jobId);
  const {flat, session} = useSession(jobId);
  const {data, error: loadError, loading, refresh} = useLoad(async () => {
    const [readiness, job] = await Promise.all([fieldApi.readiness(jobId), fieldApi.jobs().then(js => js.find(j => j.id === jobId))]);
    return {readiness, job};
  }, [jobId, pending.length]);
  const pad = useRef<SignatureViewRef>(null);
  const [remarks, setRemarks] = useState('');
  const [signature, setSignature] = useState('');
  const [agree, setAgree] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (loading && !data) return <Screen title="Finish the audit" onBack={navigation.goBack}><Loading /></Screen>;
  if (!data) return <Screen title="Finish the audit" onBack={navigation.goBack}><ErrorBox message={loadError} onRetry={refresh} /></Screen>;

  const sum = data.readiness.summary;
  const answeredNonNa = flat.filter(q => isAnswered(q) && q.response?.result !== 'NA');
  const withPhoto = answeredNonNa.filter(q => (q.response?.evidence || []).some(e => (e.kind || 'ISSUE') === 'ISSUE'));
  const shared = flat.filter(q => q.moduleCode === 'SITE_SHARED');
  const partner = data.job ? partnerOf(data.job, user?.id) : undefined;
  const rows = [
    {label: 'Every point answered', value: `${sum.submitted} of ${sum.total}`, ok: sum.submitted === sum.total && sum.total > 0},
    {label: 'Findings with issue and recommendation', value: `${sum.nonCompliant} of ${sum.nonCompliant}`, ok: true},
    {label: 'Evidence photos', value: `${withPhoto.length} of ${answeredNonNa.length}`, ok: withPhoto.length === answeredNonNa.length},
    ...(shared.length ? [{label: 'Shared site items audited', value: `${shared.filter(isAnswered).length} of ${shared.length}`, ok: shared.every(isAnswered)}] : []),
    {label: 'Checked in and on site', value: session ? durationText(session.checkedInAt) : '—', ok: !!session},
  ];
  const ready = data.readiness.ready && !pending.length;
  const canSubmit = ready && !!remarks.trim() && !!signature && agree;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fieldApi.complete(jobId, {finalRemarks: remarks.trim(), declarationAccepted: true, signature});
      Alert.alert('Audit submitted', res.message, [{text: 'OK', onPress: () => navigation.navigate('Tabs', {screen: 'Reports'})}]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Finish the audit" onBack={navigation.goBack} scrollEnabled={!drawing} footer={<Button label="Submit audit" onPress={submit} disabled={!canSubmit} loading={busy} />}>
      <Card style={st.checks}>
        {rows.map((r, i) => (
          <View key={r.label} style={[st.check, i < rows.length - 1 && st.line]}>
            <View style={[st.tick, !r.ok && {backgroundColor: c.redSoft}]}>
              <Icon name={r.ok ? 'check' : 'x'} size={14} color={r.ok ? c.green : c.red} />
            </View>
            <Text style={st.checkLabel}>{r.label}</Text>
            <Mono style={st.checkValue}>{r.value}</Mono>
          </View>
        ))}
      </Card>
      {!!pending.length && (
        <Card tone="amber" style={{gap: 10}}>
          <Text style={st.warnText}>
            {pending.length} answer{pending.length === 1 ? ' is' : 's are'} still on this tablet. Upload them before you submit.
          </Text>
          <Button small label={online ? 'Upload now' : 'Waiting for network'} loading={syncing} disabled={!online} onPress={flush} />
        </Card>
      )}
      {data.readiness.blockers.length > 0 && !pending.length && <ErrorBox message={data.readiness.blockers.join('. ')} />}

      <Field label="Closing remarks" required value={remarks} onChangeText={setRemarks} multiline placeholder="For example: Dealer team was cooperative. Washroom and signage items fixed on the spot." />

      <View style={{gap: 6}}>
        <View style={st.sigHead}>
          <Text style={st.label}>Your signature</Text>
          <Pressable
            hitSlop={8}
            onPress={() => {
              pad.current?.clearSignature();
              setSignature('');
            }}>
            <Text style={st.clear}>Clear</Text>
          </Pressable>
        </View>
        <View style={st.pad}>
          <SignatureView
            ref={pad}
            onOK={setSignature}
            onEmpty={() => setSignature('')}
            onBegin={() => setDrawing(true)}
            onEnd={() => {
              setDrawing(false);
              pad.current?.readSignature();
            }}
            webStyle={PAD_STYLE}
            backgroundColor="#FFFFFF"
            penColor={c.text}
            imageType="image/png"
            trimWhitespace
          />
          {!signature && (
            <Text style={st.padHint} pointerEvents="none">
              Sign with your finger
            </Text>
          )}
        </View>
      </View>

      <Pressable onPress={() => setAgree(v => !v)} style={st.agree} accessibilityRole="checkbox" accessibilityState={{checked: agree}}>
        <View style={[st.box, agree && st.boxOn]}>{agree && <Icon name="check" size={16} color="#FFFFFF" />}</View>
        <Text style={st.agreeText}>I confirm that I did this audit myself at the site and that every answer and photo is true to what I saw.</Text>
      </Pressable>
      <Text style={st.note}>
        {partner ? `${partner.auditor.fullName} (${trackLabel(partner.track)}) finishes their own checklist. The report is drafted when both of you have submitted. ` : 'The report is drafted when you submit. '}
        After you submit, answers are locked.
      </Text>
      {!!error && <ErrorBox message={error} />}
    </Screen>
  );
}

const st = StyleSheet.create({
  checks: {paddingVertical: 4},
  check: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12},
  line: {borderBottomWidth: 1, borderBottomColor: c.line},
  tick: {width: 26, height: 26, borderRadius: 13, backgroundColor: c.greenSoft, alignItems: 'center', justifyContent: 'center'},
  checkLabel: {flex: 1, fontSize: 15, color: c.text},
  checkValue: {fontSize: 12.5, color: c.muted, textAlign: 'right', maxWidth: 90},
  warnText: {fontSize: 13.5, color: c.amber, lineHeight: 19},
  label: {fontSize: 13, fontWeight: '700', color: c.text},
  sigHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  clear: {color: c.green, fontWeight: '700', fontSize: 14},
  pad: {height: 170, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.lineStrong, overflow: 'hidden', backgroundColor: '#FFFFFF'},
  padHint: {position: 'absolute', left: 12, bottom: 8, fontSize: 12.5, color: c.faint},
  agree: {flexDirection: 'row', gap: 12, alignItems: 'flex-start'},
  box: {width: 26, height: 26, borderRadius: 6, borderWidth: 1.5, borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF'},
  boxOn: {backgroundColor: c.green, borderColor: c.green},
  agreeText: {flex: 1, fontSize: 14.5, color: c.text, lineHeight: 21},
  note: {fontSize: 13, color: c.muted, lineHeight: 19},
});
