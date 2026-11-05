import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarRange,
  Check,
  CheckSquare,
  Edit3,
  History,
  Plus,
  Square,
  Trash2,
  Users,
} from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { AcademicSessionConfig, FeeMonth } from '../../types/erp';
import { resolveStudentRollNumber } from '../../utils/examEngine';
import {
  CALENDAR_MONTHS,
  formatINR,
  formatTimestampDisplay,
  getSessionMonthsOrder,
  getSuggestedNextClass,
} from '../../utils/formatters';

type SubTab = 'sessions' | 'promotion' | 'history';

export const SessionsPromotionModule: React.FC = () => {
  const {
    db,
    activeSessionConfig,
    addAcademicSession,
    updateAcademicSession,
    setActiveAcademicSession,
    deleteAcademicSession,
    promoteStudents,
    getClassSessionFee,
    openEditStudentModal,
    requestConfirm,
  } = useSchool();

  const [subTab, setSubTab] = useState<SubTab>('sessions');

  // --- Sub-tab 1: Academic Session Form State ---
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [startMonth, setStartMonth] = useState<FeeMonth>('April');
  const [endMonth, setEndMonth] = useState<FeeMonth>('March');
  const [makeNewActive, setMakeNewActive] = useState(false);

  const previewMonths = useMemo(
    () => getSessionMonthsOrder(startMonth, endMonth),
    [startMonth, endMonth]
  );

  const handleSessionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSessionId) {
      const ok = updateAcademicSession(editingSessionId, {
        name: sessionName,
        startMonth,
        endMonth,
      });
      if (ok) {
        setEditingSessionId(null);
        setSessionName('');
        setStartMonth('April');
        setEndMonth('March');
      }
      return;
    }

    const ok = addAcademicSession({
      name: sessionName,
      startMonth,
      endMonth,
      makeActive: makeNewActive,
    });
    if (ok) {
      setSessionName('');
      setStartMonth('April');
      setEndMonth('March');
      setMakeNewActive(false);
    }
  };

  const startEditSession = (ses: AcademicSessionConfig) => {
    setEditingSessionId(ses.id);
    setSessionName(ses.name);
    setStartMonth(ses.startMonth);
    setEndMonth(ses.endMonth);
  };

  const cancelEditSession = () => {
    setEditingSessionId(null);
    setSessionName('');
    setStartMonth('April');
    setEndMonth('March');
  };

  // --- Sub-tab 2: Student Promotion State ---
  const availableClasses = useMemo(
    () => db.classes.map((c) => c.className),
    [db.classes]
  );

  const [fromSession, setFromSession] = useState<string>(db.activeSession);
  const [fromClass, setFromClass] = useState<string>(availableClasses[0] || 'Nursery');
  const [fromSection, setFromSection] = useState<string>('ALL');

  const [toSession, setToSession] = useState<string>(() => {
    const curIdx = db.sessions.findIndex((s) => s.name === db.activeSession);
    if (curIdx >= 0 && curIdx < db.sessions.length - 1) {
      return db.sessions[curIdx + 1].name;
    }
    return db.sessions[0]?.name || '2027-2028';
  });
  const [toClassMode, setToClassMode] = useState<'existing' | 'custom'>('existing');
  const [toClass, setToClass] = useState<string>(() =>
    getSuggestedNextClass(availableClasses[0] || 'Nursery')
  );
  const [sectionMode, setSectionMode] = useState<'keep' | 'assign'>('keep');
  const [assignedSection, setAssignedSection] = useState<string>('A');
  const [syncTuitionFee, setSyncTuitionFee] = useState<boolean>(true);
  const [autoSwitchSession, setAutoSwitchSession] = useState<boolean>(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [promotionBanner, setPromotionBanner] = useState<string | null>(null);

  // Sync suggested next class when source class changes
  useEffect(() => {
    const suggested = getSuggestedNextClass(fromClass);
    setToClass(suggested);
    const existsInGrid = db.classes.some(
      (c) => c.className.toLowerCase() === suggested.toLowerCase()
    );
    setToClassMode(existsInGrid ? 'existing' : 'custom');
  }, [fromClass, db.classes]);

  // Eligible active students in selected source session + class + optional section
  const sourceStudents = useMemo(() => {
    return db.students
      .filter((s) => {
        if (s.status === 'Deactive') return false;
        if (s.academicSession !== fromSession) return false;
        if (s.className !== fromClass) return false;
        if (fromSection !== 'ALL' && s.section !== fromSection) return false;
        return true;
      })
      .sort((a, b) =>
        a.admissionId.localeCompare(b.admissionId, undefined, { numeric: true })
      );
  }, [db.students, fromSession, fromClass, fromSection]);

  // Select all eligible students by default whenever source cohort changes
  useEffect(() => {
    setSelectedStudentIds(sourceStudents.map((s) => s.id));
  }, [sourceStudents]);

  const latestExamResultByStudentId = useMemo(() => {
    const map: Record<string, { examName: string; percentage: number; passed: boolean }> = {};
    db.marksheets.forEach((m) => {
      if (m.academicSession === fromSession) {
        map[m.studentId] = {
          examName: m.examName,
          percentage: m.percentage,
          passed: m.passed,
        };
      }
    });
    return map;
  }, [db.marksheets, fromSession]);

  const targetClassFeePreview = useMemo(() => {
    if (!toClass.trim() || !toSession.trim()) return null;
    return getClassSessionFee(toClass.trim(), toSession.trim());
  }, [getClassSessionFee, toClass, toSession]);

  const toggleStudentSelection = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedStudentIds.length === sourceStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(sourceStudents.map((s) => s.id));
    }
  };

  const selectPassedOnly = () => {
    const passedIds = sourceStudents
      .filter((s) => latestExamResultByStudentId[s.id]?.passed)
      .map((s) => s.id);
    setSelectedStudentIds(passedIds);
  };

  const handlePromoteBatch = () => {
    setPromotionBanner(null);
    if (selectedStudentIds.length === 0) return;

    const cleanTargetClass = toClass.trim();
    const cleanTargetSession = toSession.trim();

    requestConfirm({
      title: `Promote ${selectedStudentIds.length} ${
        selectedStudentIds.length === 1 ? 'Student' : 'Students'
      } to Class ${cleanTargetClass}?`,
      description: `Selected students from Class ${fromClass} (${fromSession}) will be promoted to Class ${cleanTargetClass} for Academic Session ${cleanTargetSession}. New sequential roll numbers will be assigned automatically while all past fee receipts, attendance registers, and exam marksheets remain preserved.`,
      confirmLabel: 'Confirm Promotion',
      onConfirm: () => {
        const res = promoteStudents({
          studentIds: selectedStudentIds,
          toSession: cleanTargetSession,
          toClassName: cleanTargetClass,
          sectionMode,
          assignedSection,
          syncTuitionFeeWithClassMaster: syncTuitionFee,
          autoSwitchActiveSession: autoSwitchSession,
        });
        if (res.ok) {
          setPromotionBanner(
            `Successfully promoted ${res.promotedCount} ${
              res.promotedCount === 1 ? 'student' : 'students'
            } from Class ${fromClass} (${fromSession}) to Class ${cleanTargetClass} (${cleanTargetSession}).`
          );
        }
      },
    });
  };

  // --- Sub-tab 3: Promotion Audit Log ---
  const promotionLogs = useMemo(() => {
    const items: Array<{
      studentId: string;
      admissionId: string;
      studentName: string;
      fromSession: string;
      toSession: string;
      fromClass: string;
      toClass: string;
      fromSection: string;
      toSection: string;
      previousRollNumber: string;
      newRollNumber: string;
      promotedAt: string;
      promotedBy: string;
    }> = [];

    db.students.forEach((stu) => {
      (stu.promotionHistory || []).forEach((h) => {
        items.push({
          studentId: stu.id,
          admissionId: stu.admissionId,
          studentName: stu.name,
          ...h,
        });
      });
    });

    return items.sort((a, b) => b.promotedAt.localeCompare(a.promotedAt));
  }, [db.students]);

  const sourceClassSections = useMemo(() => {
    const found = db.classes.find((c) => c.className === fromClass);
    return found ? found.sections : ['A', 'B', 'C'];
  }, [db.classes, fromClass]);

  return (
    <div className="space-y-6">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Global Active Session:</span>
            <span className="font-mono font-bold text-indigo-700 tabular-nums">
              {db.activeSession}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {activeSessionConfig.startMonth} to {activeSessionConfig.endMonth}
            </span>
          </div>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
            Academic Session Management &amp; Student Promotion
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setSubTab('sessions')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              subTab === 'sessions'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarRange className="h-3.5 w-3.5" />
            <span>Academic Sessions ({db.sessions.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('promotion')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              subTab === 'promotion'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>Promote Students</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('history')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              subTab === 'history'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Promotion History ({promotionLogs.length})</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SUB-TAB 1: ACADEMIC SESSIONS                                          */}
      {/* ===================================================================== */}
      {subTab === 'sessions' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Create / Edit Session Form */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs lg:col-span-5">
            <h3 className="text-base font-bold text-slate-900">
              {editingSessionId ? 'Edit Academic Session' : 'Create New Academic Session'}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Define academic year span by selecting starting and ending months (e.g., April to March).
            </p>

            <form onSubmit={handleSessionSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Academic Session Label <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="e.g., 2026-2027 or 2029-2030"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/15"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Starting Month
                  </label>
                  <select
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value as FeeMonth)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  >
                    {CALENDAR_MONTHS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Ending Month
                  </label>
                  <select
                    value={endMonth}
                    onChange={(e) => setEndMonth(e.target.value as FeeMonth)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  >
                    {CALENDAR_MONTHS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600">
                <div className="flex items-center justify-between font-semibold text-slate-800">
                  <span>Session Billing &amp; Term Cycle</span>
                  <span className="font-mono tabular-nums">
                    {previewMonths.length} {previewMonths.length === 1 ? 'Month' : 'Months'}
                  </span>
                </div>
                <p className="mt-1 leading-relaxed text-slate-500">
                  {previewMonths.join(' → ')}
                </p>
              </div>

              {!editingSessionId && (
                <label className="flex cursor-pointer items-center gap-2.5 pt-1 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={makeNewActive}
                    onChange={(e) => setMakeNewActive(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span>Set immediately as the Active / Current Session globally</span>
                </label>
              )}

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white whitespace-nowrap shrink-0 transition-colors hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4" />
                  <span>{editingSessionId ? 'Save Changes' : 'Add Academic Session'}</span>
                </button>
                {editingSessionId && (
                  <button
                    type="button"
                    onClick={cancelEditSession}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 whitespace-nowrap shrink-0 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Configured Sessions Directory */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs lg:col-span-7">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Configured Academic Sessions
                </h3>
                <p className="text-xs text-slate-500">
                  Mark one session as Active to set the default session across Admissions, Fees, Exams, and ID Cards.
                </p>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-3 pr-4">Session</th>
                    <th className="px-3 py-3">Duration</th>
                    <th className="px-3 py-3 text-right">Students</th>
                    <th className="px-3 py-3 text-right">Exams</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="py-3 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {db.sessions.map((ses) => {
                    const isCurrent = ses.name === db.activeSession || ses.isActive;
                    const months = getSessionMonthsOrder(ses.startMonth, ses.endMonth);
                    const activeStudentCount = db.students.filter(
                      (s) => s.academicSession === ses.name && s.status !== 'Deactive'
                    ).length;
                    const archivedStudentCount = db.students.filter(
                      (s) => s.academicSession === ses.name && s.status === 'Deactive'
                    ).length;
                    const examCount = db.exams.filter(
                      (e) => e.academicSession === ses.name
                    ).length;

                    return (
                      <tr key={ses.id} className="hover:bg-slate-50/70">
                        <td className="py-3.5 pr-4 font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {ses.name}
                        </td>
                        <td className="px-3 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                          <span className="font-medium text-slate-800">
                            {ses.startMonth} – {ses.endMonth}
                          </span>
                          <span className="mx-1.5 text-slate-300">·</span>
                          <span className="font-mono tabular-nums">{months.length}m</span>
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                          <span className="font-semibold text-slate-900">{activeStudentCount}</span>
                          {archivedStudentCount > 0 && (
                            <span className="text-slate-400"> (+{archivedStudentCount} arch)</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono text-xs font-semibold text-slate-700 tabular-nums">
                          {examCount}
                        </td>
                        <td className="px-3 py-3.5 text-xs whitespace-nowrap">
                          {isCurrent ? (
                            <span className="font-semibold text-emerald-700">
                              Active / Current
                            </span>
                          ) : (
                            <span className="text-slate-500">Configured</span>
                          )}
                        </td>
                        <td className="py-3.5 pl-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {!isCurrent && (
                              <button
                                type="button"
                                onClick={() => setActiveAcademicSession(ses.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 whitespace-nowrap shrink-0 transition-colors hover:bg-indigo-100"
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span>Set Active</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => startEditSession(ses)}
                              title="Edit Session"
                              className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            {!isCurrent && db.sessions.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  requestConfirm({
                                    title: `Delete Session ${ses.name}?`,
                                    description: `This removes ${ses.name} from the session list. Existing student or exam records remain intact.`,
                                    confirmLabel: 'Remove Session',
                                    destructive: true,
                                    onConfirm: () => deleteAcademicSession(ses.id),
                                  })
                                }
                                title="Delete Session"
                                className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 2: STUDENT PROMOTION SYSTEM                                   */}
      {/* ===================================================================== */}
      {subTab === 'promotion' && (
        <div className="space-y-6">
          {promotionBanner && (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-5 py-3.5 text-sm text-emerald-900">
              <span>{promotionBanner}</span>
              <button
                type="button"
                onClick={() => setPromotionBanner(null)}
                className="text-xs font-semibold text-emerald-800 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Source -> Destination Promotion Bar */}
          <div className="grid grid-cols-1 gap-6 rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs lg:grid-cols-12">
            {/* Source Cohort */}
            <div className="space-y-4 lg:col-span-5">
              <div>
                <p className="text-xs font-semibold text-slate-500">01. Source Cohort</p>
                <h3 className="text-base font-bold text-slate-900">
                  Select Outgoing Session &amp; Class
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Current Session
                  </label>
                  <select
                    value={fromSession}
                    onChange={(e) => setFromSession(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                  >
                    {db.sessions.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Current Class
                  </label>
                  <select
                    value={fromClass}
                    onChange={(e) => setFromClass(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none"
                  >
                    {availableClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Section Filter
                  </label>
                  <select
                    value={fromSection}
                    onChange={(e) => setFromSection(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  >
                    <option value="ALL">All Sections</option>
                    {sourceClassSections.map((sec) => (
                      <option key={sec} value={sec}>
                        Section {sec}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs text-slate-600">
                <span className="font-semibold text-slate-900">{sourceStudents.length}</span>{' '}
                active {sourceStudents.length === 1 ? 'student' : 'students'} found in Class{' '}
                <span className="font-semibold text-slate-900">{fromClass}</span> ({fromSession}).
                Deactive/archived students are automatically excluded.
              </div>
            </div>

            {/* Arrow Divider */}
            <div className="hidden items-center justify-center lg:col-span-1 lg:flex">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-indigo-600">
                <ArrowRight className="h-5 w-5" />
              </div>
            </div>

            {/* Target Promotion Destination */}
            <div className="space-y-4 lg:col-span-6">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-indigo-600">02. Promotion Target</p>
                  <h3 className="text-base font-bold text-slate-900">
                    Promote to New Session &amp; Next Higher Class
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setToClassMode((m) => (m === 'existing' ? 'custom' : 'existing'))
                  }
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 whitespace-nowrap shrink-0"
                >
                  {toClassMode === 'existing' ? 'Enter Custom Class' : 'Choose Existing Class'}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    New Academic Session
                  </label>
                  <select
                    value={toSession}
                    onChange={(e) => setToSession(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                  >
                    {db.sessions.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Next Higher Class
                  </label>
                  {toClassMode === 'existing' ? (
                    <select
                      value={toClass}
                      onChange={(e) => setToClass(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none"
                    >
                      {availableClasses.map((cls) => (
                        <option key={cls} value={cls}>
                          {cls}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={toClass}
                      onChange={(e) => setToClass(e.target.value)}
                      placeholder="e.g., 6th or Graduated"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Section Mapping
                  </label>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <select
                      value={sectionMode}
                      onChange={(e) => setSectionMode(e.target.value as 'keep' | 'assign')}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                    >
                      <option value="keep">Keep Current Sec</option>
                      <option value="assign">Assign Section</option>
                    </select>
                    {sectionMode === 'assign' && (
                      <input
                        type="text"
                        maxLength={3}
                        value={assignedSection}
                        onChange={(e) => setAssignedSection(e.target.value.toUpperCase())}
                        className="w-14 shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-center font-mono text-sm font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1 text-xs text-slate-700 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={syncTuitionFee}
                    onChange={(e) => setSyncTuitionFee(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span>
                    Update monthly tuition fee to Class {toClass || '—'} rate (
                    {targetClassFeePreview
                      ? `${formatINR(targetClassFeePreview.monthlyTuitionFee)}/mo`
                      : 'auto'}
                    )
                  </span>
                </label>

                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoSwitchSession}
                    onChange={(e) => setAutoSwitchSession(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span>Also mark {toSession} as Active Session</span>
                </label>
              </div>
            </div>
          </div>

          {/* Student Promotion Checklist Table */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Eligible Student Roster — Class {fromClass} ({fromSession})
                </h3>
                <p className="text-xs text-slate-500">
                  Uncheck any student to retain them in their current class. Past fee receipts, attendance, and marksheets are preserved automatically.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {sourceStudents.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 hover:bg-slate-50"
                    >
                      {selectedStudentIds.length === sourceStudents.length
                        ? 'Deselect All'
                        : 'Select All'}
                    </button>
                    <button
                      type="button"
                      onClick={selectPassedOnly}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 hover:bg-slate-50"
                    >
                      Select Exam Passed Only
                    </button>
                  </>
                )}

                <button
                  type="button"
                  disabled={selectedStudentIds.length === 0 || !toClass.trim()}
                  onClick={handlePromoteBatch}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowUpRight className="h-4 w-4" />
                  <span>
                    Promote Selected ({selectedStudentIds.length}) to {toClass || 'Next Class'}
                  </span>
                </button>
              </div>
            </div>

            {sourceStudents.length === 0 ? (
              <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
                <Users className="h-8 w-8 text-slate-400" />
                <p className="mt-2.5 text-sm font-semibold text-slate-800">
                  No active students in Class {fromClass} for Session {fromSession}
                </p>
                <p className="mt-1 max-w-md text-xs text-slate-500">
                  Select another source session or class above, or admit students in the Admissions module first.
                </p>
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                      <th className="py-3 pr-3">Promote</th>
                      <th className="px-3 py-3">Adm ID</th>
                      <th className="px-3 py-3">Student Name</th>
                      <th className="px-3 py-3">Current Class &amp; Roll</th>
                      <th className="px-3 py-3">Latest Exam Result</th>
                      <th className="px-3 py-3">Target Mapping</th>
                      <th className="py-3 pl-3 text-right">Profile</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sourceStudents.map((stu, idx) => {
                      const isChecked = selectedStudentIds.includes(stu.id);
                      const currentRoll = resolveStudentRollNumber(stu, db.students);
                      const examInfo = latestExamResultByStudentId[stu.id];
                      const nextSec =
                        sectionMode === 'assign' && assignedSection.trim()
                          ? assignedSection.trim().toUpperCase()
                          : stu.section;

                      return (
                        <tr
                          key={stu.id}
                          className={isChecked ? 'bg-indigo-50/25' : 'hover:bg-slate-50/60'}
                        >
                          <td className="py-3 pr-3">
                            <button
                              type="button"
                              onClick={() => toggleStudentSelection(stu.id)}
                              className="inline-flex items-center text-indigo-600"
                              aria-label={`Select ${stu.name}`}
                            >
                              {isChecked ? (
                                <CheckSquare className="h-4 w-4 text-indigo-600" />
                              ) : (
                                <Square className="h-4 w-4 text-slate-400" />
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-3 font-mono text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap">
                            {stu.admissionId}
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-semibold text-slate-900">{stu.name}</p>
                            <p className="text-xs text-slate-500">F: {stu.fatherName || '—'}</p>
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                            Class {stu.className}-{stu.section} · Roll {currentRoll}
                          </td>
                          <td className="px-3 py-3 text-xs whitespace-nowrap">
                            {examInfo ? (
                              <span
                                className={
                                  examInfo.passed
                                    ? 'font-semibold text-emerald-700'
                                    : 'font-semibold text-rose-700'
                                }
                              >
                                {examInfo.examName}: {examInfo.percentage}% (
                                {examInfo.passed ? 'PASS' : 'FAIL'})
                              </span>
                            ) : (
                              <span className="text-slate-400">No marksheet in {fromSession}</span>
                            )}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">
                            {isChecked ? (
                              <span className="font-semibold text-indigo-700">
                                {toClass || '—'}-{nextSec} ({toSession}) · #{idx + 1}
                              </span>
                            ) : (
                              <span className="text-slate-400">Retain in {stu.className}</span>
                            )}
                          </td>
                          <td className="py-3 pl-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openEditStudentModal(stu.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              <Edit3 className="h-3 w-3" />
                              <span>Edit</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 3: PROMOTION HISTORY LOG                                      */}
      {/* ===================================================================== */}
      {subTab === 'history' && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <h3 className="text-base font-bold text-slate-900">
            Student Academic Promotion Audit Log
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Complete chronological record of class, section, session, and roll number transitions across sessions.
          </p>

          {promotionLogs.length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
              <History className="h-8 w-8 text-slate-400" />
              <p className="mt-2.5 text-sm font-semibold text-slate-800">
                No promotion transitions recorded yet
              </p>
              <p className="mt-1 max-w-md text-xs text-slate-500">
                When students are promoted to a higher class for a new session, their previous class, section, and roll number history is logged here automatically.
              </p>
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-3 pr-3">Adm ID</th>
                    <th className="px-3 py-3">Student Name</th>
                    <th className="px-3 py-3">Previous Academic Mapping</th>
                    <th className="px-3 py-3">Promoted Academic Mapping</th>
                    <th className="px-3 py-3">Promoted By</th>
                    <th className="py-3 pl-3 text-right">Date &amp; Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {promotionLogs.map((log, i) => (
                    <tr key={`${log.studentId}-${i}`} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-3 font-mono text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {log.admissionId}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">
                        {log.studentName}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {log.fromSession} · Class {log.fromClass}-{log.fromSection} (Roll{' '}
                        {log.previousRollNumber})
                      </td>
                      <td className="px-3 py-3 font-mono text-xs font-semibold text-indigo-700 tabular-nums whitespace-nowrap">
                        {log.toSession} · Class {log.toClass}-{log.toSection} (Roll{' '}
                        {log.newRollNumber})
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">{log.promotedBy}</td>
                      <td className="py-3 pl-3 text-right font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {formatTimestampDisplay(log.promotedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
