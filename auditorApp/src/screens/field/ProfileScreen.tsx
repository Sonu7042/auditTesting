import React, {useState} from 'react';
import {Image, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {launchCamera} from 'react-native-image-picker';
import {fieldApi} from '../../api/field.api';
import {IdCard} from '../../types/field';
import {Badge, Button, Card, ChoiceButton, ErrorBox, Field, Loading, Screen} from '../../ui/kit';
import {c, mono} from '../../ui/theme';
import {useLoad} from '../../ui/useLoad';
import {askCamera} from '../../utils/camera';
import {downloadAndShare, MIME} from '../../utils/files';
import {daysUntil, fmtDate} from '../../utils/field';
import {StackProps} from '../../navigation/fieldTypes';

const SKILL: Record<string, string> = {INFRASTRUCTURE: 'Infrastructure', FIRE_SAFETY: 'Fire and life safety', ELECTRICAL: 'Electrical', THERMOGRAPHY: 'Thermography'};
const FIELDS: Array<{key: string; label: string}> = [
  {key: 'phone', label: 'Phone'},
  {key: 'emergencyContact', label: 'Emergency contact'},
  {key: 'baseLocation', label: 'Base location'},
  {key: 'fullName', label: 'Name'},
  {key: 'photo', label: 'Photo'},
];
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function ProfileScreen({navigation}: StackProps<'Profile'>) {
  const {data, error, loading, refresh, reload} = useLoad(async () => {
    const [profile, id] = await Promise.all([fieldApi.profile(), fieldApi.idCard().catch(() => null)]);
    return {profile, id};
  }, []);
  const [back, setBack] = useState(false);
  const [busy, setBusy] = useState('');
  const [fileError, setFileError] = useState('');
  const [asking, setAsking] = useState(false);

  if (loading && !data) return <Screen title="My profile and ID card" onBack={navigation.goBack}><Loading /></Screen>;
  if (!data) return <Screen title="My profile and ID card" onBack={navigation.goBack}><ErrorBox message={error} onRetry={refresh} /></Screen>;

  const card = data.profile.card;
  const approved = card.status === 'APPROVED' && !!card.auditorCode;
  const days = card.certificationExpiresAt ? daysUntil(card.certificationExpiresAt) : null;
  const pendingRequest = data.profile.requests.find(r => r.status === 'PENDING');
  const lastDecided = data.profile.requests.find(r => r.status !== 'PENDING');

  const pdf = async (kind: 'letter' | 'cert') => {
    setBusy(kind);
    setFileError('');
    try {
      if (kind === 'letter') await downloadAndShare('/auditor-onboarding/me/authority-letter/pdf', `${card.auditorCode}-authority-letter.pdf`, MIME.pdf);
      else await downloadAndShare('/auditor-onboarding/me/certificate/pdf', `${card.auditorCode}-certificate.pdf`, MIME.pdf);
    } catch (e) {
      setFileError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <Screen title="My profile and ID card" onBack={navigation.goBack} onRefresh={refresh}>
      {approved ? (
        <>
          <Pressable onPress={() => setBack(v => !v)} accessibilityHint="Flips the card">
            {back ? <CardBack card={card} qr={data.id?.qr} url={data.id?.verifyUrl} /> : <CardFront card={card} />}
          </Pressable>
          <Text style={st.hint}>Tap the card to flip it. The back shows the verification QR code.</Text>
          <View style={st.row}>
            <Button label="Authority letter" variant="secondary" small style={{flex: 1}} loading={busy === 'letter'} onPress={() => pdf('letter')} />
            <Button label="Training certificate" variant="secondary" small style={{flex: 1}} loading={busy === 'cert'} onPress={() => pdf('cert')} />
          </View>
          {!!fileError && <ErrorBox message={fileError} />}
        </>
      ) : (
        <Card tone="blue" style={{gap: 6}}>
          <Text style={st.blueTitle}>Your ID card is issued once you are approved</Text>
          <Text style={st.blueText}>Finish the training, quiz and demo checklist. Back-Admin then reviews and approves you.</Text>
          <Button small variant="secondary" label="Open training" onPress={() => navigation.navigate('Training')} />
        </Card>
      )}

      <Card style={{paddingVertical: 4}}>
        <Detail label="Username" value={data.profile.username} mono />
        <Detail label="Phone" value={card.phone} />
        <Detail label="Base location" value={card.baseLocation} />
        <Detail label="Emergency contact" value={card.emergencyContact} />
        <Detail label="Supported regions" value={card.regions.map(title).join(', ')} />
        <Detail label="Skills" value={card.skills.map(s => SKILL[s] || s).join(', ')} last />
        <View style={st.askRow}>
          {pendingRequest ? (
            <Text style={st.muted}>Change request sent on {fmtDate(pendingRequest.createdAt)}. Back-Admin will decide.</Text>
          ) : (
            <Text style={st.ask} onPress={() => setAsking(true)}>
              Ask Back-Admin to change a detail or photo
            </Text>
          )}
          {!pendingRequest && lastDecided && (
            <Text style={st.muted}>
              Last request {lastDecided.status === 'APPROVED' ? 'approved' : `declined${lastDecided.remarks ? `: ${lastDecided.remarks}` : ''}`}.
            </Text>
          )}
        </View>
      </Card>

      {days != null && (
        <Card tone={days <= 30 ? 'amber' : 'green'}>
          <Text style={[st.valid, days <= 30 && {color: c.amber}]}>
            <Text style={{fontWeight: '800'}}>{days < 0 ? 'Your certificate has ended.' : `Valid for ${days} more day${days === 1 ? '' : 's'}.`}</Text> The refresher opens 30 days before your certificate ends. After it ends you cannot be planned for audits.
          </Text>
        </Card>
      )}

      <ChangeRequest visible={asking} onClose={() => setAsking(false)} onSent={() => {
        setAsking(false);
        reload();
      }} />
    </Screen>
  );
}

function CardFront({card}: {card: IdCard}) {
  const initials = card.fullName.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View style={st.id}>
      <View style={st.idTop}>
        <Text style={st.idBrand}>BEXEX GLOBAL</Text>
        <Text style={st.idRole}>AUTHORISED FIELD AUDITOR</Text>
      </View>
      <View style={st.idBody}>
        <View style={st.idPhoto}>{card.photoUrl ? <Image source={{uri: card.photoUrl}} style={StyleSheet.absoluteFill} /> : <Text style={st.idInitials}>{initials}</Text>}</View>
        <View style={{flex: 1, gap: 4}}>
          <Text style={st.idName}>{card.fullName}</Text>
          <Text style={st.idCode}>{card.auditorCode}</Text>
          <Text style={st.idSkills}>{card.skills.map(s => SKILL[s] || s).join(', ')}</Text>
          <View style={st.idDates}>
            <View>
              <Text style={st.idDateLabel}>ISSUED</Text>
              <Text style={st.idDate}>{fmtDate(card.idIssuedAt || card.approvedAt)}</Text>
            </View>
            <View>
              <Text style={st.idDateLabel}>VALID TILL</Text>
              <Text style={st.idDate}>{fmtDate(card.certificationExpiresAt) || '—'}</Text>
            </View>
          </View>
        </View>
      </View>
      <View style={st.idStripe} />
    </View>
  );
}

function CardBack({card, qr, url}: {card: IdCard; qr?: string; url?: string}) {
  return (
    <View style={[st.id, st.idBack]}>
      {qr ? <Image source={{uri: qr}} style={st.qr} /> : <Text style={st.muted}>QR not available</Text>}
      <View style={{flex: 1, gap: 6}}>
        <Text style={st.idName}>Scan to verify</Text>
        <Text style={st.muted}>Anyone can scan this to confirm {card.fullName.split(' ')[0]} is an active Bexex auditor.</Text>
        {!!url && <Text style={st.url} numberOfLines={2}>{url}</Text>}
        {!!card.authorityLetterNumber && <Text style={st.url}>Letter {card.authorityLetterNumber}</Text>}
      </View>
    </View>
  );
}

function Detail({label, value, mono: isMono, last}: {label: string; value?: string | null; mono?: boolean; last?: boolean}) {
  return (
    <View style={[st.detail, !last && st.line]}>
      <Text style={st.detailLabel}>{label}</Text>
      <Text style={[st.detailValue, isMono && {fontFamily: mono, fontSize: 13}]}>{value || '—'}</Text>
    </View>
  );
}

function ChangeRequest({visible, onClose, onSent}: {visible: boolean; onClose: () => void; onSent: () => void}) {
  const [field, setField] = useState('phone');
  const [value, setValue] = useState('');
  const [photo, setPhoto] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const shoot = async () => {
    setError('');
    if (!(await askCamera())) return setError('Camera permission is needed.');
    const r = await launchCamera({mediaType: 'photo', cameraType: 'front', includeBase64: true, maxWidth: 480, maxHeight: 600, quality: 0.6, saveToPhotos: false});
    const a = r.assets?.[0];
    if (a?.base64) setPhoto(`data:${a.type === 'image/png' ? 'image/png' : 'image/jpeg'};base64,${a.base64}`);
  };
  const send = async () => {
    setBusy(true);
    setError('');
    try {
      await fieldApi.requestChange({[field]: field === 'photo' ? photo : value.trim()}, reason.trim());
      setValue('');
      setPhoto('');
      setReason('');
      onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ready = (field === 'photo' ? !!photo : !!value.trim()) && reason.trim().length >= 5;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen title="Ask for a change" onBack={onClose} closeIcon footer={<Button label="Send to Back-Admin" onPress={send} loading={busy} disabled={!ready} />}>
        <Text style={st.muted}>Back-Admin checks the change and updates your card. You get a notification with the decision.</Text>
        <Text style={st.label}>What should change?</Text>
        <View style={st.grid}>
          {FIELDS.map(f => (
            <ChoiceButton key={f.key} small label={f.label} selected={field === f.key} onPress={() => setField(f.key)} style={st.cell} />
          ))}
        </View>
        {field === 'photo' ? (
          <View style={st.photoRow}>
            <View style={st.idPhoto}>{photo ? <Image source={{uri: photo}} style={StyleSheet.absoluteFill} /> : <Text style={st.muted}>No photo</Text>}</View>
            <Button small variant="secondary" icon="camera" label={photo ? 'Retake' : 'Take a photo'} onPress={shoot} style={{flex: 1}} />
          </View>
        ) : (
          <Field label="New value" value={value} onChangeText={setValue} keyboardType={field === 'phone' || field === 'emergencyContact' ? 'phone-pad' : 'default'} />
        )}
        <Field label="Why the change is needed" required value={reason} onChangeText={setReason} multiline placeholder="For example: new phone number" />
        {!!error && <ErrorBox message={error} />}
        <Badge label="One request at a time" tone="gray" />
      </Screen>
    </Modal>
  );
}

const st = StyleSheet.create({
  row: {flexDirection: 'row', gap: 10},
  hint: {fontSize: 12.5, color: c.muted, textAlign: 'center'},
  id: {backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.line, overflow: 'hidden', minHeight: 210},
  idTop: {backgroundColor: c.navy, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12},
  idBrand: {color: '#FFFFFF', fontWeight: '800', letterSpacing: 2, fontSize: 14},
  idRole: {color: '#C6D2E3', fontSize: 10.5, letterSpacing: 1.2},
  idBody: {flexDirection: 'row', gap: 14, padding: 16},
  idPhoto: {width: 92, height: 110, borderRadius: 10, borderWidth: 2, borderColor: c.navy, backgroundColor: '#E8ECEF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'},
  idInitials: {fontSize: 28, fontWeight: '800', color: c.navy},
  idName: {fontSize: 19, fontWeight: '800', color: c.text},
  idCode: {fontFamily: mono, fontSize: 13, color: c.green},
  idSkills: {fontSize: 13, color: c.muted},
  idDates: {flexDirection: 'row', gap: 22, marginTop: 6},
  idDateLabel: {fontSize: 10, letterSpacing: 1, color: c.muted},
  idDate: {fontSize: 13.5, fontWeight: '700', color: c.text},
  idStripe: {height: 7, backgroundColor: c.green, marginTop: 'auto'},
  idBack: {flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18},
  qr: {width: 140, height: 140},
  url: {fontFamily: mono, fontSize: 11, color: c.muted},
  muted: {fontSize: 13, color: c.muted, lineHeight: 18},
  blueTitle: {fontSize: 15, fontWeight: '800', color: c.blue},
  blueText: {fontSize: 13.5, color: c.blue, lineHeight: 19},
  detail: {flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12},
  line: {borderBottomWidth: 1, borderBottomColor: c.line},
  detailLabel: {fontSize: 14, color: c.muted},
  detailValue: {flex: 1, fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right'},
  askRow: {borderTopWidth: 1, borderTopColor: c.line, paddingVertical: 12, gap: 4},
  ask: {color: c.green, fontWeight: '700', fontSize: 14},
  valid: {fontSize: 13.5, color: c.greenDark, lineHeight: 19},
  label: {fontSize: 13, fontWeight: '700', color: c.text},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  cell: {flexBasis: '30%', flexGrow: 1},
  photoRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
});
