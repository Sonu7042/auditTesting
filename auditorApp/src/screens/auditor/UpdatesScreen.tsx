import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Feather from '../../components/common/AppIcon';
import {AuditorHeader} from '../../components/common/AuditorHeader';
import {auditorApi} from '../../api/auditor.api';
import {AuditorStackParamList} from '../../navigation/navigationTypes';
import {Audit, Project} from '../../types/domain';
import {colors} from '../../theme';
import {useAppTheme} from '../../store/ThemeContext';

type UpdateType = 'ALL' | 'WORKFORCE' | 'MACHINERY' | 'CHEMICAL' | 'DOCUMENT';

interface UpdateItem {
  id: string;
  sourceId: string;
  type: Exclude<UpdateType, 'ALL'>;
  auditId: string;
  title: string;
  reference: string;
  detail: string;
  date?: string;
  imageUrl?: string;
  addedBy: string;
  project: Project;
}

const updateTypes: {id: UpdateType; label: string; icon: string}[] = [
  {id: 'ALL', label: 'All', icon: 'refresh-cw'},
  {id: 'WORKFORCE', label: 'Workforce', icon: 'users'},
  {id: 'MACHINERY', label: 'Machinery', icon: 'tool'},
  {id: 'CHEMICAL', label: 'Chemical', icon: 'droplet'},
  {id: 'DOCUMENT', label: 'Documents', icon: 'file-text'},
];

const formatDate = (value?: string) => {
  if (!value) return 'Date not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date not available';
  return date.toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'});
};

const getLatestAssignedAudit = (project: Project): Audit | null =>
  [...(project.audits || [])].sort((a, b) => (Number(b.cycleNumber) || 1) - (Number(a.cycleNumber) || 1))[0] || null;

const wasAddedAfterAuditStart = (value?: string, auditStartedAt?: string) => {
  const itemTime = new Date(value || '').getTime();
  const startTime = new Date(auditStartedAt || '').getTime();
  return Number.isFinite(itemTime) && Number.isFinite(startTime) ? itemTime >= startTime : false;
};

const flattenApprovedDocuments = (groups: any[] = [], project: Project, auditId: string, auditStartedAt?: string): UpdateItem[] =>
  groups.flatMap(audit =>
    (audit.sections || []).flatMap((section: any) =>
      (section.questions || [])
        .filter((question: any) => question.documentSentToAdmin && question.documentStatus === 'Approved' && wasAddedAfterAuditStart(question.documentSubmittedAt, auditStartedAt))
        .map((question: any): UpdateItem => ({
          id: `document-${question.id}`,
          sourceId: question.id,
          type: 'DOCUMENT',
          auditId,
          title: question.text || 'Approved document',
          reference: question.questionNumber || section.sectionNumber || audit.auditType || 'Document',
          detail: section.title || audit.checklistTemplate?.name || audit.auditType || 'Checklist document',
          date: question.documentSubmittedAt || question.documentDueDate || question.updatedAt,
          imageUrl: question.documentImageUrl,
          addedBy: 'Site user',
          project,
        })),
    ),
  );

const loadProjectUpdates = async (project: Project): Promise<UpdateItem[]> => {
  const audit = getLatestAssignedAudit(project);
  if (!audit) return [];
  const auditId = audit.id;

  const [timerResult, workersResult, machineryResult, chemicalsResult, documentsResult] = await Promise.allSettled([
    auditorApi.timer(project.id, auditId),
    auditorApi.workforce(project.id),
    auditorApi.machinery(project.id),
    auditorApi.chemicals(project.id),
    auditorApi.documentQuestions(project.id, {submitted: true}),
  ]);

  const timer = timerResult.status === 'fulfilled' ? timerResult.value : null;
  const auditStartedAt = timer?.startedAt;
  if (!auditStartedAt) return [];

  const workers = workersResult.status === 'fulfilled' ? workersResult.value : [];
  const machineries = machineryResult.status === 'fulfilled' ? machineryResult.value : [];
  const chemicals = chemicalsResult.status === 'fulfilled' ? chemicalsResult.value : [];
  const documents = documentsResult.status === 'fulfilled' ? documentsResult.value : [];

  return [
    ...workers
      .filter((item: any) => item.status === 'Approved' && wasAddedAfterAuditStart(item.createdAt, auditStartedAt))
      .map((item: any): UpdateItem => ({
        id: `worker-${item.id}`,
        sourceId: item.id,
        type: 'WORKFORCE',
        auditId,
        title: item.fullName || 'Worker',
        reference: item.workerId || 'Worker ID not available',
        detail: item.workerRole || 'Workforce',
        date: item.submittedAt || item.createdAt,
        addedBy: item.createdBy?.fullName || item.createdBy?.username || 'Site user',
        project,
      })),
    ...machineries
      .filter((item: any) => item.status === 'Approved' && wasAddedAfterAuditStart(item.createdAt, auditStartedAt))
      .map((item: any): UpdateItem => ({
        id: `machinery-${item.id}`,
        sourceId: item.id,
        type: 'MACHINERY',
        auditId,
        title: item.machineryName || 'Machinery',
        reference: item.machineryId || 'Machinery ID not available',
        detail: item.inspectionDocumentName || 'Approved machinery record',
        date: item.submittedAt || item.createdAt,
        imageUrl: item.machineryImageUrl,
        addedBy: item.createdBy?.fullName || item.createdBy?.username || 'Site user',
        project,
      })),
    ...chemicals
      .filter((item: any) => item.status === 'Approved' && wasAddedAfterAuditStart(item.createdAt, auditStartedAt))
      .map((item: any): UpdateItem => ({
        id: `chemical-${item.id}`,
        sourceId: item.id,
        type: 'CHEMICAL',
        auditId,
        title: item.chemicalName || 'Chemical',
        reference: item.chemicalId || 'Chemical ID not available',
        detail: item.safetyDataSheetName || 'Approved chemical record',
        date: item.submittedAt || item.createdAt,
        imageUrl: item.chemicalImageUrl,
        addedBy: item.createdBy?.fullName || item.createdBy?.username || 'Site user',
        project,
      })),
    ...flattenApprovedDocuments(documents, project, auditId, auditStartedAt),
  ];
};

export function UpdatesScreen({navigation}: NativeStackScreenProps<AuditorStackParamList, 'Updates'>) {
  const {isDark} = useAppTheme();
  const {width} = useWindowDimensions();
  const tablet = width >= 768;
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [selectedType, setSelectedType] = useState<UpdateType>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [queuedSelections, setQueuedSelections] = useState<Record<string, any>>({});
  const [dismissedUpdates, setDismissedUpdates] = useState<Record<string, boolean>>({});
  const [actionKey, setActionKey] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const projects = await auditorApi.projects();
        const projectUpdates = await Promise.all(projects.map(loadProjectUpdates));
        const auditIds = [...new Set(projects.map(project => getLatestAssignedAudit(project)?.id).filter(Boolean))] as string[];
        const selectionResponses = await Promise.allSettled(auditIds.map(auditId => auditorApi.nextAuditUpdates(auditId)));
        if (!active) return;

        const flattened = projectUpdates.flat().sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        const nextSelections: Record<string, any> = {};
        const nextDismissed: Record<string, boolean> = {};

        selectionResponses.forEach(response => {
          if (response.status !== 'fulfilled') return;
          (response.value || []).forEach((selection: any) => {
            const selectionKey = `${selection.sourceAuditId}:${selection.sourceType}:${selection.sourceId}`;
            if (selection.selectionStatus === 'DISMISSED') {
              nextDismissed[selectionKey] = true;
              return;
            }
            nextSelections[selectionKey] = selection;
          });
        });

        setUpdates(flattened);
        setQueuedSelections(nextSelections);
        setDismissedUpdates(nextDismissed);
      } catch (reason) {
        if (active) setError((reason as Error).message || 'Unable to load approved project updates.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const toggleNextAuditUpdate = async (item: UpdateItem) => {
    const selectionKey = `${item.auditId}:${item.type}:${item.sourceId}`;
    const existing = queuedSelections[selectionKey];
    setActionKey(selectionKey);
    try {
      if (existing) {
        await auditorApi.dequeueNextAuditUpdate(item.auditId, existing.id);
        setQueuedSelections(current => {
          const next = {...current};
          delete next[selectionKey];
          return next;
        });
        setDismissedUpdates(current => ({...current, [selectionKey]: true}));
        return;
      }
      const created = await auditorApi.queueNextAuditUpdate(item.auditId, {
        sourceType: item.type,
        sourceId: item.sourceId,
        sourceSnapshot: {
          title: item.title,
          category: item.type,
          reference: item.reference,
          detail: item.detail,
          addedBy: item.addedBy,
          projectId: item.project.id,
          projectName: item.project.projectName,
          companyName: item.project.company?.companyName,
          approvedAt: item.date,
          imageUrl: item.imageUrl || null,
        },
      });
      setQueuedSelections(current => ({...current, [selectionKey]: created}));
    } finally {
      setActionKey('');
    }
  };

  const counts = useMemo(() => {
    const available = updates.filter(item => !dismissedUpdates[`${item.auditId}:${item.type}:${item.sourceId}`]);
    return available.reduce((result: Record<string, number>, item) => {
      result[item.type] = (result[item.type] || 0) + 1;
      return result;
    }, {ALL: available.length});
  }, [dismissedUpdates, updates]);

  const visibleUpdates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return updates.filter(item => {
      const selectionKey = `${item.auditId}:${item.type}:${item.sourceId}`;
      const matchesType = selectedType === 'ALL' || item.type === selectedType;
      const searchable = [item.title, item.reference, item.detail, item.addedBy, item.project.projectName, item.project.company?.companyName].join(' ').toLowerCase();
      return !dismissedUpdates[selectionKey] && matchesType && (!query || searchable.includes(query));
    });
  }, [dismissedUpdates, search, selectedType, updates]);

  return (
    <View style={[s.screen, isDark && s.screenDark]}>
      <AuditorHeader navigation={navigation} />
      <View style={[s.headerCard, tablet && s.headerCardTablet, isDark && s.cardDark]}>
        <View style={s.headerTop}>
          <View style={s.flex}>
            <Text style={[s.title, tablet && s.titleTablet, isDark && s.textDark]}>Project Updates</Text>
            <Text style={[s.subtitle, isDark && s.mutedDark]}>Admin-approved site records for your assigned audit projects.</Text>
          </View>
          <Pressable disabled={loading} onPress={() => setRefreshKey(current => current + 1)} style={[s.refreshButton, isDark && s.refreshButtonDark]}>
            <Feather name="refresh-cw" size={18} color={isDark ? '#F8FAFC' : '#333'} />
          </Pressable>
        </View>
        <View style={[s.search, isDark && s.searchDark]}>
          <Feather name="search" size={17} color={isDark ? '#9CA3AF' : '#777'} />
          <TextInput style={[s.searchInput, isDark && s.textDark]} value={search} onChangeText={setSearch} placeholder="Search approved updates..." placeholderTextColor={isDark ? '#6B7280' : undefined} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {updateTypes.map(type => {
            const active = selectedType === type.id;
            return (
              <Pressable key={type.id} onPress={() => setSelectedType(type.id)} style={[s.chip, isDark && s.chipDark, active && s.chipActive]}>
                <Feather name={type.icon} size={14} color={active ? 'white' : isDark ? '#D1D5DB' : '#444'} />
                <Text style={[s.chipText, isDark && s.textDark, active && s.chipTextActive]}>{type.label}</Text>
                <View style={[s.chipCount, isDark && s.chipCountDark, active && s.chipCountActive]}>
                  <Text style={[s.chipCountText, isDark && s.textDark, active && s.chipTextActive]}>{counts[type.id] || 0}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading && (
        <View style={[s.stateCard, isDark && s.cardDark]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[s.stateText, isDark && s.mutedDark]}>Loading approved updates...</Text>
        </View>
      )}

      {!!error && !loading && (
        <Pressable onPress={() => setRefreshKey(current => current + 1)} style={s.errorCard}>
          <Text style={s.errorText}>{error} · Tap to retry</Text>
        </Pressable>
      )}

      {!loading && !error && (
        <FlatList
          style={s.flex}
          data={visibleUpdates}
          keyExtractor={item => item.id}
          contentContainerStyle={[s.list, tablet && s.listTablet]}
          ListEmptyComponent={
            <View style={[s.stateCard, isDark && s.cardDark]}>
              <Feather name="check-circle" size={38} color="#B9C0C9" />
              <Text style={[s.emptyTitle, isDark && s.textDark]}>No approved updates found</Text>
              <Text style={[s.emptyText, isDark && s.mutedDark]}>Updates appear only after an audit starts and the newly added records are approved by admin.</Text>
            </View>
          }
          renderItem={({item}) => {
            const type = updateTypes.find(entry => entry.id === item.type);
            const selectionKey = `${item.auditId}:${item.type}:${item.sourceId}`;
            const isQueued = Boolean(queuedSelections[selectionKey]);
            const isUpdating = actionKey === selectionKey;
            return (
              <View style={[s.card, isDark && s.cardDark]}>
                <View style={s.cardRow}>
                  {item.imageUrl ? (
                    <Image source={{uri: item.imageUrl}} style={s.cardImage} />
                  ) : (
                    <View style={[s.cardIcon, isDark && s.cardIconDark]}>
                      <Feather name={type?.icon || 'refresh-cw'} size={22} color="#4F46E5" />
                    </View>
                  )}
                  <View style={s.flex}>
                    <View style={s.cardTop}>
                      <View style={s.flex}>
                        <Text style={s.cardType}>{type?.label || item.type}</Text>
                        <Text numberOfLines={1} style={[s.cardTitle, isDark && s.textDark]}>{item.title}</Text>
                      </View>
                      <View style={s.approvedPill}>
                        <Feather name="check-circle" size={12} color="#087747" />
                        <Text style={s.approvedText}>Approved</Text>
                      </View>
                    </View>
                    <Text style={[s.cardReference, isDark && s.mutedDark]}>{item.reference}</Text>
                    <Text style={[s.cardDetail, isDark && s.mutedDark]}>{item.detail}</Text>
                    <View style={[s.infoGrid, isDark && s.infoGridDark]}>
                      <Info icon="map-pin" text={item.project.projectName || 'Project'} isDark={isDark} />
                      <Info icon="user" text={`Added by ${item.addedBy}`} isDark={isDark} />
                      <Info icon="calendar" text={formatDate(item.date)} isDark={isDark} />
                      <Info icon="check-circle" text={item.project.company?.companyName || 'Company'} isDark={isDark} />
                    </View>
                    <Pressable disabled={isUpdating} onPress={() => toggleNextAuditUpdate(item)} style={[s.actionButton, isQueued && s.actionButtonQueued]}>
                      <Feather name={isQueued ? 'trash-2' : 'plus'} size={15} color={isQueued ? '#DC2626' : 'white'} />
                      <Text style={[s.actionText, isQueued && s.actionTextQueued]}>{isUpdating ? 'Updating...' : isQueued ? 'Remove from next audit' : 'Add to next audit report'}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function Info({icon, text, isDark}: {icon: string; text: string; isDark?: boolean}) {
  return (
    <View style={s.infoItem}>
      <Feather name={icon} size={13} color={isDark ? '#9CA3AF' : '#666'} />
      <Text numberOfLines={1} style={[s.infoText, isDark && s.mutedDark]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#F2F2F2'},
  screenDark: {backgroundColor: '#111827'},
  textDark: {color: '#F8FAFC'},
  mutedDark: {color: '#9CA3AF'},
  cardDark: {backgroundColor: '#1F2937'},
  flex: {flex: 1},
  headerCard: {margin: 20, marginBottom: 0, width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: 'white', borderRadius: 24, padding: 18, elevation: 3},
  headerCardTablet: {maxWidth: 900, padding: 24},
  headerTop: {flexDirection: 'row', alignItems: 'flex-start', gap: 12},
  title: {fontSize: 22, fontWeight: '800', color: '#181919'},
  titleTablet: {fontSize: 26},
  subtitle: {fontSize: 13, lineHeight: 19, color: '#666', marginTop: 4},
  refreshButton: {width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#D8D8D8', alignItems: 'center', justifyContent: 'center'},
  refreshButtonDark: {borderColor: '#374151'},
  search: {marginTop: 16, height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#D7D7D7', backgroundColor: '#F6F6F6', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14},
  searchDark: {backgroundColor: '#111827', borderColor: '#374151'},
  searchInput: {flex: 1, fontSize: 13, color: '#333'},
  chips: {gap: 8, paddingTop: 14, paddingBottom: 2},
  chip: {flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#D8D8D8', backgroundColor: 'white'},
  chipDark: {backgroundColor: '#111827', borderColor: '#374151'},
  chipActive: {backgroundColor: '#181919', borderColor: '#181919'},
  chipText: {fontSize: 12, fontWeight: '600', color: '#444'},
  chipTextActive: {color: 'white'},
  chipCount: {borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#F1F1F1'},
  chipCountDark: {backgroundColor: '#26344A'},
  chipCountActive: {backgroundColor: 'rgba(255,255,255,0.15)'},
  chipCountText: {fontSize: 10, fontWeight: '700', color: '#444'},
  stateCard: {margin: 20, backgroundColor: 'white', borderRadius: 20, padding: 28, alignItems: 'center', gap: 8},
  stateText: {color: '#666', fontSize: 13},
  emptyTitle: {fontSize: 16, fontWeight: '700', color: '#252525', marginTop: 6},
  emptyText: {fontSize: 12, color: '#777', textAlign: 'center', marginTop: 2},
  errorCard: {margin: 20, backgroundColor: '#FEF2F2', borderRadius: 16, padding: 16},
  errorText: {color: '#DC2626', fontSize: 13},
  list: {padding: 20, paddingTop: 16, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center'},
  listTablet: {maxWidth: 900, padding: 24},
  card: {backgroundColor: 'white', borderRadius: 20, borderWidth: 1, borderColor: '#E1E1E1', padding: 14},
  cardRow: {flexDirection: 'row', gap: 12},
  cardImage: {width: 48, height: 48, borderRadius: 12},
  cardIcon: {width: 48, height: 48, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center'},
  cardIconDark: {backgroundColor: '#26344A'},
  cardTop: {flexDirection: 'row', alignItems: 'flex-start', gap: 8},
  cardType: {fontSize: 11, fontWeight: '700', color: '#4F46E5', textTransform: 'uppercase'},
  cardTitle: {fontSize: 16, fontWeight: '700', color: '#181919', marginTop: 3},
  approvedPill: {flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: '#E8F6EF'},
  approvedText: {fontSize: 10, fontWeight: '700', color: '#087747'},
  cardReference: {fontSize: 12, fontWeight: '600', color: '#444', marginTop: 8},
  cardDetail: {fontSize: 12, lineHeight: 18, color: '#777', marginTop: 3},
  infoGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: '#ECECEC', marginTop: 10, paddingTop: 10},
  infoGridDark: {borderTopColor: '#374151'},
  infoItem: {flexDirection: 'row', alignItems: 'center', gap: 6, width: '48%'},
  infoText: {fontSize: 11, color: '#666', flexShrink: 1},
  actionButton: {marginTop: 12, height: 42, borderRadius: 12, backgroundColor: '#181919', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8},
  actionButtonQueued: {backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA'},
  actionText: {fontSize: 12, fontWeight: '700', color: 'white'},
  actionTextQueued: {color: '#DC2626'},
});
