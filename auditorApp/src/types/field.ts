export type Answer = 'COMPLIANT' | 'NON_COMPLIANT' | 'NA';

export interface FieldUser {id: string; fullName: string; username: string; email?: string; role: string; mustChangePassword?: boolean}

export interface Evidence {id: string; imageUrl: string; imageName?: string; kind?: 'ISSUE' | 'CORRECTION' | string; evidenceType?: string; createdAt?: string}

export interface Facility {facilityType: string; displayName?: string; tier?: string; ciLevel?: string; format?: string}

export interface DealerLocation {
  id?: string; dealerName: string; dealerCode?: string; locationName: string; locationCode?: string; address: string; city?: string; state?: string;
  zone?: string; regionalOffice?: string; latitude: number; longitude: number; geofenceRadiusM: number; contactName?: string; contactPhone?: string;
  sapCode?: string; madbCode?: string; category?: string; facilities?: Facility[];
}

export interface Assignment {id?: string; auditorId: string; assignmentRole: 'LEAD' | 'MEMBER' | string; track: 'A' | 'B' | 'ALL' | string; status?: string; auditor: {id: string; fullName: string}}

export interface JobSessionLite {id: string; auditorId: string; status: string; checkedInAt: string; endedAt?: string | null; distanceFromSiteM: number; gpsAccuracy: number}

export interface Notice {id: string; kind: string; dueAt: string; sentAt?: string | null}

export interface Job {
  id: string; auditCycle: string; auditType: string; scheduledStart: string; scheduledEnd: string; status: string; facilityType?: string | null;
  includesShared: boolean; isDemo?: boolean; location: DealerLocation; snapshot: {id: string; checklistName: string; checklistVersion: string; itemCount: number};
  assignments: Assignment[]; sessions?: JobSessionLite[]; notices?: Notice[];
}

export interface ItemData {
  questionText: string; expectedCondition?: string; responseType?: string; severityOnFail?: string; mahindraPriority?: string; evidenceRequired?: boolean;
  minimumEvidence?: number; naAllowed?: boolean; naReasonRequired?: boolean; measurementUnit?: string; minimumValue?: number | null; maximumValue?: number | null;
  regulationRef?: string; discipline?: string; weight?: number;
}

export interface QuestionResponse {
  id: string; responseStatus: 'DRAFT' | 'SUBMITTED'; answer?: Answer | null; result?: Answer | null; observation?: string | null; measurementValue?: number | null;
  naReason?: string | null; recommendation?: string | null; responsiblePerson?: string | null; targetDate?: string | null; closedOnSpot?: boolean;
  correctionComment?: string | null; evidence?: Evidence[]; snapshotItemId?: string; nonCompliance?: any; pending?: boolean;
}

export interface Question extends ItemData {
  id: string; snapshotItemId: string; questionCode: string; sortOrder: number; discipline: string; response: QuestionResponse | null;
}

export interface Module {moduleCode: string; questionCount: number; submittedCount: number; draftCount: number; progressPercent: number; sections: Array<{sectionName: string; questions: Question[]}>}

export interface Session {
  id: string; jobId: string; status: string; checkedInAt: string; endedAt?: string | null; distanceFromSiteM: number; gpsAccuracy: number; track: string;
  modules: Module[]; progress: {totalQuestions: number; submittedQuestions: number; percentage: number}; completion?: any;
  job: {id: string; location: {dealerName: string; locationName: string; address: string; geofenceRadiusM: number}; facilityType?: string | null; includesShared?: boolean};
}

export interface Readiness {
  ready: boolean; blockers: string[]; completedAt?: string | null; site: {dealerName: string; locationName: string};
  summary: {total: number; submitted: number; draft: number; pending: number; compliant: number; nonCompliant: number; na: number; evidencePhotos: number; progressPercentage: number; severity: Record<string, number>};
}

export interface SnapshotItem {id: string; moduleCode: string; sectionName: string; questionCode: string; sortOrder: number; itemData: ItemData}

export interface Correction {
  id: string; reportId: string; snapshotItemId?: string | null; category: string; priority: string; instruction: string; dueDate?: string | null; status: string;
  resolution?: string | null; correctedResult?: string | null; reviewRemarks?: string | null; evidence: Evidence[]; snapshotItem?: SnapshotItem | null; createdAt: string;
}

export interface ReportHistory {id: string; action: string; fromStatus?: string; toStatus?: string; remarks?: string | null; createdAt: string; actorId?: string}

export interface ReportSession {
  id: string; auditorId: string; status: string; checkedInAt: string; endedAt?: string | null; distanceFromSiteM: number; auditor?: {id: string; fullName: string};
  completion?: {completedAt: string; finalRemarks: string} | null; responses: Array<QuestionResponse & {snapshotItemId: string}>;
}

export interface Report {
  id: string; jobId: string; reportNumber: string; status: string; revision: number; reviewRemarks?: string | null; qcScore?: number | null; generatedAt: string;
  publishedAt?: string | null; approvedAt?: string | null; signedAt?: string | null; signedByName?: string | null; signedByDesignation?: string | null; updatedAt: string;
  history: ReportHistory[]; corrections: Correction[];
  job: Omit<Job, 'snapshot' | 'sessions'> & {snapshot: Job['snapshot'] & {items: SnapshotItem[]}; sessions: ReportSession[]};
}

export interface LifecycleStage {key: string; label: string; state: 'DONE' | 'CURRENT' | 'PENDING'; at?: string | null; by?: string; detail?: string; optional?: boolean}

export interface Clarification {id: string; reportId: string; kind: 'CLARIFICATION' | 'CHANGE'; message: string; status: string; response?: string | null; createdAt: string; raisedBy?: {fullName: string; role: string} | null; snapshotItemId?: string | null}

export interface NonCompliance {
  id: string; ncNumber: string; jobId: string; status: string; severity: string; priority: string; observation: string; recommendation?: string | null;
  rootCause?: string | null; correctiveAction?: string | null; preventiveAction?: string | null; responsiblePerson?: string | null; targetDate?: string | null;
  capaSubmittedAt?: string | null; auditorRemarks?: string | null; createdAt: string; overdue?: boolean; evidence: Evidence[];
  response: QuestionResponse & {snapshotItem: SnapshotItem; session: {auditorId: string; job: {id: string; location: {dealerName: string; locationName: string; locationCode: string}; assignments: Array<{auditorId: string; assignmentRole: string}>}}};
}

export interface Training {
  onboarding: {status: string; videoProgress: number; quizScore?: number | null; quizAttempts: number; reviewRemarks?: string | null; rejectionReason?: string | null; quizAnswers?: Record<string, number> | null; demoAnswers?: Record<string, {result: string; comment?: string}> | null; approvedAt?: string | null; auditorCode?: string | null; expiresAt?: string | null; refresherDue?: boolean; canStartRefresher?: boolean; expired?: boolean; daysLeft?: number | null};
  content: {videoUrl?: string | null; passMark: number; quiz: Array<{id: string; text: string; options: string[]}>; demo: Array<{id: string; title: string; scenario: string; imageUrl?: string}>};
}

export interface IdCard {
  userId: string; fullName: string; email?: string; phone?: string | null; baseLocation?: string | null; emergencyContact?: string | null; status: string; photoUrl?: string | null;
  auditorCode?: string | null; idIssuedAt?: string | null; approvedAt?: string | null; skills: string[]; regions: string[]; authorityLetterNumber?: string | null; certificationExpiresAt?: string | null;
}

export interface Profile {card: IdCard; username: string; requests: Array<{id: string; status: string; reason: string; remarks?: string | null; createdAt: string; fields: string[]}>}

export interface AppNotice {id: string; title: string; message: string; type: string; isRead: boolean; createdAt: string; link?: string | null}
