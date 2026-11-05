/**
 * Phase 0 Adversarial Security Test Suite for Multi-Tenant SaaS Firestore Rules (`firestore.rules`)
 * Verifies that all 12 "Dirty Dozen" payloads in `security_spec.md` return PERMISSION_DENIED.
 */

export interface SimulatedAuthContext {
  uid: string;
  email: string;
  email_verified: boolean;
}

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  auth: SimulatedAuthContext | null;
  actorRoleInTargetSchool?: 'main_admin' | 'accountant' | 'teacher' | 'director' | null;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  queryContainsAuthorizedEmail?: boolean;
  existingDoc?: Record<string, unknown>;
  incomingDoc?: Record<string, unknown>;
  schoolAccountantCount?: number;
  usesServerTimestamp?: boolean;
  parentStudentExists?: boolean;
  expectedAllowed: false;
}

export const DIRTY_DOZEN_CASES: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Cross-Tenant Read Attack (School A Admin Reading School B Student)',
    auth: { uid: 'admin_alpha', email: 'owner@alpha.edu', email_verified: true },
    actorRoleInTargetSchool: null,
    operation: 'get',
    path: '/schools/sch_beta/students/stu_1',
    existingDoc: { id: 'stu_1', schoolId: 'sch_beta', authorizedEmails: ['owner@beta.edu'] },
    expectedAllowed: false,
  },
  {
    id: 2,
    name: 'Unverified Email Invite Hijack Spoof',
    auth: { uid: 'spoof1', email: 'accountant@alpha.edu', email_verified: false },
    actorRoleInTargetSchool: null,
    operation: 'get',
    path: '/schools/sch_alpha/invites/inv_1',
    existingDoc: {
      id: 'inv_1',
      schoolId: 'sch_alpha',
      invitedEmail: 'accountant@alpha.edu',
      role: 'accountant',
      status: 'pending',
    },
    expectedAllowed: false,
  },
  {
    id: 3,
    name: 'Self-Assigned main_admin Privilege Escalation on Invite Claim',
    auth: { uid: 'uid_t1', email: 'teacher@alpha.edu', email_verified: true },
    actorRoleInTargetSchool: null,
    operation: 'create',
    path: '/schools/sch_alpha/members/uid_t1',
    incomingDoc: {
      uid: 'uid_t1',
      schoolId: 'sch_alpha',
      ownerUid: 'admin_alpha',
      email: 'teacher@alpha.edu',
      displayName: 'Teacher One',
      role: 'main_admin',
      inviteId: 'inv_teacher_1',
      addedByUid: 'admin_alpha',
    },
    usesServerTimestamp: true,
    expectedAllowed: false,
  },
  {
    id: 4,
    name: 'Exceeding Max 2 Accountants Quota Bypass',
    auth: { uid: 'uid_acc3', email: 'acc3@alpha.edu', email_verified: true },
    actorRoleInTargetSchool: null,
    schoolAccountantCount: 2,
    operation: 'create',
    path: '/schools/sch_alpha/members/uid_acc3',
    incomingDoc: {
      uid: 'uid_acc3',
      schoolId: 'sch_alpha',
      ownerUid: 'admin_alpha',
      email: 'acc3@alpha.edu',
      displayName: 'Third Accountant',
      role: 'accountant',
      inviteId: 'inv_acc_3',
      addedByUid: 'admin_alpha',
    },
    usesServerTimestamp: true,
    expectedAllowed: false,
  },
  {
    id: 5,
    name: 'Director (Read-Only Role) Attempting Student Mutation',
    auth: { uid: 'uid_dir1', email: 'principal@alpha.edu', email_verified: true },
    actorRoleInTargetSchool: 'director',
    operation: 'update',
    path: '/schools/sch_alpha/students/stu_1',
    existingDoc: { id: 'stu_1', schoolId: 'sch_alpha', status: 'Active' },
    incomingDoc: { id: 'stu_1', schoolId: 'sch_alpha', status: 'Active', name: 'Edited By Director' },
    usesServerTimestamp: true,
    expectedAllowed: false,
  },
  {
    id: 6,
    name: 'Teacher Attempting Fee Receipt Creation',
    auth: { uid: 'uid_t1', email: 'teacher@alpha.edu', email_verified: true },
    actorRoleInTargetSchool: 'teacher',
    operation: 'create',
    path: '/schools/sch_alpha/fees/fee_9001',
    incomingDoc: { id: 'fee_9001', schoolId: 'sch_alpha', studentId: 'stu_1', amount: 1500 },
    parentStudentExists: true,
    usesServerTimestamp: true,
    expectedAllowed: false,
  },
  {
    id: 7,
    name: 'Accountant Attempting Exam Marksheet Upload',
    auth: { uid: 'uid_acc1', email: 'acc1@alpha.edu', email_verified: true },
    actorRoleInTargetSchool: 'accountant',
    operation: 'create',
    path: '/schools/sch_alpha/marksheets/ms_1',
    incomingDoc: { id: 'ms_1', schoolId: 'sch_alpha', examId: 'exm_1', studentId: 'stu_1' },
    parentStudentExists: true,
    usesServerTimestamp: true,
    expectedAllowed: false,
  },
  {
    id: 8,
    name: 'Unfiltered Collection List Scraping Without Authorized Email Filter',
    auth: { uid: 'uid_t1', email: 'teacher@alpha.edu', email_verified: true },
    actorRoleInTargetSchool: 'teacher',
    operation: 'list',
    path: '/schools/sch_alpha/students',
    queryContainsAuthorizedEmail: false,
    expectedAllowed: false,
  },
  {
    id: 9,
    name: 'Replay Attack on Already Accepted Invite',
    auth: { uid: 'uid_t1', email: 'teacher@alpha.edu', email_verified: true },
    actorRoleInTargetSchool: null,
    operation: 'update',
    path: '/schools/sch_alpha/invites/inv_1',
    existingDoc: {
      id: 'inv_1',
      schoolId: 'sch_alpha',
      invitedEmail: 'teacher@alpha.edu',
      role: 'teacher',
      status: 'accepted',
    },
    incomingDoc: {
      id: 'inv_1',
      schoolId: 'sch_alpha',
      invitedEmail: 'teacher@alpha.edu',
      role: 'teacher',
      status: 'accepted',
    },
    usesServerTimestamp: true,
    expectedAllowed: false,
  },
  {
    id: 10,
    name: 'Shadow / Ghost Field Injection on Create',
    auth: { uid: 'admin_alpha', email: 'owner@alpha.edu', email_verified: true },
    actorRoleInTargetSchool: 'main_admin',
    operation: 'create',
    path: '/schools/sch_alpha/notices/ntc_1',
    incomingDoc: {
      id: 'ntc_1',
      schoolId: 'sch_alpha',
      title: 'Holiday Notice',
      body: 'School closed tomorrow.',
      category: 'Holiday',
      postedBy: 'owner@alpha.edu',
      noticeCreatedAt: '2026-11-04T10:00:00Z',
      authorizedEmails: ['owner@alpha.edu'],
      createdByUid: 'admin_alpha',
      updatedByUid: 'admin_alpha',
      isSuperGlobal: true,
    },
    usesServerTimestamp: true,
    expectedAllowed: false,
  },
  {
    id: 11,
    name: 'Orphaned Fee Write Referencing Non-Existent Student',
    auth: { uid: 'uid_acc1', email: 'acc1@alpha.edu', email_verified: true },
    actorRoleInTargetSchool: 'accountant',
    operation: 'create',
    path: '/schools/sch_alpha/fees/fee_orphan',
    incomingDoc: {
      id: 'fee_orphan',
      schoolId: 'sch_alpha',
      studentId: 'non_existent_student_999',
      createdByUid: 'uid_acc1',
    },
    parentStudentExists: false,
    usesServerTimestamp: true,
    expectedAllowed: false,
  },
  {
    id: 12,
    name: 'Terminal State Bypass on Deactivated Student by Accountant',
    auth: { uid: 'uid_acc1', email: 'acc1@alpha.edu', email_verified: true },
    actorRoleInTargetSchool: 'accountant',
    operation: 'update',
    path: '/schools/sch_alpha/students/stu_archived',
    existingDoc: {
      id: 'stu_archived',
      schoolId: 'sch_alpha',
      status: 'Deactive',
      createdByUid: 'admin_alpha',
      authorizedEmails: ['owner@alpha.edu', 'acc1@alpha.edu'],
    },
    incomingDoc: {
      id: 'stu_archived',
      schoolId: 'sch_alpha',
      status: 'Active',
      createdByUid: 'admin_alpha',
      updatedByUid: 'uid_acc1',
    },
    usesServerTimestamp: true,
    expectedAllowed: false,
  },
];
