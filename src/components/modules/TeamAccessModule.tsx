import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Link2,
  Mail,
  MessageCircle,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import {
  ACCOUNTANT_MAX_LIMIT,
  InvitableSchoolRole,
  ROLE_META,
  StaffInviteRecord,
} from '../../types/erp';
import { formatTimestampDisplay } from '../../utils/formatters';

export const TeamAccessModule: React.FC = () => {
  const {
    db,
    tenantMeta,
    currentUserEmail,
    isCurrentUserAdmin,
    schoolMembers,
    staffInvites,
    accountantMaxLimit,
    activeAccountantSeatsUsed,
    pendingAccountantInvitesCount,
    buildInviteRegistrationUrl,
    createStaffInvite,
    changeSchoolMemberRole,
    removeSchoolMember,
    revokeStaffInvite,
    cloudBinding,
    requestConfirm,
    notify,
  } = useSchool();

  const [invitedName, setInvitedName] = useState('');
  const [invitedEmail, setInvitedEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<InvitableSchoolRole>('teacher');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [activeShareInvite, setActiveShareInvite] = useState<StaffInviteRecord | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [busyMemberUid, setBusyMemberUid] = useState<string | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  const schoolName =
    tenantMeta?.schoolName?.trim() || db.schoolProfile?.schoolName?.trim() || 'School ERP';

  const totalAccountantCommitted =
    activeAccountantSeatsUsed + pendingAccountantInvitesCount;
  const accountantLimitReached = totalAccountantCommitted >= accountantMaxLimit;

  const teacherCount = useMemo(
    () => schoolMembers.filter((m) => m.role === 'teacher').length,
    [schoolMembers]
  );
  const directorCount = useMemo(
    () => schoolMembers.filter((m) => m.role === 'director').length,
    [schoolMembers]
  );

  const effectiveRole: InvitableSchoolRole =
    selectedRole === 'accountant' && accountantLimitReached ? 'teacher' : selectedRole;

  const copyToClipboard = async (url: string, idKey: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInviteId(idKey);
      notify(
        'success',
        'Invite Link Copied',
        'Share this registration link with the staff member via WhatsApp or Email.'
      );
      window.setTimeout(() => {
        setCopiedInviteId((prev) => (prev === idKey ? null : prev));
      }, 2500);
    } catch {
      notify(
        'info',
        'Select & Copy Link',
        'Clipboard access was blocked by the browser. Select the URL field to copy manually.'
      );
    }
  };

  const buildWhatsAppHref = (invite: StaffInviteRecord, inviteUrl: string): string => {
    const roleTitle = ROLE_META[invite.role].label;
    const message = [
      `Hello ${invite.invitedName || 'Staff Member'},`,
      '',
      `You have been invited to join *${schoolName}* as *${roleTitle}* on the Cloud School ERP Portal.`,
      '',
      `Invited Email: ${invite.invitedEmail}`,
      `Open in Google Chrome to set your password & access your dashboard:`,
      inviteUrl,
    ].join('\n');
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  };

  const buildMailtoHref = (invite: StaffInviteRecord, inviteUrl: string): string => {
    const roleTitle = ROLE_META[invite.role].label;
    const subject = `Staff Invitation: Join ${schoolName} (${roleTitle})`;
    const body = [
      `Hello ${invite.invitedName || 'Staff Member'},`,
      '',
      `You have been invited to join ${schoolName} with the role "${roleTitle}".`,
      '',
      `Assigned Login Email: ${invite.invitedEmail}`,
      `Registration Link (open in Google Chrome):`,
      inviteUrl,
      '',
      `Once opened, sign in with Google or set your Staff Password using ${invite.invitedEmail} to access your assigned dashboard.`,
    ].join('\n');
    return `mailto:${encodeURIComponent(invite.invitedEmail)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
  };

  const handleGenerateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!isCurrentUserAdmin) return;

    const cleanName = invitedName.trim();
    const cleanEmail = invitedEmail.trim().toLowerCase();

    if (!cleanName) {
      setFormError('Please enter the staff member’s full name.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFormError('Please enter a valid staff email address.');
      return;
    }
    if (effectiveRole === 'accountant' && accountantLimitReached) {
      setFormError(
        `Accountant seat limit reached (${ACCOUNTANT_MAX_LIMIT} maximum per school including pending invites).`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await createStaffInvite({
        invitedName: cleanName,
        invitedEmail: cleanEmail,
        role: effectiveRole,
      });
      if (!res.ok) {
        setFormError(res.error || 'Could not generate staff invitation link.');
        return;
      }
      setInvitedName('');
      setInvitedEmail('');
      if (res.invite) {
        setActiveShareInvite(res.invite);
      }
      if (res.inviteUrl && res.invite) {
        void copyToClipboard(res.inviteUrl, res.invite.id);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (memberUid: string, nextRole: InvitableSchoolRole) => {
    setBusyMemberUid(memberUid);
    try {
      const res = await changeSchoolMemberRole(memberUid, nextRole);
      if (!res.ok && res.error) {
        notify('error', 'Role Update Blocked', res.error);
      }
    } finally {
      setBusyMemberUid(null);
    }
  };

  const handleRevokeMember = (memberUid: string, email: string, name: string) => {
    requestConfirm({
      title: 'Revoke Staff Workspace Access',
      description: `Remove ${name || email} (${email}) from ${schoolName}? Their cloud access and assigned permissions will be revoked immediately.`,
      confirmLabel: 'Revoke Staff Access',
      destructive: true,
      onConfirm: () => {
        setBusyMemberUid(memberUid);
        void removeSchoolMember(memberUid).finally(() => {
          setBusyMemberUid(null);
        });
      },
    });
  };

  const handleRevokeInvite = (invite: StaffInviteRecord) => {
    requestConfirm({
      title: 'Revoke Pending Invite Link',
      description: `Invalidate the invitation link sent to ${invite.invitedEmail} (${ROLE_META[invite.role].shortLabel})?`,
      confirmLabel: 'Revoke Invite',
      destructive: true,
      onConfirm: () => {
        setBusyInviteId(invite.id);
        void revokeStaffInvite(invite.id).finally(() => {
          setBusyInviteId(null);
          if (activeShareInvite?.id === invite.id) {
            setActiveShareInvite(null);
          }
        });
      },
    });
  };

  if (!isCurrentUserAdmin) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Main Admin Permission Required
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Only the School Owner (Main Admin) can generate staff invite links, change role assignments, or revoke staff seats.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const activeShareUrl = activeShareInvite
    ? buildInviteRegistrationUrl(activeShareInvite.schoolId, activeShareInvite.id)
    : '';

  return (
    <section className="space-y-6">
      {/* 1. Role Seat Quotas & Access Matrix Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500">Main Admin (Owner)</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            1 / 1
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Full CRUD · Settings · In-App AI · Cloud Invites
          </p>
        </div>

        <div
          className={`rounded-xl border p-4 ${
            accountantLimitReached
              ? 'border-amber-300 bg-amber-50/40'
              : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700">Accountant Seats</p>
            <span className="font-mono text-[11px] font-semibold text-slate-500 tabular-nums">
              Max {accountantMaxLimit}
            </span>
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {activeAccountantSeatsUsed} / {accountantMaxLimit}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Admissions &amp; Fees Only
            {pendingAccountantInvitesCount > 0
              ? ` · ${pendingAccountantInvitesCount} Invite Pending`
              : ''}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-500">Teacher / Faculty</p>
            <span className="font-mono text-[11px] font-semibold text-slate-500">
              20+ Supported
            </span>
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {teacherCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Attendance &amp; Exam Marks Entry Only
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-500">
              Director / Principal / Head
            </p>
            <span className="font-mono text-[11px] font-semibold text-slate-500">
              Unlimited
            </span>
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {directorCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Strict Read-Only Analytics &amp; Reports
          </p>
        </div>
      </div>

      {/* 2. Generate Staff Invite Link Form + Share Callout */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                Invite Staff &amp; Generate Chrome Registration Link
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Enter staff email and select their system role. Share the generated link via WhatsApp or Email so they can set their password and open their assigned dashboard.
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right text-xs text-slate-500">
            {tenantMeta?.id && (
              <p className="font-mono tabular-nums">
                Workspace ID:{' '}
                <span className="font-semibold text-slate-800">{tenantMeta.id}</span>
              </p>
            )}
            <p className="mt-0.5 text-[11px] text-emerald-700 font-medium">
              Invite Token Cloud Target:{' '}
              {cloudBinding.provider === 'supabase'
                ? 'Personal Supabase Project'
                : cloudBinding.provider === 'firebase'
                ? 'Personal Firebase Project'
                : 'Managed Cloud Firestore'}
            </p>
          </div>
        </div>

        <form
          onSubmit={handleGenerateInvite}
          className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12"
        >
          <div className="space-y-4 lg:col-span-7">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Staff Full Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={invitedName}
                  onChange={(e) => setInvitedName(e.target.value)}
                  placeholder="e.g., Rajesh Kumar"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Staff Login Email <span className="text-rose-600">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={invitedEmail}
                  onChange={(e) => setInvitedEmail(e.target.value)}
                  placeholder="staff.member@gmail.com"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Assign System Role <span className="text-rose-600">*</span>
              </label>
              <select
                value={effectiveRole}
                onChange={(e) => setSelectedRole(e.target.value as InvitableSchoolRole)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-indigo-600 focus:outline-none"
              >
                <option value="teacher">
                  Teacher / Faculty (20+ Supported — Attendance &amp; Exam Marks Only)
                </option>
                <option value="accountant" disabled={accountantLimitReached}>
                  Accountant (Max {accountantMaxLimit} — Admissions &amp; Fee Management Only)
                  {accountantLimitReached ? ' — Seat Limit Reached' : ''}
                </option>
                <option value="director">
                  Director / Principal / Head Staff (Unlimited — Read-Only View Access)
                </option>
              </select>
            </div>

            {formError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                {formError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <Link2 className="h-4 w-4" />
                <span>
                  {submitting ? 'Generating Invite Link...' : 'Generate Invite Link'}
                </span>
              </button>
              {accountantLimitReached && (
                <span className="text-xs text-amber-700">
                  Accountant quota ({accountantMaxLimit}/{accountantMaxLimit}) is full. Revoke an existing Accountant or pending invite to free a seat.
                </span>
              )}
            </div>
          </div>

          {/* Right Column: Live Role Access Policy Preview */}
          <div className="lg:col-span-5">
            <div className="h-full rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-900">
                  {ROLE_META[effectiveRole].label}
                </p>
                <span className="font-mono text-[11px] font-semibold text-indigo-700">
                  {ROLE_META[effectiveRole].maxSeatsLabel}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                {ROLE_META[effectiveRole].summary}
              </p>
              <div className="mt-3 border-t border-slate-200/80 pt-3 text-[11px] text-slate-500 space-y-1">
                <p>
                  <strong className="text-slate-700">Tenant Isolation:</strong> Restricted strictly to{' '}
                  <span className="font-semibold text-slate-800">{schoolName}</span> records.
                </p>
                <p>
                  <strong className="text-slate-700">Onboarding:</strong> Staff clicks the link in Chrome, signs in with Google or sets a password for their invited email, and lands directly on their role dashboard.
                </p>
              </div>
            </div>
          </div>
        </form>

        {/* Shareable Registration Link Banner */}
        {activeShareInvite && activeShareUrl && (
          <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-slate-900">
                  Ready to Share · Invite Link for {activeShareInvite.invitedName} (
                  {ROLE_META[activeShareInvite.role].shortLabel})
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Assigned Email:{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {activeShareInvite.invitedEmail}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveShareInvite(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Dismiss
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
              <input
                type="text"
                readOnly
                value={activeShareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-800 focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => copyToClipboard(activeShareUrl, activeShareInvite.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  {copiedInviteId === activeShareInvite.id ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {copiedInviteId === activeShareInvite.id ? 'Copied' : 'Copy Link'}
                  </span>
                </button>

                <a
                  href={buildWhatsAppHref(activeShareInvite, activeShareUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>Share on WhatsApp</span>
                </a>

                <a
                  href={buildMailtoHref(activeShareInvite, activeShareUrl)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span>Send Email</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Active Workspace Members Roster */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <h3 className="text-base font-bold tracking-tight text-slate-900">
                Active School Team Accounts
              </h3>
              <p className="text-xs text-slate-500">
                Verified users currently authorized under Cloud Row-Level Security for {schoolName}.
              </p>
            </div>
          </div>
          <p className="font-mono text-xs font-semibold text-slate-600 tabular-nums">
            {schoolMembers.length} Active {schoolMembers.length === 1 ? 'Account' : 'Accounts'}
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-2.5 pr-4">Staff Member</th>
                <th className="px-4 py-2.5">Login Email</th>
                <th className="px-4 py-2.5">Assigned Role</th>
                <th className="px-4 py-2.5">Joined</th>
                <th className="py-2.5 pl-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schoolMembers.map((member) => {
                const isOwnerRow = member.role === 'main_admin';
                const isSelf =
                  Boolean(currentUserEmail) &&
                  member.email.toLowerCase() === currentUserEmail?.toLowerCase();
                const disablePromoteToAccountant =
                  member.role !== 'accountant' &&
                  activeAccountantSeatsUsed + pendingAccountantInvitesCount >=
                    accountantMaxLimit;

                return (
                  <tr key={member.uid} className="hover:bg-slate-50/70">
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-slate-900">
                        {member.displayName || 'School Staff'}
                        {isSelf ? (
                          <span className="ml-1.5 font-normal text-slate-500">· You</span>
                        ) : null}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">{member.email}</td>
                    <td className="px-4 py-3">
                      {isOwnerRow ? (
                        <span className="font-semibold text-indigo-700">
                          {ROLE_META.main_admin.label}
                        </span>
                      ) : (
                        <select
                          aria-label={`Change role for ${member.email}`}
                          disabled={busyMemberUid === member.uid}
                          value={member.role}
                          onChange={(e) =>
                            handleRoleChange(
                              member.uid,
                              e.target.value as InvitableSchoolRole
                            )
                          }
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-indigo-600 focus:outline-none disabled:opacity-60"
                        >
                          <option
                            value="accountant"
                            disabled={disablePromoteToAccountant}
                          >
                            Accountant
                            {disablePromoteToAccountant ? ' (Max 2 Full)' : ''}
                          </option>
                          <option value="teacher">Teacher / Faculty</option>
                          <option value="director">Director / Principal (View Only)</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500 tabular-nums">
                      {formatTimestampDisplay(member.createdAt)}
                    </td>
                    <td className="py-3 pl-4 text-right">
                      {isOwnerRow ? (
                        <span className="text-[11px] text-slate-400">Workspace Owner</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyMemberUid === member.uid}
                          onClick={() =>
                            handleRevokeMember(
                              member.uid,
                              member.email,
                              member.displayName
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60 whitespace-nowrap"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Revoke</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Pending & Past Staff Invite Links */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Users className="h-5 w-5 text-indigo-600 shrink-0" />
            <div>
              <h3 className="text-base font-bold tracking-tight text-slate-900">
                Staff Invitation Links
              </h3>
              <p className="text-xs text-slate-500">
                Track pending onboarding links or re-share registration URLs via WhatsApp or Email.
              </p>
            </div>
          </div>
          <p className="font-mono text-xs text-slate-500 tabular-nums">
            {staffInvites.filter((i) => i.status === 'pending').length} Pending ·{' '}
            {staffInvites.length} Total
          </p>
        </div>

        {staffInvites.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No staff invitations created yet. Use the form above to generate your first role-based invite link.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 pr-4">Invited Staff</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Created</th>
                  <th className="py-2.5 pl-4 text-right">Share / Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffInvites.map((invite) => {
                  const inviteUrl = buildInviteRegistrationUrl(
                    invite.schoolId,
                    invite.id
                  );
                  const isPending = invite.status === 'pending';

                  return (
                    <tr key={invite.id} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-4 font-semibold text-slate-900">
                        {invite.invitedName || 'Staff Member'}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {invite.invitedEmail}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {ROLE_META[invite.role]?.shortLabel || invite.role}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-semibold ${
                            invite.status === 'accepted'
                              ? 'text-emerald-700'
                              : invite.status === 'revoked'
                              ? 'text-slate-400'
                              : 'text-amber-700'
                          }`}
                        >
                          {invite.status === 'accepted'
                            ? 'Accepted'
                            : invite.status === 'revoked'
                            ? 'Revoked'
                            : 'Pending Claim'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500 tabular-nums">
                        {formatTimestampDisplay(invite.createdAt)}
                      </td>
                      <td className="py-3 pl-4 text-right">
                        {isPending ? (
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(inviteUrl, invite.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                            >
                              {copiedInviteId === invite.id ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                              <span>
                                {copiedInviteId === invite.id ? 'Copied' : 'Copy Link'}
                              </span>
                            </button>

                            <a
                              href={buildWhatsAppHref(invite, inviteUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              <span>WhatsApp</span>
                            </a>

                            <button
                              type="button"
                              disabled={busyInviteId === invite.id}
                              onClick={() => handleRevokeInvite(invite)}
                              className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60 whitespace-nowrap"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Revoke</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
