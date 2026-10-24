import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {fieldApi} from '../../api/field.api';
import {Clarification} from '../../types/field';
import {Badge, Button, Card, Empty, ErrorBox, Field, Loading, Screen} from '../../ui/kit';
import {c} from '../../ui/theme';
import {useLoad} from '../../ui/useLoad';
import {fmtDay, fmtTime} from '../../utils/field';
import {StackProps} from '../../navigation/fieldTypes';

const STATUS: Record<string, {label: string; tone: 'blue' | 'green' | 'gray' | 'amber'}> = {
  OPEN: {label: 'Waiting for you', tone: 'amber'},
  ANSWERED: {label: 'Answered', tone: 'green'},
  ACCEPTED: {label: 'Change accepted', tone: 'blue'},
  ACTIONED: {label: 'Change made', tone: 'green'},
  CLOSED: {label: 'Closed', tone: 'gray'},
};

export function DealerQuestionsScreen({navigation, route}: StackProps<'DealerQuestions'>) {
  const {reportId} = route.params;
  const {data, error, loading, refresh, reload} = useLoad(() => fieldApi.clarifications(reportId), [reportId]);
  if (loading && !data) return <Screen title="Dealer questions" onBack={navigation.goBack}><Loading /></Screen>;
  return (
    <Screen title="Dealer questions" subtitle="Questions and change requests on this report" onBack={navigation.goBack} onRefresh={refresh}>
      {!!error && <ErrorBox message={error} onRetry={refresh} />}
      {data && !data.length && <Empty title="No questions" body="The dealer has not asked anything about this report." icon="message-square" />}
      {(data || []).map(q => (
        <Question key={q.id} q={q} onDone={reload} />
      ))}
    </Screen>
  );
}

function Question({q, onDone}: {q: Clarification; onDone: () => void}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const status = STATUS[q.status] || {label: q.status, tone: 'gray' as const};
  const send = async (action: 'ANSWER' | 'DECLINE') => {
    if (!text.trim()) return setError(action === 'DECLINE' ? 'Give the reason for declining.' : 'Write the answer.');
    setBusy(action);
    setError('');
    try {
      await fieldApi.answerClarification(q.id, action, text.trim());
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  return (
    <Card style={{gap: 10}}>
      <View style={st.head}>
        <Badge label={q.kind === 'CHANGE' ? 'Change request' : 'Question'} tone={q.kind === 'CHANGE' ? 'amber' : 'blue'} style={{borderRadius: 6}} />
        <Badge label={status.label} tone={status.tone} />
      </View>
      <Text style={st.message}>"{q.message}"</Text>
      <Text style={st.meta}>
        {q.raisedBy?.fullName || 'Dealer'} · {fmtDay(q.createdAt)} {fmtTime(q.createdAt)}
      </Text>
      {!!q.response && (
        <View style={st.answer}>
          <Text style={st.answerLabel}>Answer</Text>
          <Text style={st.answerText}>{q.response}</Text>
        </View>
      )}
      {q.status === 'OPEN' && (
        <>
          {q.kind === 'CHANGE' && <Text style={st.meta}>Only Back-Admin can accept a change and open a new revision. You can explain the finding or decline with a reason.</Text>}
          <Field value={text} onChangeText={setText} multiline placeholder={q.kind === 'CHANGE' ? 'Explain the finding, or why the change is not needed' : 'Your answer to the dealer'} />
          {!!error && <ErrorBox message={error} />}
          <View style={st.row}>
            <Button small label="Send answer" style={{flex: 2}} onPress={() => send('ANSWER')} loading={busy === 'ANSWER'} disabled={!!busy} />
            <Button small label="Decline" variant="danger" style={{flex: 1}} onPress={() => send('DECLINE')} loading={busy === 'DECLINE'} disabled={!!busy} />
          </View>
        </>
      )}
    </Card>
  );
}

const st = StyleSheet.create({
  head: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  message: {fontSize: 16, color: c.text, lineHeight: 22, fontWeight: '600'},
  meta: {fontSize: 12.5, color: c.muted, lineHeight: 17},
  answer: {backgroundColor: c.greenSoft, borderRadius: 10, padding: 10, gap: 2},
  answerLabel: {fontSize: 12, fontWeight: '800', color: c.green},
  answerText: {fontSize: 14, color: c.text, lineHeight: 19},
  row: {flexDirection: 'row', gap: 10},
});
