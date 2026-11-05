import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Printer, Save, ArrowRight, CheckCheck, FileSpreadsheet } from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { useRowSelection } from '../../hooks/useRowSelection';
import { AttendanceStatus, StudentRecord } from '../../types/erp';
import { exportAttendanceToExcel } from '../../utils/excelExporter';
import { formatTimestampDisplay, getTodayISO } from '../../utils/formatters';
import { ExcelExportBar, TableSelectCheckbox } from '../ui/ExcelExportControl';

const STATUS_OPTIONS: AttendanceStatus[] = ['Present', 'Absent', 'Late'];

export const AttendanceModule: React.FC = () => {
  const {
    db,
    currentUserEmail,
    canAccessModule,
    canManageAttendance,
    saveAttendanceSheet,
    openPrintPreview,
    setActiveModule,
    notify,
  } = useSchool();

  const defaultClass = db.classes[0]?.className || 'Nursery';
  const [selectedDate, setSelectedDate] = useState(getTodayISO());
  const [selectedClass, setSelectedClass] = useState(defaultClass);
  const [selectedSection, setSelectedSection] = useState('ALL');

  // Active loaded sheet parameters
  const [loadedParams, setLoadedParams] = useState({
    date: getTodayISO(),
    className: defaultClass,
    section: 'ALL',
  });

  const [draftEntries, setDraftEntries] = useState<Record<string, AttendanceStatus>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  const availableSections = useMemo(() => {
    const cls = db.classes.find((c) => c.className === selectedClass);
    return cls ? cls.sections : ['A', 'B', 'C'];
  }, [db.classes, selectedClass]);

  const classStudents = useMemo(() => {
    return db.students
      .filter((stu) => {
        if (stu.status === 'Deactive') return false;
        if (stu.className !== loadedParams.className) return false;
        if (loadedParams.section !== 'ALL' && stu.section !== loadedParams.section) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [db.students, loadedParams]);

  const sheetKey = `${loadedParams.date}__${loadedParams.className}__${loadedParams.section}`;
  const savedSheet = db.attendance[sheetKey];

  const getStudentRowId = useCallback((stu: StudentRecord) => stu.id, []);
  const attendanceSelection = useRowSelection(classStudents, getStudentRowId);
  const [exportingExcel, setExportingExcel] = useState(false);

  const handleExportAttendanceExcel = async (forceAll = false) => {
    const isPartial = !forceAll && attendanceSelection.selectedCount > 0;
    const rowsToExport = isPartial ? attendanceSelection.selectedItems : classStudents;
    if (rowsToExport.length === 0) return;

    setExportingExcel(true);
    try {
      const res = await exportAttendanceToExcel({
        students: rowsToExport,
        allStudentsForRoll: db.students,
        entries: draftEntries,
        notes: draftNotes,
        date: loadedParams.date,
        className: loadedParams.className,
        section: loadedParams.section,
        markedBy: savedSheet?.markedBy || currentUserEmail || 'Class Teacher',
        schoolProfile: db.schoolProfile,
        activeSession: db.activeSession,
        isPartialSelection: isPartial,
      });
      notify(
        'success',
        'Attendance Exported to Excel (.xlsx)',
        `Downloaded ${res.filename} (${res.rowCount} rows in ${res.elapsedMs}ms).`
      );
    } catch (err) {
      notify(
        'error',
        'Excel Export Failed',
        err instanceof Error ? err.message : 'Could not generate Excel workbook.'
      );
    } finally {
      setExportingExcel(false);
    }
  };

  // Hydrate draft entries whenever loadedParams or classStudents change
  useEffect(() => {
    const existing = db.attendance[sheetKey];
    const nextEntries: Record<string, AttendanceStatus> = {};
    const nextNotes: Record<string, string> = {};

    classStudents.forEach((stu) => {
      nextEntries[stu.id] = existing?.entries?.[stu.id] || 'Present';
      nextNotes[stu.id] = existing?.notes?.[stu.id] || '';
    });

    setDraftEntries(nextEntries);
    setDraftNotes(nextNotes);
  }, [sheetKey, classStudents, db.attendance]);

  const handleLoadSheet = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoadedParams({
      date: selectedDate || getTodayISO(),
      className: selectedClass,
      section: selectedSection,
    });
  };

  const handleMarkAll = (status: AttendanceStatus) => {
    const updated: Record<string, AttendanceStatus> = {};
    classStudents.forEach((stu) => {
      updated[stu.id] = status;
    });
    setDraftEntries(updated);
  };

  const handleSave = () => {
    saveAttendanceSheet(
      loadedParams.date,
      loadedParams.className,
      loadedParams.section,
      draftEntries,
      draftNotes
    );
  };

  const handlePrintRegister = () => {
    openPrintPreview({
      type: 'attendance-sheet',
      date: loadedParams.date,
      className: loadedParams.className,
      section: loadedParams.section,
      rows: classStudents.map((stu) => ({
        student: stu,
        status: draftEntries[stu.id] || 'Present',
        note: draftNotes[stu.id] || '',
      })),
      markedBy: savedSheet?.markedBy || currentUserEmail || 'Class Teacher',
    });
  };

  const summary = useMemo(() => {
    const total = classStudents.length;
    let present = 0;
    let absent = 0;
    let late = 0;
    classStudents.forEach((stu) => {
      const st = draftEntries[stu.id] || 'Present';
      if (st === 'Present') present += 1;
      else if (st === 'Absent') absent += 1;
      else late += 1;
    });
    const pct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { total, present, absent, late, pct };
  }, [classStudents, draftEntries]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            06. Daily Attendance Tracker
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Load daily class registers, toggle Present / Absent / Late statuses, and print attendance sheets
          </p>
        </div>

        {classStudents.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={exportingExcel}
              onClick={() => void handleExportAttendanceExcel(false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap"
              title="Export attendance register to formatted Microsoft Excel (.xlsx)"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
              <span>
                {attendanceSelection.selectedCount > 0
                  ? `Export Selected (${attendanceSelection.selectedCount}) (.xlsx)`
                  : 'Export to Excel (.xlsx)'}
              </span>
            </button>
            <button
              type="button"
              onClick={handlePrintRegister}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <Printer className="h-4 w-4" />
              <span>Print Register</span>
            </button>
            {canManageAttendance && (
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
              >
                <Save className="h-4 w-4" />
                <span>Save Attendance</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <form
        onSubmit={handleLoadSheet}
        className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50/60 px-5 py-4"
      >
        <div>
          <label htmlFor="att-date" className="block text-xs font-semibold text-slate-700">
            Attendance Date
          </label>
          <input
            id="att-date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="att-class" className="block text-xs font-semibold text-slate-700">
            Select Class
          </label>
          <select
            id="att-class"
            value={selectedClass}
            onChange={(e) => {
              setSelectedClass(e.target.value);
              setSelectedSection('ALL');
            }}
            className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-600 focus:outline-none"
          >
            {db.classes.map((cls) => (
              <option key={cls.id} value={cls.className}>
                Class {cls.className}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="att-section" className="block text-xs font-semibold text-slate-700">
            Section
          </label>
          <select
            id="att-section"
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-600 focus:outline-none"
          >
            <option value="ALL">All Sections</option>
            {availableSections.map((sec) => (
              <option key={sec} value={sec}>
                Section {sec}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
        >
          Load Sheet
        </button>

        {savedSheet && (
          <span className="ml-auto text-xs text-emerald-700">
            Saved · {formatTimestampDisplay(savedSheet.updatedAt)}
          </span>
        )}
      </form>

      {/* Sheet Body */}
      {classStudents.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <CalendarCheck className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900">
            No Students Enrolled in Class {loadedParams.className}
            {loadedParams.section !== 'ALL' ? ` (Section ${loadedParams.section})` : ''}
          </h3>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            Admit students into Class {loadedParams.className} in Module 1, or choose another class above and click Load Sheet.
          </p>
          {canAccessModule('admissions') && (
            <button
              type="button"
              onClick={() => setActiveModule('admissions')}
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <span>Go to Student Admissions</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div>
          {/* Live Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-3 text-xs">
            <div className="flex flex-wrap items-center gap-4 text-slate-600">
              <span>
                Roll Strength:{' '}
                <strong className="font-mono text-slate-900 tabular-nums">{summary.total}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Present:{' '}
                <strong className="font-mono text-emerald-700 tabular-nums">
                  {summary.present}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Absent:{' '}
                <strong className="font-mono text-rose-700 tabular-nums">{summary.absent}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Late:{' '}
                <strong className="font-mono text-amber-700 tabular-nums">{summary.late}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Attendance:{' '}
                <strong className="font-mono text-indigo-700 tabular-nums">{summary.pct}%</strong>
              </span>
            </div>

            {canManageAttendance && (
              <button
                type="button"
                onClick={() => handleMarkAll('Present')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark All Present</span>
              </button>
            )}
          </div>

          <ExcelExportBar
            totalCount={attendanceSelection.totalCount}
            selectedCount={attendanceSelection.selectedCount}
            isAllSelected={attendanceSelection.isAllSelected}
            exporting={exportingExcel}
            datasetLabel="attendance rows"
            onExportSelectedOrAll={() => void handleExportAttendanceExcel(false)}
            onExportFullDataset={() => void handleExportAttendanceExcel(true)}
            onToggleSelectAll={attendanceSelection.toggleSelectAll}
            onClearSelection={attendanceSelection.clearSelection}
          />

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <th className="w-10 px-4 py-3 text-center">
                    <TableSelectCheckbox
                      checked={attendanceSelection.isAllSelected}
                      indeterminate={attendanceSelection.isIndeterminate}
                      onChange={attendanceSelection.toggleSelectAll}
                      ariaLabel="Select all attendance rows for Excel export"
                    />
                  </th>
                  <th className="px-4 py-3 w-14">S.No</th>
                  <th className="px-4 py-3 whitespace-nowrap">Admission ID</th>
                  <th className="px-4 py-3 whitespace-nowrap">Student Name</th>
                  <th className="px-4 py-3 whitespace-nowrap">Class &amp; Sec</th>
                  <th className="px-4 py-3 whitespace-nowrap">Attendance Status</th>
                  <th className="px-4 py-3">Remarks / Leave Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classStudents.map((stu, idx) => {
                  const currentStatus = draftEntries[stu.id] || 'Present';
                  const isRowChecked = attendanceSelection.isSelected(stu.id);
                  return (
                    <tr
                      key={stu.id}
                      className={`transition-colors hover:bg-slate-50/70 ${
                        isRowChecked ? 'bg-indigo-50/50' : ''
                      }`}
                    >
                      <td className="w-10 px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isRowChecked}
                          onChange={() => attendanceSelection.toggleRow(stu.id)}
                          aria-label={`Select ${stu.name} (${stu.admissionId})`}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500/30"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-500 tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-indigo-700 tabular-nums whitespace-nowrap">
                        {stu.admissionId}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-900 whitespace-nowrap">
                        {stu.name}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                        {stu.className} · Sec {stu.section}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                          {STATUS_OPTIONS.map((option) => {
                            const active = currentStatus === option;
                            const activeClasses =
                              option === 'Present'
                                ? 'bg-emerald-600 text-white'
                                : option === 'Absent'
                                ? 'bg-rose-600 text-white'
                                : 'bg-amber-600 text-white';

                            return (
                              <button
                                key={option}
                                type="button"
                                disabled={!canManageAttendance}
                                onClick={() =>
                                  setDraftEntries((prev) => ({ ...prev, [stu.id]: option }))
                                }
                                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap disabled:cursor-default ${
                                  active
                                    ? activeClasses
                                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                                }`}
                              >
                                {option}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          disabled={!canManageAttendance}
                          value={draftNotes[stu.id] || ''}
                          onChange={(e) =>
                            setDraftNotes((prev) => ({ ...prev, [stu.id]: e.target.value }))
                          }
                          placeholder={
                            canManageAttendance ? 'Optional note (e.g. Medical leave)' : '—'
                          }
                          className="w-full max-w-xs rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none disabled:bg-slate-50"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
