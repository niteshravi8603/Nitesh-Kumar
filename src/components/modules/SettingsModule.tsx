import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Database,
  Download,
  Upload,
  RotateCcw,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  GraduationCap,
  Save,
  Trash2,
  FileSpreadsheet,
  FileJson,
  Users,
  ArrowRight,
  Layers,
  Loader2,
  Wand2,
  Feather,
  Stamp,
} from 'lucide-react';
import { DEFAULT_SCHOOL_PROFILE, useSchool } from '../../context/SchoolContext';
import {
  DynamicCloudBinding,
  ROLE_META,
  SchoolProfileSettings,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../types/erp';
import { CloudBindingConfigFields } from '../CloudBindingConfigFields';
import { downloadFullBackupJson } from '../../utils/backupExport';
import { formatTimestampDisplay } from '../../utils/formatters';

export interface SettingsModuleProps {
  sectionMode?: 'school-settings' | 'database-backups' | 'all';
}

export const SettingsModule: React.FC<SettingsModuleProps> = ({ sectionMode = 'all' }) => {
  const {
    db,
    tenantMeta,
    isCurrentUserAdmin,
    schoolMembers,
    staffInvites,
    accountantMaxLimit,
    activeAccountantSeatsUsed,
    updateSubscriptionPlan,
    uploadCloudMedia,
    updateSchoolProfile,
    exportBackupJson,
    exportBackupExcel,
    importBackupJson,
    resetSystemData,
    requestConfirm,
    setActiveModule,
    setRegisterSchoolModalOpen,
    cloudBinding,
    updateCloudBinding,
    setAiDrawerOpen,
    notify,
  } = useSchool();

  // School Profile & Branding Form State
  const [profileForm, setProfileForm] = useState<SchoolProfileSettings>(() => ({
    ...DEFAULT_SCHOOL_PROFILE,
    ...db.schoolProfile,
  }));
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Dynamic User-Owned Cloud Binding State
  const [draftCloudBinding, setDraftCloudBinding] = useState<DynamicCloudBinding>(() => ({
    ...cloudBinding,
  }));
  const [savingBinding, setSavingBinding] = useState(false);

  // Backup & Reset State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [signOutAfterReset, setSignOutAfterReset] = useState(false);
  const [importError, setImportError] = useState('');

  useEffect(() => {
    setProfileForm({
      ...DEFAULT_SCHOOL_PROFILE,
      ...db.schoolProfile,
    });
  }, [db.schoolProfile]);

  useEffect(() => {
    setDraftCloudBinding({ ...cloudBinding });
  }, [cloudBinding]);

  const handleSaveCloudBinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCurrentUserAdmin) return;
    setSavingBinding(true);
    try {
      await updateCloudBinding(draftCloudBinding);
    } finally {
      setSavingBinding(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const uploaded = await uploadCloudMedia(file, 'school-logo', 'school_logo_main');
      setProfileForm((prev) => ({ ...prev, logoDataUrl: uploaded.displayUrl }));
      notify(
        'success',
        'Logo Uploaded to Cloud Storage',
        'Click "Save School Profile & Branding" to apply the new emblem globally.'
      );
    } catch (err) {
      notify(
        'error',
        'Logo Upload Failed',
        err instanceof Error ? err.message : 'Please select a valid PNG or JPG image.'
      );
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [uploadingStamp, setUploadingStamp] = useState(false);
  const signatureInputRef = useRef<HTMLInputElement | null>(null);
  const stampInputRef = useRef<HTMLInputElement | null>(null);

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSignature(true);
    try {
      const uploaded = await uploadCloudMedia(file, 'school-logo', 'school_signature');
      setProfileForm((prev) => ({ ...prev, signatureDataUrl: uploaded.displayUrl }));
      notify(
        'success',
        'Digital Signature Uploaded',
        'Click "Save School Profile & Verification" to apply the signature across all documents.'
      );
    } catch (err) {
      notify(
        'error',
        'Signature Upload Failed',
        err instanceof Error ? err.message : 'Please select a valid PNG or JPG image.'
      );
    } finally {
      setUploadingSignature(false);
      if (signatureInputRef.current) signatureInputRef.current.value = '';
    }
  };

  const handleStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingStamp(true);
    try {
      const uploaded = await uploadCloudMedia(file, 'school-logo', 'school_stamp');
      setProfileForm((prev) => ({ ...prev, stampDataUrl: uploaded.displayUrl }));
      notify(
        'success',
        'School Stamp Uploaded',
        'Click "Save School Profile & Verification" to apply the official seal across all documents.'
      );
    } catch (err) {
      notify(
        'error',
        'Stamp Upload Failed',
        err instanceof Error ? err.message : 'Please select a valid PNG or JPG image.'
      );
    } finally {
      setUploadingStamp(false);
      if (stampInputRef.current) stampInputRef.current.value = '';
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.schoolName.trim()) {
      notify('error', 'School Name Required', 'Please enter the official school name.');
      return;
    }
    updateSchoolProfile(profileForm);
  };

  const handleDownloadJsonBackup = () => {
    const json = exportBackupJson();
    downloadFullBackupJson(json);
    notify(
      'success',
      'JSON Backup Downloaded',
      'Complete tenant snapshot exported as a portable JSON archive.'
    );
  };

  const handleDownloadExcelBackup = () => {
    try {
      const fileName = exportBackupExcel();
      notify(
        'success',
        'Excel Workbook Downloaded',
        `Exported ${fileName} with 11 structured worksheets.`
      );
    } catch (err) {
      notify(
        'error',
        'Excel Export Failed',
        err instanceof Error ? err.message : 'Unable to generate Excel workbook.'
      );
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError('');
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const result = importBackupJson(content);
      if (!result.ok && result.error) {
        setImportError(result.error);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const attendanceCount = Object.keys(db.attendance).length;
  const showSchoolProfile = sectionMode === 'all' || sectionMode === 'school-settings';
  const showDatabaseBackups = sectionMode === 'all' || sectionMode === 'database-backups';

  return (
    <section className="space-y-6">
      {/* =================================================================== */}
      {/* 0. MULTI-TENANT SAAS WORKSPACE & SUBSCRIPTION METADATA              */}
      {/* =================================================================== */}
      {showSchoolProfile && tenantMeta && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold tracking-tight text-slate-900">
                  Multi-Tenant SaaS Workspace &amp; Plan Configuration
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Isolated Cloud Tenant ID, Main Admin ownership, and SaaS subscription tier.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isCurrentUserAdmin && (
                <button
                  type="button"
                  onClick={() => setAiDrawerOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap shrink-0"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  <span>Ask AI / Change Us</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveModule('team-access')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <Users className="h-3.5 w-3.5 text-indigo-600" />
                <span>Manage Staff Roles &amp; Invites</span>
              </button>
              <button
                type="button"
                onClick={() => setRegisterSchoolModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Building2 className="h-3.5 w-3.5" />
                <span>+ Register Another School</span>
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-slate-500">Tenant School ID</p>
              <p className="mt-1 truncate font-mono text-sm font-bold text-slate-900 tabular-nums">
                {tenantMeta.id}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-slate-500">Main Admin (Owner)</p>
              <p className="mt-1 truncate font-mono text-sm font-semibold text-slate-900">
                {tenantMeta.ownerEmail}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-slate-500">Subscription Plan</p>
              <select
                aria-label="Subscription Plan"
                disabled={!isCurrentUserAdmin}
                value={tenantMeta.subscriptionPlan}
                onChange={(e) =>
                  void updateSubscriptionPlan(
                    e.target.value as SubscriptionPlan,
                    tenantMeta.subscriptionStatus
                  )
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none"
              >
                <option value="Enterprise">Enterprise SaaS</option>
                <option value="Standard">Standard Institutional</option>
                <option value="Starter">Starter Campus</option>
              </select>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-slate-500">Subscription Status</p>
              <select
                aria-label="Subscription Status"
                disabled={!isCurrentUserAdmin}
                value={tenantMeta.subscriptionStatus}
                onChange={(e) =>
                  void updateSubscriptionPlan(
                    tenantMeta.subscriptionPlan,
                    e.target.value as SubscriptionStatus
                  )
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none"
              >
                <option value="Active">Active</option>
                <option value="Trial">Trial</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 1. SCHOOL PROFILE, LOGO & OFFICIAL STATIONERY BRANDING SETTINGS     */}
      {/* =================================================================== */}
      {showSchoolProfile && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-900">
                  School Settings — Name, Logo &amp; Authority Details
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Update School Name, Cloud Logo, Address, Contact Details, Director Name, and Principal Name — reflected automatically on ID Cards, Admit Cards, Marksheets, and Fee Receipts.
                </p>
              </div>
            </div>

            {sectionMode === 'school-settings' && (
              <button
                type="button"
                onClick={() => setActiveModule('backups')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <Database className="h-3.5 w-3.5 text-sky-600" />
                <span>Database &amp; Backups</span>
              </button>
            )}
          </div>

          <form onSubmit={handleSaveProfile} className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Column: Inputs */}
            <div className="space-y-4 lg:col-span-7">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Official School Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.schoolName}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, schoolName: e.target.value }))
                    }
                    placeholder="RB PUBLIC SCHOOL"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/15"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Institutional Tagline / Subtitle
                  </label>
                  <input
                    type="text"
                    value={profileForm.tagline}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, tagline: e.target.value }))
                    }
                    placeholder="Recognized Primary & Preparatory Institution"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Affiliation / UDISE / Reg. No.
                  </label>
                  <input
                    type="text"
                    value={profileForm.affiliationNo}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, affiliationNo: e.target.value }))
                    }
                    placeholder="e.g., UDISE-09150200"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Authorized Person / Principal Name
                  </label>
                  <input
                    type="text"
                    value={profileForm.principalName}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, principalName: e.target.value }))
                    }
                    placeholder="e.g., Mrs. Sunita Verma"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Designation Title
                  </label>
                  <input
                    type="text"
                    value={profileForm.authorityDesignation || ''}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, authorityDesignation: e.target.value }))
                    }
                    placeholder="e.g., Principal / Director"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Director / Management Name
                  </label>
                  <input
                    type="text"
                    value={profileForm.directorName}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, directorName: e.target.value }))
                    }
                    placeholder="e.g., Mr. R. B. Sharma"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Complete School Address
                  </label>
                  <input
                    type="text"
                    value={profileForm.address}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, address: e.target.value }))
                    }
                    placeholder="Campus Road, Near Civil Lines, District, State - PIN"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Primary Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, phone: e.target.value }))
                    }
                    placeholder="+91 98XXXXXXXX"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Alternate Helpline Phone
                  </label>
                  <input
                    type="tel"
                    value={profileForm.alternatePhone}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, alternatePhone: e.target.value }))
                    }
                    placeholder="Optional landline / mobile"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Official School Email
                  </label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, email: e.target.value }))
                    }
                    placeholder="office@school.edu.in"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    School Website
                  </label>
                  <input
                    type="text"
                    value={profileForm.website}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, website: e.target.value }))
                    }
                    placeholder="www.school.edu.in"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={uploadingLogo}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors hover:bg-indigo-700 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  <span>Save School Profile &amp; Branding</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProfileForm({ ...DEFAULT_SCHOOL_PROFILE })}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 hover:bg-slate-50"
                >
                  Reset Fields
                </button>
              </div>
            </div>

            {/* Right Column: School Logo Upload & Live Stationery Preview */}
            <div className="space-y-4 lg:col-span-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold text-slate-700">
                  School Logo Crest (Tenant-Isolated Cloud Storage)
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Upload a square PNG or JPG emblem. Stored under your school’s isolated cloud folder and applied across official stationery.
                </p>

                <div className="mt-3 flex items-center gap-4">
                  {profileForm.logoDataUrl ? (
                    <img
                      src={profileForm.logoDataUrl}
                      alt="School Logo"
                      referrerPolicy="no-referrer"
                      className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                      <GraduationCap className="h-7 w-7" />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={uploadingLogo}
                      onClick={() => logoInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>{uploadingLogo ? 'Uploading...' : 'Upload Logo'}</span>
                    </button>
                    {profileForm.logoDataUrl && !uploadingLogo && (
                      <button
                        type="button"
                        onClick={() => setProfileForm((p) => ({ ...p, logoDataUrl: '' }))}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700 whitespace-nowrap shrink-0 hover:bg-rose-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Dedicated Signature & Verification Section */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Feather className="h-4 w-4 text-indigo-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Signature &amp; Verification Assets
                    </h3>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Upload official credentials dynamically overlaid on Student ID Cards, Staff ID Cards, Admit Cards, and Marksheets.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Digital Signature Upload */}
                  <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800">Digital Signature</span>
                        {profileForm.signatureDataUrl && (
                          <span className="text-[10px] font-bold text-emerald-600">Active</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        Transparent PNG recommended
                      </p>

                      <div className="mt-2 flex h-16 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 p-1">
                        {profileForm.signatureDataUrl ? (
                          <img
                            src={profileForm.signatureDataUrl}
                            alt="Signature Preview"
                            referrerPolicy="no-referrer"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">No signature</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-slate-100 pt-2">
                      <input
                        ref={signatureInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleSignatureUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={uploadingSignature}
                        onClick={() => signatureInputRef.current?.click()}
                        className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <Upload className="h-3 w-3" />
                        <span>{uploadingSignature ? '...' : profileForm.signatureDataUrl ? 'Change' : 'Upload'}</span>
                      </button>
                      {profileForm.signatureDataUrl && (
                        <button
                          type="button"
                          onClick={() => setProfileForm((p) => ({ ...p, signatureDataUrl: '' }))}
                          className="inline-flex items-center gap-0.5 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Official School Stamp Upload */}
                  <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800">School Stamp / Seal</span>
                        {profileForm.stampDataUrl && (
                          <span className="text-[10px] font-bold text-emerald-600">Active</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        Official circular seal image
                      </p>

                      <div className="mt-2 flex h-16 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 p-1">
                        {profileForm.stampDataUrl ? (
                          <img
                            src={profileForm.stampDataUrl}
                            alt="Stamp Preview"
                            referrerPolicy="no-referrer"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">No stamp</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-slate-100 pt-2">
                      <input
                        ref={stampInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleStampUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={uploadingStamp}
                        onClick={() => stampInputRef.current?.click()}
                        className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Upload className="h-3 w-3" />
                        <span>{uploadingStamp ? '...' : profileForm.stampDataUrl ? 'Change' : 'Upload'}</span>
                      </button>
                      {profileForm.stampDataUrl && (
                        <button
                          type="button"
                          onClick={() => setProfileForm((p) => ({ ...p, stampDataUrl: '' }))}
                          className="inline-flex items-center gap-0.5 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Official Stationery & Verification Box Preview */}
              <div className="rounded-xl border border-slate-300 bg-white p-4">
                <p className="text-[11px] font-semibold text-slate-400">
                  LIVE STATIONERY LETTERHEAD &amp; AUTHORITY PREVIEW
                </p>

                <div className="mt-3 flex items-start gap-3 border-b-2 border-slate-900 pb-3.5">
                  {profileForm.logoDataUrl ? (
                    <img
                      src={profileForm.logoDataUrl}
                      alt="Preview"
                      referrerPolicy="no-referrer"
                      className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-0.5"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold tracking-tight text-slate-900">
                      {(profileForm.schoolName || 'SCHOOL ERP').toUpperCase()}
                    </p>
                    <p className="truncate text-xs text-slate-600">
                      {profileForm.address ||
                        profileForm.tagline ||
                        'Recognized Primary & Preparatory Institution'}
                    </p>
                    {(profileForm.phone || profileForm.email) && (
                      <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500 tabular-nums">
                        {[profileForm.phone, profileForm.email].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Bottom Verification Area Preview */}
                <div className="mt-4 grid grid-cols-2 gap-4 pt-2 text-xs">
                  <div>
                    <p className="truncate font-semibold text-slate-800">
                      {profileForm.directorName || '—'}
                    </p>
                    <div className="mt-1 border-t border-slate-300 pt-1 text-[11px] text-slate-500">
                      Director / Management
                    </div>
                  </div>

                  <div className="relative text-right">
                    {/* Stamp Watermark in background */}
                    {profileForm.stampDataUrl && (
                      <img
                        src={profileForm.stampDataUrl}
                        alt="Stamp Seal Watermark"
                        referrerPolicy="no-referrer"
                        className="pointer-events-none absolute right-2 -top-6 h-14 w-14 object-contain opacity-70 rotate-[-8deg]"
                      />
                    )}

                    {/* Signature overlay */}
                    {profileForm.signatureDataUrl ? (
                      <div className="flex justify-end mb-1">
                        <img
                          src={profileForm.signatureDataUrl}
                          alt="Signature"
                          referrerPolicy="no-referrer"
                          className="h-8 max-w-[120px] object-contain"
                        />
                      </div>
                    ) : null}

                    <p className="truncate font-semibold text-slate-800">
                      {profileForm.principalName || 'Authorized Signatory'}
                    </p>
                    <div className="mt-1 border-t border-slate-300 pt-1 text-[11px] text-slate-500">
                      {profileForm.authorityDesignation || 'Principal'} Signature &amp; Seal
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. DATABASE, TENANT RLS SUMMARY & JSON/EXCEL BACKUPS                */}
      {/* =================================================================== */}
      {showDatabaseBackups && (
        <>
          {sectionMode === 'database-backups' && (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-slate-900">
                    Database &amp; Backups — Multi-Tenant Cloud Sync &amp; Exports
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Manage real-time Cloud Firestore synchronization, RBAC staff seats, and full multi-sheet Excel (.xlsx) or JSON tenant backups.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveModule('settings')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <Building2 className="h-3.5 w-3.5 text-orange-600" />
                <span>School Settings</span>
              </button>
            </div>
          )}

          {isCurrentUserAdmin && (
            <form
              onSubmit={handleSaveCloudBinding}
              className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-bold tracking-tight text-slate-900">
                    Self-Hosted Cloud Database Binding (Supabase / Firebase)
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Link your personal Supabase or Firebase project. Credentials are tied to your Gmail Master Account so logging in on any computer automatically connects to your cloud, and generated Staff Invite Links carry the public connection context automatically.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={savingBinding}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  {savingBinding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>
                    {savingBinding
                      ? 'Binding & Syncing Cloud...'
                      : 'Save & Sync to Bound Cloud'}
                  </span>
                </button>
              </div>

              <CloudBindingConfigFields
                value={draftCloudBinding}
                onChange={setDraftCloudBinding}
                disabled={savingBinding}
              />
            </form>
          )}

          {/* Role-Based Team Access Summary Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight text-slate-900">
                    Role-Based Staff Access &amp; Cloud RLS
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {schoolMembers.length} active staff{' '}
                    {schoolMembers.length === 1 ? 'account' : 'accounts'} · Accountant seats:{' '}
                    <span className="font-mono font-semibold text-slate-800 tabular-nums">
                      {activeAccountantSeatsUsed}/{accountantMaxLimit}
                    </span>{' '}
                    · Pending invites:{' '}
                    <span className="font-mono font-semibold text-slate-800 tabular-nums">
                      {staffInvites.filter((i) => i.status === 'pending').length}
                    </span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveModule('team-access')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap shrink-0"
              >
                <Users className="h-3.5 w-3.5" />
                <span>Open Team &amp; Staff Invites</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {schoolMembers.map((member) => (
                <div
                  key={member.uid}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      {member.displayName || 'School Staff'} ·{' '}
                      <span className="font-mono font-normal text-slate-600">
                        {member.email}
                      </span>
                    </p>
                  </div>
                  <span className="font-medium text-slate-700">
                    {ROLE_META[member.role]?.shortLabel || member.role}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 3. FULL SYSTEM BACKUP (EXCEL + JSON) & DATA MANAGEMENT */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Download className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Full School Tenant Backup (Excel &amp; JSON)
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Download a complete backup anytime as a multi-sheet <strong>Excel (.xlsx)</strong> workbook (Students, Staff, Fees, Exams, Marksheets, Attendance, Transport &amp; Notices) or as a lossless <strong>JSON (.json)</strong> snapshot for one-click restore.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownloadExcelBackup}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>Download Excel Backup (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadJsonBackup}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
                >
                  <FileJson className="h-4 w-4" />
                  <span>Download JSON Backup (.json)</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleFileImport}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
                >
                  <Upload className="h-4 w-4" />
                  <span>Restore from JSON</span>
                </button>
              </div>

              {importError && (
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                  {importError}
                </div>
              )}
            </div>

            {/* Complete System Data Reset */}
            <div className="rounded-xl border border-rose-200 bg-white p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Reset This School’s Operational Data
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Permanently clears operational records (students, fee receipts, routes, staff profiles, attendance, exam marks, and notices) for this school workspace only and resets counters to RB1001 and REC90001.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={signOutAfterReset}
                    onChange={(e) => setSignOutAfterReset(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-600"
                  />
                  <span>Sign out immediately after reset</span>
                </label>

                <button
                  type="button"
                  disabled={!isCurrentUserAdmin}
                  onClick={() =>
                    requestConfirm({
                      title: 'Confirm School Workspace Data Reset',
                      description:
                        'This will permanently delete all students, fee receipts, routes, staff profiles, attendance registers, exam schedules, marksheets, and notices from this school workspace. Team role seats will remain intact.',
                      confirmLabel: 'Reset School Data',
                      destructive: true,
                      onConfirm: () => resetSystemData(signOutAfterReset),
                    })
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Reset Workspace Data</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4. CLOUD DATABASE INVENTORY SUMMARY */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <Database className="h-4 w-4 text-indigo-600 shrink-0" />
                <h3 className="text-base font-bold tracking-tight text-slate-900">
                  Tenant Cloud Collection Summary
                </h3>
              </div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  Active Session {db.activeSession} · Last Updated{' '}
                  {formatTimestampDisplay(db.lastUpdated)}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5 lg:grid-cols-10 text-xs">
              {[
                { label: 'Sessions', count: db.sessions.length },
                { label: 'Students', count: db.students.length },
                { label: 'Fee Receipts', count: db.fees.length },
                { label: 'Bus Routes', count: db.routes.length },
                { label: 'Staff', count: db.staff.length },
                { label: 'Classes', count: db.classes.length },
                { label: 'Attendance', count: attendanceCount },
                { label: 'Exams', count: db.exams.length },
                { label: 'Marksheets', count: db.marksheets.length },
                { label: 'Notices', count: db.notices.length },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5"
                >
                  <p className="truncate text-[11px] text-slate-500">{item.label}</p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
                    {item.count}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
};
