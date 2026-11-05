import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  enableNetwork,
  Firestore,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'niteshravi8603@gmail.com';
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;
export const FIREBASE_STORAGE_BUCKET = firebaseConfig.storageBucket || '';

export const firebaseApp = initializeApp(firebaseConfig);

function createMasterFirestoreInstance(): Firestore {
  if (typeof window !== 'undefined') {
    try {
      return initializeFirestore(
        firebaseApp,
        {
          experimentalForceLongPolling: true,
          experimentalLongPollingOptions: {
            timeoutSeconds: 25,
          },
          ignoreUndefinedProperties: true,
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      return getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
    }
  }
  return getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
}

export const firestoreDb = createMasterFirestoreInstance();
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseStorage = getStorage(firebaseApp);

export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({
  prompt: 'select_account',
});

export {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: firebaseAuth.currentUser?.uid,
      email: firebaseAuth.currentUser?.email,
      emailVerified: firebaseAuth.currentUser?.emailVerified,
      isAnonymous: firebaseAuth.currentUser?.isAnonymous,
      tenantId: firebaseAuth.currentUser?.tenantId,
      providerInfo:
        firebaseAuth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function isQuotaExceededError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('Quota exceeded') || msg.includes('resource-exhausted');
}

export function isOfflineNetworkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('the client is offline') ||
    msg.includes('Could not reach Cloud Firestore backend') ||
    msg.includes('unavailable')
  );
}

export async function ensureFirestoreNetworkOnline(dbInstance: Firestore = firestoreDb): Promise<void> {
  try {
    await enableNetwork(dbInstance);
  } catch {
    // Ignore if already online
  }
}

export function toSafeDocId(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return cleaned || `doc_${Date.now()}`;
}

export function getMembershipDocId(uid: string, schoolId: string): string {
  return toSafeDocId(`${uid}_${schoolId}`);
}

export function clampStr(val: unknown, maxLength: number, fallback = ''): string {
  const str = val !== undefined && val !== null ? String(val).trim() : fallback;
  return str.slice(0, maxLength);
}

/**
 * Normalizes a school tenant's authorizedEmails list (up to 100 entries) without
 * injecting external tenants' emails, preserving strict multi-tenant RLS isolation.
 */
export function normalizeAuthorizedEmailsList(
  rawEmails?: string[],
  ownerEmail?: string
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const pushValidEmail = (candidate: unknown) => {
    const exact = String(candidate || '').trim().slice(0, 254);
    if (!exact || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(exact)) return;
    const lower = exact.toLowerCase();
    if (!seen.has(lower) && result.length < 100) {
      seen.add(lower);
      result.push(lower);
    }
    if (exact !== lower && !seen.has(exact) && result.length < 100) {
      seen.add(exact);
      result.push(exact);
    }
  };

  if (ownerEmail) {
    pushValidEmail(ownerEmail);
  }

  if (Array.isArray(rawEmails)) {
    for (const item of rawEmails) {
      pushValidEmail(item);
      if (result.length >= 100) break;
    }
  }

  if (result.length === 0) {
    const activeEmail = firebaseAuth.currentUser?.email;
    if (activeEmail) {
      pushValidEmail(activeEmail);
    } else {
      pushValidEmail(BOOTSTRAPPED_ADMIN_EMAIL);
    }
  }

  return result;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void ensureFirestoreNetworkOnline(firestoreDb);
  });
}

async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline') &&
      (typeof navigator === 'undefined' || navigator.onLine !== false)
    ) {
      console.warn('Firestore initial probe offline; re-enabling long-polling transport...');
      await ensureFirestoreNetworkOnline(firestoreDb);
    }
  }
}

void testFirestoreConnection();
