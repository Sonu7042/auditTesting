import React, {useState} from 'react';
import {Alert, Image, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {fieldApi} from '../../api/field.api';
import {useAuth} from '../../store/AuthContext';
import {Badge, Button, Card, Empty, ErrorBox, Field, Icon, Loading, Mono, Photo, Screen} from '../../ui/kit';
import {c} from '../../ui/theme';
import {useLoad} from '../../ui/useLoad';
import {fmtDate, fmtDay, SEVERITY} from '../../utils/field';
import {StackProps} from '../../navigation/fieldTypes';

export function CapaVerifyScreen({navigation, route}: StackProps<'CapaVerify'>) {
  const {user} = useAuth();
  const jobId = route.params?.jobId;
  const {data, setData, error: loadError, loading, refresh} = useLoad(async () => {
    const all = await fieldApi.ncs({status: 'CAPA_SUBMITTED'});
    return all.filter(n => (!jobId || n.jobId === jobId) && n.response.session.job.assignments.some(a => a.auditorId === user?.id && a.assignmentRole === 'LEAD'));
  }, [jobId]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [viewer, setViewer] = useState('');

  if (loading && !data) return <Screen title="Verify CAPA" onBack={navigation.goBack}><Loading /></Screen>;
  if (!data) return <Screen title="Verify CAPA" onBack={navigation.goBack}><ErrorBox message={loadError} onRetry={refresh} /></Screen>;
  if (!data.length)
    return (
      <Screen title="Verify CAPA" onBack={navigation.goBack}>
        <Empty title="Nothing to verify" body="When a dealer sends a corrective action for one of your findings, it shows here." icon="check-circle" />
      </Screen>
    );

  const count = Math.max(total, data.length);
  const nc = data[0];
  const loc = nc.response.session.job.location;
  const item = nc.response.snapshotItem;
  const sev = SEVERITY[nc.severity] || SEVERITY.MEDIUM;
  const before = (nc.response.evidence || []).find(e => (e.kind || 'ISSUE') === 'ISSUE');
  const after = nc.evidence[nc.evidence.length - 1];

  const act = async (action: 'CLOSE' | 'REJECT' | 'MORE_EVIDENCE') => {
    if (action !== 'CLOSE' && !note.trim()) return setError(action === 'REJECT' ? 'Add a note saying why you reject it.' : 'Add a note saying what more you need.');
    setBusy(action);
    setError('');
    try {
      await fieldApi.reviewNc(nc.id, action, note.trim() || undefined);
      if (!total) setTotal(data.length);
      const rest = data.slice(1);
      setNote('');
      setData(rest);
      if (!rest.length) Alert.alert('All done', 'Every CAPA here has been reviewed.', [{text: 'OK', onPress: navigation.goBack}]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <Screen
      title={`Verify CAPA ${count - data.length + 1} of ${count}`}
      subtitle={`${loc.dealerName}, ${loc.locationName}`}
      onBack={navigation.goBack}
      right={<Badge label="To verify" tone="amber" />}
      footer={
        <>
          <Button label="Verify and close" onPress={() => act('CLOSE')} loading={busy === 'CLOSE'} disabled={!!busy} />
          <View style={st.row}>
            <Button label="Ask for more" variant="secondary" small style={{flex: 1}} onPress={() => act('MORE_EVIDENCE')} loading={busy === 'MORE_EVIDENCE'} disabled={!!busy} />
            <Button label="Reject" variant="danger" small style={{flex: 1}} onPress={() => act('REJECT')} loading={busy === 'REJECT'} disabled={!!busy} />
          </View>
        </>
      }>
      <Card style={{gap: 8}}>
        <View style={st.head}>
          <Mono>Finding {item?.questionCode || nc.ncNumber}</Mono>
          <Badge label={sev.label} tone={sev.tone} style={{borderRadius: 6}} />
        </View>
        <Text style={st.finding}>{nc.observation}</Text>
        {!!nc.recommendation && <Text style={st.muted}>You recommended: {nc.recommendation}</Text>}
        {nc.overdue && <Text style={[st.muted, {color: c.red}]}>Past the target date of {fmtDate(nc.targetDate)}.</Text>}
      </Card>

      <Card style={{gap: 12}}>
        <Text style={st.h3}>What the dealer sent</Text>
        <Block label="Root cause" text={nc.rootCause} />
        <Block label="Corrective action" text={nc.correctiveAction} />
        <Block label="Preventive action" text={nc.preventiveAction} />
        <View style={st.row}>
          <Pressable style={{flex: 1}} disabled={!before} onPress={() => before && setViewer(before.imageUrl)}>
            <Photo uri={before?.imageUrl} label="Before" style={st.photo}>
              {before && <Badge label="Before" tone="dark" style={st.photoTag} />}
            </Photo>
          </Pressable>
          <Pressable style={{flex: 1}} disabled={!after} onPress={() => after && setViewer(after.imageUrl)}>
            <Photo uri={after?.imageUrl} label="After" style={st.photo}>
              {after && <Badge label="After" tone="green" style={st.photoTag} />}
            </Photo>
          </Pressable>
        </View>
        <Text style={st.small}>
          Sent on {fmtDay(nc.capaSubmittedAt)}
          {nc.responsiblePerson ? ` · Responsible: ${nc.responsiblePerson}` : ''}
          {nc.targetDate ? ` · Target ${fmtDay(nc.targetDate)}` : ''}. {nc.evidence.length} photo{nc.evidence.length === 1 ? '' : 's'} attached.
        </Text>
      </Card>

      <Field label="Your note (needed if you reject or ask for more)" value={note} onChangeText={setNote} multiline />
      {!!error && <ErrorBox message={error} />}

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer('')}>
        <Pressable style={st.viewer} onPress={() => setViewer('')}>
          {!!viewer && <Image source={{uri: viewer}} style={st.viewerImg} resizeMode="contain" />}
          <View style={st.viewerClose}>
            <Icon name="x" size={24} color="#FFFFFF" />
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function Block({label, text}: {label: string; text?: string | null}) {
  return (
    <View style={{gap: 2}}>
      <Text style={st.blockLabel}>{label}</Text>
      <Text style={st.blockText}>{text || '—'}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  row: {flexDirection: 'row', gap: 10},
  head: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  finding: {fontSize: 16.5, fontWeight: '700', color: c.text, lineHeight: 23},
  muted: {fontSize: 13.5, color: c.muted, lineHeight: 19},
  h3: {fontSize: 16, fontWeight: '800', color: c.text},
  blockLabel: {fontSize: 13, fontWeight: '700', color: c.text},
  blockText: {fontSize: 14.5, color: c.text, lineHeight: 20},
  photo: {height: 96},
  photoTag: {position: 'absolute', top: 6, left: 6, borderRadius: 6},
  small: {fontSize: 12.5, color: c.muted, lineHeight: 17},
  viewer: {flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center'},
  viewerImg: {width: '100%', height: '80%'},
  viewerClose: {position: 'absolute', top: 48, right: 20},
});
