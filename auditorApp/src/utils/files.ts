import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import {env} from '../config/env';
import {storage} from '../storage/storage';

export const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const safe = (name: string) => name.replace(/[^\w.\-]+/g, '_');

/* Downloads a file from the API with the signed-in token and opens the share sheet (open in a viewer, send, save). */
export async function downloadAndShare(apiPath: string, fileName: string, type: string) {
  const token = await storage.token();
  const toFile = `${RNFS.CachesDirectoryPath}/${safe(fileName)}`;
  const {statusCode} = await RNFS.downloadFile({
    fromUrl: `${env.apiUrl}${apiPath}`,
    toFile,
    headers: token ? {Authorization: `Bearer ${token}`} : undefined,
  }).promise;
  if (statusCode >= 400) {
    let message = 'The file could not be downloaded.';
    try {
      const body = JSON.parse(await RNFS.readFile(toFile, 'utf8'));
      if (body?.message) message = body.message;
    } catch {
      /* not a JSON error body */
    }
    throw new Error(message);
  }
  await Share.open({url: `file://${toFile}`, type, filename: safe(fileName), failOnCancel: false});
}
