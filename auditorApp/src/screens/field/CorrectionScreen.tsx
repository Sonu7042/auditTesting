import React, {useEffect, useState} from 'react';
import {Alert, Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {fieldApi} from '../../api/field.api';
import {Answer, Correction, Report} from '../../types/field';
import {Badge, Button, Card, ChoiceButton, Empty, ErrorBox, Field, Icon, Loading, Photo, Screen} from '../../ui/kit';
import {c} from '../../ui/theme';
import {useLoad} from '../../ui/useLoad';
import {fileOf, Shot, takePhoto} from '../../utils/camera';
import {ANSWER_LABEL, CORRECTION_CATEGORY, DISCIPLINE, itemDiscipline, openCorrections} from '../../utils/field';
import {StackProps} from '../../navigation/fieldTypes';

const EVIDENCE_CATEGORIES = ['INSUFFICIENT_EVIDENCE', 'EVIDENCE_QUALITY'];
const responseFor = (r: Report, k: Correction) => (r.job.sessions || []).flatMap(s => s.responses || []).find(x => x.snapshotItemId === k.snapshotItemId);

export function CorrectionScreen({navigation, route}: StackProps<'Correction'>) {
  const {reportId} = route.params;
  const {data, error: loadError, loading, refresh, setData} = useLoad(async () => {
    const report = (await fieldApi.reports()).find(r => r.id === reportId);
    if (!report) throw new Error('This report is not available.');
    return report;
  }, [reportId]);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<Answer | ''>('');
  const [measurement, setMeasurement] = useState('');
  const [observation, setObservation] = useState('');
  const [resolution, setResolution] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);

  const list = data ? openCorrections(data) : [];
  const k = list[Math.min(index, Math.max(0, list.length - 1))];
  const response = data && k ? responseFor(data, k) : undefined;

  useEffect(() => {
    if (data && !total) setTotal(openCorrections(data).length);
  }, [data, total]);
  useEffect(() => {
    setResult(((response?.result as Answer) || '') as Answer | '');
    setMeasurement(response?.measurementValue == null ? '' : String(response.measurementValue));
    setObservation(response?.observation || '');
    setResolution('');
    setShots([]);
    setError('');
  }, [k?.id, response]);

  if (loading && !data) return <Screen title="Correction" onBack={navigation.goBack}><Loading /></Screen>;
  if (!data) return <Screen title="Correction" onBack={navigation.goBack}><ErrorBox message={loadError} onRetry={refresh} /></Screen>;
  if (!k)
    return (
      <Screen title="Corrections" onBack={navigation.goBack}>
        <Empty title="All correction points are done" body="The report has gone back to QC." icon="check-circle" />
      </Screen>
    );

  const item = k.snapshotItem;
  const data_ = item?.itemData;
  const done = total - list.length;
  const needsPhoto = EVIDENCE_CATEGORIES.includes(k.category);
  const isMeasure = data_?.responseType === 'MEASUREMENT' || k.category === 'MEASUREMENT_VERIFICATION';
  const oldPhoto = (response?.evidence || []).find(e => (e.kind || 'ISSUE') === 'ISSUE');
  const changedResult = result && result !== response?.result;
  const ready = resolution.trim().length > 0 && (!needsPhoto || shots.length > 0);

  const shoot = async () => {
    try {
      const s = await takePhoto();
      if (s) setShots(x => [...x, s]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('resolution', resolution.trim());
      if (changedResult) form.append('correctedResult', result);
      if (isMeasure && measurement.trim() !== '' && Number(measurement) !== response?.measurementValue) form.append('correctedMeasurementValue', measurement.trim());
      if (observation.trim() !== (response?.observation || '')) form.append('correctedObservation', observation.trim());
      shots.forEach(s => form.append('evidence', fileOf(s)));
      const res = await fieldApi.submitCorrection(k.id, form);
      const remaining = openCorrections(res.report);
      setData(res.report);
      if (!remaining.length) Alert.alert('Sent back to QC', 'All correction points are done. The report is back with QC.', [{text: 'OK', onPress: navigation.goBack}]);
      else setIndex(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title={`Correction ${done + 1} of ${total || list.length}`}
      subtitle={[item ? DISCIPLINE[itemDiscipline(item)] : 'Report', item?.sectionName].filter(Boolean).join(' · ')}
      onBack={navigation.goBack}
      right={<Badge label={k.status === 'REOPENED' ? 'Reopened' : 'Open'} tone="red" />}
      footer={
        <>
          <Button label={list.length > 1 ? `Save and go to correction ${done + 2}` : 'Save and send to QC'} onPress={save} disabled={!ready} loading={busy} />
          <Text style={st.foot}>Report goes back to QC after {total > 1 ? `all ${total}` : 'it is'} done</Text>
        </>
      }>
      <Card tone="red" style={{gap: 4}}>
        <Text style={st.qcLabel}>QC says · {CORRECTION_CATEGORY[k.category] || k.category}</Text>
        <Text style={st.qcText}>"{k.instruction}"</Text>
        {k.status === 'REOPENED' && !!k.reviewRemarks && <Text style={st.qcSub}>Reopened: {k.reviewRemarks}</Text>}
      </Card>

      {item && (
        <Card style={{gap: 10}}>
          <Text style={st.question}>{data_?.questionText}</Text>
          {response?.result && (
            <View style={st.answerRow}>
              <Text style={st.muted}>Your answer</Text>
              <Badge label={ANSWER_LABEL[response.result] || response.result} tone={response.result === 'NON_COMPLIANT' ? 'red' : response.result === 'NA' ? 'gray' : 'green'} style={{borderRadius: 6}} />
            </View>
          )}
          <View style={st.choices}>
            <ChoiceButton label="OK" selected={result === 'COMPLIANT'} onPress={() => setResult('COMPLIANT')} />
            <ChoiceButton label="Not OK" tone="red" selected={result === 'NON_COMPLIANT'} onPress={() => setResult('NON_COMPLIANT')} />
            {data_?.naAllowed !== false && <ChoiceButton label="N/A" tone="gray" selected={result === 'NA'} onPress={() => setResult('NA')} />}
          </View>
          {isMeasure && <Field label={`Reading${data_?.measurementUnit ? ` (${data_.measurementUnit})` : ''}`} value={measurement} onChangeText={setMeasurement} keyboardType="decimal-pad" />}
          {(result === 'NON_COMPLIANT' || k.category === 'MISSING_OBSERVATION') && <Field label="Observation" value={observation} onChangeText={setObservation} multiline />}
        </Card>
      )}

      <Card style={{gap: 10}}>
        <Text style={st.label}>Evidence photo</Text>
        <View style={st.photos}>
          <Photo uri={oldPhoto?.imageUrl} label="No photo" style={st.photo}>
            {needsPhoto && oldPhoto && <Badge label="Unclear" tone="red" style={st.unclear} />}
          </Photo>
          {shots.length ? (
            <Pressable onPress={shoot} style={st.photo}>
              <Image source={{uri: shots[shots.length - 1].uri}} style={[StyleSheet.absoluteFill, {borderRadius: 12}]} />
            </Pressable>
          ) : (
            <Pressable onPress={shoot} style={[st.photo, st.retake]}>
              <Icon name="camera" size={24} color={c.green} />
              <Text style={st.retakeText}>Retake photo</Text>
            </Pressable>
          )}
        </View>
        <Text style={st.muted}>The old photo stays in the report history. The new one replaces it in the report.{needsPhoto ? ' A new photo is required for this point.' : ''}</Text>
      </Card>

      <Field label="What you changed" required value={resolution} onChangeText={setResolution} multiline placeholder="For example: Retook the photo with the tag in frame. Tag date reads 03/2027." />
      {!!error && <ErrorBox message={error} />}
    </Screen>
  );
}

const st = StyleSheet.create({
  qcLabel: {fontSize: 13, fontWeight: '800', color: c.red},
  qcText: {fontSize: 15.5, color: c.red, lineHeight: 22},
  qcSub: {fontSize: 13, color: c.red, marginTop: 4},
  question: {fontSize: 17, fontWeight: '700', color: c.text, lineHeight: 23},
  answerRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  muted: {fontSize: 13, color: c.muted, lineHeight: 18},
  choices: {flexDirection: 'row', gap: 10},
  label: {fontSize: 14, fontWeight: '700', color: c.text},
  photos: {flexDirection: 'row', gap: 10},
  photo: {flex: 1, height: 110, borderRadius: 12},
  unclear: {position: 'absolute', top: 8, left: 8, borderRadius: 6},
  retake: {alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.green, backgroundColor: '#F3F8F4'},
  retakeText: {fontSize: 14, fontWeight: '700', color: c.green},
  foot: {textAlign: 'center', fontSize: 12.5, color: c.muted},
});
