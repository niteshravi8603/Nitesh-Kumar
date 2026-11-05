import React, { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MailCheck,
  MessageCircle,
  Phone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  hasLegacyLocalDatabaseRecords,
  useSchool,
} from '../context/SchoolContext';
import { ROLE_META, SubscriptionPlan } from '../types/erp';
import {
  AcademicBrandCrest,
  GLOBAL_APP_TITLE,
  GLOBAL_CONTACT_EMAIL,
  GLOBAL_CONTACT_PHONE,
  TopBrandContactBar,
} from './TopBrandContactBar';

type InviteAuthTab = 'set-password' | 'signin';

const GoogleMark: React.FC = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M21.35 11.1h-9.17v2.73h6.51c-.33 1.81-1.5 3.34-3.2 4.37v3.62h5.18c3.03-2.79 4.78-6.9 4.78-11.77 0-.8-.08-1.57-.22-2.31l-3.88.36z"
      opacity="0.95"
    />
    <path
      fill="currentColor"
      d="M12.18 22c4.32 0 7.95-1.43 10.6-3.88l-5.18-3.62c-1.43.96-3.26 1.53-5.42 1.53-4.17 0-7.7-2.81-8.96-6.6H-2.1v3.73C.54 18.4 5.94 22 12.18 22z"
      opacity="0.85"
    />
    <path
      fill="currentColor"
      d="M3.22 9.43A9.6 9.6 0 0 1 2.71 6.4c0-1.05.18-2.07.51-3.03V-.36H-2.1A15.96 15.96 0 0 0-3.82 6.4c0 2.58.62 5.02 1.72 7.16l5.32-4.13z"
      opacity="0.75"
    />
    <path
      fill="currentColor"
      d="M12.18 2.77c2.35 0 4.46.81 6.12 2.4l4.59-4.59C20.12-1.99 16.5-3.2 12.18-3.2 5.94-3.2.54.4-2.1 5.64l5.32 4.13c1.26-3.79 4.79-7 8.96-7z"
    />
  </svg>
);

export const AuthGate: React.FC = () => {
  const {
    authReady,
    firebaseUserEmail,
    firebaseUserDisplayName,
    needsEmailVerification,
    needsSchoolOnboarding,
    cloudSyncStatus,
    firebaseProjectId,
    firestoreDatabaseId,
    pendingInviteParams,
    pendingInviteDoc,
    pendingInviteStatus,
    claimPendingInvite,
    dismissPendingInvite,
    registerSchoolWorkspace,
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    resendVerificationEmail,
    refreshEmailVerificationStatus,
    retryCloudConnection,
    signOutStaff,
  } = useSchool();

  const legacyInfo = useMemo(() => hasLegacyLocalDatabaseRecords(), []);

  const isMasterAdminEmail =
    Boolean(firebaseUserEmail) &&
    firebaseUserEmail?.trim().toLowerCase() === GLOBAL_CONTACT_EMAIL.toLowerCase();

  const [inviteAuthTab, setInviteAuthTab] = useState<InviteAuthTab>('set-password');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  // Sign-In / Staff Password inputs
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [staffFullName, setStaffFullName] = useState('');

  // Master Admin School Setup inputs
  const [regSchoolName, setRegSchoolName] = useState(
    legacyInfo.hasRecords ? legacyInfo.schoolName : GLOBAL_APP_TITLE
  );
  const [regOwnerName, setRegOwnerName] = useState(
    firebaseUserDisplayName || 'Nitesh Kumar'
  );
  const [regPhone, setRegPhone] = useState(GLOBAL_CONTACT_PHONE);
  const [regAddress, setRegAddress] = useState('');
  const [regTagline, setRegTagline] = useState(
    'Recognized Institutional ERP & Academic Management'
  );
  const [regPlan, setRegPlan] = useState<SubscriptionPlan>('Enterprise');
  const [importLegacy, setImportLegacy] = useState<boolean>(legacyInfo.hasRecords);

  const isInitializing =
    !authReady || cloudSyncStatus === 'initializing' || cloudSyncStatus === 'syncing';
  const isSyncFailed =
    authReady &&
    (cloudSyncStatus === 'error' || cloudSyncStatus === 'quota-exceeded') &&
    Boolean(firebaseUserEmail);

  const handleGoogleAuth = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setBusy(true);
    try {
      const res = await signInWithGoogle();
      if (!res.ok && res.error) {
        setErrorMsg(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    setBusy(true);
    try {
      const res = await signInWithEmail(loginEmail, loginPassword);
      if (!res.ok && res.error) {
        setErrorMsg(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleInvitePasswordCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    setBusy(true);
    try {
      const res = await registerWithEmail(loginEmail, loginPassword, staffFullName);
      if (!res.ok && res.error) {
        setErrorMsg(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerifiedSchoolSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!regSchoolName.trim()) {
      setErrorMsg('Please enter your official School Name.');
      return;
    }
    setBusy(true);
    try {
      const res = await registerSchoolWorkspace({
        schoolName: regSchoolName.trim(),
        tagline: regTagline.trim(),
        address: regAddress.trim(),
        phone: regPhone.trim(),
        adminDisplayName: (regOwnerName || firebaseUserDisplayName || 'Super Admin Nitesh Kumar').trim(),
        subscriptionPlan: regPlan,
        importLegacyLocal: importLegacy,
        cloudBinding: {
          provider: 'managed',
          apiUrl: '',
          publicKey: '',
        },
      });
      if (!res.ok && res.error) {
        setErrorMsg(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCheckVerification = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setBusy(true);
    try {
      const res = await refreshEmailVerificationStatus();
      if (!res.verified) {
        setErrorMsg(
          res.error ||
            'Email is not verified yet. Click the verification link sent to your inbox, then try again.'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setBusy(true);
    try {
      const res = await resendVerificationEmail();
      if (res.ok) {
        setInfoMsg('A fresh verification link has been sent to your email inbox.');
      } else if (res.error) {
        setErrorMsg(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptInvite = async () => {
    setErrorMsg('');
    setBusy(true);
    try {
      const res = await claimPendingInvite();
      if (!res.ok && res.error) {
        setErrorMsg(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Top Bar Contact Banner on Login / Landing Screen */}
      <TopBrandContactBar fullWidthContainer={false} />

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:py-10">
        <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
          {/* Top SaaS Brand Header */}
          <div className="flex flex-col items-center text-center">
            <AcademicBrandCrest size="lg" variant="indigo" />
            <h1
              className="mt-4 font-display text-lg font-bold tracking-tight text-slate-900 sm:text-xl"
              style={{ textWrap: 'balance' }}
            >
              {GLOBAL_APP_TITLE}
            </h1>
            <p className="mt-1 text-xs font-medium text-slate-600 sm:text-sm">
              {pendingInviteParams
                ? 'School Staff Invitation Portal — Set up your staff credentials'
                : needsSchoolOnboarding
                ? 'Master Admin School Setup · Provision Workspace'
                : 'Multi-Tenant Academic ERP · Isolated School Workspaces · Role-Based Access'}
            </p>
          </div>

        {/* 1. Initializing / Syncing Spinner */}
        {isInitializing ? (
          <div className="mt-7 flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50/70 px-6 py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            <p className="mt-3 text-sm font-semibold text-slate-900">
              Connecting to Encrypted School Cloud...
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Verifying tenant membership and role permissions
            </p>
          </div>
        ) : isSyncFailed ? (
          /* 2. Cloud Connection / Quota Recovery */
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs leading-relaxed text-amber-950">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-bold text-amber-950">
                    {cloudSyncStatus === 'quota-exceeded'
                      ? 'Cloud Firestore Daily Quota Reached'
                      : 'Cloud Database Connection Interrupted'}
                  </p>
                  <p className="mt-1 text-amber-900">
                    Signed in as <strong className="font-mono">{firebaseUserEmail}</strong>.{' '}
                    {cloudSyncStatus === 'quota-exceeded'
                      ? `Free daily quota resets tomorrow (${firebaseProjectId} / ${firestoreDatabaseId}).`
                      : 'Click Retry Connection below to reconnect to your school workspace.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={retryCloudConnection}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 whitespace-nowrap"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Retry Cloud Connection</span>
              </button>
              <button
                type="button"
                onClick={signOutStaff}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out &amp; Switch Account</span>
              </button>
            </div>
          </div>
        ) : needsEmailVerification ? (
          /* 3. Email Verification Step (Required by Cloud Security Rules for Email/Password accounts) */
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 text-xs leading-relaxed text-slate-800">
              <div className="flex items-start gap-2.5">
                <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                <div>
                  <p className="font-bold text-slate-900">
                    Verify Your Email Address to Activate Cloud Security
                  </p>
                  <p className="mt-1 text-slate-700">
                    We sent a verification link to{' '}
                    <strong className="font-mono text-slate-900">{firebaseUserEmail}</strong>.
                    Open your inbox, click the verification link, and then click{' '}
                    <strong>I’ve Verified My Email</strong> below.
                  </p>
                </div>
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                {errorMsg}
              </div>
            )}
            {infoMsg && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
                {infoMsg}
              </div>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={handleCheckVerification}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>I’ve Verified My Email — Continue</span>
            </button>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleResendVerification}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
              >
                Resend Verification Email
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={signOutStaff}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
              >
                Use Google Sign-In Instead
              </button>
            </div>
          </div>
        ) : pendingInviteParams && firebaseUserEmail ? (
          /* 4. Authenticated Staff Invite Claim Screen */
          <div className="mt-6 space-y-4">
            {pendingInviteStatus === 'loading' ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50/70 px-6 py-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  Validating Staff Invitation...
                </p>
              </div>
            ) : pendingInviteStatus === 'ready' && pendingInviteDoc ? (
              <>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs leading-relaxed text-slate-800">
                  <div className="flex items-start gap-3">
                    <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-900">
                        Invitation Verified for {pendingInviteDoc.schoolName}
                      </p>
                      <p className="text-slate-700">
                        Assigned System Role:{' '}
                        <strong className="text-slate-900">
                          {ROLE_META[pendingInviteDoc.role]?.label || pendingInviteDoc.role}
                        </strong>
                      </p>
                      <p className="text-slate-600">
                        Signed in as{' '}
                        <span className="font-mono font-semibold text-slate-900">
                          {firebaseUserEmail}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                {errorMsg && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={handleAcceptInvite}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>
                    {busy ? 'Activating Role Access...' : 'Accept Invite & Open Dashboard'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={dismissPendingInvite}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Dismiss Invite Link
                </button>
              </>
            ) : pendingInviteStatus === 'email_mismatch' ? (
              <>
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs leading-relaxed text-amber-950">
                  <p className="font-bold">Signed-In Email Does Not Match Invitation</p>
                  <p className="mt-1">
                    You are currently signed in as{' '}
                    <strong className="font-mono">{firebaseUserEmail}</strong>, which does not
                    match the email address this invite link was issued to. Sign out and log in
                    with your invited staff email address.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={signOutStaff}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out &amp; Use Invited Email</span>
                  </button>
                  <button
                    type="button"
                    onClick={dismissPendingInvite}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Continue Without Invite
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-xs leading-relaxed text-rose-900">
                  <p className="font-bold">Invite Link Expired, Revoked, or Already Claimed</p>
                  <p className="mt-1">
                    Ask your School Main Admin to send a fresh invite link if you still need access.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissPendingInvite}
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Continue to Portal
                </button>
              </>
            )}
          </div>
        ) : pendingInviteParams && !firebaseUserEmail ? (
          /* 5. Unauthenticated Staff Invite Onboarding (Chrome Link Landing) */
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-xs leading-relaxed text-slate-700">
              <strong className="text-slate-900">Staff Onboarding Link Detected:</strong> Sign in
              with Google using your invited Gmail, or create your Staff Password below using the
              exact email address your Admin invited.
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={handleGoogleAuth}
              className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
              <span>Continue with Invited Google Account</span>
            </button>

            <div className="relative py-1 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <span className="relative bg-white px-3 text-[11px] font-medium text-slate-400">
                OR USE EMAIL &amp; PASSWORD
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setInviteAuthTab('set-password');
                  setErrorMsg('');
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  inviteAuthTab === 'set-password'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Set Staff Password
              </button>
              <button
                type="button"
                onClick={() => {
                  setInviteAuthTab('signin');
                  setErrorMsg('');
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  inviteAuthTab === 'signin'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Existing Account Login
              </button>
            </div>

            <form
              onSubmit={
                inviteAuthTab === 'set-password'
                  ? handleInvitePasswordCreate
                  : handleEmailSignIn
              }
              className="space-y-3"
            >
              {inviteAuthTab === 'set-password' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Your Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={staffFullName}
                    onChange={(e) => setStaffFullName(e.target.value)}
                    placeholder="e.g., Priya Sharma"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Invited Staff Email
                </label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="invited.staff@gmail.com"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  {inviteAuthTab === 'set-password'
                    ? 'Create Password (min. 6 characters)'
                    : 'Password'}
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>
                  {inviteAuthTab === 'set-password'
                    ? 'Set Password & Verify Invite'
                    : 'Sign In & Claim Invite'}
                </span>
              </button>
            </form>

            <button
              type="button"
              onClick={dismissPendingInvite}
              className="w-full text-center text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Cancel invite &amp; return to main portal
            </button>
          </div>
        ) : needsSchoolOnboarding && firebaseUserEmail ? (
          isMasterAdminEmail ? (
            /* Master Admin Workspace Setup */
            <form onSubmit={handleVerifiedSchoolSetup} className="mt-6 space-y-4">
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-xs text-slate-700">
                Signed in as Super Admin <strong className="font-mono text-slate-900">{firebaseUserEmail}</strong>.
                Initialize the central school cloud workspace below.
              </div>

              {errorMsg && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Official School Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={regSchoolName}
                    onChange={(e) => setRegSchoolName(e.target.value)}
                    placeholder="NITESH SCHOOL MANAGEMENT SYSTEM"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Super Admin / Owner Name
                  </label>
                  <input
                    type="text"
                    value={regOwnerName}
                    onChange={(e) => setRegOwnerName(e.target.value)}
                    placeholder="Nitesh Kumar"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Contact Phone / WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="+91 8603219331"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Campus Address / City
                  </label>
                  <input
                    type="text"
                    value={regAddress}
                    onChange={(e) => setRegAddress(e.target.value)}
                    placeholder="Main Campus, District, State"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Workspace Plan Tier
                  </label>
                  <select
                    value={regPlan}
                    onChange={(e) => setRegPlan(e.target.value as SubscriptionPlan)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  >
                    <option value="Enterprise">
                      Enterprise SaaS (1 Admin · Max 2 Accountants · 20+ Teachers · Unlimited Directors)
                    </option>
                    <option value="Standard">Standard Institutional Plan</option>
                    <option value="Starter">Starter Campus Plan</option>
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-slate-700">
                <p className="font-semibold text-emerald-800">
                  Central Managed Cloud Storage: Active
                </p>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  All school records will automatically persist to Central Managed Cloud Firestore with multi-tenant row-level isolation.
                </p>
              </div>

              {legacyInfo.hasRecords && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={importLegacy}
                    onChange={(e) => setImportLegacy(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span>
                    Import existing browser records ({legacyInfo.studentCount} students,{' '}
                    {legacyInfo.feeCount} fee receipts from <strong>{legacyInfo.schoolName}</strong>)
                    into this new cloud school workspace.
                  </span>
                </label>
              )}

              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Building2 className="h-4 w-4" />
                  )}
                  <span>
                    {busy ? 'Initializing School Cloud...' : 'Initialize School Workspace'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={signOutStaff}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </form>
          ) : (
            /* Unauthorized User Notice */
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-5">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-600 text-white">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      School Access Restricted · Authorization Required
                    </h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Signed in as <strong className="font-mono text-slate-900">{firebaseUserEmail}</strong>.
                      This account is not linked to an active school workspace. Public self-signup is disabled.
                    </p>
                    <p className="mt-2 text-xs font-medium text-slate-700">
                      Access to <strong className="text-slate-900">{GLOBAL_APP_TITLE}</strong> is provisioned exclusively by Super Admin Nitesh Kumar. Please contact the administrator below to activate your school or obtain your staff credentials:
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3.5 text-xs text-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-600">Super Admin:</span>
                    <span className="font-bold text-slate-900">Nitesh Kumar</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-600">Phone / WhatsApp:</span>
                    <a
                      href={`https://wa.me/918603219331?text=Hello%20Nitesh%20Kumar,%20I%20would%20like%20to%20request%20school%20access%20for%20my%20account%20(${encodeURIComponent(firebaseUserEmail)})`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-bold text-indigo-700 hover:underline inline-flex items-center gap-1"
                    >
                      <Phone className="h-3 w-3" />
                      <span>{GLOBAL_CONTACT_PHONE}</span>
                    </a>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-600">Email:</span>
                    <a
                      href={`mailto:${GLOBAL_CONTACT_EMAIL}?subject=School%20Access%20Request%20-%20${encodeURIComponent(firebaseUserEmail)}`}
                      className="font-mono font-bold text-indigo-700 hover:underline inline-flex items-center gap-1"
                    >
                      <Mail className="h-3 w-3" />
                      <span>{GLOBAL_CONTACT_EMAIL}</span>
                    </a>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <a
                    href={`https://wa.me/918603219331?text=Hello%20Nitesh%20Kumar,%20I%20would%20like%20to%20request%20school%20access%20for%20my%20account%20(${encodeURIComponent(firebaseUserEmail)})`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>Chat on WhatsApp</span>
                  </a>
                  <a
                    href={`mailto:${GLOBAL_CONTACT_EMAIL}?subject=School%20Access%20Request%20-%20${encodeURIComponent(firebaseUserEmail)}`}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>Email Super Admin</span>
                  </a>
                  <button
                    type="button"
                    onClick={signOutStaff}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </div>
          )
        ) : (
          /* Main Unauthenticated Portal: Sign In Only */
          <div className="mt-6 space-y-4">
            {errorMsg && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={handleGoogleAuth}
              className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
              <span>Sign In with Google</span>
            </button>

            <div className="relative py-1 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <span className="relative bg-white px-3 text-[11px] font-medium text-slate-400">
                OR EMAIL &amp; PASSWORD
              </span>
            </div>

            <form onSubmit={handleEmailSignIn} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Staff / Admin Email
                </label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="name@school.edu.in or niteshravi8603@gmail.com"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
              >
                <KeyRound className="h-4 w-4" />
                <span>Sign In to School Workspace</span>
              </button>
            </form>

            {/* Super Admin Controlled Authentication Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Super-Admin Controlled Authentication</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600">
                Public self-registration is disabled. Master Admin &amp; Staff accounts (Accountants, Teachers, Directors) are generated exclusively by Super Admin Nitesh Kumar.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-2 text-[11px] text-slate-700">
                <span className="font-semibold text-slate-600">Contact Super Admin:</span>
                <div className="flex items-center gap-3 font-mono font-bold">
                  <a
                    href="https://wa.me/918603219331?text=Hello%20Nitesh%20Kumar,%20I%20would%20like%20to%20request%20access%20to%20the%20School%20Management%20System."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-700 hover:underline inline-flex items-center gap-1"
                  >
                    <MessageCircle className="h-3 w-3" />
                    <span>{GLOBAL_CONTACT_PHONE}</span>
                  </a>
                  <span className="text-slate-300">·</span>
                  <a
                    href={`mailto:${GLOBAL_CONTACT_EMAIL}?subject=School%20Access%20Request`}
                    className="text-indigo-700 hover:underline inline-flex items-center gap-1"
                  >
                    <Mail className="h-3 w-3" />
                    <span>{GLOBAL_CONTACT_EMAIL}</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-1.5 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
          <div className="flex items-center justify-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>Multi-Tenant Cloud RLS · Isolated School IDs · Strict RBAC</span>
          </div>
          <p className="font-mono text-[11px] text-slate-500 tabular-nums">
            Helpdesk: {GLOBAL_CONTACT_PHONE} · {GLOBAL_CONTACT_EMAIL}
          </p>
        </div>
        </div>
      </div>
    </div>
  );
};
