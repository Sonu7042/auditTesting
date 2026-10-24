import React, {useEffect, useRef, useState} from 'react';
import {Alert, Image, Pressable, StyleSheet, Text, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {WebView} from 'react-native-webview';
import {fieldApi} from '../../api/field.api';
import {useAuth} from '../../store/AuthContext';
import {Badge, Button, Card, ChoiceButton, ErrorBox, Field, Icon, Loading, Mono, Progress, Screen} from '../../ui/kit';
import {c, mono, Tone} from '../../ui/theme';
import {useLoad} from '../../ui/useLoad';
import {fmtDate} from '../../utils/field';
import {StackProps} from '../../navigation/fieldTypes';

type Demo = Record<string, {result: string; comment?: string}>;
const STATUS: Record<string, {label: string; tone: Tone}> = {
  CREATED: {label: 'In training', tone: 'blue'},
  TRAINING: {label: 'In training', tone: 'blue'},
  RETRAINING: {label: 'Retraining', tone: 'amber'},
  UNDER_REVIEW: {label: 'In review', tone: 'amber'},
  APPROVED: {label: 'Certified', tone: 'green'},
  REJECTED: {label: 'Not approved', tone: 'red'},
};
const isVideoFile = (url: string) => /\.(mp4|webm|m4v|mov|m3u8)(\?|$)/i.test(url);
const videoHtml = (url: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#000;height:100%}video{width:100%;height:100%}</style></head><body>
<video id="v" src="${url.replace(/"/g, '')}" controls playsinline controlsList="nodownload noplaybackrate"></video>
<script>var v=document.getElementById('v');var last=0;function send(){if(!v.duration)return;var p=Math.round(v.currentTime/v.duration*100);window.ReactNativeWebView.postMessage(JSON.stringify({p:p,d:Math.round(v.duration)}));}
v.addEventListener('timeupdate',function(){var n=Date.now();if(n-last>8000){last=n;send();}});v.addEventListener('ended',send);v.addEventListener('seeking',function(){var max=v.played.length?v.played.end(v.played.length-1):0;if(v.currentTime>max+2){v.currentTime=max;}});</script></body></html>`;

export function TrainingScreen({navigation}: StackProps<'Training'>) {
  const {user} = useAuth();
  const key = `@field/training/${user?.id}`;
  const {data, error, loading, refresh, reload} = useLoad(() => fieldApi.training(), []);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [qi, setQi] = useState(0);
  const [quiz, setQuiz] = useState<Record<string, number>>({});
  const [demo, setDemo] = useState<Demo>({});
  const [video, setVideo] = useState(0);
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const lastSent = useRef(0);
  const restored = useRef(false);

  useEffect(() => {
    if (!data || restored.current) return;
    restored.current = true;
    setVideo(data.onboarding.videoProgress);
    if (data.onboarding.videoProgress >= 90) setStep(2);
    AsyncStorage.getItem(key).then(raw => {
      try {
        const saved = raw ? JSON.parse(raw) : null;
        if (saved?.quiz) setQuiz(saved.quiz);
        if (saved?.demo) setDemo(saved.demo);
      } catch {
        /* ignore */
      }
    });
  }, [data, key]);

  useEffect(() => {
    if (restored.current) AsyncStorage.setItem(key, JSON.stringify({quiz, demo})).catch(() => undefined);
  }, [quiz, demo, key]);

  if (loading && !data) return <Screen title="Training and certificate" onBack={navigation.goBack}><Loading /></Screen>;
  if (!data) return <Screen title="Training and certificate" onBack={navigation.goBack}><ErrorBox message={error} onRetry={refresh} /></Screen>;

  const o = data.onboarding;
  const content = data.content;
  const status = STATUS[o.status] || {label: o.status, tone: 'gray' as Tone};
  const header = (children: React.ReactNode, footer?: React.ReactNode) => (
    <Screen title="Training and certificate" onBack={navigation.goBack} right={<Badge label={status.label} tone={status.tone} />} footer={footer}>
      {children}
    </Screen>
  );

  if (o.status === 'APPROVED') {
    const refresher = async () => {
      setBusy(true);
      try {
        await fieldApi.startRefresher();
        restored.current = false;
        setQuiz({});
        setDemo({});
        reload();
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    };
    return header(
      <>
        <Card tone="green" style={{gap: 6}}>
          <Text style={st.bigGreen}>You are certified</Text>
          <Text style={st.greenText}>
            Approved {fmtDate(o.approvedAt)} · Quiz {o.quizScore ?? '—'}% · Code <Text style={{fontFamily: mono}}>{o.auditorCode}</Text>
          </Text>
          {!!o.expiresAt && <Text style={st.greenText}>Valid until {fmtDate(o.expiresAt)}{o.daysLeft != null ? ` (${o.daysLeft} days)` : ''}.</Text>}
        </Card>
        <Card style={{gap: 10}}>
          <Text style={st.h3}>Annual refresher</Text>
          <Text style={st.muted}>The refresher opens 30 days before your certificate ends. You stay plannable until it ends; passing the refresher renews it.</Text>
          {o.canStartRefresher ? <Button label="Start the refresher" onPress={refresher} loading={busy} /> : <Text style={st.muted}>Not open yet.</Text>}
        </Card>
        {!!err && <ErrorBox message={err} />}
      </>,
    );
  }
  if (o.status === 'UNDER_REVIEW')
    return header(
      <Card tone="amber" style={{gap: 6}}>
        <Text style={[st.h3, {color: c.amber}]}>Sent for review</Text>
        <Text style={[st.muted, {color: c.amber}]}>Your quiz scored {o.quizScore}%. Back-Admin is checking your demo checklist. You get a notification with the decision.</Text>
      </Card>,
    );
  if (o.status === 'REJECTED')
    return header(
      <Card tone="red" style={{gap: 6}}>
        <Text style={[st.h3, {color: c.red}]}>Not approved</Text>
        <Text style={[st.muted, {color: c.red}]}>{o.rejectionReason || o.reviewRemarks || 'Contact Back-Admin for details.'}</Text>
      </Card>,
    );

  const answeredQuiz = content.quiz.filter(q => quiz[q.id] !== undefined).length;
  const doneDemo = content.demo.filter(d => demo[d.id]?.result && (demo[d.id].result === 'OK' || demo[d.id].comment?.trim())).length;
  const videoDone = video >= 90;
  const q = content.quiz[Math.min(qi, content.quiz.length - 1)];

  const onVideo = async (msg: string) => {
    try {
      const {p, d} = JSON.parse(msg);
      if (d) setDuration(d);
      if (p <= lastSent.current) return;
      lastSent.current = p;
      const res = await fieldApi.videoProgress(p);
      setVideo(res.videoProgress);
    } catch {
      /* keep playing; next update retries */
    }
  };
  const markWatched = async () => {
    try {
      setVideo((await fieldApi.videoProgress(100)).videoProgress);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const res = await fieldApi.submitTraining(quiz, demo);
      await AsyncStorage.removeItem(key);
      Alert.alert(res.passed ? 'Submitted' : 'Below the pass mark', res.message, [
        {
          text: 'OK',
          onPress: () => {
            restored.current = false;
            setQuiz(res.passed ? quiz : {});
            setDemo({});
            setStep(1);
            setQi(0);
            lastSent.current = 0;
            reload();
          },
        },
      ]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    {n: 1 as const, label: 'Video', sub: videoDone ? 'Done' : `${video}% watched`, done: videoDone},
    {n: 2 as const, label: 'Quiz', sub: `${answeredQuiz} of ${content.quiz.length} answered`, done: answeredQuiz === content.quiz.length},
    {n: 3 as const, label: 'Demo checklist', sub: doneDemo ? `${doneDemo} of ${content.demo.length}` : 'Not started', done: doneDemo === content.demo.length},
  ];

  const footer =
    step === 1 ? (
      <Button label="Continue to the quiz" disabled={!videoDone} onPress={() => setStep(2)} />
    ) : step === 2 ? (
      <View style={st.row}>
        <Button label="Previous" variant="secondary" style={{flex: 1}} disabled={qi === 0} onPress={() => setQi(i => i - 1)} />
        {qi < content.quiz.length - 1 ? (
          <Button label="Next question" style={{flex: 2}} disabled={quiz[q.id] === undefined} onPress={() => setQi(i => i + 1)} />
        ) : (
          <Button label="Go to demo checklist" style={{flex: 2}} disabled={answeredQuiz < content.quiz.length} onPress={() => setStep(3)} />
        )}
      </View>
    ) : (
      <Button label="Submit for review" disabled={!videoDone || answeredQuiz < content.quiz.length || doneDemo < content.demo.length} loading={busy} onPress={submit} />
    );

  return header(
    <>
      <View style={st.steps}>
        {steps.map(s => (
          <Pressable key={s.n} style={{flex: 1, gap: 4}} disabled={s.n > 1 && !videoDone} onPress={() => setStep(s.n)}>
            <View style={[st.stepBar, (s.done || step === s.n) && {backgroundColor: s.done ? c.green : c.ink}]} />
            <Text style={[st.stepLabel, step === s.n && {color: c.text}]}>
              {s.n} {s.label}
            </Text>
            <Text style={st.stepSub}>{s.sub}</Text>
          </Pressable>
        ))}
      </View>
      {o.status === 'RETRAINING' && (o.quizAttempts || 0) > 0 && (
        <Card tone="amber">
          <Text style={[st.muted, {color: c.amber}]}>Your last quiz scored {o.quizScore}%, below the {content.passMark}% pass mark. Watch the video again and retake the quiz.</Text>
        </Card>
      )}

      {step === 1 && (
        <>
          {videoDone ? (
            <Card tone="green" style={st.watched}>
              <View style={st.watchedIcon}>
                <Icon name="check" size={18} color={c.green} />
              </View>
              <View style={{flex: 1}}>
                <Text style={st.watchedTitle}>Training video watched.</Text>
                <Text style={st.muted}>
                  {duration ? `${Math.round(duration / 60)} min · ` : ''}
                  {video}% played. It is recorded as it plays.
                </Text>
              </View>
            </Card>
          ) : null}
          {content.videoUrl ? (
            isVideoFile(content.videoUrl) ? (
              <View style={st.player}>
                <WebView originWhitelist={['*']} source={{html: videoHtml(content.videoUrl)}} onMessage={e => onVideo(e.nativeEvent.data)} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} javaScriptEnabled />
              </View>
            ) : (
              <>
                <View style={st.player}>
                  <WebView source={{uri: content.videoUrl}} allowsInlineMediaPlayback javaScriptEnabled />
                </View>
                <Text style={st.muted}>This video link cannot report how much you watched. Ask Back-Admin to publish a direct video file, or mark it watched when you finish.</Text>
                {!videoDone && <Button variant="secondary" label="I have watched the video" onPress={markWatched} />}
              </>
            )
          ) : (
            <Card style={{gap: 10}}>
              <Text style={st.muted}>No training video is published yet. Mark this step done to continue.</Text>
              {!videoDone && <Button variant="secondary" label="Continue without video" onPress={markWatched} />}
            </Card>
          )}
          <Progress value={video} />
        </>
      )}

      {step === 2 && q && (
        <>
          <Card style={{gap: 12}}>
            <View style={st.qHead}>
              <Mono style={st.qNum}>QUESTION {qi + 1} OF {content.quiz.length}</Mono>
              <Text style={st.stepSub}>Pass mark {content.passMark}%</Text>
            </View>
            <Text style={st.qText}>{q.text}</Text>
            {q.options.map((opt, i) => {
              const on = quiz[q.id] === i;
              return (
                <Pressable key={opt} onPress={() => setQuiz(x => ({...x, [q.id]: i}))} style={[st.opt, on && st.optOn]} accessibilityRole="radio" accessibilityState={{selected: on}}>
                  <View style={[st.radio, on && st.radioOn]}>{on && <View style={st.radioDot} />}</View>
                  <Text style={st.optText}>{opt}</Text>
                </Pressable>
              );
            })}
          </Card>
          <Text style={st.muted}>Under the pass mark you watch the video again and retake the quiz. Your attempts are kept in your training record.</Text>
        </>
      )}

      {step === 3 &&
        content.demo.map((d, i) => {
          const a = demo[d.id];
          const set = (patch: Partial<{result: string; comment: string}>) => setDemo(x => ({...x, [d.id]: {result: x[d.id]?.result || '', comment: x[d.id]?.comment || '', ...patch}}));
          return (
            <Card key={d.id} style={{gap: 10}}>
              <Mono>DEMO {i + 1} OF {content.demo.length}</Mono>
              <Text style={st.qText}>{d.title}</Text>
              {!!d.imageUrl && <Image source={{uri: d.imageUrl}} style={st.demoImg} />}
              <Text style={st.muted}>{d.scenario}</Text>
              <View style={st.row}>
                <ChoiceButton small label="OK" selected={a?.result === 'OK'} onPress={() => set({result: 'OK'})} />
                <ChoiceButton small label="Not OK" tone="red" selected={a?.result === 'NOT_OK'} onPress={() => set({result: 'NOT_OK'})} />
                <ChoiceButton small label="N/A" tone="gray" selected={a?.result === 'NA'} onPress={() => set({result: 'NA'})} />
              </View>
              {!!a?.result && a.result !== 'OK' && <Field value={a.comment || ''} onChangeText={t => set({comment: t})} multiline placeholder={a.result === 'NA' ? 'Why it does not apply' : 'What is wrong and what should be done'} />}
            </Card>
          );
        })}
      {!!err && <ErrorBox message={err} />}
    </>,
    footer,
  );
}

const st = StyleSheet.create({
  row: {flexDirection: 'row', gap: 10},
  steps: {flexDirection: 'row', gap: 10},
  stepBar: {height: 4, borderRadius: 2, backgroundColor: c.line},
  stepLabel: {fontSize: 13, fontWeight: '700', color: c.muted},
  stepSub: {fontSize: 12, color: c.muted},
  watched: {flexDirection: 'row', alignItems: 'center', gap: 12},
  watchedIcon: {width: 34, height: 34, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center'},
  watchedTitle: {fontSize: 15, fontWeight: '800', color: c.text},
  player: {height: 220, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000'},
  qHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  qNum: {letterSpacing: 1.5},
  qText: {fontSize: 19, fontWeight: '700', color: c.text, lineHeight: 26},
  opt: {flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: c.lineStrong, borderRadius: 12, padding: 14},
  optOn: {borderColor: c.green, borderWidth: 1.5, backgroundColor: c.greenSoft},
  radio: {width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c.muted, alignItems: 'center', justifyContent: 'center'},
  radioOn: {borderColor: c.green},
  radioDot: {width: 10, height: 10, borderRadius: 5, backgroundColor: c.green},
  optText: {flex: 1, fontSize: 15, color: c.text, lineHeight: 21},
  demoImg: {height: 160, borderRadius: 10, backgroundColor: c.line},
  muted: {fontSize: 13.5, color: c.muted, lineHeight: 19},
  h3: {fontSize: 16, fontWeight: '800', color: c.text},
  bigGreen: {fontSize: 18, fontWeight: '800', color: c.green},
  greenText: {fontSize: 13.5, color: c.greenDark, lineHeight: 19},
});
