import React from 'react';
import {Linking, Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import {fieldApi} from '../../api/field.api';
import {useAuth} from '../../store/AuthContext';
import {Badge, Button, Card, ErrorBox, Icon, Loading, Mono, Screen} from '../../ui/kit';
import {c, mono} from '../../ui/theme';
import {useLoad} from '../../ui/useLoad';
import {checkInOpensAt, DISCIPLINE, facilityName, facilityTier, fmtDay, fmtTime, inCheckInWindow, jobPhase, partnerOf, sameDay, TRACK_DISCIPLINES, trackLabel, trackOf} from '../../utils/field';
import {StackProps} from '../../navigation/fieldTypes';

export function BriefingScreen({navigation, route}: StackProps<'Briefing'>) {
  const {user} = useAuth();
  const uid = user?.id;
  const {data, error, loading, refresh} = useLoad(async () => {
    const job = (await fieldApi.jobs()).find(j => j.id === route.params.jobId);
    if (!job) throw new Error('This audit is no longer assigned to you.');
    return job;
  }, [route.params.jobId]);

  if (loading && !data) return <Screen title="Audit briefing" onBack={navigation.goBack}><Loading /></Screen>;
  if (!data) return <Screen title="Audit briefing" onBack={navigation.goBack}><ErrorBox message={error} onRetry={refresh} /></Screen>;

  const job = data;
  const loc = job.location;
  const track = trackOf(job, uid);
  const partner = partnerOf(job, uid);
  const phase = jobPhase(job, uid);
  const open = inCheckInWindow(job);
  const tier = facilityTier(job);
  const mine = TRACK_DISCIPLINES[track] || [];
  const others = (TRACK_DISCIPLINES.ALL || []).filter(d => !mine.includes(d));
  const when = `${sameDay(job.scheduledStart, new Date()) ? 'Today' : fmtDay(job.scheduledStart)}, ${fmtTime(job.scheduledStart)} to ${fmtTime(job.scheduledEnd)}`;
  const openMap = () => {
    const q = `${loc.latitude},${loc.longitude}`;
    Linking.openURL(Platform.OS === 'ios' ? `maps:0,0?q=${q}` : `geo:${q}?q=${q}(${encodeURIComponent(loc.dealerName)})`).catch(() => Linking.openURL(`https://maps.google.com/?q=${q}`));
  };

  const footer =
    phase === 'IN_PROGRESS' ? (
      <Button label="Resume audit" onPress={() => navigation.replace('AuditOverview', {jobId: job.id})} />
    ) : phase === 'DONE' ? (
      <Text style={st.caption}>You have submitted this audit.</Text>
    ) : (
      <>
        <Button label="Check in" disabled={!open || phase === 'MISSED'} onPress={() => navigation.navigate('CheckIn', {jobId: job.id})} />
        <Text style={st.caption}>
          {phase === 'MISSED' ? 'The check-in window for this audit has closed. Contact Back-Admin.' : open ? 'You must be at the site to check in.' : `Check-in opens at ${fmtTime(checkInOpensAt(job))}${sameDay(checkInOpensAt(job), new Date()) ? '' : ` on ${fmtDay(checkInOpensAt(job))}`} and needs you to be at the site.`}
        </Text>
      </>
    );

  return (
    <Screen title="Audit briefing" onBack={navigation.goBack} footer={footer}>
      <Card style={st.siteCard}>
        <Pressable onPress={openMap} style={st.map} accessibilityLabel="Open the site in maps">
          <Icon name="map-pin" size={34} color={c.green} />
          <View style={st.radius}>
            <Text style={st.radiusText}>{loc.geofenceRadiusM} m check-in radius</Text>
          </View>
        </Pressable>
        <View style={st.siteBody}>
          <Text style={st.dealer}>{loc.dealerName}</Text>
          <Mono style={st.meta}>{[loc.regionalOffice || loc.zone, loc.sapCode ? `SAP ${loc.sapCode}` : loc.locationCode, loc.address].filter(Boolean).join(' · ')}</Mono>
          <View style={st.tags}>
            <Badge label={[facilityName(job), tier].filter(Boolean).join(' · ')} tone="dark" style={st.tag} />
            <Badge label={when} tone="gray" style={st.tag} />
          </View>
          {!!loc.contactName && (
            <View style={st.contact}>
              <View style={{flex: 1}}>
                <Text style={st.small}>Dealer contact</Text>
                <Text style={st.contactName}>
                  {loc.contactName}
                  {loc.contactPhone ? ` · ${loc.contactPhone}` : ''}
                </Text>
              </View>
              {!!loc.contactPhone && <Button label="Call" small variant="secondary" style={{minWidth: 76}} onPress={() => Linking.openURL(`tel:${loc.contactPhone}`)} />}
            </View>
          )}
        </View>
      </Card>

      <Card style={{gap: 10}}>
        <View style={st.scopeHead}>
          <Text style={st.h3}>Your scope: {trackLabel(track)}</Text>
          <Mono>{job.snapshot.checklistName}</Mono>
        </View>
        {mine.map(d => (
          <View key={d} style={st.scopeRow}>
            <Text style={st.scopeName}>{DISCIPLINE[d]}</Text>
            <Badge label="Yours" tone="green" style={st.tag} />
          </View>
        ))}
        {job.includesShared && (
          <View style={st.scopeRow}>
            <Text style={st.scopeName}>Shared site items</Text>
            <Badge label="In this audit" tone="blue" style={st.tag} />
          </View>
        )}
        <Text style={st.note}>
          {partner && others.length && track !== 'ALL'
            ? `${others.map(d => DISCIPLINE[d]).join(' and ')} are audited by ${partner.auditor.fullName} (Track ${partner.track}). `
            : ''}
          {job.includesShared
            ? `Shared items (main panel, DG, transformer) are audited once, in this ${facilityName(job).toLowerCase()} audit.`
            : 'Shared site items are audited in another facility audit at this site.'}
        </Text>
      </Card>

      <Card style={{gap: 8}}>
        <Text style={st.h3}>Before you go</Text>
        <Text style={st.bullet}>• Carry your ID card and authority letter (More → Profile and ID card).</Text>
        <Text style={st.bullet}>• Check your instruments are within their calibration date.</Text>
        <Text style={st.bullet}>• Photos are taken in the app only. Gallery photos are not accepted.</Text>
        <Text style={st.bullet}>• Checklist {job.snapshot.checklistName} v{job.snapshot.checklistVersion} is fixed for this audit.</Text>
      </Card>
    </Screen>
  );
}

const st = StyleSheet.create({
  siteCard: {padding: 0, overflow: 'hidden'},
  map: {height: 130, backgroundColor: '#DCE8DF', alignItems: 'center', justifyContent: 'center'},
  radius: {position: 'absolute', right: 10, bottom: 10, backgroundColor: '#FFFFFF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4},
  radiusText: {fontFamily: mono, fontSize: 11.5, color: c.green, fontWeight: '700'},
  siteBody: {padding: 16, gap: 8},
  dealer: {fontSize: 20, fontWeight: '800', color: c.text},
  meta: {fontSize: 12.5},
  tags: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  tag: {borderRadius: 6},
  contact: {flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12, marginTop: 4},
  small: {fontSize: 12.5, color: c.muted},
  contactName: {fontSize: 15, fontWeight: '700', color: c.text, marginTop: 2},
  scopeHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8},
  h3: {fontSize: 16, fontWeight: '800', color: c.text},
  scopeRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  scopeName: {fontSize: 15, color: c.text},
  note: {fontSize: 13, color: c.muted, lineHeight: 19},
  bullet: {fontSize: 13.5, color: c.text, lineHeight: 20},
  caption: {fontSize: 12.5, color: c.muted, textAlign: 'center'},
});
