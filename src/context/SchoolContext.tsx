import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  ACCOUNTANT_MAX_LIMIT,
  AcademicSessionConfig,
  AdmissionType,
  AiCustomizationSettings,
  AttendanceStatus,
  CasteCategory,
  ClassAllocation,
  ClassSessionFeeRate,
  DailyAttendanceSheet,
  DEFAULT_AI_CUSTOMIZATION,
  DEFAULT_STAFF_DESIGNATIONS,
  DynamicCloudBinding,
  ExamDefinition,
  ExamGradeRecord,
  ExamSubjectSchedule,
  ExamTerm,
  FeeCategory,
  FeeMonth,
  FeeRecord,
  Gender,
  getAllowedModulesForRole,
  getDefaultModuleForRole,
  InvitableSchoolRole,
  ModuleId,
  NoticeCategory,
  NoticeItem,
  PaymentMode,
  PrintableDocumentPayload,
  SchoolDatabase,
  SchoolMemberRecord,
  SchoolProfileSettings,
  SchoolRole,
  ROLE_META,
  SchoolTenantMeta,
  StaffAccount,
  StaffDesignation,
  StaffInviteRecord,
  StaffMember,
  StudentDueSummary,
  StudentExamMarksheet,
  StudentPromotionHistoryItem,
  StudentRecord,
  StudentStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  ToastMessage,
  TransportRoute,
  UserSchoolMembership,
} from '../types/erp';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  createUserWithEmailAndPassword,
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  firebaseAuth,
  firestoreDb,
  googleAuthProvider,
  handleFirestoreError,
  isQuotaExceededError,
  normalizeAuthorizedEmailsList,
  OperationType,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  toSafeDocId,
  updateProfile,
} from '../lib/firebase';
import {
  cacheResolvedDataUrl,
  MediaCategory,
  resolveDisplayMediaUrl,
  uploadSchoolMediaFile,
  warmImageDataUrlCache,
} from '../services/cloudStorage';
import {
  claimExternalCloudStaffInvite,
  decodeDynamicCloudInviteToken,
  encodeDynamicCloudInviteToken,
  ExternalCloudTenantEnvelope,
  fetchMasterAccountProfile,
  isExternalDynamicCloud,
  loadExternalCloudSnapshot,
  normalizeCloudBinding,
  saveExternalCloudSnapshot,
  saveMasterAccountProfile,
  subscribeExternalCloudSnapshot,
  testDynamicCloudConnection,
} from '../services/dynamicCloudBinding';
import {
  acceptStaffInviteInCloud,
  CloudSchoolTenantDoc,
  createStaffInviteInCloud,
  deleteAcademicSessionFromCloud,
  deleteClassAllocationFromCloud,
  deleteExamFromCloud,
  deleteFeeReceiptFromCloud,
  deleteFeeScheduleFromCloud,
  deleteGradeFromCloud,
  deleteMarksheetFromCloud,
  deleteNoticeFromCloud,
  deleteRouteFromCloud,
  deleteStaffFromCloud,
  deleteStudentFromCloud,
  extractTenantMetaFromDoc,
  fetchMemberRoleDoc,
  fetchPendingInviteDetails,
  fetchUserMemberships,
  normalizeAiCustomization,
  registerNewSchoolTenant,
  RegisterSchoolTenantInput,
  revokeSchoolMemberInCloud,
  revokeStaffInviteInCloud,
  saveAcademicSessionToCloud,
  saveAccountantCountersToCloud,
  saveAttendanceSheetToCloud,
  saveClassAllocationToCloud,
  saveExamToCloud,
  saveFeeReceiptToCloud,
  saveFeeScheduleToCloud,
  saveGradeToCloud,
  saveMarksheetToCloud,
  saveNoticeToCloud,
  saveRouteToCloud,
  saveSchoolConfigToCloud,
  saveStaffToCloud,
  saveStudentPhotoQuickToCloud,
  saveStudentToCloud,
  saveUiCustomizationToCloud,
  syncAuthorizedStaffEmailsAcrossCloud,
  syncEntireDatabaseToCloud,
  updateFeeReceiptStudentNamesInCloud,
  updateSchoolMemberRoleInCloud,
} from '../services/firestoreSync';
import { downloadFullBackupExcel } from '../utils/backupExport';
import {
  buildValidatedMarksheet,
  DEFAULT_EXAM_INSTRUCTIONS,
  RawSubjectMarkInput,
  resolveStudentRollNumber,
  sortExamSubjects,
} from '../utils/examEngine';
import {
  buildDefaultFeeSchedules,
  computeSchoolDueOverview,
  getCurrentAcademicMonth,
  getDefaultClassFeeBase,
} from '../utils/feeEngine';
import {
  ACADEMIC_SESSIONS,
  CALENDAR_MONTHS,
  fileToCompressedDataUrl,
  getSessionMonthsOrder,
  getTodayISO,
  sanitizeNumber,
} from '../utils/formatters';

const LEGACY_DB_STORAGE_KEY = 'rb_public_school_db_v1';
const PENDING_INVITE_SESSION_KEY = 'rb_erp_pending_invite_v1';
const PENDING_SCHOOL_REG_SESSION_KEY = 'rb_erp_pending_school_reg_v1';

function getUiCustomizationCacheKey(schoolId: string | null): string {
  return schoolId ? `rb_erp_ui_cfg_${schoolId}` : 'rb_erp_ui_cfg_guest';
}

function getTenantCacheKey(schoolId: string | null): string {
  return schoolId ? `rb_erp_tenant_v2_${schoolId}` : 'rb_erp_tenant_v2_guest';
}

function getActiveSchoolPrefKey(uid: string): string {
  return `rb_erp_active_school_${uid}`;
}

export type CloudSyncStatus =
  | 'initializing'
  | 'unauthenticated'
  | 'needs-verification'
  | 'onboarding'
  | 'invite-claim'
  | 'unauthorized'
  | 'syncing'
  | 'live'
  | 'quota-exceeded'
  | 'error';

export type PendingInviteClaimState =
  | 'none'
  | 'loading'
  | 'ready'
  | 'email_mismatch'
  | 'invalid_or_used';

export interface PendingInviteUrlParams {
  schoolId: string;
  inviteId: string;
  cctx?: string;
}

function readInitialInviteParams(): PendingInviteUrlParams | null {
  try {
    const params = new URLSearchParams(window.location.search);
    let schoolId = params.get('school')?.trim() || '';
    let inviteId = params.get('invite')?.trim() || '';
    const cctx = params.get('cctx')?.trim() || '';
    if (cctx && (!schoolId || !inviteId)) {
      const decoded = decodeDynamicCloudInviteToken(cctx);
      if (decoded) {
        schoolId = schoolId || decoded.schoolId;
        inviteId = inviteId || decoded.inviteId;
      }
    }
    if (schoolId && inviteId) {
      const payload: PendingInviteUrlParams = {
        schoolId,
        inviteId,
        ...(cctx ? { cctx } : {}),
      };
      sessionStorage.setItem(PENDING_INVITE_SESSION_KEY, JSON.stringify(payload));
      return payload;
    }
    const stored = sessionStorage.getItem(PENDING_INVITE_SESSION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<PendingInviteUrlParams>;
      if (parsed.schoolId && parsed.inviteId) {
        return {
          schoolId: parsed.schoolId,
          inviteId: parsed.inviteId,
          ...(parsed.cctx ? { cctx: parsed.cctx } : {}),
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function clearInviteParamsFromBrowser(): void {
  try {
    sessionStorage.removeItem(PENDING_INVITE_SESSION_KEY);
    const url = new URL(window.location.href);
    if (
      url.searchParams.has('school') ||
      url.searchParams.has('invite') ||
      url.searchParams.has('cctx')
    ) {
      url.searchParams.delete('school');
      url.searchParams.delete('invite');
      url.searchParams.delete('cctx');
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    }
  } catch {
    // ignore
  }
}

export const DEFAULT_CLASSES: ClassAllocation[] = [
  { id: 'cls-nursery', className: 'Nursery', sections: ['A', 'B', 'C'], sectionCapacity: 30, isDefault: true },
  { id: 'cls-lkg', className: 'LKG', sections: ['A', 'B', 'C'], sectionCapacity: 30, isDefault: true },
  { id: 'cls-ukg', className: 'UKG', sections: ['A', 'B', 'C'], sectionCapacity: 30, isDefault: true },
  { id: 'cls-1st', className: '1st', sections: ['A', 'B', 'C'], sectionCapacity: 35, isDefault: true },
  { id: 'cls-2nd', className: '2nd', sections: ['A', 'B', 'C'], sectionCapacity: 35, isDefault: true },
  { id: 'cls-3rd', className: '3rd', sections: ['A', 'B', 'C'], sectionCapacity: 35, isDefault: true },
  { id: 'cls-4th', className: '4th', sections: ['A', 'B', 'C'], sectionCapacity: 35, isDefault: true },
  { id: 'cls-5th', className: '5th', sections: ['A', 'B', 'C'], sectionCapacity: 35, isDefault: true },
];

export const DEFAULT_SCHOOL_PROFILE: SchoolProfileSettings = {
  schoolName: 'NITESH SCHOOL MANAGEMENT SYSTEM',
  tagline: 'Recognized Primary & Secondary Institution',
  logoDataUrl: '',
  address: '',
  phone: '+91 8603219331',
  alternatePhone: '',
  email: 'NITESHRAVI8603@GMAIL.COM',
  website: '',
  directorName: '',
  principalName: '',
  affiliationNo: '',
  authorityDesignation: 'Principal',
  signatureDataUrl: '',
  stampDataUrl: '',
};

export function createDefaultSessions(activeSessionName = '2026-2027'): AcademicSessionConfig[] {
  const nowIso = new Date().toISOString();
  return ACADEMIC_SESSIONS.map((name, idx) => ({
    id: `ses-${idx + 1}-${name}`,
    name,
    startMonth: 'April',
    endMonth: 'March',
    isActive: name === activeSessionName,
    createdAt: nowIso,
  }));
}

function normalizeSchoolProfile(raw?: Partial<SchoolProfileSettings>): SchoolProfileSettings {
  return {
    schoolName:
      String(raw?.schoolName ?? DEFAULT_SCHOOL_PROFILE.schoolName).trim() ||
      DEFAULT_SCHOOL_PROFILE.schoolName,
    tagline:
      raw?.tagline !== undefined
        ? String(raw.tagline).trim()
        : DEFAULT_SCHOOL_PROFILE.tagline,
    logoDataUrl: raw?.logoDataUrl || '',
    address: raw?.address ? String(raw.address).trim() : '',
    phone: raw?.phone ? String(raw.phone).trim() : '',
    alternatePhone: raw?.alternatePhone ? String(raw.alternatePhone).trim() : '',
    email: raw?.email ? String(raw.email).trim() : '',
    website: raw?.website ? String(raw.website).trim() : '',
    directorName: raw?.directorName ? String(raw.directorName).trim() : '',
    principalName: raw?.principalName ? String(raw.principalName).trim() : '',
    affiliationNo: raw?.affiliationNo ? String(raw.affiliationNo).trim() : '',
    authorityDesignation:
      raw?.authorityDesignation !== undefined
        ? String(raw.authorityDesignation).trim() || 'Principal'
        : 'Principal',
    signatureDataUrl: raw?.signatureDataUrl || '',
    stampDataUrl: raw?.stampDataUrl || '',
  };
}

function normalizeSessions(
  rawSessions?: Partial<AcademicSessionConfig>[],
  preferredActive?: string
): { sessions: AcademicSessionConfig[]; activeSession: string } {
  const nowIso = new Date().toISOString();
  let list: AcademicSessionConfig[] = [];

  if (Array.isArray(rawSessions) && rawSessions.length > 0) {
    const seen = new Set<string>();
    rawSessions.forEach((s, idx) => {
      const cleanName = String(s.name || '').trim();
      if (!cleanName || seen.has(cleanName.toLowerCase())) return;
      seen.add(cleanName.toLowerCase());
      const startMonth =
        s.startMonth && CALENDAR_MONTHS.includes(s.startMonth) ? s.startMonth : 'April';
      const endMonth =
        s.endMonth && CALENDAR_MONTHS.includes(s.endMonth) ? s.endMonth : 'March';
      list.push({
        id: s.id || `ses-${Date.now()}-${idx}`,
        name: cleanName,
        startMonth,
        endMonth,
        isActive: Boolean(s.isActive),
        createdAt: s.createdAt || nowIso,
      });
    });
  }

  if (list.length === 0) {
    list = createDefaultSessions(preferredActive || '2026-2027');
  }

  const activeObj =
    (preferredActive && list.find((s) => s.name === preferredActive)) ||
    list.find((s) => s.isActive) ||
    list.find((s) => s.name === '2026-2027') ||
    list[0];

  const activeName = activeObj.name;
  const normalized = list.map((s) => ({
    ...s,
    isActive: s.name === activeName,
  }));

  return { sessions: normalized, activeSession: activeName };
}

function normalizeStudent(raw: Partial<StudentRecord>): StudentRecord {
  const admissionType: AdmissionType = raw.admissionType === 'Free' ? 'Free' : 'Paid';
  const status: StudentStatus = raw.status === 'Deactive' ? 'Deactive' : 'Active';
  const transportEnabled =
    typeof raw.transportEnabled === 'boolean' ? raw.transportEnabled : Boolean(raw.routeId);
  return {
    id: raw.id || `stu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    admissionId: raw.admissionId || 'RB1001',
    rollNumber: raw.rollNumber ? String(raw.rollNumber).trim() : '',
    status,
    deactivatedAt: status === 'Deactive' ? raw.deactivatedAt || undefined : undefined,
    deactivatedReason: status === 'Deactive' ? raw.deactivatedReason || '' : undefined,
    promotionHistory: Array.isArray(raw.promotionHistory) ? raw.promotionHistory : [],
    academicSession: raw.academicSession || '2026-2027',
    admissionType,
    admissionFee: admissionType === 'Free' ? 0 : sanitizeNumber(raw.admissionFee ?? 0, 0),
    previousSchool: raw.previousSchool || '',
    lastGradePassed: raw.lastGradePassed || '',
    tcDetails: raw.tcDetails || '',
    name: raw.name || '',
    dob: raw.dob || '',
    gender: raw.gender || 'Male',
    casteCategory: raw.casteCategory || 'General',
    className: raw.className || 'Nursery',
    section: raw.section || 'A',
    monthlyTuitionFee: sanitizeNumber(raw.monthlyTuitionFee ?? 0, 0),
    fatherName: raw.fatherName || '',
    motherName: raw.motherName || '',
    phone: raw.phone || '',
    alternatePhone: raw.alternatePhone || '',
    address: raw.address || '',
    photoDataUrl: raw.photoDataUrl || '',
    aadhaarNumber: raw.aadhaarNumber || '',
    aadhaarDocDataUrl: raw.aadhaarDocDataUrl || '',
    transportEnabled,
    routeId: transportEnabled ? raw.routeId || '' : '',
    transportFee: transportEnabled ? sanitizeNumber(raw.transportFee ?? 0, 0) : 0,
    customNotes: raw.customNotes || '',
    admissionDate: raw.admissionDate || getTodayISO(),
  };
}

function normalizeRoute(raw: Partial<TransportRoute>): TransportRoute {
  return {
    id: raw.id || `rte-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    routeName: raw.routeName || '',
    busNumber: raw.busNumber || '',
    pickupPoints: raw.pickupPoints || '',
    monthlyFare: sanitizeNumber(raw.monthlyFare ?? 0, 0),
    driverName: raw.driverName || '',
    driverPhone: raw.driverPhone || '',
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

function normalizeExam(raw: Partial<ExamDefinition>): ExamDefinition {
  const subjects: ExamSubjectSchedule[] = Array.isArray(raw.subjects)
    ? raw.subjects.map((sub, idx) => ({
        id: sub.id || `sub-${Date.now()}-${idx}`,
        subjectName: String(sub.subjectName || '').trim() || `Subject ${idx + 1}`,
        subjectCode: String(sub.subjectCode || '').trim().toUpperCase(),
        maxMarks: sanitizeNumber(sub.maxMarks ?? 100, 1, 1000),
        minMarks: sanitizeNumber(
          sub.minMarks ?? 33,
          0,
          sanitizeNumber(sub.maxMarks ?? 100, 1, 1000)
        ),
        examDate: sub.examDate || getTodayISO(),
        startTime: sub.startTime || '09:00',
        endTime: sub.endTime || '12:00',
      }))
    : [];

  return {
    id: raw.id || `exm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    examCode: raw.examCode || 'EXM101',
    examName: String(raw.examName || '').trim() || 'School Examination',
    academicSession: raw.academicSession || '2026-2027',
    className: raw.className || 'Nursery',
    examCenter: raw.examCenter || 'Main School Campus',
    instructions: raw.instructions || DEFAULT_EXAM_INSTRUCTIONS,
    subjects: sortExamSubjects(subjects),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function normalizeStaff(raw: Partial<StaffMember>): StaffMember {
  return {
    id: raw.id || `stf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    staffId: raw.staffId ? String(raw.staffId).trim().toUpperCase() : 'STF101',
    fullName: raw.fullName ? String(raw.fullName).trim() : '',
    fatherOrSpouseName: raw.fatherOrSpouseName ? String(raw.fatherOrSpouseName).trim() : '',
    designation: raw.designation ? String(raw.designation).trim() : 'Teacher (Primary / PRT)',
    assignedDepartment: raw.assignedDepartment ? String(raw.assignedDepartment).trim() : '',
    qualification: raw.qualification ? String(raw.qualification).trim() : '',
    monthlySalary: sanitizeNumber(raw.monthlySalary ?? 0, 0),
    address: raw.address ? String(raw.address).trim() : '',
    phone: raw.phone ? String(raw.phone).trim() : '',
    emergencyContact: raw.emergencyContact ? String(raw.emergencyContact).trim() : '',
    joinedDate: raw.joinedDate || getTodayISO(),
    photoDataUrl: raw.photoDataUrl || '',
  };
}

function normalizeCustomDesignations(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const defaultLower = new Set(DEFAULT_STAFF_DESIGNATIONS.map((d) => d.toLowerCase()));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const clean = String(item || '').trim();
    if (!clean) continue;
    const lower = clean.toLowerCase();
    if (defaultLower.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    result.push(clean);
  }
  return result;
}

export function createEmptyDatabase(): SchoolDatabase {
  const defaultClassNames = DEFAULT_CLASSES.map((c) => c.className);
  const { sessions, activeSession } = normalizeSessions(undefined, '2026-2027');
  return {
    version: 8,
    counters: {
      studentSeq: 1001,
      receiptSeq: 90001,
      staffSeq: 101,
      examSeq: 101,
    },
    sessions,
    activeSession,
    schoolProfile: { ...DEFAULT_SCHOOL_PROFILE },
    billingCutoffMonth: getCurrentAcademicMonth(),
    feeSchedules: buildDefaultFeeSchedules(
      defaultClassNames,
      sessions.map((s) => s.name)
    ),
    students: [],
    fees: [],
    routes: [],
    staff: [],
    customDesignations: [],
    classes: DEFAULT_CLASSES.map((cls) => ({ ...cls, sections: [...cls.sections] })),
    attendance: {},
    exams: [],
    marksheets: [],
    grades: [],
    notices: [],
    lastUpdated: new Date().toISOString(),
  };
}

function normalizeRawDatabase(parsed: Partial<SchoolDatabase>): SchoolDatabase {
  const classes =
    Array.isArray(parsed.classes) && parsed.classes.length > 0
      ? parsed.classes
      : DEFAULT_CLASSES.map((cls) => ({ ...cls, sections: [...cls.sections] }));
  const { sessions, activeSession } = normalizeSessions(
    parsed.sessions,
    parsed.activeSession
  );
  const schoolProfile = normalizeSchoolProfile(parsed.schoolProfile);

  const cutoff =
    parsed.billingCutoffMonth && CALENDAR_MONTHS.includes(parsed.billingCutoffMonth)
      ? parsed.billingCutoffMonth
      : getCurrentAcademicMonth();

  const feeSchedules =
    Array.isArray(parsed.feeSchedules) && parsed.feeSchedules.length > 0
      ? parsed.feeSchedules
      : buildDefaultFeeSchedules(
          classes.map((c) => c.className),
          sessions.map((s) => s.name)
        );

  return {
    version: 8,
    counters: {
      studentSeq: sanitizeNumber(parsed.counters?.studentSeq ?? 1001, 1001),
      receiptSeq: sanitizeNumber(parsed.counters?.receiptSeq ?? 90001, 90001),
      staffSeq: sanitizeNumber(parsed.counters?.staffSeq ?? 101, 101),
      examSeq: sanitizeNumber(parsed.counters?.examSeq ?? 101, 101),
    },
    sessions,
    activeSession,
    schoolProfile,
    billingCutoffMonth: cutoff,
    feeSchedules,
    students: Array.isArray(parsed.students) ? parsed.students.map(normalizeStudent) : [],
    fees: Array.isArray(parsed.fees) ? parsed.fees : [],
    routes: Array.isArray(parsed.routes) ? parsed.routes.map(normalizeRoute) : [],
    staff: Array.isArray(parsed.staff) ? parsed.staff.map(normalizeStaff) : [],
    customDesignations: normalizeCustomDesignations(parsed.customDesignations),
    classes,
    attendance:
      parsed.attendance && typeof parsed.attendance === 'object' ? parsed.attendance : {},
    exams: Array.isArray(parsed.exams) ? parsed.exams.map(normalizeExam) : [],
    marksheets: Array.isArray(parsed.marksheets) ? parsed.marksheets : [],
    grades: Array.isArray(parsed.grades) ? parsed.grades : [],
    notices: Array.isArray(parsed.notices) ? parsed.notices : [],
    lastUpdated:
      typeof parsed.lastUpdated === 'string' ? parsed.lastUpdated : new Date().toISOString(),
  };
}

function parseDatabaseFromStorageKey(storageKey: string): SchoolDatabase | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SchoolDatabase>;
    return normalizeRawDatabase(parsed);
  } catch {
    return null;
  }
}

function loadTenantDatabaseFromCache(schoolId: string | null): SchoolDatabase {
  if (!schoolId) return createEmptyDatabase();
  return parseDatabaseFromStorageKey(getTenantCacheKey(schoolId)) || createEmptyDatabase();
}

export function hasLegacyLocalDatabaseRecords(): {
  hasRecords: boolean;
  schoolName: string;
  studentCount: number;
  feeCount: number;
} {
  const parsed = parseDatabaseFromStorageKey(LEGACY_DB_STORAGE_KEY);
  if (!parsed) {
    return { hasRecords: false, schoolName: '', studentCount: 0, feeCount: 0 };
  }
  const hasRecords =
    parsed.students.length > 0 || parsed.fees.length > 0 || parsed.staff.length > 0;
  return {
    hasRecords,
    schoolName: parsed.schoolProfile.schoolName || 'RB PUBLIC SCHOOL',
    studentCount: parsed.students.length,
    feeCount: parsed.fees.length,
  };
}

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export interface AddStudentInput {
  rollNumber?: string;
  status?: StudentStatus;
  deactivatedReason?: string;
  academicSession: string;
  admissionType: AdmissionType;
  admissionFee: number;
  previousSchool: string;
  lastGradePassed: string;
  tcDetails: string;
  name: string;
  dob: string;
  gender: Gender;
  casteCategory: CasteCategory;
  className: string;
  section: string;
  monthlyTuitionFee: number;
  fatherName: string;
  motherName: string;
  phone: string;
  alternatePhone: string;
  address: string;
  photoDataUrl: string;
  aadhaarNumber: string;
  aadhaarDocDataUrl: string;
  transportEnabled: boolean;
  routeId: string;
  transportFee: number;
  customNotes: string;
  admissionDate?: string;
  recordAdmissionFeeInLedger?: boolean;
  admissionFeePaymentMode?: PaymentMode;
}

export interface PromoteStudentsInput {
  studentIds: string[];
  toSession: string;
  toClassName: string;
  sectionMode: 'keep' | 'assign';
  assignedSection?: string;
  syncTuitionFeeWithClassMaster: boolean;
  autoSwitchActiveSession?: boolean;
}

interface AddFeeInput {
  studentId: string;
  category: FeeCategory;
  feeMonth: FeeMonth;
  paymentMode: PaymentMode;
  amount: number;
  date?: string;
  remarks?: string;
}

interface AddRouteInput {
  routeName: string;
  busNumber: string;
  pickupPoints: string;
  monthlyFare: number;
  driverName: string;
  driverPhone: string;
}

export interface AddStaffInput {
  staffId?: string;
  fullName: string;
  fatherOrSpouseName: string;
  designation: StaffDesignation;
  assignedDepartment: string;
  qualification: string;
  monthlySalary: number;
  address: string;
  phone: string;
  emergencyContact: string;
  joinedDate: string;
  photoDataUrl: string;
}

export interface SaveExamInput {
  examName: string;
  academicSession: string;
  className: string;
  examCenter: string;
  instructions: string;
  subjects: Array<{
    id?: string;
    subjectName: string;
    subjectCode: string;
    maxMarks: number;
    minMarks: number;
    examDate: string;
    startTime: string;
    endTime: string;
  }>;
}

export interface SaveStudentMarksheetInput {
  examId: string;
  studentId: string;
  scoresBySubjectId: Record<string, RawSubjectMarkInput>;
  customRemarks?: string;
}

export interface BulkStudentMarksInput {
  studentId: string;
  scoresBySubjectId: Record<string, RawSubjectMarkInput>;
  customRemarks?: string;
}

interface AddGradeInput {
  studentId: string;
  term: ExamTerm;
  english: number;
  hindi: number;
  maths: number;
  science: number;
}

interface AddNoticeInput {
  title: string;
  body: string;
  category: NoticeCategory;
}

export type FeeSubTab = 'ledger' | 'dues' | 'structure';
export type StaffSubTab = 'directory' | 'id-cards';

interface SchoolContextValue {
  db: SchoolDatabase;
  accounts: StaffAccount[];
  currentUserEmail: string | null;
  authReady: boolean;
  firebaseUserEmail: string | null;
  firebaseUserDisplayName: string | null;
  needsEmailVerification: boolean;
  needsSchoolOnboarding: boolean;

  // Multi-Tenant SaaS & RBAC State
  activeSchoolId: string | null;
  tenantMeta: SchoolTenantMeta | null;
  userMemberships: UserSchoolMembership[];
  currentRole: SchoolRole;
  isCurrentUserAdmin: boolean;
  isReadOnlyRole: boolean;
  canAccessModule: (module: ModuleId) => boolean;
  canManageStudents: boolean;
  canManageFees: boolean;
  canManageAttendance: boolean;
  canManageMarks: boolean;
  canManageExamSchedules: boolean;
  canManageCampusOps: boolean;
  canDeleteRecords: boolean;

  schoolMembers: SchoolMemberRecord[];
  staffInvites: StaffInviteRecord[];
  accountantMaxLimit: number;
  activeAccountantSeatsUsed: number;
  pendingAccountantInvitesCount: number;

  // Pending Invite Link Claim State
  pendingInviteParams: PendingInviteUrlParams | null;
  pendingInviteDoc: StaffInviteRecord | null;
  pendingInviteStatus: PendingInviteClaimState;
  claimPendingInvite: () => Promise<{ ok: boolean; error?: string }>;
  dismissPendingInvite: () => void;

  // Multi-Tenant Registration, Dynamic Cloud Binding & Workspace Switching
  cloudBinding: DynamicCloudBinding;
  updateCloudBinding: (
    nextBinding: DynamicCloudBinding
  ) => Promise<{ ok: boolean; error?: string; needsSupabaseTable?: boolean }>;
  registerSchoolModalOpen: boolean;
  setRegisterSchoolModalOpen: (open: boolean) => void;
  switchActiveSchool: (schoolId: string) => void;
  registerSchoolWorkspace: (
    input: RegisterSchoolTenantInput & {
      importLegacyLocal?: boolean;
      cloudBinding?: DynamicCloudBinding;
    }
  ) => Promise<{ ok: boolean; schoolId?: string; error?: string }>;
  updateSubscriptionPlan: (
    plan: SubscriptionPlan,
    status?: SubscriptionStatus
  ) => Promise<void>;

  // Module 3: In-App "Ask AI / Change Us" Customization Engine (Main Admin Only)
  aiCustomization: AiCustomizationSettings;
  aiDrawerOpen: boolean;
  setAiDrawerOpen: (open: boolean) => void;
  updateAiCustomization: (next: AiCustomizationSettings) => void;
  resetAiCustomization: () => void;

  // Module 4: Manual Photo Fallback & Quick Passport Cropper
  photoOverrides: Record<string, string>;
  getEffectiveStudentPhoto: (student?: StudentRecord | null) => string;
  getEffectiveStaffPhoto: (staff?: StaffMember | null) => string;
  setTemporaryPhotoOverride: (
    targetType: 'student' | 'staff',
    recordId: string,
    dataUrl: string
  ) => void;
  saveQuickPersonPhoto: (
    targetType: 'student' | 'staff',
    recordId: string,
    dataUrl: string
  ) => Promise<void>;

  // Auth Actions (Google + Email/Password)
  cloudSyncStatus: CloudSyncStatus;
  authorizedStaffEmails: string[];
  firebaseProjectId: string;
  firestoreDatabaseId: string;
  signInWithGoogle: () => Promise<{ ok: boolean; error?: string }>;
  signInWithEmail: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string; needsVerification?: boolean }>;
  registerWithEmail: (
    email: string,
    password: string,
    displayName?: string,
    pendingSchoolReg?: RegisterSchoolTenantInput & {
      importLegacyLocal?: boolean;
      cloudBinding?: DynamicCloudBinding;
    }
  ) => Promise<{ ok: boolean; error?: string; needsVerification?: boolean }>;
  resendVerificationEmail: () => Promise<{ ok: boolean; error?: string }>;
  refreshEmailVerificationStatus: () => Promise<{
    ok: boolean;
    verified: boolean;
    error?: string;
  }>;
  authenticateStaff: (
    email: string,
    password: string,
    createAccount: boolean
  ) => Promise<{ ok: boolean; error?: string }>;
  retryCloudConnection: () => void;
  signOutStaff: () => void;

  // Staff Invite & RBAC Management Actions (Main Admin)
  buildInviteRegistrationUrl: (schoolId: string, inviteId: string) => string;
  createStaffAccountWithCredentials: (input: {
    fullName: string;
    email: string;
    password: string;
    role: InvitableSchoolRole;
    staffProfileId?: string;
  }) => Promise<{
    ok: boolean;
    error?: string;
    staffUid?: string;
    generatedPassword?: string;
  }>;
  sendStaffPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>;
  createStaffInvite: (input: {
    invitedName: string;
    invitedEmail: string;
    role: InvitableSchoolRole;
  }) => Promise<{
    ok: boolean;
    invite?: StaffInviteRecord;
    inviteUrl?: string;
    error?: string;
  }>;
  changeSchoolMemberRole: (
    memberUid: string,
    nextRole: InvitableSchoolRole
  ) => Promise<{ ok: boolean; error?: string }>;
  removeSchoolMember: (memberUid: string) => Promise<{ ok: boolean; error?: string }>;
  revokeStaffInvite: (inviteId: string) => Promise<{ ok: boolean; error?: string }>;

  // Legacy compatibility helpers
  addAuthorizedStaffEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  removeAuthorizedStaffEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  uploadCloudMedia: (
    file: File,
    category: MediaCategory,
    recordRef: string
  ) => Promise<{ storedUrl: string; displayUrl: string }>;

  activeModule: ModuleId;
  setActiveModule: (module: ModuleId) => void;
  feeSubTab: FeeSubTab;
  setFeeSubTab: (tab: FeeSubTab) => void;
  preselectedFeeStudentId: string | null;
  clearPreselectedFeeStudent: () => void;
  openFeeModuleForStudent: (studentId?: string, subTab?: FeeSubTab) => void;
  preselectedIdCardStudentId: string | null;
  clearPreselectedIdCardStudent: () => void;
  openIdCardForStudent: (studentId: string) => void;
  preselectedEditStudentId: string | null;
  clearPreselectedEditStudent: () => void;
  openEditStudentModal: (studentId: string) => void;
  staffSubTab: StaffSubTab;
  setStaffSubTab: (tab: StaffSubTab) => void;
  preselectedStaffIdCardId: string | null;
  clearPreselectedStaffIdCard: () => void;
  openStaffIdCardStudio: (staffId?: string) => void;

  // Academic Session Management & Student Promotion
  activeSessionConfig: AcademicSessionConfig;
  activeSessionMonths: FeeMonth[];
  addAcademicSession: (input: {
    name: string;
    startMonth: FeeMonth;
    endMonth: FeeMonth;
    makeActive?: boolean;
  }) => boolean;
  updateAcademicSession: (
    id: string,
    input: { name: string; startMonth: FeeMonth; endMonth: FeeMonth }
  ) => boolean;
  setActiveAcademicSession: (sessionNameOrId: string) => void;
  deleteAcademicSession: (id: string) => void;
  promoteStudents: (input: PromoteStudentsInput) => {
    ok: boolean;
    promotedCount: number;
    error?: string;
  };

  // School Profile & Branding Settings
  updateSchoolProfile: (profile: SchoolProfileSettings) => void;

  // Automated Fee Engine & Class-Session Schedule
  dueOverview: {
    totalExpected: number;
    totalOutstandingDues: number;
    defaultersCount: number;
    summaries: StudentDueSummary[];
    byStudentId: Record<string, StudentDueSummary>;
  };
  setBillingCutoffMonth: (month: FeeMonth) => void;
  getClassSessionFee: (className: string, academicSession: string) => ClassSessionFeeRate;
  updateClassSessionFee: (
    className: string,
    academicSession: string,
    admissionFee: number,
    monthlyTuitionFee: number,
    annualExamFee: number
  ) => void;

  // Module 1: Admissions & Student Status
  addStudent: (input: AddStudentInput) => StudentRecord;
  updateStudent: (id: string, input: AddStudentInput) => void;
  setStudentStatus: (studentId: string, status: StudentStatus, reason?: string) => void;
  deleteStudent: (id: string) => void;

  // Module 2: Fees
  collectFee: (input: AddFeeInput) => FeeRecord | null;
  deleteFee: (id: string) => void;

  // Module 3: Transport
  addRoute: (input: AddRouteInput) => TransportRoute;
  updateRoute: (id: string, input: AddRouteInput) => void;
  deleteRoute: (id: string) => void;

  // Module 4: Staff & Automated Staff ID Cards
  addStaff: (input: AddStaffInput) => StaffMember | null;
  updateStaff: (id: string, input: AddStaffInput) => boolean;
  deleteStaff: (id: string) => void;
  addCustomDesignation: (postName: string) => string | null;

  // Module 5: Classes & Sections
  addClassAllocation: (
    className: string,
    sections: string[],
    sectionCapacity: number
  ) => boolean;
  addSectionToClass: (classId: string, sectionName: string) => boolean;
  removeSectionFromClass: (classId: string, sectionName: string) => void;
  updateClassCapacity: (classId: string, capacity: number) => void;
  deleteClassAllocation: (classId: string) => void;

  // Module 6: Attendance
  saveAttendanceSheet: (
    date: string,
    className: string,
    section: string,
    entries: Record<string, AttendanceStatus>,
    notes: Record<string, string>
  ) => DailyAttendanceSheet;

  // Module 7: Comprehensive Exam Management & Gradebook
  createExam: (input: SaveExamInput) => ExamDefinition | null;
  updateExam: (examId: string, input: SaveExamInput) => ExamDefinition | null;
  deleteExam: (examId: string) => void;
  saveStudentMarksheet: (
    input: SaveStudentMarksheetInput
  ) => { ok: boolean; marksheet?: StudentExamMarksheet; error?: string };
  saveBulkExamMarksheets: (
    examId: string,
    entries: BulkStudentMarksInput[]
  ) => { ok: boolean; savedCount: number; error?: string };
  deleteStudentMarksheet: (marksheetId: string) => void;
  saveGradeRecord: (input: AddGradeInput, existingId?: string) => ExamGradeRecord | null;
  deleteGradeRecord: (id: string) => void;

  // Module 8: Notices
  addNotice: (input: AddNoticeInput) => NoticeItem;
  deleteNotice: (id: string) => void;

  // Module 9: Settings, Cloud Access & Backups (JSON + Excel)
  storageSizeBytes: number;
  exportBackupJson: () => string;
  exportBackupExcel: () => string;
  importBackupJson: (jsonText: string) => { ok: boolean; error?: string };
  resetSystemData: (includeAccounts?: boolean) => void;

  // Print Stationery Preview
  activePrintDoc: PrintableDocumentPayload | null;
  openPrintPreview: (payload: PrintableDocumentPayload) => void;
  closePrintPreview: () => void;

  // Toast & Confirmation UI
  toasts: ToastMessage[];
  notify: (kind: ToastMessage['kind'], title: string, description?: string) => void;
  dismissToast: (id: string) => void;
  confirmDialog: ConfirmOptions | null;
  requestConfirm: (options: ConfirmOptions) => void;
  closeConfirm: () => void;
}

const SchoolContext = createContext<SchoolContextValue | null>(null);

export const SchoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDbState] = useState<SchoolDatabase>(() => createEmptyDatabase());
  const dbRef = useRef<SchoolDatabase>(db);

  const commitDb = useCallback((updater: (prev: SchoolDatabase) => SchoolDatabase) => {
    const next = updater(dbRef.current);
    dbRef.current = next;
    setDbState(next);
    return next;
  }, []);

  // Cloud Auth, Multi-Tenant, Dynamic Cloud Binding & RBAC State
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userMemberships, setUserMemberships] = useState<UserSchoolMembership[]>([]);
  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null);
  const activeSchoolIdRef = useRef<string | null>(null);
  const [tenantMeta, setTenantMeta] = useState<SchoolTenantMeta | null>(null);
  const tenantMetaRef = useRef<SchoolTenantMeta | null>(null);
  const [currentRole, setCurrentRole] = useState<SchoolRole>('main_admin');
  const currentRoleRef = useRef<SchoolRole>('main_admin');
  const [isCurrentUserAuthorized, setIsCurrentUserAuthorized] = useState<boolean>(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('initializing');
  const [cloudInitNonce, setCloudInitNonce] = useState<number>(0);

  const [cloudBinding, setCloudBinding] = useState<DynamicCloudBinding>(() =>
    normalizeCloudBinding({ provider: 'managed', apiUrl: '', publicKey: '' })
  );
  const cloudBindingRef = useRef<DynamicCloudBinding>(cloudBinding);
  const bindingsBySchoolRef = useRef<Record<string, DynamicCloudBinding>>({});

  const [aiCustomization, setAiCustomizationState] = useState<AiCustomizationSettings>(
    DEFAULT_AI_CUSTOMIZATION
  );
  const aiCustomizationRef = useRef<AiCustomizationSettings>(DEFAULT_AI_CUSTOMIZATION);
  const [aiDrawerOpen, setAiDrawerOpen] = useState<boolean>(false);
  const [photoOverrides, setPhotoOverrides] = useState<Record<string, string>>({});

  const [schoolMembers, setSchoolMembers] = useState<SchoolMemberRecord[]>([]);
  const schoolMembersRef = useRef<SchoolMemberRecord[]>([]);
  const [staffInvites, setStaffInvites] = useState<StaffInviteRecord[]>([]);
  const staffInvitesRef = useRef<StaffInviteRecord[]>([]);
  const [authorizedStaffEmails, setAuthorizedStaffEmails] = useState<string[]>([]);
  const authorizedEmailsRef = useRef<string[]>([]);

  // Pending Staff Invite URL Parameters
  const [pendingInviteParams, setPendingInviteParams] = useState<PendingInviteUrlParams | null>(
    () => readInitialInviteParams()
  );
  const [pendingInviteDoc, setPendingInviteDoc] = useState<StaffInviteRecord | null>(null);
  const [pendingInviteStatus, setPendingInviteStatus] = useState<PendingInviteClaimState>(() =>
    readInitialInviteParams() ? 'loading' : 'none'
  );
  const [registerSchoolModalOpen, setRegisterSchoolModalOpen] = useState<boolean>(false);

  // Maps display dataUrls back to compact cloud URLs (`https://...` or `cloud-media://...`)
  const displayToStoredMediaRef = useRef<Map<string, string>>(new Map());
  const mediaFilesByIdRef = useRef<Record<string, string>>({});
  const rawStudentUrlsRef = useRef<
    Record<string, { photoUrl: string; aadhaarDocUrl: string }>
  >({});
  const rawStaffPhotoUrlsRef = useRef<Record<string, string>>({});
  const rawSchoolLogoUrlRef = useRef<string>('');

  const [activeModule, setActiveModuleState] = useState<ModuleId>('dashboard');
  const [feeSubTab, setFeeSubTab] = useState<FeeSubTab>('ledger');
  const [preselectedFeeStudentId, setPreselectedFeeStudentId] = useState<string | null>(null);
  const [preselectedIdCardStudentId, setPreselectedIdCardStudentId] = useState<string | null>(
    null
  );
  const [preselectedEditStudentId, setPreselectedEditStudentId] = useState<string | null>(null);
  const [staffSubTab, setStaffSubTab] = useState<StaffSubTab>('directory');
  const [preselectedStaffIdCardId, setPreselectedStaffIdCardId] = useState<string | null>(null);
  const [activePrintDoc, setActivePrintDoc] = useState<PrintableDocumentPayload | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmOptions | null>(null);
  const [storageSizeBytes, setStorageSizeBytes] = useState<number>(0);

  useEffect(() => {
    activeSchoolIdRef.current = activeSchoolId;
  }, [activeSchoolId]);

  useEffect(() => {
    tenantMetaRef.current = tenantMeta;
  }, [tenantMeta]);

  useEffect(() => {
    currentRoleRef.current = currentRole;
  }, [currentRole]);

  useEffect(() => {
    authorizedEmailsRef.current = authorizedStaffEmails;
  }, [authorizedStaffEmails]);

  useEffect(() => {
    cloudBindingRef.current = cloudBinding;
  }, [cloudBinding]);

  useEffect(() => {
    aiCustomizationRef.current = aiCustomization;
  }, [aiCustomization]);

  useEffect(() => {
    schoolMembersRef.current = schoolMembers;
  }, [schoolMembers]);

  useEffect(() => {
    staffInvitesRef.current = staffInvites;
  }, [staffInvites]);

  const needsEmailVerification = useMemo<boolean>(() => {
    return Boolean(firebaseUser && firebaseUser.email && !firebaseUser.emailVerified);
  }, [firebaseUser]);

  const needsSchoolOnboarding = useMemo<boolean>(() => {
    return Boolean(
      authReady &&
        firebaseUser &&
        firebaseUser.emailVerified &&
        !isCurrentUserAuthorized &&
        userMemberships.length === 0 &&
        !pendingInviteParams
    );
  }, [
    authReady,
    firebaseUser,
    isCurrentUserAuthorized,
    userMemberships.length,
    pendingInviteParams,
  ]);

  const currentUserEmail = useMemo<string | null>(() => {
    if (
      !authReady ||
      !firebaseUser ||
      !firebaseUser.emailVerified ||
      !isCurrentUserAuthorized ||
      !activeSchoolId ||
      pendingInviteParams
    ) {
      return null;
    }
    return firebaseUser.email || null;
  }, [authReady, firebaseUser, isCurrentUserAuthorized, activeSchoolId, pendingInviteParams]);

  const isCurrentUserAdmin = currentRole === 'main_admin';
  const isReadOnlyRole = currentRole === 'director';
  const canManageStudents = currentRole === 'main_admin' || currentRole === 'accountant';
  const canManageFees = currentRole === 'main_admin' || currentRole === 'accountant';
  const canManageAttendance = currentRole === 'main_admin' || currentRole === 'teacher';
  const canManageMarks = currentRole === 'main_admin' || currentRole === 'teacher';
  const canManageExamSchedules = currentRole === 'main_admin';
  const canManageCampusOps = currentRole === 'main_admin';
  const canDeleteRecords = currentRole === 'main_admin';

  const canAccessModule = useCallback(
    (module: ModuleId): boolean => {
      return getAllowedModulesForRole(currentRole).includes(module);
    },
    [currentRole]
  );

  const activeAccountantSeatsUsed = useMemo(() => {
    if (schoolMembers.length > 0) {
      return schoolMembers.filter((m) => m.role === 'accountant').length;
    }
    return tenantMeta?.accountantCount || 0;
  }, [schoolMembers, tenantMeta]);

  const pendingAccountantInvitesCount = useMemo(() => {
    return staffInvites.filter((inv) => inv.status === 'pending' && inv.role === 'accountant')
      .length;
  }, [staffInvites]);

  const accounts = useMemo<StaffAccount[]>(() => {
    return authorizedStaffEmails.map((em, idx) => ({
      id: `cloud-acc-${idx}`,
      email: em,
      passwordHash: 'cloud-rbac',
      createdAt: '',
    }));
  }, [authorizedStaffEmails]);

  const notify = useCallback(
    (kind: ToastMessage['kind'], title: string, description?: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, kind, title, description }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const requestConfirm = useCallback((options: ConfirmOptions) => {
    setConfirmDialog(options);
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmDialog(null);
  }, []);

  const setActiveModule = useCallback(
    (nextModule: ModuleId) => {
      const allowed = getAllowedModulesForRole(currentRoleRef.current);
      if (!allowed.includes(nextModule)) {
        const fallback = getDefaultModuleForRole(currentRoleRef.current);
        setActiveModuleState(fallback);
        notify(
          'error',
          'Access Restricted by Role',
          `Your assigned role (${currentRoleRef.current}) does not have access to that module.`
        );
        return;
      }
      setActiveModuleState(nextModule);
    },
    [notify]
  );

  // Enforce allowed module whenever role changes
  useEffect(() => {
    const allowed = getAllowedModulesForRole(currentRole);
    if (!allowed.includes(activeModule)) {
      setActiveModuleState(getDefaultModuleForRole(currentRole));
    }
  }, [currentRole, activeModule]);

  // Tenant-isolated localStorage mirror cache
  useEffect(() => {
    dbRef.current = db;
    if (!activeSchoolId) return;
    try {
      const serialized = JSON.stringify(db);
      localStorage.setItem(getTenantCacheKey(activeSchoolId), serialized);
      setStorageSizeBytes(new Blob([serialized]).size);
    } catch {
      // Cloud Firestore remains source of truth
    }
  }, [db, activeSchoolId]);

  const buildExternalEnvelope = useCallback(
    (
      schoolId: string,
      overrides?: Partial<ExternalCloudTenantEnvelope>
    ): ExternalCloudTenantEnvelope => {
      const nowIso = new Date().toISOString();
      const user = firebaseAuth.currentUser;
      const fallbackMeta: SchoolTenantMeta = tenantMetaRef.current || {
        id: schoolId,
        schoolName: dbRef.current.schoolProfile.schoolName || 'School ERP',
        ownerUid: user?.uid || '',
        ownerEmail: user?.email || '',
        subscriptionPlan: 'Enterprise',
        subscriptionStatus: 'Active',
        accountantCount: schoolMembersRef.current.filter((m) => m.role === 'accountant').length,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      return {
        schoolId,
        tenantMeta: {
          ...fallbackMeta,
          schoolName: dbRef.current.schoolProfile.schoolName || fallbackMeta.schoolName,
          updatedAt: nowIso,
        },
        database: dbRef.current,
        uiCustomization: aiCustomizationRef.current,
        members: schoolMembersRef.current,
        invites: staffInvitesRef.current,
        updatedAt: nowIso,
        ...overrides,
      };
    },
    []
  );

  const runCloudTask = useCallback(
    (task: () => Promise<void>) => {
      if (
        !firebaseAuth.currentUser ||
        !isCurrentUserAuthorized ||
        !activeSchoolIdRef.current
      ) {
        return;
      }
      const targetSchoolId = activeSchoolIdRef.current;
      const currentBinding = cloudBindingRef.current;
      setCloudSyncStatus('syncing');

      const promise = isExternalDynamicCloud(currentBinding)
        ? saveExternalCloudSnapshot(
            targetSchoolId,
            currentBinding,
            buildExternalEnvelope(targetSchoolId)
          )
        : task();

      promise
        .then(() => {
          setCloudSyncStatus('live');
        })
        .catch((err) => {
          if (isQuotaExceededError(err)) {
            setCloudSyncStatus('quota-exceeded');
            notify(
              'error',
              'Cloud Firestore Daily Quota Reached',
              `Free daily quota resets tomorrow. Manage plan at console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore/databases/${FIRESTORE_DATABASE_ID}/data`
            );
          } else {
            setCloudSyncStatus('error');
            console.error('Cloud sync error:', err);
          }
        });
    },
    [buildExternalEnvelope, isCurrentUserAuthorized, notify]
  );

  // =========================================================================
  // 1. AUTH STATE, MASTER ACCOUNT CROSS-DEVICE ROUTING & INVITE INSPECTION
  // =========================================================================

  useEffect(() => {
    let cancelled = false;

    const unsubAuth = onAuthStateChanged(firebaseAuth, async (user) => {
      if (cancelled) return;
      setFirebaseUser(user);

      if (!user || !user.email) {
        setUserMemberships([]);
        setActiveSchoolId(null);
        setTenantMeta(null);
        setSchoolMembers([]);
        setStaffInvites([]);
        setIsCurrentUserAuthorized(false);
        setPendingInviteDoc(null);
        setPendingInviteStatus(pendingInviteParams ? 'ready' : 'none');
        setCloudSyncStatus('unauthenticated');
        setAuthReady(true);
        return;
      }

      if (!user.emailVerified) {
        setUserMemberships([]);
        setActiveSchoolId(null);
        setIsCurrentUserAuthorized(false);
        setCloudSyncStatus('needs-verification');
        setAuthReady(true);
        return;
      }

      setCloudSyncStatus('initializing');

      try {
        // 1A. Check if user registered a new school with Email/Password before verifying email
        const storedSchoolRegRaw = sessionStorage.getItem(PENDING_SCHOOL_REG_SESSION_KEY);
        if (storedSchoolRegRaw && !pendingInviteParams) {
          sessionStorage.removeItem(PENDING_SCHOOL_REG_SESSION_KEY);
          try {
            const regInput = JSON.parse(storedSchoolRegRaw) as RegisterSchoolTenantInput & {
              importLegacyLocal?: boolean;
              cloudBinding?: DynamicCloudBinding;
            };
            const existingMaster = await fetchMasterAccountProfile(user.uid);
            const existingMemberships = await fetchUserMemberships(user.uid);
            if (!existingMaster && existingMemberships.length === 0 && regInput.schoolName) {
              const seedDb = regInput.importLegacyLocal
                ? parseDatabaseFromStorageKey(LEGACY_DB_STORAGE_KEY) || createEmptyDatabase()
                : createEmptyDatabase();
              const normBinding = normalizeCloudBinding(regInput.cloudBinding);

              if (isExternalDynamicCloud(normBinding)) {
                const nowIso = new Date().toISOString();
                const slug = regInput.schoolName
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-+|-+$/g, '')
                  .slice(0, 24);
                const extSchoolId = toSafeDocId(
                  `sch_${slug || 'campus'}_${Math.random().toString(36).slice(2, 7)}`
                );
                const extDb: SchoolDatabase = {
                  ...seedDb,
                  schoolProfile: normalizeSchoolProfile({
                    ...seedDb.schoolProfile,
                    schoolName: regInput.schoolName.trim(),
                    tagline: regInput.tagline || seedDb.schoolProfile.tagline,
                    address: regInput.address || seedDb.schoolProfile.address,
                    phone: regInput.phone || seedDb.schoolProfile.phone,
                    email: user.email,
                  }),
                };
                const extMeta: SchoolTenantMeta = {
                  id: extSchoolId,
                  schoolName: regInput.schoolName.trim(),
                  ownerUid: user.uid,
                  ownerEmail: user.email.toLowerCase(),
                  subscriptionPlan: regInput.subscriptionPlan || 'Enterprise',
                  subscriptionStatus: 'Active',
                  accountantCount: 0,
                  createdAt: nowIso,
                  updatedAt: nowIso,
                };
                const ownerMember: SchoolMemberRecord = {
                  uid: user.uid,
                  schoolId: extSchoolId,
                  ownerUid: user.uid,
                  email: user.email.toLowerCase(),
                  displayName: regInput.adminDisplayName || user.displayName || 'Main Admin',
                  role: 'main_admin',
                  inviteId: 'owner_bootstrap',
                  addedByUid: user.uid,
                  createdAt: nowIso,
                  updatedAt: nowIso,
                };
                await saveExternalCloudSnapshot(extSchoolId, normBinding, {
                  schoolId: extSchoolId,
                  tenantMeta: extMeta,
                  database: extDb,
                  uiCustomization: DEFAULT_AI_CUSTOMIZATION,
                  members: [ownerMember],
                  invites: [],
                  updatedAt: nowIso,
                });
                await saveMasterAccountProfile({
                  uid: user.uid,
                  email: user.email,
                  displayName: regInput.adminDisplayName || user.displayName || 'Main Admin',
                  activeSchoolId: extSchoolId,
                  schoolName: regInput.schoolName.trim(),
                  role: 'main_admin',
                  binding: normBinding,
                });
                bindingsBySchoolRef.current[extSchoolId] = normBinding;
                localStorage.setItem(getActiveSchoolPrefKey(user.uid), extSchoolId);
              } else {
                const created = await registerNewSchoolTenant(
                  regInput,
                  {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                  },
                  seedDb
                );
                await saveMasterAccountProfile({
                  uid: user.uid,
                  email: user.email,
                  displayName: regInput.adminDisplayName || user.displayName || 'Main Admin',
                  activeSchoolId: created.schoolId,
                  schoolName: regInput.schoolName.trim(),
                  role: 'main_admin',
                  binding: normalizeCloudBinding({ provider: 'managed', apiUrl: '', publicKey: '' }),
                });
                localStorage.setItem(getActiveSchoolPrefKey(user.uid), created.schoolId);
              }
            }
          } catch (regErr) {
            console.error('Deferred school registration error:', regErr);
          }
        }

        // 1B. Cross-Device Master Account Lookup + Managed Memberships Discovery
        const [masterProfile, managedMemberships] = await Promise.all([
          fetchMasterAccountProfile(user.uid),
          fetchUserMemberships(user.uid),
        ]);
        if (cancelled) return;

        const mergedMemberships: UserSchoolMembership[] = [...managedMemberships];
        if (masterProfile && masterProfile.activeSchoolId) {
          bindingsBySchoolRef.current[masterProfile.activeSchoolId] = masterProfile.binding;
          if (!mergedMemberships.some((m) => m.schoolId === masterProfile.activeSchoolId)) {
            mergedMemberships.unshift({
              id: `${user.uid}_${masterProfile.activeSchoolId}`,
              uid: user.uid,
              schoolId: masterProfile.activeSchoolId,
              schoolName: masterProfile.schoolName || 'School ERP Workspace',
              role: masterProfile.role || 'main_admin',
              email: user.email.toLowerCase(),
              displayName: masterProfile.displayName || user.displayName || '',
              createdAt: masterProfile.createdAt,
              updatedAt: masterProfile.updatedAt,
            });
          }
        }
        setUserMemberships(mergedMemberships);

        // 1C. Handle Staff Invite Link if present in URL/sessionStorage
        if (pendingInviteParams) {
          const decodedToken = pendingInviteParams.cctx
            ? decodeDynamicCloudInviteToken(pendingInviteParams.cctx)
            : null;
          if (decodedToken) {
            bindingsBySchoolRef.current[decodedToken.schoolId] = decodedToken.binding;
          }

          const alreadyInInvitedSchool = mergedMemberships.find(
            (m) => m.schoolId === pendingInviteParams.schoolId
          );
          if (alreadyInInvitedSchool) {
            const targetBinding =
              bindingsBySchoolRef.current[alreadyInInvitedSchool.schoolId] ||
              normalizeCloudBinding({ provider: 'managed', apiUrl: '', publicKey: '' });
            clearInviteParamsFromBrowser();
            setPendingInviteParams(null);
            setPendingInviteDoc(null);
            setPendingInviteStatus('none');
            localStorage.setItem(
              getActiveSchoolPrefKey(user.uid),
              alreadyInInvitedSchool.schoolId
            );
            setCloudBinding(targetBinding);
            cloudBindingRef.current = targetBinding;
            setActiveSchoolId(alreadyInInvitedSchool.schoolId);
            setCurrentRole(alreadyInInvitedSchool.role);
            setActiveModuleState(getDefaultModuleForRole(alreadyInInvitedSchool.role));
            setIsCurrentUserAuthorized(true);
            setAuthReady(true);
            return;
          }

          setPendingInviteStatus('loading');

          if (decodedToken && isExternalDynamicCloud(decodedToken.binding)) {
            if (user.email.trim().toLowerCase() !== decodedToken.invitedEmail.toLowerCase()) {
              setPendingInviteDoc(null);
              setPendingInviteStatus('email_mismatch');
            } else {
              const extSnap = await loadExternalCloudSnapshot(
                decodedToken.schoolId,
                decodedToken.binding
              );
              const matchedInv = extSnap?.invites.find(
                (inv) => inv.id === decodedToken.inviteId
              );
              if (matchedInv && matchedInv.status === 'pending') {
                setPendingInviteDoc(matchedInv);
                setPendingInviteStatus('ready');
              } else {
                setPendingInviteDoc(matchedInv || null);
                setPendingInviteStatus('invalid_or_used');
              }
            }
            setIsCurrentUserAuthorized(false);
            setCloudSyncStatus('invite-claim');
            setAuthReady(true);
            return;
          }

          const inviteLookup = await fetchPendingInviteDetails(
            pendingInviteParams.schoolId,
            pendingInviteParams.inviteId
          );
          if (cancelled) return;

          if (inviteLookup.status === 'email_mismatch') {
            setPendingInviteDoc(null);
            setPendingInviteStatus('email_mismatch');
          } else if (
            inviteLookup.status === 'not_found' ||
            !inviteLookup.invite ||
            inviteLookup.invite.status !== 'pending'
          ) {
            setPendingInviteDoc(inviteLookup.invite || null);
            setPendingInviteStatus('invalid_or_used');
          } else {
            setPendingInviteDoc(inviteLookup.invite);
            setPendingInviteStatus('ready');
          }
          setIsCurrentUserAuthorized(false);
          setCloudSyncStatus('invite-claim');
          setAuthReady(true);
          return;
        }

        // 1D. If user has 0 school memberships -> Self-Serve School Onboarding
        if (mergedMemberships.length === 0) {
          setActiveSchoolId(null);
          setTenantMeta(null);
          setIsCurrentUserAuthorized(false);
          setCloudSyncStatus('onboarding');
          setAuthReady(true);
          return;
        }

        // 1E. Select active school workspace & bind linked cloud credentials automatically
        const savedPref = localStorage.getItem(getActiveSchoolPrefKey(user.uid));
        const chosen =
          mergedMemberships.find((m) => m.schoolId === savedPref) ||
          (masterProfile?.activeSchoolId
            ? mergedMemberships.find((m) => m.schoolId === masterProfile.activeSchoolId)
            : undefined) ||
          mergedMemberships[0];

        const chosenBinding =
          bindingsBySchoolRef.current[chosen.schoolId] ||
          (masterProfile?.activeSchoolId === chosen.schoolId
            ? masterProfile.binding
            : normalizeCloudBinding({ provider: 'managed', apiUrl: '', publicKey: '' }));

        bindingsBySchoolRef.current[chosen.schoolId] = chosenBinding;
        setCloudBinding(chosenBinding);
        cloudBindingRef.current = chosenBinding;

        if (!masterProfile) {
          void saveMasterAccountProfile({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || chosen.displayName || '',
            activeSchoolId: chosen.schoolId,
            schoolName: chosen.schoolName,
            role: chosen.role,
            binding: chosenBinding,
          }).catch(() => {});
        }

        localStorage.setItem(getActiveSchoolPrefKey(user.uid), chosen.schoolId);
        setActiveSchoolId(chosen.schoolId);
        setCurrentRole(chosen.role);
        setActiveModuleState((prev) =>
          getAllowedModulesForRole(chosen.role).includes(prev)
            ? prev
            : getDefaultModuleForRole(chosen.role)
        );
        setIsCurrentUserAuthorized(true);
        setAuthReady(true);
      } catch (err) {
        if (cancelled) return;
        if (isQuotaExceededError(err)) {
          setCloudSyncStatus('quota-exceeded');
        } else {
          setCloudSyncStatus('error');
        }
        setAuthReady(true);
        console.error('Multi-tenant initialization error:', err);
      }
    });

    return () => {
      cancelled = true;
      unsubAuth();
    };
  }, [cloudInitNonce, pendingInviteParams]);

  // =========================================================================
  // 2. REAL-TIME TENANT LISTENERS FOR ACTIVE SCHOOL (/schools/{activeSchoolId})
  // =========================================================================

  useEffect(() => {
    if (
      !authReady ||
      !firebaseUser ||
      !firebaseUser.email ||
      !firebaseUser.emailVerified ||
      !isCurrentUserAuthorized ||
      !activeSchoolId ||
      pendingInviteParams
    ) {
      return;
    }

    const schoolId = activeSchoolId;
    const userUid = firebaseUser.uid;
    const userEmail = firebaseUser.email.trim().toLowerCase();

    // Reset per-tenant in-memory media caches & hydrate instant tenant cache
    displayToStoredMediaRef.current = new Map();
    mediaFilesByIdRef.current = {};
    rawStudentUrlsRef.current = {};
    rawStaffPhotoUrlsRef.current = {};
    rawSchoolLogoUrlRef.current = '';
    setSchoolMembers([]);
    setStaffInvites([]);
    setPhotoOverrides({});

    try {
      const cachedUi = localStorage.getItem(getUiCustomizationCacheKey(schoolId));
      const nextUi = cachedUi
        ? normalizeAiCustomization(JSON.parse(cachedUi))
        : DEFAULT_AI_CUSTOMIZATION;
      aiCustomizationRef.current = nextUi;
      setAiCustomizationState(nextUi);
    } catch {
      aiCustomizationRef.current = DEFAULT_AI_CUSTOMIZATION;
      setAiCustomizationState(DEFAULT_AI_CUSTOMIZATION);
    }

    const cachedTenantDb = loadTenantDatabaseFromCache(schoolId);
    dbRef.current = cachedTenantDb;
    setDbState(cachedTenantDb);
    setCloudSyncStatus('syncing');

    // =======================================================================
    // DYNAMIC USER-OWNED CLOUD STORAGE BRANCH (SUPABASE OR EXTERNAL FIREBASE)
    // =======================================================================
    if (isExternalDynamicCloud(cloudBinding)) {
      let active = true;

      const applyEnvelope = (env: ExternalCloudTenantEnvelope) => {
        if (!active) return;

        // Enforce RBAC membership seat check on external cloud
        if (env.members.length > 0) {
          const seat = env.members.find(
            (m) => m.uid === userUid || m.email.toLowerCase() === userEmail.toLowerCase()
          );
          if (!seat && env.tenantMeta.ownerEmail.toLowerCase() !== userEmail.toLowerCase()) {
            setIsCurrentUserAuthorized(false);
            setUserMemberships((prev) => prev.filter((m) => m.schoolId !== schoolId));
            setCloudSyncStatus('unauthorized');
            notify(
              'error',
              'Workspace Access Revoked',
              'Your staff seat in this school cloud database is no longer active.'
            );
            return;
          }
          if (seat) {
            setCurrentRole(seat.role);
            setUserMemberships((prev) =>
              prev.map((m) =>
                m.schoolId === schoolId
                  ? {
                      ...m,
                      role: seat.role,
                      schoolName: env.tenantMeta.schoolName || m.schoolName,
                    }
                  : m
              )
            );
          }
        }

        setTenantMeta(env.tenantMeta);
        tenantMetaRef.current = env.tenantMeta;

        const normalizedDb = normalizeRawDatabase(env.database);
        normalizedDb.students.forEach((stu) => {
          if (stu.photoDataUrl) cacheResolvedDataUrl(stu.photoDataUrl, stu.photoDataUrl);
        });
        normalizedDb.staff.forEach((st) => {
          if (st.photoDataUrl) cacheResolvedDataUrl(st.photoDataUrl, st.photoDataUrl);
        });
        if (normalizedDb.schoolProfile.logoDataUrl) {
          cacheResolvedDataUrl(
            normalizedDb.schoolProfile.logoDataUrl,
            normalizedDb.schoolProfile.logoDataUrl
          );
        }
        dbRef.current = normalizedDb;
        setDbState(normalizedDb);

        const cleanUi = normalizeAiCustomization(env.uiCustomization);
        aiCustomizationRef.current = cleanUi;
        setAiCustomizationState(cleanUi);
        try {
          localStorage.setItem(getUiCustomizationCacheKey(schoolId), JSON.stringify(cleanUi));
        } catch {
          // ignore
        }

        setSchoolMembers(env.members);
        schoolMembersRef.current = env.members;
        setStaffInvites(env.invites);
        staffInvitesRef.current = env.invites;

        const emails = normalizeAuthorizedEmailsList(
          env.members.map((m) => m.email),
          env.tenantMeta.ownerEmail
        );
        setAuthorizedStaffEmails(emails);
        authorizedEmailsRef.current = emails;
        setCloudSyncStatus('live');
      };

      void loadExternalCloudSnapshot(schoolId, cloudBinding)
        .then((initialSnap) => {
          if (!active) return;
          if (initialSnap) {
            applyEnvelope(initialSnap);
          } else {
            setCloudSyncStatus('live');
          }
        })
        .catch((err) => {
          console.error('External cloud snapshot load error:', err);
          if (active) setCloudSyncStatus('error');
        });

      const unsubExternal = subscribeExternalCloudSnapshot(
        schoolId,
        cloudBinding,
        applyEnvelope
      );

      return () => {
        active = false;
        unsubExternal();
      };
    }

    const unsubListeners: Array<() => void> = [];

    const applyResolvedMediaToState = () => {
      const mediaMap = mediaFilesByIdRef.current;
      commitDb((prev) => {
        const resolvedLogo = resolveDisplayMediaUrl(rawSchoolLogoUrlRef.current, mediaMap);
        const nextStudents = prev.students.map((s) => {
          const urls = rawStudentUrlsRef.current[s.id];
          if (!urls) return s;
          const pUrl = resolveDisplayMediaUrl(urls.photoUrl, mediaMap);
          const aUrl = resolveDisplayMediaUrl(urls.aadhaarDocUrl, mediaMap);
          if (pUrl && urls.photoUrl) displayToStoredMediaRef.current.set(pUrl, urls.photoUrl);
          if (aUrl && urls.aadhaarDocUrl) {
            displayToStoredMediaRef.current.set(aUrl, urls.aadhaarDocUrl);
          }
          return {
            ...s,
            photoDataUrl: pUrl || s.photoDataUrl,
            aadhaarDocDataUrl: aUrl || s.aadhaarDocDataUrl,
          };
        });
        const nextStaff = prev.staff.map((m) => {
          const sUrl = rawStaffPhotoUrlsRef.current[m.id];
          if (sUrl === undefined) return m;
          const pUrl = resolveDisplayMediaUrl(sUrl, mediaMap);
          if (pUrl && sUrl) displayToStoredMediaRef.current.set(pUrl, sUrl);
          return {
            ...m,
            photoDataUrl: pUrl || m.photoDataUrl,
          };
        });
        const resolvedSignature =
          resolveDisplayMediaUrl('cloud-media://school_signature', mediaMap) ||
          prev.schoolProfile.signatureDataUrl;
        const resolvedStamp =
          resolveDisplayMediaUrl('cloud-media://school_stamp', mediaMap) ||
          prev.schoolProfile.stampDataUrl;
        return {
          ...prev,
          schoolProfile: {
            ...prev.schoolProfile,
            logoDataUrl: resolvedLogo || prev.schoolProfile.logoDataUrl,
            signatureDataUrl: resolvedSignature || prev.schoolProfile.signatureDataUrl,
            stampDataUrl: resolvedStamp || prev.schoolProfile.stampDataUrl,
          },
          students: nextStudents,
          staff: nextStaff,
        };
      });
    };

    // 0. Live RBAC Member Seat Listener (/schools/{schoolId}/members/{uid})
    unsubListeners.push(
      onSnapshot(
        doc(firestoreDb, 'schools', schoolId, 'members', userUid),
        (snap) => {
          if (!snap.exists()) {
            // Membership was revoked by Main Admin
            setIsCurrentUserAuthorized(false);
            setUserMemberships((prev) => prev.filter((m) => m.schoolId !== schoolId));
            setCloudSyncStatus('unauthorized');
            notify(
              'error',
              'Workspace Access Revoked',
              'Your staff seat in this school workspace is no longer active.'
            );
            return;
          }
          const data = snap.data();
          const role = (data.role as SchoolRole) || 'teacher';
          setCurrentRole(role);
          setUserMemberships((prev) =>
            prev.map((m) => (m.schoolId === schoolId ? { ...m, role } : m))
          );
        },
        (err) => {
          console.error('Member role listener error:', err);
        }
      )
    );

    // 1. Subscribe to Cloud Media Files (/schools/{schoolId}/media_files)
    unsubListeners.push(
      onSnapshot(
        query(
          collection(firestoreDb, 'schools', schoolId, 'media_files'),
          where('authorizedEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          const nextMedia: Record<string, string> = {};
          snap.docs.forEach((d) => {
            const data = d.data();
            if (typeof data.dataUrl === 'string' && data.dataUrl) {
              nextMedia[d.id] = data.dataUrl;
              cacheResolvedDataUrl(`cloud-media://${d.id}`, data.dataUrl);
            }
          });
          mediaFilesByIdRef.current = nextMedia;
          applyResolvedMediaToState();
        },
        (err) =>
          handleFirestoreError(
            err,
            OperationType.LIST,
            `schools/${schoolId}/media_files`
          )
      )
    );

    // 2. Subscribe to Tenant Root (/schools/{schoolId})
    unsubListeners.push(
      onSnapshot(
        doc(firestoreDb, 'schools', schoolId),
        (snap) => {
          if (!snap.exists()) return;
          const cfg = snap.data() as CloudSchoolTenantDoc;
          const meta = extractTenantMetaFromDoc(schoolId, cfg);
          setTenantMeta(meta);
          tenantMetaRef.current = meta;

          const cleanEmails = normalizeAuthorizedEmailsList(
            cfg.authorizedEmails,
            cfg.ownerEmail
          );
          setAuthorizedStaffEmails(cleanEmails);
          authorizedEmailsRef.current = cleanEmails;

          rawSchoolLogoUrlRef.current = cfg.logoUrl || '';
          if (cfg.logoUrl && cfg.logoUrl.startsWith('http')) {
            void warmImageDataUrlCache(cfg.logoUrl);
          }
          const resolvedLogo = resolveDisplayMediaUrl(
            cfg.logoUrl || '',
            mediaFilesByIdRef.current
          );
          if (resolvedLogo && cfg.logoUrl) {
            displayToStoredMediaRef.current.set(resolvedLogo, cfg.logoUrl);
          }

          commitDb((prev) => ({
            ...prev,
            activeSession: cfg.activeSession || prev.activeSession,
            billingCutoffMonth: cfg.billingCutoffMonth || prev.billingCutoffMonth,
            counters: {
              studentSeq: sanitizeNumber(cfg.studentSeq ?? prev.counters.studentSeq, 1001),
              receiptSeq: sanitizeNumber(cfg.receiptSeq ?? prev.counters.receiptSeq, 90001),
              staffSeq: sanitizeNumber(cfg.staffSeq ?? prev.counters.staffSeq, 101),
              examSeq: sanitizeNumber(cfg.examSeq ?? prev.counters.examSeq, 101),
            },
            customDesignations: normalizeCustomDesignations(cfg.customDesignations),
            schoolProfile: normalizeSchoolProfile({
              schoolName: cfg.schoolName,
              tagline: cfg.tagline,
              logoDataUrl: resolvedLogo,
              address: cfg.address,
              phone: cfg.phone,
              alternatePhone: cfg.alternatePhone,
              email: cfg.email,
              website: cfg.website,
              directorName: cfg.directorName,
              principalName: cfg.principalName,
              affiliationNo: cfg.affiliationNo,
              authorityDesignation: prev.schoolProfile.authorityDesignation,
              signatureDataUrl: prev.schoolProfile.signatureDataUrl,
              stampDataUrl: prev.schoolProfile.stampDataUrl,
            }),
            lastUpdated: new Date().toISOString(),
          }));

          setUserMemberships((prev) =>
            prev.map((m) =>
              m.schoolId === schoolId
                ? { ...m, schoolName: cfg.schoolName || m.schoolName }
                : m
            )
          );
          setCloudSyncStatus('live');
        },
        (err) => handleFirestoreError(err, OperationType.GET, `schools/${schoolId}`)
      )
    );

    // 3. Subscribe to Academic Sessions
    unsubListeners.push(
      onSnapshot(
        query(
          collection(firestoreDb, 'schools', schoolId, 'sessions'),
          where('authorizedEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          if (snap.empty) return;
          const rawList = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: data.id || d.id,
              name: data.name,
              startMonth: data.startMonth,
              endMonth: data.endMonth,
              isActive: Boolean(data.isActive),
              createdAt: data.sessionCreatedAt || new Date().toISOString(),
            } as AcademicSessionConfig;
          });
          commitDb((prev) => {
            const { sessions } = normalizeSessions(rawList, prev.activeSession);
            return { ...prev, sessions };
          });
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, `schools/${schoolId}/sessions`)
      )
    );

    // 4. Subscribe to Classes
    unsubListeners.push(
      onSnapshot(
        query(
          collection(firestoreDb, 'schools', schoolId, 'classes'),
          where('authorizedEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          if (snap.empty) return;
          const list: ClassAllocation[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: data.id || d.id,
              className: data.className,
              sections: Array.isArray(data.sections) ? data.sections : ['A'],
              sectionCapacity: Number(data.sectionCapacity) || 35,
              isDefault: Boolean(data.isDefault),
            };
          });
          commitDb((prev) => ({ ...prev, classes: list }));
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, `schools/${schoolId}/classes`)
      )
    );

    // 5. Subscribe to Fee Schedules
    unsubListeners.push(
      onSnapshot(
        query(
          collection(firestoreDb, 'schools', schoolId, 'fee_schedules'),
          where('authorizedEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          if (snap.empty) return;
          const list: ClassSessionFeeRate[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              className: data.className,
              academicSession: data.academicSession,
              admissionFee: Number(data.admissionFee) || 0,
              monthlyTuitionFee: Number(data.monthlyTuitionFee) || 0,
              annualExamFee: Number(data.annualExamFee) || 0,
            };
          });
          commitDb((prev) => ({ ...prev, feeSchedules: list }));
        },
        (err) =>
          handleFirestoreError(
            err,
            OperationType.LIST,
            `schools/${schoolId}/fee_schedules`
          )
      )
    );

    // 6. Subscribe to Students
    unsubListeners.push(
      onSnapshot(
        query(
          collection(firestoreDb, 'schools', schoolId, 'students'),
          where('authorizedEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          const urlMap: Record<string, { photoUrl: string; aadhaarDocUrl: string }> = {};
          const students = snap.docs
            .map((d) => {
              const data = d.data();
              const sid = data.id || d.id;
              const pUrl = typeof data.photoUrl === 'string' ? data.photoUrl : '';
              const aUrl = typeof data.aadhaarDocUrl === 'string' ? data.aadhaarDocUrl : '';
              urlMap[sid] = { photoUrl: pUrl, aadhaarDocUrl: aUrl };

              if (pUrl.startsWith('http')) void warmImageDataUrlCache(pUrl);
              if (aUrl.startsWith('http')) void warmImageDataUrlCache(aUrl);

              const resolvedPhoto = resolveDisplayMediaUrl(pUrl, mediaFilesByIdRef.current);
              const resolvedAadhaar = resolveDisplayMediaUrl(
                aUrl,
                mediaFilesByIdRef.current
              );
              if (resolvedPhoto && pUrl) {
                displayToStoredMediaRef.current.set(resolvedPhoto, pUrl);
              }
              if (resolvedAadhaar && aUrl) {
                displayToStoredMediaRef.current.set(resolvedAadhaar, aUrl);
              }

              return normalizeStudent({
                id: sid,
                admissionId: data.admissionId,
                rollNumber: data.rollNumber,
                status: data.status,
                deactivatedAt: data.deactivatedAt || undefined,
                deactivatedReason: data.deactivatedReason || undefined,
                promotionHistory: data.promotionHistory,
                academicSession: data.academicSession,
                admissionType: data.admissionType,
                admissionFee: data.admissionFee,
                previousSchool: data.previousSchool,
                lastGradePassed: data.lastGradePassed,
                tcDetails: data.tcDetails,
                name: data.name,
                dob: data.dob,
                gender: data.gender,
                casteCategory: data.casteCategory,
                className: data.className,
                section: data.section,
                monthlyTuitionFee: data.monthlyTuitionFee,
                fatherName: data.fatherName,
                motherName: data.motherName,
                phone: data.phone,
                alternatePhone: data.alternatePhone,
                address: data.address,
                photoDataUrl: resolvedPhoto,
                aadhaarNumber: data.aadhaarNumber,
                aadhaarDocDataUrl: resolvedAadhaar,
                transportEnabled: data.transportEnabled,
                routeId: data.routeId,
                transportFee: data.transportFee,
                customNotes: data.customNotes,
                admissionDate: data.admissionDate,
              });
            })
            .sort((a, b) =>
              b.admissionId.localeCompare(a.admissionId, undefined, { numeric: true })
            );

          rawStudentUrlsRef.current = urlMap;
          commitDb((prev) => ({ ...prev, students }));
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, `schools/${schoolId}/students`)
      )
    );

    // 7. Subscribe to Fee Receipts
    unsubListeners.push(
      onSnapshot(
        query(
          collection(firestoreDb, 'schools', schoolId, 'fees'),
          where('authorizedEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          const fees: FeeRecord[] = snap.docs
            .map((d) => {
              const data = d.data();
              return {
                id: data.id || d.id,
                receiptNo: data.receiptNo,
                studentId: data.studentId,
                admissionId: data.admissionId,
                studentName: data.studentName,
                className: data.className,
                section: data.section,
                fatherName: data.fatherName,
                category: data.category,
                feeMonth: data.feeMonth,
                paymentMode: data.paymentMode,
                amount: Number(data.amount) || 0,
                date: data.date,
                remarks: data.remarks || '',
              };
            })
            .sort((a, b) =>
              b.receiptNo.localeCompare(a.receiptNo, undefined, { numeric: true })
            );
          commitDb((prev) => ({ ...prev, fees }));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `schools/${schoolId}/fees`)
      )
    );

    // 8. Subscribe to Transport Routes
    unsubListeners.push(
      onSnapshot(
        query(
          collection(firestoreDb, 'schools', schoolId, 'routes'),
          where('authorizedEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          const routes = snap.docs.map((d) => {
            const data = d.data();
            return normalizeRoute({
              id: data.id || d.id,
              routeName: data.routeName,
              busNumber: data.busNumber,
              pickupPoints: data.pickupPoints,
              monthlyFare: data.monthlyFare,
              driverName: data.driverName,
              driverPhone: data.driverPhone,
              createdAt: data.routeCreatedAt,
            });
          });
          commitDb((prev) => ({ ...prev, routes }));
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, `schools/${schoolId}/routes`)
      )
    );

    // 9. Subscribe to Staff HR Profiles
    unsubListeners.push(
      onSnapshot(
        query(
          collection(firestoreDb, 'schools', schoolId, 'staff'),
          where('authorizedEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          const staffUrlMap: Record<string, string> = {};
          const staff = snap.docs
            .map((d) => {
              const data = d.data();
              const stfId = data.id || d.id;
              const pUrl = typeof data.photoUrl === 'string' ? data.photoUrl : '';
              staffUrlMap[stfId] = pUrl;
              if (pUrl.startsWith('http')) void warmImageDataUrlCache(pUrl);

              const resolvedPhoto = resolveDisplayMediaUrl(pUrl, mediaFilesByIdRef.current);
              if (resolvedPhoto && pUrl) {
                displayToStoredMediaRef.current.set(resolvedPhoto, pUrl);
              }

              return normalizeStaff({
                id: stfId,
                staffId: data.staffId,
                fullName: data.fullName,
                fatherOrSpouseName: data.fatherOrSpouseName,
                designation: data.designation,
                assignedDepartment: data.assignedDepartment,
                qualification: data.qualification,
                monthlySalary: data.monthlySalary,
                address: data.address,
                phone: data.phone,
                emergencyContact: data.emergencyContact,
                joinedDate: data.joinedDate,
                photoDataUrl: resolvedPhoto,
              });
            })
            .sort((a, b) =>
              a.staffId.localeCompare(b.staffId, undefined, { numeric: true })
            );

          rawStaffPhotoUrlsRef.current = staffUrlMap;
          commitDb((prev) => ({ ...prev, staff }));
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, `schools/${schoolId}/staff`)
      )
    );

    // 10. Subscribe to Attendance Sheets
    unsubListeners.push(
      onSnapshot(
        query(
          collection(firestoreDb, 'schools', schoolId, 'attendance'),
          where('authorizedEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          const attendance: Record<string, DailyAttendanceSheet> = {};
          snap.docs.forEach((d) => {
            const data = d.data();
            const key = data.key || d.id;
            attendance[key] = {
              key,
              date: data.date,
              className: data.className,
              section: data.section,
              entries: data.entries || {},
              notes: data.notes || {},
              markedBy: data.markedBy || 'Staff',
              updatedAt:
                data.updatedAt && typeof data.updatedAt.toDate === 'function'
                  ? data.updatedAt.toDate().toISOString()
                  : new Date().toISOString(),
            };
          });
          commitDb((prev) => ({ ...prev, attendance }));
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, `schools/${schoolId}/attendance`)
      )
    );

    // 11. Subscribe to Exams
    unsubListeners.push(
      onSnapshot(
        query(
          collection(firestoreDb, 'schools', schoolId, 'exams'),
          where('authorizedEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          const exams = snap.docs
            .map((d) => {
              const data = d.data();
              return normalizeExam({
                id: data.id || d.id,
                examCode: data.examCode,
                examName: data.examName,
                academicSession: data.academicSession,
                className: data.className,
                examCenter: data.examCenter,
                instructions: data.instructions,
                subjects: data.subjects,
                createdAt:
                  data.createdAt && typeof data.createdAt.toDate === 'function'
                    ? data.createdAt.toDate().toISOString()
                    : new Date().toISOString(),
                updatedAt:
                  data.updatedAt && typeof data.updatedAt.toDate === 'function'
                    ? data.updatedAt.toDate().toISOString()
                    : new Date().toISOString(),
              });
            })
            .sort((a, b) =>
              b.examCode.localeCompare(a.examCode, undefined, { numeric: true })
            );
          commitDb((prev) => ({ ...prev, exams }));
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, `schools/${schoolId}/exams`)
      )
    );

    // 12. Subscribe to Marksheets
    unsubListeners.push(
      onSnapshot(
        query(
          collection(firestoreDb, 'schools', schoolId, 'marksheets'),
          where('authorizedEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          const marksheets: StudentExamMarksheet[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: data.id || d.id,
              examId: data.examId,
              examCode: data.examCode,
              examName: data.examName,
              academicSession: data.academicSession,
              studentId: data.studentId,
              admissionId: data.admissionId,
              rollNumber: data.rollNumber,
              studentName: data.studentName,
              className: data.className,
              section: data.section,
              fatherName: data.fatherName,
              motherName: data.motherName,
              dob: data.dob,
              subjectMarks: Array.isArray(data.subjectMarks) ? data.subjectMarks : [],
              totalMaxMarks: Number(data.totalMaxMarks) || 0,
              totalMinMarks: Number(data.totalMinMarks) || 0,
              totalObtained: Number(data.totalObtained) || 0,
              percentage: Number(data.percentage) || 0,
              overallGrade: data.overallGrade || 'C',
              passed: Boolean(data.passed),
              remarks: data.remarks || '',
              customRemarks: data.customRemarks || '',
              updatedAt:
                data.updatedAt && typeof data.updatedAt.toDate === 'function'
                  ? data.updatedAt.toDate().toISOString()
                  : new Date().toISOString(),
            };
          });
          commitDb((prev) => ({ ...prev, marksheets }));
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, `schools/${schoolId}/marksheets`)
      )
    );

    // 13. Subscribe to Term Grades
    unsubListeners.push(
      onSnapshot(
        query(
          collection(firestoreDb, 'schools', schoolId, 'grades'),
          where('authorizedEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          const grades: ExamGradeRecord[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: data.id || d.id,
              studentId: data.studentId,
              admissionId: data.admissionId,
              studentName: data.studentName,
              className: data.className,
              section: data.section,
              fatherName: data.fatherName,
              dob: data.dob,
              term: data.term,
              english: Number(data.english) || 0,
              hindi: Number(data.hindi) || 0,
              maths: Number(data.maths) || 0,
              science: Number(data.science) || 0,
              total: Number(data.total) || 0,
              percentage: Number(data.percentage) || 0,
              passed: Boolean(data.passed),
              recordedAt: data.recordedAt || new Date().toISOString(),
            };
          });
          commitDb((prev) => ({ ...prev, grades }));
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, `schools/${schoolId}/grades`)
      )
    );

    // 14. Subscribe to Notice Board
    unsubListeners.push(
      onSnapshot(
        query(
          collection(firestoreDb, 'schools', schoolId, 'notices'),
          where('authorizedEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          const notices: NoticeItem[] = snap.docs
            .map((d) => {
              const data = d.data();
              return {
                id: data.id || d.id,
                title: data.title,
                body: data.body,
                category: data.category,
                postedBy: data.postedBy || 'Administration',
                createdAt: data.noticeCreatedAt || new Date().toISOString(),
              };
            })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          commitDb((prev) => ({ ...prev, notices }));
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, `schools/${schoolId}/notices`)
      )
    );

    // 15. Subscribe to In-App AI / Stationery Customization Config (/schools/{schoolId}/ui_config/main)
    unsubListeners.push(
      onSnapshot(
        doc(firestoreDb, 'schools', schoolId, 'ui_config', 'main'),
        (snap) => {
          if (!snap.exists()) return;
          const cleanUi = normalizeAiCustomization(snap.data());
          aiCustomizationRef.current = cleanUi;
          setAiCustomizationState(cleanUi);
          try {
            localStorage.setItem(getUiCustomizationCacheKey(schoolId), JSON.stringify(cleanUi));
          } catch {
            // ignore
          }
        },
        () => {
          // Optional config doc may not exist until Main Admin saves a customization
        }
      )
    );

    return () => {
      unsubListeners.forEach((fn) => {
        try {
          fn();
        } catch {
          // ignore
        }
      });
    };
  }, [
    authReady,
    firebaseUser,
    isCurrentUserAuthorized,
    activeSchoolId,
    pendingInviteParams,
    cloudBinding,
    commitDb,
    notify,
  ]);

  // Subscribe to Team Members & Staff Invites ONLY when signed in as Main Admin on Managed Cloud
  useEffect(() => {
    if (
      !authReady ||
      !firebaseUser ||
      !firebaseUser.emailVerified ||
      !isCurrentUserAuthorized ||
      !activeSchoolId ||
      currentRole !== 'main_admin'
    ) {
      if (!isExternalDynamicCloud(cloudBinding)) {
        setSchoolMembers([]);
        setStaffInvites([]);
      }
      return;
    }

    if (isExternalDynamicCloud(cloudBinding)) {
      return;
    }

    const schoolId = activeSchoolId;
    const ownerUid = firebaseUser.uid;
    const unsubAdmin: Array<() => void> = [];

    unsubAdmin.push(
      onSnapshot(
        query(
          collection(firestoreDb, 'schools', schoolId, 'members'),
          where('ownerUid', '==', ownerUid)
        ),
        (snap) => {
          const list: SchoolMemberRecord[] = snap.docs
            .map((d) => {
              const data = d.data();
              return {
                uid: data.uid || d.id,
                schoolId: data.schoolId || schoolId,
                ownerUid: data.ownerUid,
                email: data.email,
                displayName: data.displayName || '',
                role: (data.role as SchoolRole) || 'teacher',
                inviteId: data.inviteId || '',
                addedByUid: data.addedByUid || '',
                createdAt:
                  data.createdAt && typeof data.createdAt.toDate === 'function'
                    ? data.createdAt.toDate().toISOString()
                    : new Date().toISOString(),
                updatedAt:
                  data.updatedAt && typeof data.updatedAt.toDate === 'function'
                    ? data.updatedAt.toDate().toISOString()
                    : new Date().toISOString(),
              };
            })
            .sort((a, b) => {
              if (a.role === 'main_admin') return -1;
              if (b.role === 'main_admin') return 1;
              return a.email.localeCompare(b.email);
            });
          setSchoolMembers(list);
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, `schools/${schoolId}/members`)
      )
    );

    unsubAdmin.push(
      onSnapshot(
        query(
          collection(firestoreDb, 'schools', schoolId, 'invites'),
          where('invitedByUid', '==', ownerUid)
        ),
        (snap) => {
          const list: StaffInviteRecord[] = snap.docs
            .map((d) => {
              const data = d.data();
              return {
                id: data.id || d.id,
                schoolId: data.schoolId || schoolId,
                schoolName: data.schoolName || '',
                invitedName: data.invitedName || '',
                invitedEmail: data.invitedEmail || '',
                role: data.role as InvitableSchoolRole,
                status: data.status,
                invitedByUid: data.invitedByUid,
                invitedByEmail: data.invitedByEmail,
                acceptedByUid: data.acceptedByUid || '',
                createdAt:
                  data.createdAt && typeof data.createdAt.toDate === 'function'
                    ? data.createdAt.toDate().toISOString()
                    : new Date().toISOString(),
                updatedAt:
                  data.updatedAt && typeof data.updatedAt.toDate === 'function'
                    ? data.updatedAt.toDate().toISOString()
                    : new Date().toISOString(),
              };
            })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setStaffInvites(list);
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, `schools/${schoolId}/invites`)
      )
    );

    return () => {
      unsubAdmin.forEach((fn) => {
        try {
          fn();
        } catch {
          // ignore
        }
      });
    };
  }, [authReady, firebaseUser, isCurrentUserAuthorized, activeSchoolId, currentRole, cloudBinding]);

  // =========================================================================
  // 3. AUTHENTICATION, REGISTRATION, WORKSPACE SWITCHING & INVITE ACTIONS
  // =========================================================================

  const retryCloudConnection = useCallback(() => {
    setCloudSyncStatus('initializing');
    setCloudInitNonce((n) => n + 1);
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const previousUid = firebaseAuth.currentUser?.uid;
      const cred = await signInWithPopup(firebaseAuth, googleAuthProvider);
      if (!cred.user.email || !cred.user.emailVerified) {
        await signOut(firebaseAuth);
        return {
          ok: false,
          error: 'A verified Google account email is required to access school records.',
        };
      }
      if (previousUid === cred.user.uid) {
        setCloudSyncStatus('initializing');
        setCloudInitNonce((n) => n + 1);
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('auth/popup-closed-by-user')) {
        return { ok: false, error: 'Google sign-in popup was closed before completing login.' };
      }
      if (msg.includes('auth/cancelled-popup-request')) {
        return { ok: false };
      }
      return {
        ok: false,
        error: 'Google authentication failed. Ensure popups are allowed for this window.',
      };
    }
  }, []);

  const signInWithEmail = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ ok: boolean; error?: string; needsVerification?: boolean }> => {
      const cleanEmail = email.trim();
      if (!cleanEmail || !password) {
        return { ok: false, error: 'Enter both your email address and password.' };
      }
      try {
        const cred = await signInWithEmailAndPassword(firebaseAuth, cleanEmail, password);
        if (!cred.user.emailVerified) {
          return { ok: true, needsVerification: true };
        }
        setCloudInitNonce((n) => n + 1);
        return { ok: true, needsVerification: false };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('auth/operation-not-allowed')) {
          return {
            ok: false,
            error:
              'Email/Password sign-in is not yet enabled in Firebase Console (Authentication → Sign-in method → Email/Password). Use "Continue with Google" or enable Email/Password in Firebase Console.',
          };
        }
        if (
          msg.includes('auth/invalid-credential') ||
          msg.includes('auth/wrong-password') ||
          msg.includes('auth/user-not-found')
        ) {
          return {
            ok: false,
            error: 'Invalid email or password. Check your credentials or register a new account.',
          };
        }
        if (msg.includes('auth/too-many-requests')) {
          return {
            ok: false,
            error: 'Too many login attempts. Please wait a moment and try again.',
          };
        }
        return { ok: false, error: 'Email sign-in failed. Please verify your credentials.' };
      }
    },
    []
  );

  const registerWithEmail = useCallback(
    async (
      email: string,
      password: string,
      displayName?: string,
      pendingSchoolReg?: RegisterSchoolTenantInput & { importLegacyLocal?: boolean }
    ): Promise<{ ok: boolean; error?: string; needsVerification?: boolean }> => {
      const cleanEmail = email.trim();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return { ok: false, error: 'Enter a valid email address.' };
      }
      if (!password || password.length < 6) {
        return { ok: false, error: 'Password must be at least 6 characters long.' };
      }

      try {
        if (pendingSchoolReg?.schoolName) {
          sessionStorage.setItem(
            PENDING_SCHOOL_REG_SESSION_KEY,
            JSON.stringify(pendingSchoolReg)
          );
        }
        const cred = await createUserWithEmailAndPassword(firebaseAuth, cleanEmail, password);
        if (displayName?.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        }
        await sendEmailVerification(cred.user);
        notify(
          'info',
          'Verification Email Sent',
          `Open the verification link sent to ${cleanEmail}, then click "I've Verified My Email" to activate your workspace.`
        );
        return { ok: true, needsVerification: !cred.user.emailVerified };
      } catch (err) {
        sessionStorage.removeItem(PENDING_SCHOOL_REG_SESSION_KEY);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('auth/operation-not-allowed')) {
          return {
            ok: false,
            error:
              'Email/Password registration is not yet enabled in Firebase Console (Authentication → Sign-in method → Email/Password). Use "Continue with Google" right now or enable Email/Password in Firebase Console.',
          };
        }
        if (msg.includes('auth/email-already-in-use')) {
          return {
            ok: false,
            error: 'An account with this email already exists. Switch to "Sign In" instead.',
          };
        }
        if (msg.includes('auth/weak-password')) {
          return { ok: false, error: 'Choose a stronger password (at least 6 characters).' };
        }
        return { ok: false, error: 'Account creation failed. Please try again.' };
      }
    },
    [notify]
  );

  const resendVerificationEmail = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    const user = firebaseAuth.currentUser;
    if (!user) return { ok: false, error: 'No signed-in account found.' };
    try {
      await sendEmailVerification(user);
      notify(
        'success',
        'Verification Link Sent',
        `Check inbox & spam folder for ${user.email}.`
      );
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('auth/too-many-requests')) {
        return {
          ok: false,
          error: 'Verification link was recently sent. Please check your inbox or wait a minute.',
        };
      }
      return { ok: false, error: 'Could not resend verification email right now.' };
    }
  }, [notify]);

  const refreshEmailVerificationStatus = useCallback(async (): Promise<{
    ok: boolean;
    verified: boolean;
    error?: string;
  }> => {
    const user = firebaseAuth.currentUser;
    if (!user) return { ok: false, verified: false, error: 'Not signed in.' };
    try {
      await user.reload();
      const refreshed = firebaseAuth.currentUser;
      if (refreshed?.emailVerified) {
        await refreshed.getIdToken(true);
        setFirebaseUser(refreshed);
        setCloudSyncStatus('initializing');
        setCloudInitNonce((n) => n + 1);
        return { ok: true, verified: true };
      }
      return {
        ok: true,
        verified: false,
        error:
          'Your email is not marked verified yet. Click the verification link sent to your email inbox first.',
      };
    } catch {
      return {
        ok: false,
        verified: false,
        error: 'Could not refresh verification status. Please try again.',
      };
    }
  }, []);

  const authenticateStaff = useCallback(
    async (
      email: string,
      password: string,
      createAccount: boolean
    ): Promise<{ ok: boolean; error?: string }> => {
      if (email && password) {
        return createAccount
          ? registerWithEmail(email, password)
          : signInWithEmail(email, password);
      }
      return signInWithGoogle();
    },
    [registerWithEmail, signInWithEmail, signInWithGoogle]
  );

  const signOutStaff = useCallback(() => {
    setActivePrintDoc(null);
    setRegisterSchoolModalOpen(false);
    setAiDrawerOpen(false);
    signOut(firebaseAuth)
      .then(() => {
        notify('info', 'Signed Out', 'Your secure cloud session has ended.');
      })
      .catch((err) => {
        console.error('Sign out error:', err);
      });
  }, [notify]);

  const registerSchoolWorkspace = useCallback(
    async (
      input: RegisterSchoolTenantInput & {
        importLegacyLocal?: boolean;
        cloudBinding?: DynamicCloudBinding;
      }
    ): Promise<{ ok: boolean; schoolId?: string; error?: string }> => {
      const user = firebaseAuth.currentUser;
      if (!user || !user.email || !user.emailVerified) {
        return {
          ok: false,
          error: 'Sign in with a verified account before registering a school workspace.',
        };
      }
      const cleanName = input.schoolName.trim();
      if (!cleanName) {
        return { ok: false, error: 'Enter the official name of your school.' };
      }

      const normBinding = normalizeCloudBinding(input.cloudBinding);
      if (normBinding.provider !== 'managed') {
        const check = await testDynamicCloudConnection(normBinding);
        if (!check.ok) {
          return { ok: false, error: check.message };
        }
      }

      try {
        setCloudSyncStatus('syncing');
        const seedDb = input.importLegacyLocal
          ? parseDatabaseFromStorageKey(LEGACY_DB_STORAGE_KEY) || createEmptyDatabase()
          : createEmptyDatabase();

        if (isExternalDynamicCloud(normBinding)) {
          const nowIso = new Date().toISOString();
          const slug = cleanName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 24);
          const schoolId = toSafeDocId(
            `sch_${slug || 'campus'}_${Math.random().toString(36).slice(2, 7)}`
          );
          const extDb: SchoolDatabase = {
            ...seedDb,
            schoolProfile: normalizeSchoolProfile({
              ...seedDb.schoolProfile,
              schoolName: cleanName,
              tagline: input.tagline || seedDb.schoolProfile.tagline,
              address: input.address || seedDb.schoolProfile.address,
              phone: input.phone || seedDb.schoolProfile.phone,
              email: user.email,
            }),
          };
          const extMeta: SchoolTenantMeta = {
            id: schoolId,
            schoolName: cleanName,
            ownerUid: user.uid,
            ownerEmail: user.email.toLowerCase(),
            subscriptionPlan: input.subscriptionPlan || 'Enterprise',
            subscriptionStatus: 'Active',
            accountantCount: 0,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          const ownerMember: SchoolMemberRecord = {
            uid: user.uid,
            schoolId,
            ownerUid: user.uid,
            email: user.email.toLowerCase(),
            displayName: input.adminDisplayName || user.displayName || 'Main Admin',
            role: 'main_admin',
            inviteId: 'owner_bootstrap',
            addedByUid: user.uid,
            createdAt: nowIso,
            updatedAt: nowIso,
          };

          await saveExternalCloudSnapshot(schoolId, normBinding, {
            schoolId,
            tenantMeta: extMeta,
            database: extDb,
            uiCustomization: DEFAULT_AI_CUSTOMIZATION,
            members: [ownerMember],
            invites: [],
            updatedAt: nowIso,
          });

          await saveMasterAccountProfile({
            uid: user.uid,
            email: user.email,
            displayName: input.adminDisplayName || user.displayName || 'Main Admin',
            activeSchoolId: schoolId,
            schoolName: cleanName,
            role: 'main_admin',
            binding: normBinding,
          });

          const membership: UserSchoolMembership = {
            id: `${user.uid}_${schoolId}`,
            uid: user.uid,
            schoolId,
            schoolName: cleanName,
            role: 'main_admin',
            email: user.email.toLowerCase(),
            displayName: input.adminDisplayName || user.displayName || 'Main Admin',
            createdAt: nowIso,
            updatedAt: nowIso,
          };

          bindingsBySchoolRef.current[schoolId] = normBinding;
          setCloudBinding(normBinding);
          cloudBindingRef.current = normBinding;
          localStorage.setItem(getActiveSchoolPrefKey(user.uid), schoolId);
          setUserMemberships((prev) => [
            ...prev.filter((m) => m.schoolId !== schoolId),
            membership,
          ]);
          setActiveSchoolId(schoolId);
          setCurrentRole('main_admin');
          setActiveModuleState('dashboard');
          setIsCurrentUserAuthorized(true);
          setRegisterSchoolModalOpen(false);
          setCloudSyncStatus('live');

          notify(
            'success',
            'Self-Hosted Cloud Workspace Bound',
            `${cleanName} is now live on your ${normBinding.provider.toUpperCase()} cloud database.`
          );
          return { ok: true, schoolId };
        }

        const { schoolId, membership } = await registerNewSchoolTenant(
          input,
          {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
          },
          seedDb
        );

        const managedBinding = normalizeCloudBinding({
          provider: 'managed',
          apiUrl: '',
          publicKey: '',
        });
        await saveMasterAccountProfile({
          uid: user.uid,
          email: user.email,
          displayName: input.adminDisplayName || user.displayName || 'Main Admin',
          activeSchoolId: schoolId,
          schoolName: cleanName,
          role: 'main_admin',
          binding: managedBinding,
        });

        bindingsBySchoolRef.current[schoolId] = managedBinding;
        setCloudBinding(managedBinding);
        cloudBindingRef.current = managedBinding;
        localStorage.setItem(getActiveSchoolPrefKey(user.uid), schoolId);
        setUserMemberships((prev) => [...prev, membership]);
        setActiveSchoolId(schoolId);
        setCurrentRole('main_admin');
        setActiveModuleState('dashboard');
        setIsCurrentUserAuthorized(true);
        setRegisterSchoolModalOpen(false);
        setCloudSyncStatus('live');

        notify(
          'success',
          'School Workspace Provisioned',
          `${cleanName} (${schoolId}) is live. You are signed in as Main Admin.`
        );
        return { ok: true, schoolId };
      } catch (err) {
        setCloudSyncStatus('error');
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not provision school workspace. Please try again.',
        };
      }
    },
    [notify]
  );

  const updateCloudBinding = useCallback(
    async (
      nextBinding: DynamicCloudBinding
    ): Promise<{ ok: boolean; error?: string; needsSupabaseTable?: boolean }> => {
      const user = firebaseAuth.currentUser;
      const schoolId = activeSchoolIdRef.current;
      const meta = tenantMetaRef.current;
      if (!isCurrentUserAdmin || !user?.email || !schoolId || !meta) {
        return { ok: false, error: 'Only Main Admin can update cloud database binding.' };
      }

      const norm = normalizeCloudBinding(nextBinding);
      const check = await testDynamicCloudConnection(norm);
      if (!check.ok) {
        return {
          ok: false,
          error: check.message,
          needsSupabaseTable: check.needsSupabaseTable,
        };
      }

      try {
        setCloudSyncStatus('syncing');
        if (isExternalDynamicCloud(norm)) {
          await saveExternalCloudSnapshot(
            schoolId,
            norm,
            buildExternalEnvelope(schoolId)
          );
        } else {
          await syncEntireDatabaseToCloud(
            schoolId,
            dbRef.current,
            authorizedEmailsRef.current,
            user.uid,
            user.email,
            meta.ownerEmail,
            false
          );
          await saveUiCustomizationToCloud(
            schoolId,
            aiCustomizationRef.current,
            authorizedEmailsRef.current,
            meta.ownerEmail,
            user.uid
          );
        }

        await saveMasterAccountProfile({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || 'Main Admin',
          activeSchoolId: schoolId,
          schoolName: dbRef.current.schoolProfile.schoolName || meta.schoolName,
          role: 'main_admin',
          binding: norm,
        });

        bindingsBySchoolRef.current[schoolId] = norm;
        setCloudBinding(norm);
        cloudBindingRef.current = norm;
        setCloudSyncStatus('live');

        notify(
          'success',
          'Cloud Database Binding Updated',
          norm.provider === 'managed'
            ? 'Workspace connected to Built-in Multi-Tenant Cloud.'
            : `All school records are now bound and synced to your ${norm.provider.toUpperCase()} cloud project.`
        );
        return { ok: true };
      } catch (err) {
        setCloudSyncStatus('live');
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to bind cloud database.',
        };
      }
    },
    [buildExternalEnvelope, isCurrentUserAdmin, notify]
  );

  const switchActiveSchool = useCallback(
    (nextSchoolId: string) => {
      const user = firebaseAuth.currentUser;
      const target = userMemberships.find((m) => m.schoolId === nextSchoolId);
      if (!target || target.schoolId === activeSchoolId) return;

      const targetBinding =
        bindingsBySchoolRef.current[target.schoolId] ||
        normalizeCloudBinding({ provider: 'managed', apiUrl: '', publicKey: '' });

      if (user && user.email) {
        localStorage.setItem(getActiveSchoolPrefKey(user.uid), target.schoolId);
        void saveMasterAccountProfile({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || target.displayName || '',
          activeSchoolId: target.schoolId,
          schoolName: target.schoolName,
          role: target.role,
          binding: targetBinding,
        }).catch(() => {});
      }
      setActivePrintDoc(null);
      setCloudBinding(targetBinding);
      cloudBindingRef.current = targetBinding;
      setActiveSchoolId(target.schoolId);
      setCurrentRole(target.role);
      setActiveModuleState(getDefaultModuleForRole(target.role));
      setIsCurrentUserAuthorized(true);
      notify(
        'info',
        'Switched School Workspace',
        `Now viewing ${target.schoolName} as ${target.role.replace('_', ' ')}.`
      );
    },
    [userMemberships, activeSchoolId, notify]
  );

  const dismissPendingInvite = useCallback(() => {
    clearInviteParamsFromBrowser();
    setPendingInviteParams(null);
    setPendingInviteDoc(null);
    setPendingInviteStatus('none');
    setCloudInitNonce((n) => n + 1);
  }, []);

  const claimPendingInvite = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    const user = firebaseAuth.currentUser;
    if (!user || !user.email || !user.emailVerified) {
      return { ok: false, error: 'Verify your account first to accept this invitation.' };
    }
    if (!pendingInviteParams || !pendingInviteDoc) {
      return { ok: false, error: 'Invitation details are unavailable or expired.' };
    }

    try {
      setCloudSyncStatus('syncing');
      const decodedToken = pendingInviteParams.cctx
        ? decodeDynamicCloudInviteToken(pendingInviteParams.cctx)
        : null;

      if (decodedToken && isExternalDynamicCloud(decodedToken.binding)) {
        const extClaim = await claimExternalCloudStaffInvite({
          decoded: decodedToken,
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || pendingInviteDoc.invitedName || '',
        });
        if (!extClaim.ok || !extClaim.role) {
          setCloudSyncStatus('invite-claim');
          return { ok: false, error: extClaim.error || 'Could not claim dynamic invite.' };
        }

        const nowIso = new Date().toISOString();
        const membership: UserSchoolMembership = {
          id: `${user.uid}_${decodedToken.schoolId}`,
          uid: user.uid,
          schoolId: decodedToken.schoolId,
          schoolName: extClaim.schoolName || decodedToken.schoolName,
          role: extClaim.role,
          email: user.email.toLowerCase(),
          displayName: user.displayName || pendingInviteDoc.invitedName || '',
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        await saveMasterAccountProfile({
          uid: user.uid,
          email: user.email,
          displayName: membership.displayName,
          activeSchoolId: membership.schoolId,
          schoolName: membership.schoolName,
          role: membership.role,
          binding: decodedToken.binding,
        });

        bindingsBySchoolRef.current[membership.schoolId] = decodedToken.binding;
        setCloudBinding(decodedToken.binding);
        cloudBindingRef.current = decodedToken.binding;

        clearInviteParamsFromBrowser();
        setPendingInviteParams(null);
        setPendingInviteDoc(null);
        setPendingInviteStatus('none');

        localStorage.setItem(getActiveSchoolPrefKey(user.uid), membership.schoolId);
        setUserMemberships((prev) => [
          ...prev.filter((m) => m.schoolId !== membership.schoolId),
          membership,
        ]);
        setActiveSchoolId(membership.schoolId);
        setCurrentRole(membership.role);
        setActiveModuleState(getDefaultModuleForRole(membership.role));
        setIsCurrentUserAuthorized(true);
        setCloudSyncStatus('live');

        notify(
          'success',
          'Invitation Accepted',
          `Connected to ${membership.schoolName} (${decodedToken.binding.provider.toUpperCase()}) as ${membership.role.replace('_', ' ')}.`
        );
        return { ok: true };
      }

      const membership = await acceptStaffInviteInCloud(
        pendingInviteParams.schoolId,
        pendingInviteDoc,
        {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
        }
      );

      const managedBinding = normalizeCloudBinding({
        provider: 'managed',
        apiUrl: '',
        publicKey: '',
      });
      await saveMasterAccountProfile({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || pendingInviteDoc.invitedName || '',
        activeSchoolId: membership.schoolId,
        schoolName: membership.schoolName,
        role: membership.role,
        binding: managedBinding,
      });

      bindingsBySchoolRef.current[membership.schoolId] = managedBinding;
      setCloudBinding(managedBinding);
      cloudBindingRef.current = managedBinding;

      clearInviteParamsFromBrowser();
      setPendingInviteParams(null);
      setPendingInviteDoc(null);
      setPendingInviteStatus('none');

      localStorage.setItem(getActiveSchoolPrefKey(user.uid), membership.schoolId);
      setUserMemberships((prev) => [
        ...prev.filter((m) => m.schoolId !== membership.schoolId),
        membership,
      ]);
      setActiveSchoolId(membership.schoolId);
      setCurrentRole(membership.role);
      setActiveModuleState(getDefaultModuleForRole(membership.role));
      setIsCurrentUserAuthorized(true);
      setCloudSyncStatus('live');

      notify(
        'success',
        'Invitation Accepted',
        `Welcome to ${membership.schoolName}! Your ${membership.role.replace(
          '_',
          ' '
        )} dashboard is ready.`
      );
      return { ok: true };
    } catch (err) {
      setCloudSyncStatus('invite-claim');
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Could not claim invitation. Verify that the Accountant seat limit has not been exceeded.',
      };
    }
  }, [pendingInviteParams, pendingInviteDoc, notify]);

  const buildInviteRegistrationUrl = useCallback(
    (
      schoolId: string,
      inviteId: string,
      explicitInvite?: Pick<
        StaffInviteRecord,
        'schoolName' | 'invitedEmail' | 'invitedName' | 'role'
      >
    ): string => {
      const origin = window.location.origin;
      const pathname = window.location.pathname || '/';
      const base = `${origin}${pathname}?school=${encodeURIComponent(
        schoolId
      )}&invite=${encodeURIComponent(inviteId)}`;

      const matched =
        explicitInvite || staffInvitesRef.current.find((inv) => inv.id === inviteId);
      if (matched) {
        const token = encodeDynamicCloudInviteToken({
          schoolId,
          inviteId,
          schoolName:
            matched.schoolName ||
            dbRef.current.schoolProfile.schoolName ||
            tenantMetaRef.current?.schoolName ||
            'School Workspace',
          invitedEmail: matched.invitedEmail,
          invitedName: matched.invitedName,
          role: matched.role,
          binding: cloudBindingRef.current,
        });
        if (token) {
          return `${base}&cctx=${encodeURIComponent(token)}`;
        }
      }
      return base;
    },
    []
  );

  const sendStaffPasswordReset = useCallback(
    async (email: string): Promise<{ ok: boolean; error?: string }> => {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) {
        return { ok: false, error: 'Email address is required.' };
      }
      try {
        await sendPasswordResetEmail(firebaseAuth, cleanEmail);
        notify(
          'success',
          'Password Reset Email Dispatched',
          `A secure password reset link has been dispatched to ${cleanEmail}.`
        );
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not send password reset email.';
        notify('error', 'Reset Failed', msg);
        return { ok: false, error: msg };
      }
    },
    [notify]
  );

  const createStaffAccountWithCredentials = useCallback(
    async (input: {
      fullName: string;
      email: string;
      password: string;
      role: InvitableSchoolRole;
      staffProfileId?: string;
    }): Promise<{
      ok: boolean;
      error?: string;
      staffUid?: string;
      generatedPassword?: string;
    }> => {
      const currentAdmin = firebaseAuth.currentUser;
      const schoolId = activeSchoolIdRef.current;
      const meta = tenantMetaRef.current;

      if (!isCurrentUserAdmin || !currentAdmin?.email || !schoolId || !meta) {
        return {
          ok: false,
          error: 'Only the School Main Admin can provision staff accounts.',
        };
      }

      const cleanName = input.fullName.trim();
      const cleanEmail = input.email.trim().toLowerCase();
      const cleanPassword = input.password.trim();

      if (!cleanName || cleanName.length < 2) {
        return { ok: false, error: 'Please enter the staff member’s full name.' };
      }
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return {
          ok: false,
          error: 'Please enter a valid email address (e.g., teacher@school.edu or name@gmail.com).',
        };
      }
      if (!cleanPassword || cleanPassword.length < 6) {
        return { ok: false, error: 'Staff password must be at least 6 characters long.' };
      }

      if (input.role === 'accountant') {
        const activeAccountants = schoolMembersRef.current.filter((m) => m.role === 'accountant').length;
        if (activeAccountants >= ACCOUNTANT_MAX_LIMIT) {
          return {
            ok: false,
            error: `Accountant limit reached (${ACCOUNTANT_MAX_LIMIT} maximum per school).`,
          };
        }
      }

      const alreadyMember = schoolMembersRef.current.find(
        (m) => m.email.toLowerCase() === cleanEmail
      );
      if (alreadyMember) {
        return {
          ok: false,
          error: `User ${cleanEmail} is already a verified member of this school (${ROLE_META[alreadyMember.role].label}).`,
        };
      }

      setCloudSyncStatus('syncing');

      // 1. Create the invite record and sync authorized emails in Cloud Firestore
      let inviteRes: StaffInviteRecord;
      try {
        inviteRes = await createStaffInviteInCloud({
          schoolId,
          invitedName: cleanName,
          invitedEmail: cleanEmail,
          role: input.role,
          currentUid: currentAdmin.uid,
          currentUserEmail: currentAdmin.email,
          ownerEmail: meta.ownerEmail,
          schoolName: meta.schoolName || dbRef.current.schoolProfile?.schoolName || 'School ERP',
          currentAuthorizedEmails: authorizedEmailsRef.current,
          existingMembers: schoolMembersRef.current,
          existingInvites: staffInvitesRef.current,
          dbSnapshot: dbRef.current,
          storedLogoUrl: rawSchoolLogoUrlRef.current || undefined,
        });
      } catch (err) {
        setCloudSyncStatus('live');
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not initialize staff account in cloud.',
        };
      }

      // 2. Create the user in Firebase Auth using a secondary Firebase app instance
      let createdStaffUid = '';
      const tempAppName = `prov_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      let tempApp: ReturnType<typeof initializeApp> | null = null;

      try {
        tempApp = initializeApp(firebaseConfig, tempAppName);
        const tempAuth = getAuth(tempApp);
        const cred = await createUserWithEmailAndPassword(tempAuth, cleanEmail, cleanPassword);
        createdStaffUid = cred.user.uid;
        if (cleanName) {
          await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
        }
      } catch (authErr: unknown) {
        const msg = authErr instanceof Error ? authErr.message : String(authErr);
        if (msg.includes('auth/email-already-in-use')) {
          notify(
            'info',
            'Firebase Auth Account Exists',
            `An account for ${cleanEmail} already exists in Firebase Auth. School access invite generated and pre-authorized.`
          );
        } else {
          console.warn('Direct secondary auth account creation notice:', msg);
        }
      } finally {
        if (tempApp) {
          await deleteApp(tempApp).catch(() => {});
        }
      }

      // 3. Claim the invite and register member in Cloud Firestore
      if (createdStaffUid) {
        try {
          const membership = await acceptStaffInviteInCloud(schoolId, inviteRes, {
            uid: createdStaffUid,
            email: cleanEmail,
            displayName: cleanName,
          });

          const newMember: SchoolMemberRecord = {
            uid: createdStaffUid,
            schoolId,
            ownerUid: meta.ownerUid,
            email: cleanEmail,
            displayName: cleanName,
            role: input.role,
            inviteId: inviteRes.id,
            addedByUid: currentAdmin.uid,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            staffProfileId: input.staffProfileId,
            initialPasswordHint: `${cleanPassword.slice(0, 2)}••••${cleanPassword.slice(-1)}`,
          };

          const nextMembers = [
            ...schoolMembersRef.current.filter((m) => m.uid !== createdStaffUid),
            newMember,
          ];
          setSchoolMembers(nextMembers);
          schoolMembersRef.current = nextMembers;
          setUserMemberships((prev) => [
            ...prev.filter((m) => m.uid !== createdStaffUid),
            membership,
          ]);
          setStaffInvites((prev) =>
            prev.map((i) =>
              i.id === inviteRes.id
                ? { ...i, status: 'accepted' as const, acceptedByUid: createdStaffUid }
                : i
            )
          );
        } catch (claimErr) {
          console.warn('Direct member claim notice:', claimErr);
        }
      }

      setCloudSyncStatus('live');
      notify(
        'success',
        'Staff Account Provisioned',
        `Login credentials created for ${cleanName} (${ROLE_META[input.role].label}).`
      );

      return {
        ok: true,
        staffUid: createdStaffUid || undefined,
        generatedPassword: cleanPassword,
      };
    },
    [isCurrentUserAdmin, notify]
  );

  const createStaffInvite = useCallback(
    async (input: {
      invitedName: string;
      invitedEmail: string;
      role: InvitableSchoolRole;
    }): Promise<{
      ok: boolean;
      invite?: StaffInviteRecord;
      inviteUrl?: string;
      error?: string;
    }> => {
      const user = firebaseAuth.currentUser;
      const schoolId = activeSchoolIdRef.current;
      const meta = tenantMetaRef.current;

      if (!isCurrentUserAdmin || !user?.email || !schoolId || !meta) {
        return {
          ok: false,
          error: 'Only the Main Admin can generate staff invitation links.',
        };
      }

      if (isExternalDynamicCloud(cloudBindingRef.current)) {
        const cleanEmail = input.invitedEmail.trim().toLowerCase();
        if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          return { ok: false, error: 'Enter a valid staff email address.' };
        }
        if (cleanEmail === meta.ownerEmail.toLowerCase()) {
          return { ok: false, error: 'This email already belongs to the Main Admin.' };
        }
        const activeAccountants = schoolMembersRef.current.filter(
          (m) => m.role === 'accountant'
        ).length;
        const pendingAccountants = staffInvitesRef.current.filter(
          (i) => i.status === 'pending' && i.role === 'accountant'
        ).length;
        if (
          input.role === 'accountant' &&
          activeAccountants + pendingAccountants >= ACCOUNTANT_MAX_LIMIT
        ) {
          return {
            ok: false,
            error: `Accountant limit reached (Max ${ACCOUNTANT_MAX_LIMIT} active/pending Accountants per school).`,
          };
        }

        try {
          setCloudSyncStatus('syncing');
          const nowIso = new Date().toISOString();
          const inviteId = toSafeDocId(
            `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
          );
          const invite: StaffInviteRecord = {
            id: inviteId,
            schoolId,
            schoolName: dbRef.current.schoolProfile.schoolName || meta.schoolName,
            invitedName: input.invitedName.trim() || cleanEmail.split('@')[0],
            invitedEmail: cleanEmail,
            role: input.role,
            status: 'pending',
            invitedByUid: user.uid,
            invitedByEmail: user.email.toLowerCase(),
            acceptedByUid: '',
            createdAt: nowIso,
            updatedAt: nowIso,
          };

          const nextInvites = [
            invite,
            ...staffInvitesRef.current.filter(
              (i) =>
                !(
                  i.status === 'pending' &&
                  i.invitedEmail.toLowerCase() === cleanEmail
                )
            ),
          ];
          setStaffInvites(nextInvites);
          staffInvitesRef.current = nextInvites;

          await saveExternalCloudSnapshot(
            schoolId,
            cloudBindingRef.current,
            buildExternalEnvelope(schoolId, { invites: nextInvites })
          );

          const inviteUrl = buildInviteRegistrationUrl(schoolId, invite.id, invite);
          setCloudSyncStatus('live');
          notify(
            'success',
            'Dynamic Cloud Staff Link Generated',
            `Invite link includes your bound ${cloudBindingRef.current.provider.toUpperCase()} connection for ${invite.invitedEmail}.`
          );
          return { ok: true, invite, inviteUrl };
        } catch (err) {
          setCloudSyncStatus('live');
          return {
            ok: false,
            error:
              err instanceof Error ? err.message : 'Failed to generate staff invite link.',
          };
        }
      }

      try {
        setCloudSyncStatus('syncing');
        const invite = await createStaffInviteInCloud({
          schoolId,
          schoolName: dbRef.current.schoolProfile.schoolName || meta.schoolName,
          ownerEmail: meta.ownerEmail,
          invitedName: input.invitedName,
          invitedEmail: input.invitedEmail,
          role: input.role,
          currentUid: user.uid,
          currentUserEmail: user.email,
          currentAuthorizedEmails: authorizedEmailsRef.current,
          existingMembers: schoolMembers,
          existingInvites: staffInvites,
          dbSnapshot: dbRef.current,
          storedLogoUrl: rawSchoolLogoUrlRef.current || undefined,
        });

        const inviteUrl = buildInviteRegistrationUrl(schoolId, invite.id, invite);
        setCloudSyncStatus('live');
        notify(
          'success',
          'Staff Invite Link Generated',
          `Share the registration link with ${invite.invitedEmail} via WhatsApp or Email.`
        );
        return { ok: true, invite, inviteUrl };
      } catch (err) {
        setCloudSyncStatus('live');
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Failed to generate staff invite link.',
        };
      }
    },
    [
      buildExternalEnvelope,
      isCurrentUserAdmin,
      schoolMembers,
      staffInvites,
      buildInviteRegistrationUrl,
      notify,
    ]
  );

  const changeSchoolMemberRole = useCallback(
    async (
      memberUid: string,
      nextRole: InvitableSchoolRole
    ): Promise<{ ok: boolean; error?: string }> => {
      const user = firebaseAuth.currentUser;
      const schoolId = activeSchoolIdRef.current;
      if (!isCurrentUserAdmin || !user || !schoolId) {
        return { ok: false, error: 'Only the Main Admin can update staff roles.' };
      }
      const target = schoolMembers.find((m) => m.uid === memberUid);
      if (!target) {
        return { ok: false, error: 'Staff member not found.' };
      }

      if (isExternalDynamicCloud(cloudBindingRef.current)) {
        if (
          nextRole === 'accountant' &&
          target.role !== 'accountant' &&
          activeAccountantSeatsUsed + pendingAccountantInvitesCount >= ACCOUNTANT_MAX_LIMIT
        ) {
          return {
            ok: false,
            error: `Accountant quota reached (Max ${ACCOUNTANT_MAX_LIMIT} Accountants per school).`,
          };
        }
        try {
          setCloudSyncStatus('syncing');
          const nowIso = new Date().toISOString();
          const nextMembers = schoolMembersRef.current.map((m) =>
            m.uid === memberUid ? { ...m, role: nextRole, updatedAt: nowIso } : m
          );
          setSchoolMembers(nextMembers);
          schoolMembersRef.current = nextMembers;
          await saveExternalCloudSnapshot(
            schoolId,
            cloudBindingRef.current,
            buildExternalEnvelope(schoolId, { members: nextMembers })
          );
          setCloudSyncStatus('live');
          notify(
            'success',
            'Staff Role Updated',
            `${target.email} is now assigned as ${nextRole.replace('_', ' ')}.`
          );
          return { ok: true };
        } catch (err) {
          setCloudSyncStatus('live');
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Failed to update staff role.',
          };
        }
      }

      try {
        setCloudSyncStatus('syncing');
        await updateSchoolMemberRoleInCloud(
          schoolId,
          target,
          nextRole,
          user.uid,
          activeAccountantSeatsUsed,
          pendingAccountantInvitesCount
        );
        setCloudSyncStatus('live');
        notify(
          'success',
          'Staff Role Updated',
          `${target.email} is now assigned as ${nextRole.replace('_', ' ')}.`
        );
        return { ok: true };
      } catch (err) {
        setCloudSyncStatus('live');
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to update staff role.',
        };
      }
    },
    [
      buildExternalEnvelope,
      isCurrentUserAdmin,
      schoolMembers,
      activeAccountantSeatsUsed,
      pendingAccountantInvitesCount,
      notify,
    ]
  );

  const removeSchoolMember = useCallback(
    async (memberUid: string): Promise<{ ok: boolean; error?: string }> => {
      const user = firebaseAuth.currentUser;
      const schoolId = activeSchoolIdRef.current;
      const meta = tenantMetaRef.current;
      if (!isCurrentUserAdmin || !user?.email || !schoolId || !meta) {
        return { ok: false, error: 'Only the Main Admin can remove staff accounts.' };
      }
      const target = schoolMembers.find((m) => m.uid === memberUid);
      if (!target) {
        return { ok: false, error: 'Staff member not found.' };
      }

      if (isExternalDynamicCloud(cloudBindingRef.current)) {
        try {
          setCloudSyncStatus('syncing');
          const nextMembers = schoolMembersRef.current.filter((m) => m.uid !== memberUid);
          setSchoolMembers(nextMembers);
          schoolMembersRef.current = nextMembers;
          await saveExternalCloudSnapshot(
            schoolId,
            cloudBindingRef.current,
            buildExternalEnvelope(schoolId, { members: nextMembers })
          );
          setCloudSyncStatus('live');
          notify('info', 'Staff Access Revoked', `Removed ${target.email} from this school.`);
          return { ok: true };
        } catch (err) {
          setCloudSyncStatus('live');
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Failed to revoke staff member.',
          };
        }
      }

      try {
        setCloudSyncStatus('syncing');
        const nextEmails = await revokeSchoolMemberInCloud({
          schoolId,
          member: target,
          ownerEmail: meta.ownerEmail,
          currentUid: user.uid,
          currentUserEmail: user.email,
          currentAuthorizedEmails: authorizedEmailsRef.current,
          dbSnapshot: dbRef.current,
          storedLogoUrl: rawSchoolLogoUrlRef.current || undefined,
        });
        setAuthorizedStaffEmails(nextEmails);
        authorizedEmailsRef.current = nextEmails;
        setCloudSyncStatus('live');
        notify('info', 'Staff Access Revoked', `Removed ${target.email} from this school.`);
        return { ok: true };
      } catch (err) {
        setCloudSyncStatus('live');
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to revoke staff member.',
        };
      }
    },
    [buildExternalEnvelope, isCurrentUserAdmin, schoolMembers, notify]
  );

  const revokeStaffInvite = useCallback(
    async (inviteId: string): Promise<{ ok: boolean; error?: string }> => {
      const user = firebaseAuth.currentUser;
      const schoolId = activeSchoolIdRef.current;
      const meta = tenantMetaRef.current;
      if (!isCurrentUserAdmin || !user?.email || !schoolId || !meta) {
        return { ok: false, error: 'Only the Main Admin can revoke invite links.' };
      }
      const target = staffInvites.find((inv) => inv.id === inviteId);
      if (!target) {
        return { ok: false, error: 'Invite record not found.' };
      }

      if (isExternalDynamicCloud(cloudBindingRef.current)) {
        try {
          setCloudSyncStatus('syncing');
          const nowIso = new Date().toISOString();
          const nextInvites = staffInvitesRef.current.map((inv) =>
            inv.id === inviteId ? { ...inv, status: 'revoked' as const, updatedAt: nowIso } : inv
          );
          setStaffInvites(nextInvites);
          staffInvitesRef.current = nextInvites;
          await saveExternalCloudSnapshot(
            schoolId,
            cloudBindingRef.current,
            buildExternalEnvelope(schoolId, { invites: nextInvites })
          );
          setCloudSyncStatus('live');
          notify('info', 'Invite Link Revoked', `Revoked invite for ${target.invitedEmail}.`);
          return { ok: true };
        } catch (err) {
          setCloudSyncStatus('live');
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Failed to revoke invite link.',
          };
        }
      }

      try {
        setCloudSyncStatus('syncing');
        const nextEmails = await revokeStaffInviteInCloud({
          schoolId,
          invite: target,
          ownerEmail: meta.ownerEmail,
          currentUid: user.uid,
          currentUserEmail: user.email,
          currentAuthorizedEmails: authorizedEmailsRef.current,
          activeMembers: schoolMembers,
          dbSnapshot: dbRef.current,
          storedLogoUrl: rawSchoolLogoUrlRef.current || undefined,
        });
        setAuthorizedStaffEmails(nextEmails);
        authorizedEmailsRef.current = nextEmails;
        setCloudSyncStatus('live');
        notify('info', 'Invite Link Revoked', `Revoked invite for ${target.invitedEmail}.`);
        return { ok: true };
      } catch (err) {
        setCloudSyncStatus('live');
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to revoke invite link.',
        };
      }
    },
    [buildExternalEnvelope, isCurrentUserAdmin, staffInvites, schoolMembers, notify]
  );

  const updateSubscriptionPlan = useCallback(
    async (plan: SubscriptionPlan, status?: SubscriptionStatus): Promise<void> => {
      const user = firebaseAuth.currentUser;
      const schoolId = activeSchoolIdRef.current;
      const meta = tenantMetaRef.current;
      if (!isCurrentUserAdmin || !user || !schoolId || !meta) return;

      const updatedMeta: SchoolTenantMeta = {
        ...meta,
        subscriptionPlan: plan,
        subscriptionStatus: status || meta.subscriptionStatus,
        updatedAt: new Date().toISOString(),
      };
      setTenantMeta(updatedMeta);
      tenantMetaRef.current = updatedMeta;

      runCloudTask(async () => {
        await saveSchoolConfigToCloud(
          schoolId,
          dbRef.current,
          authorizedEmailsRef.current,
          meta.ownerEmail,
          user.uid,
          rawSchoolLogoUrlRef.current || undefined,
          {
            subscriptionPlan: plan,
            subscriptionStatus: status || meta.subscriptionStatus,
          }
        );
      });
      notify('success', 'Subscription Plan Updated', `Workspace tier set to ${plan}.`);
    },
    [isCurrentUserAdmin, notify, runCloudTask]
  );

  // Module 3: In-App "Ask AI / Change Us" Customization Actions (Main Admin Only)
  const updateAiCustomization = useCallback(
    (next: AiCustomizationSettings) => {
      if (!isCurrentUserAdmin) {
        notify(
          'error',
          'Main Admin Permission Required',
          'Only Main Admin can customize workspace themes and stationery templates.'
        );
        return;
      }
      const clean = normalizeAiCustomization(next);
      aiCustomizationRef.current = clean;
      setAiCustomizationState(clean);

      const schoolId = activeSchoolIdRef.current;
      if (schoolId) {
        try {
          localStorage.setItem(getUiCustomizationCacheKey(schoolId), JSON.stringify(clean));
        } catch {
          // ignore
        }
      }

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const sid = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !sid) return;
        await saveUiCustomizationToCloud(
          sid,
          clean,
          authorizedEmailsRef.current,
          ownerEmail,
          uid
        );
      });
    },
    [isCurrentUserAdmin, notify, runCloudTask]
  );

  const resetAiCustomization = useCallback(() => {
    updateAiCustomization(DEFAULT_AI_CUSTOMIZATION);
    notify(
      'info',
      'Customization Reset',
      'Restored default ERP workspace theme and official print templates.'
    );
  }, [notify, updateAiCustomization]);

  // Module 4: Manual Photo Fallback & Quick Passport Cropper Helpers
  const getEffectiveStudentPhoto = useCallback(
    (student?: StudentRecord | null): string => {
      if (!student) return '';
      const override = photoOverrides[`student:${student.id}`];
      const effective = override || student.photoDataUrl || '';
      if (effective && effective.startsWith('data:')) {
        cacheResolvedDataUrl(effective, effective);
      }
      return effective;
    },
    [photoOverrides]
  );

  const getEffectiveStaffPhoto = useCallback(
    (staff?: StaffMember | null): string => {
      if (!staff) return '';
      const override = photoOverrides[`staff:${staff.id}`];
      const effective = override || staff.photoDataUrl || '';
      if (effective && effective.startsWith('data:')) {
        cacheResolvedDataUrl(effective, effective);
      }
      return effective;
    },
    [photoOverrides]
  );

  const setTemporaryPhotoOverride = useCallback(
    (targetType: 'student' | 'staff', recordId: string, dataUrl: string) => {
      if (!recordId || !dataUrl) return;
      cacheResolvedDataUrl(dataUrl, dataUrl);
      setPhotoOverrides((prev) => ({
        ...prev,
        [`${targetType}:${recordId}`]: dataUrl,
      }));
      notify(
        'success',
        'Photo Attached for Print & Download',
        'Passport photo applied immediately to live card previews, PDFs, and print sheets.'
      );
    },
    [notify]
  );

  const saveQuickPersonPhoto = useCallback(
    async (
      targetType: 'student' | 'staff',
      recordId: string,
      dataUrl: string
    ): Promise<void> => {
      if (!recordId || !dataUrl) return;
      cacheResolvedDataUrl(dataUrl, dataUrl);
      setPhotoOverrides((prev) => ({
        ...prev,
        [`${targetType}:${recordId}`]: dataUrl,
      }));

      if (targetType === 'student') {
        const canSaveStudentPhoto =
          currentRoleRef.current === 'main_admin' ||
          currentRoleRef.current === 'accountant' ||
          currentRoleRef.current === 'teacher';
        if (!canSaveStudentPhoto) return;

        commitDb((prev) => ({
          ...prev,
          students: prev.students.map((s) =>
            s.id === recordId ? { ...s, photoDataUrl: dataUrl } : s
          ),
          lastUpdated: new Date().toISOString(),
        }));

        runCloudTask(async () => {
          const uid = firebaseAuth.currentUser?.uid;
          const sid = activeSchoolIdRef.current;
          const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
          if (!uid || !sid) return;
          const storedRef = await saveStudentPhotoQuickToCloud(
            sid,
            recordId,
            dataUrl,
            authorizedEmailsRef.current,
            ownerEmail,
            uid
          );
          displayToStoredMediaRef.current.set(dataUrl, storedRef);
        });

        notify(
          'success',
          'Student Photo Saved to Cloud',
          'Photograph cropped and saved permanently to student profile.'
        );
      } else {
        if (!canManageCampusOps) return;
        let updatedMember: StaffMember | undefined;
        commitDb((prev) => {
          const nextStaff = prev.staff.map((m) => {
            if (m.id === recordId) {
              updatedMember = { ...m, photoDataUrl: dataUrl };
              return updatedMember;
            }
            return m;
          });
          return {
            ...prev,
            staff: nextStaff,
            lastUpdated: new Date().toISOString(),
          };
        });

        if (updatedMember) {
          const targetStaff = updatedMember;
          runCloudTask(async () => {
            const uid = firebaseAuth.currentUser?.uid;
            const sid = activeSchoolIdRef.current;
            const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
            if (!uid || !sid) return;
            await saveStaffToCloud(
              sid,
              targetStaff,
              authorizedEmailsRef.current,
              ownerEmail,
              uid
            );
          });
        }

        notify(
          'success',
          'Staff Photo Saved to Cloud',
          'Photograph cropped and saved permanently to staff profile.'
        );
      }
    },
    [canManageCampusOps, commitDb, notify, runCloudTask]
  );

  // Legacy compatibility wrappers mapped onto Staff Invite system
  const addAuthorizedStaffEmail = useCallback(
    async (rawEmail: string): Promise<{ ok: boolean; error?: string }> => {
      const res = await createStaffInvite({
        invitedName: rawEmail.split('@')[0] || 'Staff',
        invitedEmail: rawEmail,
        role: 'teacher',
      });
      return { ok: res.ok, error: res.error };
    },
    [createStaffInvite]
  );

  const removeAuthorizedStaffEmail = useCallback(
    async (targetEmail: string): Promise<{ ok: boolean; error?: string }> => {
      const clean = targetEmail.trim().toLowerCase();
      const matchedMember = schoolMembers.find((m) => m.email.toLowerCase() === clean);
      if (matchedMember) {
        return removeSchoolMember(matchedMember.uid);
      }
      const matchedInvite = staffInvites.find(
        (inv) => inv.status === 'pending' && inv.invitedEmail.toLowerCase() === clean
      );
      if (matchedInvite) {
        return revokeStaffInvite(matchedInvite.id);
      }
      return { ok: false, error: 'Staff member not found.' };
    },
    [schoolMembers, staffInvites, removeSchoolMember, revokeStaffInvite]
  );

  const uploadCloudMedia = useCallback(
    async (
      file: File,
      category: MediaCategory,
      recordRef: string
    ): Promise<{ storedUrl: string; displayUrl: string }> => {
      if (isExternalDynamicCloud(cloudBindingRef.current)) {
        const maxDim = category === 'student-aadhaar' ? 900 : 420;
        const quality = category === 'school-logo' ? 0.85 : 0.76;
        const dataUrl = await fileToCompressedDataUrl(file, maxDim, quality);
        cacheResolvedDataUrl(dataUrl, dataUrl);
        return { storedUrl: dataUrl, displayUrl: dataUrl };
      }

      const schoolId = activeSchoolIdRef.current || '';
      const ownerEmail = tenantMetaRef.current?.ownerEmail;
      const uploaded = await uploadSchoolMediaFile(
        schoolId,
        file,
        category,
        recordRef,
        authorizedEmailsRef.current,
        ownerEmail
      );
      displayToStoredMediaRef.current.set(uploaded.displayUrl, uploaded.storedUrl);
      return {
        storedUrl: uploaded.storedUrl,
        displayUrl: uploaded.displayUrl,
      };
    },
    []
  );

  // =========================================================================
  // UI NAVIGATION HELPERS
  // =========================================================================

  const openFeeModuleForStudent = useCallback(
    (studentId?: string, subTab: FeeSubTab = 'dues') => {
      if (!getAllowedModulesForRole(currentRoleRef.current).includes('fees')) {
        notify('error', 'Permission Denied', 'Your role does not have Fee Management access.');
        return;
      }
      setFeeSubTab(subTab);
      if (studentId) {
        setPreselectedFeeStudentId(studentId);
      }
      setActiveModuleState('fees');
    },
    [notify]
  );

  const clearPreselectedFeeStudent = useCallback(() => {
    setPreselectedFeeStudentId(null);
  }, []);

  const openIdCardForStudent = useCallback(
    (studentId: string) => {
      if (!getAllowedModulesForRole(currentRoleRef.current).includes('id-cards')) {
        notify('error', 'Permission Denied', 'Your role does not have ID Card Studio access.');
        return;
      }
      setPreselectedIdCardStudentId(studentId);
      setActiveModuleState('id-cards');
    },
    [notify]
  );

  const clearPreselectedIdCardStudent = useCallback(() => {
    setPreselectedIdCardStudentId(null);
  }, []);

  const openStaffIdCardStudio = useCallback(
    (staffId?: string) => {
      if (!getAllowedModulesForRole(currentRoleRef.current).includes('staff')) {
        notify('error', 'Permission Denied', 'Your role does not have Staff Directory access.');
        return;
      }
      if (staffId) {
        setPreselectedStaffIdCardId(staffId);
      }
      setStaffSubTab('id-cards');
      setActiveModuleState('staff');
    },
    [notify]
  );

  const clearPreselectedStaffIdCard = useCallback(() => {
    setPreselectedStaffIdCardId(null);
  }, []);

  const openEditStudentModal = useCallback(
    (studentId: string) => {
      if (
        currentRoleRef.current !== 'main_admin' &&
        currentRoleRef.current !== 'accountant'
      ) {
        notify('error', 'Read-Only Access', 'Your role cannot edit student records.');
        return;
      }
      setPreselectedEditStudentId(studentId);
      setActiveModuleState('admissions');
    },
    [notify]
  );

  const clearPreselectedEditStudent = useCallback(() => {
    setPreselectedEditStudentId(null);
  }, []);

  const activeSessionConfig = useMemo<AcademicSessionConfig>(() => {
    return (
      db.sessions.find((s) => s.name === db.activeSession) ||
      db.sessions.find((s) => s.isActive) ||
      db.sessions[0] || {
        id: 'ses-default',
        name: '2026-2027',
        startMonth: 'April',
        endMonth: 'March',
        isActive: true,
        createdAt: new Date().toISOString(),
      }
    );
  }, [db.sessions, db.activeSession]);

  const activeSessionMonths = useMemo<FeeMonth[]>(() => {
    return getSessionMonthsOrder(activeSessionConfig.startMonth, activeSessionConfig.endMonth);
  }, [activeSessionConfig.startMonth, activeSessionConfig.endMonth]);

  const dueOverview = useMemo(
    () =>
      computeSchoolDueOverview(
        db.students,
        db.fees,
        db.billingCutoffMonth,
        activeSessionMonths
      ),
    [db.students, db.fees, db.billingCutoffMonth, activeSessionMonths]
  );

  // =========================================================================
  // ACADEMIC SESSION MANAGEMENT & PROMOTION SYSTEM (MAIN ADMIN ONLY)
  // =========================================================================

  const addAcademicSession = useCallback(
    (input: {
      name: string;
      startMonth: FeeMonth;
      endMonth: FeeMonth;
      makeActive?: boolean;
    }): boolean => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can create academic sessions.');
        return false;
      }
      const cleanName = input.name.trim();
      if (!cleanName) {
        notify(
          'error',
          'Session Name Required',
          'Enter a valid academic session (e.g., 2027-2028).'
        );
        return false;
      }
      const duplicate = dbRef.current.sessions.some(
        (s) => s.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (duplicate) {
        notify('error', 'Duplicate Session', `Academic session "${cleanName}" already exists.`);
        return false;
      }

      const nowIso = new Date().toISOString();
      const makeActive = Boolean(input.makeActive);
      const newSession: AcademicSessionConfig = {
        id: `ses-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: cleanName,
        startMonth: input.startMonth || 'April',
        endMonth: input.endMonth || 'March',
        isActive: makeActive,
        createdAt: nowIso,
      };

      const addedSchedules: ClassSessionFeeRate[] = [];

      const nextDb = commitDb((prev) => {
        const nextSessions = makeActive
          ? [...prev.sessions.map((s) => ({ ...s, isActive: false })), newSession]
          : [...prev.sessions, newSession];

        const existingFeeKeys = new Set(
          prev.feeSchedules.map((f) => `${f.className}__${f.academicSession}`)
        );
        prev.classes.forEach((cls) => {
          const key = `${cls.className}__${cleanName}`;
          if (!existingFeeKeys.has(key)) {
            const base = getDefaultClassFeeBase(cls.className);
            addedSchedules.push({
              className: cls.className,
              academicSession: cleanName,
              admissionFee: base.admissionFee,
              monthlyTuitionFee: base.monthlyTuitionFee,
              annualExamFee: base.annualExamFee,
            });
          }
        });

        const nextCutoff = makeActive
          ? (() => {
              const months = getSessionMonthsOrder(
                newSession.startMonth,
                newSession.endMonth
              );
              return months.includes(prev.billingCutoffMonth)
                ? prev.billingCutoffMonth
                : months[0] || 'April';
            })()
          : prev.billingCutoffMonth;

        return {
          ...prev,
          sessions: nextSessions,
          activeSession: makeActive ? cleanName : prev.activeSession,
          billingCutoffMonth: nextCutoff,
          feeSchedules: [...prev.feeSchedules, ...addedSchedules],
          lastUpdated: nowIso,
        };
      });

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        const emails = authorizedEmailsRef.current;
        for (const s of nextDb.sessions) {
          if (makeActive || s.id === newSession.id) {
            await saveAcademicSessionToCloud(schoolId, s, emails, ownerEmail, uid);
          }
        }
        for (const fs of addedSchedules) {
          await saveFeeScheduleToCloud(schoolId, fs, emails, ownerEmail, uid);
        }
        if (makeActive) {
          await saveSchoolConfigToCloud(
            schoolId,
            nextDb,
            emails,
            ownerEmail,
            uid,
            rawSchoolLogoUrlRef.current || undefined
          );
        }
      });

      notify(
        'success',
        'Academic Session Created',
        makeActive
          ? `Session ${cleanName} (${newSession.startMonth} to ${newSession.endMonth}) created and set as Active.`
          : `Session ${cleanName} (${newSession.startMonth} to ${newSession.endMonth}) added.`
      );
      return true;
    },
    [commitDb, notify, runCloudTask]
  );

  const updateAcademicSession = useCallback(
    (
      id: string,
      input: { name: string; startMonth: FeeMonth; endMonth: FeeMonth }
    ): boolean => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can edit academic sessions.');
        return false;
      }
      const cleanName = input.name.trim();
      if (!cleanName) {
        notify('error', 'Session Name Required', 'Session name cannot be blank.');
        return false;
      }
      const current = dbRef.current;
      const target = current.sessions.find((s) => s.id === id);
      if (!target) return false;

      const duplicate = current.sessions.some(
        (s) => s.id !== id && s.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (duplicate) {
        notify(
          'error',
          'Duplicate Session',
          `Another session named "${cleanName}" already exists.`
        );
        return false;
      }

      const oldName = target.name;
      const nextDb = commitDb((prev) => {
        const nextSessions = prev.sessions.map((s) =>
          s.id === id
            ? {
                ...s,
                name: cleanName,
                startMonth: input.startMonth,
                endMonth: input.endMonth,
              }
            : s
        );
        const wasActive = prev.activeSession === oldName || target.isActive;
        const nextMonths = getSessionMonthsOrder(input.startMonth, input.endMonth);
        const nextCutoff =
          wasActive && !nextMonths.includes(prev.billingCutoffMonth)
            ? nextMonths[0] || 'April'
            : prev.billingCutoffMonth;

        return {
          ...prev,
          sessions: nextSessions,
          activeSession: wasActive ? cleanName : prev.activeSession,
          billingCutoffMonth: nextCutoff,
          feeSchedules:
            oldName !== cleanName
              ? prev.feeSchedules.map((f) =>
                  f.academicSession === oldName ? { ...f, academicSession: cleanName } : f
                )
              : prev.feeSchedules,
          lastUpdated: new Date().toISOString(),
        };
      });

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        const emails = authorizedEmailsRef.current;
        const updatedSession = nextDb.sessions.find((s) => s.id === id);
        if (updatedSession) {
          await saveAcademicSessionToCloud(schoolId, updatedSession, emails, ownerEmail, uid);
        }
        if (oldName !== cleanName) {
          for (const fs of nextDb.feeSchedules.filter(
            (f) => f.academicSession === cleanName
          )) {
            await saveFeeScheduleToCloud(schoolId, fs, emails, ownerEmail, uid);
          }
        }
        await saveSchoolConfigToCloud(
          schoolId,
          nextDb,
          emails,
          ownerEmail,
          uid,
          rawSchoolLogoUrlRef.current || undefined
        );
      });

      notify(
        'success',
        'Session Updated',
        `${cleanName} (${input.startMonth} to ${input.endMonth}) saved to cloud.`
      );
      return true;
    },
    [commitDb, notify, runCloudTask]
  );

  const setActiveAcademicSession = useCallback(
    (sessionNameOrId: string) => {
      if (currentRoleRef.current !== 'main_admin') {
        notify(
          'error',
          'Main Admin Required',
          'Only the Main Admin can switch the global active session.'
        );
        return;
      }
      const target = dbRef.current.sessions.find(
        (s) => s.id === sessionNameOrId || s.name === sessionNameOrId
      );
      if (!target) return;

      const nextDb = commitDb((prev) => {
        const months = getSessionMonthsOrder(target.startMonth, target.endMonth);
        const nextCutoff = months.includes(prev.billingCutoffMonth)
          ? prev.billingCutoffMonth
          : months[0] || 'April';
        return {
          ...prev,
          activeSession: target.name,
          billingCutoffMonth: nextCutoff,
          sessions: prev.sessions.map((s) => ({
            ...s,
            isActive: s.id === target.id,
          })),
          lastUpdated: new Date().toISOString(),
        };
      });

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        const emails = authorizedEmailsRef.current;
        for (const s of nextDb.sessions) {
          await saveAcademicSessionToCloud(schoolId, s, emails, ownerEmail, uid);
        }
        await saveSchoolConfigToCloud(
          schoolId,
          nextDb,
          emails,
          ownerEmail,
          uid,
          rawSchoolLogoUrlRef.current || undefined
        );
      });

      notify(
        'success',
        'Active Session Switched',
        `${target.name} (${target.startMonth} – ${target.endMonth}) is now the global Active Session.`
      );
    },
    [commitDb, notify, runCloudTask]
  );

  const deleteAcademicSession = useCallback(
    (id: string) => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can delete sessions.');
        return;
      }
      const current = dbRef.current;
      const target = current.sessions.find((s) => s.id === id);
      if (!target) return;
      if (target.isActive || current.activeSession === target.name) {
        notify(
          'error',
          'Cannot Delete Active Session',
          'Mark another academic session as Active before removing this session.'
        );
        return;
      }
      if (current.sessions.length <= 1) {
        notify('error', 'Action Blocked', 'At least one academic session must remain configured.');
        return;
      }
      commitDb((prev) => ({
        ...prev,
        sessions: prev.sessions.filter((s) => s.id !== id),
        lastUpdated: new Date().toISOString(),
      }));
      runCloudTask(async () => {
        const schoolId = activeSchoolIdRef.current;
        if (!schoolId) return;
        await deleteAcademicSessionFromCloud(schoolId, id);
      });
      notify('info', 'Session Removed', `Academic session ${target.name} removed.`);
    },
    [commitDb, notify, runCloudTask]
  );

  const promoteStudents = useCallback(
    (
      input: PromoteStudentsInput
    ): { ok: boolean; promotedCount: number; error?: string } => {
      if (currentRoleRef.current !== 'main_admin') {
        return {
          ok: false,
          promotedCount: 0,
          error: 'Only the Main Admin can execute batch session promotions.',
        };
      }
      const current = dbRef.current;
      const cleanTargetSession = input.toSession.trim();
      const cleanTargetClass = input.toClassName.trim();

      if (!cleanTargetSession) {
        return { ok: false, promotedCount: 0, error: 'Please select a target academic session.' };
      }
      if (!cleanTargetClass) {
        return { ok: false, promotedCount: 0, error: 'Please select or enter the promoted class.' };
      }
      if (!input.studentIds || input.studentIds.length === 0) {
        return {
          ok: false,
          promotedCount: 0,
          error: 'Select at least one active student to promote.',
        };
      }

      const selectedSet = new Set(input.studentIds);
      const candidates = current.students.filter(
        (s) => selectedSet.has(s.id) && s.status !== 'Deactive'
      );
      if (candidates.length === 0) {
        return {
          ok: false,
          promotedCount: 0,
          error: 'No active students found in the selection.',
        };
      }

      const nowIso = new Date().toISOString();
      const promotedBy = currentUserEmail || 'Administration';
      let createdSessionObj: AcademicSessionConfig | null = null;
      let upsertedClassObj: ClassAllocation | null = null;
      let createdFeeScheduleObj: ClassSessionFeeRate | null = null;

      const nextDb = commitDb((prev) => {
        let nextSessions = [...prev.sessions];
        if (
          !nextSessions.some(
            (s) => s.name.toLowerCase() === cleanTargetSession.toLowerCase()
          )
        ) {
          createdSessionObj = {
            id: `ses-${Date.now()}`,
            name: cleanTargetSession,
            startMonth: 'April',
            endMonth: 'March',
            isActive: false,
            createdAt: nowIso,
          };
          nextSessions.push(createdSessionObj);
        }
        let nextActiveSession = prev.activeSession;
        if (input.autoSwitchActiveSession) {
          nextActiveSession = cleanTargetSession;
          nextSessions = nextSessions.map((s) => ({
            ...s,
            isActive: s.name === cleanTargetSession,
          }));
        }

        const sectionsNeeded = new Set<string>(['A', 'B', 'C']);
        candidates.forEach((stu) => {
          const targetSec =
            input.sectionMode === 'assign' && input.assignedSection?.trim()
              ? input.assignedSection.trim().toUpperCase()
              : stu.section || 'A';
          sectionsNeeded.add(targetSec);
        });

        const nextClasses = [...prev.classes];
        const existingClsIdx = nextClasses.findIndex(
          (c) => c.className.toLowerCase() === cleanTargetClass.toLowerCase()
        );
        if (existingClsIdx >= 0) {
          const existingCls = nextClasses[existingClsIdx];
          const mergedSections = Array.from(
            new Set([...existingCls.sections, ...Array.from(sectionsNeeded)])
          );
          upsertedClassObj = {
            ...existingCls,
            sections: mergedSections,
          };
          nextClasses[existingClsIdx] = upsertedClassObj;
        } else {
          upsertedClassObj = {
            id: `cls-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            className: cleanTargetClass,
            sections: Array.from(sectionsNeeded),
            sectionCapacity: 35,
            isDefault: false,
          };
          nextClasses.push(upsertedClassObj);
        }

        const nextFeeSchedules = [...prev.feeSchedules];
        const targetFeeSchedule = nextFeeSchedules.find(
          (f) =>
            f.className === cleanTargetClass && f.academicSession === cleanTargetSession
        );
        let resolvedTargetTuition = targetFeeSchedule?.monthlyTuitionFee;
        if (!targetFeeSchedule) {
          const base = getDefaultClassFeeBase(cleanTargetClass);
          resolvedTargetTuition = base.monthlyTuitionFee;
          createdFeeScheduleObj = {
            className: cleanTargetClass,
            academicSession: cleanTargetSession,
            admissionFee: base.admissionFee,
            monthlyTuitionFee: base.monthlyTuitionFee,
            annualExamFee: base.annualExamFee,
          };
          nextFeeSchedules.push(createdFeeScheduleObj);
        }

        const existingCountBySection: Record<string, number> = {};
        prev.students.forEach((s) => {
          if (
            !selectedSet.has(s.id) &&
            s.status !== 'Deactive' &&
            s.academicSession === cleanTargetSession &&
            s.className === cleanTargetClass
          ) {
            existingCountBySection[s.section] =
              (existingCountBySection[s.section] || 0) + 1;
          }
        });

        const sortedCandidateIds = [...candidates]
          .sort((a, b) =>
            a.admissionId.localeCompare(b.admissionId, undefined, { numeric: true })
          )
          .map((c) => c.id);

        const promotionPlanById = new Map<
          string,
          { toSection: string; newRoll: string; prevRoll: string }
        >();

        sortedCandidateIds.forEach((stuId) => {
          const stu = prev.students.find((s) => s.id === stuId);
          if (!stu) return;
          const prevRoll = resolveStudentRollNumber(stu, prev.students);
          const toSec =
            input.sectionMode === 'assign' && input.assignedSection?.trim()
              ? input.assignedSection.trim().toUpperCase()
              : stu.section || 'A';
          const nextIndex = (existingCountBySection[toSec] || 0) + 1;
          existingCountBySection[toSec] = nextIndex;
          const newRoll = `${toSec}-${String(nextIndex).padStart(2, '0')}`;
          promotionPlanById.set(stuId, {
            toSection: toSec,
            newRoll,
            prevRoll,
          });
        });

        const nextStudents = prev.students.map((stu) => {
          const plan = promotionPlanById.get(stu.id);
          if (!plan) return stu;

          const historyEntry: StudentPromotionHistoryItem = {
            id: `prm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fromSession: stu.academicSession,
            toSession: cleanTargetSession,
            fromClass: stu.className,
            toClass: cleanTargetClass,
            fromSection: stu.section,
            toSection: plan.toSection,
            previousRollNumber: plan.prevRoll,
            newRollNumber: plan.newRoll,
            promotedAt: nowIso,
            promotedBy,
          };

          return {
            ...stu,
            academicSession: cleanTargetSession,
            className: cleanTargetClass,
            section: plan.toSection,
            rollNumber: plan.newRoll,
            monthlyTuitionFee:
              input.syncTuitionFeeWithClassMaster && resolvedTargetTuition !== undefined
                ? resolvedTargetTuition
                : stu.monthlyTuitionFee,
            promotionHistory: [historyEntry, ...(stu.promotionHistory || [])],
          };
        });

        return {
          ...prev,
          sessions: nextSessions,
          activeSession: nextActiveSession,
          classes: nextClasses,
          feeSchedules: nextFeeSchedules,
          students: nextStudents,
          lastUpdated: nowIso,
        };
      });

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        const emails = authorizedEmailsRef.current;

        if (createdSessionObj) {
          await saveAcademicSessionToCloud(
            schoolId,
            createdSessionObj,
            emails,
            ownerEmail,
            uid
          );
        }
        if (input.autoSwitchActiveSession) {
          for (const s of nextDb.sessions) {
            await saveAcademicSessionToCloud(schoolId, s, emails, ownerEmail, uid);
          }
          await saveSchoolConfigToCloud(
            schoolId,
            nextDb,
            emails,
            ownerEmail,
            uid,
            rawSchoolLogoUrlRef.current || undefined
          );
        }
        if (upsertedClassObj) {
          await saveClassAllocationToCloud(
            schoolId,
            upsertedClassObj,
            emails,
            ownerEmail,
            uid
          );
        }
        if (createdFeeScheduleObj) {
          await saveFeeScheduleToCloud(
            schoolId,
            createdFeeScheduleObj,
            emails,
            ownerEmail,
            uid
          );
        }
        for (const stu of nextDb.students) {
          if (selectedSet.has(stu.id)) {
            await saveStudentToCloud(
              schoolId,
              stu,
              emails,
              ownerEmail,
              uid,
              rawStudentUrlsRef.current[stu.id]
            );
          }
        }
      });

      notify(
        'success',
        'Students Promoted Successfully',
        `Promoted ${candidates.length} ${
          candidates.length === 1 ? 'student' : 'students'
        } to Class ${cleanTargetClass} (${cleanTargetSession}) with preserved academic records.`
      );
      return { ok: true, promotedCount: candidates.length };
    },
    [commitDb, currentUserEmail, notify, runCloudTask]
  );

  // =========================================================================
  // SCHOOL PROFILE & BRANDING SETTINGS (MAIN ADMIN ONLY)
  // =========================================================================

  const updateSchoolProfile = useCallback(
    (profile: SchoolProfileSettings) => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can edit school settings.');
        return;
      }
      const normalized = normalizeSchoolProfile(profile);
      const storedLogo = normalized.logoDataUrl
        ? displayToStoredMediaRef.current.get(normalized.logoDataUrl)
        : '';
      if (storedLogo !== undefined) {
        rawSchoolLogoUrlRef.current = storedLogo;
      }

      const nextDb = commitDb((prev) => ({
        ...prev,
        schoolProfile: normalized,
        lastUpdated: new Date().toISOString(),
      }));

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        await saveSchoolConfigToCloud(
          schoolId,
          nextDb,
          authorizedEmailsRef.current,
          ownerEmail,
          uid,
          storedLogo
        );
      });

      notify(
        'success',
        'School Profile Saved to Cloud',
        `${normalized.schoolName} branding & authority details updated across all stationery.`
      );
    },
    [commitDb, notify, runCloudTask]
  );

  const setBillingCutoffMonth = useCallback(
    (month: FeeMonth) => {
      if (
        currentRoleRef.current !== 'main_admin' &&
        currentRoleRef.current !== 'accountant'
      ) {
        notify('error', 'Permission Denied', 'Only Main Admin or Accountant can update billing cutoff.');
        return;
      }
      const nextDb = commitDb((prev) => ({
        ...prev,
        billingCutoffMonth: month,
        lastUpdated: new Date().toISOString(),
      }));

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        if (currentRoleRef.current === 'main_admin') {
          await saveSchoolConfigToCloud(
            schoolId,
            nextDb,
            authorizedEmailsRef.current,
            ownerEmail,
            uid,
            rawSchoolLogoUrlRef.current || undefined
          );
        } else {
          await saveAccountantCountersToCloud(
            schoolId,
            {
              studentSeq: nextDb.counters.studentSeq,
              receiptSeq: nextDb.counters.receiptSeq,
              billingCutoffMonth: month,
            },
            uid
          );
        }
      });

      notify('info', 'Billing Cutoff Updated', `Automated dues recalculated through ${month}.`);
    },
    [commitDb, notify, runCloudTask]
  );

  const getClassSessionFee = useCallback(
    (className: string, academicSession: string): ClassSessionFeeRate => {
      const found = db.feeSchedules.find(
        (s) => s.className === className && s.academicSession === academicSession
      );
      if (found) return found;
      const fallbackSameClass = db.feeSchedules.find((s) => s.className === className);
      if (fallbackSameClass) {
        return { ...fallbackSameClass, academicSession };
      }
      const base = getDefaultClassFeeBase(className);
      return {
        className,
        academicSession,
        admissionFee: base.admissionFee,
        monthlyTuitionFee: base.monthlyTuitionFee,
        annualExamFee: base.annualExamFee,
      };
    },
    [db.feeSchedules]
  );

  const updateClassSessionFee = useCallback(
    (
      className: string,
      academicSession: string,
      admissionFee: number,
      monthlyTuitionFee: number,
      annualExamFee: number
    ) => {
      if (
        currentRoleRef.current !== 'main_admin' &&
        currentRoleRef.current !== 'accountant'
      ) {
        notify('error', 'Permission Denied', 'Only Main Admin or Accountant can edit fee schedules.');
        return;
      }
      const cleanAdm = sanitizeNumber(admissionFee, 0);
      const cleanTuition = sanitizeNumber(monthlyTuitionFee, 0);
      const cleanExam = sanitizeNumber(annualExamFee, 0);

      const entry: ClassSessionFeeRate = {
        className,
        academicSession,
        admissionFee: cleanAdm,
        monthlyTuitionFee: cleanTuition,
        annualExamFee: cleanExam,
      };

      commitDb((prev) => {
        const idx = prev.feeSchedules.findIndex(
          (s) => s.className === className && s.academicSession === academicSession
        );
        const nextSchedules =
          idx >= 0
            ? prev.feeSchedules.map((s, i) => (i === idx ? entry : s))
            : [...prev.feeSchedules, entry];
        return {
          ...prev,
          feeSchedules: nextSchedules,
          lastUpdated: new Date().toISOString(),
        };
      });

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        await saveFeeScheduleToCloud(
          schoolId,
          entry,
          authorizedEmailsRef.current,
          ownerEmail,
          uid
        );
      });

      notify(
        'success',
        'Fee Master Updated',
        `Saved Class ${className} (${academicSession}) fee schedule to cloud.`
      );
    },
    [commitDb, notify, runCloudTask]
  );

  // =========================================================================
  // MODULE 1: ADMISSIONS & STUDENT STATUS (MAIN ADMIN + ACCOUNTANT)
  // =========================================================================

  const addStudent = useCallback(
    (input: AddStudentInput): StudentRecord => {
      const current = dbRef.current;
      const seq = current.counters.studentSeq;
      const cleanAdmFee =
        input.admissionType === 'Free' ? 0 : sanitizeNumber(input.admissionFee, 0);
      const cleanTuition = sanitizeNumber(input.monthlyTuitionFee, 0);
      const transportActive = Boolean(input.transportEnabled && input.routeId);
      const matchedRoute = transportActive
        ? current.routes.find((r) => r.id === input.routeId)
        : undefined;
      const cleanTransportFee = transportActive
        ? sanitizeNumber(matchedRoute ? matchedRoute.monthlyFare : input.transportFee, 0)
        : 0;
      const status: StudentStatus = input.status === 'Deactive' ? 'Deactive' : 'Active';

      const created: StudentRecord = {
        id: `stu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        admissionId: `RB${seq}`,
        rollNumber: input.rollNumber ? input.rollNumber.trim() : '',
        status,
        deactivatedAt: status === 'Deactive' ? new Date().toISOString() : undefined,
        deactivatedReason:
          status === 'Deactive' ? input.deactivatedReason?.trim() || '' : undefined,
        promotionHistory: [],
        academicSession: input.academicSession || current.activeSession || '2026-2027',
        admissionType: input.admissionType,
        admissionFee: cleanAdmFee,
        previousSchool: input.previousSchool.trim(),
        lastGradePassed: input.lastGradePassed.trim(),
        tcDetails: input.tcDetails.trim(),
        name: input.name.trim(),
        dob: input.dob,
        gender: input.gender,
        casteCategory: input.casteCategory,
        className: input.className,
        section: input.section,
        monthlyTuitionFee: cleanTuition,
        fatherName: input.fatherName.trim(),
        motherName: input.motherName.trim(),
        phone: input.phone.trim(),
        alternatePhone: input.alternatePhone.trim(),
        address: input.address.trim(),
        photoDataUrl: input.photoDataUrl || '',
        aadhaarNumber: input.aadhaarNumber.trim(),
        aadhaarDocDataUrl: input.aadhaarDocDataUrl || '',
        transportEnabled: transportActive,
        routeId: transportActive ? input.routeId : '',
        transportFee: cleanTransportFee,
        customNotes: input.customNotes.trim(),
        admissionDate: input.admissionDate || getTodayISO(),
      };

      if (
        currentRoleRef.current !== 'main_admin' &&
        currentRoleRef.current !== 'accountant'
      ) {
        notify('error', 'Permission Denied', 'Only Main Admin or Accountant can admit students.');
        return created;
      }

      const shouldLogAdmReceipt =
        Boolean(input.recordAdmissionFeeInLedger) &&
        input.admissionType === 'Paid' &&
        cleanAdmFee > 0;

      const sessionObj = current.sessions.find((s) => s.name === created.academicSession);
      const firstMonth: FeeMonth = sessionObj?.startMonth || 'April';

      const nextReceiptSeq = current.counters.receiptSeq;
      const autoFeeReceipt: FeeRecord | null = shouldLogAdmReceipt
        ? {
            id: `fee-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            receiptNo: `REC${nextReceiptSeq}`,
            studentId: created.id,
            admissionId: created.admissionId,
            studentName: created.name,
            className: created.className,
            section: created.section,
            fatherName: created.fatherName,
            category: 'Admission',
            feeMonth: firstMonth,
            paymentMode: input.admissionFeePaymentMode || 'Cash',
            amount: cleanAdmFee,
            date: created.admissionDate,
            remarks: `Admission Fee (${created.academicSession})`,
          }
        : null;

      const nextDb = commitDb((prev) => ({
        ...prev,
        counters: {
          ...prev.counters,
          studentSeq: seq + 1,
          receiptSeq: autoFeeReceipt ? nextReceiptSeq + 1 : prev.counters.receiptSeq,
        },
        students: [created, ...prev.students],
        fees: autoFeeReceipt ? [autoFeeReceipt, ...prev.fees] : prev.fees,
        lastUpdated: new Date().toISOString(),
      }));

      const preUploadedPhoto = created.photoDataUrl
        ? displayToStoredMediaRef.current.get(created.photoDataUrl)
        : '';
      const preUploadedAadhaar = created.aadhaarDocDataUrl
        ? displayToStoredMediaRef.current.get(created.aadhaarDocDataUrl)
        : '';

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        const emails = authorizedEmailsRef.current;

        const savedMedia = await saveStudentToCloud(
          schoolId,
          created,
          emails,
          ownerEmail,
          uid,
          {
            photoUrl: preUploadedPhoto,
            aadhaarDocUrl: preUploadedAadhaar,
          }
        );
        rawStudentUrlsRef.current[created.id] = savedMedia;

        if (autoFeeReceipt) {
          await saveFeeReceiptToCloud(schoolId, autoFeeReceipt, emails, ownerEmail, uid);
        }

        if (currentRoleRef.current === 'main_admin') {
          await saveSchoolConfigToCloud(
            schoolId,
            nextDb,
            emails,
            ownerEmail,
            uid,
            rawSchoolLogoUrlRef.current || undefined
          );
        } else {
          await saveAccountantCountersToCloud(
            schoolId,
            {
              studentSeq: nextDb.counters.studentSeq,
              receiptSeq: nextDb.counters.receiptSeq,
              billingCutoffMonth: nextDb.billingCutoffMonth,
            },
            uid
          );
        }
      });

      notify(
        'success',
        'Admission Synced to Cloud',
        autoFeeReceipt
          ? `${created.name} admitted (${created.admissionId}) & Receipt ${autoFeeReceipt.receiptNo} logged.`
          : `${created.name} admitted with ID ${created.admissionId}.`
      );
      return created;
    },
    [commitDb, notify, runCloudTask]
  );

  const updateStudent = useCallback(
    (id: string, input: AddStudentInput) => {
      if (
        currentRoleRef.current !== 'main_admin' &&
        currentRoleRef.current !== 'accountant'
      ) {
        notify('error', 'Permission Denied', 'Only Main Admin or Accountant can edit students.');
        return;
      }
      const current = dbRef.current;
      const existingStudent = current.students.find((s) => s.id === id);
      if (!existingStudent) return;

      if (
        existingStudent.status === 'Deactive' &&
        currentRoleRef.current !== 'main_admin'
      ) {
        notify(
          'error',
          'Main Admin Required',
          'Archived (Deactive) student records are locked. Ask the Main Admin to re-activate or modify this record.'
        );
        return;
      }

      const nameOrParentChanged =
        existingStudent.name.trim() !== input.name.trim() ||
        existingStudent.fatherName.trim() !== input.fatherName.trim();

      const cleanAdmFee =
        input.admissionType === 'Free' ? 0 : sanitizeNumber(input.admissionFee, 0);
      const cleanTuition = sanitizeNumber(input.monthlyTuitionFee, 0);
      const transportActive = Boolean(input.transportEnabled && input.routeId);
      const matchedRoute = transportActive
        ? current.routes.find((r) => r.id === input.routeId)
        : undefined;
      const cleanTransportFee = transportActive
        ? sanitizeNumber(matchedRoute ? matchedRoute.monthlyFare : input.transportFee, 0)
        : 0;

      const nextDb = commitDb((prev) => {
        const nowIso = new Date().toISOString();
        const students = prev.students.map((s) => {
          if (s.id !== id) return s;
          const nextStatus: StudentStatus =
            input.status !== undefined ? input.status : s.status || 'Active';
          const becameDeactive = nextStatus === 'Deactive' && s.status !== 'Deactive';
          return {
            ...s,
            rollNumber:
              input.rollNumber !== undefined ? input.rollNumber.trim() : s.rollNumber || '',
            status: nextStatus,
            deactivatedAt:
              nextStatus === 'Deactive'
                ? becameDeactive
                  ? nowIso
                  : s.deactivatedAt || nowIso
                : undefined,
            deactivatedReason:
              nextStatus === 'Deactive'
                ? input.deactivatedReason !== undefined
                  ? input.deactivatedReason.trim()
                  : s.deactivatedReason || ''
                : undefined,
            academicSession:
              input.academicSession || s.academicSession || prev.activeSession,
            admissionType: input.admissionType,
            admissionFee: cleanAdmFee,
            previousSchool: input.previousSchool.trim(),
            lastGradePassed: input.lastGradePassed.trim(),
            tcDetails: input.tcDetails.trim(),
            name: input.name.trim(),
            dob: input.dob,
            gender: input.gender,
            casteCategory: input.casteCategory,
            className: input.className,
            section: input.section,
            monthlyTuitionFee: cleanTuition,
            fatherName: input.fatherName.trim(),
            motherName: input.motherName.trim(),
            phone: input.phone.trim(),
            alternatePhone: input.alternatePhone.trim(),
            address: input.address.trim(),
            photoDataUrl: input.photoDataUrl || '',
            aadhaarNumber: input.aadhaarNumber.trim(),
            aadhaarDocDataUrl: input.aadhaarDocDataUrl || '',
            transportEnabled: transportActive,
            routeId: transportActive ? input.routeId : '',
            transportFee: cleanTransportFee,
            customNotes: input.customNotes.trim(),
            admissionDate: input.admissionDate || s.admissionDate,
          };
        });

        const updatedTarget = students.find((s) => s.id === id);
        const resolvedRoll = updatedTarget
          ? resolveStudentRollNumber(updatedTarget, students)
          : '';

        const fees = prev.fees.map((f) =>
          f.studentId === id
            ? {
                ...f,
                studentName: input.name.trim(),
                fatherName: input.fatherName.trim(),
              }
            : f
        );
        const grades =
          currentRoleRef.current === 'main_admin'
            ? prev.grades.map((g) =>
                g.studentId === id
                  ? {
                      ...g,
                      studentName: input.name.trim(),
                      fatherName: input.fatherName.trim(),
                      dob: input.dob,
                    }
                  : g
              )
            : prev.grades;
        const marksheets =
          currentRoleRef.current === 'main_admin'
            ? prev.marksheets.map((m) => {
                if (m.studentId !== id) return m;
                const isSameSession =
                  updatedTarget && m.academicSession === updatedTarget.academicSession;
                return {
                  ...m,
                  rollNumber: isSameSession ? resolvedRoll || m.rollNumber : m.rollNumber,
                  studentName: input.name.trim(),
                  className: isSameSession ? input.className : m.className,
                  section: isSameSession ? input.section : m.section,
                  fatherName: input.fatherName.trim(),
                  motherName: input.motherName.trim(),
                  dob: input.dob,
                };
              })
            : prev.marksheets;
        return {
          ...prev,
          students,
          fees,
          grades,
          marksheets,
          lastUpdated: nowIso,
        };
      });

      const updatedStu = nextDb.students.find((s) => s.id === id);
      const preUploadedPhoto = updatedStu
        ? updatedStu.photoDataUrl
          ? displayToStoredMediaRef.current.get(updatedStu.photoDataUrl)
          : ''
        : undefined;
      const preUploadedAadhaar = updatedStu
        ? updatedStu.aadhaarDocDataUrl
          ? displayToStoredMediaRef.current.get(updatedStu.aadhaarDocDataUrl)
          : ''
        : undefined;

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId || !updatedStu) return;
        const emails = authorizedEmailsRef.current;

        const savedMedia = await saveStudentToCloud(
          schoolId,
          updatedStu,
          emails,
          ownerEmail,
          uid,
          {
            photoUrl: preUploadedPhoto,
            aadhaarDocUrl: preUploadedAadhaar,
          }
        );
        rawStudentUrlsRef.current[id] = savedMedia;

        if (nameOrParentChanged) {
          for (const f of nextDb.fees.filter((item) => item.studentId === id)) {
            if (currentRoleRef.current === 'main_admin') {
              await saveFeeReceiptToCloud(schoolId, f, emails, ownerEmail, uid);
            } else {
              await updateFeeReceiptStudentNamesInCloud(
                schoolId,
                f.id,
                f.studentName,
                f.fatherName,
                uid
              );
            }
          }
        }

        if (currentRoleRef.current === 'main_admin') {
          for (const g of nextDb.grades.filter((item) => item.studentId === id)) {
            await saveGradeToCloud(schoolId, g, emails, ownerEmail, uid);
          }
          for (const m of nextDb.marksheets.filter((item) => item.studentId === id)) {
            await saveMarksheetToCloud(schoolId, m, emails, ownerEmail, uid);
          }
        }
      });

      notify('success', 'Student Profile Updated', `Saved changes for ${input.name.trim()}.`);
    },
    [commitDb, notify, runCloudTask]
  );

  const setStudentStatus = useCallback(
    (studentId: string, status: StudentStatus, reason?: string) => {
      if (
        currentRoleRef.current !== 'main_admin' &&
        currentRoleRef.current !== 'accountant'
      ) {
        notify('error', 'Permission Denied', 'Only Main Admin or Accountant can change status.');
        return;
      }
      const target = dbRef.current.students.find((s) => s.id === studentId);
      if (!target) return;

      if (target.status === 'Deactive' && currentRoleRef.current !== 'main_admin') {
        notify(
          'error',
          'Main Admin Required',
          'Only the Main Admin can re-activate an archived student.'
        );
        return;
      }

      const nowIso = new Date().toISOString();

      const nextDb = commitDb((prev) => ({
        ...prev,
        students: prev.students.map((s) =>
          s.id === studentId
            ? {
                ...s,
                status,
                deactivatedAt: status === 'Deactive' ? nowIso : undefined,
                deactivatedReason:
                  status === 'Deactive'
                    ? reason?.trim() || 'Left School / Archived'
                    : undefined,
              }
            : s
        ),
        lastUpdated: nowIso,
      }));

      const updated = nextDb.students.find((s) => s.id === studentId);
      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId || !updated) return;
        await saveStudentToCloud(
          schoolId,
          updated,
          authorizedEmailsRef.current,
          ownerEmail,
          uid,
          rawStudentUrlsRef.current[studentId]
        );
      });

      if (status === 'Deactive') {
        notify(
          'info',
          'Student Marked Deactive (Fee Frozen)',
          `${target.name} (${target.admissionId}) moved to Archive — ongoing monthly fee billing paused.`
        );
      } else {
        notify(
          'success',
          'Student Re-Activated',
          `${target.name} (${target.admissionId}) restored to active rosters and fee schedule.`
        );
      }
    },
    [commitDb, notify, runCloudTask]
  );

  const deleteStudent = useCallback(
    (id: string) => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can permanently delete students.');
        return;
      }
      const target = dbRef.current.students.find((s) => s.id === id);
      const orphanGradeIds = dbRef.current.grades
        .filter((g) => g.studentId === id)
        .map((g) => g.id);
      const orphanMarksheetIds = dbRef.current.marksheets
        .filter((m) => m.studentId === id)
        .map((m) => m.id);

      commitDb((prev) => ({
        ...prev,
        students: prev.students.filter((s) => s.id !== id),
        grades: prev.grades.filter((g) => g.studentId !== id),
        marksheets: prev.marksheets.filter((m) => m.studentId !== id),
        lastUpdated: new Date().toISOString(),
      }));

      runCloudTask(async () => {
        const schoolId = activeSchoolIdRef.current;
        if (!schoolId) return;
        for (const mId of orphanMarksheetIds) {
          await deleteMarksheetFromCloud(schoolId, mId);
        }
        for (const gId of orphanGradeIds) {
          await deleteGradeFromCloud(schoolId, gId);
        }
        await deleteStudentFromCloud(schoolId, id);
      });

      if (target) {
        notify(
          'info',
          'Admission Record Removed',
          `${target.name} (${target.admissionId}) removed from directory.`
        );
      }
    },
    [commitDb, notify, runCloudTask]
  );

  // =========================================================================
  // MODULE 2: FEES (MAIN ADMIN + ACCOUNTANT)
  // =========================================================================

  const collectFee = useCallback(
    (input: AddFeeInput): FeeRecord | null => {
      if (
        currentRoleRef.current !== 'main_admin' &&
        currentRoleRef.current !== 'accountant'
      ) {
        notify('error', 'Permission Denied', 'Only Main Admin or Accountant can collect fees.');
        return null;
      }
      const current = dbRef.current;
      const student = current.students.find((s) => s.id === input.studentId);
      if (!student) {
        notify('error', 'Student Not Found', 'Please select a valid admitted student.');
        return null;
      }
      const cleanAmount = sanitizeNumber(input.amount, 0);
      if (cleanAmount <= 0) {
        notify('error', 'Invalid Fee Amount', 'Fee amount must be greater than zero.');
        return null;
      }

      const seq = current.counters.receiptSeq;
      const created: FeeRecord = {
        id: `fee-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        receiptNo: `REC${seq}`,
        studentId: student.id,
        admissionId: student.admissionId,
        studentName: student.name,
        className: student.className,
        section: student.section,
        fatherName: student.fatherName,
        category: input.category,
        feeMonth: input.feeMonth,
        paymentMode: input.paymentMode,
        amount: cleanAmount,
        date: input.date || getTodayISO(),
        remarks: input.remarks?.trim() || '',
      };

      const nextDb = commitDb((prev) => ({
        ...prev,
        counters: { ...prev.counters, receiptSeq: seq + 1 },
        fees: [created, ...prev.fees],
        lastUpdated: new Date().toISOString(),
      }));

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        const emails = authorizedEmailsRef.current;
        await saveFeeReceiptToCloud(schoolId, created, emails, ownerEmail, uid);

        if (currentRoleRef.current === 'main_admin') {
          await saveSchoolConfigToCloud(
            schoolId,
            nextDb,
            emails,
            ownerEmail,
            uid,
            rawSchoolLogoUrlRef.current || undefined
          );
        } else {
          await saveAccountantCountersToCloud(
            schoolId,
            {
              studentSeq: nextDb.counters.studentSeq,
              receiptSeq: nextDb.counters.receiptSeq,
              billingCutoffMonth: nextDb.billingCutoffMonth,
            },
            uid
          );
        }
      });

      notify(
        'success',
        'Fee Receipt Generated',
        `${created.receiptNo} recorded for ${student.name}.`
      );
      return created;
    },
    [commitDb, notify, runCloudTask]
  );

  const deleteFee = useCallback(
    (id: string) => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can delete fee receipts.');
        return;
      }
      const target = dbRef.current.fees.find((f) => f.id === id);
      commitDb((prev) => ({
        ...prev,
        fees: prev.fees.filter((f) => f.id !== id),
        lastUpdated: new Date().toISOString(),
      }));
      runCloudTask(async () => {
        const schoolId = activeSchoolIdRef.current;
        if (!schoolId) return;
        await deleteFeeReceiptFromCloud(schoolId, id);
      });
      if (target) {
        notify('info', 'Receipt Deleted', `Receipt ${target.receiptNo} removed from ledger.`);
      }
    },
    [commitDb, notify, runCloudTask]
  );

  // =========================================================================
  // MODULE 3: TRANSPORT ROUTES (MAIN ADMIN ONLY)
  // =========================================================================

  const addRoute = useCallback(
    (input: AddRouteInput): TransportRoute => {
      const created: TransportRoute = {
        id: `rte-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        routeName: input.routeName.trim(),
        busNumber: input.busNumber.trim().toUpperCase(),
        pickupPoints: input.pickupPoints.trim(),
        monthlyFare: sanitizeNumber(input.monthlyFare, 0),
        driverName: input.driverName.trim(),
        driverPhone: input.driverPhone.trim(),
        createdAt: new Date().toISOString(),
      };
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can add transport routes.');
        return created;
      }
      commitDb((prev) => ({
        ...prev,
        routes: [created, ...prev.routes],
        lastUpdated: new Date().toISOString(),
      }));
      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        await saveRouteToCloud(
          schoolId,
          created,
          authorizedEmailsRef.current,
          ownerEmail,
          uid
        );
      });
      notify(
        'success',
        'Transport Route Added',
        `${created.routeName} (${created.busNumber}) is now active.`
      );
      return created;
    },
    [commitDb, notify, runCloudTask]
  );

  const updateRoute = useCallback(
    (id: string, input: AddRouteInput) => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can edit transport routes.');
        return;
      }
      const cleanFare = sanitizeNumber(input.monthlyFare, 0);
      const nextDb = commitDb((prev) => ({
        ...prev,
        routes: prev.routes.map((r) =>
          r.id === id
            ? {
                ...r,
                routeName: input.routeName.trim(),
                busNumber: input.busNumber.trim().toUpperCase(),
                pickupPoints: input.pickupPoints.trim(),
                monthlyFare: cleanFare,
                driverName: input.driverName.trim(),
                driverPhone: input.driverPhone.trim(),
              }
            : r
        ),
        students: prev.students.map((s) =>
          s.routeId === id && s.transportEnabled ? { ...s, transportFee: cleanFare } : s
        ),
        lastUpdated: new Date().toISOString(),
      }));

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        const emails = authorizedEmailsRef.current;
        const updatedRoute = nextDb.routes.find((r) => r.id === id);
        if (updatedRoute) {
          await saveRouteToCloud(schoolId, updatedRoute, emails, ownerEmail, uid);
        }
        for (const stu of nextDb.students.filter(
          (s) => s.routeId === id && s.transportEnabled
        )) {
          await saveStudentToCloud(
            schoolId,
            stu,
            emails,
            ownerEmail,
            uid,
            rawStudentUrlsRef.current[stu.id]
          );
        }
      });

      notify('success', 'Route Updated', `${input.routeName.trim()} updated.`);
    },
    [commitDb, notify, runCloudTask]
  );

  const deleteRoute = useCallback(
    (id: string) => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can delete transport routes.');
        return;
      }
      const target = dbRef.current.routes.find((r) => r.id === id);
      const affectedStudentIds = dbRef.current.students
        .filter((s) => s.routeId === id)
        .map((s) => s.id);

      const nextDb = commitDb((prev) => ({
        ...prev,
        routes: prev.routes.filter((r) => r.id !== id),
        students: prev.students.map((s) =>
          s.routeId === id ? { ...s, transportEnabled: false, routeId: '', transportFee: 0 } : s
        ),
        lastUpdated: new Date().toISOString(),
      }));

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        const emails = authorizedEmailsRef.current;
        for (const sid of affectedStudentIds) {
          const stu = nextDb.students.find((s) => s.id === sid);
          if (stu) {
            await saveStudentToCloud(
              schoolId,
              stu,
              emails,
              ownerEmail,
              uid,
              rawStudentUrlsRef.current[sid]
            );
          }
        }
        await deleteRouteFromCloud(schoolId, id);
      });

      if (target) {
        notify(
          'info',
          'Route Removed',
          `${target.routeName} removed and unlinked from student records.`
        );
      }
    },
    [commitDb, notify, runCloudTask]
  );

  // =========================================================================
  // MODULE 4: STAFF & FACULTY PROFILES (MAIN ADMIN ONLY)
  // =========================================================================

  const addCustomDesignation = useCallback(
    (postName: string): string | null => {
      if (currentRoleRef.current !== 'main_admin') return null;
      const clean = postName.trim();
      if (!clean) return null;

      const existingBuiltin = DEFAULT_STAFF_DESIGNATIONS.find(
        (d) => d.toLowerCase() === clean.toLowerCase()
      );
      if (existingBuiltin) return existingBuiltin;

      const existingCustom = dbRef.current.customDesignations.find(
        (d) => d.toLowerCase() === clean.toLowerCase()
      );
      if (existingCustom) return existingCustom;

      const nextDb = commitDb((prev) => ({
        ...prev,
        customDesignations: normalizeCustomDesignations([...prev.customDesignations, clean]),
        lastUpdated: new Date().toISOString(),
      }));

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        await saveSchoolConfigToCloud(
          schoolId,
          nextDb,
          authorizedEmailsRef.current,
          ownerEmail,
          uid,
          rawSchoolLogoUrlRef.current || undefined
        );
      });

      notify('success', 'Designation Added', `"${clean}" is now available in Staff Posts.`);
      return clean;
    },
    [commitDb, notify, runCloudTask]
  );

  const addStaff = useCallback(
    (input: AddStaffInput): StaffMember | null => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can register HR staff records.');
        return null;
      }
      const current = dbRef.current;
      let seq = current.counters.staffSeq;

      const requestedStaffId = input.staffId?.trim().toUpperCase() || '';
      let finalStaffId = requestedStaffId;

      if (finalStaffId) {
        const duplicate = current.staff.some(
          (m) => m.staffId.toLowerCase() === finalStaffId.toLowerCase()
        );
        if (duplicate) {
          notify(
            'error',
            'Duplicate Staff ID',
            `Employee / Registration No. "${finalStaffId}" is already assigned to another staff member.`
          );
          return null;
        }
        const matchNum = finalStaffId.match(/^STF(\d+)$/i);
        if (matchNum) {
          const num = Number(matchNum[1]);
          if (Number.isFinite(num) && num >= seq) {
            seq = num + 1;
          }
        }
      } else {
        while (current.staff.some((m) => m.staffId.toUpperCase() === `STF${seq}`)) {
          seq += 1;
        }
        finalStaffId = `STF${seq}`;
        seq += 1;
      }

      const cleanDesignation = input.designation.trim() || 'Teacher (Primary / PRT)';

      const created: StaffMember = {
        id: `stf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        staffId: finalStaffId,
        fullName: input.fullName.trim(),
        fatherOrSpouseName: input.fatherOrSpouseName.trim(),
        designation: cleanDesignation,
        assignedDepartment: input.assignedDepartment.trim(),
        qualification: input.qualification.trim(),
        monthlySalary: sanitizeNumber(input.monthlySalary, 0),
        address: input.address.trim(),
        phone: input.phone.trim(),
        emergencyContact: input.emergencyContact.trim(),
        joinedDate: input.joinedDate || getTodayISO(),
        photoDataUrl: input.photoDataUrl || '',
      };

      const nextDb = commitDb((prev) => ({
        ...prev,
        counters: { ...prev.counters, staffSeq: seq },
        customDesignations: normalizeCustomDesignations([
          ...prev.customDesignations,
          cleanDesignation,
        ]),
        staff: [created, ...prev.staff],
        lastUpdated: new Date().toISOString(),
      }));

      const preUploadedPhoto = created.photoDataUrl
        ? displayToStoredMediaRef.current.get(created.photoDataUrl)
        : '';

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        const emails = authorizedEmailsRef.current;
        const savedUrl = await saveStaffToCloud(
          schoolId,
          created,
          emails,
          ownerEmail,
          uid,
          preUploadedPhoto
        );
        rawStaffPhotoUrlsRef.current[created.id] = savedUrl;
        await saveSchoolConfigToCloud(
          schoolId,
          nextDb,
          emails,
          ownerEmail,
          uid,
          rawSchoolLogoUrlRef.current || undefined
        );
      });

      notify(
        'success',
        'Staff Member Registered',
        `${created.fullName} (${created.staffId} — ${created.designation}) synced to cloud. Staff ID Card ready!`
      );
      return created;
    },
    [commitDb, notify, runCloudTask]
  );

  const updateStaff = useCallback(
    (id: string, input: AddStaffInput): boolean => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can edit staff profiles.');
        return false;
      }
      const current = dbRef.current;
      const existing = current.staff.find((m) => m.id === id);
      if (!existing) {
        notify('error', 'Staff Not Found', 'Selected staff profile could not be found.');
        return false;
      }

      const finalStaffId = input.staffId?.trim().toUpperCase() || existing.staffId;
      const duplicate = current.staff.some(
        (m) => m.id !== id && m.staffId.toLowerCase() === finalStaffId.toLowerCase()
      );
      if (duplicate) {
        notify(
          'error',
          'Duplicate Staff ID',
          `Employee / Registration No. "${finalStaffId}" is already assigned to another staff member.`
        );
        return false;
      }

      const cleanDesignation = input.designation.trim() || existing.designation;

      const nextDb = commitDb((prev) => ({
        ...prev,
        customDesignations: normalizeCustomDesignations([
          ...prev.customDesignations,
          cleanDesignation,
        ]),
        staff: prev.staff.map((m) =>
          m.id === id
            ? {
                ...m,
                staffId: finalStaffId,
                fullName: input.fullName.trim(),
                fatherOrSpouseName: input.fatherOrSpouseName.trim(),
                designation: cleanDesignation,
                assignedDepartment: input.assignedDepartment.trim(),
                qualification: input.qualification.trim(),
                monthlySalary: sanitizeNumber(input.monthlySalary, 0),
                address: input.address.trim(),
                phone: input.phone.trim(),
                emergencyContact: input.emergencyContact.trim(),
                joinedDate: input.joinedDate || m.joinedDate || getTodayISO(),
                photoDataUrl: input.photoDataUrl || '',
              }
            : m
        ),
        lastUpdated: new Date().toISOString(),
      }));

      const updatedMember = nextDb.staff.find((m) => m.id === id);
      const preUploadedPhoto = updatedMember
        ? updatedMember.photoDataUrl
          ? displayToStoredMediaRef.current.get(updatedMember.photoDataUrl)
          : ''
        : undefined;

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId || !updatedMember) return;
        const emails = authorizedEmailsRef.current;
        const savedUrl = await saveStaffToCloud(
          schoolId,
          updatedMember,
          emails,
          ownerEmail,
          uid,
          preUploadedPhoto
        );
        rawStaffPhotoUrlsRef.current[id] = savedUrl;
        await saveSchoolConfigToCloud(
          schoolId,
          nextDb,
          emails,
          ownerEmail,
          uid,
          rawSchoolLogoUrlRef.current || undefined
        );
      });

      notify(
        'success',
        'Staff Profile Updated',
        `Saved updated details & ID Card data for ${input.fullName.trim()} (${finalStaffId}).`
      );
      return true;
    },
    [commitDb, notify, runCloudTask]
  );

  const deleteStaff = useCallback(
    (id: string) => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can delete staff profiles.');
        return;
      }
      const target = dbRef.current.staff.find((m) => m.id === id);
      commitDb((prev) => ({
        ...prev,
        staff: prev.staff.filter((m) => m.id !== id),
        lastUpdated: new Date().toISOString(),
      }));
      runCloudTask(async () => {
        const schoolId = activeSchoolIdRef.current;
        if (!schoolId) return;
        await deleteStaffFromCloud(schoolId, id);
      });
      if (target) {
        notify(
          'info',
          'Staff Removed',
          `${target.fullName} (${target.staffId}) removed from faculty directory.`
        );
      }
    },
    [commitDb, notify, runCloudTask]
  );

  // =========================================================================
  // MODULE 5: CLASSES & SECTIONS (MAIN ADMIN ONLY)
  // =========================================================================

  const addClassAllocation = useCallback(
    (className: string, sections: string[], sectionCapacity: number): boolean => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can add classes.');
        return false;
      }
      const cleanName = className.trim();
      if (!cleanName) return false;
      const exists = dbRef.current.classes.some(
        (c) => c.className.toLowerCase() === cleanName.toLowerCase()
      );
      if (exists) {
        notify(
          'error',
          'Duplicate Class',
          `Class "${cleanName}" already exists in the allocation grid.`
        );
        return false;
      }
      const cleanSections = Array.from(
        new Set(
          sections
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean)
        )
      );
      const finalSections = cleanSections.length > 0 ? cleanSections : ['A'];
      const newClass: ClassAllocation = {
        id: `cls-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        className: cleanName,
        sections: finalSections,
        sectionCapacity: sanitizeNumber(sectionCapacity, 5, 200),
        isDefault: false,
      };
      const base = getDefaultClassFeeBase(cleanName);
      let newFeeRates: ClassSessionFeeRate[] = [];

      commitDb((prev) => {
        const sessionNames = prev.sessions.map((s) => s.name);
        newFeeRates = sessionNames.map((session) => ({
          className: cleanName,
          academicSession: session,
          admissionFee: base.admissionFee,
          monthlyTuitionFee: base.monthlyTuitionFee,
          annualExamFee: base.annualExamFee,
        }));
        return {
          ...prev,
          classes: [...prev.classes, newClass],
          feeSchedules: [...prev.feeSchedules, ...newFeeRates],
          lastUpdated: new Date().toISOString(),
        };
      });

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        const emails = authorizedEmailsRef.current;
        await saveClassAllocationToCloud(schoolId, newClass, emails, ownerEmail, uid);
        for (const rate of newFeeRates) {
          await saveFeeScheduleToCloud(schoolId, rate, emails, ownerEmail, uid);
        }
      });

      notify(
        'success',
        'Class Allocated',
        `Class ${cleanName} (${finalSections.join(', ')}) added.`
      );
      return true;
    },
    [commitDb, notify, runCloudTask]
  );

  const addSectionToClass = useCallback(
    (classId: string, sectionName: string): boolean => {
      if (currentRoleRef.current !== 'main_admin') return false;
      const cleanSec = sectionName.trim().toUpperCase();
      if (!cleanSec) return false;
      const target = dbRef.current.classes.find((c) => c.id === classId);
      if (!target) return false;
      if (target.sections.includes(cleanSec)) {
        notify(
          'error',
          'Duplicate Section',
          `Section ${cleanSec} already exists in Class ${target.className}.`
        );
        return false;
      }
      const nextDb = commitDb((prev) => ({
        ...prev,
        classes: prev.classes.map((c) =>
          c.id === classId ? { ...c, sections: [...c.sections, cleanSec] } : c
        ),
        lastUpdated: new Date().toISOString(),
      }));

      const updatedCls = nextDb.classes.find((c) => c.id === classId);
      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId || !updatedCls) return;
        await saveClassAllocationToCloud(
          schoolId,
          updatedCls,
          authorizedEmailsRef.current,
          ownerEmail,
          uid
        );
      });

      notify('success', 'Section Added', `Section ${cleanSec} added to Class ${target.className}.`);
      return true;
    },
    [commitDb, notify, runCloudTask]
  );

  const removeSectionFromClass = useCallback(
    (classId: string, sectionName: string) => {
      if (currentRoleRef.current !== 'main_admin') return;
      const nextDb = commitDb((prev) => ({
        ...prev,
        classes: prev.classes.map((c) => {
          if (c.id !== classId || c.sections.length <= 1) return c;
          return { ...c, sections: c.sections.filter((s) => s !== sectionName) };
        }),
        lastUpdated: new Date().toISOString(),
      }));
      const updatedCls = nextDb.classes.find((c) => c.id === classId);
      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId || !updatedCls) return;
        await saveClassAllocationToCloud(
          schoolId,
          updatedCls,
          authorizedEmailsRef.current,
          ownerEmail,
          uid
        );
      });
    },
    [commitDb, runCloudTask]
  );

  const updateClassCapacity = useCallback(
    (classId: string, capacity: number) => {
      if (currentRoleRef.current !== 'main_admin') return;
      const cleanCap = sanitizeNumber(capacity, 5, 250);
      const nextDb = commitDb((prev) => ({
        ...prev,
        classes: prev.classes.map((c) =>
          c.id === classId ? { ...c, sectionCapacity: cleanCap } : c
        ),
        lastUpdated: new Date().toISOString(),
      }));
      const updatedCls = nextDb.classes.find((c) => c.id === classId);
      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId || !updatedCls) return;
        await saveClassAllocationToCloud(
          schoolId,
          updatedCls,
          authorizedEmailsRef.current,
          ownerEmail,
          uid
        );
      });
      notify('success', 'Capacity Updated', `Section capacity updated to ${cleanCap} students.`);
    },
    [commitDb, notify, runCloudTask]
  );

  const deleteClassAllocation = useCallback(
    (classId: string) => {
      if (currentRoleRef.current !== 'main_admin') return;
      const target = dbRef.current.classes.find((c) => c.id === classId);
      const removedSchedules = target
        ? dbRef.current.feeSchedules.filter((f) => f.className === target.className)
        : [];
      commitDb((prev) => ({
        ...prev,
        classes: prev.classes.filter((c) => c.id !== classId),
        feeSchedules: target
          ? prev.feeSchedules.filter((f) => f.className !== target.className)
          : prev.feeSchedules,
        lastUpdated: new Date().toISOString(),
      }));
      runCloudTask(async () => {
        const schoolId = activeSchoolIdRef.current;
        if (!schoolId) return;
        await deleteClassAllocationFromCloud(schoolId, classId);
        for (const fs of removedSchedules) {
          await deleteFeeScheduleFromCloud(schoolId, fs.className, fs.academicSession);
        }
      });
      notify('info', 'Class Removed', 'Class allocation removed.');
    },
    [commitDb, notify, runCloudTask]
  );

  // =========================================================================
  // MODULE 6: ATTENDANCE (MAIN ADMIN + TEACHER)
  // =========================================================================

  const saveAttendanceSheet = useCallback(
    (
      date: string,
      className: string,
      section: string,
      entries: Record<string, AttendanceStatus>,
      notes: Record<string, string>
    ): DailyAttendanceSheet => {
      const key = `${date}__${className}__${section}`;
      const sheet: DailyAttendanceSheet = {
        key,
        date,
        className,
        section,
        entries: { ...entries },
        notes: { ...notes },
        updatedAt: new Date().toISOString(),
        markedBy: currentUserEmail || 'Staff',
      };
      if (
        currentRoleRef.current !== 'main_admin' &&
        currentRoleRef.current !== 'teacher'
      ) {
        notify(
          'error',
          'Permission Denied',
          'Only Main Admin or Teacher accounts can mark attendance.'
        );
        return sheet;
      }
      commitDb((prev) => ({
        ...prev,
        attendance: {
          ...prev.attendance,
          [key]: sheet,
        },
        lastUpdated: new Date().toISOString(),
      }));
      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        await saveAttendanceSheetToCloud(
          schoolId,
          sheet,
          authorizedEmailsRef.current,
          ownerEmail,
          uid
        );
      });
      notify(
        'success',
        'Attendance Saved',
        `Register saved for Class ${className} (${
          section === 'ALL' ? 'All Sections' : `Sec ${section}`
        }) on ${date}.`
      );
      return sheet;
    },
    [commitDb, currentUserEmail, notify, runCloudTask]
  );

  // =========================================================================
  // MODULE 7: COMPREHENSIVE EXAM MANAGEMENT (SCHEDULES: ADMIN; MARKS: ADMIN + TEACHER)
  // =========================================================================

  const createExam = useCallback(
    (input: SaveExamInput): ExamDefinition | null => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can create exam schedules.');
        return null;
      }
      const cleanName = input.examName.trim();
      if (!cleanName) {
        notify('error', 'Exam Name Required', 'Please enter a valid examination title.');
        return null;
      }
      if (!input.subjects || input.subjects.length === 0) {
        notify('error', 'Subjects Required', 'Map at least one subject schedule to create an exam.');
        return null;
      }

      const mappedSubjects: ExamSubjectSchedule[] = [];
      for (let i = 0; i < input.subjects.length; i++) {
        const sub = input.subjects[i];
        const sName = sub.subjectName.trim();
        if (!sName) {
          notify('error', 'Subject Name Missing', `Enter a subject name for row #${i + 1}.`);
          return null;
        }
        const maxM = Number(sub.maxMarks);
        const minM = Number(sub.minMarks);
        if (!Number.isFinite(maxM) || maxM <= 0) {
          notify(
            'error',
            'Invalid Maximum Marks',
            `Maximum marks for ${sName} must be greater than 0.`
          );
          return null;
        }
        if (!Number.isFinite(minM) || minM < 0 || minM > maxM) {
          notify(
            'error',
            'Invalid Passing Marks',
            `Minimum passing marks for ${sName} must be between 0 and ${maxM}.`
          );
          return null;
        }
        if (!sub.examDate) {
          notify('error', 'Exam Date Missing', `Select an exam date for ${sName}.`);
          return null;
        }
        mappedSubjects.push({
          id: sub.id || `sub-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
          subjectName: sName,
          subjectCode: sub.subjectCode.trim().toUpperCase(),
          maxMarks: Math.round(maxM * 100) / 100,
          minMarks: Math.round(minM * 100) / 100,
          examDate: sub.examDate,
          startTime: sub.startTime || '09:00',
          endTime: sub.endTime || '12:00',
        });
      }

      const current = dbRef.current;
      const seq = current.counters.examSeq;
      const nowIso = new Date().toISOString();
      const defaultCenter = `${
        current.schoolProfile.schoolName || 'School'
      } — Main Campus`;
      const created: ExamDefinition = {
        id: `exm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        examCode: `EXM${seq}`,
        examName: cleanName,
        academicSession: input.academicSession || current.activeSession || '2026-2027',
        className: input.className,
        examCenter: input.examCenter.trim() || defaultCenter,
        instructions: input.instructions.trim() || DEFAULT_EXAM_INSTRUCTIONS,
        subjects: sortExamSubjects(mappedSubjects),
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const nextDb = commitDb((prev) => ({
        ...prev,
        counters: { ...prev.counters, examSeq: seq + 1 },
        exams: [created, ...prev.exams],
        lastUpdated: nowIso,
      }));

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        const emails = authorizedEmailsRef.current;
        await saveExamToCloud(schoolId, created, emails, ownerEmail, uid);
        await saveSchoolConfigToCloud(
          schoolId,
          nextDb,
          emails,
          ownerEmail,
          uid,
          rawSchoolLogoUrlRef.current || undefined
        );
      });

      notify(
        'success',
        'Exam & Schedule Created',
        `${created.examName} (Class ${created.className}) published — Admit Cards are now live.`
      );
      return created;
    },
    [commitDb, notify, runCloudTask]
  );

  const updateExam = useCallback(
    (examId: string, input: SaveExamInput): ExamDefinition | null => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can edit exam schedules.');
        return null;
      }
      const current = dbRef.current;
      const existing = current.exams.find((e) => e.id === examId);
      if (!existing) {
        notify('error', 'Exam Not Found', 'The selected examination could not be located.');
        return null;
      }
      const cleanName = input.examName.trim();
      if (!cleanName || input.subjects.length === 0) {
        notify(
          'error',
          'Validation Error',
          'Exam name and at least one subject schedule are required.'
        );
        return null;
      }

      const mappedSubjects: ExamSubjectSchedule[] = [];
      for (let i = 0; i < input.subjects.length; i++) {
        const sub = input.subjects[i];
        const sName = sub.subjectName.trim();
        const maxM = Number(sub.maxMarks);
        const minM = Number(sub.minMarks);
        if (
          !sName ||
          !Number.isFinite(maxM) ||
          maxM <= 0 ||
          !Number.isFinite(minM) ||
          minM < 0 ||
          minM > maxM
        ) {
          notify(
            'error',
            'Invalid Subject Configuration',
            `Check subject name and marks range on row #${i + 1}.`
          );
          return null;
        }
        mappedSubjects.push({
          id: sub.id || `sub-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
          subjectName: sName,
          subjectCode: sub.subjectCode.trim().toUpperCase(),
          maxMarks: Math.round(maxM * 100) / 100,
          minMarks: Math.round(minM * 100) / 100,
          examDate: sub.examDate || getTodayISO(),
          startTime: sub.startTime || '09:00',
          endTime: sub.endTime || '12:00',
        });
      }

      const nowIso = new Date().toISOString();
      const defaultCenter = `${
        current.schoolProfile.schoolName || 'School'
      } — Main Campus`;
      const updatedExam: ExamDefinition = {
        ...existing,
        examName: cleanName,
        academicSession: input.academicSession || existing.academicSession,
        className: input.className,
        examCenter: input.examCenter.trim() || defaultCenter,
        instructions: input.instructions.trim() || DEFAULT_EXAM_INSTRUCTIONS,
        subjects: sortExamSubjects(mappedSubjects),
        updatedAt: nowIso,
      };

      const nextDb = commitDb((prev) => {
        const nextMarksheets = prev.marksheets
          .map((m) => {
            if (m.examId !== examId) return m;
            const stu = prev.students.find((s) => s.id === m.studentId);
            if (!stu) return m;

            const scoresMap: Record<string, RawSubjectMarkInput> = {};
            updatedExam.subjects.forEach((sub) => {
              const prevSubEntry =
                m.subjectMarks.find((sm) => sm.subjectId === sub.id) ||
                m.subjectMarks.find(
                  (sm) => sm.subjectName.toLowerCase() === sub.subjectName.toLowerCase()
                );
              scoresMap[sub.id] = {
                marksObtained: prevSubEntry
                  ? Math.min(prevSubEntry.marksObtained, sub.maxMarks)
                  : 0,
                isAbsent: prevSubEntry ? prevSubEntry.isAbsent : false,
              };
            });

            const rollNo = m.rollNumber || resolveStudentRollNumber(stu, prev.students);
            const rebuilt = buildValidatedMarksheet({
              existingId: m.id,
              exam: updatedExam,
              student: {
                ...stu,
                className: m.className || stu.className,
                section: m.section || stu.section,
              },
              rollNumber: rollNo,
              scoresBySubjectId: scoresMap,
              customRemarks: m.customRemarks,
            });
            return rebuilt.ok && rebuilt.marksheet ? rebuilt.marksheet : m;
          })
          .filter((item): item is StudentExamMarksheet => Boolean(item));

        return {
          ...prev,
          exams: prev.exams.map((e) => (e.id === examId ? updatedExam : e)),
          marksheets: nextMarksheets,
          lastUpdated: nowIso,
        };
      });

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        const emails = authorizedEmailsRef.current;
        await saveExamToCloud(schoolId, updatedExam, emails, ownerEmail, uid);
        for (const ms of nextDb.marksheets.filter((m) => m.examId === examId)) {
          await saveMarksheetToCloud(schoolId, ms, emails, ownerEmail, uid);
        }
      });

      notify('success', 'Exam Schedule Updated', `${updatedExam.examName} updated.`);
      return updatedExam;
    },
    [commitDb, notify, runCloudTask]
  );

  const deleteExam = useCallback(
    (examId: string) => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can delete exams.');
        return;
      }
      const target = dbRef.current.exams.find((e) => e.id === examId);
      const removedMarksheetIds = dbRef.current.marksheets
        .filter((m) => m.examId === examId)
        .map((m) => m.id);

      commitDb((prev) => ({
        ...prev,
        exams: prev.exams.filter((e) => e.id !== examId),
        marksheets: prev.marksheets.filter((m) => m.examId !== examId),
        lastUpdated: new Date().toISOString(),
      }));

      runCloudTask(async () => {
        const schoolId = activeSchoolIdRef.current;
        if (!schoolId) return;
        for (const msId of removedMarksheetIds) {
          await deleteMarksheetFromCloud(schoolId, msId);
        }
        await deleteExamFromCloud(schoolId, examId);
      });

      if (target) {
        notify(
          'info',
          'Exam Removed',
          `${target.examName} (Class ${target.className}) and its marksheets were deleted.`
        );
      }
    },
    [commitDb, notify, runCloudTask]
  );

  const saveStudentMarksheet = useCallback(
    (
      input: SaveStudentMarksheetInput
    ): { ok: boolean; marksheet?: StudentExamMarksheet; error?: string } => {
      if (
        currentRoleRef.current !== 'main_admin' &&
        currentRoleRef.current !== 'teacher'
      ) {
        return {
          ok: false,
          error: 'Only Main Admin or Teacher accounts can upload exam marks.',
        };
      }
      const current = dbRef.current;
      const exam = current.exams.find((e) => e.id === input.examId);
      if (!exam) {
        return { ok: false, error: 'Selected exam schedule does not exist.' };
      }
      const student = current.students.find((s) => s.id === input.studentId);
      if (!student) {
        return { ok: false, error: 'Selected student record was not found.' };
      }

      const existing = current.marksheets.find(
        (m) => m.examId === exam.id && m.studentId === student.id
      );
      const rollNo = resolveStudentRollNumber(student, current.students);

      const validation = buildValidatedMarksheet({
        existingId: existing?.id,
        exam,
        student,
        rollNumber: rollNo,
        scoresBySubjectId: input.scoresBySubjectId,
        customRemarks: input.customRemarks,
      });

      if (!validation.ok || !validation.marksheet) {
        return { ok: false, error: validation.error || 'Could not validate marks.' };
      }

      const savedMarksheet = validation.marksheet;

      commitDb((prev) => {
        const idx = prev.marksheets.findIndex((m) => m.id === savedMarksheet.id);
        const nextList =
          idx >= 0
            ? prev.marksheets.map((m, i) => (i === idx ? savedMarksheet : m))
            : [savedMarksheet, ...prev.marksheets];
        return {
          ...prev,
          marksheets: nextList,
          lastUpdated: new Date().toISOString(),
        };
      });

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        await saveMarksheetToCloud(
          schoolId,
          savedMarksheet,
          authorizedEmailsRef.current,
          ownerEmail,
          uid
        );
      });

      notify(
        'success',
        'Marksheet Saved',
        `${student.name}: ${savedMarksheet.totalObtained}/${savedMarksheet.totalMaxMarks} (${savedMarksheet.percentage}%) — ${
          savedMarksheet.passed ? 'PASSED' : 'FAILED'
        }`
      );
      return { ok: true, marksheet: savedMarksheet };
    },
    [commitDb, notify, runCloudTask]
  );

  const saveBulkExamMarksheets = useCallback(
    (
      examId: string,
      entries: BulkStudentMarksInput[]
    ): { ok: boolean; savedCount: number; error?: string } => {
      if (
        currentRoleRef.current !== 'main_admin' &&
        currentRoleRef.current !== 'teacher'
      ) {
        return {
          ok: false,
          savedCount: 0,
          error: 'Only Main Admin or Teacher accounts can upload exam marks.',
        };
      }
      const current = dbRef.current;
      const exam = current.exams.find((e) => e.id === examId);
      if (!exam) {
        return { ok: false, savedCount: 0, error: 'Selected exam schedule not found.' };
      }
      if (entries.length === 0) {
        return { ok: false, savedCount: 0, error: 'No student marks entered to save.' };
      }

      const validatedBatch: StudentExamMarksheet[] = [];
      for (const item of entries) {
        const student = current.students.find((s) => s.id === item.studentId);
        if (!student) continue;

        const existing = current.marksheets.find(
          (m) => m.examId === exam.id && m.studentId === student.id
        );
        const rollNo = resolveStudentRollNumber(student, current.students);

        const res = buildValidatedMarksheet({
          existingId: existing?.id,
          exam,
          student,
          rollNumber: rollNo,
          scoresBySubjectId: item.scoresBySubjectId,
          customRemarks:
            item.customRemarks !== undefined ? item.customRemarks : existing?.customRemarks,
        });

        if (!res.ok || !res.marksheet) {
          return {
            ok: false,
            savedCount: 0,
            error: res.error || `Validation failed for ${student.name}.`,
          };
        }
        validatedBatch.push(res.marksheet);
      }

      commitDb((prev) => {
        const byKey = new Map<string, StudentExamMarksheet>();
        prev.marksheets.forEach((m) => byKey.set(`${m.examId}__${m.studentId}`, m));
        validatedBatch.forEach((m) => byKey.set(`${m.examId}__${m.studentId}`, m));
        return {
          ...prev,
          marksheets: Array.from(byKey.values()),
          lastUpdated: new Date().toISOString(),
        };
      });

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        const emails = authorizedEmailsRef.current;
        for (const ms of validatedBatch) {
          await saveMarksheetToCloud(schoolId, ms, emails, ownerEmail, uid);
        }
      });

      notify(
        'success',
        'Class Marks Uploaded to Cloud',
        `Saved & generated automated marksheets for ${validatedBatch.length} ${
          validatedBatch.length === 1 ? 'student' : 'students'
        }.`
      );
      return { ok: true, savedCount: validatedBatch.length };
    },
    [commitDb, notify, runCloudTask]
  );

  const deleteStudentMarksheet = useCallback(
    (marksheetId: string) => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can delete marksheets.');
        return;
      }
      const target = dbRef.current.marksheets.find((m) => m.id === marksheetId);
      commitDb((prev) => ({
        ...prev,
        marksheets: prev.marksheets.filter((m) => m.id !== marksheetId),
        lastUpdated: new Date().toISOString(),
      }));
      runCloudTask(async () => {
        const schoolId = activeSchoolIdRef.current;
        if (!schoolId) return;
        await deleteMarksheetFromCloud(schoolId, marksheetId);
      });
      if (target) {
        notify(
          'info',
          'Marksheet Deleted',
          `Removed ${target.examName} marksheet for ${target.studentName}.`
        );
      }
    },
    [commitDb, notify, runCloudTask]
  );

  const saveGradeRecord = useCallback(
    (input: AddGradeInput, existingId?: string): ExamGradeRecord | null => {
      if (
        currentRoleRef.current !== 'main_admin' &&
        currentRoleRef.current !== 'teacher'
      ) {
        notify('error', 'Permission Denied', 'Only Main Admin or Teacher can record grades.');
        return null;
      }
      const current = dbRef.current;
      const student = current.students.find((s) => s.id === input.studentId);
      if (!student) {
        notify(
          'error',
          'Student Required',
          'Please select a student from the admissions directory.'
        );
        return null;
      }
      const english = sanitizeNumber(input.english, 0, 100);
      const hindi = sanitizeNumber(input.hindi, 0, 100);
      const maths = sanitizeNumber(input.maths, 0, 100);
      const science = sanitizeNumber(input.science, 0, 100);
      const total = english + hindi + maths + science;
      const percentage = Number(((total / 400) * 100).toFixed(2));
      const passed = percentage >= 33;

      const duplicateIdx = current.grades.findIndex(
        (g) =>
          (existingId && g.id === existingId) ||
          (!existingId && g.studentId === student.id && g.term === input.term)
      );

      const saved: ExamGradeRecord = {
        id:
          duplicateIdx >= 0
            ? current.grades[duplicateIdx].id
            : `grd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        studentId: student.id,
        admissionId: student.admissionId,
        studentName: student.name,
        className: student.className,
        section: student.section,
        fatherName: student.fatherName,
        dob: student.dob,
        term: input.term,
        english,
        hindi,
        maths,
        science,
        total,
        percentage,
        passed,
        recordedAt: new Date().toISOString(),
      };

      commitDb((prev) => {
        const idx = prev.grades.findIndex((g) => g.id === saved.id);
        const nextGrades =
          idx >= 0
            ? prev.grades.map((g, i) => (i === idx ? saved : g))
            : [saved, ...prev.grades];
        return {
          ...prev,
          grades: nextGrades,
          lastUpdated: new Date().toISOString(),
        };
      });

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        await saveGradeToCloud(
          schoolId,
          saved,
          authorizedEmailsRef.current,
          ownerEmail,
          uid
        );
      });

      notify(
        'success',
        'Marks Logged',
        `${student.name} scored ${total}/400 (${percentage}%) in ${input.term}.`
      );
      return saved;
    },
    [commitDb, notify, runCloudTask]
  );

  const deleteGradeRecord = useCallback(
    (id: string) => {
      if (currentRoleRef.current !== 'main_admin') return;
      commitDb((prev) => ({
        ...prev,
        grades: prev.grades.filter((g) => g.id !== id),
        lastUpdated: new Date().toISOString(),
      }));
      runCloudTask(async () => {
        const schoolId = activeSchoolIdRef.current;
        if (!schoolId) return;
        await deleteGradeFromCloud(schoolId, id);
      });
      notify('info', 'Grade Entry Removed', 'Examination mark record deleted.');
    },
    [commitDb, notify, runCloudTask]
  );

  // =========================================================================
  // MODULE 8: NOTICES (MAIN ADMIN ONLY)
  // =========================================================================

  const addNotice = useCallback(
    (input: AddNoticeInput): NoticeItem => {
      const created: NoticeItem = {
        id: `ntc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: input.title.trim(),
        body: input.body.trim(),
        category: input.category,
        postedBy: currentUserEmail || 'Administration',
        createdAt: new Date().toISOString(),
      };
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can publish notices.');
        return created;
      }
      commitDb((prev) => ({
        ...prev,
        notices: [created, ...prev.notices],
        lastUpdated: new Date().toISOString(),
      }));
      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || '';
        if (!uid || !schoolId) return;
        await saveNoticeToCloud(
          schoolId,
          created,
          authorizedEmailsRef.current,
          ownerEmail,
          uid
        );
      });
      notify(
        'success',
        'Notice Broadcasted',
        `"${created.title}" published to digital notice board.`
      );
      return created;
    },
    [commitDb, currentUserEmail, notify, runCloudTask]
  );

  const deleteNotice = useCallback(
    (id: string) => {
      if (currentRoleRef.current !== 'main_admin') {
        notify('error', 'Main Admin Required', 'Only the Main Admin can delete notices.');
        return;
      }
      commitDb((prev) => ({
        ...prev,
        notices: prev.notices.filter((n) => n.id !== id),
        lastUpdated: new Date().toISOString(),
      }));
      runCloudTask(async () => {
        const schoolId = activeSchoolIdRef.current;
        if (!schoolId) return;
        await deleteNoticeFromCloud(schoolId, id);
      });
      notify('info', 'Notice Deleted', 'Announcement removed from notice board.');
    },
    [commitDb, notify, runCloudTask]
  );

  // =========================================================================
  // MODULE 9: FULL BACKUP (JSON + EXCEL) & CLOUD RESTORE / RESET (MAIN ADMIN)
  // =========================================================================

  const exportBackupJson = useCallback((): string => {
    const payload = {
      schoolId: activeSchoolIdRef.current,
      school: dbRef.current.schoolProfile.schoolName || 'School Workspace',
      projectId: FIREBASE_PROJECT_ID,
      firestoreDatabaseId: FIRESTORE_DATABASE_ID,
      exportedAt: new Date().toISOString(),
      exportedBy: currentUserEmail,
      authorizedStaffEmails: authorizedEmailsRef.current,
      database: dbRef.current,
    };
    return JSON.stringify(payload, null, 2);
  }, [currentUserEmail]);

  const exportBackupExcel = useCallback((): string => {
    const stuUrls: Record<string, string> = {};
    Object.entries(rawStudentUrlsRef.current).forEach(([sid, pair]) => {
      if (pair.photoUrl) stuUrls[sid] = pair.photoUrl;
    });
    return downloadFullBackupExcel(
      dbRef.current,
      authorizedEmailsRef.current,
      currentUserEmail,
      {
        studentPhotoUrls: stuUrls,
        staffPhotoUrls: rawStaffPhotoUrlsRef.current,
        schoolLogoUrl: rawSchoolLogoUrlRef.current,
      }
    );
  }, [currentUserEmail]);

  const importBackupJson = useCallback(
    (jsonText: string): { ok: boolean; error?: string } => {
      if (currentRoleRef.current !== 'main_admin') {
        return { ok: false, error: 'Only the Main Admin can restore JSON backups.' };
      }
      try {
        const parsed = JSON.parse(jsonText);
        const source: Partial<SchoolDatabase> = parsed.database ? parsed.database : parsed;
        if (
          !source ||
          typeof source !== 'object' ||
          !Array.isArray(source.students) ||
          !Array.isArray(source.fees)
        ) {
          return { ok: false, error: 'Invalid school database backup file format.' };
        }
        const classes =
          Array.isArray(source.classes) && source.classes.length > 0
            ? source.classes
            : DEFAULT_CLASSES.map((c) => ({ ...c, sections: [...c.sections] }));
        const { sessions, activeSession } = normalizeSessions(
          source.sessions,
          source.activeSession
        );
        const schoolProfile = normalizeSchoolProfile(source.schoolProfile);

        const hydrated: SchoolDatabase = {
          version: 8,
          counters: {
            studentSeq: sanitizeNumber(source.counters?.studentSeq ?? 1001, 1001),
            receiptSeq: sanitizeNumber(source.counters?.receiptSeq ?? 90001, 90001),
            staffSeq: sanitizeNumber(source.counters?.staffSeq ?? 101, 101),
            examSeq: sanitizeNumber(source.counters?.examSeq ?? 101, 101),
          },
          sessions,
          activeSession,
          schoolProfile,
          billingCutoffMonth:
            source.billingCutoffMonth && CALENDAR_MONTHS.includes(source.billingCutoffMonth)
              ? source.billingCutoffMonth
              : getCurrentAcademicMonth(),
          feeSchedules:
            Array.isArray(source.feeSchedules) && source.feeSchedules.length > 0
              ? source.feeSchedules
              : buildDefaultFeeSchedules(
                  classes.map((c) => c.className),
                  sessions.map((s) => s.name)
                ),
          students: source.students.map(normalizeStudent),
          fees: source.fees,
          routes: Array.isArray(source.routes) ? source.routes.map(normalizeRoute) : [],
          staff: Array.isArray(source.staff) ? source.staff.map(normalizeStaff) : [],
          customDesignations: normalizeCustomDesignations(source.customDesignations),
          classes,
          attendance:
            source.attendance && typeof source.attendance === 'object'
              ? source.attendance
              : {},
          exams: Array.isArray(source.exams) ? source.exams.map(normalizeExam) : [],
          marksheets: Array.isArray(source.marksheets) ? source.marksheets : [],
          grades: Array.isArray(source.grades) ? source.grades : [],
          notices: Array.isArray(source.notices) ? source.notices : [],
          lastUpdated: new Date().toISOString(),
        };

        commitDb(() => hydrated);

        runCloudTask(async () => {
          const uid = firebaseAuth.currentUser?.uid;
          const uEmail = firebaseAuth.currentUser?.email;
          const schoolId = activeSchoolIdRef.current;
          const ownerEmail = tenantMetaRef.current?.ownerEmail || uEmail || '';
          if (!uid || !uEmail || !schoolId) return;
          await syncEntireDatabaseToCloud(
            schoolId,
            hydrated,
            authorizedEmailsRef.current,
            uid,
            uEmail,
            ownerEmail,
            true
          );
        });

        notify(
          'success',
          'Backup Restored & Syncing to Cloud',
          `Restored ${hydrated.students.length} students, ${hydrated.staff.length} staff, and ${hydrated.fees.length} fee records.`
        );
        return { ok: true };
      } catch {
        return {
          ok: false,
          error: 'Could not parse JSON file. Ensure it is a valid backup export.',
        };
      }
    },
    [commitDb, notify, runCloudTask]
  );

  const resetSystemData = useCallback(
    (includeSignOut = false) => {
      if (currentRoleRef.current !== 'main_admin') {
        notify(
          'error',
          'Main Admin Required',
          'Only the Main Admin can reset workspace operational data.'
        );
        return;
      }
      const currentSchoolProfile = dbRef.current.schoolProfile;
      const fresh: SchoolDatabase = {
        ...createEmptyDatabase(),
        schoolProfile: { ...currentSchoolProfile },
      };
      commitDb(() => fresh);
      if (activeSchoolIdRef.current) {
        localStorage.setItem(
          getTenantCacheKey(activeSchoolIdRef.current),
          JSON.stringify(fresh)
        );
      }

      runCloudTask(async () => {
        const uid = firebaseAuth.currentUser?.uid;
        const uEmail = firebaseAuth.currentUser?.email;
        const schoolId = activeSchoolIdRef.current;
        const ownerEmail = tenantMetaRef.current?.ownerEmail || uEmail || '';
        if (!uid || !uEmail || !schoolId) return;
        await syncEntireDatabaseToCloud(
          schoolId,
          fresh,
          authorizedEmailsRef.current,
          uid,
          uEmail,
          ownerEmail,
          true
        );
        if (includeSignOut) {
          await signOut(firebaseAuth);
        }
      });

      notify(
        'info',
        'Workspace Reset Complete',
        'All school operational records in this tenant have been cleared.'
      );
    },
    [commitDb, notify, runCloudTask]
  );

  const openPrintPreview = useCallback((payload: PrintableDocumentPayload) => {
    setActivePrintDoc(payload);
  }, []);

  const closePrintPreview = useCallback(() => {
    setActivePrintDoc(null);
  }, []);

  // Avoid unused import warning while keeping fetchMemberRoleDoc available
  void fetchMemberRoleDoc;

  const value = useMemo<SchoolContextValue>(
    () => ({
      db,
      accounts,
      currentUserEmail,
      authReady,
      firebaseUserEmail: firebaseUser?.email || null,
      firebaseUserDisplayName: firebaseUser?.displayName || null,
      needsEmailVerification,
      needsSchoolOnboarding,
      activeSchoolId,
      tenantMeta,
      userMemberships,
      currentRole,
      isCurrentUserAdmin,
      isReadOnlyRole,
      canAccessModule,
      canManageStudents,
      canManageFees,
      canManageAttendance,
      canManageMarks,
      canManageExamSchedules,
      canManageCampusOps,
      canDeleteRecords,
      schoolMembers,
      staffInvites,
      accountantMaxLimit: ACCOUNTANT_MAX_LIMIT,
      activeAccountantSeatsUsed,
      pendingAccountantInvitesCount,
      pendingInviteParams,
      pendingInviteDoc,
      pendingInviteStatus,
      claimPendingInvite,
      dismissPendingInvite,
      cloudBinding,
      updateCloudBinding,
      registerSchoolModalOpen,
      setRegisterSchoolModalOpen,
      switchActiveSchool,
      registerSchoolWorkspace,
      updateSubscriptionPlan,
      aiCustomization,
      aiDrawerOpen,
      setAiDrawerOpen,
      updateAiCustomization,
      resetAiCustomization,
      photoOverrides,
      getEffectiveStudentPhoto,
      getEffectiveStaffPhoto,
      setTemporaryPhotoOverride,
      saveQuickPersonPhoto,
      cloudSyncStatus,
      authorizedStaffEmails,
      firebaseProjectId: FIREBASE_PROJECT_ID,
      firestoreDatabaseId: FIRESTORE_DATABASE_ID,
      signInWithGoogle,
      signInWithEmail,
      registerWithEmail,
      resendVerificationEmail,
      refreshEmailVerificationStatus,
      authenticateStaff,
      retryCloudConnection,
      signOutStaff,
      buildInviteRegistrationUrl,
      createStaffAccountWithCredentials,
      sendStaffPasswordReset,
      createStaffInvite,
      changeSchoolMemberRole,
      removeSchoolMember,
      revokeStaffInvite,
      addAuthorizedStaffEmail,
      removeAuthorizedStaffEmail,
      uploadCloudMedia,
      activeModule,
      setActiveModule,
      feeSubTab,
      setFeeSubTab,
      preselectedFeeStudentId,
      clearPreselectedFeeStudent,
      openFeeModuleForStudent,
      preselectedIdCardStudentId,
      clearPreselectedIdCardStudent,
      openIdCardForStudent,
      preselectedEditStudentId,
      clearPreselectedEditStudent,
      openEditStudentModal,
      staffSubTab,
      setStaffSubTab,
      preselectedStaffIdCardId,
      clearPreselectedStaffIdCard,
      openStaffIdCardStudio,
      activeSessionConfig,
      activeSessionMonths,
      addAcademicSession,
      updateAcademicSession,
      setActiveAcademicSession,
      deleteAcademicSession,
      promoteStudents,
      updateSchoolProfile,
      dueOverview,
      setBillingCutoffMonth,
      getClassSessionFee,
      updateClassSessionFee,
      addStudent,
      updateStudent,
      setStudentStatus,
      deleteStudent,
      collectFee,
      deleteFee,
      addRoute,
      updateRoute,
      deleteRoute,
      addStaff,
      updateStaff,
      deleteStaff,
      addCustomDesignation,
      addClassAllocation,
      addSectionToClass,
      removeSectionFromClass,
      updateClassCapacity,
      deleteClassAllocation,
      saveAttendanceSheet,
      createExam,
      updateExam,
      deleteExam,
      saveStudentMarksheet,
      saveBulkExamMarksheets,
      deleteStudentMarksheet,
      saveGradeRecord,
      deleteGradeRecord,
      addNotice,
      deleteNotice,
      storageSizeBytes,
      exportBackupJson,
      exportBackupExcel,
      importBackupJson,
      resetSystemData,
      activePrintDoc,
      openPrintPreview,
      closePrintPreview,
      toasts,
      notify,
      dismissToast,
      confirmDialog,
      requestConfirm,
      closeConfirm,
    }),
    [
      db,
      accounts,
      currentUserEmail,
      authReady,
      firebaseUser?.email,
      firebaseUser?.displayName,
      needsEmailVerification,
      needsSchoolOnboarding,
      activeSchoolId,
      tenantMeta,
      userMemberships,
      currentRole,
      isCurrentUserAdmin,
      isReadOnlyRole,
      canAccessModule,
      canManageStudents,
      canManageFees,
      canManageAttendance,
      canManageMarks,
      canManageExamSchedules,
      canManageCampusOps,
      canDeleteRecords,
      schoolMembers,
      staffInvites,
      activeAccountantSeatsUsed,
      pendingAccountantInvitesCount,
      pendingInviteParams,
      pendingInviteDoc,
      pendingInviteStatus,
      claimPendingInvite,
      dismissPendingInvite,
      cloudBinding,
      updateCloudBinding,
      registerSchoolModalOpen,
      switchActiveSchool,
      registerSchoolWorkspace,
      updateSubscriptionPlan,
      aiCustomization,
      aiDrawerOpen,
      updateAiCustomization,
      resetAiCustomization,
      photoOverrides,
      getEffectiveStudentPhoto,
      getEffectiveStaffPhoto,
      setTemporaryPhotoOverride,
      saveQuickPersonPhoto,
      cloudSyncStatus,
      authorizedStaffEmails,
      signInWithGoogle,
      signInWithEmail,
      registerWithEmail,
      resendVerificationEmail,
      refreshEmailVerificationStatus,
      authenticateStaff,
      retryCloudConnection,
      signOutStaff,
      buildInviteRegistrationUrl,
      createStaffAccountWithCredentials,
      sendStaffPasswordReset,
      createStaffInvite,
      changeSchoolMemberRole,
      removeSchoolMember,
      revokeStaffInvite,
      addAuthorizedStaffEmail,
      removeAuthorizedStaffEmail,
      uploadCloudMedia,
      activeModule,
      setActiveModule,
      feeSubTab,
      preselectedFeeStudentId,
      clearPreselectedFeeStudent,
      openFeeModuleForStudent,
      preselectedIdCardStudentId,
      clearPreselectedIdCardStudent,
      openIdCardForStudent,
      preselectedEditStudentId,
      clearPreselectedEditStudent,
      openEditStudentModal,
      staffSubTab,
      preselectedStaffIdCardId,
      clearPreselectedStaffIdCard,
      openStaffIdCardStudio,
      activeSessionConfig,
      activeSessionMonths,
      addAcademicSession,
      updateAcademicSession,
      setActiveAcademicSession,
      deleteAcademicSession,
      promoteStudents,
      updateSchoolProfile,
      dueOverview,
      setBillingCutoffMonth,
      getClassSessionFee,
      updateClassSessionFee,
      addStudent,
      updateStudent,
      setStudentStatus,
      deleteStudent,
      collectFee,
      deleteFee,
      addRoute,
      updateRoute,
      deleteRoute,
      addStaff,
      updateStaff,
      deleteStaff,
      addCustomDesignation,
      addClassAllocation,
      addSectionToClass,
      removeSectionFromClass,
      updateClassCapacity,
      deleteClassAllocation,
      saveAttendanceSheet,
      createExam,
      updateExam,
      deleteExam,
      saveStudentMarksheet,
      saveBulkExamMarksheets,
      deleteStudentMarksheet,
      saveGradeRecord,
      deleteGradeRecord,
      addNotice,
      deleteNotice,
      storageSizeBytes,
      exportBackupJson,
      exportBackupExcel,
      importBackupJson,
      resetSystemData,
      activePrintDoc,
      openPrintPreview,
      closePrintPreview,
      toasts,
      notify,
      dismissToast,
      confirmDialog,
      requestConfirm,
      closeConfirm,
    ]
  );

  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>;
};

export function useSchool(): SchoolContextValue {
  const ctx = useContext(SchoolContext);
  if (!ctx) {
    throw new Error('useSchool must be used inside a SchoolProvider');
  }
  return ctx;
}
