import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  doc,
  Firestore,
  getDoc,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNTANT_MAX_LIMIT,
  AiCustomizationSettings,
  DEFAULT_AI_CUSTOMIZATION,
  DynamicCloudBinding,
  InvitableSchoolRole,
  MasterAccountProfile,
  SchoolDatabase,
  SchoolMemberRecord,
  SchoolRole,
  SchoolTenantMeta,
  StaffInviteRecord,
} from '../types/erp';
import {
  clampStr,
  ensureFirestoreNetworkOnline,
  firebaseAuth,
  firestoreDb,
  handleFirestoreError,
  isOfflineNetworkError,
  OperationType,
  toSafeDocId,
} from '../lib/firebase';

export const SUPABASE_SETUP_SQL = `-- Run once in your Supabase Project -> SQL Editor:
CREATE TABLE IF NOT EXISTS public.school_erp_tenants (
  school_id TEXT PRIMARY KEY,
  school_name TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.school_erp_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated school ERP sync"
  ON public.school_erp_tenants
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);`;

export interface ExternalCloudTenantEnvelope {
  schoolId: string;
  tenantMeta: SchoolTenantMeta;
  database: SchoolDatabase;
  uiCustomization: AiCustomizationSettings;
  members: SchoolMemberRecord[];
  invites: StaffInviteRecord[];
  updatedAt: string;
}

export interface DecodedDynamicInviteToken {
  schoolId: string;
  inviteId: string;
  schoolName: string;
  invitedEmail: string;
  invitedName: string;
  role: InvitableSchoolRole;
  binding: DynamicCloudBinding;
}

const supabaseClientsCache = new Map<string, SupabaseClient>();
const dynamicFirebaseDbCache = new Map<string, Firestore>();

export function normalizeCloudBinding(raw?: Partial<DynamicCloudBinding> | null): DynamicCloudBinding {
  const provider =
    raw?.provider === 'supabase' || raw?.provider === 'firebase' ? raw.provider : 'managed';
  let apiUrl = clampStr(raw?.apiUrl, 500);
  let publicKey = clampStr(raw?.publicKey, 2000);
  let firebaseProjectId = clampStr(raw?.firebaseProjectId, 128);
  let firebaseAuthDomain = clampStr(raw?.firebaseAuthDomain, 254);
  const firebaseDatabaseId = clampStr(raw?.firebaseDatabaseId, 128);
  let firebaseAppId = clampStr(raw?.firebaseAppId, 160);
  let firebaseStorageBucket = clampStr(raw?.firebaseStorageBucket, 254);

  if (provider === 'firebase') {
    // Allow pasting a JSON snippet in apiUrl or publicKey if user copied firebaseConfig
    const trimmedUrl = apiUrl.trim();
    if (trimmedUrl.startsWith('{') && trimmedUrl.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmedUrl) as Record<string, string>;
        if (parsed.apiKey && !publicKey) publicKey = clampStr(parsed.apiKey, 2000);
        if (parsed.projectId) firebaseProjectId = clampStr(parsed.projectId, 128);
        if (parsed.authDomain) firebaseAuthDomain = clampStr(parsed.authDomain, 254);
        if (parsed.appId) firebaseAppId = clampStr(parsed.appId, 160);
        if (parsed.storageBucket) firebaseStorageBucket = clampStr(parsed.storageBucket, 254);
        apiUrl = `https://${firebaseProjectId}.firebaseio.com`;
      } catch {
        // Keep raw value
      }
    }

    if (!firebaseProjectId && apiUrl) {
      // Extract projectId from https://<project-id>.firebaseio.com or https://<project-id>.web.app or plain project-id
      const cleaned = apiUrl
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .replace(/\.firebaseio\.com$/i, '')
        .replace(/\.firebaseapp\.com$/i, '')
        .replace(/\.web\.app$/i, '')
        .trim();
      if (/^[a-zA-Z0-9_-]+$/.test(cleaned)) {
        firebaseProjectId = clampStr(cleaned, 128);
      }
    }

    if (firebaseProjectId && !firebaseAuthDomain) {
      firebaseAuthDomain = `${firebaseProjectId}.firebaseapp.com`;
    }
    if (firebaseProjectId && !apiUrl) {
      apiUrl = `https://${firebaseProjectId}.firebaseio.com`;
    }
  }

  if (provider === 'supabase' && apiUrl) {
    apiUrl = apiUrl.replace(/\/+$/, '');
  }

  return {
    provider,
    apiUrl,
    publicKey,
    firebaseProjectId,
    firebaseAuthDomain,
    firebaseDatabaseId,
    firebaseAppId,
    firebaseStorageBucket,
  };
}

export function isExternalDynamicCloud(binding?: DynamicCloudBinding | null): boolean {
  if (!binding) return false;
  if (binding.provider === 'supabase') {
    return Boolean(binding.apiUrl && binding.publicKey);
  }
  if (binding.provider === 'firebase') {
    const norm = normalizeCloudBinding(binding);
    return Boolean(norm.firebaseProjectId && norm.publicKey);
  }
  return false;
}

function formatTs(val: unknown): string {
  if (val && typeof (val as Timestamp).toDate === 'function') {
    return (val as Timestamp).toDate().toISOString();
  }
  return typeof val === 'string' && val ? val : new Date().toISOString();
}

// ============================================================================
// 1. MASTER ACCOUNT DIRECTORY (/master_accounts/{uid})
// ============================================================================

export async function fetchMasterAccountProfile(uid: string): Promise<MasterAccountProfile | null> {
  const safeUid = toSafeDocId(uid);
  const path = `master_accounts/${safeUid}`;
  const docRef = doc(firestoreDb, 'master_accounts', safeUid);

  const attemptRead = async () => {
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid: d.uid || safeUid,
      email: d.email || '',
      displayName: d.displayName || '',
      activeSchoolId: d.activeSchoolId || '',
      schoolName: d.schoolName || '',
      role: (d.role as SchoolRole) || 'main_admin',
      binding: normalizeCloudBinding({
        provider: d.cloudProvider,
        apiUrl: d.cloudApiUrl,
        publicKey: d.cloudPublicKey,
        firebaseProjectId: d.firebaseProjectId,
        firebaseAuthDomain: d.firebaseAuthDomain,
        firebaseDatabaseId: d.firebaseDatabaseId,
        firebaseAppId: d.firebaseAppId,
        firebaseStorageBucket: d.firebaseStorageBucket,
      }),
      createdAt: formatTs(d.createdAt),
      updatedAt: formatTs(d.updatedAt),
    };
  };

  try {
    return await attemptRead();
  } catch (err) {
    if (isOfflineNetworkError(err)) {
      await ensureFirestoreNetworkOnline(firestoreDb);
      await new Promise((r) => setTimeout(r, 700));
      try {
        return await attemptRead();
      } catch {
        return null;
      }
    }
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveMasterAccountProfile(input: {
  uid: string;
  email: string;
  displayName: string;
  activeSchoolId: string;
  schoolName: string;
  role: SchoolRole;
  binding: DynamicCloudBinding;
}): Promise<void> {
  const safeUid = toSafeDocId(input.uid);
  const path = `master_accounts/${safeUid}`;
  const docRef = doc(firestoreDb, 'master_accounts', safeUid);
  const norm = normalizeCloudBinding(input.binding);

  let createdAtValue: unknown = serverTimestamp();
  try {
    const existing = await getDoc(docRef);
    if (existing.exists() && existing.data().createdAt) {
      createdAtValue = existing.data().createdAt;
    }
  } catch {
    // New document
  }

  const payload = {
    uid: safeUid,
    email: clampStr(input.email.toLowerCase(), 254),
    displayName: clampStr(input.displayName, 120),
    activeSchoolId: toSafeDocId(input.activeSchoolId),
    schoolName: clampStr(input.schoolName, 120, 'School ERP'),
    role: input.role,
    cloudProvider: norm.provider,
    cloudApiUrl: clampStr(norm.apiUrl, 500),
    cloudPublicKey: clampStr(norm.publicKey, 2000),
    firebaseProjectId: clampStr(norm.firebaseProjectId, 128),
    firebaseAuthDomain: clampStr(norm.firebaseAuthDomain, 254),
    firebaseDatabaseId: clampStr(norm.firebaseDatabaseId, 128),
    firebaseAppId: clampStr(norm.firebaseAppId, 160),
    firebaseStorageBucket: clampStr(norm.firebaseStorageBucket, 254),
    createdAt: createdAtValue,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(docRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ============================================================================
// 2. INVITE LINK DYNAMIC CLOUD TOKEN ENCODING & DECODING
// ============================================================================

export function encodeDynamicCloudInviteToken(payload: DecodedDynamicInviteToken): string {
  try {
    const compact = {
      s: payload.schoolId,
      i: payload.inviteId,
      n: payload.schoolName,
      e: payload.invitedEmail.trim().toLowerCase(),
      u: payload.invitedName,
      r: payload.role,
      p: payload.binding.provider,
      a: payload.binding.apiUrl,
      k: payload.binding.publicKey,
      fp: payload.binding.firebaseProjectId || '',
      fd: payload.binding.firebaseDatabaseId || '',
    };
    const json = JSON.stringify(compact);
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

export function decodeDynamicCloudInviteToken(token: string): DecodedDynamicInviteToken | null {
  if (!token) return null;
  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, string>;
    if (!parsed.s || !parsed.i || !parsed.e || !parsed.r) return null;
    if (!['accountant', 'teacher', 'director'].includes(parsed.r)) return null;
    return {
      schoolId: toSafeDocId(parsed.s),
      inviteId: toSafeDocId(parsed.i),
      schoolName: clampStr(parsed.n, 120, 'School Workspace'),
      invitedEmail: clampStr(parsed.e.toLowerCase(), 254),
      invitedName: clampStr(parsed.u, 120),
      role: parsed.r as InvitableSchoolRole,
      binding: normalizeCloudBinding({
        provider: (parsed.p as DynamicCloudBinding['provider']) || 'managed',
        apiUrl: parsed.a || '',
        publicKey: parsed.k || '',
        firebaseProjectId: parsed.fp || '',
        firebaseDatabaseId: parsed.fd || '',
      }),
    };
  } catch {
    return null;
  }
}

// ============================================================================
// 3. DYNAMIC SUPABASE & USER-OWNED FIREBASE CLIENT DRIVERS
// ============================================================================

function getDynamicSupabaseClient(binding: DynamicCloudBinding): SupabaseClient {
  const norm = normalizeCloudBinding(binding);
  const key = `${norm.apiUrl}::${norm.publicKey}`;
  const cached = supabaseClientsCache.get(key);
  if (cached) return cached;
  const client = createClient(norm.apiUrl, norm.publicKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  supabaseClientsCache.set(key, client);
  return client;
}

function getDynamicFirebaseFirestore(binding: DynamicCloudBinding): Firestore {
  const norm = normalizeCloudBinding(binding);
  const appName = `owner_cloud_${toSafeDocId(norm.firebaseProjectId || 'ext')}_${norm.publicKey.slice(0, 8)}`;
  const cacheKey = `${appName}::${norm.firebaseDatabaseId || '(default)'}`;
  const existingDb = dynamicFirebaseDbCache.get(cacheKey);
  if (existingDb) return existingDb;

  const existingApp: FirebaseApp | undefined = getApps().find((a) => a.name === appName);
  const app =
    existingApp ||
    initializeApp(
      {
        apiKey: norm.publicKey,
        projectId: norm.firebaseProjectId,
        authDomain: norm.firebaseAuthDomain || `${norm.firebaseProjectId}.firebaseapp.com`,
        ...(norm.firebaseAppId ? { appId: norm.firebaseAppId } : {}),
        ...(norm.firebaseStorageBucket ? { storageBucket: norm.firebaseStorageBucket } : {}),
      },
      appName
    );

  let dbInstance: Firestore;
  try {
    dbInstance = norm.firebaseDatabaseId
      ? initializeFirestore(
          app,
          {
            experimentalForceLongPolling: true,
            experimentalLongPollingOptions: { timeoutSeconds: 25 },
            ignoreUndefinedProperties: true,
          },
          norm.firebaseDatabaseId
        )
      : initializeFirestore(app, {
          experimentalForceLongPolling: true,
          experimentalLongPollingOptions: { timeoutSeconds: 25 },
          ignoreUndefinedProperties: true,
        });
  } catch {
    dbInstance = norm.firebaseDatabaseId
      ? getFirestore(app, norm.firebaseDatabaseId)
      : getFirestore(app);
  }

  dynamicFirebaseDbCache.set(cacheKey, dbInstance);
  return dbInstance;
}

export async function testDynamicCloudConnection(binding: DynamicCloudBinding): Promise<{
  ok: boolean;
  needsSupabaseTable?: boolean;
  message: string;
}> {
  const norm = normalizeCloudBinding(binding);
  if (norm.provider === 'managed') {
    return {
      ok: true,
      message: 'Connected to Built-in Multi-Tenant Cloud Firestore.',
    };
  }

  if (norm.provider === 'supabase') {
    if (!norm.apiUrl.startsWith('https://') || !norm.publicKey) {
      return {
        ok: false,
        message: 'Enter a valid https://<project>.supabase.co URL and Public Anon Key.',
      };
    }
    try {
      const supabase = getDynamicSupabaseClient(norm);
      const { error } = await supabase
        .from('school_erp_tenants')
        .select('school_id')
        .limit(1);

      if (error) {
        const msg = error.message || '';
        if (
          msg.includes('school_erp_tenants') ||
          msg.includes('does not exist') ||
          error.code === '42P01' ||
          error.code === 'PGRST205'
        ) {
          return {
            ok: false,
            needsSupabaseTable: true,
            message:
              'Supabase API keys verified! Run the 1-click SQL table setup below in your Supabase SQL Editor to create "school_erp_tenants", then click Test Connection again.',
          };
        }
        return {
          ok: false,
          message: `Supabase connection error: ${msg}`,
        };
      }
      return {
        ok: true,
        message: 'Supabase Cloud Database verified and ready for live ERP storage.',
      };
    } catch (err) {
      return {
        ok: false,
        message: `Could not reach Supabase URL: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // User-Owned Firebase
  if (!norm.firebaseProjectId || !norm.publicKey) {
    return {
      ok: false,
      message: 'Enter your Firebase Project ID / URL and Public Web API Key (AIza...).',
    };
  }

  try {
    const extDb = getDynamicFirebaseFirestore(norm);
    await getDoc(doc(extDb, 'erp_workspaces', '_connection_probe'));
    return {
      ok: true,
      message: `Connected to Firebase Project "${norm.firebaseProjectId}" successfully.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
      return {
        ok: false,
        message: `Reached Firebase project "${norm.firebaseProjectId}", but Firestore rules blocked access to /erp_workspaces/{schoolId}. Allow read/write on match /erp_workspaces/{schoolId} in your Firebase Firestore Rules.`,
      };
    }
    return {
      ok: false,
      message: `Firebase connection check failed: ${msg}`,
    };
  }
}

export async function loadExternalCloudSnapshot(
  schoolId: string,
  binding: DynamicCloudBinding
): Promise<ExternalCloudTenantEnvelope | null> {
  const norm = normalizeCloudBinding(binding);
  const safeSchoolId = toSafeDocId(schoolId);

  if (norm.provider === 'supabase') {
    const supabase = getDynamicSupabaseClient(norm);
    const { data, error } = await supabase
      .from('school_erp_tenants')
      .select('school_id, school_name, payload, updated_at')
      .eq('school_id', safeSchoolId)
      .maybeSingle();

    if (error) {
      throw new Error(`Supabase read error: ${error.message}`);
    }
    if (!data || !data.payload) return null;
    const p = data.payload as Partial<ExternalCloudTenantEnvelope>;
    if (!p.database || !p.tenantMeta) return null;
    return {
      schoolId: safeSchoolId,
      tenantMeta: p.tenantMeta,
      database: p.database,
      uiCustomization: p.uiCustomization || DEFAULT_AI_CUSTOMIZATION,
      members: Array.isArray(p.members) ? p.members : [],
      invites: Array.isArray(p.invites) ? p.invites : [],
      updatedAt: data.updated_at || p.updatedAt || new Date().toISOString(),
    };
  }

  if (norm.provider === 'firebase') {
    const extDb = getDynamicFirebaseFirestore(norm);
    const snap = await getDoc(doc(extDb, 'erp_workspaces', safeSchoolId));
    if (!snap.exists()) return null;
    const raw = snap.data();
    const p =
      typeof raw.payloadJson === 'string'
        ? (JSON.parse(raw.payloadJson) as Partial<ExternalCloudTenantEnvelope>)
        : (raw as Partial<ExternalCloudTenantEnvelope>);
    if (!p.database || !p.tenantMeta) return null;
    return {
      schoolId: safeSchoolId,
      tenantMeta: p.tenantMeta,
      database: p.database,
      uiCustomization: p.uiCustomization || DEFAULT_AI_CUSTOMIZATION,
      members: Array.isArray(p.members) ? p.members : [],
      invites: Array.isArray(p.invites) ? p.invites : [],
      updatedAt: raw.updatedAtIso || p.updatedAt || new Date().toISOString(),
    };
  }

  return null;
}

export async function saveExternalCloudSnapshot(
  schoolId: string,
  binding: DynamicCloudBinding,
  envelope: ExternalCloudTenantEnvelope
): Promise<void> {
  const norm = normalizeCloudBinding(binding);
  const safeSchoolId = toSafeDocId(schoolId);
  const nowIso = new Date().toISOString();
  const cleanEnvelope: ExternalCloudTenantEnvelope = {
    ...envelope,
    schoolId: safeSchoolId,
    updatedAt: nowIso,
  };

  if (norm.provider === 'supabase') {
    const supabase = getDynamicSupabaseClient(norm);
    const { error } = await supabase.from('school_erp_tenants').upsert(
      {
        school_id: safeSchoolId,
        school_name: cleanEnvelope.tenantMeta.schoolName || 'School ERP',
        payload: cleanEnvelope,
        updated_at: nowIso,
      },
      { onConflict: 'school_id' }
    );
    if (error) {
      throw new Error(`Supabase write error: ${error.message}`);
    }
    return;
  }

  if (norm.provider === 'firebase') {
    const extDb = getDynamicFirebaseFirestore(norm);
    await setDoc(doc(extDb, 'erp_workspaces', safeSchoolId), {
      schoolId: safeSchoolId,
      schoolName: cleanEnvelope.tenantMeta.schoolName || 'School ERP',
      payloadJson: JSON.stringify(cleanEnvelope),
      updatedAtIso: nowIso,
      updatedByEmail: firebaseAuth.currentUser?.email || '',
    });
  }
}

export function subscribeExternalCloudSnapshot(
  schoolId: string,
  binding: DynamicCloudBinding,
  onUpdate: (envelope: ExternalCloudTenantEnvelope) => void
): () => void {
  const norm = normalizeCloudBinding(binding);
  const safeSchoolId = toSafeDocId(schoolId);

  if (norm.provider === 'firebase') {
    const extDb = getDynamicFirebaseFirestore(norm);
    return onSnapshot(
      doc(extDb, 'erp_workspaces', safeSchoolId),
      (snap) => {
        if (!snap.exists()) return;
        try {
          const raw = snap.data();
          const p =
            typeof raw.payloadJson === 'string'
              ? (JSON.parse(raw.payloadJson) as Partial<ExternalCloudTenantEnvelope>)
              : (raw as Partial<ExternalCloudTenantEnvelope>);
          if (p.database && p.tenantMeta) {
            onUpdate({
              schoolId: safeSchoolId,
              tenantMeta: p.tenantMeta,
              database: p.database,
              uiCustomization: p.uiCustomization || DEFAULT_AI_CUSTOMIZATION,
              members: Array.isArray(p.members) ? p.members : [],
              invites: Array.isArray(p.invites) ? p.invites : [],
              updatedAt: raw.updatedAtIso || p.updatedAt || new Date().toISOString(),
            });
          }
        } catch {
          // Ignore malformed snapshot
        }
      },
      (err) => {
        console.warn('External Firebase listener warning:', err);
      }
    );
  }

  if (norm.provider === 'supabase') {
    let active = true;
    let lastUpdatedSeen = '';
    const poll = async () => {
      if (!active) return;
      try {
        const snap = await loadExternalCloudSnapshot(safeSchoolId, norm);
        if (snap && snap.updatedAt && snap.updatedAt !== lastUpdatedSeen) {
          lastUpdatedSeen = snap.updatedAt;
          onUpdate(snap);
        }
      } catch {
        // Ignore transient poll errors
      }
    };
    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 8000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }

  return () => {};
}

export async function claimExternalCloudStaffInvite(input: {
  decoded: DecodedDynamicInviteToken;
  uid: string;
  email: string;
  displayName: string;
}): Promise<{ ok: boolean; role?: SchoolRole; schoolName?: string; error?: string }> {
  const { decoded, uid, email, displayName } = input;
  if (email.trim().toLowerCase() !== decoded.invitedEmail.trim().toLowerCase()) {
    return {
      ok: false,
      error: `This invite was issued for ${decoded.invitedEmail}. Please sign in with that exact email address.`,
    };
  }

  try {
    const existing = await loadExternalCloudSnapshot(decoded.schoolId, decoded.binding);
    if (!existing) {
      return {
        ok: false,
        error: 'Could not find the invited school workspace in the bound cloud database.',
      };
    }

    const inviteMatch = existing.invites.find((inv) => inv.id === decoded.inviteId);
    if (!inviteMatch || inviteMatch.status !== 'pending') {
      const alreadyMember = existing.members.find(
        (m) => m.uid === uid || m.email.toLowerCase() === email.trim().toLowerCase()
      );
      if (alreadyMember) {
        return {
          ok: true,
          role: alreadyMember.role,
          schoolName: existing.tenantMeta.schoolName,
        };
      }
      return {
        ok: false,
        error: 'This staff invitation has already been claimed or revoked by Main Admin.',
      };
    }

    const activeAccountants = existing.members.filter((m) => m.role === 'accountant').length;
    if (inviteMatch.role === 'accountant' && activeAccountants >= ACCOUNTANT_MAX_LIMIT) {
      return {
        ok: false,
        error: `Accountant quota reached (Max ${ACCOUNTANT_MAX_LIMIT} active Accountants per school).`,
      };
    }

    const nowIso = new Date().toISOString();
    const newMember: SchoolMemberRecord = {
      uid,
      schoolId: decoded.schoolId,
      ownerUid: existing.tenantMeta.ownerUid,
      email: email.trim().toLowerCase(),
      displayName: displayName || inviteMatch.invitedName || email.split('@')[0],
      role: inviteMatch.role,
      inviteId: inviteMatch.id,
      addedByUid: inviteMatch.invitedByUid,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const updatedMembers = [
      ...existing.members.filter((m) => m.uid !== uid),
      newMember,
    ];
    const updatedInvites = existing.invites.map((inv) =>
      inv.id === inviteMatch.id
        ? { ...inv, status: 'accepted' as const, acceptedByUid: uid, updatedAt: nowIso }
        : inv
    );
    const nextAccountantCount = updatedMembers.filter((m) => m.role === 'accountant').length;

    await saveExternalCloudSnapshot(decoded.schoolId, decoded.binding, {
      ...existing,
      tenantMeta: {
        ...existing.tenantMeta,
        accountantCount: nextAccountantCount,
      },
      members: updatedMembers,
      invites: updatedInvites,
      updatedAt: nowIso,
    });

    return {
      ok: true,
      role: inviteMatch.role,
      schoolName: existing.tenantMeta.schoolName,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to claim dynamic cloud invite.',
    };
  }
}
