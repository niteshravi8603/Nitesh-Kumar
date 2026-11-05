import React from 'react';
import {
  Users,
  Briefcase,
  IndianRupee,
  AlertCircle,
  ClipboardList,
  Award,
  IdCard,
  Ticket,
  CalendarRange,
  Building2,
  Database,
  CalendarCheck,
  Bus,
  LayoutGrid,
  Bell,
  ArrowRight,
  Receipt,
  Wand2,
  UploadCloud,
} from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { GLOBAL_APP_TITLE } from '../TopBrandContactBar';
import { ModuleId } from '../../types/erp';
import { formatDateDisplay, formatINR } from '../../utils/formatters';

interface QuickModuleCard {
  serial: string;
  id: ModuleId;
  title: string;
  description: string;
  metric: string;
  icon: React.ComponentType<{ className?: string }>;
  accentBg: string;
  accentText: string;
  hoverBorder: string;
}

export const DashboardOverviewModule: React.FC = () => {
  const {
    db,
    dueOverview,
    canAccessModule,
    canManageStudents,
    canManageFees,
    isCurrentUserAdmin,
    aiCustomization,
    setAiDrawerOpen,
    setActiveModule,
    setFeeSubTab,
  } = useSchool();

  const schoolName = db.schoolProfile?.schoolName?.trim() || GLOBAL_APP_TITLE;
  const activeStudentsCount = db.students.filter((s) => s.status !== 'Deactive').length;
  const deactiveStudentsCount = db.students.length - activeStudentsCount;
  const totalFeeCollected = db.fees.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalOutstandingDues = dueOverview.totalOutstandingDues;

  const recentReceipts = [...db.fees]
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.receiptNo.localeCompare(a.receiptNo))
    .slice(0, 5);

  const recentNotices = [...db.notices]
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 4);

  const allQuickDirectoryCards: QuickModuleCard[] = [
    {
      serial: '02',
      id: 'admissions',
      title: 'Student Management',
      description: 'New admissions, student directory & active/deactive profiles',
      metric: `${activeStudentsCount} Active`,
      icon: Users,
      accentBg: 'bg-violet-50',
      accentText: 'text-violet-600',
      hoverBorder: 'hover:border-violet-300',
    },
    {
      serial: '03',
      id: 'id-cards',
      title: 'Student ID Cards',
      description: 'Generate single CR80 PVC cards or 8-card A4 print sheets',
      metric: `${activeStudentsCount} Ready`,
      icon: IdCard,
      accentBg: 'bg-cyan-50',
      accentText: 'text-cyan-600',
      hoverBorder: 'hover:border-cyan-300',
    },
    {
      serial: '04',
      id: 'staff',
      title: 'Staff Management',
      description: 'Faculty onboarding, custom designations & staff ID cards',
      metric: `${db.staff.length} Staff`,
      icon: Briefcase,
      accentBg: 'bg-emerald-50',
      accentText: 'text-emerald-600',
      hoverBorder: 'hover:border-emerald-300',
    },
    {
      serial: '05',
      id: 'exams',
      title: 'Exam Management',
      description: 'Configure exams, subject min/max marks & datesheets',
      metric: `${db.exams.length} Exams`,
      icon: ClipboardList,
      accentBg: 'bg-amber-50',
      accentText: 'text-amber-600',
      hoverBorder: 'hover:border-amber-300',
    },
    {
      serial: '06',
      id: 'admit-cards',
      title: 'Admit Cards',
      description: 'Download & print official student-wise exam hall tickets',
      metric: `${db.exams.length} Schedules`,
      icon: Ticket,
      accentBg: 'bg-rose-50',
      accentText: 'text-rose-600',
      hoverBorder: 'hover:border-rose-300',
    },
    {
      serial: '07',
      id: 'marksheets',
      title: 'Marksheets',
      description: 'Automated grading, pass/fail analytics & A4 report cards',
      metric: `${db.marksheets.length} Issued`,
      icon: Award,
      accentBg: 'bg-fuchsia-50',
      accentText: 'text-fuchsia-600',
      hoverBorder: 'hover:border-fuchsia-300',
    },
    {
      serial: '08',
      id: 'fees',
      title: 'Fee Management',
      description: 'Class fee schedules, instant receipts & deactive fee freeze',
      metric: `${db.fees.length} Receipts`,
      icon: IndianRupee,
      accentBg: 'bg-teal-50',
      accentText: 'text-teal-600',
      hoverBorder: 'hover:border-teal-300',
    },
    {
      serial: '09',
      id: 'sessions',
      title: 'Session & Promotion',
      description: 'Academic year setup & automated batch class promotion',
      metric: db.activeSession,
      icon: CalendarRange,
      accentBg: 'bg-blue-50',
      accentText: 'text-blue-600',
      hoverBorder: 'hover:border-blue-300',
    },
    {
      serial: '10',
      id: 'settings',
      title: 'School Settings',
      description: 'School name, official emblem, Principal & Director details',
      metric: 'Branding',
      icon: Building2,
      accentBg: 'bg-orange-50',
      accentText: 'text-orange-600',
      hoverBorder: 'hover:border-orange-300',
    },
    {
      serial: '11',
      id: 'backups',
      title: 'Database & Backups',
      description: 'Cloud Firestore sync, staff RBAC & Excel/JSON exports',
      metric: 'Cloud Live',
      icon: Database,
      accentBg: 'bg-sky-50',
      accentText: 'text-sky-600',
      hoverBorder: 'hover:border-sky-300',
    },
  ];
  const quickDirectoryCards = allQuickDirectoryCards.filter((card) =>
    canAccessModule(card.id)
  );

  return (
    <section className="space-y-6">
      {/* Executive Welcome Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-xs font-bold text-indigo-700 tabular-nums">
                ACTIVE SESSION {db.activeSession}
              </span>
              {db.schoolProfile?.affiliationNo && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-600 tabular-nums">
                  Affiliation: {db.schoolProfile.affiliationNo}
                </span>
              )}
            </div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {aiCustomization.dashboardBannerTitle?.trim()
                ? aiCustomization.dashboardBannerTitle.trim()
                : `${schoolName} — Administrative Overview`}
            </h2>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Real-time enrollment, fee collection, academic examinations, and cloud-synced institutional records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isCurrentUserAdmin && (
              <button
                type="button"
                onClick={() => setAiDrawerOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
              >
                <Wand2 className="h-4 w-4" />
                <span>Ask AI / Change Us</span>
              </button>
            )}
            {canAccessModule('admissions') && (
              <button
                type="button"
                onClick={() => setActiveModule('admissions')}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                <Users className="h-4 w-4" />
                <span>{canManageStudents ? 'Manage Students' : 'Student Directory'}</span>
              </button>
            )}
            {canAccessModule('fees') && (
              <button
                type="button"
                onClick={() => {
                  setFeeSubTab('ledger');
                  setActiveModule('fees');
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
              >
                <Receipt className="h-4 w-4 text-emerald-600" />
                <span>{canManageFees ? 'Collect Fee' : 'Fee Analytics'}</span>
              </button>
            )}
            {canAccessModule('data-import') && (
              <button
                type="button"
                onClick={() => setActiveModule('data-import')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
              >
                <UploadCloud className="h-4 w-4 text-indigo-600" />
                <span>Bulk Import (Excel/CSV)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Primary KPI Strip (4 Core Operational Metrics) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => setActiveModule('admissions')}
          className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-all duration-200 hover:border-indigo-300 hover:shadow-xs"
        >
          <div>
            <p className="text-xs font-medium text-slate-500">Active Students</p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
              {activeStudentsCount}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {deactiveStudentsCount > 0
                ? `${deactiveStudentsCount} deactivated (fee frozen)`
                : `${db.classes.length} active classes`}
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Users className="h-5 w-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveModule('staff')}
          className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-all duration-200 hover:border-emerald-300 hover:shadow-xs"
        >
          <div>
            <p className="text-xs font-medium text-slate-500">Registered Staff &amp; Faculty</p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
              {db.staff.length}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              ID cards &amp; designations active
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Briefcase className="h-5 w-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setFeeSubTab('ledger');
            setActiveModule('fees');
          }}
          className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-all duration-200 hover:border-teal-300 hover:shadow-xs"
        >
          <div>
            <p className="text-xs font-medium text-slate-500">Total Fee Collected</p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-emerald-700 tabular-nums">
              {formatINR(totalFeeCollected)}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {db.fees.length} {db.fees.length === 1 ? 'receipt issued' : 'receipts issued'}
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
            <IndianRupee className="h-5 w-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setFeeSubTab('dues');
            setActiveModule('fees');
          }}
          className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-all duration-200 hover:border-rose-300 hover:shadow-xs"
        >
          <div>
            <p className="text-xs font-medium text-slate-500">Active Outstanding Dues</p>
            <p
              className={`mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums ${
                totalOutstandingDues > 0 ? 'text-rose-600' : 'text-slate-900'
              }`}
            >
              {formatINR(totalOutstandingDues)}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {dueOverview.defaultersCount}{' '}
              {dueOverview.defaultersCount === 1 ? 'student pending' : 'students pending'} · Thru{' '}
              {db.billingCutoffMonth.slice(0, 3)}
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <AlertCircle className="h-5 w-5" />
          </div>
        </button>
      </div>

      {/* Numbered ERP Modules Quick-Launch Grid */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-1 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold tracking-tight text-slate-900">
              Control Modules Directory (02 – 11)
            </h3>
            <p className="text-xs text-slate-500">
              Jump directly to any core administrative, examination, or financial workflow
            </p>
          </div>

          {/* Secondary Campus Operations Bar */}
          <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-0">
            <button
              type="button"
              onClick={() => setActiveModule('attendance')}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              <CalendarCheck className="h-3.5 w-3.5 text-indigo-600" />
              <span>Attendance</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('transport')}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              <Bus className="h-3.5 w-3.5 text-amber-600" />
              <span>Transport ({db.routes.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('classes')}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              <LayoutGrid className="h-3.5 w-3.5 text-emerald-600" />
              <span>Classes ({db.classes.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('notices')}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              <Bell className="h-3.5 w-3.5 text-rose-600" />
              <span>Notices ({db.notices.length})</span>
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
          {quickDirectoryCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setActiveModule(card.id)}
                className={`group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs ${card.hoverBorder}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.accentBg} ${card.accentText}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-400 tabular-nums">
                      {card.serial}
                    </span>
                  </div>
                  <h4 className="mt-3 text-sm font-bold tracking-tight text-slate-900 group-hover:text-indigo-700">
                    {card.title}
                  </h4>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                    {card.description}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                  <span className="font-mono font-semibold text-slate-700 tabular-nums">
                    {card.metric}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-indigo-600" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Operational Activity: Latest Fee Receipts + Campus Notices */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold tracking-tight text-slate-900">
                Recent Fee Receipts
              </h3>
              <p className="text-xs text-slate-500">Latest verified fee collections in ledger</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFeeSubTab('ledger');
                setActiveModule('fees');
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              <span>Open Fee Ledger</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {recentReceipts.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-slate-700">No fee receipts recorded yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Issue fee receipts from 08. Fee Management to view live transactions here.
              </p>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-2.5 pr-3">Receipt</th>
                    <th className="py-2.5 px-3">Student</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 pl-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentReceipts.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900 tabular-nums">
                        {rec.receiptNo}
                      </td>
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-slate-800">{rec.studentName}</p>
                        <p className="text-[11px] text-slate-500">
                          Class {rec.className}-{rec.section}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {rec.category} ({rec.feeMonth.slice(0, 3)})
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500 tabular-nums">
                        {formatDateDisplay(rec.date)}
                      </td>
                      <td className="py-2.5 pl-3 text-right font-mono font-bold text-emerald-700 tabular-nums">
                        {formatINR(rec.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold tracking-tight text-slate-900">
                Latest Campus Notices
              </h3>
              <p className="text-xs text-slate-500">Announcements &amp; circulars</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveModule('notices')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              <span>Notice Board</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {recentNotices.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-slate-700">No circulars published</p>
              <p className="mt-1 text-xs text-slate-500">
                Publish exam alerts, holidays, or circulars from the Notice Board.
              </p>
            </div>
          ) : (
            <div className="mt-3 divide-y divide-slate-100">
              {recentNotices.map((notice) => (
                <div key={notice.id} className="py-3 first:pt-1 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {notice.category}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {formatDateDisplay(notice.createdAt.slice(0, 10))}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs font-bold text-slate-900">{notice.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{notice.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
