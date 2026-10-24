import React from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {useOutbox} from '../../store/OutboxContext';
import {Button, Card, Icon, Progress, Screen} from '../../ui/kit';
import {c} from '../../ui/theme';
import {fmtDay, fmtTime, sameDay} from '../../utils/field';
import {StackProps} from '../../navigation/fieldTypes';

const mb = (bytes: number) => (bytes ? `${(bytes / 1048576).toFixed(bytes > 10485760 ? 0 : 1)} MB` : '');

export function OfflineSyncScreen({navigation}: StackProps<'OfflineSync'>) {
  const {items, online, syncing, lastSyncAt, flush, discard} = useOutbox();
  const waiting = items.filter(i => !i.error);
  const failed = items.filter(i => i.error);
  const photos = waiting.flatMap(i => i.photos);
  const evidence = photos.filter(p => p.field === 'evidence');
  const fixes = photos.filter(p => p.field === 'correctionEvidence');
  const times = waiting.map(i => i.createdAt).sort();
  const status = syncing ? 'Uploading' : waiting.length ? 'Waiting' : 'Uploaded';
  const tone = syncing ? c.blue : waiting.length ? c.amber : c.green;
  const last = lastSyncAt ? `${sameDay(lastSyncAt, new Date()) ? '' : `${fmtDay(lastSyncAt)} `}${fmtTime(lastSyncAt)}` : 'never';

  const rows = [
    {label: `${waiting.length} answer${waiting.length === 1 ? '' : 's'}`, sub: times.length ? `Saved ${fmtTime(times[0])} to ${fmtTime(times[times.length - 1])} · ordered by time` : 'Nothing waiting', done: !waiting.length},
    {label: `${evidence.length} evidence photo${evidence.length === 1 ? '' : 's'}`, sub: `${mb(evidence.reduce((a, p) => a + p.size, 0))}${evidence.length ? ' · ' : ''}removed from this tablet after upload`, done: !evidence.length},
    {label: `${fixes.length} correction photo${fixes.length === 1 ? '' : 's'}`, sub: mb(fixes.reduce((a, p) => a + p.size, 0)) || 'None', done: !fixes.length},
  ];

  const confirmDiscard = (id: string, code: string) =>
    Alert.alert('Discard this answer?', `The answer to ${code} and its photos are deleted from this tablet. You will need to answer the point again.`, [
      {text: 'Keep', style: 'cancel'},
      {text: 'Discard', style: 'destructive', onPress: () => discard(id)},
    ]);

  return (
    <Screen title="Offline and sync" onBack={navigation.goBack} footer={<Button label={online ? (waiting.length ? 'Sync now' : 'Everything is uploaded') : 'Sync now (needs network)'} disabled={!online || !waiting.length} loading={syncing} onPress={flush} />}>
      <Card tone={online ? 'green' : 'amber'} style={st.banner}>
        <View style={st.bannerIcon}>
          <Icon name={online ? 'wifi' : 'cloud-off'} size={22} color={online ? c.green : c.amber} />
        </View>
        <View style={{flex: 1}}>
          <Text style={[st.bannerTitle, {color: online ? c.greenDark : c.amber}]}>{online ? 'You are online' : 'You are offline'}</Text>
          <Text style={[st.bannerText, {color: online ? c.greenDark : c.amber}]}>
            {online ? 'Answers saved on this tablet upload by themselves.' : 'Keep auditing. Everything is saved on this tablet and uploads by itself when the network returns.'}
          </Text>
        </View>
      </Card>

      <Card style={{gap: 2}}>
        <View style={st.head}>
          <Text style={st.h3}>Waiting to upload</Text>
          <Text style={st.muted}>Last sync {last}</Text>
        </View>
        {rows.map((r, i) => (
          <View key={r.label} style={[st.row, i < rows.length - 1 && st.line]}>
            <View style={st.rowHead}>
              <Text style={st.rowTitle}>{r.label}</Text>
              <Text style={[st.state, {color: r.done ? c.green : tone}]}>{r.done ? 'Uploaded' : status}</Text>
            </View>
            <Progress value={r.done ? 100 : syncing ? 50 : 0} tone={r.done ? 'green' : 'amber'} height={5} />
            <Text style={st.muted}>{r.sub}</Text>
          </View>
        ))}
      </Card>

      {failed.length > 0 && (
        <Card tone="red" style={{gap: 10}}>
          <Text style={[st.h3, {color: c.red}]}>Could not upload</Text>
          {failed.map(f => (
            <View key={f.id} style={{gap: 6}}>
              <Text style={st.failText}>
                <Text style={{fontWeight: '800'}}>{f.questionCode}: </Text>
                {f.error}
              </Text>
              <View style={st.actions}>
                <Button small variant="secondary" label="Answer again" style={{flex: 1}} onPress={() => navigation.navigate('Point', {jobId: f.jobId, itemId: f.itemId})} />
                <Button small variant="danger" label="Discard" style={{flex: 1}} onPress={() => confirmDiscard(f.id, f.questionCode)} />
              </View>
            </View>
          ))}
        </Card>
      )}

      <Card style={{gap: 10}}>
        <Text style={st.h3}>How your data is kept safe</Text>
        {[
          'Photos come from the in-app camera only, with the time and GPS recorded.',
          "Answers waiting to upload stay in the app's private storage on this tablet and are deleted once they upload.",
          'Each photo is fingerprinted when it uploads, so QC can flag evidence that was reused.',
        ].map(t => (
          <View key={t} style={st.bullet}>
            <View style={st.dot} />
            <Text style={st.bulletText}>{t}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const st = StyleSheet.create({
  banner: {flexDirection: 'row', gap: 12, alignItems: 'flex-start'},
  bannerIcon: {width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center'},
  bannerTitle: {fontSize: 16, fontWeight: '800'},
  bannerText: {fontSize: 13.5, lineHeight: 19, marginTop: 2},
  head: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6},
  h3: {fontSize: 16, fontWeight: '800', color: c.text},
  muted: {fontSize: 12.5, color: c.muted},
  row: {paddingVertical: 12, gap: 6},
  line: {borderBottomWidth: 1, borderBottomColor: c.line},
  rowHead: {flexDirection: 'row', justifyContent: 'space-between'},
  rowTitle: {fontSize: 15, fontWeight: '700', color: c.text},
  state: {fontSize: 13, fontWeight: '700'},
  failText: {fontSize: 13.5, color: c.red, lineHeight: 19},
  actions: {flexDirection: 'row', gap: 10},
  bullet: {flexDirection: 'row', gap: 10, alignItems: 'flex-start'},
  dot: {width: 7, height: 7, borderRadius: 4, backgroundColor: c.green, marginTop: 7},
  bulletText: {flex: 1, fontSize: 14, color: c.text, lineHeight: 20},
});
