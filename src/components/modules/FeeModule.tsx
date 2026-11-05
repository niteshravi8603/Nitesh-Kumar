import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Receipt,
  Search,
  Printer,
  Trash2,
  IndianRupee,
  ArrowRight,
  CheckCircle2,
  SlidersHorizontal,
  AlertCircle,
  PauseCircle,
  Pencil,
  FileSpreadsheet,
} from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { useRowSelection } from '../../hooks/useRowSelection';
import {
  FeeCategory,
  FeeMonth,
  FeeRecord,
  PaymentMode,
  StudentDueSummary,
} from '../../types/erp';
import {
  exportFeeDuesToExcel,
  exportFeeReceiptsToExcel,
  exportFeeStructureToExcel,
} from '../../utils/excelExporter';
import {
  ACADEMIC_SESSIONS,
  formatDateDisplay,
  formatINR,
  getTodayISO,
  sanitizeNumber,
} from '../../utils/formatters';
import { ExcelExportBar, TableSelectCheckbox } from '../ui/ExcelExportControl';
import { ModalShell } from '../ui/ModalShell';

const FEE_CATEGORIES: FeeCategory[] = ['Tuition', 'Admission', 'Transport', 'Exam'];
const PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Bank'];

export const FeeModule: React.FC = () => {
  const {
    db,
    dueOverview,
    activeSessionMonths,
    isCurrentUserAdmin,
    canManageFees,
    canDeleteRecords,
    feeSubTab,
    setFeeSubTab,
    preselectedFeeStudentId,
    clearPreselectedFeeStudent,
    openEditStudentModal,
    setBillingCutoffMonth,
    getClassSessionFee,
    updateClassSessionFee,
    collectFee,
    deleteFee,
    openPrintPreview,
    requestConfirm,
    setActiveModule,
    notify,
  } = useSchool();

  // Ledger Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [modeFilter, setModeFilter] = useState<string>('ALL');

  // Automated Due Engine Filters
  const [dueSearch, setDueSearch] = useState('');
  const [dueClassFilter, setDueClassFilter] = useState('ALL');
  const [dueRosterMode, setDueRosterMode] = useState<'active' | 'frozen'>('active');
  const [onlyDefaulters, setOnlyDefaulters] = useState(false);

  // Class & Session Fee Master state
  const [selectedScheduleSession, setSelectedScheduleSession] = useState(
    db.activeSession || '2026-2027'
  );

  useEffect(() => {
    if (db.activeSession) {
      setSelectedScheduleSession(db.activeSession);
    }
  }, [db.activeSession]);

  const availableSessionNames = useMemo(() => {
    const names = new Set<string>(db.sessions.map((s) => s.name));
    ACADEMIC_SESSIONS.forEach((s) => names.add(s));
    db.students.forEach((s) => {
      if (s.academicSession) names.add(s.academicSession);
    });
    return Array.from(names);
  }, [db.sessions, db.students]);

  const activeStudentsList = useMemo(
    () => db.students.filter((s) => s.status !== 'Deactive'),
    [db.students]
  );

  const frozenStudentsCount = useMemo(
    () => db.students.filter((s) => s.status === 'Deactive').length,
    [db.students]
  );

  // Collect Fee Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [studentId, setStudentId] = useState('');
  const [category, setCategory] = useState<FeeCategory>('Tuition');
  const [feeMonth, setFeeMonth] = useState<FeeMonth>(db.billingCutoffMonth);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [amountInput, setAmountInput] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayISO());
  const [remarks, setRemarks] = useState('');

  const suggestPaymentDetails = (
    targetStudentId: string,
    preferredCategory?: FeeCategory
  ): { category: FeeCategory; month: FeeMonth; amount: string } => {
    const stu = db.students.find((s) => s.id === targetStudentId);
    if (!stu) {
      return { category: 'Tuition', month: db.billingCutoffMonth, amount: '' };
    }
    const due = dueOverview.byStudentId[targetStudentId];
    const schedule = getClassSessionFee(stu.className, stu.academicSession);
    const defaultStartMonth = activeSessionMonths[0] || 'April';

    if (!preferredCategory && due && !due.isFeeFrozen) {
      if (due.dueAdmission > 0) {
        return {
          category: 'Admission',
          month: due.billableMonths[0] || defaultStartMonth,
          amount: String(due.dueAdmission),
        };
      }
      if (due.dueTuition > 0) {
        return {
          category: 'Tuition',
          month: due.unpaidTuitionMonths[0] || db.billingCutoffMonth,
          amount: String(stu.monthlyTuitionFee || due.dueTuition),
        };
      }
      if (due.dueTransport > 0) {
        return {
          category: 'Transport',
          month: due.unpaidTransportMonths[0] || db.billingCutoffMonth,
          amount: String(stu.transportFee || due.dueTransport),
        };
      }
    }

    const cat = preferredCategory || 'Tuition';
    if (cat === 'Admission') {
      const rem = due && due.dueAdmission > 0 ? due.dueAdmission : stu.admissionFee;
      return {
        category: 'Admission',
        month: defaultStartMonth,
        amount: rem > 0 ? String(rem) : '',
      };
    }
    if (cat === 'Tuition') {
      const nextMonth = due?.unpaidTuitionMonths[0] || db.billingCutoffMonth;
      return {
        category: 'Tuition',
        month: nextMonth,
        amount: stu.monthlyTuitionFee > 0 ? String(stu.monthlyTuitionFee) : '',
      };
    }
    if (cat === 'Transport') {
      const nextMonth = due?.unpaidTransportMonths[0] || db.billingCutoffMonth;
      const fare = stu.transportEnabled ? stu.transportFee : 0;
      return {
        category: 'Transport',
        month: nextMonth,
        amount: fare > 0 ? String(fare) : '',
      };
    }
    return {
      category: 'Exam',
      month: db.billingCutoffMonth,
      amount: schedule.annualExamFee > 0 ? String(schedule.annualExamFee) : '',
    };
  };

  // Handle cross-module jump from Admissions "Collect Due" button
  useEffect(() => {
    if (preselectedFeeStudentId) {
      const suggested = suggestPaymentDetails(preselectedFeeStudentId);
      setStudentId(preselectedFeeStudentId);
      setCategory(suggested.category);
      setFeeMonth(suggested.month);
      setAmountInput(suggested.amount);
      setPaymentMode('Cash');
      setPaymentDate(getTodayISO());
      setRemarks('');
      setFormError('');
      setModalOpen(true);
      clearPreselectedFeeStudent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedFeeStudentId]);

  const openCollectModalForStudent = (targetStudentId?: string) => {
    const defaultStu = activeStudentsList[0] || db.students[0];
    const chosenId = targetStudentId || defaultStu?.id || '';
    const suggested = chosenId
      ? suggestPaymentDetails(chosenId)
      : { category: 'Tuition' as FeeCategory, month: db.billingCutoffMonth, amount: '' };
    setStudentId(chosenId);
    setCategory(suggested.category);
    setFeeMonth(suggested.month);
    setAmountInput(suggested.amount);
    setPaymentMode('Cash');
    setPaymentDate(getTodayISO());
    setRemarks('');
    setFormError('');
    setModalOpen(true);
  };

  const handleCategoryOrStudentChange = (nextStudentId: string, nextCategory: FeeCategory) => {
    const suggested = suggestPaymentDetails(nextStudentId, nextCategory);
    setStudentId(nextStudentId);
    setCategory(nextCategory);
    setFeeMonth(suggested.month);
    setAmountInput(suggested.amount);
  };

  const filteredFees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return db.fees.filter((f) => {
      if (categoryFilter !== 'ALL' && f.category !== categoryFilter) return false;
      if (modeFilter !== 'ALL' && f.paymentMode !== modeFilter) return false;
      if (!q) return true;
      return (
        f.receiptNo.toLowerCase().includes(q) ||
        f.studentName.toLowerCase().includes(q) ||
        f.admissionId.toLowerCase().includes(q) ||
        f.feeMonth.toLowerCase().includes(q)
      );
    });
  }, [db.fees, categoryFilter, modeFilter, searchQuery]);

  const filteredDueSummaries = useMemo(() => {
    const q = dueSearch.trim().toLowerCase();
    return dueOverview.summaries.filter((item) => {
      if (dueRosterMode === 'active' && item.isFeeFrozen) return false;
      if (dueRosterMode === 'frozen' && !item.isFeeFrozen) return false;
      if (dueRosterMode === 'active' && onlyDefaulters && item.totalOutstandingDue <= 0) {
        return false;
      }
      if (dueClassFilter !== 'ALL' && item.student.className !== dueClassFilter) return false;
      if (!q) return true;
      return (
        item.student.admissionId.toLowerCase().includes(q) ||
        item.student.name.toLowerCase().includes(q) ||
        item.student.fatherName.toLowerCase().includes(q) ||
        item.student.phone.toLowerCase().includes(q)
      );
    });
  }, [dueOverview.summaries, dueRosterMode, onlyDefaulters, dueClassFilter, dueSearch]);

  const getFeeId = useCallback((f: FeeRecord) => f.id, []);
  const getDueId = useCallback((s: StudentDueSummary) => s.student.id, []);
  const receiptSelection = useRowSelection(filteredFees, getFeeId);
  const dueSelection = useRowSelection(filteredDueSummaries, getDueId);
  const [exportingExcel, setExportingExcel] = useState(false);

  const handleExportFeeReceiptsExcel = async (forceAll = false) => {
    const isPartial = !forceAll && receiptSelection.selectedCount > 0;
    const rowsToExport = isPartial ? receiptSelection.selectedItems : filteredFees;
    if (rowsToExport.length === 0) return;

    setExportingExcel(true);
    try {
      const res = await exportFeeReceiptsToExcel({
        fees: rowsToExport,
        schoolProfile: db.schoolProfile,
        activeSession: db.activeSession,
        categoryFilter,
        modeFilter,
        isPartialSelection: isPartial,
      });
      notify(
        'success',
        'Fee Receipts Exported to Excel (.xlsx)',
        `Downloaded ${res.filename} (${res.rowCount} receipts in ${res.elapsedMs}ms).`
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

  const handleExportFeeDuesExcel = async (forceAll = false) => {
    const isPartial = !forceAll && dueSelection.selectedCount > 0;
    const rowsToExport = isPartial ? dueSelection.selectedItems : filteredDueSummaries;
    if (rowsToExport.length === 0) return;

    setExportingExcel(true);
    try {
      const res = await exportFeeDuesToExcel({
        summaries: rowsToExport,
        cutoffMonth: db.billingCutoffMonth,
        classFilter: dueClassFilter,
        rosterMode: dueRosterMode,
        schoolProfile: db.schoolProfile,
        activeSession: db.activeSession,
        isPartialSelection: isPartial,
      });
      notify(
        'success',
        'Fee Dues Register Exported to Excel (.xlsx)',
        `Downloaded ${res.filename} (${res.rowCount} students in ${res.elapsedMs}ms).`
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

  const handleExportFeeStructureExcel = async () => {
    if (db.classes.length === 0) return;
    setExportingExcel(true);
    try {
      const schedules = db.classes.map((cls) =>
        getClassSessionFee(cls.className, selectedScheduleSession)
      );
      const res = await exportFeeStructureToExcel({
        schedules,
        schoolProfile: db.schoolProfile,
        sessionName: selectedScheduleSession,
      });
      notify(
        'success',
        'Fee Structure Exported to Excel (.xlsx)',
        `Downloaded ${res.filename} (${res.rowCount} classes in ${res.elapsedMs}ms).`
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

  const modeTotals = useMemo(() => {
    return db.fees.reduce(
      (acc, f) => {
        const val = Number(f.amount) || 0;
        acc.total += val;
        if (f.paymentMode === 'Cash') acc.cash += val;
        if (f.paymentMode === 'UPI') acc.upi += val;
        if (f.paymentMode === 'Bank') acc.bank += val;
        return acc;
      },
      { total: 0, cash: 0, upi: 0, bank: 0 }
    );
  }, [db.fees]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!studentId) {
      setFormError('Please select a student from the admissions directory.');
      return;
    }
    const cleanAmt = sanitizeNumber(amountInput, 0);
    if (cleanAmt <= 0) {
      setFormError('Please enter a valid fee amount greater than ₹0.');
      return;
    }

    const receipt = collectFee({
      studentId,
      category,
      feeMonth,
      paymentMode,
      amount: cleanAmt,
      date: paymentDate || getTodayISO(),
      remarks,
    });

    if (receipt) {
      setModalOpen(false);
      openPrintPreview({ type: 'fee-receipt', fee: receipt });
    }
  };

  const renderPendingBreakdown = (summary: StudentDueSummary): string => {
    if (summary.isFeeFrozen) {
      return 'Fee Frozen (Deactive) · Monthly billing paused';
    }
    const parts: string[] = [];
    if (summary.dueAdmission > 0) {
      parts.push(`Adm: ${formatINR(summary.dueAdmission)}`);
    }
    if (summary.dueTuition > 0) {
      const mList =
        summary.unpaidTuitionMonths.length > 0
          ? ` (${summary.unpaidTuitionMonths.map((m) => m.slice(0, 3)).join(', ')})`
          : '';
      parts.push(`Tuition: ${formatINR(summary.dueTuition)}${mList}`);
    }
    if (summary.dueTransport > 0) {
      parts.push(`Bus: ${formatINR(summary.dueTransport)}`);
    }
    return parts.length > 0 ? parts.join(' · ') : 'All billed heads settled';
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      {/* Header & Primary Action */}
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            02. Fee Collection, Ledger &amp; Automated Due Engine
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Real-time student due computation, automatic Deactive Fee Freeze, sequential fee receipts, and Class &amp; Session fee schedules
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setFeeSubTab('ledger')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                feeSubTab === 'ledger'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Payment Ledger ({db.fees.length})
            </button>
            <button
              type="button"
              onClick={() => setFeeSubTab('dues')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                feeSubTab === 'dues'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Automated Dues ({dueOverview.defaultersCount})
            </button>
            <button
              type="button"
              onClick={() => setFeeSubTab('structure')}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                feeSubTab === 'structure'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Class Fee Master</span>
            </button>
          </div>

          {((feeSubTab === 'ledger' && filteredFees.length > 0) ||
            (feeSubTab === 'dues' && filteredDueSummaries.length > 0) ||
            (feeSubTab === 'structure' && db.classes.length > 0)) && (
            <button
              type="button"
              disabled={exportingExcel}
              onClick={() => {
                if (feeSubTab === 'ledger') void handleExportFeeReceiptsExcel(false);
                else if (feeSubTab === 'dues') void handleExportFeeDuesExcel(false);
                else void handleExportFeeStructureExcel();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap shrink-0"
              title="Export current fee register to formatted Microsoft Excel (.xlsx)"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
              <span>
                {feeSubTab === 'ledger' && receiptSelection.selectedCount > 0
                  ? `Export Selected (${receiptSelection.selectedCount}) (.xlsx)`
                  : feeSubTab === 'dues' && dueSelection.selectedCount > 0
                  ? `Export Selected (${dueSelection.selectedCount}) (.xlsx)`
                  : 'Export to Excel (.xlsx)'}
              </span>
            </button>
          )}

          {canManageFees && (
            <button
              type="button"
              onClick={() => openCollectModalForStudent()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap shrink-0"
            >
              <IndianRupee className="h-4 w-4" />
              <span>Collect Fee</span>
            </button>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SUB-TAB 1: PAYMENT LEDGER & RECEIPTS                                  */}
      {/* ===================================================================== */}
      {feeSubTab === 'ledger' && (
        <>
          <div className="grid grid-cols-2 gap-4 border-b border-slate-200 bg-slate-50/50 px-5 py-3.5 sm:grid-cols-4 text-xs">
            <div>
              <span className="text-slate-500">Total Collected</span>
              <p className="mt-0.5 font-mono text-sm font-bold text-emerald-700 tabular-nums">
                {formatINR(modeTotals.total)}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Cash Collection</span>
              <p className="mt-0.5 font-mono text-sm font-semibold text-slate-800 tabular-nums">
                {formatINR(modeTotals.cash)}
              </p>
            </div>
            <div>
              <span className="text-slate-500">UPI Payments</span>
              <p className="mt-0.5 font-mono text-sm font-semibold text-slate-800 tabular-nums">
                {formatINR(modeTotals.upi)}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Bank Transfers</span>
              <p className="mt-0.5 font-mono text-sm font-semibold text-slate-800 tabular-nums">
                {formatINR(modeTotals.bank)}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search receipt no, student, month..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-indigo-600 focus:outline-none"
              >
                <option value="ALL">All Fee Categories</option>
                {FEE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat} Fee
                  </option>
                ))}
              </select>

              <select
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-indigo-600 focus:outline-none"
              >
                <option value="ALL">All Payment Modes</option>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {db.fees.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Receipt className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                No Fee Receipts Issued Yet
              </h3>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                {db.students.length === 0
                  ? 'Admit at least one student first, then collect Tuition, Admission, Transport, or Exam fees with instant printable receipts.'
                  : 'Record a student fee payment or switch to the Automated Dues tab to collect pending student balances.'}
              </p>
              {db.students.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setActiveModule('admissions')}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
                >
                  <span>Go to Student Admissions</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : canManageFees ? (
                <button
                  type="button"
                  onClick={() => openCollectModalForStudent()}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
                >
                  <IndianRupee className="h-4 w-4" />
                  <span>Collect First Fee</span>
                </button>
              ) : null}
            </div>
          ) : filteredFees.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No fee receipts match your active search or filter criteria.
            </div>
          ) : (
            <div>
              <ExcelExportBar
                totalCount={receiptSelection.totalCount}
                selectedCount={receiptSelection.selectedCount}
                isAllSelected={receiptSelection.isAllSelected}
                exporting={exportingExcel}
                datasetLabel="fee receipts"
                onExportSelectedOrAll={() => void handleExportFeeReceiptsExcel(false)}
                onExportFullDataset={() => void handleExportFeeReceiptsExcel(true)}
                onToggleSelectAll={receiptSelection.toggleSelectAll}
                onClearSelection={receiptSelection.clearSelection}
              />
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                      <th className="w-10 px-4 py-3 text-center">
                        <TableSelectCheckbox
                          checked={receiptSelection.isAllSelected}
                          indeterminate={receiptSelection.isIndeterminate}
                          onChange={receiptSelection.toggleSelectAll}
                          ariaLabel="Select all visible fee receipts for Excel export"
                        />
                      </th>
                      <th className="px-4 py-3 whitespace-nowrap">Receipt No</th>
                      <th className="px-4 py-3 whitespace-nowrap">Student Name</th>
                      <th className="px-4 py-3 whitespace-nowrap">Class</th>
                      <th className="px-4 py-3 whitespace-nowrap">Fee Category</th>
                      <th className="px-4 py-3 whitespace-nowrap">Fee Month</th>
                      <th className="px-4 py-3 whitespace-nowrap">Payment Mode</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Paid Amount (₹)</th>
                      <th className="px-4 py-3 whitespace-nowrap">Date</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredFees.map((fee) => {
                      const isRowChecked = receiptSelection.isSelected(fee.id);
                      return (
                        <tr
                          key={fee.id}
                          className={`transition-colors hover:bg-slate-50/80 ${
                            isRowChecked ? 'bg-indigo-50/50' : ''
                          }`}
                        >
                          <td className="w-10 px-4 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={isRowChecked}
                              onChange={() => receiptSelection.toggleRow(fee.id)}
                              aria-label={`Select receipt ${fee.receiptNo}`}
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500/30"
                            />
                          </td>
                          <td className="px-4 py-2.5 font-mono font-semibold text-indigo-700 tabular-nums whitespace-nowrap">
                            {fee.receiptNo}
                          </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="font-semibold text-slate-900">{fee.studentName}</span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="font-mono text-slate-500">{fee.admissionId}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                        {fee.className}-{fee.section}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                        {fee.category} Fee
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                        {fee.feeMonth}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                        {fee.paymentMode}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                        {formatINR(fee.amount)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        {formatDateDisplay(fee.date)}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openPrintPreview({ type: 'fee-receipt', fee })}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 whitespace-nowrap"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            <span>Print Receipt</span>
                          </button>
                          {canDeleteRecords && (
                            <button
                              type="button"
                              onClick={() =>
                                requestConfirm({
                                  title: 'Delete Fee Receipt?',
                                  description: `Remove receipt ${fee.receiptNo} (${formatINR(
                                    fee.amount
                                  )}) for ${fee.studentName}? Automated dues will recalculate immediately.`,
                                  confirmLabel: 'Delete Receipt',
                                  destructive: true,
                                  onConfirm: () => deleteFee(fee.id),
                                })
                              }
                              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                              title="Delete Receipt"
                              aria-label={`Delete receipt ${fee.receiptNo}`}
                            >
                              <Trash2 className="h-4 w-4" />
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
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 2: AUTOMATED FEE DUE ENGINE                                   */}
      {/* ===================================================================== */}
      {feeSubTab === 'dues' && (
        <>
          <div className="grid grid-cols-2 gap-4 border-b border-slate-200 bg-slate-50/50 px-5 py-3.5 sm:grid-cols-4 text-xs">
            <div>
              <span className="text-slate-500">
                Active Expected Payable (Thru {db.billingCutoffMonth})
              </span>
              <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
                {formatINR(dueOverview.totalExpected)}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Total Fee Collected</span>
              <p className="mt-0.5 font-mono text-sm font-bold text-emerald-700 tabular-nums">
                {formatINR(modeTotals.total)}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Net Active Outstanding Dues</span>
              <p className="mt-0.5 font-mono text-sm font-bold text-rose-600 tabular-nums">
                {formatINR(dueOverview.totalOutstandingDues)}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Active Defaulters · Fee-Frozen</span>
              <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
                {dueOverview.defaultersCount} / {activeStudentsList.length}
                {frozenStudentsCount > 0 ? ` · ${frozenStudentsCount} Frozen` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Active vs Fee-Frozen Archive Segmented Toggle */}
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setDueRosterMode('active')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    dueRosterMode === 'active'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Active Roster ({activeStudentsList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDueRosterMode('frozen')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    dueRosterMode === 'frozen'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Fee-Frozen Archive ({frozenStudentsCount})
                </button>
              </div>

              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={dueSearch}
                  onChange={(e) => setDueSearch(e.target.value)}
                  placeholder="Search student, ID, phone..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <select
                value={dueClassFilter}
                onChange={(e) => setDueClassFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-indigo-600 focus:outline-none"
              >
                <option value="ALL">All Classes</option>
                {db.classes.map((c) => (
                  <option key={c.id} value={c.className}>
                    Class {c.className}
                  </option>
                ))}
              </select>

              {dueRosterMode === 'active' && (
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={onlyDefaulters}
                    onChange={(e) => setOnlyDefaulters(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span>Only Pending Defaulters</span>
                </label>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="billing-cutoff" className="font-semibold text-slate-700 whitespace-nowrap">
                Calculate Dues Up To Month:
              </label>
              <select
                id="billing-cutoff"
                disabled={!canManageFees}
                value={db.billingCutoffMonth}
                onChange={(e) => setBillingCutoffMonth(e.target.value as FeeMonth)}
                className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-1.5 font-semibold text-indigo-900 focus:border-indigo-600 focus:outline-none disabled:opacity-70"
              >
                {activeSessionMonths.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {db.students.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                No Enrolled Students to Calculate Dues
              </h3>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                Once students are admitted in Module 1, the Automated Due Engine continuously computes Admission, Monthly Tuition, and Bus Route dues from their admission month through {db.billingCutoffMonth}.
              </p>
              <button
                type="button"
                onClick={() => setActiveModule('admissions')}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap"
              >
                <span>Admit Students</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : filteredDueSummaries.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              {dueRosterMode === 'frozen'
                ? 'No students are currently marked Deactive (Fee-Frozen).'
                : 'No active student due records match your filter criteria.'}
            </div>
          ) : (
            <div>
              <ExcelExportBar
                totalCount={dueSelection.totalCount}
                selectedCount={dueSelection.selectedCount}
                isAllSelected={dueSelection.isAllSelected}
                exporting={exportingExcel}
                datasetLabel="student due records"
                onExportSelectedOrAll={() => void handleExportFeeDuesExcel(false)}
                onExportFullDataset={() => void handleExportFeeDuesExcel(true)}
                onToggleSelectAll={dueSelection.toggleSelectAll}
                onClearSelection={dueSelection.clearSelection}
              />
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                      <th className="w-10 px-4 py-3 text-center">
                        <TableSelectCheckbox
                          checked={dueSelection.isAllSelected}
                          indeterminate={dueSelection.isIndeterminate}
                          onChange={dueSelection.toggleSelectAll}
                          ariaLabel="Select all visible due rows for Excel export"
                        />
                      </th>
                      <th className="px-4 py-3 whitespace-nowrap">Student &amp; ID</th>
                      <th className="px-4 py-3 whitespace-nowrap">Class</th>
                      <th className="px-4 py-3 whitespace-nowrap">Monthly Rate</th>
                      <th className="px-4 py-3 text-center whitespace-nowrap">Billable Mos</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Expected (₹)</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Paid (₹)</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Net Due (₹)</th>
                      <th className="px-4 py-3">Pending Breakdown</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDueSummaries.map((summary) => {
                      const { student } = summary;
                      const isRowChecked = dueSelection.isSelected(student.id);
                      const monthlyCombined =
                        student.monthlyTuitionFee +
                        (student.transportEnabled ? student.transportFee : 0);

                      return (
                        <tr
                          key={student.id}
                          className={`transition-colors hover:bg-slate-50/80 ${
                            isRowChecked ? 'bg-indigo-50/50' : ''
                          }`}
                        >
                          <td className="w-10 px-4 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={isRowChecked}
                              onChange={() => dueSelection.toggleRow(student.id)}
                              aria-label={`Select ${student.name} (${student.admissionId})`}
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500/30"
                            />
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="font-semibold text-slate-900">{student.name}</div>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                            {student.admissionId} · {student.phone}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                          {student.className}-{student.section}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                          {summary.isFeeFrozen ? 'Paused' : `${formatINR(monthlyCombined)}/mo`}
                        </td>
                        <td className="px-4 py-2.5 text-center font-mono text-slate-700 tabular-nums whitespace-nowrap">
                          {summary.billableMonths.length}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-800 tabular-nums whitespace-nowrap">
                          {formatINR(summary.totalExpected)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                          {formatINR(summary.totalPaidAll)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                          {summary.isFeeFrozen ? (
                            <span className="inline-flex items-center justify-end gap-1 text-slate-500">
                              <PauseCircle className="h-3.5 w-3.5" />
                              <span>Frozen</span>
                            </span>
                          ) : summary.totalOutstandingDue > 0 ? (
                            <span className="text-rose-600">
                              {formatINR(summary.totalOutstandingDue)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-end gap-1 text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>₹0</span>
                            </span>
                          )}
                        </td>
                        <td
                          className="max-w-[260px] truncate px-4 py-2.5 text-slate-600"
                          title={renderPendingBreakdown(summary)}
                        >
                          {renderPendingBreakdown(summary)}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {!summary.isFeeFrozen ? (
                              <>
                                {canManageFees && (
                                  <button
                                    type="button"
                                    onClick={() => openCollectModalForStudent(student.id)}
                                    className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
                                  >
                                    <IndianRupee className="h-3 w-3" />
                                    <span>Collect</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    openPrintPreview({
                                      type: 'fee-demand-slip',
                                      summary,
                                      cutoffMonth: db.billingCutoffMonth,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 whitespace-nowrap"
                                  title="Print Official Fee Demand Slip"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                  <span>Demand Slip</span>
                                </button>
                              </>
                            ) : isCurrentUserAdmin ? (
                              <button
                                type="button"
                                onClick={() => openEditStudentModal(student.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 whitespace-nowrap"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                <span>Manage Status</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400">Archived</span>
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
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 3: CLASS & SESSION FEE MASTER SCHEDULE                        */}
      {/* ===================================================================== */}
      {feeSubTab === 'structure' && (
        <div className="p-5">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Class &amp; Session-Wise Fee Master Schedule
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Edit standard Admission, Monthly Tuition, and Annual Exam fee rates below. These automatically populate the Admission Form, Student Promotion, and Collect Fee modal.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="master-session" className="font-semibold text-slate-700 whitespace-nowrap">
                Academic Session:
              </label>
              <select
                id="master-session"
                value={selectedScheduleSession}
                onChange={(e) => setSelectedScheduleSession(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none"
              >
                {availableSessionNames.map((s) => (
                  <option key={s} value={s}>
                    {s}
                    {s === db.activeSession ? ' (Active)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Academic Session</th>
                  <th className="px-4 py-3 text-right">Admission Fee (₹)</th>
                  <th className="px-4 py-3 text-right">Monthly Tuition Fee (₹)</th>
                  <th className="px-4 py-3 text-right">Annual Exam Fee (₹)</th>
                  <th className="px-4 py-3 text-right">Est. 12-Month Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {db.classes.map((cls) => {
                  const rate = getClassSessionFee(cls.className, selectedScheduleSession);
                  const annualTotal =
                    rate.admissionFee + rate.monthlyTuitionFee * 12 + rate.annualExamFee;

                  return (
                    <FeeScheduleRow
                      key={`${cls.className}-${selectedScheduleSession}`}
                      className={cls.className}
                      academicSession={selectedScheduleSession}
                      admissionFee={rate.admissionFee}
                      monthlyTuitionFee={rate.monthlyTuitionFee}
                      annualExamFee={rate.annualExamFee}
                      annualTotal={annualTotal}
                      readOnly={!canManageFees}
                      onSave={updateClassSessionFee}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Collect Fee Modal */}
      <ModalShell
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Collect Student Fee"
        subtitle="Automatically pre-fills pending Admission, Tuition, Transport, or Exam fees."
        maxWidthClass="max-w-lg"
      >
        {db.students.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm font-medium text-slate-700">
              No students are admitted in the directory yet.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Please admit a student in Module 1 before collecting fees.
            </p>
            <button
              type="button"
              onClick={() => {
                setModalOpen(false);
                setActiveModule('admissions');
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              <span>Go to Admissions</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Select Student *</label>
              <select
                value={studentId}
                onChange={(e) => handleCategoryOrStudentChange(e.target.value, category)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              >
                {db.students.map((stu) => {
                  const summary = dueOverview.byStudentId[stu.id];
                  const due = summary?.totalOutstandingDue || 0;
                  const statusNote = summary?.isFeeFrozen
                    ? 'Fee Frozen (Deactive)'
                    : `Due: ${formatINR(due)}`;
                  return (
                    <option key={stu.id} value={stu.id}>
                      {stu.admissionId} — {stu.name} (Class {stu.className}-{stu.section} ·{' '}
                      {statusNote})
                    </option>
                  );
                })}
              </select>
            </div>

            {studentId && dueOverview.byStudentId[studentId] && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Current Automated Due (thru {db.billingCutoffMonth}):</span>
                  <strong
                    className={`font-mono tabular-nums ${
                      dueOverview.byStudentId[studentId].isFeeFrozen
                        ? 'text-slate-600'
                        : 'text-rose-600'
                    }`}
                  >
                    {dueOverview.byStudentId[studentId].isFeeFrozen
                      ? 'Fee Frozen (₹0)'
                      : formatINR(dueOverview.byStudentId[studentId].totalOutstandingDue)}
                  </strong>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {renderPendingBreakdown(dueOverview.byStudentId[studentId])}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Fee Category *</label>
                <select
                  value={category}
                  onChange={(e) =>
                    handleCategoryOrStudentChange(studentId, e.target.value as FeeCategory)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  {FEE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat} Fee
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Fee Month *</label>
                <select
                  value={feeMonth}
                  onChange={(e) => setFeeMonth(e.target.value as FeeMonth)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  {activeSessionMonths.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Amount (₹) *</label>
                <input
                  type="number"
                  min={1}
                  step="1"
                  required
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="e.g. 1500"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Payment Mode *</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Payment Date *</label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Reference / Note (Optional)
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="UTR / Cheque / Note"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </div>

            {formError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                {formError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Record Payment &amp; Print Receipt</span>
              </button>
            </div>
          </form>
        )}
      </ModalShell>
    </section>
  );
};

interface FeeScheduleRowProps {
  className: string;
  academicSession: string;
  admissionFee: number;
  monthlyTuitionFee: number;
  annualExamFee: number;
  annualTotal: number;
  readOnly?: boolean;
  onSave: (
    className: string,
    session: string,
    adm: number,
    tuition: number,
    exam: number
  ) => void;
}

const FeeScheduleRow: React.FC<FeeScheduleRowProps> = ({
  className,
  academicSession,
  admissionFee,
  monthlyTuitionFee,
  annualExamFee,
  annualTotal,
  readOnly = false,
  onSave,
}) => {
  const [adm, setAdm] = useState(String(admissionFee));
  const [tuition, setTuition] = useState(String(monthlyTuitionFee));
  const [exam, setExam] = useState(String(annualExamFee));

  useEffect(() => {
    setAdm(String(admissionFee));
    setTuition(String(monthlyTuitionFee));
    setExam(String(annualExamFee));
  }, [admissionFee, monthlyTuitionFee, annualExamFee]);

  const dirty =
    !readOnly &&
    (sanitizeNumber(adm, 0) !== admissionFee ||
      sanitizeNumber(tuition, 0) !== monthlyTuitionFee ||
      sanitizeNumber(exam, 0) !== annualExamFee);

  return (
    <tr className="hover:bg-slate-50/70">
      <td className="px-4 py-2.5 font-semibold text-slate-900">Class {className}</td>
      <td className="px-4 py-2.5 font-mono text-slate-600 tabular-nums">{academicSession}</td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          min={0}
          step="50"
          disabled={readOnly}
          value={adm}
          onChange={(e) => setAdm(e.target.value)}
          className="w-28 rounded-md border border-slate-200 px-2.5 py-1 text-right font-mono text-xs text-slate-900 focus:border-indigo-600 focus:outline-none disabled:bg-slate-50 tabular-nums"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          min={0}
          step="50"
          disabled={readOnly}
          value={tuition}
          onChange={(e) => setTuition(e.target.value)}
          className="w-28 rounded-md border border-slate-200 px-2.5 py-1 text-right font-mono text-xs text-slate-900 focus:border-indigo-600 focus:outline-none disabled:bg-slate-50 tabular-nums"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          min={0}
          step="50"
          disabled={readOnly}
          value={exam}
          onChange={(e) => setExam(e.target.value)}
          className="w-28 rounded-md border border-slate-200 px-2.5 py-1 text-right font-mono text-xs text-slate-900 focus:border-indigo-600 focus:outline-none disabled:bg-slate-50 tabular-nums"
        />
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {dirty ? (
          <button
            type="button"
            onClick={() =>
              onSave(
                className,
                academicSession,
                sanitizeNumber(adm, 0),
                sanitizeNumber(tuition, 0),
                sanitizeNumber(exam, 0)
              )
            }
            className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Save Rate
          </button>
        ) : (
          <span className="font-mono font-semibold text-slate-800 tabular-nums">
            {formatINR(annualTotal)}
          </span>
        )}
      </td>
    </tr>
  );
};
