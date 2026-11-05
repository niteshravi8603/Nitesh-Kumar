# Multi-Tenant SaaS Security Specification (`security_spec.md`)

## 1. Master Source of Truth & Multi-Tenant RLS / RBAC Invariants

1. **Zero-Trust Default Deny**: Every path outside the explicitly declared multi-tenant collections (`/user_memberships/{membershipId}`, `/schools/{schoolId}`, and the 15 subcollections under `/schools/{schoolId}/...`) is unconditionally denied (`allow read, write: if false;`).
2. **Strict Tenant Row-Level Security (RLS) & Master Gate**:
   - Every school operates inside an isolated `/schools/{schoolId}` hierarchy, and every operational document carries an immutable `schoolId == schoolId` field.
   - Single-document reads and all writes (`get`, `create`, `update`, `delete`) verify parent school existence (`exists(/databases/$(database)/documents/schools/$(schoolId))`) AND live membership via `get(/databases/$(database)/documents/schools/$(schoolId)/members/$(request.auth.uid))`. Deleting a member document immediately and synchronously revokes access across all sub-resources.
   - All `allow list` rules strictly evaluate `resource.data` without `get()`/`exists()` calls (`existing().schoolId == schoolId && request.auth.token.email in existing().authorizedEmails`), preventing cross-school data scraping and O(N) read cost explosions.
3. **Strict 4-Tier Role-Based Access Control (RBAC)**:
   - **`main_admin` (Sole Owner — Max 1 per School)**: Created exclusively during atomic `/schools/{schoolId}` creation. Full CRUD over school settings, subscription metadata, staff invites, member roles, and all operational modules.
   - **`accountant` (Strict Max 2 Active per School)**: Enforced on `/schools/{schoolId}` (`accountantCount >= 0 && accountantCount <= 2`) and atomically synchronized via `getAfter` during invite claim, role change, or member removal. Write access is strictly limited to `students` (active records), `fees`, `fee_schedules`, `media_files`, and sequence counters on `/schools/{schoolId}`. Zero access to attendance, marks, staff HR, or deletions.
   - **`teacher` (Supports 20+ Accounts per School)**: Write access is strictly limited to `attendance`, `marksheets`, and `grades`. Zero write access to admissions, fees, settings, or deletions.
   - **`director` (`Director / Principal / Head Staff` — Unlimited)**: Strictly Read-Only (`get` and `list` only across school analytics and records). Zero `create`, `update`, or `delete` privileges on any collection.
4. **Tamper-Proof Invite Claiming & Terminal State Locking**:
   - Staff members can only join an existing school by claiming a `pending` `/schools/{schoolId}/invites/{inviteId}` whose `invitedEmail` matches `request.auth.token.email.lower()` (`email_verified == true`), atomically transitioning the invite to terminal `status == 'accepted'`.

---

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return `PERMISSION_DENIED`)

1. **Payload 1 — Cross-Tenant Read Attack (School A Reading School B)**:
   - Actor: Verified `main_admin` of `sch_alpha` attempting `GET /schools/sch_beta/students/stu_1`.
   - Expected: `PERMISSION_DENIED` (not a member of `sch_beta`).

2. **Payload 2 — Unverified Email Invite Hijack Spoof**:
   - Actor: `auth = { uid: 'spoof1', token: { email: 'accountant@school.com', email_verified: false } }` attempting to read or accept `/schools/sch_alpha/invites/inv_1`.
   - Expected: `PERMISSION_DENIED` (`email_verified == true` strictly enforced).

3. **Payload 3 — Self-Assigned `main_admin` Privilege Escalation**:
   - Actor: Invited teacher `teacher@school.com` attempting `CREATE /schools/sch_alpha/members/uid_t1` with `role: 'main_admin'` instead of `invite.role == 'teacher'`.
   - Expected: `PERMISSION_DENIED`.

4. **Payload 4 — Exceeding Max 2 Accountants Quota Bypass**:
   - Actor: `main_admin` or invited user attempting to create a 3rd `accountant` member when `/schools/sch_alpha.accountantCount == 2`.
   - Expected: `PERMISSION_DENIED` (`accountantCount <= 2` + `getAfter` atomic increment check fails).

5. **Payload 5 — Director (View-Only) Attempting Record Mutation**:
   - Actor: Verified `director` of `sch_alpha` attempting `CREATE /schools/sch_alpha/notices/ntc_1` or `UPDATE /schools/sch_alpha/students/stu_1`.
   - Expected: `PERMISSION_DENIED` (`director` has zero write rules).

6. **Payload 6 — Teacher Attempting Fee Receipt Creation**:
   - Actor: Verified `teacher` of `sch_alpha` attempting `CREATE /schools/sch_alpha/fees/fee_9001`.
   - Expected: `PERMISSION_DENIED` (`fees` writes restricted to `main_admin` and `accountant`).

7. **Payload 7 — Accountant Attempting Exam Marks Upload**:
   - Actor: Verified `accountant` of `sch_alpha` attempting `CREATE /schools/sch_alpha/marksheets/ms_1`.
   - Expected: `PERMISSION_DENIED` (`marksheets` writes restricted to `main_admin` and `teacher`).

8. **Payload 8 — Unfiltered Cross-School Collection List Scraping**:
   - Actor: Verified `teacher` querying `LIST /schools/sch_alpha/students` without `where('authorizedEmails', 'array-contains', email)`.
   - Expected: `PERMISSION_DENIED` (Query Enforcer rejects unconstrained list queries).

9. **Payload 9 — Replay Attack on Already Accepted Invite**:
   - Actor: Verified user attempting to re-accept `/schools/sch_alpha/invites/inv_1` where `existing().status == 'accepted'`.
   - Expected: `PERMISSION_DENIED` (Terminal State Lock requires `existing().status == 'pending'`).

10. **Payload 10 — Shadow / Ghost Field Injection**:
    - Actor: `main_admin` creating `/schools/sch_alpha/notices/ntc_2` with undeclared key `isSuperGlobal: true`.
    - Expected: `PERMISSION_DENIED` (`hasOnly` blocks undeclared keys).

11. **Payload 11 — Orphaned Fee Write Without Existing Student**:
    - Actor: `accountant` creating `/schools/sch_alpha/fees/fee_orphan` referencing non-existent `studentId: 'ghost_999'`.
    - Expected: `PERMISSION_DENIED` (`studentExistsOrBatch` fails).

12. **Payload 12 — Terminal State Bypass on Deactivated Student by Accountant**:
    - Actor: `accountant` attempting to update `/schools/sch_alpha/students/stu_archived` where `existing().status == 'Deactive'`.
    - Expected: `PERMISSION_DENIED` (only `main_admin` can modify deactivated student records).
