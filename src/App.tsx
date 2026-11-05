/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Eye, Building2, Loader2 } from 'lucide-react';
import { SchoolProvider, useSchool } from './context/SchoolContext';
import { AuthGate } from './components/AuthGate';
import { SidebarNav } from './components/SidebarNav';
import { DashboardHeaderAndStats } from './components/DashboardHeaderAndStats';
import {
  GLOBAL_APP_TITLE,
  GLOBAL_CONTACT_EMAIL,
  GLOBAL_CONTACT_PHONE,
} from './components/TopBrandContactBar';
import { DashboardOverviewModule } from './components/modules/DashboardOverviewModule';
import { AdmissionsModule } from './components/modules/AdmissionsModule';
import { SessionsPromotionModule } from './components/modules/SessionsPromotionModule';
import { IdCardsModule } from './components/modules/IdCardsModule';
import { FeeModule } from './components/modules/FeeModule';
import { TransportModule } from './components/modules/TransportModule';
import { StaffModule } from './components/modules/StaffModule';
import { TeamAccessModule } from './components/modules/TeamAccessModule';
import { ClassAllocationModule } from './components/modules/ClassAllocationModule';
import { AttendanceModule } from './components/modules/AttendanceModule';
import { ExamsModule } from './components/modules/ExamsModule';
import { NoticeBoardModule } from './components/modules/NoticeBoardModule';
import { SettingsModule } from './components/modules/SettingsModule';
import { BulkDataImportModule } from './components/modules/BulkDataImportModule';
import { PrintPreviewModal } from './components/PrintPreviewModal';
import { AiCustomizationDrawer } from './components/AiCustomizationDrawer';
import { CloudBindingConfigFields } from './components/CloudBindingConfigFields';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { ModalShell } from './components/ui/ModalShell';
import { ToastViewport } from './components/ui/ToastViewport';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { DynamicCloudBinding, ROLE_META, SubscriptionPlan } from './types/erp';

const RegisterAdditionalSchoolModal: React.FC = () => {
  const {
    registerSchoolModalOpen,
    setRegisterSchoolModalOpen,
    registerSchoolWorkspace,
  } = useSchool();

  const [schoolName, setSchoolName] = useState('');
  const [tagline, setTagline] = useState('Recognized Primary & Secondary Institution');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [plan, setPlan] = useState<SubscriptionPlan>('Enterprise');
  const [cloudBinding, setCloudBinding] = useState<DynamicCloudBinding>({
    provider: 'managed',
    apiUrl: '',
    publicKey: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!schoolName.trim()) {
      setErr('Please enter the official School Name.');
      return;
    }
    if (
      cloudBinding.provider !== 'managed' &&
      (!cloudBinding.apiUrl.trim() || !cloudBinding.publicKey.trim())
    ) {
      setErr('Please enter both your Cloud API URL and Public Key, or select Managed Cloud.');
      return;
    }
    setBusy(true);
    try {
      const res = await registerSchoolWorkspace({
        schoolName: schoolName.trim(),
        tagline: tagline.trim(),
        address: address.trim(),
        phone: phone.trim(),
        subscriptionPlan: plan,
        cloudBinding,
      });
      if (!res.ok) {
        setErr(res.error || 'Could not create school workspace.');
        return;
      }
      setSchoolName('');
      setAddress('');
      setPhone('');
      setRegisterSchoolModalOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={registerSchoolModalOpen}
      onClose={() => !busy && setRegisterSchoolModalOpen(false)}
      title="Register Additional School Workspace"
      subtitle="Provisions an isolated Multi-Tenant school_id in Cloud Firestore with your account as Main Admin."
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {err && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
            {err}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700">
            Official School Name <span className="text-rose-600">*</span>
          </label>
          <input
            type="text"
            required
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            placeholder="e.g., Green Valley International School"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Tagline / Subtitle
            </label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Contact Phone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98XXXXXXXX"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700">
            Campus Address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, City, State - PIN"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700">
            Subscription Plan
          </label>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
          >
            <option value="Enterprise">Enterprise SaaS</option>
            <option value="Standard">Standard Institutional</option>
            <option value="Starter">Starter Campus</option>
          </select>
        </div>

        <CloudBindingConfigFields
          value={cloudBinding}
          onChange={setCloudBinding}
          compact
          disabled={busy}
        />

        <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => setRegisterSchoolModalOpen(false)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Building2 className="h-3.5 w-3.5" />
            )}
            <span>{busy ? 'Creating Workspace...' : 'Create School Workspace'}</span>
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const ERPWorkspace: React.FC = () => {
  const {
    db,
    currentUserEmail,
    currentRole,
    isReadOnlyRole,
    canAccessModule,
    activeModule,
    setActiveModule,
    aiCustomization,
  } = useSchool();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (!currentUserEmail) {
    return (
      <>
        <AuthGate />
        <ToastViewport />
      </>
    );
  }

  const schoolTitle = db.schoolProfile?.schoolName?.trim() || GLOBAL_APP_TITLE;
  const footerLinks = [
    canAccessModule('team-access')
      ? { id: 'team-access' as const, label: 'Team & Invites' }
      : null,
    canAccessModule('settings')
      ? { id: 'settings' as const, label: 'School Settings' }
      : null,
    canAccessModule('backups')
      ? { id: 'backups' as const, label: 'Database & Backups' }
      : null,
    canAccessModule('notices')
      ? { id: 'notices' as const, label: 'Notice Board' }
      : null,
  ].filter((item): item is { id: 'team-access' | 'settings' | 'backups' | 'notices'; label: string } =>
    Boolean(item)
  );

  return (
    <div
      data-erp-theme={aiCustomization.accentTheme}
      data-erp-density={aiCustomization.densityMode}
      className="min-h-screen bg-slate-50"
    >
      {/* Fixed Full-Height Left Sidebar (#0f172a) */}
      <SidebarNav
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Right Workspace Column */}
      <div className="flex min-h-screen flex-col lg:pl-[296px] print:pl-0">
        <DashboardHeaderAndStats
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />

        <main
          className={`no-print mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8 ${
            aiCustomization.densityMode === 'compact' ? 'py-4' : 'py-6'
          }`}
        >
          {isReadOnlyRole && (
            <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700">
              <Eye className="h-4 w-4 shrink-0 text-indigo-600" />
              <span>
                <strong className="text-slate-900">
                  {ROLE_META[currentRole].label} (View-Only Mode):
                </strong>{' '}
                Analytics, directories, printable stationery, and Excel/PDF exports are active. Record creation, editing, and deletion are disabled.
              </span>
            </div>
          )}

          {activeModule === 'dashboard' && canAccessModule('dashboard') && (
            <DashboardOverviewModule />
          )}
          {activeModule === 'admissions' && canAccessModule('admissions') && (
            <AdmissionsModule />
          )}
          {activeModule === 'id-cards' && canAccessModule('id-cards') && (
            <IdCardsModule />
          )}
          {activeModule === 'staff' && canAccessModule('staff') && <StaffModule />}
          {activeModule === 'team-access' && canAccessModule('team-access') && (
            <TeamAccessModule />
          )}
          {(activeModule === 'exams' ||
            activeModule === 'admit-cards' ||
            activeModule === 'marksheets') &&
            (canAccessModule('exams') ||
              canAccessModule('admit-cards') ||
              canAccessModule('marksheets')) && (
              <ExamsModule initialMode={activeModule} />
            )}
          {activeModule === 'fees' && canAccessModule('fees') && <FeeModule />}
          {activeModule === 'sessions' && canAccessModule('sessions') && (
            <SessionsPromotionModule />
          )}
          {activeModule === 'settings' && canAccessModule('settings') && (
            <SettingsModule sectionMode="school-settings" />
          )}
          {activeModule === 'backups' && canAccessModule('backups') && (
            <SettingsModule sectionMode="database-backups" />
          )}
          {activeModule === 'data-import' && canAccessModule('data-import') && (
            <BulkDataImportModule />
          )}
          {activeModule === 'transport' && canAccessModule('transport') && (
            <TransportModule />
          )}
          {activeModule === 'classes' && canAccessModule('classes') && (
            <ClassAllocationModule />
          )}
          {activeModule === 'attendance' && canAccessModule('attendance') && (
            <AttendanceModule />
          )}
          {activeModule === 'notices' && canAccessModule('notices') && (
            <NoticeBoardModule />
          )}
        </main>

        <footer className="no-print border-t border-slate-200 bg-white py-4">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 text-xs text-slate-500 sm:flex-row sm:px-6 lg:px-8">
            <div className="space-y-0.5 text-center sm:text-left">
              <p className="font-medium text-slate-700">
                © {new Date().getFullYear()} {GLOBAL_APP_TITLE} · {schoolTitle}
              </p>
              <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                Phone / WhatsApp: {GLOBAL_CONTACT_PHONE} · Email: {GLOBAL_CONTACT_EMAIL} ·{' '}
                {ROLE_META[currentRole].shortLabel} · Session {db.activeSession}
              </p>
            </div>
            {footerLinks.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                {footerLinks.map((lnk, idx) => (
                  <React.Fragment key={lnk.id}>
                    {idx > 0 && <span aria-hidden="true">·</span>}
                    <button
                      type="button"
                      onClick={() => setActiveModule(lnk.id)}
                      className="transition-colors hover:text-slate-900"
                    >
                      {lnk.label}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </footer>
      </div>

      <RegisterAdditionalSchoolModal />
      <AiCustomizationDrawer />
      <PrintPreviewModal />
      <ConfirmDialog />
      <ToastViewport />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <SchoolProvider>
        <ERPWorkspace />
      </SchoolProvider>
    </ErrorBoundary>
  );
}
