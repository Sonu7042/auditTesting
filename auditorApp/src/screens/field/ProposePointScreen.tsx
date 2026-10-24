import React, {useMemo, useState} from 'react';
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native';
import {fieldApi} from '../../api/field.api';
import {Button, ChoiceButton, ErrorBox, Field, Icon, Screen} from '../../ui/kit';
import {c} from '../../ui/theme';
import {DISCIPLINE, facilityName} from '../../utils/field';
import {StackProps} from '../../navigation/fieldTypes';
import {useSession} from './useSession';

const TYPES = ['INFRASTRUCTURE', 'FIRE', 'ELECTRICAL', 'THERMOGRAPHY'];
const LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const NEW = '__new__';

export function ProposePointScreen({navigation, route}: StackProps<'ProposePoint'>) {
  const {jobId} = route.params;
  const {flat, session} = useSession(jobId);
  const [discipline, setDiscipline] = useState(route.params.discipline && TYPES.includes(route.params.discipline) ? route.params.discipline : 'INFRASTRUCTURE');
  const [section, setSection] = useState(route.params.sectionName || '');
  const [newSection, setNewSection] = useState('');
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [severity, setSeverity] = useState('MEDIUM');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sections = useMemo(() => [...new Set(flat.filter(q => q.discipline === discipline).map(q => q.sectionName))], [flat, discipline]);
  const sectionName = section === NEW ? newSection.trim() : section;
  const facility = session ? facilityName(session.job as any).toLowerCase() : 'site';
  const ready = !!text.trim() && !!reason.trim() && !!sectionName;

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fieldApi.propose({jobId, discipline, sectionName, questionText: text.trim(), reason: reason.trim(), severity});
      Alert.alert('Sent for review', res.message, [{text: 'OK', onPress: navigation.goBack}]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Propose a new point" onBack={navigation.goBack} closeIcon footer={<Button label="Send for review" onPress={send} disabled={!ready} loading={busy} />}>
      <Text style={st.lead}>Saw something the checklist does not cover? Propose it. Back-Admin reviews it, then the SGS Manager signs off. Approved points apply to future audits only, never to this one.</Text>

      <Text style={st.label}>Audit type</Text>
      <View style={st.grid}>
        {TYPES.map(t => (
          <ChoiceButton
            key={t}
            small
            label={DISCIPLINE[t]}
            selected={discipline === t}
            onPress={() => {
              setDiscipline(t);
              setSection('');
            }}
            style={st.cell}
          />
        ))}
      </View>

      <Text style={st.label}>Section</Text>
      <Pressable onPress={() => setOpen(v => !v)} style={st.select}>
        <Text style={[st.selectText, !section && {color: c.faint}]}>{section === NEW ? 'New section' : section || 'Choose a section'}</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={c.muted} />
      </Pressable>
      {open && (
        <View style={st.options}>
          {[...sections, NEW].map(o => (
            <Pressable
              key={o}
              onPress={() => {
                setSection(o);
                setOpen(false);
              }}
              style={[st.option, section === o && {backgroundColor: c.greenSoft}]}>
              <Text style={[st.optionText, o === NEW && {color: c.green, fontWeight: '700'}]}>{o === NEW ? '+ New section' : o}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {section === NEW && <Field value={newSection} onChangeText={setNewSection} placeholder="Name of the new section" />}

      <Field label="The point, as a check" required value={text} onChangeText={setText} multiline placeholder="For example: EV charging bay has a CO2 or ABC extinguisher within 5 m." />
      <Field label="Why it matters" required value={reason} onChangeText={setReason} multiline placeholder="What you saw that the checklist does not cover" />

      <Text style={st.label}>If it fails, how serious?</Text>
      <View style={st.row}>
        {LEVELS.map(l => (
          <ChoiceButton key={l} small label={l[0] + l.slice(1).toLowerCase()} selected={severity === l} onPress={() => setSeverity(l)} />
        ))}
      </View>

      <Text style={st.label}>Suggest where it applies</Text>
      <View style={st.reach}>
        <Text style={st.reachText}>All {facility}s of the same tier</Text>
        <Text style={st.reachDefault}>Default</Text>
      </View>
      <Text style={st.note}>The SGS Manager can widen or narrow this when signing off.</Text>
      {!!error && <ErrorBox message={error} />}
    </Screen>
  );
}

const st = StyleSheet.create({
  lead: {fontSize: 14, color: c.muted, lineHeight: 20},
  label: {fontSize: 13, fontWeight: '700', color: c.text, marginTop: 4},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  cell: {flexBasis: '48%', flexGrow: 1},
  select: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: c.lineStrong, borderRadius: 12, backgroundColor: c.surface, paddingHorizontal: 13, minHeight: 50},
  selectText: {fontSize: 15, color: c.text},
  options: {borderWidth: 1, borderColor: c.line, borderRadius: 12, backgroundColor: c.surface, overflow: 'hidden'},
  option: {paddingHorizontal: 13, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line},
  optionText: {fontSize: 14.5, color: c.text},
  row: {flexDirection: 'row', gap: 8},
  reach: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: c.line, borderRadius: 12, backgroundColor: c.surface, paddingHorizontal: 13, paddingVertical: 13},
  reachText: {fontSize: 14.5, color: c.text, flex: 1},
  reachDefault: {fontSize: 13, color: c.green, fontWeight: '700'},
  note: {fontSize: 12.5, color: c.muted},
});
