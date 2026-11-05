import React from 'react';
import {
  LayoutDashboard,
  GraduationCap,
  IdCard,
  Briefcase,
  ClipboardList,
  Ticket,
  FileCheck2,
  Wallet,
  CalendarRange,
  Building2,
  Database,
  CalendarCheck,
  Bus,
  LayoutGrid,
  Bell,
  X,
  ChevronRight,
  Users,
  Plus,
  UploadCloud,
} from 'lucide-react';
import { useSchool } from '../context/SchoolContext';
import { getDefaultModuleForRole, ModuleId, ROLE_META } from '../types/erp';
import {
  AcademicBrandCrest,
  GLOBAL_APP_TITLE,
  GLOBAL_CONTACT_PHONE,
} from './TopBrandContactBar';

export interface PrimarySidebarMenuItem {
  serial: string;
  id: ModuleId;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  activeClass: string;
  hoverClass: string;
  iconTintClass: string;
}

export const PRIMARY_SIDEBAR_ITEMS: PrimarySidebarMenuItem[] = [
  {
    serial: '01',
    id: 'dashboard',
    title: 'Dashboard',
    subtitle: 'Overview & Quick Stats',
    icon: LayoutDashboard,
    activeClass: 'bg-gradient-to-r from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-950/50',
    hoverClass: 'hover:bg-gradient-to-r hover:from-indigo-600/90 hover:to-blue-500/90 hover:text-white',
    iconTintClass: 'text-indigo-400',
  },
  {
    serial: '02',
    id: 'admissions',
    title: 'Student Management',
    subtitle: 'Add, List, Edit Details',
    icon: GraduationCap,
    activeClass: 'bg-gradient-to-r from-violet-600 to-purple-500 text-white shadow-md shadow-violet-950/50',
    hoverClass: 'hover:bg-gradient-to-r hover:from-violet-600/90 hover:to-purple-500/90 hover:text-white',
    iconTintClass: 'text-violet-400',
  },
  {
    serial: '03',
    id: 'id-cards',
    title: 'Student ID Cards',
    subtitle: 'Single & 8-Card Grid Batch Print',
    icon: IdCard,
    activeClass: 'bg-gradient-to-r from-cyan-600 to-teal-500 text-white shadow-md shadow-cyan-950/50',
    hoverClass: 'hover:bg-gradient-to-r hover:from-cyan-600/90 hover:to-teal-500/90 hover:text-white',
    iconTintClass: 'text-cyan-400',
  },
  {
    serial: '04',
    id: 'staff',
    title: 'Staff Management',
    subtitle: 'Registration, Designation & Staff ID Cards',
    icon: Briefcase,
    activeClass: 'bg-gradient-to-r from-emerald-600 to-green-500 text-white shadow-md shadow-emerald-950/50',
    hoverClass: 'hover:bg-gradient-to-r hover:from-emerald-600/90 hover:to-green-500/90 hover:text-white',
    iconTintClass: 'text-emerald-400',
  },
  {
    serial: '05',
    id: 'team-access',
    title: 'Staff & User Management',
    subtitle: 'Login Credentials, Roles & RBAC',
    icon: Users,
    activeClass: 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-950/50',
    hoverClass: 'hover:bg-gradient-to-r hover:from-indigo-500/90 hover:to-violet-600/90 hover:text-white',
    iconTintClass: 'text-indigo-300',
  },
  {
    serial: '06',
    id: 'exams',
    title: 'Exam Management',
    subtitle: 'Exam Creation, Min/Max Marks, Datesheet',
    icon: ClipboardList,
    activeClass: 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-orange-950/50',
    hoverClass: 'hover:bg-gradient-to-r hover:from-amber-500/90 hover:to-orange-600/90 hover:text-white',
    iconTintClass: 'text-amber-400',
  },
  {
    serial: '07',
    id: 'admit-cards',
    title: 'Admit Cards',
    subtitle: 'Student-wise Admit Card Download',
    icon: Ticket,
    activeClass: 'bg-gradient-to-r from-rose-600 to-pink-500 text-white shadow-md shadow-rose-950/50',
    hoverClass: 'hover:bg-gradient-to-r hover:from-rose-600/90 hover:to-pink-500/90 hover:text-white',
    iconTintClass: 'text-rose-400',
  },
  {
    serial: '08',
    id: 'marksheets',
    title: 'Marksheets & Marks',
    subtitle: 'Marks Upload, Auto-Grade & Print',
    icon: FileCheck2,
    activeClass: 'bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-md shadow-fuchsia-950/50',
    hoverClass: 'hover:bg-gradient-to-r hover:from-fuchsia-600/90 hover:to-purple-600/90 hover:text-white',
    iconTintClass: 'text-fuchsia-400',
  },
  {
    serial: '09',
    id: 'fees',
    title: 'Fee Management',
    subtitle: 'Fee Structure, Receipt Generation & Dues',
    icon: Wallet,
    activeClass: 'bg-gradient-to-r from-teal-600 to-emerald-500 text-white shadow-md shadow-teal-950/50',
    hoverClass: 'hover:bg-gradient-to-r hover:from-teal-600/90 hover:to-emerald-500/90 hover:text-white',
    iconTintClass: 'text-teal-400',
  },
  {
    serial: '10',
    id: 'sessions',
    title: 'Academic Session & Promotion',
    subtitle: 'Session Setup & Student Class Promotion',
    icon: CalendarRange,
    activeClass: 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-md shadow-blue-950/50',
    hoverClass: 'hover:bg-gradient-to-r hover:from-blue-600/90 hover:to-sky-500/90 hover:text-white',
    iconTintClass: 'text-sky-400',
  },
  {
    serial: '11',
    id: 'settings',
    title: 'School Settings',
    subtitle: 'School Name, Logo, Principal/Director Details',
    icon: Building2,
    activeClass: 'bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-md shadow-orange-950/50',
    hoverClass: 'hover:bg-gradient-to-r hover:from-orange-500/90 hover:to-rose-500/90 hover:text-white',
    iconTintClass: 'text-orange-400',
  },
  {
    serial: '12',
    id: 'backups',
    title: 'Database & Backups',
    subtitle: 'Cloud Sync & JSON/Excel Export',
    icon: Database,
    activeClass: 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-950/50',
    hoverClass: 'hover:bg-gradient-to-r hover:from-sky-600/90 hover:to-indigo-600/90 hover:text-white',
    iconTintClass: 'text-sky-300',
  },
  {
    serial: '13',
    id: 'data-import',
    title: 'Bulk Data Migration',
    subtitle: 'Excel / CSV Import for Students, Staff & Fees',
    icon: UploadCloud,
    activeClass: 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-950/50',
    hoverClass: 'hover:bg-gradient-to-r hover:from-emerald-600/90 hover:to-teal-500/90 hover:text-white',
    iconTintClass: 'text-emerald-400',
  },
];

interface SecondaryCampusItem {
  id: ModuleId;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SECONDARY_CAMPUS_ITEMS: SecondaryCampusItem[] = [
  { id: 'attendance', title: 'Daily Attendance', icon: CalendarCheck },
  { id: 'transport', title: 'Transport Routes', icon: Bus },
  { id: 'classes', title: 'Classes & Sections', icon: LayoutGrid },
  { id: 'notices', title: 'Notice Board', icon: Bell },
];

interface SidebarNavProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({ mobileOpen, onCloseMobile }) => {
  const {
    db,
    activeSchoolId,
    userMemberships,
    currentRole,
    isCurrentUserAdmin,
    canAccessModule,
    switchActiveSchool,
    setRegisterSchoolModalOpen,
    activeModule,
    setActiveModule,
  } = useSchool();

  const schoolName = db.schoolProfile?.schoolName?.trim() || GLOBAL_APP_TITLE;
  const schoolLogo = db.schoolProfile?.logoDataUrl || '';

  const visiblePrimaryItems = PRIMARY_SIDEBAR_ITEMS.filter((item) =>
    canAccessModule(item.id)
  );
  const visibleSecondaryItems = SECONDARY_CAMPUS_ITEMS.filter((item) =>
    canAccessModule(item.id)
  );

  const handleSelectModule = (id: ModuleId) => {
    setActiveModule(id);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="no-print fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-200 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Fixed Full-Height Vertical Left Sidebar (#0f172a) */}
      <aside
        aria-label="Primary ERP Navigation"
        className={`no-print fixed inset-y-0 left-0 z-50 flex h-screen w-[296px] flex-col border-r border-slate-800/90 bg-[#0f172a] text-slate-200 transition-transform duration-200 ease-out lg:z-40 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Identity Header */}
        <div className="border-b border-slate-800/90 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => handleSelectModule(getDefaultModuleForRole(currentRole))}
              className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            >
              {schoolLogo ? (
                <img
                  src={schoolLogo}
                  alt={schoolName}
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 shrink-0 rounded-lg border border-slate-700 bg-white object-contain p-0.5"
                />
              ) : (
                <AcademicBrandCrest size="md" variant="indigo" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold tracking-wide text-indigo-300">
                  {GLOBAL_APP_TITLE}
                </p>
                <p className="truncate font-display text-sm font-bold tracking-tight text-white">
                  {schoolName.toUpperCase()}
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] font-medium text-slate-400 tabular-nums">
                  {ROLE_META[currentRole].shortLabel} · {db.activeSession}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation menu"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-700/80 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Multi-Tenant Workspace Switcher / New School Trigger */}
          {(userMemberships.length > 1 || isCurrentUserAdmin) && (
            <div className="mt-3 flex items-center gap-2">
              {userMemberships.length > 1 ? (
                <select
                  aria-label="Switch School Workspace"
                  value={activeSchoolId || ''}
                  onChange={(e) => switchActiveSchool(e.target.value)}
                  className="min-w-0 flex-1 truncate rounded-lg border border-slate-700/90 bg-slate-900/90 px-2.5 py-1.5 text-xs font-medium text-slate-200 focus:border-indigo-400 focus:outline-none"
                >
                  {userMemberships.map((m) => (
                    <option key={m.schoolId} value={m.schoolId}>
                      {m.schoolName} ({ROLE_META[m.role].shortLabel})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-400 tabular-nums">
                  ID: {activeSchoolId || '—'}
                </p>
              )}

              {isCurrentUserAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    onCloseMobile();
                    setRegisterSchoolModalOpen(true);
                  }}
                  title="Register another isolated School Workspace"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700/90 bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 transition-colors hover:border-indigo-400/60 hover:bg-slate-800 hover:text-white whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3 w-3 text-indigo-400" />
                  <span>New School</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Scrollable Role-Scoped Menu List */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          {visiblePrimaryItems.length > 0 && (
            <>
              <div className="px-2 pb-1.5 pt-0.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Authorized Modules ({visiblePrimaryItems.length})
                </p>
              </div>

              {visiblePrimaryItems.map((item, idx) => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;
                const displaySerial = String(idx + 1).padStart(2, '0');

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectModule(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 ${
                      isActive
                        ? item.activeClass
                        : `text-slate-300 hover:translate-x-1 ${item.hoverClass}`
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors duration-200 ${
                        isActive
                          ? 'border-white/25 bg-white/15 text-white'
                          : `border-slate-800 bg-slate-900/90 ${item.iconTintClass} group-hover:border-white/20 group-hover:bg-white/15 group-hover:text-white`
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-mono text-[11px] font-bold tabular-nums transition-colors duration-200 ${
                            isActive
                              ? 'text-white/90'
                              : 'text-slate-400 group-hover:text-white/90'
                          }`}
                        >
                          {displaySerial}.
                        </span>
                        <span className="truncate text-[13px] font-semibold tracking-tight">
                          {item.title}
                        </span>
                      </div>
                      <p
                        className={`mt-0.5 truncate text-[11px] transition-colors duration-200 ${
                          isActive
                            ? 'text-white/85'
                            : 'text-slate-400 group-hover:text-white/85'
                        }`}
                      >
                        {item.subtitle}
                      </p>
                    </div>

                    <ChevronRight
                      className={`h-3.5 w-3.5 shrink-0 transition-all duration-200 ${
                        isActive
                          ? 'translate-x-0 text-white opacity-100'
                          : '-translate-x-1 text-white/80 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'
                      }`}
                    />
                  </button>
                );
              })}
            </>
          )}

          {/* Secondary Campus Registers Section */}
          {visibleSecondaryItems.length > 0 && (
            <div className="mt-4 border-t border-slate-800/90 pt-3">
              <div className="px-2 pb-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Campus Registers
                </p>
              </div>
              <div className="grid grid-cols-1 gap-1">
                {visibleSecondaryItems.map((sec) => {
                  const SecIcon = sec.icon;
                  const isSecActive = activeModule === sec.id;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => handleSelectModule(sec.id)}
                      aria-current={isSecActive ? 'page' : undefined}
                      className={`group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition-all duration-150 ${
                        isSecActive
                          ? 'bg-slate-800 text-white shadow-xs'
                          : 'text-slate-400 hover:translate-x-1 hover:bg-slate-800/70 hover:text-white'
                      }`}
                    >
                      <SecIcon
                        className={`h-4 w-4 shrink-0 ${
                          isSecActive
                            ? 'text-indigo-400'
                            : 'text-slate-500 group-hover:text-indigo-300'
                        }`}
                      />
                      <span className="truncate">{sec.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        {/* Bottom Role & Support Contact Footer */}
        <div className="border-t border-slate-800/90 bg-slate-950/60 px-4 py-3 text-[11px] text-slate-400">
          <div className="flex items-center justify-between">
            <span className="truncate font-medium text-slate-300">
              {ROLE_META[currentRole].shortLabel}
            </span>
            <span className="font-mono font-semibold text-emerald-400 tabular-nums">
              {db.students.filter((s) => (s.status || 'Active') === 'Active').length} Active
            </span>
          </div>
          <p className="mt-1 truncate font-mono text-[10px] text-slate-500 tabular-nums">
            Support: {GLOBAL_CONTACT_PHONE}
          </p>
        </div>
      </aside>
    </>
  );
};
