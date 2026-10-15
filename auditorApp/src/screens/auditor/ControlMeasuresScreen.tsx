import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '../../components/common/AppIcon';
import CategoryIcon from '../../assets/dashboard/active.svg';
import SubcategoryIcon from '../../assets/checklist/subCategory_icon.svg';
import ThumbUpIcon from '../../assets/auditor/thumb-up.svg';
import ThumbDownIcon from '../../assets/auditor/thumb-down.svg';
import NonApplicableIcon from '../../assets/auditor/non-applicable.svg';
import { auditorApi } from '../../api/auditor.api';
import { AuditorStackParamList } from '../../navigation/navigationTypes';
import { useAuditContext } from '../../store/AuditContext';
import { useAppTheme } from '../../store/ThemeContext';
type P = NativeStackScreenProps<AuditorStackParamList, 'ControlMeasures'>;
type Counts = { yes: number; no: number; na: number };
const approvalStatus = (item: any) => item?.approvalStatus || 'Approved';
const approved = (item: any) => approvalStatus(item) === 'Approved';
const response = (q: any) => q?.auditResponses?.[0]?.responseType;
const counts = (questions: any[]): Counts =>
  questions.filter(approved).reduce(
    (a, q) => {
      const r = response(q);
      if (r === 'COMPLIANCE') a.yes++;
      if (r === 'NON_COMPLIANCE') a.no++;
      if (r === 'NOT_APPLICABLE') a.na++;
      return a;
    },
    { yes: 0, no: 0, na: 0 },
  );
export function ControlMeasuresScreen({ navigation, route }: P) {
  const { isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tablet = width >= 768;
  const { audit } = useAuditContext();
  const { auditId } = route.params;
  const [sections, setSections] = useState<any[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [category, setCategory] = useState(''),
    [open, setOpen] = useState(''),
    [inputs, setInputs] = useState<Record<string, string>>({}),
    [saving, setSaving] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await auditorApi.checklist(auditId);
      const list = (data?.sections || []).map((s: any) => ({
        ...s,
        questions: (s.questions || []).filter(
          (q: any) => !q.dueDate && !q.dueDateText?.trim(),
        ),
      }));
      setSections(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [auditId]);
  useEffect(() => {
    const u = navigation.addListener('focus', load);
    return u;
  }, [load, navigation]);
  const groups = useMemo(
    () =>
      Object.values(
        sections.reduce((a: any, s: any) => {
          const id = `${s.mainMenuNumber || ''}-${s.mainMenu || 'Checklist'}`;
          (a[id] ??= {
            id,
            number: s.mainMenuNumber || '',
            title: s.mainMenu || 'Checklist',
            children: [],
          }).children.push(s);
          return a;
        }, {}),
      ) as any[],
    [sections],
  );
  useEffect(() => {
    if (groups.length && !category) setCategory(groups[0].id);
  }, [category, groups]);
  const change = async (key: string, fn: () => Promise<any>) => {
    setSaving(key);
    try {
      await fn();
      await load();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving('');
    }
  };
  const addSection = (g: any) => {
    const title = inputs[g.id]?.trim();
    if (!title) return Alert.alert('Enter subcategory');
    change(g.id, () =>
      auditorApi.addChecklistSection(auditId, g.title, title),
    ).then(() => setInputs(v => ({ ...v, [g.id]: '' })));
  };
  const addQuestion = (s: any) => {
    const key = `q-${s.id}`,
      text = inputs[key]?.trim();
    if (!text) return;
    change(key, () =>
      auditorApi.addChecklistQuestion(auditId, s.id, text),
    ).then(() => setInputs(v => ({ ...v, [key]: '' })));
  };
  const markNA = (q: any) =>
    change(q.id, () =>
      auditorApi.saveQuestionResponse({
        questionId: q.id,
        auditId,
        responseType: 'NOT_APPLICABLE',
      }),
    );
  const promptRename = (kind: 'section' | 'question', item: any) =>
    Alert.prompt(
      `Rename ${kind}`,
      undefined,
      async text => {
        const value = text?.trim();
        if (!value) return;
        await change(item.id, () =>
          kind === 'section'
            ? auditorApi.renameChecklistSection(auditId, item.id, value)
            : auditorApi.renameChecklistQuestion(auditId, item.id, value),
        );
      },
      'plain-text',
      kind === 'section' ? item.title : item.text,
    );
  const active = groups.find(g => g.id === category);
  return (
    <View style={[s.screen, isDark && s.screenDark]}>
      <View
        style={[s.top, isDark && s.cardDark, { height: 66 + insets.top, paddingTop: insets.top }]}
      >
        <Pressable onPress={navigation.goBack} style={s.back}>
          <Feather name="arrow-left" size={21} color="#0754AD" />
          <Text style={s.backText}>Back</Text>
        </Pressable>
      </View>
      <ScrollView
        style={s.scroll}
        stickyHeaderIndices={[2]}
        contentContainerStyle={[s.body, tablet && s.bodyTablet]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[s.audit, isDark && s.auditDark]}>
          <Text style={[s.auditLabel, isDark && s.textDark]}>Audit Type</Text>
          <Text style={s.pill}>{audit?.auditType || 'Audit'}</Text>
        </View>
        <View style={[s.hero, isDark && s.heroDark]}>
          <Text style={[s.title, isDark && s.textDark]}>Audit Checklist</Text>
          <Text style={[s.subtitle, isDark && s.mutedDark]}>
            {active
              ? `Section ${active.number}: ${active.title}`
              : 'Select a checklist category'}
          </Text>
        </View>
        <View style={[s.categories, isDark && s.categoriesDark]}>
          <Text style={[s.cap, isDark && s.mutedDark]}>CATEGORIES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {groups.map((g, i) => (
              <Pressable
                key={g.id}
                onPress={() => setCategory(g.id)}
                style={[s.cat, isDark && s.catDark, category === g.id && s.catOn]}
              >
                <Text style={[s.catNo, isDark && s.textDark, category === g.id && s.blue]}>
                  {g.number || i + 1}
                </Text>
                <Text style={[s.catLabel, isDark && s.mutedDark]}>Category</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        {busy ? (
          <ActivityIndicator style={s.loader} size="large" color="#0754AD" />
        ) : error ? (
          <Pressable onPress={load} style={s.error}>
            <Text style={s.errorText}>
              {error}
              {'\n'}Tap to retry
            </Text>
          </Pressable>
        ) : (
          groups.map(g => {
            const expanded = g.id === category;
            const c = counts(g.children.flatMap((x: any) => x.questions || []));
            return (
              <View key={g.id} style={[s.group, isDark && s.cardDark]}>
                <Pressable
                  onPress={() => setCategory(expanded ? '' : g.id)}
                  style={[s.groupHead, isDark && expanded && s.groupOnDark, expanded && s.groupOn]}
                >
                  <View style={s.darkIcon}>
                    <CategoryIcon width={17} height={17} />
                  </View>
                  <Text style={[s.groupTitle, isDark && s.textDark]}>
                    {g.number} - {g.title}
                  </Text>
                  <Stats value={c} isDark={isDark} />
                  <Feather
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    color={isDark ? '#F8FAFC' : undefined}
                    size={18}
                  />
                </Pressable>
                {expanded && (
                  <View style={s.subWrap}>
                    {g.children.map((sub: any) => {
                      const isOpen = String(open) === String(sub.id),
                        c2 = counts(sub.questions || []),
                        pending = !approved(sub),
                        subStatus = approvalStatus(sub);
                      return (
                        <View
                          key={sub.id}
                          style={[
                            s.sub,
                            isDark && s.subDark,
                            pending &&
                              (subStatus === 'Rejected'
                                ? s.rejectedItem
                                : s.pendingItem),
                          ]}
                        >
                          <View style={s.subRow}>
                            <Pressable
                              disabled={pending}
                              onPress={() => setOpen(isOpen ? '' : sub.id)}
                              style={s.subMain}
                            >
                              <View
                                style={[s.greenIcon, pending && s.pendingIcon]}
                              >
                                <SubcategoryIcon width={16} height={16} />
                              </View>
                              <Text style={[s.subTitle, isDark && s.textDark]}>
                                {sub.sectionNumber} - {sub.title}
                              </Text>
                              {pending && (
                                <Text
                                  style={[
                                    s.statusBadge,
                                    subStatus === 'Rejected' && s.rejectedBadge,
                                  ]}
                                >
                                  {subStatus}
                                </Text>
                              )}
                            </Pressable>
                            <Stats value={c2} />
                            <Pressable
                              onPress={() => promptRename('section', sub)}
                              hitSlop={8}
                            >
                              <Feather
                                name="edit-2"
                                color="#EF7B10"
                                size={15}
                              />
                            </Pressable>
                          </View>
                          {pending && (
                            <Text
                              style={[
                                s.approvalHelp,
                                subStatus === 'Rejected' && s.rejectedText,
                              ]}
                            >
                              {subStatus === 'Rejected'
                                ? sub.approvalRemark ||
                                  'Rejected by admin. Edit and submit again.'
                                : 'Waiting for admin approval.'}
                            </Text>
                          )}
                          {isOpen &&
                            (sub.questions || []).map((q: any) => {
                              const r = response(q),
                                questionStatus = approvalStatus(q),
                                questionPending = !approved(q);
                              return (
                                <View
                                  key={q.id}
                                  style={[
                                    s.question,
                                    questionPending &&
                                      (questionStatus === 'Rejected'
                                        ? s.rejectedQuestion
                                        : s.pendingQuestion),
                                  ]}
                                >
                                  <View style={s.questionTitleRow}>
                                    <Text style={[s.qText, isDark && s.textDark]}>
                                      {q.questionNumber} - {q.text}
                                    </Text>
                                    {questionPending && (
                                      <Text
                                        style={[
                                          s.statusBadge,
                                          questionStatus === 'Rejected' &&
                                            s.rejectedBadge,
                                        ]}
                                      >
                                        {questionStatus}
                                      </Text>
                                    )}
                                  </View>
                                  {questionPending && (
                                    <Text
                                      style={[
                                        s.questionHelp,
                                        questionStatus === 'Rejected' &&
                                          s.rejectedText,
                                      ]}
                                    >
                                      {questionStatus === 'Rejected'
                                        ? q.approvalRemark ||
                                          'Rejected by admin. Edit and submit again.'
                                        : 'Waiting for admin approval.'}
                                    </Text>
                                  )}
                                  <View
                                    style={[
                                      s.actions,
                                      questionPending && s.disabledActions,
                                    ]}
                                  >
                                    <Pressable
                                      disabled={questionPending}
                                      onPress={() =>
                                        navigation.navigate(
                                          'ChecklistResponse',
                                          {
                                            auditId,
                                            question: q,
                                            responseType: 'COMPLIANCE',
                                          },
                                        )
                                      }
                                      style={s.action}
                                    >
                                      <ThumbUpIcon width={16} height={16} />
                                      <Text>{r === 'COMPLIANCE' ? 1 : 0}</Text>
                                    </Pressable>
                                    <Pressable
                                      disabled={questionPending}
                                      onPress={() =>
                                        navigation.navigate(
                                          'ChecklistResponse',
                                          {
                                            auditId,
                                            question: q,
                                            responseType: 'NON_COMPLIANCE',
                                          },
                                        )
                                      }
                                      style={s.action}
                                    >
                                      <ThumbDownIcon width={16} height={16} />
                                      <Text>
                                        {r === 'NON_COMPLIANCE' ? 1 : 0}
                                      </Text>
                                    </Pressable>
                                    <Pressable
                                      disabled={
                                        questionPending || saving === q.id
                                      }
                                      onPress={() => markNA(q)}
                                    >
                                      <Text style={[s.na, isDark && s.textDark]}>
                                        NA {r === 'NOT_APPLICABLE' ? 1 : 0}
                                      </Text>
                                    </Pressable>
                                    <Pressable
                                      onPress={() =>
                                        promptRename('question', q)
                                      }
                                    >
                                      <Feather
                                        name="edit-2"
                                        color="#EF7B10"
                                        size={14}
                                      />
                                    </Pressable>
                                  </View>
                                </View>
                              );
                            })}
                          {isOpen && (
                            <View style={s.add}>
                              <TextInput
                                placeholder="Add question"
                                placeholderTextColor={isDark ? '#6B7280' : undefined}
                                value={inputs[`q-${sub.id}`] || ''}
                                onChangeText={v =>
                                  setInputs(x => ({ ...x, [`q-${sub.id}`]: v }))
                                }
                                style={[s.input, isDark && s.inputDark]}
                              />
                              <Pressable
                                disabled={saving === `q-${sub.id}`}
                                onPress={() => addQuestion(sub)}
                                style={[
                                  s.plus,
                                  saving === `q-${sub.id}` && s.plusDisabled,
                                ]}
                              >
                                {saving === `q-${sub.id}` ? (
                                  <ActivityIndicator color="white" />
                                ) : (
                                  <Feather
                                    name="plus"
                                    color="white"
                                    size={23}
                                  />
                                )}
                              </Pressable>
                            </View>
                          )}
                        </View>
                      );
                    })}
                    <View style={s.add}>
                      <TextInput
                        placeholder="Add subcategory"
                        placeholderTextColor={isDark ? '#6B7280' : undefined}
                        value={inputs[g.id] || ''}
                        onChangeText={v =>
                          setInputs(x => ({ ...x, [g.id]: v }))
                        }
                        style={[s.input, isDark && s.inputDark]}
                      />
                      <Pressable
                        disabled={saving === g.id}
                        onPress={() => addSection(g)}
                        style={[s.plus, saving === g.id && s.plusDisabled]}
                      >
                        {saving === g.id ? (
                          <ActivityIndicator color="white" />
                        ) : (
                          <Feather name="plus" color="white" size={23} />
                        )}
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
        <View style={s.footer}>
          <Text style={s.footerTitle}>Audit Smartly</Text>
          <Text style={[s.footerSub, isDark && s.mutedDark]}>
            Keep your sites compliant and inspections on track
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
function Stats({ value, isDark }: { value: Counts; isDark?: boolean }) {
  return (
    <View style={s.stats}>
      <View style={s.statItem}>
        <ThumbUpIcon width={13} height={13} />
        <Text style={s.yes}>{value.yes}</Text>
      </View>
      <View style={s.statItem}>
        <ThumbDownIcon width={13} height={13} />
        <Text style={s.no}>{value.no}</Text>
      </View>
      <View style={s.statItem}>
        <NonApplicableIcon width={13} height={13} />
        <Text style={[s.na, isDark && s.textDark]}>{value.na}</Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F6F7' },
  screenDark: { backgroundColor: '#111827' },
  textDark: { color: '#F8FAFC' },
  mutedDark: { color: '#9CA3AF' },
  cardDark: { backgroundColor: '#1F2937' },
  inputDark: { backgroundColor: '#111827', borderColor: '#374151', color: '#F8FAFC' },
  scroll: { flex: 1 },
  top: {
    height: 66,
    justifyContent: 'center',
    backgroundColor: 'white',
    elevation: 3,
    paddingHorizontal: 20,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backText: { fontSize: 17, color: '#0754AD' },
  body: {
    paddingBottom: 40,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  bodyTablet: { maxWidth: 940 },
  audit: {
    height: 74,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderColor: '#D9DDE3',
  },
  auditDark: { backgroundColor: '#1F2937', borderColor: '#374151' },
  auditLabel: { fontSize: 17, fontWeight: '700' },
  pill: {
    backgroundColor: '#C9E2FF',
    borderWidth: 1,
    borderColor: '#70B8E4',
    color: '#06449D',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 22,
  },
  hero: {
    padding: 20,
    backgroundColor: '#F7F7F8',
    borderBottomWidth: 1,
    borderColor: '#DDD',
  },
  heroDark: { backgroundColor: '#1F2937', borderColor: '#374151' },
  title: { fontSize: 27, fontWeight: '700', color: '#222' },
  subtitle: { fontSize: 14, color: '#444', marginTop: 7 },
  categories: {
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderColor: '#CBD0DA',
  },
  categoriesDark: { backgroundColor: '#111827', borderColor: '#374151' },
  cap: {
    fontSize: 11,
    color: '#4D5260',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  cat: {
    width: 98,
    minHeight: 102,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderColor: '#CBD0DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catDark: { borderColor: '#374151' },
  catOn: { backgroundColor: '#EEF0FF' },
  catNo: { fontSize: 29, fontWeight: '600' },
  blue: { color: '#0648A8' },
  catLabel: { fontSize: 11, marginTop: 11 },
  loader: { marginTop: 70 },
  error: {
    margin: 20,
    padding: 18,
    backgroundColor: '#FDECEC',
    borderRadius: 10,
  },
  errorText: { color: '#B42318', textAlign: 'center' },
  group: {
    borderBottomWidth: 1,
    borderColor: '#BFC3C8',
    backgroundColor: 'white',
  },
  groupHead: {
    minHeight: 84,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  groupOn: { backgroundColor: '#DCEBFC' },
  groupOnDark: { backgroundColor: '#26344A' },
  darkIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#344153',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: { fontSize: 15, lineHeight: 21, flex: 1, fontWeight: '500' },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  yes: { color: '#009B75', fontSize: 13 },
  no: { color: '#F04444', fontSize: 13 },
  na: { fontSize: 12, color: '#222' },
  subWrap: { paddingHorizontal: 20, paddingLeft: 54 },
  sub: { paddingVertical: 14, borderBottomWidth: 1, borderColor: '#D7DADF' },
  subDark: { borderColor: '#374151' },
  pendingItem: {
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 8,
  },
  rejectedItem: { borderLeftColor: '#EF4444', backgroundColor: '#FEF2F2' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  subMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  greenIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#009B75',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingIcon: { backgroundColor: '#D97706' },
  subTitle: { fontSize: 12, lineHeight: 18, flex: 1, color: '#111' },
  statusBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B45309',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  rejectedBadge: { color: '#B91C1C', backgroundColor: '#FEE2E2' },
  approvalHelp: {
    fontSize: 11,
    color: '#B45309',
    marginLeft: 38,
    marginTop: 6,
  },
  rejectedText: { color: '#B91C1C' },
  question: {
    paddingVertical: 12,
    marginLeft: 38,
    borderTopWidth: 1,
    borderColor: '#E1E3E6',
  },
  pendingQuestion: {
    backgroundColor: '#FFFBEB',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
    paddingHorizontal: 8,
  },
  rejectedQuestion: { backgroundColor: '#FEF2F2', borderLeftColor: '#EF4444' },
  questionTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  qText: { fontSize: 12, lineHeight: 18, color: '#333', flex: 1 },
  questionHelp: { fontSize: 10, color: '#B45309', marginTop: 5 },
  disabledActions: { opacity: 0.45 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 18,
    marginTop: 9,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  add: { flexDirection: 'row', gap: 10, paddingTop: 14 },
  input: {
    height: 48,
    flex: 1,
    borderWidth: 1,
    borderColor: '#C9CFD9',
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: 'white',
  },
  plus: {
    width: 50,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#154BE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusDisabled: { opacity: 0.55 },
  footer: { alignItems: 'center', paddingTop: 54 },
  footerTitle: { color: '#5046EF', fontSize: 18, fontWeight: '800' },
  footerSub: { color: '#98A2B3', marginTop: 9, textAlign: 'center' },
  blueText: { color: '#0648A8' },
});
