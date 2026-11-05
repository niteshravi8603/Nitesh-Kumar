import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Lock,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
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
import {
  GLOBAL_APP_TITLE,
  GLOBAL_CONTACT_EMAIL,
  GLOBAL_CONTACT_PHONE,
} from '../TopBrandContactBar';

type ManagementTab = 'direct-credentials' | 'invite-links';

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
    createStaffAccountWithCredentials,
    sendStaffPasswordReset,
    createStaffInvite,
    changeSchoolMemberRole,
    removeSchoolMember,
    revokeStaffInvite,
    requestConfirm,
    notify,
  } = useSchool();

  const [activeTab, setActiveTab] = useState<ManagementTab>('direct-credentials');

  // Direct Credentials Form State
  const [directName, setDirectName] = useState('');
  const [directEmail, setDirectEmail] = useState('');
  const [directPassword, setDirectPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [directRole, setDirectRole] = useState<InvitableSchoolRole>('teacher');
  const [directStaffId, setDirectStaffId] = useState('');
  const [submittingDirect, setSubmittingDirect] = useState(false);
  const [directError, setDirectError] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{
    fullName: string;
    email: string;
    password: string;
    role: InvitableSchoolRole;
    staffId?: string;
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Invite Link Generator Form State
  const [invitedName, setInvitedName] = useState('');
  const [invitedEmail, setInvitedEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<InvitableSchoolRole>('teacher');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [activeShareInvite, setActiveShareInvite] = useState<StaffInviteRecord | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // Processing state
  const [busyMemberUid, setBusyMemberUid] = useState<string | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const [resettingEmail, setResettingEmail] = useState<string | null>(null);

  const schoolName =
    tenantMeta?.schoolName?.trim() || db.schoolProfile?.schoolName?.trim() || GLOBAL_APP_TITLE;

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

  const effectiveInviteRole: InvitableSchoolRole =
    selectedRole === 'accountant' && accountantLimitReached ? 'teacher' : selectedRole;

  const effectiveDirectRole: InvitableSchoolRole =
    directRole === 'accountant' && accountantLimitReached ? 'teacher' : directRole;

  // Helper to generate a friendly, secure initial password
  const generateRandomPassword = () => {
    const prefixes = ['Nitesh', 'School', 'Campus', 'Edu', 'Staff'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    const pass = `${prefix}@${num}`;
    setDirectPassword(pass);
    setShowPassword(true);
  };

  const copyToClipboard = async (text: string, idKey: string, label = 'Copied') => {
    try {
      await navigator.clipboard.writeText(text);
      if (idKey === 'creds') {
        setCopiedCreds(true);
        setTimeout(() => setCopiedCreds(false), 2500);
      } else {
        setCopiedInviteId(idKey);
        setTimeout(() => setCopiedInviteId((prev) => (prev === idKey ? null : prev)), 2500);
      }
      notify('success', label, 'Copied to clipboard successfully.');
    } catch {
      notify('info', 'Clipboard Access', 'Select the text to copy manually.');
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
      '',
      `Support: ${GLOBAL_CONTACT_PHONE} · ${GLOBAL_CONTACT_EMAIL}`,
    ].join('\n');
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  };

  const buildCredentialsWhatsAppHref = (creds: {
    fullName: string;
    email: string;
    password: string;
    role: InvitableSchoolRole;
  }): string => {
    const roleTitle = ROLE_META[creds.role].label;
    const message = [
      `Hello ${creds.fullName},`,
      '',
      `Your staff account credentials for *${schoolName}* have been provisioned:`,
      '',
      `Role: *${roleTitle}*`,
      `Login ID / Email: ${creds.email}`,
      `Password: ${creds.password}`,
      '',
      `Sign In Portal: ${window.location.origin}`,
      '',
      `Please keep your credentials secure. For assistance, contact ${GLOBAL_CONTACT_PHONE}.`,
    ].join('\n');
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  };

  const buildCredentialsMailtoHref = (creds: {
    fullName: string;
    email: string;
    password: string;
    role: InvitableSchoolRole;
  }): string => {
    const roleTitle = ROLE_META[creds.role].label;
    const subject = `Your Staff Login Credentials for ${schoolName}`;
    const body = [
      `Hello ${creds.fullName},`,
      '',
      `Your staff login account for ${schoolName} has been created with role "${roleTitle}".`,
      '',
      `Assigned Login Email: ${creds.email}`,
      `Assigned Password: ${creds.password}`,
      `Portal Address: ${window.location.origin}`,
      '',
      `Sign in on any desktop computer or mobile browser using Google Chrome.`,
      '',
      `Helpdesk: ${GLOBAL_CONTACT_PHONE} · ${GLOBAL_CONTACT_EMAIL}`,
    ].join('\n');
    return `mailto:${encodeURIComponent(creds.email)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
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
      `Helpdesk: ${GLOBAL_CONTACT_PHONE} · ${GLOBAL_CONTACT_EMAIL}`,
    ].join('\n');
    return `mailto:${encodeURIComponent(invite.invitedEmail)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
  };

  // Direct Account Creation Handler
  const handleCreateDirectAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDirectError('');
    if (!isCurrentUserAdmin) return;

    const cleanName = directName.trim();
    const cleanEmail = directEmail.trim().toLowerCase();
    const cleanPassword = directPassword.trim();

    if (!cleanName || cleanName.length < 2) {
      setDirectError('Please enter the staff member’s full name.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setDirectError('Please enter a valid staff email address.');
      return;
    }
    if (!cleanPassword || cleanPassword.length < 6) {
      setDirectError('Password must be at least 6 characters long.');
      return;
    }
    if (effectiveDirectRole === 'accountant' && accountantLimitReached) {
      setDirectError(
        `Accountant seat limit reached (${accountantMaxLimit} maximum per school).`
      );
      return;
    }

    setSubmittingDirect(true);
    try {
      const res = await createStaffAccountWithCredentials({
        fullName: cleanName,
        email: cleanEmail,
        password: cleanPassword,
        role: effectiveDirectRole,
        staffProfileId: directStaffId || undefined,
      });

      if (!res.ok) {
        setDirectError(res.error || 'Could not provision staff account.');
        return;
      }

      setCreatedCredentials({
        fullName: cleanName,
        email: cleanEmail,
        password: cleanPassword,
        role: effectiveDirectRole,
        staffId: directStaffId || undefined,
      });

      setDirectName('');
      setDirectEmail('');
      setDirectPassword('');
      setDirectStaffId('');
    } finally {
      setSubmittingDirect(false);
    }
  };

  // Invite Link Handler
  const handleGenerateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    if (!isCurrentUserAdmin) return;

    const cleanName = invitedName.trim();
    const cleanEmail = invitedEmail.trim().toLowerCase();

    if (!cleanName) {
      setInviteError('Please enter the staff member’s full name.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setInviteError('Please enter a valid staff email address.');
      return;
    }
    if (effectiveInviteRole === 'accountant' && accountantLimitReached) {
      setInviteError(
        `Accountant seat limit reached (${accountantMaxLimit} maximum per school).`
      );
      return;
    }

    setSubmittingInvite(true);
    try {
      const res = await createStaffInvite({
        invitedName: cleanName,
        invitedEmail: cleanEmail,
        role: effectiveInviteRole,
      });
      if (!res.ok) {
        setInviteError(res.error || 'Could not generate staff invitation link.');
        return;
      }
      setInvitedName('');
      setInvitedEmail('');
      if (res.invite) {
        setActiveShareInvite(res.invite);
      }
      if (res.inviteUrl && res.invite) {
        void copyToClipboard(res.inviteUrl, res.invite.id, 'Invite Link Copied');
      }
    } finally {
      setSubmittingInvite(false);
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

  const handlePasswordReset = async (email: string) => {
    setResettingEmail(email);
    try {
      await sendStaffPasswordReset(email);
    } finally {
      setResettingEmail(null);
    }
  };

  const handleRevokeMember = (memberUid: string, email: string, name: string) => {
    requestConfirm({
      title: 'Revoke Staff Workspace Access',
      description: `Remove ${name || email} (${email}) from ${schoolName}? Their cloud login session and assigned permissions will be revoked immediately.`,
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
      description: `Invalidate the invitation link for ${invite.invitedEmail} (${ROLE_META[invite.role].shortLabel})?`,
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
              Only the School Main Admin can provision staff accounts, assign RBAC roles, or manage login credentials.
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
      {/* Module Title Banner */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                Staff &amp; User Management
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                <ShieldCheck className="h-3 w-3 text-emerald-600" />
                Multi-Tenant Cloud RLS Active
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Create and manage staff login credentials (Email/Login ID &amp; Passwords), enforce role permissions (Accountant, Teacher, Director), and control cloud access for {schoolName}.
            </p>
          </div>
        </div>

        <div className="text-left sm:text-right text-xs text-slate-500 shrink-0">
          <p className="font-mono text-[11px] text-slate-600">
            Storage: <strong className="text-emerald-700">Central Managed Cloud</strong>
          </p>
          <p className="font-mono text-[11px] text-slate-500">
            Helpdesk: {GLOBAL_CONTACT_PHONE}
          </p>
        </div>
      </div>

      {/* 1. Role Seat Quotas Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500">Main Admin (Owner)</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            1 / 1
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Full Administrative Authority &amp; Workspace Ownership
          </p>
        </div>

        <div
          className={`rounded-xl border p-4 shadow-2xs ${
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
            Admissions, Fee Collection &amp; Dues Only
            {pendingAccountantInvitesCount > 0
              ? ` · ${pendingAccountantInvitesCount} Invite Pending`
              : ''}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-500">Teacher / Faculty</p>
            <span className="font-mono text-[11px] font-semibold text-emerald-700">
              20+ Supported
            </span>
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {teacherCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Daily Attendance &amp; Exam Marks Upload Only
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-500">
              Director / Principal
            </p>
            <span className="font-mono text-[11px] font-semibold text-indigo-700">
              Unlimited
            </span>
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {directorCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Read-Only Analytics, Reports &amp; Registers
          </p>
        </div>
      </div>

      {/* 2. Staff Account Provisioning Form (Tabs: Direct Create vs. Registration Link) */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        {/* Provisioning Tab Switcher */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold tracking-tight text-slate-900">
              Provision Staff Account &amp; Access
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Create login credentials directly or generate a shareable registration link for faculty members.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                setActiveTab('direct-credentials');
                setDirectError('');
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'direct-credentials'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5 text-indigo-600" />
              <span>Direct Credentials</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('invite-links');
                setInviteError('');
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'invite-links'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Link2 className="h-3.5 w-3.5 text-indigo-600" />
              <span>Registration Link</span>
            </button>
          </div>
        </div>

        {/* Tab A: Direct Credentials Creation */}
        {activeTab === 'direct-credentials' && (
          <form
            onSubmit={handleCreateDirectAccount}
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
                    value={directName}
                    onChange={(e) => setDirectName(e.target.value)}
                    placeholder="e.g., Anita Verma"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Login ID / Email <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={directEmail}
                    onChange={(e) => setDirectEmail(e.target.value)}
                    placeholder="e.g., anita.teacher@gmail.com"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Staff Password (min. 6 characters) <span className="text-rose-600">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Generate Strong Password</span>
                  </button>
                </div>
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={directPassword}
                    onChange={(e) => setDirectPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 pr-10 text-sm font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Assign Role <span className="text-rose-600">*</span>
                  </label>
                  <select
                    value={effectiveDirectRole}
                    onChange={(e) => setDirectRole(e.target.value as InvitableSchoolRole)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 focus:border-indigo-600 focus:outline-none"
                  >
                    <option value="teacher">Teacher / Faculty (Attendance &amp; Marks)</option>
                    <option value="accountant" disabled={accountantLimitReached}>
                      Accountant (Admissions &amp; Fees · Max {accountantMaxLimit})
                      {accountantLimitReached ? ' — Limit Reached' : ''}
                    </option>
                    <option value="director">Director / Principal (Read-Only Analytics)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Link Staff Profile (Optional)
                  </label>
                  <select
                    value={directStaffId}
                    onChange={(e) => setDirectStaffId(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  >
                    <option value="">— Unlinked / Standalone Login —</option>
                    {db.staff.map((stf) => (
                      <option key={stf.id} value={stf.staffId || stf.id}>
                        {stf.staffId ? `${stf.staffId} - ` : ''}{stf.fullName} ({stf.designation})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {directError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                  {directError}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={submittingDirect}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>
                    {submittingDirect ? 'Provisioning Account...' : 'Create Staff Login Account'}
                  </span>
                </button>
                {accountantLimitReached && (
                  <span className="text-xs text-amber-700">
                    Accountant quota ({accountantMaxLimit}/{accountantMaxLimit}) reached.
                  </span>
                )}
              </div>
            </div>

            {/* Right Column: Live Role Scope Card */}
            <div className="lg:col-span-5">
              <div className="h-full rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-900">
                    {ROLE_META[effectiveDirectRole].label}
                  </p>
                  <span className="font-mono text-[11px] font-semibold text-indigo-700">
                    {ROLE_META[effectiveDirectRole].maxSeatsLabel}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  {ROLE_META[effectiveDirectRole].summary}
                </p>
                <div className="mt-4 border-t border-slate-200/80 pt-3 text-[11px] text-slate-500 space-y-1.5">
                  <p>
                    <strong className="text-slate-700">Immediate Access:</strong> The created account can immediately sign in on the main portal using the Email &amp; Password.
                  </p>
                  <p>
                    <strong className="text-slate-700">School Isolation:</strong> Bound strictly to <span className="font-semibold text-slate-800">{schoolName}</span> cloud records.
                  </p>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Tab B: Invite Link Generator */}
        {activeTab === 'invite-links' && (
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
                  value={effectiveInviteRole}
                  onChange={(e) => setSelectedRole(e.target.value as InvitableSchoolRole)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  <option value="teacher">
                    Teacher / Faculty (Attendance &amp; Exam Marks Only)
                  </option>
                  <option value="accountant" disabled={accountantLimitReached}>
                    Accountant (Admissions &amp; Fees · Max {accountantMaxLimit})
                    {accountantLimitReached ? ' — Seat Limit Reached' : ''}
                  </option>
                  <option value="director">
                    Director / Principal (Read-Only View Access)
                  </option>
                </select>
              </div>

              {inviteError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                  {inviteError}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={submittingInvite}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap"
                >
                  <Link2 className="h-4 w-4" />
                  <span>
                    {submittingInvite ? 'Generating Invite Link...' : 'Generate Invite Link'}
                  </span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="h-full rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-bold text-slate-900">
                  Self-Registration via Chrome
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  When you generate an invite link, the staff member opens it in Google Chrome to authenticate via Google or create their own password.
                </p>
                <div className="mt-4 border-t border-slate-200/80 pt-3 text-[11px] text-slate-500 space-y-1.5">
                  <p>
                    <strong className="text-slate-700">Cloud Sync:</strong> Links are cryptographically validated in Cloud Firestore.
                  </p>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Recently Created Credentials Callout Banner */}
        {createdCredentials && (
          <div className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50/70 p-4.5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/80 pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-emerald-700" />
                <p className="text-xs font-bold text-slate-900">
                  Credentials Created Successfully · Ready to Share
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreatedCredentials(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Dismiss
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
              <div className="rounded-lg bg-white p-2.5 border border-emerald-200">
                <span className="text-[10px] uppercase font-bold text-slate-500">Staff Member</span>
                <p className="font-bold text-slate-900 mt-0.5">{createdCredentials.fullName}</p>
                <p className="text-[11px] text-emerald-700 font-semibold">{ROLE_META[createdCredentials.role].label}</p>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-emerald-200">
                <span className="text-[10px] uppercase font-bold text-slate-500">Login ID / Email</span>
                <p className="font-mono font-bold text-slate-900 mt-0.5">{createdCredentials.email}</p>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-emerald-200">
                <span className="text-[10px] uppercase font-bold text-slate-500">Initial Password</span>
                <p className="font-mono font-bold text-slate-900 mt-0.5 tracking-wider">{createdCredentials.password}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    `Staff Credentials for ${schoolName}:\nLogin: ${createdCredentials.email}\nPassword: ${createdCredentials.password}\nPortal: ${window.location.origin}`,
                    'creds',
                    'Credentials Copied'
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
              >
                {copiedCreds ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiedCreds ? 'Copied Details' : 'Copy Login Details'}</span>
              </button>

              <a
                href={buildCredentialsWhatsAppHref(createdCredentials)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span>Share via WhatsApp</span>
              </a>

              <a
                href={buildCredentialsMailtoHref(createdCredentials)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Send via Email</span>
              </a>
            </div>
          </div>
        )}

        {/* Shareable Registration Link Banner */}
        {activeShareInvite && activeShareUrl && (
          <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-slate-900">
                  Ready to Share · Registration Link for {activeShareInvite.invitedName} (
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
                  onClick={() =>
                    copyToClipboard(activeShareUrl, activeShareInvite.id, 'Invite Link Copied')
                  }
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
                  <span>WhatsApp</span>
                </a>

                <a
                  href={buildMailtoHref(activeShareInvite, activeShareUrl)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span>Email</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Active School Users & Credentials Roster */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <h3 className="text-base font-bold tracking-tight text-slate-900">
                Active School Team Accounts &amp; Credentials
              </h3>
              <p className="text-xs text-slate-500">
                Verified user accounts authorized under Cloud Row-Level Security for {schoolName}.
              </p>
            </div>
          </div>
          <p className="font-mono text-xs font-semibold text-slate-600 tabular-nums">
            {schoolMembers.length} Active {schoolMembers.length === 1 ? 'Account' : 'Accounts'}
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-2.5 pr-4">Staff Member</th>
                <th className="px-4 py-2.5">Login ID / Email</th>
                <th className="px-4 py-2.5">Assigned Role</th>
                <th className="px-4 py-2.5">Access Scope</th>
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

                // Match with HR staff profile
                const matchedStaff = db.staff.find(
                  (s) =>
                    (member.staffProfileId && (s.staffId === member.staffProfileId || s.id === member.staffProfileId)) ||
                    s.fullName.toLowerCase() === member.displayName.toLowerCase()
                );

                return (
                  <tr key={member.uid} className="hover:bg-slate-50/70">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                          {member.displayName ? member.displayName.slice(0, 1).toUpperCase() : 'S'}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">
                            {member.displayName || 'School Staff'}
                            {isSelf ? (
                              <span className="ml-1.5 font-normal text-slate-500">· You</span>
                            ) : null}
                          </p>
                          {matchedStaff && (
                            <span className="inline-block rounded bg-indigo-50 px-1.5 py-0.2 text-[10px] font-mono text-indigo-700">
                              {matchedStaff.staffId || 'Staff'} · {matchedStaff.designation}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">{member.email}</td>
                    <td className="px-4 py-3">
                      {isOwnerRow ? (
                        <span className="font-bold text-indigo-700">
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
                    <td className="px-4 py-3 text-[11px] text-slate-600">
                      {member.role === 'main_admin' && 'Full ERP Access · All Modules'}
                      {member.role === 'accountant' && 'Admissions · Fees · Data Import'}
                      {member.role === 'teacher' && 'Daily Attendance · Marks Entry'}
                      {member.role === 'director' && 'Read-Only Analytics · Reports'}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500 tabular-nums">
                      {formatTimestampDisplay(member.createdAt)}
                    </td>
                    <td className="py-3 pl-4 text-right">
                      {isOwnerRow ? (
                        <span className="text-[11px] text-slate-400">Workspace Owner</span>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={resettingEmail === member.email}
                            onClick={() => handlePasswordReset(member.email)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
                            title="Send password reset link to staff email"
                          >
                            <RefreshCw className={`h-3 w-3 ${resettingEmail === member.email ? 'animate-spin' : ''}`} />
                            <span>Reset Pass</span>
                          </button>

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
                            className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60 whitespace-nowrap"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Revoke</span>
                          </button>
                        </div>
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
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Link2 className="h-5 w-5 text-indigo-600 shrink-0" />
            <div>
              <h3 className="text-base font-bold tracking-tight text-slate-900">
                Registration &amp; Onboarding Links
              </h3>
              <p className="text-xs text-slate-500">
                Track pending registration links or re-share URLs via WhatsApp or Email.
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
            No registration links created yet. Use the form above to provision staff accounts directly or generate an invite link.
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
                              onClick={() =>
                                copyToClipboard(inviteUrl, invite.id, 'Invite Link Copied')
                              }
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
