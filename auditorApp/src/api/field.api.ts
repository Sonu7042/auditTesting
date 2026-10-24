import {api} from './client';
import {AppNotice, Clarification, IdCard, Job, LifecycleStage, NonCompliance, Profile, QuestionResponse, Readiness, Report, Session, Training} from '../types/field';

const multipart = {headers: {'Content-Type': 'multipart/form-data'}, timeout: 90000};

export const fieldApi = {
  async jobs() {
    return ((await api.get('/client-audit-jobs')).data.jobs || []) as Job[];
  },
  async checkInDetails(jobId: string) {
    return (await api.get(`/client-audit-jobs/${jobId}/check-in`)).data as {job: any; session: any};
  },
  async checkIn(jobId: string, form: FormData) {
    return (await api.post(`/client-audit-jobs/${jobId}/check-in`, form, multipart)).data as {message: string; session: Session};
  },
  async session(jobId: string) {
    return (await api.get(`/client-audit-jobs/${jobId}/session`)).data.session as Session;
  },
  async saveResponse(jobId: string, itemId: string, form: FormData) {
    return (await api.put(`/client-audit-jobs/${jobId}/session/responses/${itemId}`, form, multipart)).data as {message: string; response: QuestionResponse};
  },
  async readiness(jobId: string) {
    return (await api.get(`/client-audit-jobs/${jobId}/completion-readiness`)).data.readiness as Readiness;
  },
  async complete(jobId: string, payload: {finalRemarks: string; declarationAccepted: boolean; signature: string}) {
    return (await api.post(`/client-audit-jobs/${jobId}/complete`, payload, {timeout: 60000})).data as {message: string};
  },
  async propose(payload: {jobId: string; discipline: string; sectionName: string; questionText: string; reason: string; severity: string}) {
    return (await api.post('/client-audit-proposals', payload)).data as {message: string};
  },

  async reports() {
    return ((await api.get('/client-audit-reports')).data.reports || []) as Report[];
  },
  async reviewReport(reportId: string, action: 'SUBMIT', remarks?: string) {
    return (await api.patch(`/client-audit-reports/${reportId}/review`, {action, remarks})).data as {message: string; report: Report};
  },
  async submitCorrection(correctionId: string, form: FormData) {
    return (await api.patch(`/client-audit-reports/corrections/${correctionId}/submit`, form, multipart)).data as {message: string; report: Report};
  },
  async lifecycle(reportId: string) {
    return (await api.get(`/client-qc/reports/${reportId}/lifecycle`)).data as {stages: LifecycleStage[]; current: string};
  },
  async clarifications(reportId: string) {
    return ((await api.get(`/client-qc/reports/${reportId}/clarifications`)).data.clarifications || []) as Clarification[];
  },
  async answerClarification(id: string, action: 'ANSWER' | 'DECLINE', response: string) {
    return (await api.post(`/client-qc/clarifications/${id}/respond`, {action, response})).data as {message: string};
  },

  async ncs(params?: {status?: string}) {
    return ((await api.get('/client-audit-ncs', {params})).data.records || []) as NonCompliance[];
  },
  async reviewNc(ncId: string, action: 'CLOSE' | 'REJECT' | 'MORE_EVIDENCE', remarks?: string) {
    return (await api.patch(`/client-audit-ncs/${ncId}/review`, {action, remarks})).data as {message: string; record: NonCompliance};
  },

  async training() {
    return (await api.get('/auditor-onboarding/me/training')).data as Training;
  },
  async videoProgress(progress: number) {
    return (await api.post('/auditor-onboarding/me/video-progress', {progress})).data as {videoProgress: number};
  },
  async submitTraining(quizAnswers: Record<string, number>, demoAnswers: Record<string, {result: string; comment?: string}>) {
    return (await api.post('/auditor-onboarding/me/submit', {quizAnswers, demoAnswers})).data as {passed: boolean; quizScore: number; passMark: number; message: string};
  },
  async startRefresher() {
    return (await api.post('/auditor-onboarding/me/refresher')).data as {message: string};
  },
  async profile() {
    return (await api.get('/auditor-onboarding/me/profile')).data as Profile;
  },
  async idCard() {
    return (await api.get('/auditor-onboarding/me/id-card')).data as {card: IdCard; qr: string; verifyUrl: string};
  },
  async requestChange(changes: Record<string, string>, reason: string) {
    return (await api.post('/auditor-onboarding/me/change-requests', {changes, reason})).data as {id: string};
  },

  async changePassword(currentPassword: string, newPassword: string) {
    return (await api.post('/auth/change-password', {currentPassword, newPassword})).data as {message: string};
  },

  async notifications(limit = 60) {
    return ((await api.get('/projects/notifications/history', {params: {limit, offset: 0}})).data.data || []) as AppNotice[];
  },
  markRead: (notificationId: string) => api.patch('/projects/notifications/read', {notificationId}),
  markAllRead: () => api.patch('/projects/notifications/read-all'),
};
