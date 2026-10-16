import React, {useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Feather from './AppIcon';
import {auditorApi} from '../../api/auditor.api';
import {PreviousNC} from '../../types/domain';
import {getSectionKeyForReview, sectionTitle} from '../../utils/previousNcReviews';
import {PhotoPicker, PickedPhoto} from './PhotoPicker';
import {useAppTheme} from '../../store/ThemeContext';

export function PreviousNcReviewList({
  reviews,          
  auditId,   
  onClosed,
}: {
  reviews: PreviousNC[];
  auditId: string;
  onClosed: (reviewId: string) => void;
}) {
  if (!reviews.length) return null;
  return (
    <View style={s.list}>
      {reviews.map(review => (
        <ReviewCard key={review.id} review={review} auditId={auditId} onClosed={onClosed} />
      ))}
    </View>
  );
}

function ReviewCard({
  review,
  auditId,
  onClosed,
}: {
  review: PreviousNC;
  auditId: string;
  onClosed: (reviewId: string) => void;
}) {
  const {isDark} = useAppTheme();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const snapshot = review.sourceSnapshot || {};
  const risk = snapshot.preventiveManagement || snapshot.severity;
  const evidence = (snapshot.evidence || []).slice(0, 4);

  const close = async () => {
    if (!photos.length) {
      setError('Upload at least one closure image.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const form = new FormData();
      photos.forEach(photo =>
        form.append('closureEvidence', {
          uri: photo.uri,
          name: photo.fileName || `closure-${Date.now()}.jpg`,
          type: photo.type || 'image/jpeg',
        } as any),
      );
      await auditorApi.closePreviousNcReview(auditId, review.id, form);
      onClosed(review.id);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[s.card, isDark && s.cardDark]}>
      <View style={s.badges}>
        <Text style={s.sectionBadge}>{sectionTitle(getSectionKeyForReview(review))}</Text>
        {Boolean(review.sourceAudit?.cycleNumber) && (
          <Text style={s.cycleBadge}>Cycle {review.sourceAudit?.cycleNumber}</Text>
        )}
        <Text style={s.openBadge}>Open</Text>
      </View>
      <Text style={[s.title, isDark && s.titleDark]}>
        {snapshot.questionNumber ? `${snapshot.questionNumber} - ` : ''}
        {snapshot.title || 'Non-compliance'}
      </Text>
      {Boolean(snapshot.subcategory) && <Text style={[s.subtitle, isDark && s.subtitleDark]}>{snapshot.subcategory}</Text>}
      {Boolean(risk) && <Text style={s.riskBadge}>{risk}</Text>}
      {Boolean(snapshot.previousObservation) && (
        <View style={[s.block, isDark && s.blockDark]}>
          <Text style={[s.blockLabel, isDark && s.blockLabelDark]}>Previous observation</Text>
          <Text style={[s.blockText, isDark && s.blockTextDark]}>{snapshot.previousObservation}</Text>
        </View>
      )}
      {Boolean(snapshot.previousRecommendation) && (
        <View style={[s.block, isDark && s.blockDark]}>
          <Text style={[s.blockLabel, isDark && s.blockLabelDark]}>Previous corrective action</Text>
          <Text style={[s.blockText, isDark && s.blockTextDark]}>{snapshot.previousRecommendation}</Text>
        </View>
      )}
      {evidence.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.evidenceRow}>
          {evidence.map((item, index) => (
            <Pressable key={item.id || index} onPress={() => setPreview(item.imageUrl)}>
              <Image source={{uri: item.imageUrl}} style={s.evidenceImage} />
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={[s.closure, isDark && s.closureDark]}>
        <PhotoPicker label="Closure evidence *" photos={photos} onChange={setPhotos} />
        {Boolean(error) && <Text style={s.error}>{error}</Text>}
        <Pressable disabled={saving} onPress={close} style={[s.closeButton, saving && s.disabled]}>
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Feather name="check-circle" size={17} color="white" />
              <Text style={s.closeText}>Close NC</Text>
            </>
          )}
        </Pressable>
      </View>
      <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={s.previewBack} onPress={() => setPreview(null)}>
          {preview && <Image source={{uri: preview}} style={s.previewImage} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  list: {gap: 16},
  card: {backgroundColor: 'white', borderRadius: 16, padding: 18, elevation: 3, borderWidth: 1, borderColor: '#FDE6C8'},
  cardDark: {backgroundColor: '#1F2937', borderColor: '#7C4A12'},
  badges: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10},
  sectionBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  cycleBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#174EA6',
    backgroundColor: '#EAF1FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  openBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B42318',
    backgroundColor: '#FDECEC',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  title: {fontSize: 16, fontWeight: '700', color: '#1F2937'},
  titleDark: {color: '#F1F5F9'},
  subtitle: {fontSize: 13, color: '#667085', marginTop: 4},
  subtitleDark: {color: '#9CA3AF'},
  riskBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    fontSize: 11,
    fontWeight: '800',
    color: '#9A3412',
    backgroundColor: '#FFEDD5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  block: {marginTop: 12, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12},
  blockDark: {backgroundColor: '#111827'},
  blockLabel: {fontSize: 11, fontWeight: '800', color: '#475569'},
  blockLabelDark: {color: '#9CA3AF'},
  blockText: {fontSize: 14, color: '#334155', marginTop: 6, lineHeight: 20},
  blockTextDark: {color: '#E2E8F0'},
  evidenceRow: {marginTop: 12},
  evidenceImage: {width: 84, height: 84, borderRadius: 9, marginRight: 8},
  closure: {marginTop: 16, borderTopWidth: 1, borderTopColor: '#EEF0F3', paddingTop: 16},
  closureDark: {borderTopColor: '#374151'},
  error: {color: '#B42318', fontSize: 12, marginTop: 8},
  closeButton: {
    marginTop: 14,
    height: 46,
    borderRadius: 9,
    backgroundColor: '#B45309',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {opacity: 0.55},
  closeText: {color: 'white', fontWeight: '700'},
  previewBack: {flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center'},
  previewImage: {width: '100%', height: '80%'},
});
