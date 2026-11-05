import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import {
  clampStr,
  firebaseAuth,
  firebaseStorage,
  firestoreDb,
  handleFirestoreError,
  normalizeAuthorizedEmailsList,
  OperationType,
  toSafeDocId,
} from '../lib/firebase';
import { fileToCompressedDataUrl } from '../utils/formatters';

export type MediaCategory =
  | 'student-photo'
  | 'student-aadhaar'
  | 'staff-photo'
  | 'school-logo';

export const CLOUD_MEDIA_PREFIX = 'cloud-media://';

const resolvedDataUrlCache = new Map<string, string>();

export function cacheResolvedDataUrl(urlOrRef: string, dataUrl: string): void {
  if (urlOrRef && dataUrl && dataUrl.startsWith('data:')) {
    resolvedDataUrlCache.set(urlOrRef, dataUrl);
  }
}

export function getSyncDataUrlForPdf(urlOrDataUrl: string | undefined): string {
  if (!urlOrDataUrl) return '';
  if (urlOrDataUrl.startsWith('data:image/')) return urlOrDataUrl;
  return resolvedDataUrlCache.get(urlOrDataUrl) || '';
}

export async function warmImageDataUrlCache(url: string | undefined): Promise<void> {
  if (!url || url.startsWith('data:') || url.startsWith(CLOUD_MEDIA_PREFIX)) return;
  if (resolvedDataUrlCache.has(url)) return;

  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return;
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Empty reader'));
      reader.onerror = () => reject(new Error('Failed reading image blob'));
      reader.readAsDataURL(blob);
    });
    if (dataUrl.startsWith('data:image/')) {
      resolvedDataUrlCache.set(url, dataUrl);
    }
  } catch {
    // Non-fatal: HTML <img> still renders remote URLs directly
  }
}

export function resolveDisplayMediaUrl(
  storedUrl: string | undefined,
  mediaFilesById: Record<string, string>
): string {
  if (!storedUrl) return '';
  if (storedUrl.startsWith(CLOUD_MEDIA_PREFIX)) {
    const mediaId = storedUrl.slice(CLOUD_MEDIA_PREFIX.length);
    const dataUrl = mediaFilesById[mediaId] || resolvedDataUrlCache.get(storedUrl) || '';
    if (dataUrl) {
      resolvedDataUrlCache.set(storedUrl, dataUrl);
    }
    return dataUrl;
  }
  return storedUrl;
}

export interface CloudUploadResult {
  storedUrl: string;
  displayUrl: string;
  storageBackend: 'firebase-storage' | 'firestore-media';
}

export async function uploadDataUrlToCloudMedia(
  schoolId: string,
  compressedDataUrl: string,
  category: MediaCategory,
  recordRef: string,
  authorizedEmails: string[],
  ownerEmail?: string
): Promise<CloudUploadResult> {
  const uid = firebaseAuth.currentUser?.uid;
  const safeSchoolId = toSafeDocId(schoolId);
  if (!uid || !safeSchoolId) {
    return {
      storedUrl: compressedDataUrl,
      displayUrl: compressedDataUrl,
      storageBackend: 'firestore-media',
    };
  }

  const safeRef = toSafeDocId(recordRef || category);
  const mediaId = toSafeDocId(`med_${category}_${safeRef}_${Date.now()}`);
  const mimeMatch = compressedDataUrl.match(/^data:([a-zA-Z0-9+/.-]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const ext = mimeType.includes('pdf') ? 'pdf' : mimeType.includes('png') ? 'png' : 'jpg';

  // 1. Primary Cloud File Storage: Firebase Cloud Storage Bucket (isolated per schoolId)
  try {
    const storagePath = `schools/${safeSchoolId}/${category}/${mediaId}.${ext}`;
    const storageRef = ref(firebaseStorage, storagePath);
    await uploadString(storageRef, compressedDataUrl, 'data_url');
    const downloadUrl = await getDownloadURL(storageRef);

    if (downloadUrl && downloadUrl.length <= 2048) {
      cacheResolvedDataUrl(downloadUrl, compressedDataUrl);
      return {
        storedUrl: downloadUrl,
        displayUrl: downloadUrl,
        storageBackend: 'firebase-storage',
      };
    }
  } catch {
    // Fall back to secured Firestore /schools/{schoolId}/media_files/{mediaId} collection
  }

  // 2. Resilient Cloud Fallback: Secured /schools/{schoolId}/media_files/{mediaId} Document
  if (compressedDataUrl.length > 445000) {
    throw new Error(
      'Document exceeds cloud storage size limit (320 KB max for PDF, or upload JPG/PNG).'
    );
  }
  const safeDataUrl = compressedDataUrl.slice(0, 445000);
  const cleanEmails = normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail);
  const mediaPath = `schools/${safeSchoolId}/media_files/${mediaId}`;

  try {
    await setDoc(doc(firestoreDb, 'schools', safeSchoolId, 'media_files', mediaId), {
      id: mediaId,
      schoolId: safeSchoolId,
      category,
      recordRef: clampStr(safeRef, 128, category),
      mimeType: clampStr(mimeType, 64, 'image/jpeg'),
      dataUrl: safeDataUrl,
      sizeBytes: Math.min(499000, new Blob([safeDataUrl]).size),
      authorizedEmails: cleanEmails,
      createdByUid: uid,
      updatedByUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, mediaPath);
  }

  const refUri = `${CLOUD_MEDIA_PREFIX}${mediaId}`;
  cacheResolvedDataUrl(refUri, safeDataUrl);
  return {
    storedUrl: refUri,
    displayUrl: safeDataUrl,
    storageBackend: 'firestore-media',
  };
}

export async function uploadSchoolMediaFile(
  schoolId: string,
  file: File,
  category: MediaCategory,
  recordRef: string,
  authorizedEmails: string[],
  ownerEmail?: string
): Promise<CloudUploadResult> {
  const maxDim = category === 'student-aadhaar' ? 760 : 480;
  const quality = category === 'school-logo' ? 0.86 : 0.8;
  const compressedDataUrl = await fileToCompressedDataUrl(file, maxDim, quality);
  return uploadDataUrlToCloudMedia(
    schoolId,
    compressedDataUrl,
    category,
    recordRef,
    authorizedEmails,
    ownerEmail
  );
}

/**
 * Ensures any legacy inline `data:...` string is promoted to tenant-isolated Cloud Storage
 * before saving its compact URL reference inside primary entity documents.
 */
export async function ensureCompactCloudMediaUrl(
  schoolId: string,
  rawUrlOrData: string | undefined,
  category: MediaCategory,
  recordRef: string,
  authorizedEmails: string[],
  ownerEmail?: string
): Promise<string> {
  const clean = (rawUrlOrData || '').trim();
  if (!clean) return '';

  if (clean.startsWith('data:')) {
    const uploaded = await uploadDataUrlToCloudMedia(
      schoolId,
      clean,
      category,
      recordRef,
      authorizedEmails,
      ownerEmail
    );
    return uploaded.storedUrl;
  }

  return clean.slice(0, 2048);
}
