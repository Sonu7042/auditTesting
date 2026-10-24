import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import {useOutbox} from '../../store/OutboxContext';
import {Badge, Button, Card, ErrorBox, Icon, Loading, Screen, Segmented} from '../../ui/kit';
import {c, mono} from '../../ui/theme';
import {DISCIPLINE_SHORT, durationText, jobTitle, trackLabel} from '../../utils/field';
import {StackProps} from '../../navigation/fieldTypes';
import {FlatQuestion, isAnswered, useSession} from './useSession';

export function Ring({value, size = 86, label, sub}: {value: number; size?: number; label: string; sub?: string}) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.line} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.green} strokeWidth={stroke} fill="none" strokeDasharray={`${(len * value) / 100} ${len}`} strokeLinecap="round" rotation={-90} origin={`${size / 2}, ${size / 2}`} />
      </Svg>
      <Text style={st.ringLabel}>{label}</Text>
      {!!sub && <Text style={st.ringSub}>{sub}</Text>}
    </View>
  );
}

export function AuditOverviewScreen({navigation, route}: StackProps<'AuditOverview'>) {
  const {jobId} = route.params;
  const {session, flat, groups, error, loading, refresh, refreshing, offline, pending} = useSession(jobId);
  const {online, syncing} = useOutbox();
  const [tab, setTab] = useState<string>('');
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(x => x + 1), 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!tab && groups.length) setTab(groups[0].key);
  }, [groups, tab]);

  if (loading && !session) return <Screen title="Audit" onBack={navigation.goBack}><Loading /></Screen>;
  if (!session) return <Screen title="Audit" onBack={navigation.goBack}><ErrorBox message={error} onRetry={refresh} /></Screen>;

  const done = flat.filter(isAnswered);
  const notOk = done.filter(q => q.response?.result === 'NON_COMPLIANT');
  const spot = notOk.filter(q => q.response?.closedOnSpot);
  const pct = flat.length ? Math.round((done.length / flat.length) * 100) : 0;
  const left = flat.length - done.length;
  const completed = session.status === 'COMPLETED';
  const group = groups.find(g => g.key === tab) || groups[0];

  const openSection = (qs: FlatQuestion[]) => {
    const target = qs.find(q => !isAnswered(q)) || qs[0];
    navigation.navigate('Point', {jobId, itemId: target.id});
  };

  const saved = pending.length ? {label: online ? (syncing ? 'Uploading…' : `${pending.length} to upload`) : 'Offline · saved', tone: 'amber' as const} : offline ? {label: 'Offline', tone: 'amber' as const} : {label: 'Saved', tone: 'green' as const};

  return (
    <Screen
      title={jobTitle(session.job as any)}
      subtitle={`${trackLabel(session.track)} · ${completed ? 'submitted' : `on site ${durationText(session.checkedInAt)}`}`}
      onBack={navigation.goBack}
      right={<Badge label={completed ? 'Submitted' : saved.label} tone={completed ? 'green' : saved.tone} />}
      refreshing={refreshing}
      onRefresh={refresh}
      footer={
        completed ? (
          <Button label="Go to my reports" onPress={() => navigation.navigate('Tabs', {screen: 'Reports'})} />
        ) : (
          <View style={st.footRow}>
            <Button label="Propose a point" variant="secondary" style={{flex: 1}} onPress={() => navigation.navigate('ProposePoint', {jobId, discipline: group?.key === 'SHARED' ? undefined : group?.key})} />
            <Button label={left ? `Finish (${left} left)` : 'Finish'} style={{flex: 1}} disabled={left > 0} onPress={() => navigation.navigate('Finish', {jobId})} />
          </View>
        )
      }>
      {completed && (
        <Card tone="green">
          <Text style={st.doneText}>You submitted this audit. Answers are locked. The report is drafted when every auditor has submitted.</Text>
        </Card>
      )}
      <Card style={st.summary}>
        <Ring value={pct} label={`${pct}%`} sub={`${done.length} of ${flat.length}`} />
        <View style={[st.tile, {backgroundColor: c.redSoft}]}>
          <Text style={[st.tileValue, {color: c.red}]}>{notOk.length}</Text>
          <Text style={st.tileLabel}>Not OK</Text>
        </View>
        <View style={[st.tile, {backgroundColor: c.greenSoft}]}>
          <Text style={[st.tileValue, {color: c.green}]}>{spot.length}</Text>
          <Text style={st.tileLabel}>Closed on the spot</Text>
        </View>
      </Card>

      {groups.length > 1 && (
        <Segmented
          value={group?.key || ''}
          onChange={setTab}
          options={groups.map(g => ({key: g.key, label: DISCIPLINE_SHORT[g.key] || g.key, sub: `${g.questions.filter(isAnswered).length} / ${g.questions.length}`}))}
        />
      )}

      {group?.sections.map(sec => {
        const answered = sec.questions.filter(isAnswered);
        const bad = answered.filter(q => q.response?.result === 'NON_COMPLIANT').length;
        const all = answered.length === sec.questions.length;
        const state = bad ? 'bad' : all ? 'ok' : answered.length ? 'part' : 'new';
        const sub = `${answered.length} of ${sec.questions.length} · ${bad ? `${bad} Not OK` : all ? 'all OK' : answered.length ? 'in progress' : 'not started'}`;
        return (
          <Card key={sec.name} onPress={() => openSection(sec.questions)} style={st.section}>
            <View style={[st.secIcon, state === 'ok' && {backgroundColor: c.greenSoft}, state === 'bad' && {backgroundColor: c.redSoft}, state === 'part' && {backgroundColor: c.amberSoft}]}>
              {state === 'ok' ? <Icon name="check" size={16} color={c.green} /> : state === 'bad' ? <Text style={st.bang}>!</Text> : state === 'part' ? <Text style={st.partText}>{answered.length}</Text> : <Icon name="plus" size={16} color={c.muted} />}
            </View>
            <View style={{flex: 1}}>
              <Text style={st.secName}>{sec.name}</Text>
              <Text style={st.secSub}>{sub}</Text>
            </View>
            <Icon name="chevron-right" size={18} color={c.muted} />
          </Card>
        );
      })}
      {!flat.length && <Text style={st.secSub}>No checklist points are in your scope for this audit.</Text>}
    </Screen>
  );
}

const st = StyleSheet.create({
  summary: {flexDirection: 'row', alignItems: 'center', gap: 10},
  ringLabel: {fontSize: 19, fontWeight: '800', color: c.text},
  ringSub: {fontFamily: mono, fontSize: 10.5, color: c.muted},
  tile: {flex: 1, alignSelf: 'stretch', borderRadius: 12, padding: 12, justifyContent: 'space-between'},
  tileValue: {fontSize: 26, fontWeight: '700'},
  tileLabel: {fontSize: 12.5, color: c.text},
  section: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14},
  secIcon: {width: 30, height: 30, borderRadius: 15, backgroundColor: '#ECECE8', alignItems: 'center', justifyContent: 'center'},
  bang: {color: c.red, fontWeight: '900', fontSize: 15},
  partText: {color: c.amber, fontWeight: '800', fontSize: 13},
  secName: {fontSize: 15.5, fontWeight: '600', color: c.text},
  secSub: {fontSize: 12.5, color: c.muted, marginTop: 2},
  footRow: {flexDirection: 'row', gap: 10},
  doneText: {fontSize: 13.5, color: c.greenDark, lineHeight: 19},
});
