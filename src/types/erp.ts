export type ModuleId =
  | 'dashboard'
  | 'admissions'
  | 'sessions'
  | 'id-cards'
  | 'fees'
  | 'transport'
  | 'staff'
  | 'team-access'
  | 'classes'
  | 'attendance'
  | 'exams'
  | 'admit-cards'
  | 'marksheets'
  | 'notices'
  | 'settings'
  | 'backups'
  | 'data-import';

export type SchoolRole = 'main_admin' | 'accountant' | 'teacher' | 'director';

export type InvitableSchoolRole = 'accountant' | 'teacher' | 'director';

export type StaffInviteStatus = 'pending' | 'accepted' | 'revoked';

export type SubscriptionPlan = 'Starter' | 'Standard' | 'Enterprise';

export type SubscriptionStatus = 'Active' | 'Trial' | 'Suspended';

export const ACCOUNTANT_MAX_LIMIT = 2;

export interface RoleMetadata {
  role: SchoolRole;
  label: string;
  shortLabel: string;
  maxSeatsLabel: string;
  summary: string;
}

export const ROLE_META: Record<SchoolRole, RoleMetadata> = {
  main_admin: {
    role: 'main_admin',
    label: 'Main Admin (Owner)',
    shortLabel: 'Main Admin',
    maxSeatsLabel: '1 Owner / School',
    summary:
      'Full CRUD control over school settings, subscriptions, staff invitations, backups, and all ERP modules.',
  },
  accountant: {
    role: 'accountant',
    label: 'Accountant',
    shortLabel: 'Accountant',
    maxSeatsLabel: 'Max 2 / School',
    summary:
      'Restricted strictly to New Student Admissions and Fee Management (Fee Master, Receipts & Dues).',
  },
  teacher: {
    role: 'teacher',
    label: 'Teacher / Faculty',
    shortLabel: 'Teacher',
    maxSeatsLabel: '20+ Supported',
    summary:
      'Restricted strictly to Daily Attendance marking, Exam Marks upload, and Student Performance.',
  },
  director: {
    role: 'director',
    label: 'Director / Principal / Head Staff',
    shortLabel: 'Director · View Only',
    maxSeatsLabel: 'Unlimited',
    summary:
      'Read-only analytical & report access across Dashboard, Admissions, Fees, Attendance, and Exams without edit/delete rights.',
  },
};

const ALL_MODULES: ModuleId[] = [
  'dashboard',
  'admissions',
  'sessions',
  'id-cards',
  'fees',
  'transport',
  'staff',
  'team-access',
  'classes',
  'attendance',
  'exams',
  'admit-cards',
  'marksheets',
  'notices',
  'settings',
  'backups',
  'data-import',
];

export function getAllowedModulesForRole(role: SchoolRole): ModuleId[] {
  switch (role) {
    case 'main_admin':
      return ALL_MODULES;
    case 'accountant':
      return ['admissions', 'fees', 'data-import'];
    case 'teacher':
      return ['attendance', 'marksheets'];
    case 'director':
      return [
        'dashboard',
        'admissions',
        'id-cards',
        'staff',
        'exams',
        'admit-cards',
        'marksheets',
        'fees',
        'attendance',
        'transport',
        'classes',
        'notices',
        'data-import',
      ];
    default:
      return ['dashboard'];
  }
}

export function getDefaultModuleForRole(role: SchoolRole): ModuleId {
  switch (role) {
    case 'main_admin':
      return 'dashboard';
    case 'accountant':
      return 'admissions';
    case 'teacher':
      return 'attendance';
    case 'director':
      return 'dashboard';
    default:
      return 'dashboard';
  }
}

export interface SchoolTenantMeta {
  id: string;
  schoolName: string;
  ownerUid: string;
  ownerEmail: string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  accountantCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserSchoolMembership {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  schoolId: string;
  schoolName: string;
  role: SchoolRole;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolMemberRecord {
  uid: string;
  schoolId: string;
  ownerUid: string;
  email: string;
  displayName: string;
  role: SchoolRole;
  inviteId: string;
  addedByUid: string;
  createdAt: string;
  updatedAt: string;
  staffProfileId?: string;
  initialPasswordHint?: string;
}

export interface StaffInviteRecord {
  id: string;
  schoolId: string;
  schoolName: string;
  invitedName: string;
  invitedEmail: string;
  role: InvitableSchoolRole;
  status: StaffInviteStatus;
  invitedByUid: string;
  invitedByEmail: string;
  acceptedByUid: string;
  createdAt: string;
  updatedAt: string;
}

export type Gender = 'Male' | 'Female' | 'Other';

export type AdmissionType = 'Free' | 'Paid';

export type CasteCategory = 'General' | 'OBC' | 'SC' | 'ST' | 'Other';

export type StudentStatus = 'Active' | 'Deactive';

export interface StaffAccount {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export type FeeMonth =
  | 'April'
  | 'May'
  | 'June'
  | 'July'
  | 'August'
  | 'September'
  | 'October'
  | 'November'
  | 'December'
  | 'January'
  | 'February'
  | 'March';

export interface AcademicSessionConfig {
  id: string;
  name: string; // e.g., '2026-2027'
  startMonth: FeeMonth; // e.g., 'April'
  endMonth: FeeMonth; // e.g., 'March'
  isActive: boolean;
  createdAt: string;
}

export interface SchoolProfileSettings {
  schoolName: string;
  tagline: string;
  logoDataUrl: string;
  address: string;
  phone: string;
  alternatePhone: string;
  email: string;
  website: string;
  directorName: string;
  principalName: string;
  affiliationNo: string;
  authorityDesignation?: string;
  signatureDataUrl?: string;
  stampDataUrl?: string;
}

export interface StudentPromotionHistoryItem {
  id: string;
  fromSession: string;
  toSession: string;
  fromClass: string;
  toClass: string;
  fromSection: string;
  toSection: string;
  previousRollNumber: string;
  newRollNumber: string;
  promotedAt: string;
  promotedBy: string;
}

export interface ClassSessionFeeRate {
  className: string;
  academicSession: string; // e.g., '2026-2027'
  admissionFee: number;
  monthlyTuitionFee: number;
  annualExamFee: number;
}

export interface StudentRecord {
  id: string;
  admissionId: string; // e.g., RB1001
  rollNumber?: string; // Optional custom roll number; auto-resolved per class-section if blank
  status: StudentStatus; // Active | Deactive (Fee Freeze when Deactive)
  deactivatedAt?: string;
  deactivatedReason?: string;
  promotionHistory?: StudentPromotionHistoryItem[];
  // a) Academic Session
  academicSession: string; // e.g., 2026-2027
  // b) Admission Type & Fee
  admissionType: AdmissionType; // Free | Paid
  admissionFee: number; // 0 if Free
  // c) Pre-School Information
  previousSchool: string;
  lastGradePassed: string;
  tcDetails: string;
  // d) Basic Details
  name: string;
  dob: string; // YYYY-MM-DD
  gender: Gender;
  casteCategory: CasteCategory;
  // e) Academic & Financials
  className: string; // Nursery, LKG, UKG, 1st to 5th+
  section: string; // A, B, C
  monthlyTuitionFee: number;
  // f) Parent/Guardian Details
  fatherName: string;
  motherName: string;
  phone: string;
  alternatePhone: string;
  address: string;
  // g) Identity & Photo Uploads (Base64 Data URLs)
  photoDataUrl: string;
  aadhaarNumber: string;
  aadhaarDocDataUrl: string;
  // h) Transport Setup
  transportEnabled: boolean;
  routeId: string; // '' if transportEnabled is false
  transportFee: number;
  // i) Other / Custom Details
  customNotes: string;
  admissionDate: string; // YYYY-MM-DD
}

export type FeeCategory = 'Tuition' | 'Admission' | 'Transport' | 'Exam';

export type PaymentMode = 'Cash' | 'UPI' | 'Bank';

export interface FeeRecord {
  id: string;
  receiptNo: string; // e.g., REC90001
  studentId: string;
  admissionId: string;
  studentName: string;
  className: string;
  section: string;
  fatherName: string;
  category: FeeCategory;
  feeMonth: FeeMonth;
  paymentMode: PaymentMode;
  amount: number;
  date: string; // YYYY-MM-DD
  remarks?: string;
}

export interface StudentDueSummary {
  student: StudentRecord;
  isFeeFrozen: boolean;
  billableMonths: FeeMonth[];
  unpaidTuitionMonths: FeeMonth[];
  unpaidTransportMonths: FeeMonth[];
  expectedAdmission: number;
  expectedTuition: number;
  expectedTransport: number;
  totalExpected: number;
  paidAdmission: number;
  paidTuition: number;
  paidTransport: number;
  paidExam: number;
  totalPaidAll: number;
  dueAdmission: number;
  dueTuition: number;
  dueTransport: number;
  totalOutstandingDue: number;
  advanceCredit: number;
}

export interface TransportRoute {
  id: string;
  routeName: string;
  busNumber: string;
  pickupPoints: string;
  monthlyFare: number;
  driverName: string;
  driverPhone: string;
  createdAt: string;
}

export type StaffDesignation = string;

export const DEFAULT_STAFF_DESIGNATIONS: string[] = [
  'Principal',
  'Vice-Principal',
  'Teacher (English)',
  'Teacher (Mathematics)',
  'Teacher (Science)',
  'Teacher (Hindi)',
  'Teacher (Social Studies)',
  'Teacher (Computer)',
  'Teacher (Primary / PRT)',
  'Office Clerk',
  'Accountant',
  'Guard',
  'Peon',
];

export interface StaffMember {
  id: string;
  staffId: string; // e.g., STF101 or custom Employee Reg. No.
  fullName: string;
  fatherOrSpouseName: string;
  designation: StaffDesignation;
  assignedDepartment: string; // Assigned Department / Classes / Subjects
  qualification: string;
  monthlySalary: number;
  address: string;
  phone: string;
  emergencyContact: string;
  joinedDate: string; // YYYY-MM-DD
  photoDataUrl: string; // Base64 Staff Photograph
}

export interface ClassAllocation {
  id: string;
  className: string;
  sections: string[];
  sectionCapacity: number;
  isDefault?: boolean;
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Late';

export interface DailyAttendanceSheet {
  key: string; // `${date}__${className}__${section}`
  date: string;
  className: string;
  section: string; // 'ALL' or specific section
  entries: Record<string, AttendanceStatus>; // studentId -> status
  notes: Record<string, string>;
  updatedAt: string;
  markedBy: string;
}

// Structured Comprehensive Examination Management Models
export interface ExamSubjectSchedule {
  id: string;
  subjectName: string;
  subjectCode: string; // e.g., ENG, MATH
  maxMarks: number;
  minMarks: number;
  examDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm (24-hour, e.g., '09:00')
  endTime: string; // HH:mm (24-hour, e.g., '12:00')
}

export interface ExamDefinition {
  id: string;
  examCode: string; // e.g., EXM101
  examName: string; // e.g., Half-Yearly Examination
  academicSession: string; // e.g., 2026-2027
  className: string; // Target Class
  examCenter: string;
  instructions: string;
  subjects: ExamSubjectSchedule[];
  createdAt: string;
  updatedAt: string;
}

export interface SubjectMarkEntry {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  maxMarks: number;
  minMarks: number;
  marksObtained: number;
  isAbsent: boolean;
  passedSubject: boolean;
  subjectGrade: string;
}

export interface StudentExamMarksheet {
  id: string;
  examId: string;
  examCode: string;
  examName: string;
  academicSession: string;
  studentId: string;
  admissionId: string;
  rollNumber: string;
  studentName: string;
  className: string;
  section: string;
  fatherName: string;
  motherName: string;
  dob: string;
  subjectMarks: SubjectMarkEntry[];
  totalMaxMarks: number;
  totalMinMarks: number;
  totalObtained: number;
  percentage: number;
  overallGrade: string;
  passed: boolean;
  remarks: string;
  customRemarks?: string;
  updatedAt: string;
}

// Legacy compatibility grade record
export type ExamTerm = 'Unit Test I' | 'Half-Yearly Exam' | 'Unit Test II' | 'Annual Final Exam';

export interface ExamGradeRecord {
  id: string;
  studentId: string;
  admissionId: string;
  studentName: string;
  className: string;
  section: string;
  fatherName: string;
  dob: string;
  term: ExamTerm;
  english: number;
  hindi: number;
  maths: number;
  science: number;
  total: number;
  percentage: number;
  passed: boolean;
  recordedAt: string;
}

export type NoticeCategory =
  | 'Academic'
  | 'Examination'
  | 'Holiday'
  | 'Transport'
  | 'Admissions'
  | 'General';

export interface NoticeItem {
  id: string;
  title: string;
  body: string;
  category: NoticeCategory;
  postedBy: string;
  createdAt: string;
}

export interface SchoolDatabase {
  version: number;
  counters: {
    studentSeq: number;
    receiptSeq: number;
    staffSeq: number;
    examSeq: number;
  };
  sessions: AcademicSessionConfig[];
  activeSession: string;
  schoolProfile: SchoolProfileSettings;
  billingCutoffMonth: FeeMonth;
  feeSchedules: ClassSessionFeeRate[];
  students: StudentRecord[];
  fees: FeeRecord[];
  routes: TransportRoute[];
  staff: StaffMember[];
  customDesignations: string[];
  classes: ClassAllocation[];
  attendance: Record<string, DailyAttendanceSheet>;
  exams: ExamDefinition[];
  marksheets: StudentExamMarksheet[];
  grades: ExamGradeRecord[];
  notices: NoticeItem[];
  lastUpdated: string;
}

export type IdCardCodeStyle = 'barcode' | 'qr' | 'none';

export type IdCardPrintLayout = 'single' | 'grid';

export type PrintableDocumentPayload =
  | { type: 'admission-slip'; student: StudentRecord; route?: TransportRoute }
  | { type: 'fee-receipt'; fee: FeeRecord }
  | { type: 'fee-demand-slip'; summary: StudentDueSummary; cutoffMonth: FeeMonth }
  | {
      type: 'attendance-sheet';
      date: string;
      className: string;
      section: string;
      rows: Array<{
        student: StudentRecord;
        status: AttendanceStatus;
        note: string;
      }>;
      markedBy: string;
    }
  | {
      type: 'admit-card';
      exam: ExamDefinition;
      student: StudentRecord;
      rollNumber: string;
    }
  | {
      type: 'marksheet';
      marksheet: StudentExamMarksheet;
      student?: StudentRecord;
      exam?: ExamDefinition;
    }
  | {
      type: 'student-id-card';
      students: StudentRecord[];
      layoutMode: IdCardPrintLayout;
      codeStyle: IdCardCodeStyle;
    }
  | {
      type: 'staff-id-card';
      staffMembers: StaffMember[];
      layoutMode: IdCardPrintLayout;
      codeStyle: IdCardCodeStyle;
    }
  | { type: 'report-card'; grade: ExamGradeRecord };

export interface ToastMessage {
  id: string;
  kind: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

// ============================================================================
// MODULE 1 & 2: MASTER ACCOUNT DIRECTORY & DYNAMIC USER-OWNED CLOUD STORAGE
// ============================================================================

export type CloudStorageProvider = 'supabase' | 'firebase' | 'managed';

export interface DynamicCloudBinding {
  provider: CloudStorageProvider;
  /** Supabase Project URL (https://xyz.supabase.co) or Firebase Project URL / ID */
  apiUrl: string;
  /** Supabase Public Anon Key or Firebase Public Web API Key */
  publicKey: string;
  /** Optional explicit Firebase fields when provider === 'firebase' */
  firebaseProjectId?: string;
  firebaseAuthDomain?: string;
  firebaseDatabaseId?: string;
  firebaseAppId?: string;
  firebaseStorageBucket?: string;
}

export interface MasterAccountProfile {
  uid: string;
  email: string;
  displayName: string;
  activeSchoolId: string;
  schoolName: string;
  role: SchoolRole;
  binding: DynamicCloudBinding;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// MODULE 3: IN-APP "ASK AI / CHANGE US" CUSTOMIZATION ENGINE
// ============================================================================

export type AiAccentTheme =
  | 'indigo'
  | 'emerald'
  | 'royal-blue'
  | 'crimson'
  | 'amber'
  | 'slate';

export type FeeReceiptStyle = 'classic' | 'modern-boxed' | 'compact-slip';

export type MarksheetLayoutStyle = 'standard' | 'executive-crest' | 'cbse-detailed';

export interface CustomStudentFieldDef {
  key: string;
  label: string;
  placeholder: string;
  showOnReceipt: boolean;
  showOnAdmissionSlip: boolean;
}

export interface AiCustomizationSettings {
  accentTheme: AiAccentTheme;
  densityMode: 'comfortable' | 'compact';
  feeReceiptShowQr: boolean;
  feeReceiptStyle: FeeReceiptStyle;
  feeReceiptFooterNote: string;
  feeReceiptShowLogoWatermark: boolean;
  marksheetLayout: MarksheetLayoutStyle;
  marksheetShowQr: boolean;
  marksheetShowRankBadge: boolean;
  admitCardShowQr: boolean;
  dashboardBannerTitle: string;
  customStudentFields: CustomStudentFieldDef[];
  promptHistory: string[];
}

export const DEFAULT_AI_CUSTOMIZATION: AiCustomizationSettings = {
  accentTheme: 'indigo',
  densityMode: 'comfortable',
  feeReceiptShowQr: false,
  feeReceiptStyle: 'classic',
  feeReceiptFooterNote: '',
  feeReceiptShowLogoWatermark: false,
  marksheetLayout: 'standard',
  marksheetShowQr: false,
  marksheetShowRankBadge: false,
  admitCardShowQr: false,
  dashboardBannerTitle: '',
  customStudentFields: [],
  promptHistory: [],
};

