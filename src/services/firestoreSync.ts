import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  ACCOUNTANT_MAX_LIMIT,
  AcademicSessionConfig,
  AiAccentTheme,
  AiCustomizationSettings,
  ClassAllocation,
  ClassSessionFeeRate,
  CustomStudentFieldDef,
  DailyAttendanceSheet,
  DEFAULT_AI_CUSTOMIZATION,
  ExamDefinition,
  ExamGradeRecord,
  FeeMonth,
  FeeReceiptStyle,
  FeeRecord,
  InvitableSchoolRole,
  MarksheetLayoutStyle,
  NoticeItem,
  SchoolDatabase,
  SchoolMemberRecord,
  SchoolRole,
  SchoolTenantMeta,
  StaffInviteRecord,
  StaffMember,
  StudentExamMarksheet,
  StudentRecord,
  SubscriptionPlan,
  SubscriptionStatus,
  TransportRoute,
  UserSchoolMembership,
} from '../types/erp';
import {
  clampStr,
  ensureFirestoreNetworkOnline,
  firestoreDb,
  getMembershipDocId,
  handleFirestoreError,
  isOfflineNetworkError,
  normalizeAuthorizedEmailsList,
  OperationType,
  toSafeDocId,
} from '../lib/firebase';
import { ensureCompactCloudMediaUrl } from './cloudStorage';

export interface CloudSchoolTenantDoc {
  id: string;
  schoolName: string;
  tagline: string;
  logoUrl: string;
  address: string;
  phone: string;
  alternatePhone: string;
  email: string;
  website: string;
  directorName: string;
  principalName: string;
  affiliationNo: string;
  ownerUid: string;
  ownerEmail: string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  accountantCount: number;
  activeSession: string;
  billingCutoffMonth: FeeMonth;
  studentSeq: number;
  receiptSeq: number;
  staffSeq: number;
  examSeq: number;
  customDesignations: string[];
  authorizedEmails: string[];
  createdByUid: string;
  updatedByUid: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export const TENANT_OPERATIONAL_COLLECTIONS = [
  'sessions',
  'fee_schedules',
  'students',
  'fees',
  'routes',
  'staff',
  'classes',
  'attendance',
  'exams',
  'marksheets',
  'grades',
  'notices',
  'media_files',
] as const;

export function getFeeScheduleDocId(className: string, academicSession: string): string {
  return toSafeDocId(`fs_${className}__${academicSession}`);
}

export function getAttendanceDocId(sheetKey: string): string {
  return toSafeDocId(`att_${sheetKey}`);
}

function formatFirestoreTimestamp(val: unknown): string {
  if (val && typeof (val as Timestamp).toDate === 'function') {
    return (val as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

async function getTenantSubdocAuditMeta(
  schoolId: string,
  collectionName: string,
  docId: string,
  currentUid: string
): Promise<{ createdByUid: string; createdAt: unknown }> {
  const targetRef = doc(firestoreDb, 'schools', schoolId, collectionName, docId);
  try {
    const existing = await getDoc(targetRef);
    if (existing.exists()) {
      const data = existing.data();
      if (data.createdAt && typeof data.createdByUid === 'string') {
        return {
          createdByUid: data.createdByUid,
          createdAt: data.createdAt,
        };
      }
    }
  } catch {
    // New document -> use serverTimestamp()
  }
  return {
    createdByUid: currentUid,
    createdAt: serverTimestamp(),
  };
}

// ============================================================================
// 1. MULTI-TENANT MEMBERSHIP DISCOVERY, REGISTRATION & STAFF INVITE WORKFLOWS
// ============================================================================

export async function fetchUserMemberships(uid: string): Promise<UserSchoolMembership[]> {
  const path = 'user_memberships';
  const runQuery = async () => {
    const q = query(collection(firestoreDb, 'user_memberships'), where('uid', '==', uid));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: data.id || d.id,
          uid: data.uid,
          email: data.email,
          displayName: data.displayName || '',
          schoolId: data.schoolId,
          schoolName: data.schoolName || 'School Workspace',
          role: (data.role as SchoolRole) || 'teacher',
          createdAt: formatFirestoreTimestamp(data.createdAt),
          updatedAt: formatFirestoreTimestamp(data.updatedAt),
        };
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  };

  try {
    return await runQuery();
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      await ensureFirestoreNetworkOnline(firestoreDb);
      await new Promise((r) => setTimeout(r, 800));
      try {
        return await runQuery();
      } catch (retryErr) {
        handleFirestoreError(retryErr, OperationType.LIST, path);
      }
    }
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchMemberRoleDoc(
  schoolId: string,
  uid: string
): Promise<SchoolMemberRecord | null> {
  const safeSchoolId = toSafeDocId(schoolId);
  const path = `schools/${safeSchoolId}/members/${uid}`;
  try {
    const snap = await getDoc(doc(firestoreDb, 'schools', safeSchoolId, 'members', uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      uid: data.uid || uid,
      schoolId: data.schoolId || safeSchoolId,
      ownerUid: data.ownerUid || '',
      email: data.email || '',
      displayName: data.displayName || '',
      role: (data.role as SchoolRole) || 'teacher',
      inviteId: data.inviteId || '',
      addedByUid: data.addedByUid || '',
      createdAt: formatFirestoreTimestamp(data.createdAt),
      updatedAt: formatFirestoreTimestamp(data.updatedAt),
    };
  } catch {
    return null;
  }
}

export interface RegisterSchoolTenantInput {
  schoolName: string;
  tagline?: string;
  address?: string;
  phone?: string;
  principalName?: string;
  directorName?: string;
  subscriptionPlan?: SubscriptionPlan;
  adminDisplayName?: string;
}

/**
 * Registers a brand-new Multi-Tenant School Workspace (`/schools/{schoolId}`),
 * assigns the creator as sole `main_admin` (`/schools/{schoolId}/members/{uid}`),
 * indexes their workspace membership (`/user_memberships/{uid_schoolId}`), and
 * seeds default academic sessions, classes, and fee schedules.
 */
export async function registerNewSchoolTenant(
  input: RegisterSchoolTenantInput,
  user: { uid: string; email: string; displayName?: string | null },
  seedDb: SchoolDatabase
): Promise<{ schoolId: string; membership: UserSchoolMembership }> {
  const schoolId = toSafeDocId(
    `sch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  const uid = user.uid;
  const ownerEmail = user.email.trim().toLowerCase();
  const cleanSchoolName = clampStr(input.schoolName, 120, 'My School ERP') || 'My School ERP';
  const cleanTagline = clampStr(
    input.tagline ?? seedDb.schoolProfile.tagline,
    180,
    'Recognized Educational Institution'
  );
  const cleanAddress = clampStr(input.address ?? seedDb.schoolProfile.address, 300);
  const cleanPhone = clampStr(input.phone ?? seedDb.schoolProfile.phone, 32);
  const cleanPrincipal = clampStr(
    input.principalName ?? seedDb.schoolProfile.principalName,
    120
  );
  const cleanDirector = clampStr(
    input.directorName ?? seedDb.schoolProfile.directorName,
    120
  );
  const plan: SubscriptionPlan =
    input.subscriptionPlan && ['Starter', 'Standard', 'Enterprise'].includes(input.subscriptionPlan)
      ? input.subscriptionPlan
      : 'Enterprise';
  const displayName =
    clampStr(
      input.adminDisplayName || user.displayName || ownerEmail.split('@')[0],
      120,
      'Main Admin'
    ) || 'Main Admin';

  const cleanEmails = normalizeAuthorizedEmailsList([ownerEmail, user.email.trim()], ownerEmail);
  const membershipId = getMembershipDocId(uid, schoolId);
  const designations = (seedDb.customDesignations || [])
    .map((d) => clampStr(d, 80))
    .filter(Boolean)
    .slice(0, 50);

  const batch = writeBatch(firestoreDb);

  // 1. Tenant Root Document
  batch.set(doc(firestoreDb, 'schools', schoolId), {
    id: schoolId,
    schoolName: cleanSchoolName,
    tagline: cleanTagline,
    logoUrl: '',
    address: cleanAddress,
    phone: cleanPhone,
    alternatePhone: clampStr(seedDb.schoolProfile.alternatePhone, 32),
    email: clampStr(seedDb.schoolProfile.email || ownerEmail, 254),
    website: clampStr(seedDb.schoolProfile.website, 200),
    directorName: cleanDirector,
    principalName: cleanPrincipal,
    affiliationNo: clampStr(seedDb.schoolProfile.affiliationNo, 80),
    ownerUid: uid,
    ownerEmail,
    subscriptionPlan: plan,
    subscriptionStatus: 'Active',
    accountantCount: 0,
    activeSession: clampStr(seedDb.activeSession, 32, '2026-2027') || '2026-2027',
    billingCutoffMonth: seedDb.billingCutoffMonth || 'April',
    studentSeq: Math.max(1, Math.min(9999999, Math.round(seedDb.counters.studentSeq || 1001))),
    receiptSeq: Math.max(1, Math.min(99999999, Math.round(seedDb.counters.receiptSeq || 90001))),
    staffSeq: Math.max(1, Math.min(9999999, Math.round(seedDb.counters.staffSeq || 101))),
    examSeq: Math.max(1, Math.min(9999999, Math.round(seedDb.counters.examSeq || 101))),
    customDesignations: designations,
    authorizedEmails: cleanEmails,
    createdByUid: uid,
    updatedByUid: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 2. Main Admin RBAC Seat
  batch.set(doc(firestoreDb, 'schools', schoolId, 'members', uid), {
    uid,
    schoolId,
    ownerUid: uid,
    email: ownerEmail,
    displayName,
    role: 'main_admin',
    inviteId: 'owner_bootstrap',
    addedByUid: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 3. User Membership Discovery Index
  batch.set(doc(firestoreDb, 'user_memberships', membershipId), {
    id: membershipId,
    uid,
    email: ownerEmail,
    displayName,
    schoolId,
    schoolName: cleanSchoolName,
    role: 'main_admin',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `schools/${schoolId}`);
  }

  // Seed default sessions, classes, fee schedules (and any migrated local records)
  const seededSnapshot: SchoolDatabase = {
    ...seedDb,
    schoolProfile: {
      ...seedDb.schoolProfile,
      schoolName: cleanSchoolName,
      tagline: cleanTagline,
      address: cleanAddress,
      phone: cleanPhone,
      principalName: cleanPrincipal,
      directorName: cleanDirector,
      email: seedDb.schoolProfile.email || ownerEmail,
    },
  };

  await syncEntireDatabaseToCloud(
    schoolId,
    seededSnapshot,
    cleanEmails,
    uid,
    ownerEmail,
    ownerEmail,
    false
  );

  const nowIso = new Date().toISOString();
  return {
    schoolId,
    membership: {
      id: membershipId,
      uid,
      email: ownerEmail,
      displayName,
      schoolId,
      schoolName: cleanSchoolName,
      role: 'main_admin',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  };
}

export async function fetchPendingInviteDetails(
  schoolId: string,
  inviteId: string
): Promise<{
  status: 'found' | 'not_found' | 'email_mismatch';
  invite?: StaffInviteRecord;
}> {
  const safeSchoolId = toSafeDocId(schoolId);
  const safeInviteId = toSafeDocId(inviteId);
  try {
    const snap = await getDoc(
      doc(firestoreDb, 'schools', safeSchoolId, 'invites', safeInviteId)
    );
    if (!snap.exists()) {
      return { status: 'not_found' };
    }
    const data = snap.data();
    return {
      status: 'found',
      invite: {
        id: data.id || snap.id,
        schoolId: data.schoolId || safeSchoolId,
        schoolName: data.schoolName || 'School Workspace',
        invitedName: data.invitedName || '',
        invitedEmail: data.invitedEmail || '',
        role: data.role as InvitableSchoolRole,
        status: data.status,
        invitedByUid: data.invitedByUid,
        invitedByEmail: data.invitedByEmail,
        acceptedByUid: data.acceptedByUid || '',
        createdAt: formatFirestoreTimestamp(data.createdAt),
        updatedAt: formatFirestoreTimestamp(data.updatedAt),
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.toLowerCase().includes('missing or insufficient permissions') ||
      msg.toLowerCase().includes('permission-denied')
    ) {
      return { status: 'email_mismatch' };
    }
    handleFirestoreError(
      error,
      OperationType.GET,
      `schools/${safeSchoolId}/invites/${safeInviteId}`
    );
  }
}

export interface CreateStaffInviteParams {
  schoolId: string;
  schoolName: string;
  ownerEmail: string;
  invitedName: string;
  invitedEmail: string;
  role: InvitableSchoolRole;
  currentUid: string;
  currentUserEmail: string;
  currentAuthorizedEmails: string[];
  existingMembers: SchoolMemberRecord[];
  existingInvites: StaffInviteRecord[];
  dbSnapshot: SchoolDatabase;
  storedLogoUrl?: string;
}

export async function createStaffInviteInCloud(
  params: CreateStaffInviteParams
): Promise<StaffInviteRecord> {
  const safeSchoolId = toSafeDocId(params.schoolId);
  const cleanEmail = params.invitedEmail.trim().toLowerCase();
  const cleanName = clampStr(params.invitedName, 120, cleanEmail.split('@')[0]);

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Enter a valid email address for the staff member.');
  }

  if (cleanEmail === params.ownerEmail.trim().toLowerCase()) {
    throw new Error('This email already belongs to the Main Admin of this school.');
  }

  const alreadyMember = params.existingMembers.find(
    (m) => m.email.toLowerCase() === cleanEmail
  );
  if (alreadyMember) {
    throw new Error(
      `${cleanEmail} is already an active member (${alreadyMember.role}). Manage their role in the Active Team table.`
    );
  }

  const existingPending = params.existingInvites.find(
    (inv) => inv.status === 'pending' && inv.invitedEmail.toLowerCase() === cleanEmail
  );
  if (existingPending) {
    throw new Error(
      `A pending invite link already exists for ${cleanEmail}. Copy the link from Pending Invites below or revoke it first.`
    );
  }

  if (params.role === 'accountant') {
    const activeAccountants = params.existingMembers.filter(
      (m) => m.role === 'accountant'
    ).length;
    const pendingAccountantInvites = params.existingInvites.filter(
      (inv) => inv.status === 'pending' && inv.role === 'accountant'
    ).length;

    if (activeAccountants + pendingAccountantInvites >= ACCOUNTANT_MAX_LIMIT) {
      throw new Error(
        `Accountant limit reached (${ACCOUNTANT_MAX_LIMIT} max per school: ${activeAccountants} active + ${pendingAccountantInvites} pending). Revoke an existing Accountant or invite to free a seat.`
      );
    }
  }

  const inviteId = toSafeDocId(
    `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  const invitePath = `schools/${safeSchoolId}/invites/${inviteId}`;

  try {
    await setDoc(doc(firestoreDb, 'schools', safeSchoolId, 'invites', inviteId), {
      id: inviteId,
      schoolId: safeSchoolId,
      schoolName: clampStr(params.schoolName, 120, 'School Workspace') || 'School Workspace',
      invitedName: cleanName,
      invitedEmail: cleanEmail,
      role: params.role,
      status: 'pending',
      invitedByUid: params.currentUid,
      invitedByEmail: clampStr(params.currentUserEmail.toLowerCase(), 254),
      acceptedByUid: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, invitePath);
  }

  // Pre-authorize invited email across school tenant + subcollections so list queries succeed immediately on claim
  const nextEmails = normalizeAuthorizedEmailsList(
    [...params.currentAuthorizedEmails, cleanEmail],
    params.ownerEmail
  );
  await syncAuthorizedStaffEmailsAcrossCloud(
    safeSchoolId,
    params.dbSnapshot,
    nextEmails,
    params.ownerEmail,
    params.currentUid,
    params.currentUserEmail,
    params.storedLogoUrl
  );

  const nowIso = new Date().toISOString();
  return {
    id: inviteId,
    schoolId: safeSchoolId,
    schoolName: params.schoolName,
    invitedName: cleanName,
    invitedEmail: cleanEmail,
    role: params.role,
    status: 'pending',
    invitedByUid: params.currentUid,
    invitedByEmail: params.currentUserEmail.toLowerCase(),
    acceptedByUid: '',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export async function acceptStaffInviteInCloud(
  schoolId: string,
  invite: StaffInviteRecord,
  user: { uid: string; email: string; displayName?: string | null }
): Promise<UserSchoolMembership> {
  const safeSchoolId = toSafeDocId(schoolId);
  const uid = user.uid;
  const userEmailLower = user.email.trim().toLowerCase();

  if (invite.invitedEmail.trim().toLowerCase() !== userEmailLower) {
    throw new Error(
      `This invite link was issued to ${invite.invitedEmail}. Please sign in with ${invite.invitedEmail} to accept it.`
    );
  }

  if (invite.status !== 'pending') {
    throw new Error(
      invite.status === 'accepted'
        ? 'This invitation link has already been claimed.'
        : 'This invitation link was revoked by the School Administrator.'
    );
  }

  const displayName =
    clampStr(
      user.displayName || invite.invitedName || userEmailLower.split('@')[0],
      120,
      'Staff Member'
    ) || 'Staff Member';
  const membershipId = getMembershipDocId(uid, safeSchoolId);

  const batch = writeBatch(firestoreDb);

  // 1. Transition Invite status: pending -> accepted (Terminal State Lock)
  batch.update(doc(firestoreDb, 'schools', safeSchoolId, 'invites', invite.id), {
    status: 'accepted',
    acceptedByUid: uid,
    updatedAt: serverTimestamp(),
  });

  // 2. Create RBAC Member Document
  batch.set(doc(firestoreDb, 'schools', safeSchoolId, 'members', uid), {
    uid,
    schoolId: safeSchoolId,
    ownerUid: invite.invitedByUid,
    email: userEmailLower,
    displayName,
    role: invite.role,
    inviteId: invite.id,
    addedByUid: invite.invitedByUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 3. Create User Membership Discovery Index
  batch.set(doc(firestoreDb, 'user_memberships', membershipId), {
    id: membershipId,
    uid,
    email: userEmailLower,
    displayName,
    schoolId: safeSchoolId,
    schoolName: clampStr(invite.schoolName, 120, 'School Workspace') || 'School Workspace',
    role: invite.role,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 4. Atomically increment accountantCount when claiming an Accountant seat (enforced <= 2 by Firestore Rules)
  if (invite.role === 'accountant') {
    batch.update(doc(firestoreDb, 'schools', safeSchoolId), {
      accountantCount: increment(1),
      updatedByUid: uid,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `schools/${safeSchoolId}/members/${uid}`
    );
  }

  const nowIso = new Date().toISOString();
  return {
    id: membershipId,
    uid,
    email: userEmailLower,
    displayName,
    schoolId: safeSchoolId,
    schoolName: invite.schoolName,
    role: invite.role,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export async function updateSchoolMemberRoleInCloud(
  schoolId: string,
  member: SchoolMemberRecord,
  nextRole: InvitableSchoolRole,
  currentUid: string,
  activeAccountantCount: number,
  pendingAccountantInvitesCount: number
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  if (member.role === 'main_admin') {
    throw new Error('Main Admin owner role cannot be modified.');
  }
  if (member.role === nextRole) return;

  if (
    nextRole === 'accountant' &&
    activeAccountantCount + pendingAccountantInvitesCount >= ACCOUNTANT_MAX_LIMIT
  ) {
    throw new Error(
      `Accountant limit reached (${ACCOUNTANT_MAX_LIMIT} max per school). Demote or remove an existing Accountant first.`
    );
  }

  const membershipId = getMembershipDocId(member.uid, safeSchoolId);
  const batch = writeBatch(firestoreDb);

  batch.update(doc(firestoreDb, 'schools', safeSchoolId, 'members', member.uid), {
    role: nextRole,
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(firestoreDb, 'user_memberships', membershipId), {
    role: nextRole,
    updatedAt: serverTimestamp(),
  });

  if (member.role !== 'accountant' && nextRole === 'accountant') {
    batch.update(doc(firestoreDb, 'schools', safeSchoolId), {
      accountantCount: increment(1),
      updatedByUid: currentUid,
      updatedAt: serverTimestamp(),
    });
  } else if (member.role === 'accountant' && nextRole !== 'accountant') {
    batch.update(doc(firestoreDb, 'schools', safeSchoolId), {
      accountantCount: increment(-1),
      updatedByUid: currentUid,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `schools/${safeSchoolId}/members/${member.uid}`
    );
  }
}

export async function revokeSchoolMemberInCloud(params: {
  schoolId: string;
  member: SchoolMemberRecord;
  ownerEmail: string;
  currentUid: string;
  currentUserEmail: string;
  currentAuthorizedEmails: string[];
  dbSnapshot: SchoolDatabase;
  storedLogoUrl?: string;
}): Promise<string[]> {
  const safeSchoolId = toSafeDocId(params.schoolId);
  if (params.member.role === 'main_admin') {
    throw new Error('The Main Admin owner account cannot be removed.');
  }

  const membershipId = getMembershipDocId(params.member.uid, safeSchoolId);
  const batch = writeBatch(firestoreDb);

  batch.delete(doc(firestoreDb, 'schools', safeSchoolId, 'members', params.member.uid));
  batch.delete(doc(firestoreDb, 'user_memberships', membershipId));

  if (params.member.role === 'accountant') {
    batch.update(doc(firestoreDb, 'schools', safeSchoolId), {
      accountantCount: increment(-1),
      updatedByUid: params.currentUid,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `schools/${safeSchoolId}/members/${params.member.uid}`
    );
  }

  const targetLower = params.member.email.trim().toLowerCase();
  const nextEmails = normalizeAuthorizedEmailsList(
    params.currentAuthorizedEmails.filter((e) => e.toLowerCase() !== targetLower),
    params.ownerEmail
  );

  await syncAuthorizedStaffEmailsAcrossCloud(
    safeSchoolId,
    params.dbSnapshot,
    nextEmails,
    params.ownerEmail,
    params.currentUid,
    params.currentUserEmail,
    params.storedLogoUrl
  );

  return nextEmails;
}

export async function revokeStaffInviteInCloud(params: {
  schoolId: string;
  invite: StaffInviteRecord;
  ownerEmail: string;
  currentUid: string;
  currentUserEmail: string;
  currentAuthorizedEmails: string[];
  activeMembers: SchoolMemberRecord[];
  dbSnapshot: SchoolDatabase;
  storedLogoUrl?: string;
}): Promise<string[]> {
  const safeSchoolId = toSafeDocId(params.schoolId);
  const inviteRef = doc(firestoreDb, 'schools', safeSchoolId, 'invites', params.invite.id);

  try {
    if (params.invite.status === 'pending') {
      await updateDoc(inviteRef, {
        status: 'revoked',
        updatedAt: serverTimestamp(),
      });
    } else {
      await deleteDoc(inviteRef);
    }
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `schools/${safeSchoolId}/invites/${params.invite.id}`
    );
  }

  const targetLower = params.invite.invitedEmail.trim().toLowerCase();
  const stillActiveMember = params.activeMembers.some(
    (m) => m.email.toLowerCase() === targetLower
  );

  if (!stillActiveMember) {
    const nextEmails = normalizeAuthorizedEmailsList(
      params.currentAuthorizedEmails.filter((e) => e.toLowerCase() !== targetLower),
      params.ownerEmail
    );
    await syncAuthorizedStaffEmailsAcrossCloud(
      safeSchoolId,
      params.dbSnapshot,
      nextEmails,
      params.ownerEmail,
      params.currentUid,
      params.currentUserEmail,
      params.storedLogoUrl
    );
    return nextEmails;
  }

  return params.currentAuthorizedEmails;
}

// ============================================================================
// 2. TENANT ROOT & SUBCOLLECTION CRUD OPERATIONS (/schools/{schoolId}/...)
// ============================================================================

export async function saveSchoolConfigToCloud(
  schoolId: string,
  dbSnapshot: SchoolDatabase,
  authorizedEmails: string[],
  ownerEmail: string,
  currentUid: string,
  overrideLogoUrl?: string,
  subscriptionUpdate?: {
    subscriptionPlan?: SubscriptionPlan;
    subscriptionStatus?: SubscriptionStatus;
  }
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const path = `schools/${safeSchoolId}`;
  const cleanEmails = normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail);
  const cleanSchoolName =
    clampStr(dbSnapshot.schoolProfile.schoolName, 120, 'NITESH SCHOOL MANAGEMENT SYSTEM') ||
    'NITESH SCHOOL MANAGEMENT SYSTEM';

  const logoUrl =
    overrideLogoUrl !== undefined
      ? overrideLogoUrl
      : await ensureCompactCloudMediaUrl(
          safeSchoolId,
          dbSnapshot.schoolProfile.logoDataUrl,
          'school-logo',
          'school_logo_main',
          cleanEmails,
          ownerEmail
        );

  const designations = (dbSnapshot.customDesignations || [])
    .map((d) => clampStr(d, 80))
    .filter(Boolean)
    .slice(0, 50);

  const updatePayload: Record<string, unknown> = {
    schoolName: cleanSchoolName,
    tagline: clampStr(dbSnapshot.schoolProfile.tagline, 180),
    logoUrl: clampStr(logoUrl, 2048),
    address: clampStr(dbSnapshot.schoolProfile.address, 300),
    phone: clampStr(dbSnapshot.schoolProfile.phone, 32),
    alternatePhone: clampStr(dbSnapshot.schoolProfile.alternatePhone, 32),
    email: clampStr(dbSnapshot.schoolProfile.email, 254),
    website: clampStr(dbSnapshot.schoolProfile.website, 200),
    directorName: clampStr(dbSnapshot.schoolProfile.directorName, 120),
    principalName: clampStr(dbSnapshot.schoolProfile.principalName, 120),
    affiliationNo: clampStr(dbSnapshot.schoolProfile.affiliationNo, 80),
    activeSession: clampStr(dbSnapshot.activeSession, 32, '2026-2027') || '2026-2027',
    billingCutoffMonth: dbSnapshot.billingCutoffMonth || 'April',
    studentSeq: Math.max(
      1,
      Math.min(9999999, Math.round(dbSnapshot.counters.studentSeq || 1001))
    ),
    receiptSeq: Math.max(
      1,
      Math.min(99999999, Math.round(dbSnapshot.counters.receiptSeq || 90001))
    ),
    staffSeq: Math.max(
      1,
      Math.min(9999999, Math.round(dbSnapshot.counters.staffSeq || 101))
    ),
    examSeq: Math.max(1, Math.min(9999999, Math.round(dbSnapshot.counters.examSeq || 101))),
    customDesignations: designations,
    authorizedEmails: cleanEmails,
    updatedByUid: currentUid,
    updatedAt: serverTimestamp(),
  };

  if (subscriptionUpdate?.subscriptionPlan) {
    updatePayload.subscriptionPlan = subscriptionUpdate.subscriptionPlan;
  }
  if (subscriptionUpdate?.subscriptionStatus) {
    updatePayload.subscriptionStatus = subscriptionUpdate.subscriptionStatus;
  }

  try {
    await updateDoc(doc(firestoreDb, 'schools', safeSchoolId), updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  // Keep Main Admin's membership index schoolName synchronized
  try {
    const membershipId = getMembershipDocId(currentUid, safeSchoolId);
    await updateDoc(doc(firestoreDb, 'user_memberships', membershipId), {
      schoolName: cleanSchoolName,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal if caller membership doc is unchanged
  }
}

/**
 * Narrow counter & cutoff update allowed for both Main Admin and Accountant roles
 * (`affectedKeys().hasOnly(['studentSeq', 'receiptSeq', 'billingCutoffMonth', 'updatedByUid', 'updatedAt'])`).
 */
export async function saveAccountantCountersToCloud(
  schoolId: string,
  payload: {
    studentSeq: number;
    receiptSeq: number;
    billingCutoffMonth: FeeMonth;
  },
  currentUid: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const path = `schools/${safeSchoolId}`;
  try {
    await updateDoc(doc(firestoreDb, 'schools', safeSchoolId), {
      studentSeq: Math.max(1, Math.min(9999999, Math.round(payload.studentSeq || 1001))),
      receiptSeq: Math.max(
        1,
        Math.min(99999999, Math.round(payload.receiptSeq || 90001))
      ),
      billingCutoffMonth: payload.billingCutoffMonth || 'April',
      updatedByUid: currentUid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveAcademicSessionToCloud(
  schoolId: string,
  session: AcademicSessionConfig,
  authorizedEmails: string[],
  ownerEmail: string,
  currentUid: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(session.id);
  const path = `schools/${safeSchoolId}/sessions/${docId}`;
  const audit = await getTenantSubdocAuditMeta(safeSchoolId, 'sessions', docId, currentUid);

  try {
    await setDoc(doc(firestoreDb, 'schools', safeSchoolId, 'sessions', docId), {
      id: docId,
      schoolId: safeSchoolId,
      name: clampStr(session.name, 32, '2026-2027') || '2026-2027',
      startMonth: session.startMonth || 'April',
      endMonth: session.endMonth || 'March',
      isActive: Boolean(session.isActive),
      sessionCreatedAt: clampStr(session.createdAt, 64, new Date().toISOString()),
      authorizedEmails: normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail),
      createdByUid: audit.createdByUid,
      updatedByUid: currentUid,
      createdAt: audit.createdAt,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteAcademicSessionFromCloud(
  schoolId: string,
  sessionId: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(sessionId);
  try {
    await deleteDoc(doc(firestoreDb, 'schools', safeSchoolId, 'sessions', docId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `schools/${safeSchoolId}/sessions/${docId}`
    );
  }
}

export async function saveFeeScheduleToCloud(
  schoolId: string,
  rate: ClassSessionFeeRate,
  authorizedEmails: string[],
  ownerEmail: string,
  currentUid: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = getFeeScheduleDocId(rate.className, rate.academicSession);
  const path = `schools/${safeSchoolId}/fee_schedules/${docId}`;
  const audit = await getTenantSubdocAuditMeta(
    safeSchoolId,
    'fee_schedules',
    docId,
    currentUid
  );

  try {
    await setDoc(doc(firestoreDb, 'schools', safeSchoolId, 'fee_schedules', docId), {
      id: docId,
      schoolId: safeSchoolId,
      className: clampStr(rate.className, 40, 'Nursery') || 'Nursery',
      academicSession: clampStr(rate.academicSession, 32, '2026-2027') || '2026-2027',
      admissionFee: Math.max(0, Math.min(10000000, Number(rate.admissionFee) || 0)),
      monthlyTuitionFee: Math.max(
        0,
        Math.min(10000000, Number(rate.monthlyTuitionFee) || 0)
      ),
      annualExamFee: Math.max(0, Math.min(10000000, Number(rate.annualExamFee) || 0)),
      authorizedEmails: normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail),
      createdByUid: audit.createdByUid,
      updatedByUid: currentUid,
      createdAt: audit.createdAt,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteFeeScheduleFromCloud(
  schoolId: string,
  className: string,
  academicSession: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = getFeeScheduleDocId(className, academicSession);
  try {
    await deleteDoc(doc(firestoreDb, 'schools', safeSchoolId, 'fee_schedules', docId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `schools/${safeSchoolId}/fee_schedules/${docId}`
    );
  }
}

export async function saveStudentToCloud(
  schoolId: string,
  student: StudentRecord,
  authorizedEmails: string[],
  ownerEmail: string,
  currentUid: string,
  storedPhotoMap?: { photoUrl?: string; aadhaarDocUrl?: string }
): Promise<{ photoUrl: string; aadhaarDocUrl: string }> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(student.id);
  const path = `schools/${safeSchoolId}/students/${docId}`;
  const cleanEmails = normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail);

  const photoUrl =
    storedPhotoMap?.photoUrl !== undefined
      ? storedPhotoMap.photoUrl
      : await ensureCompactCloudMediaUrl(
          safeSchoolId,
          student.photoDataUrl,
          'student-photo',
          student.admissionId || docId,
          cleanEmails,
          ownerEmail
        );

  const aadhaarDocUrl =
    storedPhotoMap?.aadhaarDocUrl !== undefined
      ? storedPhotoMap.aadhaarDocUrl
      : await ensureCompactCloudMediaUrl(
          safeSchoolId,
          student.aadhaarDocDataUrl,
          'student-aadhaar',
          student.admissionId || docId,
          cleanEmails,
          ownerEmail
        );

  const audit = await getTenantSubdocAuditMeta(safeSchoolId, 'students', docId, currentUid);
  const safeRouteId =
    student.transportEnabled && student.routeId ? toSafeDocId(student.routeId) : '';

  try {
    await setDoc(doc(firestoreDb, 'schools', safeSchoolId, 'students', docId), {
      id: docId,
      schoolId: safeSchoolId,
      admissionId: clampStr(student.admissionId, 32, 'RB1001') || 'RB1001',
      rollNumber: clampStr(student.rollNumber, 32),
      status: student.status === 'Deactive' ? 'Deactive' : 'Active',
      deactivatedAt:
        student.status === 'Deactive' ? clampStr(student.deactivatedAt, 64) : '',
      deactivatedReason:
        student.status === 'Deactive' ? clampStr(student.deactivatedReason, 240) : '',
      promotionHistory: Array.isArray(student.promotionHistory)
        ? student.promotionHistory.slice(0, 25)
        : [],
      academicSession: clampStr(student.academicSession, 32, '2026-2027') || '2026-2027',
      admissionType: student.admissionType === 'Free' ? 'Free' : 'Paid',
      admissionFee: Math.max(0, Math.min(10000000, Number(student.admissionFee) || 0)),
      previousSchool: clampStr(student.previousSchool, 160),
      lastGradePassed: clampStr(student.lastGradePassed, 64),
      tcDetails: clampStr(student.tcDetails, 160),
      name: clampStr(student.name, 120, 'Student') || 'Student',
      dob: clampStr(student.dob, 20),
      gender: ['Male', 'Female', 'Other'].includes(student.gender) ? student.gender : 'Male',
      casteCategory: ['General', 'OBC', 'SC', 'ST', 'Other'].includes(
        student.casteCategory
      )
        ? student.casteCategory
        : 'General',
      className: clampStr(student.className, 40, 'Nursery') || 'Nursery',
      section: clampStr(student.section, 16, 'A') || 'A',
      monthlyTuitionFee: Math.max(
        0,
        Math.min(10000000, Number(student.monthlyTuitionFee) || 0)
      ),
      fatherName: clampStr(student.fatherName, 120),
      motherName: clampStr(student.motherName, 120),
      phone: clampStr(student.phone, 32),
      alternatePhone: clampStr(student.alternatePhone, 32),
      address: clampStr(student.address, 350),
      photoUrl: clampStr(photoUrl, 2048),
      aadhaarNumber: clampStr(student.aadhaarNumber, 32),
      aadhaarDocUrl: clampStr(aadhaarDocUrl, 2048),
      transportEnabled: Boolean(student.transportEnabled && safeRouteId),
      routeId: safeRouteId,
      transportFee: Math.max(0, Math.min(1000000, Number(student.transportFee) || 0)),
      customNotes: clampStr(student.customNotes, 500),
      admissionDate: clampStr(student.admissionDate, 20),
      authorizedEmails: cleanEmails,
      createdByUid: audit.createdByUid,
      updatedByUid: currentUid,
      createdAt: audit.createdAt,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }

  return { photoUrl, aadhaarDocUrl };
}

export async function deleteStudentFromCloud(
  schoolId: string,
  studentId: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(studentId);
  try {
    await deleteDoc(doc(firestoreDb, 'schools', safeSchoolId, 'students', docId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `schools/${safeSchoolId}/students/${docId}`
    );
  }
}

export async function saveFeeReceiptToCloud(
  schoolId: string,
  fee: FeeRecord,
  authorizedEmails: string[],
  ownerEmail: string,
  currentUid: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(fee.id);
  const path = `schools/${safeSchoolId}/fees/${docId}`;
  const audit = await getTenantSubdocAuditMeta(safeSchoolId, 'fees', docId, currentUid);

  try {
    await setDoc(doc(firestoreDb, 'schools', safeSchoolId, 'fees', docId), {
      id: docId,
      schoolId: safeSchoolId,
      receiptNo: clampStr(fee.receiptNo, 32, 'REC90001') || 'REC90001',
      studentId: toSafeDocId(fee.studentId),
      admissionId: clampStr(fee.admissionId, 32),
      studentName: clampStr(fee.studentName, 120),
      className: clampStr(fee.className, 40),
      section: clampStr(fee.section, 16),
      fatherName: clampStr(fee.fatherName, 120),
      category: ['Tuition', 'Admission', 'Transport', 'Exam'].includes(fee.category)
        ? fee.category
        : 'Tuition',
      feeMonth: fee.feeMonth || 'April',
      paymentMode: ['Cash', 'UPI', 'Bank'].includes(fee.paymentMode)
        ? fee.paymentMode
        : 'Cash',
      amount: Math.max(1, Math.min(10000000, Number(fee.amount) || 1)),
      date: clampStr(fee.date, 20),
      remarks: clampStr(fee.remarks, 240),
      authorizedEmails: normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail),
      createdByUid: audit.createdByUid,
      updatedByUid: currentUid,
      createdAt: audit.createdAt,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Narrow update for fee receipt student/father name when an Accountant edits a student's profile.
 */
export async function updateFeeReceiptStudentNamesInCloud(
  schoolId: string,
  feeId: string,
  studentName: string,
  fatherName: string,
  currentUid: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(feeId);
  const path = `schools/${safeSchoolId}/fees/${docId}`;
  try {
    await updateDoc(doc(firestoreDb, 'schools', safeSchoolId, 'fees', docId), {
      studentName: clampStr(studentName, 120),
      fatherName: clampStr(fatherName, 120),
      updatedByUid: currentUid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFeeReceiptFromCloud(
  schoolId: string,
  feeId: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(feeId);
  try {
    await deleteDoc(doc(firestoreDb, 'schools', safeSchoolId, 'fees', docId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `schools/${safeSchoolId}/fees/${docId}`
    );
  }
}

export async function saveRouteToCloud(
  schoolId: string,
  route: TransportRoute,
  authorizedEmails: string[],
  ownerEmail: string,
  currentUid: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(route.id);
  const path = `schools/${safeSchoolId}/routes/${docId}`;
  const audit = await getTenantSubdocAuditMeta(safeSchoolId, 'routes', docId, currentUid);

  try {
    await setDoc(doc(firestoreDb, 'schools', safeSchoolId, 'routes', docId), {
      id: docId,
      schoolId: safeSchoolId,
      routeName: clampStr(route.routeName, 120, 'Route') || 'Route',
      busNumber: clampStr(route.busNumber, 40),
      pickupPoints: clampStr(route.pickupPoints, 400),
      monthlyFare: Math.max(0, Math.min(1000000, Number(route.monthlyFare) || 0)),
      driverName: clampStr(route.driverName, 120),
      driverPhone: clampStr(route.driverPhone, 32),
      routeCreatedAt: clampStr(route.createdAt, 64, new Date().toISOString()),
      authorizedEmails: normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail),
      createdByUid: audit.createdByUid,
      updatedByUid: currentUid,
      createdAt: audit.createdAt,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteRouteFromCloud(
  schoolId: string,
  routeId: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(routeId);
  try {
    await deleteDoc(doc(firestoreDb, 'schools', safeSchoolId, 'routes', docId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `schools/${safeSchoolId}/routes/${docId}`
    );
  }
}

export async function saveStaffToCloud(
  schoolId: string,
  staff: StaffMember,
  authorizedEmails: string[],
  ownerEmail: string,
  currentUid: string,
  overridePhotoUrl?: string
): Promise<string> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(staff.id);
  const path = `schools/${safeSchoolId}/staff/${docId}`;
  const cleanEmails = normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail);

  const photoUrl =
    overridePhotoUrl !== undefined
      ? overridePhotoUrl
      : await ensureCompactCloudMediaUrl(
          safeSchoolId,
          staff.photoDataUrl,
          'staff-photo',
          staff.staffId || docId,
          cleanEmails,
          ownerEmail
        );

  const audit = await getTenantSubdocAuditMeta(safeSchoolId, 'staff', docId, currentUid);

  try {
    await setDoc(doc(firestoreDb, 'schools', safeSchoolId, 'staff', docId), {
      id: docId,
      schoolId: safeSchoolId,
      staffId: clampStr(staff.staffId, 32, 'STF101') || 'STF101',
      fullName: clampStr(staff.fullName, 120, 'Staff Member') || 'Staff Member',
      fatherOrSpouseName: clampStr(staff.fatherOrSpouseName, 120),
      designation: clampStr(staff.designation, 80, 'Teacher') || 'Teacher',
      assignedDepartment: clampStr(staff.assignedDepartment, 200),
      qualification: clampStr(staff.qualification, 160),
      monthlySalary: Math.max(0, Math.min(10000000, Number(staff.monthlySalary) || 0)),
      address: clampStr(staff.address, 350),
      phone: clampStr(staff.phone, 32),
      emergencyContact: clampStr(staff.emergencyContact, 32),
      joinedDate: clampStr(staff.joinedDate, 20),
      photoUrl: clampStr(photoUrl, 2048),
      authorizedEmails: cleanEmails,
      createdByUid: audit.createdByUid,
      updatedByUid: currentUid,
      createdAt: audit.createdAt,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }

  return photoUrl;
}

export async function deleteStaffFromCloud(
  schoolId: string,
  staffId: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(staffId);
  try {
    await deleteDoc(doc(firestoreDb, 'schools', safeSchoolId, 'staff', docId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `schools/${safeSchoolId}/staff/${docId}`
    );
  }
}

export async function saveClassAllocationToCloud(
  schoolId: string,
  cls: ClassAllocation,
  authorizedEmails: string[],
  ownerEmail: string,
  currentUid: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(cls.id);
  const path = `schools/${safeSchoolId}/classes/${docId}`;
  const audit = await getTenantSubdocAuditMeta(safeSchoolId, 'classes', docId, currentUid);
  const cleanSections = (cls.sections || ['A'])
    .map((s) => clampStr(s, 16))
    .filter(Boolean)
    .slice(0, 20);

  try {
    await setDoc(doc(firestoreDb, 'schools', safeSchoolId, 'classes', docId), {
      id: docId,
      schoolId: safeSchoolId,
      className: clampStr(cls.className, 40, 'Nursery') || 'Nursery',
      sections: cleanSections.length > 0 ? cleanSections : ['A'],
      sectionCapacity: Math.max(1, Math.min(500, Math.round(cls.sectionCapacity || 35))),
      isDefault: Boolean(cls.isDefault),
      authorizedEmails: normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail),
      createdByUid: audit.createdByUid,
      updatedByUid: currentUid,
      createdAt: audit.createdAt,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteClassAllocationFromCloud(
  schoolId: string,
  classId: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(classId);
  try {
    await deleteDoc(doc(firestoreDb, 'schools', safeSchoolId, 'classes', docId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `schools/${safeSchoolId}/classes/${docId}`
    );
  }
}

export async function saveAttendanceSheetToCloud(
  schoolId: string,
  sheet: DailyAttendanceSheet,
  authorizedEmails: string[],
  ownerEmail: string,
  currentUid: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = getAttendanceDocId(sheet.key);
  const path = `schools/${safeSchoolId}/attendance/${docId}`;
  const audit = await getTenantSubdocAuditMeta(
    safeSchoolId,
    'attendance',
    docId,
    currentUid
  );

  try {
    await setDoc(doc(firestoreDb, 'schools', safeSchoolId, 'attendance', docId), {
      key: clampStr(sheet.key, 128, docId) || docId,
      schoolId: safeSchoolId,
      date: clampStr(sheet.date, 20),
      className: clampStr(sheet.className, 40),
      section: clampStr(sheet.section, 16),
      entries: sheet.entries || {},
      notes: sheet.notes || {},
      markedBy: clampStr(sheet.markedBy, 254, 'Staff'),
      authorizedEmails: normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail),
      createdByUid: audit.createdByUid,
      updatedByUid: currentUid,
      createdAt: audit.createdAt,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveExamToCloud(
  schoolId: string,
  exam: ExamDefinition,
  authorizedEmails: string[],
  ownerEmail: string,
  currentUid: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(exam.id);
  const path = `schools/${safeSchoolId}/exams/${docId}`;
  const audit = await getTenantSubdocAuditMeta(safeSchoolId, 'exams', docId, currentUid);

  try {
    await setDoc(doc(firestoreDb, 'schools', safeSchoolId, 'exams', docId), {
      id: docId,
      schoolId: safeSchoolId,
      examCode: clampStr(exam.examCode, 32, 'EXM101') || 'EXM101',
      examName: clampStr(exam.examName, 120, 'Examination') || 'Examination',
      academicSession: clampStr(exam.academicSession, 32),
      className: clampStr(exam.className, 40),
      examCenter: clampStr(exam.examCenter, 180),
      instructions: clampStr(exam.instructions, 2000),
      subjects: (exam.subjects || []).slice(0, 25),
      authorizedEmails: normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail),
      createdByUid: audit.createdByUid,
      updatedByUid: currentUid,
      createdAt: audit.createdAt,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteExamFromCloud(
  schoolId: string,
  examId: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(examId);
  try {
    await deleteDoc(doc(firestoreDb, 'schools', safeSchoolId, 'exams', docId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `schools/${safeSchoolId}/exams/${docId}`
    );
  }
}

export async function saveMarksheetToCloud(
  schoolId: string,
  marksheet: StudentExamMarksheet,
  authorizedEmails: string[],
  ownerEmail: string,
  currentUid: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(marksheet.id);
  const path = `schools/${safeSchoolId}/marksheets/${docId}`;
  const audit = await getTenantSubdocAuditMeta(
    safeSchoolId,
    'marksheets',
    docId,
    currentUid
  );

  try {
    await setDoc(doc(firestoreDb, 'schools', safeSchoolId, 'marksheets', docId), {
      id: docId,
      schoolId: safeSchoolId,
      examId: toSafeDocId(marksheet.examId),
      examCode: clampStr(marksheet.examCode, 32),
      examName: clampStr(marksheet.examName, 120),
      academicSession: clampStr(marksheet.academicSession, 32),
      studentId: toSafeDocId(marksheet.studentId),
      admissionId: clampStr(marksheet.admissionId, 32),
      rollNumber: clampStr(marksheet.rollNumber, 32),
      studentName: clampStr(marksheet.studentName, 120),
      className: clampStr(marksheet.className, 40),
      section: clampStr(marksheet.section, 16),
      fatherName: clampStr(marksheet.fatherName, 120),
      motherName: clampStr(marksheet.motherName, 120),
      dob: clampStr(marksheet.dob, 20),
      subjectMarks: (marksheet.subjectMarks || []).slice(0, 25),
      totalMaxMarks: Math.max(1, Math.min(25000, Number(marksheet.totalMaxMarks) || 100)),
      totalMinMarks: Math.max(0, Math.min(25000, Number(marksheet.totalMinMarks) || 0)),
      totalObtained: Math.max(0, Math.min(25000, Number(marksheet.totalObtained) || 0)),
      percentage: Math.max(0, Math.min(100, Number(marksheet.percentage) || 0)),
      overallGrade: clampStr(marksheet.overallGrade, 16, 'C'),
      passed: Boolean(marksheet.passed),
      remarks: clampStr(marksheet.remarks, 300),
      customRemarks: clampStr(marksheet.customRemarks, 300),
      authorizedEmails: normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail),
      createdByUid: audit.createdByUid,
      updatedByUid: currentUid,
      createdAt: audit.createdAt,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteMarksheetFromCloud(
  schoolId: string,
  marksheetId: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(marksheetId);
  try {
    await deleteDoc(doc(firestoreDb, 'schools', safeSchoolId, 'marksheets', docId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `schools/${safeSchoolId}/marksheets/${docId}`
    );
  }
}

export async function saveGradeToCloud(
  schoolId: string,
  grade: ExamGradeRecord,
  authorizedEmails: string[],
  ownerEmail: string,
  currentUid: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(grade.id);
  const path = `schools/${safeSchoolId}/grades/${docId}`;
  const audit = await getTenantSubdocAuditMeta(safeSchoolId, 'grades', docId, currentUid);

  try {
    await setDoc(doc(firestoreDb, 'schools', safeSchoolId, 'grades', docId), {
      id: docId,
      schoolId: safeSchoolId,
      studentId: toSafeDocId(grade.studentId),
      admissionId: clampStr(grade.admissionId, 32),
      studentName: clampStr(grade.studentName, 120),
      className: clampStr(grade.className, 40),
      section: clampStr(grade.section, 16),
      fatherName: clampStr(grade.fatherName, 120),
      dob: clampStr(grade.dob, 20),
      term: clampStr(grade.term, 40),
      english: Math.max(0, Math.min(100, Number(grade.english) || 0)),
      hindi: Math.max(0, Math.min(100, Number(grade.hindi) || 0)),
      maths: Math.max(0, Math.min(100, Number(grade.maths) || 0)),
      science: Math.max(0, Math.min(100, Number(grade.science) || 0)),
      total: Math.max(0, Math.min(400, Number(grade.total) || 0)),
      percentage: Math.max(0, Math.min(100, Number(grade.percentage) || 0)),
      passed: Boolean(grade.passed),
      recordedAt: clampStr(grade.recordedAt, 64, new Date().toISOString()),
      authorizedEmails: normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail),
      createdByUid: audit.createdByUid,
      updatedByUid: currentUid,
      createdAt: audit.createdAt,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteGradeFromCloud(
  schoolId: string,
  gradeId: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(gradeId);
  try {
    await deleteDoc(doc(firestoreDb, 'schools', safeSchoolId, 'grades', docId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `schools/${safeSchoolId}/grades/${docId}`
    );
  }
}

export async function saveNoticeToCloud(
  schoolId: string,
  notice: NoticeItem,
  authorizedEmails: string[],
  ownerEmail: string,
  currentUid: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(notice.id);
  const path = `schools/${safeSchoolId}/notices/${docId}`;
  const audit = await getTenantSubdocAuditMeta(safeSchoolId, 'notices', docId, currentUid);

  try {
    await setDoc(doc(firestoreDb, 'schools', safeSchoolId, 'notices', docId), {
      id: docId,
      schoolId: safeSchoolId,
      title: clampStr(notice.title, 160, 'Announcement') || 'Announcement',
      body: clampStr(notice.body, 2000, '—') || '—',
      category: [
        'Academic',
        'Examination',
        'Holiday',
        'Transport',
        'Admissions',
        'General',
      ].includes(notice.category)
        ? notice.category
        : 'General',
      postedBy: clampStr(notice.postedBy, 254, 'Administration'),
      noticeCreatedAt: clampStr(notice.createdAt, 64, new Date().toISOString()),
      authorizedEmails: normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail),
      createdByUid: audit.createdByUid,
      updatedByUid: currentUid,
      createdAt: audit.createdAt,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteNoticeFromCloud(
  schoolId: string,
  noticeId: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const docId = toSafeDocId(noticeId);
  try {
    await deleteDoc(doc(firestoreDb, 'schools', safeSchoolId, 'notices', docId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `schools/${safeSchoolId}/notices/${docId}`
    );
  }
}

/**
 * Propagates updated `authorizedEmails` across `/schools/{schoolId}` and all 13 tenant subcollections
 * so invited/revoked staff accounts immediately gain or lose query access within that school only.
 */
export async function syncAuthorizedStaffEmailsAcrossCloud(
  schoolId: string,
  dbSnapshot: SchoolDatabase,
  nextEmails: string[],
  ownerEmail: string,
  currentUid: string,
  currentUserEmail: string,
  storedLogoUrl?: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const cleanEmails = normalizeAuthorizedEmailsList(nextEmails, ownerEmail);

  await saveSchoolConfigToCloud(
    safeSchoolId,
    dbSnapshot,
    cleanEmails,
    ownerEmail,
    currentUid,
    storedLogoUrl
  );

  for (const colName of TENANT_OPERATIONAL_COLLECTIONS) {
    try {
      const q = query(
        collection(firestoreDb, 'schools', safeSchoolId, colName),
        where('authorizedEmails', 'array-contains', currentUserEmail.trim().toLowerCase())
      );
      const snap = await getDocs(q);
      if (snap.empty) continue;

      let batch = writeBatch(firestoreDb);
      let opCount = 0;

      for (const docSnap of snap.docs) {
        batch.update(docSnap.ref, {
          authorizedEmails: cleanEmails,
          updatedByUid: currentUid,
          updatedAt: serverTimestamp(),
        });
        opCount += 1;
        if (opCount >= 400) {
          await batch.commit();
          batch = writeBatch(firestoreDb);
          opCount = 0;
        }
      }

      if (opCount > 0) {
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `schools/${safeSchoolId}/${colName}`
      );
    }
  }
}

/**
 * Synchronizes an entire SchoolDatabase snapshot to `/schools/{schoolId}/...`
 * (used for new tenant seeding, full JSON backup restore, and Main Admin workspace reset).
 */
export async function syncEntireDatabaseToCloud(
  schoolId: string,
  dbSnapshot: SchoolDatabase,
  authorizedEmails: string[],
  currentUid: string,
  currentUserEmail: string,
  ownerEmail: string,
  wipeExistingFirst = false
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const cleanEmails = normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail);

  if (wipeExistingFirst) {
    const deletableCollections = [
      'marksheets',
      'grades',
      'fees',
      'attendance',
      'notices',
      'exams',
      'students',
      'staff',
      'routes',
      'fee_schedules',
      'classes',
      'sessions',
    ];
    for (const colName of deletableCollections) {
      try {
        const q = query(
          collection(firestoreDb, 'schools', safeSchoolId, colName),
          where('authorizedEmails', 'array-contains', currentUserEmail.trim().toLowerCase())
        );
        const snap = await getDocs(q);
        if (snap.empty) continue;

        let batch = writeBatch(firestoreDb);
        let count = 0;
        for (const d of snap.docs) {
          batch.delete(d.ref);
          count += 1;
          if (count >= 400) {
            await batch.commit();
            batch = writeBatch(firestoreDb);
            count = 0;
          }
        }
        if (count > 0) {
          await batch.commit();
        }
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.DELETE,
          `schools/${safeSchoolId}/${colName}`
        );
      }
    }
  }

  const runChunked = async <T>(
    items: T[],
    fn: (item: T) => Promise<unknown>,
    chunkSize = 20
  ) => {
    for (let i = 0; i < items.length; i += chunkSize) {
      await Promise.all(items.slice(i, i + chunkSize).map(fn));
    }
  };

  // 1. School Config & Branding
  await saveSchoolConfigToCloud(
    safeSchoolId,
    dbSnapshot,
    cleanEmails,
    ownerEmail,
    currentUid
  );

  // 2. Independent Parent Collections (Sessions, Classes, Fee Schedules, Routes, Staff, Exams)
  await Promise.all([
    runChunked(dbSnapshot.sessions, (s) =>
      saveAcademicSessionToCloud(safeSchoolId, s, cleanEmails, ownerEmail, currentUid)
    ),
    runChunked(dbSnapshot.classes, (c) =>
      saveClassAllocationToCloud(safeSchoolId, c, cleanEmails, ownerEmail, currentUid)
    ),
    runChunked(dbSnapshot.feeSchedules, (fs) =>
      saveFeeScheduleToCloud(safeSchoolId, fs, cleanEmails, ownerEmail, currentUid)
    ),
    runChunked(dbSnapshot.routes, (r) =>
      saveRouteToCloud(safeSchoolId, r, cleanEmails, ownerEmail, currentUid)
    ),
    runChunked(dbSnapshot.staff, (stf) =>
      saveStaffToCloud(safeSchoolId, stf, cleanEmails, ownerEmail, currentUid)
    ),
    runChunked(dbSnapshot.exams, (ex) =>
      saveExamToCloud(safeSchoolId, ex, cleanEmails, ownerEmail, currentUid)
    ),
  ]);

  // 3. Students (references routes)
  await runChunked(dbSnapshot.students, (stu) =>
    saveStudentToCloud(safeSchoolId, stu, cleanEmails, ownerEmail, currentUid)
  );

  // 4. Child / Dependent Collections (Fees, Marksheets, Grades, Attendance, Notices)
  await Promise.all([
    runChunked(dbSnapshot.fees, (fee) =>
      saveFeeReceiptToCloud(safeSchoolId, fee, cleanEmails, ownerEmail, currentUid)
    ),
    runChunked(dbSnapshot.marksheets, (ms) =>
      saveMarksheetToCloud(safeSchoolId, ms, cleanEmails, ownerEmail, currentUid)
    ),
    runChunked(dbSnapshot.grades, (grd) =>
      saveGradeToCloud(safeSchoolId, grd, cleanEmails, ownerEmail, currentUid)
    ),
    runChunked(Object.values(dbSnapshot.attendance || {}), (sheet) =>
      saveAttendanceSheetToCloud(safeSchoolId, sheet, cleanEmails, ownerEmail, currentUid)
    ),
    runChunked(dbSnapshot.notices, (ntc) =>
      saveNoticeToCloud(safeSchoolId, ntc, cleanEmails, ownerEmail, currentUid)
    ),
  ]);
}

export function extractTenantMetaFromDoc(
  schoolId: string,
  docData: CloudSchoolTenantDoc
): SchoolTenantMeta {
  return {
    id: docData.id || schoolId,
    schoolName: docData.schoolName || 'School Workspace',
    ownerUid: docData.ownerUid,
    ownerEmail: docData.ownerEmail,
    subscriptionPlan: docData.subscriptionPlan || 'Enterprise',
    subscriptionStatus: docData.subscriptionStatus || 'Active',
    accountantCount: Number(docData.accountantCount) || 0,
  };
}

// ============================================================================
// 4. IN-APP AI CUSTOMIZATION SYNC & QUICK STUDENT PHOTO ATTACHMENT
// ============================================================================

export function normalizeAiCustomization(
  raw?: Partial<AiCustomizationSettings> | Record<string, unknown> | null
): AiCustomizationSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_AI_CUSTOMIZATION };
  }
  const r = raw as Record<string, unknown>;
  const validThemes: AiAccentTheme[] = [
    'indigo',
    'emerald',
    'royal-blue',
    'crimson',
    'amber',
    'slate',
  ];
  const validReceiptStyles: FeeReceiptStyle[] = ['classic', 'modern-boxed', 'compact-slip'];
  const validMarksheetLayouts: MarksheetLayoutStyle[] = [
    'standard',
    'executive-crest',
    'cbse-detailed',
  ];

  const customFieldsRaw = Array.isArray(r.customStudentFields) ? r.customStudentFields : [];
  const customStudentFields: CustomStudentFieldDef[] = customFieldsRaw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const f = item as Record<string, unknown>;
      const key = clampStr(f.key, 32)
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_');
      const label = clampStr(f.label, 48);
      if (!key || !label) return null;
      return {
        key,
        label,
        placeholder: clampStr(f.placeholder, 80, `Enter ${label}`),
        showOnReceipt: Boolean(f.showOnReceipt),
        showOnAdmissionSlip: f.showOnAdmissionSlip !== false,
      };
    })
    .filter((f): f is CustomStudentFieldDef => Boolean(f))
    .slice(0, 12);

  const promptHistory = Array.isArray(r.promptHistory)
    ? r.promptHistory
        .map((p) => clampStr(p, 500))
        .filter(Boolean)
        .slice(0, 25)
    : [];

  return {
    accentTheme: validThemes.includes(r.accentTheme as AiAccentTheme)
      ? (r.accentTheme as AiAccentTheme)
      : 'indigo',
    densityMode: r.densityMode === 'compact' ? 'compact' : 'comfortable',
    feeReceiptShowQr: Boolean(r.feeReceiptShowQr),
    feeReceiptStyle: validReceiptStyles.includes(r.feeReceiptStyle as FeeReceiptStyle)
      ? (r.feeReceiptStyle as FeeReceiptStyle)
      : 'classic',
    feeReceiptFooterNote: clampStr(r.feeReceiptFooterNote, 400),
    feeReceiptShowLogoWatermark: Boolean(r.feeReceiptShowLogoWatermark),
    marksheetLayout: validMarksheetLayouts.includes(r.marksheetLayout as MarksheetLayoutStyle)
      ? (r.marksheetLayout as MarksheetLayoutStyle)
      : 'standard',
    marksheetShowQr: Boolean(r.marksheetShowQr),
    marksheetShowRankBadge: Boolean(r.marksheetShowRankBadge),
    admitCardShowQr: Boolean(r.admitCardShowQr),
    dashboardBannerTitle: clampStr(r.dashboardBannerTitle, 160),
    customStudentFields,
    promptHistory,
  };
}

export async function saveUiCustomizationToCloud(
  schoolId: string,
  config: AiCustomizationSettings,
  authorizedEmails: string[],
  ownerEmail: string,
  currentUid: string
): Promise<void> {
  const safeSchoolId = toSafeDocId(schoolId);
  const configId = 'main';
  const path = `schools/${safeSchoolId}/ui_config/${configId}`;
  const clean = normalizeAiCustomization(config);
  const cleanEmails = normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail);
  const audit = await getTenantSubdocAuditMeta(safeSchoolId, 'ui_config', configId, currentUid);

  try {
    await setDoc(doc(firestoreDb, 'schools', safeSchoolId, 'ui_config', configId), {
      id: configId,
      schoolId: safeSchoolId,
      accentTheme: clean.accentTheme,
      densityMode: clean.densityMode,
      feeReceiptShowQr: clean.feeReceiptShowQr,
      feeReceiptStyle: clean.feeReceiptStyle,
      feeReceiptFooterNote: clean.feeReceiptFooterNote,
      feeReceiptShowLogoWatermark: clean.feeReceiptShowLogoWatermark,
      marksheetLayout: clean.marksheetLayout,
      marksheetShowQr: clean.marksheetShowQr,
      marksheetShowRankBadge: clean.marksheetShowRankBadge,
      admitCardShowQr: clean.admitCardShowQr,
      dashboardBannerTitle: clean.dashboardBannerTitle,
      customStudentFields: clean.customStudentFields,
      promptHistory: clean.promptHistory,
      authorizedEmails: cleanEmails,
      createdByUid: audit.createdByUid,
      updatedByUid: currentUid,
      createdAt: audit.createdAt,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveStudentPhotoQuickToCloud(
  schoolId: string,
  studentId: string,
  photoDataUrl: string,
  authorizedEmails: string[],
  ownerEmail: string,
  currentUid: string
): Promise<string> {
  const safeSchoolId = toSafeDocId(schoolId);
  const safeStudentId = toSafeDocId(studentId);
  const path = `schools/${safeSchoolId}/students/${safeStudentId}`;
  const cleanEmails = normalizeAuthorizedEmailsList(authorizedEmails, ownerEmail);
  const compactPhotoRef = await ensureCompactCloudMediaUrl(
    safeSchoolId,
    photoDataUrl,
    'student-photo',
    safeStudentId,
    cleanEmails,
    ownerEmail
  );

  try {
    await updateDoc(doc(firestoreDb, 'schools', safeSchoolId, 'students', safeStudentId), {
      photoUrl: clampStr(compactPhotoRef, 500),
      updatedByUid: currentUid,
      updatedAt: serverTimestamp(),
    });
    return compactPhotoRef;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

