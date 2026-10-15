import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '../../components/common/AppIcon';
import {useAppTheme} from '../../store/ThemeContext';
import { launchImageLibrary, Asset } from 'react-native-image-picker';
import { auditorApi } from '../../api/auditor.api';
import { AuditorStackParamList } from '../../navigation/navigationTypes';
import { useAuditContext } from '../../store/AuditContext';
import CategoryIcon from '../../assets/dashboard/active.svg';
import SubcategoryIcon from '../../assets/checklist/subCategory_icon.svg';
import ThumbUpIcon from '../../assets/auditor/thumb-up.svg';
import ThumbDownIcon from '../../assets/auditor/thumb-down.svg';
import NonApplicableIcon from '../../assets/auditor/non-applicable.svg';
type P = NativeStackScreenProps<AuditorStackParamList, 'Documents'>;
type Draft = { date?: string; image?: Asset; text?: string };
const dateOf = (q: any) =>
  String(q.documentDueDate || q.dueDateText || '').slice(0, 10);
const nice = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB');
};
const isAuditorAdded = (q: any) => q?.addedByRole === 'AUDITOR';
const approvalOf = (q: any) => q?.approvalStatus || 'Approved';
export function DocumentsScreen({ navigation, route }: P) {
  const {isDark} = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tablet = width >= 768;
  const { projectId, auditId } = route.params,
    { audit } = useAuditContext();
  const [data, setData] = useState<any[]>([]),
    [active, setActive] = useState(''),
    [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [expanded, setExpanded] = useState<Record<string, boolean>>({}),
    [busy, setBusy] = useState(true),
    [saving, setSaving] = useState(''),
    [preview, setPreview] = useState<{uri: string; name: string} | null>(null),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setData(await auditorApi.documentQuestions(projectId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [projectId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const sections = useMemo(() => {
    const chosen = data.filter(
      x =>
        String(x.id) === String(auditId) ||
        String(x.auditId) === String(auditId),
    );
    return (chosen.length ? chosen : data).flatMap(x => x.sections || []);
  }, [auditId, data]);
  const cats = useMemo(
    () =>
      Object.values(
        sections.reduce((a: any, x: any) => {
          const id = `${x.mainMenuNumber}-${x.mainMenu}`;
          (a[id] ??= {
            id,
            number: x.mainMenuNumber,
            title: x.mainMenu,
            children: [],
          }).children.push(x);
          return a;
        }, {}),
      ) as any[],
    [sections],
  );
  useEffect(() => {
    if (!active && cats[0]) setActive(cats[0].id);
  }, [active, cats]);
  const current = cats.find(x => x.id === active);
  const qs = current?.children.flatMap((x: any) => x.questions || []) || [];
  const pick = async (key: string) => {
    const r = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.8,
    });
    if (r.errorMessage) {
      Alert.alert('Image unavailable', r.errorMessage);
      return;
    }
    if (r.assets?.[0])
      setDrafts(v => ({ ...v, [key]: { ...v[key], image: r.assets![0] } }));
  };
  const addQuestion = async (section: any) => {
    const key = `new-${section.id}`;
    const draft = drafts[key] || {};
    if (!draft.text?.trim()) return Alert.alert('Question required', 'Enter the question.');
    if (!draft.date) return Alert.alert('Date required', 'Select a due date.');
    if (!draft.image) return Alert.alert('Image required', 'Select an image.');
    const form = new FormData();
    form.append('auditId', auditId);
    form.append('sectionId', section.id);
    form.append('text', draft.text.trim());
    form.append('dueDateText', draft.date);
    form.append('documentImages', {
      uri: draft.image.uri,
      name: draft.image.fileName || `document-${Date.now()}.jpg`,
      type: draft.image.type || 'image/jpeg',
    } as any);
    setSaving(key);
    try {
      await auditorApi.addDueDateQuestion(form);
      setDrafts(value => ({...value, [key]: {}}));
      setExpanded(value => ({...value, [section.id]: false}));
      await load();
      Alert.alert('Question added', 'Due-date question and document were added successfully.');
    } catch (e) {
      Alert.alert('Unable to add question', (e as Error).message);
    } finally {
      setSaving('');
    }
  };
  const submit = async (q: any) => {
    const d = drafts[q.id] || {},
      date = d.date || dateOf(q);
    if (!date || (!d.image && !q.documentImageUrl))
      return Alert.alert('Required', 'Enter due date and select an image.');
    const f = new FormData();
    f.append(
      'documents',
      JSON.stringify([{ questionId: q.id, documentDueDate: date }]),
    );
    if (d.image) {
      f.append('documentImages', {
        uri: d.image.uri,
        name: d.image.fileName || 'document.jpg',
        type: d.image.type || 'image/jpeg',
      } as any);
      f.append('documentImageQuestionIds', q.id);
    }
    setSaving(q.id);
    try {
      await auditorApi.submitDocuments(projectId, f);
      await load();
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setSaving('');
    }
  };
  return (
    <View style={[s.screen, isDark && s.screenDark]}>
      <View style={[s.header, isDark && s.cardDark, {height: 66 + insets.top, paddingTop: insets.top}]}>
        <Pressable onPress={navigation.goBack} style={s.back}>
          <Feather name="arrow-left" size={20} color="#0754AD" />
          <Text style={s.backText}>Back</Text>
        </Pressable>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={[s.body, tablet && s.bodyTablet]}>
        <View style={[s.audit, isDark && s.auditDark]}>
          <Text style={[s.auditLabel, isDark && s.textDark]}>Audit Type</Text>
          <Text style={s.pill}>{audit?.auditType || 'Audit'}</Text>
        </View>
        <View style={[s.hero, isDark && s.heroDark]}>
          <Text style={[s.title, isDark && s.textDark]}>Audit Checklist</Text>
          <Text style={[s.subtitle, isDark && s.mutedDark]}>
            {current
              ? `Section ${current.number}: ${current.title}`
              : 'Select a checklist category'}
          </Text>
        </View>
        <View style={[s.categories, isDark && s.categoriesDark]}>
          <Text style={[s.cap, isDark && s.mutedDark]}>CATEGORIES</Text>
          <ScrollView horizontal>
            {cats.map((c, i) => (
              <Pressable
                key={c.id}
                onPress={() => setActive(c.id)}
                style={[s.tab, isDark && s.tabDark, active === c.id && s.tabOn]}
              >
                <Text style={[s.tabNo, isDark && s.textDark, active === c.id && s.blue]}>
                  {c.number || i + 1}
                </Text>
                <Text style={[s.tabText, isDark && s.mutedDark]}>Category</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        {busy ? (
          <ActivityIndicator style={s.loader} size="large" color="#0754AD" />
        ) : error ? (
          <Text style={s.error}>{error}</Text>
        ) : (
          current && (
            <>
              <View style={[s.catHead, isDark && s.catHeadDark]}>
                <View style={s.dark}>
                  <CategoryIcon width={18} height={18} />
                </View>
                <View>
                  <Text style={[s.catTitle, isDark && s.textDark]}>
                    {current.number} - {current.title}
                  </Text>
                  <Text style={[s.template, isDark && s.mutedDark]}>
                    {audit?.checklistTemplate?.name ||
                      audit?.checklistType ||
                      audit?.auditType}
                  </Text>
                </View>
              </View>
              <View style={s.counts}>
                <View style={s.countItem}>
                  <ThumbUpIcon width={14} height={14} />
                  <Text style={s.yes}>
                    {
                      qs.filter((q: any) => q.documentStatus === 'Approved')
                        .length
                    }
                  </Text>
                </View>
                <View style={s.countItem}>
                  <ThumbDownIcon width={14} height={14} />
                  <Text style={s.no}>
                    {
                      qs.filter((q: any) => q.documentStatus === 'Not Approved')
                        .length
                    }
                  </Text>
                </View>
                <View style={s.countItem}>
                  <NonApplicableIcon width={14} height={14} />
                  <Text>{qs.length}</Text>
                </View>
              </View>
              {current.children.map((section: any) => {
                const newKey = `new-${section.id}`;
                return (
                  <View key={section.id} style={s.section}>
                    <View style={s.sectionHead}>
                      <View style={s.green}>
                        <SubcategoryIcon width={17} height={17} />
                      </View>
                      <Text style={[s.sectionTitle, isDark && s.textDark]}>
                        {section.sectionNumber} - {section.title}
                      </Text>
                    </View>
                    {(section.questions || []).map((q: any) => {
                      const d = drafts[q.id] || {},
                        ok = q.documentStatus === 'Approved',
                        uri = d.image?.uri || q.documentImageUrl;
                      const added = isAuditorAdded(q);
                      const approval = approvalOf(q);
                      return (
                        <View
                          key={q.id}
                          style={[
                            s.card,
                            isDark && s.cardDarkTint,
                            ok && s.cardOk,
                            added && approval === 'Pending' && s.cardPending,
                            added && approval === 'Rejected' && s.cardRejected,
                          ]}
                        >
                          <View style={s.qrow}>
                            <Feather
                              name="file-text"
                              size={16}
                              color={ok ? '#079455' : '#D92D20'}
                            />
                            <View style={s.qTextWrap}>
                              <View style={s.qTitleRow}>
                                <Text style={[s.question, isDark && s.textDark]}>
                                  {q.questionNumber} - {q.text}
                                </Text>
                                {added && (
                                  <Text
                                    style={[
                                      s.statusBadge,
                                      approval === 'Rejected' && s.rejectedBadge,
                                    ]}
                                  >
                                    {approval}
                                  </Text>
                                )}
                              </View>
                              {added && approval === 'Pending' && (
                                <Text style={s.approvalHelp}>
                                  Waiting for admin approval.
                                </Text>
                              )}
                              {added && approval === 'Rejected' && (
                                <Text style={s.approvalRemark}>
                                  {q.approvalRemark ||
                                    'Rejected by admin. Edit and submit again.'}
                                </Text>
                              )}
                            </View>
                          </View>
                          {dateOf(q) && (
                            <View style={[s.chip, isDark && s.chipDark]}>
                              <Feather
                                name="calendar"
                                size={13}
                                color="#079455"
                              />
                              <Text style={isDark && s.textDark}>{nice(dateOf(q))}</Text>
                            </View>
                          )}
                          {uri && (
                            <Pressable
                              onPress={() => setPreview({
                                uri,
                                name: d.image?.fileName || q.documentImageName || 'Uploaded document',
                              })}
                              style={[s.chip, isDark && s.chipDark]}
                            >
                              <Feather name="eye" size={13} color="#079455" />
                              <Text numberOfLines={1} style={isDark && s.textDark}>
                                {d.image?.fileName || q.documentImageName}
                              </Text>
                            </Pressable>
                          )}
                          {q.documentImageUrl ? (
                            <View style={s.votes}>
                              <Pressable
                                onPress={() => setPreview({uri: q.documentImageUrl, name: q.documentImageName || 'Uploaded document'})}
                                style={[s.vote, ok && s.voteOk]}
                              >
                                <ThumbUpIcon width={16} height={16} />
                                <Text style={ok ? s.white : s.yes}>
                                  {ok ? 1 : 0}
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => navigation.navigate('ChecklistResponse', {
                                  auditId,
                                  projectId,
                                  documentFlow: true,
                                  question: q,
                                  responseType: 'NON_COMPLIANCE',
                                })}
                                style={[s.vote, !ok && s.voteNo]}
                              >
                                <ThumbDownIcon width={16} height={16} />
                                <Text style={!ok ? s.white : s.no}>
                                  {!ok ? 1 : 0}
                                </Text>
                              </Pressable>
                            </View>
                          ) : (
                            <View style={[s.form, isDark && s.formDark]}>
                              <TextInput
                                value={d.date || dateOf(q)}
                                onChangeText={date =>
                                  setDrafts(v => ({
                                    ...v,
                                    [q.id]: { ...v[q.id], date },
                                  }))
                                }
                                placeholder="YYYY-MM-DD"
                                style={[s.input, isDark && s.inputDark]}
                              />
                              <View style={s.formRow}>
                                <Pressable
                                  onPress={() => pick(q.id)}
                                  style={[s.file, isDark && s.inputDark]}
                                >
                                  <Feather name="image" color="#0754AD" />
                                  <Text numberOfLines={1} style={isDark && s.textDark}>
                                    {d.image?.fileName || 'Upload image'}
                                  </Text>
                                </Pressable>
                                <Pressable
                                  disabled={saving === q.id}
                                  onPress={() => submit(q)}
                                  style={[s.upload, saving === q.id && s.disabled]}
                                >
                                  {saving === q.id ? (
                                    <ActivityIndicator color="white" />
                                  ) : (
                                    <Feather name="upload" color="white" />
                                  )}
                                </Pressable>
                              </View>
                            </View>
                          )}
                          {!!q.documentRejectionRemark && (
                            <Text style={s.rejection}>{q.documentRejectionRemark}</Text>
                          )}
                        </View>
                      );
                    })}
                    <View style={[s.add, isDark && s.cardDark]}>
                      <Pressable
                        onPress={() =>
                          setExpanded(v => ({
                            ...v,
                            [section.id]: !v[section.id],
                          }))
                        }
                        style={s.addHead}
                      >
                        <View>
                          <Text style={[s.addTitle, isDark && s.textDark]}>Add Due-Date Question</Text>
                          <Text style={[s.addSub, isDark && s.mutedDark]}>
                            Click to add a new question
                          </Text>
                        </View>
                        <View style={s.plus}>
                          <Feather
                            name={expanded[section.id] ? 'x' : 'plus'}
                            color="white"
                            size={23}
                          />
                        </View>
                      </Pressable>
                      {expanded[section.id] && (
                        <View style={[s.form, isDark && s.formDark]}>
                          <TextInput
                            placeholder="Question"
                            value={drafts[newKey]?.text || ''}
                            onChangeText={text =>
                              setDrafts(v => ({
                                ...v,
                                [newKey]: { ...v[newKey], text },
                              }))
                            }
                            style={[s.input, isDark && s.inputDark]}
                          />
                          <TextInput
                            placeholder="Due date (YYYY-MM-DD)"
                            value={drafts[newKey]?.date || ''}
                            onChangeText={date =>
                              setDrafts(v => ({
                                ...v,
                                [newKey]: { ...v[newKey], date },
                              }))
                            }
                            style={[s.input, isDark && s.inputDark]}
                          />
                          <Pressable
                            onPress={() => pick(newKey)}
                            style={[s.file, isDark && s.inputDark]}
                          >
                            <Feather name="image" color="#0754AD" />
                            <Text style={isDark && s.textDark}>
                              {drafts[newKey]?.image?.fileName ||
                                'Upload image'}
                            </Text>
                          </Pressable>
                          <Text style={s.pendingText}>
                            New questions are submitted for admin approval.
                          </Text>
                          <Pressable
                            disabled={saving === newKey}
                            onPress={() => addQuestion(section)}
                            style={[s.addButton, saving === newKey && s.disabled]}
                          >
                            {saving === newKey ? (
                              <ActivityIndicator color="white" />
                            ) : (
                              <Feather name="plus-circle" size={17} color="white" />
                            )}
                            <Text style={s.addButtonText}>
                              {saving === newKey ? 'Adding...' : 'Add question'}
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </>
          )
        )}
        <View style={s.footer}>
          <Text style={s.footerTitle}>Audit Smartly</Text>
          <Text style={[s.footerSub, isDark && s.mutedDark]}>
            Keep your sites compliant and inspections on track
          </Text>
        </View>
      </ScrollView>
      <Modal transparent visible={!!preview} animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={s.previewBackdrop}>
          <Pressable onPress={() => setPreview(null)} style={[s.previewClose, {top: insets.top + 18}]}>
            <Feather name="x" size={23} color="white" />
          </Pressable>
          {preview && <Image source={{uri: preview.uri}} resizeMode="contain" style={s.previewImage} />}
          <Text numberOfLines={2} style={s.previewName}>{preview?.name}</Text>
        </View>
      </Modal>
    </View>
  );
}
function TextInput(props: React.ComponentProps<typeof RNTextInput>) {
  const {isDark} = useAppTheme();
  const dateInput =
    String(props.placeholder || '')
      .toLowerCase()
      .includes('date') || String(props.placeholder || '').includes('YYYY');
  const [open, setOpen] = useState(false);
  if (!dateInput) return <RNTextInput placeholderTextColor={isDark ? '#6B7280' : undefined} {...props} />;
  const text = typeof props.value === 'string' ? props.value : '';
  const parsed = new Date(
    `${text || new Date().toISOString().slice(0, 10)}T00:00:00`,
  );
  const value = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        style={[props.style, s.dateSelect]}
      >
        <Text style={[text ? s.dateValue : s.datePlaceholder, isDark && s.textDark]}>
          {text ? nice(text) : 'Select date'}
        </Text>
        <Feather name="calendar" size={18} color="#0754AD" />
      </Pressable>
      {open && (
        <View style={[s.pickerWrap, isDark && s.formDark]}>
          <DateTimePicker
            value={value}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selected) => {
              if (Platform.OS === 'android') setOpen(false);
              if (event.type === 'set' && selected)
                props.onChangeText?.(selected.toISOString().slice(0, 10));
            }}
          />
          {Platform.OS === 'ios' && (
            <Pressable onPress={() => setOpen(false)} style={s.done}>
              <Text style={s.doneText}>Done</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F7F8' },
  screenDark: { backgroundColor: '#111827' },
  textDark: { color: '#F8FAFC' },
  mutedDark: { color: '#9CA3AF' },
  cardDark: { backgroundColor: '#1F2937' },
  cardDarkTint: { backgroundColor: '#1E2530', borderColor: '#374151' },
  scroll: { flex: 1 },
  header: {
    height: 66,
    backgroundColor: 'white',
    elevation: 3,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  back: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  backText: { color: '#0754AD', fontSize: 17 },
  body: { paddingBottom: 40, width: '100%', maxWidth: 720, alignSelf: 'center' },
  bodyTablet: { maxWidth: 940 },
  audit: {
    height: 74,
    paddingHorizontal: 20,
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#D5D8DE',
  },
  auditDark: { backgroundColor: '#1F2937', borderColor: '#374151' },
  auditLabel: { fontSize: 17, fontWeight: '700' },
  pill: {
    backgroundColor: '#C8E2FF',
    borderWidth: 1,
    borderColor: '#70B8E4',
    color: '#06449D',
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  hero: { padding: 20, borderBottomWidth: 1, borderColor: '#E1E3E7' },
  heroDark: { borderColor: '#374151' },
  title: { fontSize: 27, fontWeight: '700' },
  subtitle: { fontSize: 14, marginTop: 7 },
  categories: {
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderColor: '#CBD0DA',
  },
  categoriesDark: { backgroundColor: '#111827', borderColor: '#374151' },
  cap: { fontSize: 11, padding: 20, paddingVertical: 13 },
  tab: {
    width: 98,
    height: 112,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderColor: '#CBD0DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabDark: { borderColor: '#374151' },
  tabOn: { backgroundColor: '#F0F1FF' },
  tabNo: { fontSize: 29, fontWeight: '700' },
  blue: { color: '#0648A8' },
  tabText: { fontSize: 11, marginTop: 12 },
  loader: { marginTop: 60 },
  error: { padding: 25, color: '#B42318' },
  catHead: {
    padding: 20,
    backgroundColor: '#DCEBFC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  catHeadDark: { backgroundColor: '#1E293B' },
  dark: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: '#343F4D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catTitle: { fontSize: 15, fontWeight: '600' },
  template: { fontSize: 12, marginTop: 6 },
  counts: { flexDirection: 'row', gap: 25, padding: 22 },
  countItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  yes: { color: '#079455' },
  no: { color: '#D92D20' },
  section: { paddingHorizontal: 28, paddingBottom: 20 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  green: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#03A94F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', flex: 1 },
  card: {
    marginLeft: 54,
    borderWidth: 1,
    borderColor: '#F1D2CB',
    backgroundColor: '#FFF8F4',
    padding: 14,
    borderRadius: 11,
    marginBottom: 12,
  },
  cardOk: { borderColor: '#CBEFDC', backgroundColor: '#F0FBF6' },
  cardPending: { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
  cardRejected: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  qrow: { flexDirection: 'row', gap: 8 },
  qTextWrap: { flex: 1 },
  qTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  question: { flex: 1, fontSize: 12, lineHeight: 20 },
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
  approvalHelp: { fontSize: 10, color: '#B45309', marginTop: 5 },
  approvalRemark: {
    marginTop: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    color: '#B91C1C',
    fontSize: 11,
    lineHeight: 16,
  },
  chip: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 8,
    marginTop: 9,
    flexDirection: 'row',
    gap: 6,
  },
  chipDark: { backgroundColor: '#111827' },
  preview: { height: 150, width: '100%', borderRadius: 8, marginTop: 9 },
  votes: { flexDirection: 'row', gap: 10, marginTop: 11 },
  vote: {
    height: 36,
    minWidth: 55,
    borderRadius: 18,
    backgroundColor: 'white',
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteOk: { backgroundColor: '#03A94F' },
  voteNo: { backgroundColor: '#E5484D' },
  white: { color: 'white' },
  form: { padding: 11, gap: 9, backgroundColor: 'white', marginTop: 10 },
  formDark: { backgroundColor: '#111827' },
  input: {
    height: 43,
    borderWidth: 1,
    borderColor: '#CFD4DC',
    borderRadius: 8,
    paddingHorizontal: 11,
  },
  inputDark: { backgroundColor: '#1F2937', borderColor: '#374151', color: '#F8FAFC' },
  dateSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateValue: { color: '#20242A' },
  datePlaceholder: { color: '#8A94A3' },
  pickerWrap: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D7DCE3',
    borderRadius: 9,
    marginTop: 6,
    overflow: 'hidden',
  },
  done: {
    height: 40,
    backgroundColor: '#0754AD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { color: 'white', fontWeight: '700' },
  formRow: { flexDirection: 'row', gap: 8 },
  file: {
    height: 43,
    flex: 1,
    borderWidth: 1,
    borderColor: '#CFD4DC',
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
  },
  upload: {
    width: 44,
    height: 43,
    borderRadius: 8,
    backgroundColor: '#164BE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    marginLeft: 54,
    borderWidth: 1,
    borderColor: '#E0E3E8',
    borderRadius: 14,
    backgroundColor: 'white',
    overflow: 'hidden',
  },
  addHead: {
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addTitle: { fontSize: 15, fontWeight: '700' },
  addSub: { fontSize: 12, color: '#667085', marginTop: 5 },
  plus: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#164BE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingText: { fontSize: 11, color: '#B56A00' },
  addButton: {
    height: 44,
    borderRadius: 9,
    backgroundColor: '#164BE8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addButtonText: {color: 'white', fontSize: 13, fontWeight: '700'},
  disabled: {opacity: 0.5},
  rejection: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#FFF0F0',
    color: '#B42318',
    fontSize: 12,
    lineHeight: 18,
  },
  previewBackdrop: {
    flex: 1,
    padding: 18,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewClose: {
    position: 'absolute',
    zIndex: 2,
    top: 45,
    right: 18,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {width: '100%', height: '78%'},
  previewName: {marginTop: 12, color: 'white', fontSize: 12, textAlign: 'center'},
  footer: { alignItems: 'center', paddingTop: 48 },
  footerTitle: { color: '#5046EF', fontSize: 18, fontWeight: '800' },
  footerSub: { color: '#98A2B3', marginTop: 9, textAlign: 'center' },
});
