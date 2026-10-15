import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Feather from '../../components/common/AppIcon';
import {auditorApi} from '../../api/auditor.api';
import {PreviousNcReviewList} from '../../components/common/PreviousNcReviewList';
import {AuditorStackParamList} from '../../navigation/navigationTypes';
import {PreviousNC} from '../../types/domain';
import {getSectionKeyForReview, isUnresolved, sectionTitle} from '../../utils/previousNcReviews';
import {useAppTheme} from '../../store/ThemeContext';

type Props = NativeStackScreenProps<AuditorStackParamList, 'PreviousNcReview'>;

export function PreviousNcReviewScreen({navigation, route}: Props) {
  const {isDark} = useAppTheme();
  const insets = useSafeAreaInsets();
  const {width} = useWindowDimensions();
  const tablet = width >= 768;
  const {auditId, sectionKey, returnScreen, returnParams} = route.params;
  const [reviews, setReviews] = useState<PreviousNC[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const all = await auditorApi.previousNcReviews(auditId);
      setReviews(
        all.filter(review => isUnresolved(review) && getSectionKeyForReview(review) === sectionKey),
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }, [auditId, sectionKey]);

  useEffect(() => {
    load();
  }, [load]);

  const handleClosed = (reviewId: string) =>
    setReviews(current => current.filter(review => review.id !== reviewId));

  const resolved = reviews.length === 0;

  const proceed = () => {
    if (busy) return;
    navigation.replace(returnScreen as any, returnParams);
  };

  return (
    <View style={[s.screen, isDark && s.screenDark]}>
      <View style={[s.header, isDark && s.headerDark, {height: 68 + insets.top, paddingTop: insets.top}]}>
        <Pressable onPress={() => navigation.goBack()} style={s.back}>
          <Feather name="chevron-left" size={22} color="#064AAB" />
          <Text style={s.backText}>Back</Text>
        </Pressable>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={[s.body, tablet && s.bodyTablet]}>
        <Text style={[s.title, tablet && s.titleTablet, isDark && s.textDark]}>Review Previous {sectionTitle(sectionKey)} Non-Compliances</Text>
        <Text style={[s.subtitle, isDark && s.mutedDark]}>
          These are carried forward from previous audit cycles. Close any you have resolved, or
          continue without closing — items left open automatically carry forward to the next
          cycle.
        </Text>
        {busy ? (
          <ActivityIndicator style={s.loader} color="#0754AD" size="large" />
        ) : error ? (
          <Pressable onPress={load} style={s.error}>
            <Text style={s.errorText}>{error}{'\n'}Tap to retry</Text>
          </Pressable>
        ) : resolved ? (
          <View style={[s.empty, isDark && s.cardDark]}>
            <Feather name="check-circle" size={34} color="#00875A" />
            <Text style={[s.emptyText, isDark && s.textDark]}>All previous non-compliances for this section are closed.</Text>
          </View>
        ) : (
          <PreviousNcReviewList reviews={reviews} auditId={auditId} onClosed={handleClosed} />
        )}
      </ScrollView>
      <View style={[s.footer, isDark && s.footerDark, {paddingBottom: insets.bottom + 18}]}>
        <Pressable disabled={busy} onPress={proceed} style={[s.continueButton, tablet && s.continueButtonTablet, busy && s.disabled]}>
          <Text style={s.continueText}>
            {resolved
              ? `Continue to ${sectionTitle(sectionKey)}`
              : `Continue to ${sectionTitle(sectionKey)} (${reviews.length} left open)`}
          </Text>
          <Feather name="arrow-right" size={18} color="white" />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#F4F4F4'},
  screenDark: {backgroundColor: '#111827'},
  textDark: {color: '#F8FAFC'},
  mutedDark: {color: '#9CA3AF'},
  cardDark: {backgroundColor: '#1F2937'},
  scroll: {flex: 1},
  header: {height: 68, backgroundColor: 'white', elevation: 3, paddingHorizontal: 20, justifyContent: 'center'},
  headerDark: {backgroundColor: '#1F2937'},
  back: {flexDirection: 'row', gap: 8, alignItems: 'center'},
  backText: {color: '#064AAB', fontSize: 17},
  body: {width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 40},
  bodyTablet: {maxWidth: 900, padding: 32},
  title: {fontSize: 19, fontWeight: '800', color: '#27354A'},
  titleTablet: {fontSize: 24},
  subtitle: {fontSize: 13, color: '#667085', marginTop: 8, lineHeight: 19},
  loader: {marginTop: 60},
  error: {marginTop: 20, padding: 18, backgroundColor: '#FDECEC', borderRadius: 12},
  errorText: {textAlign: 'center', color: '#B42318'},
  empty: {
    marginTop: 30,
    padding: 30,
    backgroundColor: 'white',
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {textAlign: 'center', color: '#334155', fontSize: 14, lineHeight: 20},
  footer: {padding: 18, backgroundColor: 'white', elevation: 8},
  footerDark: {backgroundColor: '#1F2937'},
  continueButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#0757BE',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonTablet: {maxWidth: 900, width: '100%', alignSelf: 'center', height: 58},
  disabled: {backgroundColor: '#9DA6B5'},
  continueText: {color: 'white', fontWeight: '700', fontSize: 16},
});
