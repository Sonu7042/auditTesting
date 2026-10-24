import React, {useEffect, useMemo, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {fieldApi} from '../../api/field.api';
import {isNetworkError} from '../../api/client';
import {useOutbox} from '../../store/OutboxContext';
import {Answer, Evidence} from '../../types/field';
import {Badge, Button, Card, ChoiceButton, ErrorBox, Field, Icon, Loading, Mono, Screen, Toggle} from '../../ui/kit';
import {c, mono} from '../../ui/theme';
import {fileOf, Shot, takePhoto} from '../../utils/camera';
import {DISCIPLINE, fmtDay, fmtTime, PRIORITY, SEVERITY} from '../../utils/field';
import {StackProps} from '../../navigation/fieldTypes';
import {isAnswered, useSession} from './useSession';

type Thumb = {uri: string; stamp: string};
const stampOf = (s: Shot) => `${fmtDay(s.takenAt)} ${fmtTime(s.takenAt)}${s.lat != null ? `\n${s.lat.toFixed(4)}, ${s.lng!.toFixed(4)} ±${Math.round(s.accuracy || 0)} m` : ''}`;
const thumbOf = (e: Evidence): Thumb => ({uri: e.imageUrl, stamp: e.createdAt ? `${fmtDay(e.createdAt)} ${fmtTime(e.createdAt)}` : 'Saved'});

export function PointScreen({navigation, route}: StackProps<'Point'>) {
  const {jobId, itemId} = route.params;
  const {session, flat, loading, error: loadError, reload, refresh} = useSession(jobId);
  const {online, enqueue} = useOutbox();
  const q = flat.find(x => x.id === itemId);

  const [answer, setAnswer] = useState<Answer | ''>('');
  const [observation, setObservation] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [naReason, setNaReason] = useState('');
  const [reading, setReading] = useState('');
  const [spot, setSpot] = useState(false);
  const [spotNote, setSpotNote] = useState('');
  const [issueShots, setIssueShots] = useState<Shot[]>([]);
  const [fixShots, setFixShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadedFor, setLoadedFor] = useState('');

  useEffect(() => {
    if (!q || loadedFor === q.id) return;
    const r = q.response;
    setAnswer((r?.answer as Answer) || '');
    setObservation(r?.observation || '');
    setRecommendation(r?.recommendation || '');
    setNaReason(r?.naReason || '');
    setReading(r?.measurementValue == null ? '' : String(r.measurementValue));
    setSpot(!!r?.closedOnSpot);
    setSpotNote(r?.correctionComment || '');
    setIssueShots([]);
    setFixShots([]);
    setError('');
    setLoadedFor(q.id);
  }, [q, loadedFor]);

  const groupQs = useMemo(() => (q ? flat.filter(x => x.group === q.group) : []), [flat, q]);
  const sectionQs = useMemo(() => (q ? flat.filter(x => x.group === q.group && x.sectionName === q.sectionName) : []), [flat, q]);

  if (loading && !q) return <Screen title="Checklist" onBack={navigation.goBack}><Loading /></Screen>;
  if (!q || !session) return <Screen title="Checklist" onBack={navigation.goBack}><ErrorBox message={loadError || 'This point was not found.'} onRetry={refresh} /></Screen>;

  const locked = session.status !== 'IN_PROGRESS';
  const pos = groupQs.findIndex(x => x.id === q.id);
  const prev = groupQs[pos - 1];
  const next = groupQs[pos + 1];
  const go = (id: string) => {
    setLoadedFor('');
    navigation.setParams({itemId: id});
  };

  const measurement = q.responseType === 'MEASUREMENT';
  const min = q.minimumValue == null ? null : Number(q.minimumValue);
  const max = q.maximumValue == null ? null : Number(q.maximumValue);
  const value = reading.trim() === '' ? null : Number(reading.replace(',', '.'));
  const valid = value != null && Number.isFinite(value);
  const over = valid && max != null && value! > max ? value! - max : 0;
  const under = valid && min != null && value! < min ? min - value! : 0;
  const effective: Answer | '' = measurement ? (answer === 'NA' ? 'NA' : valid ? (over || under ? 'NON_COMPLIANT' : 'COMPLIANT') : '') : answer;
  const unit = q.measurementUnit || '';
  const sev = SEVERITY[q.severityOnFail || 'MEDIUM'] || SEVERITY.MEDIUM;
  const bad = effective === 'NON_COMPLIANT';

  const existing = q.response?.evidence || [];
  const existingIssue = existing.filter(e => (e.kind || 'ISSUE') === 'ISSUE');
  const existingFix = existing.filter(e => e.kind === 'CORRECTION');
  const need = Math.max(1, Number(q.minimumEvidence || 0));
  const issueCount = existingIssue.length + issueShots.length;
  const fixCount = existingFix.length + fixShots.length;
  const slots = measurement || need > 1 ? Math.max(need, 1) : 1;
  const slotLabels = q.discipline === 'THERMOGRAPHY' ? ['Thermal image', 'Visible photo'] : Array.from({length: slots}, (_, i) => `Photo ${i + 1}`);
  const issueThumbs: Thumb[] = [...existingIssue.map(thumbOf), ...issueShots.map(s => ({uri: s.uri, stamp: stampOf(s)}))];
  const fixThumbs: Thumb[] = [...existingFix.map(thumbOf), ...fixShots.map(s => ({uri: s.uri, stamp: stampOf(s)}))];

  const shoot = async (kind: 'issue' | 'fix') => {
    setError('');
    try {
      const shot = await takePhoto();
      if (!shot) return;
      if (kind === 'issue') setIssueShots(x => [...x, shot]);
      else setFixShots(x => [...x, shot]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const problem = () => {
    if (!effective) return measurement ? 'Enter the reading.' : 'Choose OK, Not OK or N/A.';
    if (effective === 'NA') return q.naReasonRequired !== false && !naReason.trim() ? 'Give the reason this point does not apply.' : '';
    if (issueCount < need) return `Take ${need === 1 ? 'a photo' : `${need} photos`} for this point.`;
    if (effective === 'NON_COMPLIANT') {
      if (!observation.trim()) return measurement ? 'Describe what you saw and what to do.' : 'Describe what is wrong.';
      if (!spot && !recommendation.trim() && !measurement) return 'Add what should be done.';
      if (spot && !spotNote.trim()) return 'Describe what was fixed on the spot.';
      if (spot && fixCount < 1) return 'Take a correction photo of the fix.';
    }
    return '';
  };

  const save = async () => {
    const p = problem();
    if (p) return setError(p);
    setBusy(true);
    setError('');
    const fields: Record<string, string> = {
      responseStatus: 'SUBMITTED',
      answer: effective,
      observation: effective === 'NA' ? '' : observation.trim(),
      recommendation: effective === 'NON_COMPLIANT' ? (measurement && !recommendation.trim() ? observation.trim() : recommendation.trim()) : '',
      naReason: effective === 'NA' ? naReason.trim() : '',
      measurementValue: measurement && effective !== 'NA' && valid ? String(value) : '',
      closedOnSpot: String(effective === 'NON_COMPLIANT' && spot),
      correctionComment: effective === 'NON_COMPLIANT' && spot ? spotNote.trim() : '',
      responsiblePerson: q.response?.responsiblePerson || '',
      targetDate: q.response?.targetDate?.slice(0, 10) || '',
    };
    const photos = [...issueShots.map(s => ({...s, field: 'evidence' as const})), ...(effective === 'NON_COMPLIANT' && spot ? fixShots.map(s => ({...s, field: 'correctionEvidence' as const})) : [])];
    const queue = () => enqueue({jobId, itemId: q.id, questionCode: q.questionCode, fields}, photos);
    try {
      if (!online) await queue();
      else {
        const form = new FormData();
        Object.entries(fields).forEach(([k, v]) => form.append(k, v));
        photos.forEach(ph => form.append(ph.field, fileOf(ph)));
        try {
          await fieldApi.saveResponse(jobId, q.id, form);
        } catch (e) {
          if (!isNetworkError(e)) throw e;
          await queue();
        }
      }
      setIssueShots([]);
      setFixShots([]);
      const after = groupQs.slice(pos + 1).find(x => !isAnswered(x)) || next;
      if (after) {
        go(after.id);
        reload();
      } else navigation.goBack();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const label = measurement ? 'Save reading' : bad ? 'Save finding and next point' : next ? 'Save and next point' : 'Save point';

  return (
    <Screen
      title={q.sectionName}
      subtitle={`${DISCIPLINE[q.discipline] || q.discipline} · point ${sectionQs.findIndex(x => x.id === q.id) + 1} of ${sectionQs.length}`}
      onBack={navigation.goBack}
      right={
        bad ? (
          <Badge label={sev.label} tone={sev.tone} />
        ) : (
          <View style={st.arrows}>
            <Pressable hitSlop={8} disabled={!prev} onPress={() => prev && go(prev.id)} accessibilityLabel="Previous point">
              <Icon name="chevron-up" size={24} color={prev ? c.text : c.lineStrong} />
            </Pressable>
            <Pressable hitSlop={8} disabled={!next} onPress={() => next && go(next.id)} accessibilityLabel="Next point">
              <Icon name="chevron-down" size={24} color={next ? c.text : c.lineStrong} />
            </Pressable>
          </View>
        )
      }
      footer={locked ? <Text style={st.lockedText}>This audit is submitted. Answers are locked.</Text> : <Button label={label} onPress={save} loading={busy} />}>
      <Card style={{gap: 10}}>
        <View style={st.codeRow}>
          <Mono style={st.code}>{q.questionCode}</Mono>
          {!bad && <Badge label={`${sev.label} if it fails`} tone={sev.tone === 'gray' ? 'gray' : 'amber'} style={st.tag} />}
          {!!q.mahindraPriority && <Badge label={PRIORITY[q.mahindraPriority] || q.mahindraPriority} tone="gray" style={st.tag} />}
          {q.response?.pending && <Badge label="Waiting to upload" tone="amber" style={st.tag} />}
        </View>
        <Text style={st.question}>{q.questionText}</Text>
        {(!!q.expectedCondition || !!q.regulationRef) && (
          <Text style={st.expected}>
            {!!q.expectedCondition && (
              <>
                <Text style={st.bold}>Expected: </Text>
                {q.expectedCondition}{' '}
              </>
            )}
            {!!q.regulationRef && (
              <>
                <Text style={st.bold}>Reference: </Text>
                {q.regulationRef}
              </>
            )}
          </Text>
        )}
        {measurement && (min != null || max != null) && (
          <View style={st.allowed}>
            <Text style={st.allowedLabel}>Allowed</Text>
            <Mono style={st.allowedValue}>{min != null && max != null ? `${min} to ${max} ${unit}` : max != null ? `up to ${max} ${unit}` : `at least ${min} ${unit}`}</Mono>
          </View>
        )}
      </Card>

      {measurement ? (
        <Card style={{gap: 10}}>
          <Text style={st.label}>Reading{unit ? ` (${unit})` : ''}</Text>
          <View style={[st.readingBox, bad && {borderColor: c.red}]}>
            <TextInput editable={!locked && answer !== 'NA'} value={reading} onChangeText={t => setReading(t.replace(/[^0-9.,-]/g, ''))} keyboardType="decimal-pad" placeholder="0.0" placeholderTextColor={c.faint} style={st.reading} />
            <Text style={st.unit}>{unit}</Text>
          </View>
          {bad && (
            <View style={st.over}>
              <Icon name="alert-triangle" size={18} color={c.red} />
              <Text style={st.overText}>
                <Text style={st.bold}>
                  {over ? `${over.toFixed(1)} ${unit} over the limit.` : `${under.toFixed(1)} ${unit} under the limit.`}
                </Text>{' '}
                This is recorded as Not OK, {sev.label}. Add the photos and a note.
              </Text>
            </View>
          )}
          {effective === 'COMPLIANT' && <Text style={st.okText}>Within the allowed limit. Recorded as OK.</Text>}
          {q.naAllowed !== false && (
            <ChoiceButton small label={answer === 'NA' ? 'Marked N/A, tap to undo' : 'Not applicable here'} selected={answer === 'NA'} tone="gray" onPress={() => !locked && setAnswer(a => (a === 'NA' ? '' : 'NA'))} />
          )}
        </Card>
      ) : (
        <View style={st.choices}>
          <ChoiceButton label="OK" selected={answer === 'COMPLIANT'} onPress={() => !locked && setAnswer('COMPLIANT')} />
          <ChoiceButton label="Not OK" tone="red" selected={answer === 'NON_COMPLIANT'} onPress={() => !locked && setAnswer('NON_COMPLIANT')} />
          {q.naAllowed !== false && <ChoiceButton label="N/A" tone="gray" selected={answer === 'NA'} onPress={() => !locked && setAnswer('NA')} />}
        </View>
      )}

      {effective && effective !== 'NA' && (
        <Card style={{gap: 12}}>
          {slots > 1 ? (
            <>
              <View style={st.evHead}>
                <Text style={st.label}>{bad ? 'Issue photos' : 'Evidence photos'}</Text>
                <Text style={[st.counter, issueCount >= need && {color: c.green}]}>
                  {Math.min(issueCount, need)} of {need} required
                </Text>
              </View>
              <View style={st.slots}>
                {slotLabels.slice(0, slots).map((l, i) => (
                  <Pressable key={l} disabled={locked} onPress={() => shoot('issue')} style={st.slot}>
                    {issueThumbs[i] ? <Thumbnail thumb={issueThumbs[i]} style={st.slotImg} /> : (
                      <View style={[st.slotImg, st.slotEmpty]}>
                        <Icon name="camera" size={22} color={c.green} />
                      </View>
                    )}
                    <Text style={st.slotLabel}>{l}</Text>
                  </Pressable>
                ))}
              </View>
              {issueThumbs.length > slots && <Text style={st.caption}>{issueThumbs.length - slots} more photo(s) attached.</Text>}
            </>
          ) : (
            <View style={st.evRow}>
              {issueThumbs.length ? <Thumbnail thumb={issueThumbs[issueThumbs.length - 1]} style={st.evImg} /> : (
                <View style={[st.evImg, st.slotEmpty]}>
                  <Icon name="camera" size={24} color={c.faint} />
                </View>
              )}
              <View style={{flex: 1, gap: 4}}>
                <View style={st.evHead}>
                  <Text style={st.label}>{bad ? 'Issue photo' : 'Evidence photo'}</Text>
                  {!bad && <Text style={[st.counter, issueCount >= need && {color: c.green}]}>{Math.min(issueCount, need)} of {need} required</Text>}
                </View>
                <Text style={st.caption}>{issueThumbs.length ? `${issueThumbs[issueThumbs.length - 1].stamp.split('\n')[0]}${issueShots.length && issueShots[issueShots.length - 1].lat != null ? ' · GPS stamped' : ''}` : 'Camera only. No gallery upload.'}</Text>
              </View>
              {!locked && <Button small variant="secondary" icon={issueThumbs.length ? undefined : 'camera'} label={issueThumbs.length ? 'Retake' : 'Take photo'} onPress={() => shoot('issue')} style={{paddingHorizontal: 14}} />}
            </View>
          )}
          {!bad && <Text style={st.caption}>Time and GPS are recorded with each photo. No gallery upload.</Text>}

          {bad && (
            <>
              <Field label={measurement ? 'What you saw and what to do' : 'What is wrong'} required editable={!locked} value={observation} onChangeText={setObservation} multiline placeholder={measurement ? 'For example: R-phase terminal hot spot. Re-torque the lugs and re-scan within a week.' : 'Describe what you found'} />
              {!measurement && <Field label="What should be done" required={!spot} editable={!locked} value={recommendation} onChangeText={setRecommendation} multiline placeholder="Your recommendation to the dealer" />}
            </>
          )}
        </Card>
      )}

      {bad && (
        <Card style={{gap: 12}}>
          <View style={st.spotHead}>
            <View style={{flex: 1}}>
              <Text style={st.label}>Fixed on the spot</Text>
              <Text style={st.caption}>Add a correction photo and what was done.</Text>
            </View>
            <Toggle value={spot} onChange={v => !locked && setSpot(v)} />
          </View>
          {spot && (
            <View style={st.spotBody}>
              <Pressable disabled={locked} onPress={() => shoot('fix')}>
                {fixThumbs.length ? <Thumbnail thumb={fixThumbs[fixThumbs.length - 1]} style={st.evImg} /> : (
                  <View style={[st.evImg, st.slotEmpty]}>
                    <Icon name="camera" size={22} color={c.green} />
                  </View>
                )}
              </Pressable>
              <TextInput editable={!locked} value={spotNote} onChangeText={setSpotNote} multiline placeholder="What was done" placeholderTextColor={c.faint} style={st.spotNote} />
            </View>
          )}
        </Card>
      )}

      {effective === 'NA' && (
        <Card>
          <Field label="Why it does not apply" required={q.naReasonRequired !== false} editable={!locked} value={naReason} onChangeText={setNaReason} multiline placeholder="For example: no EV charger at this site" />
        </Card>
      )}

      {!effective && !measurement && (
        <Text style={st.rules}>
          <Text style={st.bold}>What each result needs.</Text> OK: a photo. Not OK: a photo, what is wrong and what to do. N/A: a reason.
        </Text>
      )}
      {!!error && <ErrorBox message={error} />}
    </Screen>
  );
}

function Thumbnail({thumb, style}: {thumb: Thumb; style: any}) {
  return (
    <View style={[style, {overflow: 'hidden'}]}>
      <Image source={{uri: thumb.uri}} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={st.stamp}>
        <Text style={st.stampText}>{thumb.stamp}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  arrows: {flexDirection: 'row', gap: 14},
  codeRow: {flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap'},
  code: {color: c.green, fontSize: 13, fontWeight: '700'},
  tag: {borderRadius: 6},
  question: {fontSize: 19, fontWeight: '700', color: c.text, lineHeight: 26},
  expected: {fontSize: 13.5, color: c.muted, lineHeight: 19},
  bold: {fontWeight: '700', color: c.text},
  allowed: {flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F0F1EE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10},
  allowedLabel: {fontSize: 13.5, color: c.muted},
  allowedValue: {fontSize: 13, color: c.text},
  label: {fontSize: 14, fontWeight: '700', color: c.text},
  readingBox: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: c.lineStrong, borderRadius: 14, paddingHorizontal: 16},
  reading: {flex: 1, fontFamily: mono, fontSize: 36, color: c.text, paddingVertical: 10},
  unit: {fontSize: 18, color: c.muted},
  over: {flexDirection: 'row', gap: 10, backgroundColor: c.redSoft, borderRadius: 12, padding: 12},
  overText: {flex: 1, fontSize: 13.5, color: c.red, lineHeight: 19},
  okText: {fontSize: 13.5, color: c.green, fontWeight: '600'},
  choices: {flexDirection: 'row', gap: 10},
  evHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8},
  counter: {fontSize: 12.5, color: c.muted, fontWeight: '700'},
  evRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  evImg: {width: 108, height: 84, borderRadius: 10, backgroundColor: '#DFE3DE'},
  slots: {flexDirection: 'row', gap: 10},
  slot: {flex: 1, gap: 6},
  slotImg: {height: 96, borderRadius: 10, backgroundColor: '#DFE3DE'},
  slotEmpty: {alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.greenLine, backgroundColor: '#F3F8F4'},
  slotLabel: {fontSize: 13, fontWeight: '700', color: c.text},
  caption: {fontSize: 12.5, color: c.muted, lineHeight: 17},
  stamp: {position: 'absolute', left: 0, right: 0, bottom: 0, padding: 5, backgroundColor: 'rgba(0,0,0,0.4)'},
  stampText: {fontFamily: mono, fontSize: 9, color: '#FFFFFF'},
  spotHead: {flexDirection: 'row', alignItems: 'center', gap: 10},
  spotBody: {flexDirection: 'row', gap: 10},
  spotNote: {flex: 1, minHeight: 84, borderWidth: 1, borderColor: c.lineStrong, borderRadius: 10, padding: 10, fontSize: 14, color: c.text, textAlignVertical: 'top'},
  rules: {fontSize: 13, color: c.muted, lineHeight: 19},
  lockedText: {textAlign: 'center', fontSize: 13.5, color: c.muted, paddingVertical: 6},
});
