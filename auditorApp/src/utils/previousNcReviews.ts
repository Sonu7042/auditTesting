import {PreviousNC} from '../types/domain';

export type SectionKey =
  | 'CONTROL_MEASURES'
  | 'RECORDS_DOCUMENTS'
  | 'WORKFORCE'
  | 'MACHINERY'
  | 'CHEMICAL';

export const SECTION_DEFS: {key: SectionKey; title: string}[] = [
  {key: 'CONTROL_MEASURES', title: 'Control Measures'},
  {key: 'RECORDS_DOCUMENTS', title: 'Records & Documents'},
  {key: 'WORKFORCE', title: 'Workforce'},
  {key: 'MACHINERY', title: 'Machinery'},
  {key: 'CHEMICAL', title: 'Chemical'},
];

export const sectionTitle = (key: string): string =>
  SECTION_DEFS.find(section => section.key === key)?.title || key;

export const getBaseSourceType = (sourceType: string): string =>
  (sourceType || '').replace(/^CARRIED_/, '').replace(/^UPDATE_/, '');

export const getSectionKeyForReview = (review: PreviousNC): SectionKey => {
  const base = getBaseSourceType(review.sourceType);
  if (base === 'CHECKLIST') {
    return review.sourceSnapshot?.sectionCategory || 'CONTROL_MEASURES';
  }
  return base as SectionKey;
};

export const isUnresolved = (review: PreviousNC): boolean =>
  review.currentStatus !== 'CLOSED';

export const groupReviewsBySection = (
  reviews: PreviousNC[],
): Record<SectionKey, PreviousNC[]> => {
  const groups = SECTION_DEFS.reduce((acc, section) => {
    acc[section.key] = [];
    return acc;
  }, {} as Record<SectionKey, PreviousNC[]>);
  reviews.filter(isUnresolved).forEach(review => {
    const key = getSectionKeyForReview(review);
    if (groups[key]) groups[key].push(review);
  });
  return groups;
};

export const findOpenChecklistReview = (
  reviews: PreviousNC[],
  questionNumber?: string,
): PreviousNC | null => {
  const target = String(questionNumber || '').trim();
  if (!target) return null;
  return (
    reviews.find(
      review =>
        isUnresolved(review) &&
        getBaseSourceType(review.sourceType) === 'CHECKLIST' &&
        String(review.sourceSnapshot?.questionNumber || '').trim() === target,
    ) || null
  );
};
