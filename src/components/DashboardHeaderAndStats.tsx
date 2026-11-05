import React from 'react';
import {
  Menu,
  LogOut,
  CalendarRange,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Code2,
  Shield,
  Wand2,
} from 'lucide-react';
import { useSchool } from '../context/SchoolContext';
import { PRIMARY_SIDEBAR_ITEMS } from './SidebarNav';
import { AcademicBrandCrest, GLOBAL_APP_TITLE, TopBrandContactBar } from './TopBrandContactBar';
import { ModuleId, ROLE_META } from '../types/erp';

interface TopHeaderProps {
  onOpenMobileSidebar?: () => void;
}

const SECONDARY_TITLES: Partial<Record<ModuleId, { serial: string; title: string; subtitle: string }>> = {
  attendance: {
    serial: 'REG',
    title: 'Daily Attendance Register',
    subtitle: 'Class-wise roll call & printable attendance sheets',
  },
  transport: {
    serial: 'REG',
    title: 'Transport Route Management',
    subtitle: 'Bus routes, stops, driver roster & monthly fares',
  },
  classes: {
    serial: 'REG',
    title: 'Classes & Section Allocation',
    subtitle: 'Classroom sections & student capacity limits',
  },
  notices: {
    serial: 'REG',
    title: 'Campus Notice Board',
    subtitle: 'Official circulars, holidays & examination announcements',
  },
};

export const DashboardHeaderAndStats: React.FC<TopHeaderProps> = ({ onOpenMobileSidebar }) => {
  const {
    db,
    currentUserEmail,
    currentRole,
    isCurrentUserAdmin,
    cloudSyncStatus,
    cloudBinding,
    setAiDrawerOpen,
    signOutStaff,
    activeModule,
    setActiveAcademicSession,
  } = useSchool();

  const cloudSyncedLabel =
    cloudBinding.provider === 'supabase'
      ? 'Supabase Synced'
      : cloudBinding.provider === 'firebase'
      ? 'Firebase Synced'
      : 'Cloud Synced';

  const currentPrimary = PRIMARY_SIDEBAR_ITEMS.find((item) => item.id === activeModule);
  const currentMeta = currentPrimary
    ? {
        serial: currentPrimary.serial,
        title: currentPrimary.title,
        subtitle: currentPrimary.subtitle,
      }
    : SECONDARY_TITLES[activeModule] || {
        serial: '01',
        title: 'Dashboard',
        subtitle: 'Overview & Quick Stats',
      };

  return (
    <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
      {/* Global Top Contact & Branding Banner */}
      <TopBrandContactBar />

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* Left Zone: Mobile Menu Trigger + Academic Emblem + Active Module Title */}
        <div className="flex min-w-0 items-center gap-3">
          {onOpenMobileSidebar && (
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              aria-label="Open navigation menu"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}

          <div className="hidden sm:inline-flex lg:hidden">
            <AcademicBrandCrest size="sm" variant="indigo" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white tabular-nums">
                {currentMeta.serial}
              </span>
              <h1 className="truncate text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {currentMeta.title}
              </h1>
            </div>
            <p className="hidden truncate text-xs text-slate-500 sm:block">
              {currentMeta.subtitle} · {GLOBAL_APP_TITLE}
            </p>
          </div>
        </div>

        {/* Center/Right Zone: "Created by Nitesh Kumar" Branding + Session + Role + Auth */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Author Attribution */}
          <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold tracking-tight text-slate-800">
            <Code2 className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
            <span>Created by Nitesh Kumar</span>
          </div>

          {/* Module 3: In-App "Ask AI / Change Us" Customization Trigger (Strictly Main Admin Only) */}
          {isCurrentUserAdmin && (
            <button
              type="button"
              onClick={() => setAiDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap shrink-0"
              title="Open In-App AI Layout, Theme & Stationery Customizer"
            >
              <Wand2 className="h-3.5 w-3.5 shrink-0" />
              <span>Ask AI / Change Us</span>
            </button>
          )}

          {/* Active Academic Session (Editable by Main Admin, Read-Only for Staff) */}
          <div className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs">
            <CalendarRange className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
            <span className="font-medium text-slate-500">Session:</span>
            {isCurrentUserAdmin ? (
              <select
                aria-label="Active Academic Session"
                value={db.activeSession}
                onChange={(e) => setActiveAcademicSession(e.target.value)}
                className="cursor-pointer bg-transparent font-mono text-xs font-bold text-slate-900 focus:outline-none tabular-nums"
              >
                {db.sessions.map((ses) => (
                  <option key={ses.id} value={ses.name}>
                    {ses.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                {db.activeSession}
              </span>
            )}
          </div>

          {/* Role Indicator */}
          <div className="hidden lg:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Shield className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
            <span>{ROLE_META[currentRole].shortLabel}</span>
          </div>

          {/* Cloud Sync Status */}
          <div
            title={
              cloudSyncStatus === 'live'
                ? 'Connected to Cloud Firestore'
                : cloudSyncStatus === 'syncing'
                ? 'Syncing changes to Cloud Firestore'
                : 'Cloud Database Status'
            }
            className={`hidden xl:inline-flex items-center gap-1.5 text-xs font-semibold ${
              cloudSyncStatus === 'quota-exceeded' || cloudSyncStatus === 'error'
                ? 'text-amber-700'
                : 'text-emerald-700'
            }`}
          >
            {cloudSyncStatus === 'quota-exceeded' || cloudSyncStatus === 'error' ? (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            ) : cloudSyncStatus === 'syncing' ? (
              <Cloud className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            )}
            <span>
              {cloudSyncStatus === 'syncing' ? 'Syncing...' : cloudSyncedLabel}
            </span>
          </div>

          {/* Signed-in User + Sign Out */}
          <div className="flex items-center gap-2 border-l border-slate-200 pl-2.5 sm:pl-3">
            <span className="hidden 2xl:inline-block max-w-[180px] truncate font-mono text-xs font-medium text-slate-500">
              {currentUserEmail}
            </span>
            <button
              type="button"
              onClick={signOutStaff}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
