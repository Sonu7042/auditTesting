import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import {env} from '../config/env';
import {storage} from '../storage/storage';
import {AuditReport} from '../types/domain';

export type ReportDownloadFormat = 'excel' | 'word' | 'open-nc';

const EXTENSION_BY_FORMAT: Record<ReportDownloadFormat, string> = {excel: 'xlsx', word: 'docx', 'open-nc': 'docx'};
const SUFFIX_BY_FORMAT: Record<ReportDownloadFormat, string> = {excel: '', word: '/word', 'open-nc': '/open-nc'};
const MIME_BY_EXTENSION: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const slug = (value: string) => value.trim().replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '') || 'audit';

export async function downloadAuditReport(report: AuditReport, format: ReportDownloadFormat = 'excel') {
  const token = await storage.token();
  const extension = EXTENSION_BY_FORMAT[format];
  const fileName = `${slug(report.project?.projectName || 'audit')}-report${format === 'open-nc' ? '-open-nc' : ''}.${extension}`;
  const toFile = `${RNFS.CachesDirectoryPath}/${fileName}`;
  const fromUrl = `${env.apiUrl}/projects/audit-reports/${report.id}/download${SUFFIX_BY_FORMAT[format]}`;

  const {statusCode} = await RNFS.downloadFile({
    fromUrl,
    toFile,
    headers: token ? {Authorization: `Bearer ${token}`} : undefined,
  }).promise;

  if (statusCode && statusCode >= 400) throw new Error('Unable to download the report.');

  await Share.open({
    url: `file://${toFile}`,
    type: MIME_BY_EXTENSION[extension],
    failOnCancel: false,
  });
}
