import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UserPlus,
  Search,
  Printer,
  Pencil,
  Trash2,
  Users,
  Eye,
  Upload,
  X,
  FileText,
  Bus,
  IndianRupee,
  CheckCircle2,
  IdCard,
  PauseCircle,
  UserCheck,
  UserX,
  ArrowUpRight,
  Award,
  Receipt,
  FileSpreadsheet,
} from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { useRowSelection } from '../../hooks/useRowSelection';
import {
  AdmissionType,
  CasteCategory,
  Gender,
  PaymentMode,
  StudentRecord,
  StudentStatus,
} from '../../types/erp';
import { exportStudentsToExcel } from '../../utils/excelExporter';
import { resolveStudentRollNumber } from '../../utils/examEngine';
import {
  ACADEMIC_SESSIONS,
  formatAadhaarInput,
  formatDateDisplay,
  formatINR,
  getInitials,
  getTodayISO,
  sanitizeNumber,
} from '../../utils/formatters';
import {
  combineCustomFieldsAndNotes,
  extractCustomFieldsAndNotes,
  getPopulatedCustomStudentFields,
} from '../../utils/customFieldsHelper';
import { ExcelExportBar, TableSelectCheckbox } from '../ui/ExcelExportControl';
import { ModalShell } from '../ui/ModalShell';

const CASTE_CATEGORIES: CasteCategory[] = ['General', 'OBC', 'SC', 'ST', 'Other'];

export const AdmissionsModule: React.FC = () => {
  const {
    db,
    dueOverview,
    isCurrentUserAdmin,
    canAccessModule,
    canManageStudents,
    canManageFees,
    canDeleteRecords,
    getClassSessionFee,
    openFeeModuleForStudent,
    openIdCardForStudent,
    preselectedEditStudentId,
    clearPreselectedEditStudent,
    addStudent,
    updateStudent,
    setStudentStatus,
    deleteStudent,
    openPrintPreview,
    requestConfirm,
    setActiveModule,
    uploadCloudMedia,
    aiCustomization,
    getEffectiveStudentPhoto,
    notify,
  } = useSchool();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Active' | 'Deactive' | 'ALL'>('Active');
  const [classFilter, setClassFilter] = useState('ALL');
  const [sessionFilter, setSessionFilter] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null);
  const [viewingStudent, setViewingStudent] = useState<StudentRecord | null>(null);
  const [formError, setFormError] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingAadhaar, setUploadingAadhaar] = useState(false);

  // Status Change Modal (Deactivate with optional reason)
  const [deactivatingStudent, setDeactivatingStudent] = useState<StudentRecord | null>(null);
  const [deactivateReasonInput, setDeactivateReasonInput] = useState('');

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const aadhaarInputRef = useRef<HTMLInputElement | null>(null);

  const defaultClass = db.classes[0]?.className || 'Nursery';
  const defaultSection = db.classes[0]?.sections[0] || 'A';

  // Form State
  const [academicSession, setAcademicSession] = useState(db.activeSession || '2026-2027');
  const [admissionDate, setAdmissionDate] = useState(getTodayISO());
  const [studentStatusField, setStudentStatusField] = useState<StudentStatus>('Active');
  const [deactivatedReasonField, setDeactivatedReasonField] = useState('');
  const [admissionType, setAdmissionType] = useState<AdmissionType>('Paid');
  const [admissionFeeInput, setAdmissionFeeInput] = useState('');
  const [recordAdmissionFeeInLedger, setRecordAdmissionFeeInLedger] = useState(true);
  const [admissionFeePaymentMode, setAdmissionFeePaymentMode] = useState<PaymentMode>('Cash');
  const [previousSchool, setPreviousSchool] = useState('');
  const [lastGradePassed, setLastGradePassed] = useState('');
  const [tcDetails, setTcDetails] = useState('');
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<Gender>('Male');
  const [casteCategory, setCasteCategory] = useState<CasteCategory>('General');
  const [className, setClassName] = useState(defaultClass);
  const [section, setSection] = useState(defaultSection);
  const [rollNumber, setRollNumber] = useState('');
  const [monthlyTuitionFeeInput, setMonthlyTuitionFeeInput] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [address, setAddress] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [aadhaarDocDataUrl, setAadhaarDocDataUrl] = useState('');
  const [transportEnabled, setTransportEnabled] = useState(false);
  const [routeId, setRouteId] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  const availableSessionNames = useMemo(() => {
    const names = new Set<string>(db.sessions.map((s) => s.name));
    ACADEMIC_SESSIONS.forEach((s) => names.add(s));
    db.students.forEach((s) => {
      if (s.academicSession) names.add(s.academicSession);
    });
    return Array.from(names);
  }, [db.sessions, db.students]);

  const activeStudentsCount = useMemo(
    () => db.students.filter((s) => s.status !== 'Deactive').length,
    [db.students]
  );

  const archivedStudentsCount = useMemo(
    () => db.students.filter((s) => s.status === 'Deactive').length,
    [db.students]
  );

  const availableSections = useMemo(() => {
    const found = db.classes.find((c) => c.className === className);
    return found && found.sections.length > 0 ? found.sections : ['A', 'B', 'C'];
  }, [db.classes, className]);

  const routeMap = useMemo(() => {
    const map = new Map<string, (typeof db.routes)[number]>();
    db.routes.forEach((r) => map.set(r.id, r));
    return map;
  }, [db.routes]);

  const selectedRouteObj = useMemo(
    () => (transportEnabled && routeId ? routeMap.get(routeId) : undefined),
    [transportEnabled, routeId, routeMap]
  );

  const computedTransportFee = selectedRouteObj ? selectedRouteObj.monthlyFare : 0;

  const activeClassSchedule = useMemo(
    () => getClassSessionFee(className, academicSession),
    [getClassSessionFee, className, academicSession]
  );

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return db.students.filter((stu) => {
      const effectiveStatus: StudentStatus = stu.status === 'Deactive' ? 'Deactive' : 'Active';
      if (statusFilter !== 'ALL' && effectiveStatus !== statusFilter) return false;
      if (classFilter !== 'ALL' && stu.className !== classFilter) return false;
      if (sessionFilter !== 'ALL' && stu.academicSession !== sessionFilter) return false;
      if (!q) return true;
      return (
        stu.admissionId.toLowerCase().includes(q) ||
        stu.name.toLowerCase().includes(q) ||
        stu.fatherName.toLowerCase().includes(q) ||
        stu.phone.toLowerCase().includes(q) ||
        stu.aadhaarNumber.toLowerCase().includes(q)
      );
    });
  }, [db.students, statusFilter, classFilter, sessionFilter, searchQuery]);

  const getStudentRowId = useCallback((stu: StudentRecord) => stu.id, []);
  const studentSelection = useRowSelection(filteredStudents, getStudentRowId);
  const [exportingExcel, setExportingExcel] = useState(false);

  const handleExportStudentsExcel = async (forceAll = false) => {
    const isPartial = !forceAll && studentSelection.selectedCount > 0;
    const rowsToExport = isPartial ? studentSelection.selectedItems : filteredStudents;
    if (rowsToExport.length === 0) return;

    setExportingExcel(true);
    try {
      const res = await exportStudentsToExcel({
        students: rowsToExport,
        allStudentsForRoll: db.students,
        dueByStudentId: dueOverview.byStudentId,
        routes: db.routes,
        schoolProfile: db.schoolProfile,
        activeSession: db.activeSession,
        classFilter,
        sessionFilter,
        statusFilter,
        isPartialSelection: isPartial,
      });
      notify(
        'success',
        'Students Exported to Excel (.xlsx)',
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

  const openNewAdmissionModal = () => {
    const firstCls = db.classes[0]?.className || 'Nursery';
    const firstSec = db.classes[0]?.sections[0] || 'A';
    const initialSession = db.activeSession || '2026-2027';
    const rate = getClassSessionFee(firstCls, initialSession);

    setEditingStudent(null);
    setAcademicSession(initialSession);
    setAdmissionDate(getTodayISO());
    setStudentStatusField('Active');
    setDeactivatedReasonField('');
    setAdmissionType('Paid');
    setAdmissionFeeInput(String(rate.admissionFee));
    setRecordAdmissionFeeInLedger(true);
    setAdmissionFeePaymentMode('Cash');
    setPreviousSchool('');
    setLastGradePassed('');
    setTcDetails('');
    setName('');
    setDob('');
    setGender('Male');
    setCasteCategory('General');
    setClassName(firstCls);
    setSection(firstSec);
    setRollNumber('');
    setMonthlyTuitionFeeInput(String(rate.monthlyTuitionFee));
    setFatherName('');
    setMotherName('');
    setPhone('');
    setAlternatePhone('');
    setAddress('');
    setPhotoDataUrl('');
    setAadhaarNumber('');
    setAadhaarDocDataUrl('');
    setTransportEnabled(false);
    setRouteId(db.routes[0]?.id || '');
    setCustomNotes('');
    setCustomFieldValues({});
    setFormError('');
    setModalOpen(true);
  };

  const openEditAdmissionModal = (stu: StudentRecord) => {
    const parsedNotes = extractCustomFieldsAndNotes(stu.customNotes);
    setEditingStudent(stu);
    setAcademicSession(stu.academicSession || db.activeSession || '2026-2027');
    setAdmissionDate(stu.admissionDate || getTodayISO());
    setStudentStatusField(stu.status === 'Deactive' ? 'Deactive' : 'Active');
    setDeactivatedReasonField(stu.deactivatedReason || '');
    setAdmissionType(stu.admissionType || 'Paid');
    setAdmissionFeeInput(stu.admissionType === 'Free' ? '0' : String(stu.admissionFee || 0));
    setRecordAdmissionFeeInLedger(false);
    setPreviousSchool(stu.previousSchool || '');
    setLastGradePassed(stu.lastGradePassed || '');
    setTcDetails(stu.tcDetails || '');
    setName(stu.name);
    setDob(stu.dob);
    setGender(stu.gender);
    setCasteCategory(stu.casteCategory || 'General');
    setClassName(stu.className);
    setSection(stu.section);
    setRollNumber(stu.rollNumber || '');
    setMonthlyTuitionFeeInput(String(stu.monthlyTuitionFee || 0));
    setFatherName(stu.fatherName);
    setMotherName(stu.motherName);
    setPhone(stu.phone);
    setAlternatePhone(stu.alternatePhone || '');
    setAddress(stu.address);
    setPhotoDataUrl(getEffectiveStudentPhoto(stu));
    setAadhaarNumber(stu.aadhaarNumber || '');
    setAadhaarDocDataUrl(stu.aadhaarDocDataUrl || '');
    setTransportEnabled(Boolean(stu.transportEnabled));
    setRouteId(stu.routeId || db.routes[0]?.id || '');
    setCustomNotes(parsedNotes.plainNotes);
    setCustomFieldValues(parsedNotes.customValues);
    setFormError('');
    setModalOpen(true);
  };

  // Cross-module Edit Student trigger (e.g., from ID Cards or Fee Freeze Archive)
  useEffect(() => {
    if (preselectedEditStudentId) {
      const target = db.students.find((s) => s.id === preselectedEditStudentId);
      if (target) {
        if (target.status === 'Deactive' && statusFilter === 'Active') {
          setStatusFilter('ALL');
        }
        openEditAdmissionModal(target);
      }
      clearPreselectedEditStudent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedEditStudentId, db.students]);

  const handleSessionChange = (nextSession: string) => {
    setAcademicSession(nextSession);
    if (!editingStudent) {
      const rate = getClassSessionFee(className, nextSession);
      if (admissionType === 'Paid') {
        setAdmissionFeeInput(String(rate.admissionFee));
      }
      setMonthlyTuitionFeeInput(String(rate.monthlyTuitionFee));
    }
  };

  const handleClassChange = (nextCls: string) => {
    setClassName(nextCls);
    const clsObj = db.classes.find((c) => c.className === nextCls);
    const secs = clsObj && clsObj.sections.length > 0 ? clsObj.sections : ['A', 'B', 'C'];
    if (!secs.includes(section)) {
      setSection(secs[0]);
    }
    if (!editingStudent) {
      const rate = getClassSessionFee(nextCls, academicSession);
      if (admissionType === 'Paid') {
        setAdmissionFeeInput(String(rate.admissionFee));
      }
      setMonthlyTuitionFeeInput(String(rate.monthlyTuitionFee));
    }
  };

  const applyScheduleDefaults = () => {
    const rate = getClassSessionFee(className, academicSession);
    if (admissionType === 'Paid') {
      setAdmissionFeeInput(String(rate.admissionFee));
    }
    setMonthlyTuitionFeeInput(String(rate.monthlyTuitionFee));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setFormError('');
    try {
      const refCode = editingStudent?.admissionId || `RB${db.counters.studentSeq}`;
      const uploaded = await uploadCloudMedia(file, 'student-photo', refCode);
      setPhotoDataUrl(uploaded.displayUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to upload student photo.');
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleAadhaarDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAadhaar(true);
    setFormError('');
    try {
      const refCode = editingStudent?.admissionId || `RB${db.counters.studentSeq}`;
      const uploaded = await uploadCloudMedia(file, 'student-aadhaar', refCode);
      setAadhaarDocDataUrl(uploaded.displayUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to upload Aadhaar document.');
    } finally {
      setUploadingAadhaar(false);
      if (aadhaarInputRef.current) aadhaarInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Student full name is required.');
      return;
    }
    if (!dob) {
      setFormError('Date of birth is required.');
      return;
    }
    const cleanAdmFee = admissionType === 'Free' ? 0 : sanitizeNumber(admissionFeeInput, 0);
    if (admissionType === 'Paid' && cleanAdmFee <= 0) {
      setFormError(
        'Please enter an Admission Fee greater than ₹0 for Paid admissions, or switch to Free.'
      );
      return;
    }
    const cleanTuition = sanitizeNumber(monthlyTuitionFeeInput, 0);
    if (monthlyTuitionFeeInput.trim() === '' || cleanTuition < 0) {
      setFormError('Please specify the Monthly Tuition Fee (₹) assigned to this student.');
      return;
    }
    if (!fatherName.trim() || !motherName.trim()) {
      setFormError("Both Father's Name and Mother's Name are required.");
      return;
    }
    const cleanPhone = phone.replace(/[^0-9+\-\s]/g, '').trim();
    if (cleanPhone.replace(/\D/g, '').length < 10) {
      setFormError('Please enter a valid 10-digit primary phone number.');
      return;
    }
    if (!address.trim()) {
      setFormError('Residential address is required.');
      return;
    }
    if (aadhaarNumber.trim()) {
      const digitsOnly = aadhaarNumber.replace(/\D/g, '');
      if (digitsOnly.length !== 12) {
        setFormError('Aadhaar Number must be 12 digits (or leave blank if unavailable).');
        return;
      }
    }
    if (transportEnabled && !routeId) {
      setFormError(
        'Transport is toggled ON — please select an active Transport Route (or add one in Module 3).'
      );
      return;
    }

    const payload = {
      rollNumber: rollNumber.trim(),
      status: editingStudent ? studentStatusField : ('Active' as StudentStatus),
      deactivatedReason:
        editingStudent && studentStatusField === 'Deactive'
          ? deactivatedReasonField.trim()
          : '',
      academicSession,
      admissionType,
      admissionFee: cleanAdmFee,
      previousSchool,
      lastGradePassed,
      tcDetails,
      name,
      dob,
      gender,
      casteCategory,
      className,
      section,
      monthlyTuitionFee: cleanTuition,
      fatherName,
      motherName,
      phone: cleanPhone,
      alternatePhone: alternatePhone.replace(/[^0-9+\-\s]/g, '').trim(),
      address,
      photoDataUrl,
      aadhaarNumber: formatAadhaarInput(aadhaarNumber),
      aadhaarDocDataUrl,
      transportEnabled,
      routeId: transportEnabled ? routeId : '',
      transportFee: transportEnabled ? computedTransportFee : 0,
      customNotes: combineCustomFieldsAndNotes(customNotes, customFieldValues),
      admissionDate: admissionDate || getTodayISO(),
      recordAdmissionFeeInLedger: !editingStudent && recordAdmissionFeeInLedger,
      admissionFeePaymentMode,
    };

    if (editingStudent) {
      updateStudent(editingStudent.id, payload);
      setModalOpen(false);
    } else {
      const created = addStudent(payload);
      setModalOpen(false);
      openPrintPreview({
        type: 'admission-slip',
        student: created,
        route:
          created.transportEnabled && created.routeId ? routeMap.get(created.routeId) : undefined,
      });
    }
  };

  const handleToggleStudentStatusPrompt = (stu: StudentRecord) => {
    if (stu.status === 'Deactive') {
      requestConfirm({
        title: `Reactivate ${stu.name} (${stu.admissionId})?`,
        description: `${stu.name} will return to Active status in Class ${stu.className}-${stu.section}. Monthly fee billing, attendance sheets, and exam rosters will resume immediately.`,
        confirmLabel: 'Reactivate Student',
        destructive: false,
        onConfirm: () => setStudentStatus(stu.id, 'Active'),
      });
    } else {
      setDeactivateReasonInput(stu.deactivatedReason || '');
      setDeactivatingStudent(stu);
    }
  };

  const handleConfirmDeactivate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deactivatingStudent) return;
    setStudentStatus(
      deactivatingStudent.id,
      'Deactive',
      deactivateReasonInput.trim() || 'Left School / TC Issued'
    );
    setDeactivatingStudent(null);
    setDeactivateReasonInput('');
  };

  const liveViewingStudent = useMemo(
    () => (viewingStudent ? db.students.find((s) => s.id === viewingStudent.id) || null : null),
    [viewingStudent, db.students]
  );

  const liveViewingDue = useMemo(
    () => (liveViewingStudent ? dueOverview.byStudentId[liveViewingStudent.id] : undefined),
    [liveViewingStudent, dueOverview.byStudentId]
  );

  const liveViewingReceipts = useMemo(
    () =>
      liveViewingStudent
        ? db.fees.filter((f) => f.studentId === liveViewingStudent.id)
        : [],
    [liveViewingStudent, db.fees]
  );

  const liveViewingMarksheets = useMemo(
    () =>
      liveViewingStudent
        ? db.marksheets.filter((m) => m.studentId === liveViewingStudent.id)
        : [],
    [liveViewingStudent, db.marksheets]
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      {/* Module Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            01. Student Directory, Archive &amp; Advanced Admission
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Full profile edit access, Active / Deactive Fee Freeze controls, promotion history archive, and auto-populated session fee schedules
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {filteredStudents.length > 0 && (
            <button
              type="button"
              disabled={exportingExcel}
              onClick={() => void handleExportStudentsExcel(false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap"
              title="Export selected or filtered students to formatted Microsoft Excel (.xlsx)"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
              <span>
                {studentSelection.selectedCount > 0
                  ? `Export Selected (${studentSelection.selectedCount}) (.xlsx)`
                  : 'Export to Excel (.xlsx)'}
              </span>
            </button>
          )}

          {canAccessModule('sessions') && (
            <button
              type="button"
              onClick={() => setActiveModule('sessions')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 whitespace-nowrap"
            >
              <ArrowUpRight className="h-4 w-4" />
              <span>Promote Students</span>
            </button>
          )}

          {canManageStudents && (
            <button
              type="button"
              onClick={openNewAdmissionModal}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap shrink-0"
            >
              <UserPlus className="h-4 w-4" />
              <span>New Student Admission</span>
            </button>
          )}
        </div>
      </div>

      {/* Search, Active/Archive Segmented Switch, & Class/Session Filters */}
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Active vs Deactive Archive Filter */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
            <button
              type="button"
              onClick={() => setStatusFilter('Active')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                statusFilter === 'Active'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active ({activeStudentsCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('Deactive')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                statusFilter === 'Deactive'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Deactive / Archive ({archivedStudentsCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({db.students.length})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, name, father, phone, Aadhaar..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-indigo-600 focus:outline-none"
          >
            <option value="ALL">All Sessions</option>
            {availableSessionNames.map((ses) => (
              <option key={ses} value={ses}>
                Session {ses}
              </option>
            ))}
          </select>

          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-indigo-600 focus:outline-none"
          >
            <option value="ALL">All Classes</option>
            {db.classes.map((c) => (
              <option key={c.id} value={c.className}>
                Class {c.className}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Admissions Table */}
      {db.students.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <Users className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900">No Student Admissions Yet</h3>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            Open the Advanced Admission Form to enroll your first student in active session{' '}
            <strong className="font-mono text-slate-700">{db.activeSession}</strong>. Class &amp; Session Admission and Monthly Tuition fees populate automatically.
          </p>
          {canManageStudents && (
            <button
              type="button"
              onClick={openNewAdmissionModal}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
            >
              <UserPlus className="h-4 w-4" />
              <span>Admit First Student</span>
            </button>
          )}
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-slate-500">
          {statusFilter === 'Deactive'
            ? 'No students are currently in the Deactive / Archive register.'
            : 'No students match your current search, status, session, or class filter.'}
        </div>
      ) : (
        <div>
          <ExcelExportBar
            totalCount={studentSelection.totalCount}
            selectedCount={studentSelection.selectedCount}
            isAllSelected={studentSelection.isAllSelected}
            exporting={exportingExcel}
            datasetLabel="student records"
            onExportSelectedOrAll={() => void handleExportStudentsExcel(false)}
            onExportFullDataset={() => void handleExportStudentsExcel(true)}
            onToggleSelectAll={studentSelection.toggleSelectAll}
            onClearSelection={studentSelection.clearSelection}
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <th className="w-10 px-4 py-3 text-center">
                    <TableSelectCheckbox
                      checked={studentSelection.isAllSelected}
                      indeterminate={studentSelection.isIndeterminate}
                      onChange={studentSelection.toggleSelectAll}
                      ariaLabel="Select all visible students for Excel export"
                    />
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap">Admission ID</th>
                  <th className="px-4 py-3 whitespace-nowrap">Photo</th>
                  <th className="px-4 py-3 whitespace-nowrap">Student Name</th>
                  <th className="px-4 py-3 whitespace-nowrap">Class, Sec &amp; Roll</th>
                  <th className="px-4 py-3 whitespace-nowrap">Session</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap">Father Name / Contact</th>
                  <th className="px-4 py-3 whitespace-nowrap">Transport</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Live Balance Due</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((stu) => {
                  const isDeactive = stu.status === 'Deactive';
                  const isRowChecked = studentSelection.isSelected(stu.id);
                  const assignedRoute =
                    stu.transportEnabled && stu.routeId ? routeMap.get(stu.routeId) : undefined;
                  const stuDue = dueOverview.byStudentId[stu.id];
                  const netDue = stuDue ? stuDue.totalOutstandingDue : 0;
                  const resolvedRoll = resolveStudentRollNumber(stu, db.students);

                  return (
                    <tr
                      key={stu.id}
                      className={`transition-colors hover:bg-slate-50/80 ${
                        isRowChecked
                          ? 'bg-indigo-50/50'
                          : isDeactive
                          ? 'bg-slate-50/50 text-slate-500'
                          : ''
                      }`}
                    >
                      <td className="w-10 px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isRowChecked}
                          onChange={() => studentSelection.toggleRow(stu.id)}
                          aria-label={`Select ${stu.name} (${stu.admissionId})`}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500/30"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-indigo-700 tabular-nums whitespace-nowrap">
                        {stu.admissionId}
                      </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {getEffectiveStudentPhoto(stu) ? (
                        <img
                          src={getEffectiveStudentPhoto(stu)}
                          alt={stu.name}
                          referrerPolicy="no-referrer"
                          className={`h-9 w-9 rounded-lg border border-slate-200 object-cover ${
                            isDeactive ? 'opacity-70 grayscale' : ''
                          }`}
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 font-mono text-xs font-bold text-slate-600">
                          {getInitials(stu.name)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setViewingStudent(stu)}
                        className="font-semibold text-slate-900 hover:text-indigo-600 text-left"
                      >
                        {stu.name}
                      </button>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        <span>{stu.gender}</span>
                        <span className="mx-1">·</span>
                        <span>{stu.casteCategory}</span>
                        <span className="mx-1">·</span>
                        <span className="font-mono tabular-nums">{formatDateDisplay(stu.dob)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="font-semibold text-slate-800">
                        Class {stu.className} · Sec {stu.section}{' '}
                        <span className="font-mono text-[11px] text-indigo-700">
                          ({resolvedRoll})
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                        Tuition: {formatINR(stu.monthlyTuitionFee)}/mo
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {stu.academicSession}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {canManageStudents && (!isDeactive || isCurrentUserAdmin) ? (
                        <button
                          type="button"
                          onClick={() => handleToggleStudentStatusPrompt(stu)}
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                            isDeactive
                              ? 'border-slate-300 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
                              : 'border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800'
                          }`}
                          title={
                            isDeactive
                              ? 'Click to Reactivate student and resume monthly fees'
                              : 'Click to mark Deactive (left school) and freeze monthly fees'
                          }
                        >
                          {isDeactive ? (
                            <>
                              <UserX className="h-3.5 w-3.5 text-slate-500" />
                              <span>Deactive</span>
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-3.5 w-3.5 text-emerald-700" />
                              <span>Active</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            isDeactive ? 'text-slate-500' : 'text-emerald-700'
                          }`}
                        >
                          {isDeactive ? 'Deactive' : 'Active'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="font-medium text-slate-800">{stu.fatherName}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                        {stu.phone}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {stu.transportEnabled && assignedRoute ? (
                        <div>
                          <span className="font-semibold text-indigo-700">ON</span>
                          <span className="mx-1 text-slate-300">·</span>
                          <span className="text-slate-800">{assignedRoute.routeName}</span>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                            {assignedRoute.busNumber} · {formatINR(stu.transportFee)}/mo
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">OFF (Self)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {isDeactive ? (
                        <div className="inline-flex flex-col items-end text-right">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
                            <PauseCircle className="h-3.5 w-3.5" />
                            <span>Fee Frozen</span>
                          </span>
                          <span className="text-[10px] text-slate-400">Billing paused</span>
                        </div>
                      ) : netDue > 0 ? (
                        canManageFees ? (
                          <button
                            type="button"
                            onClick={() => openFeeModuleForStudent(stu.id, 'dues')}
                            className="inline-flex flex-col items-end text-right hover:underline"
                            title="Click to collect pending due"
                          >
                            <span className="font-mono font-bold text-rose-600 tabular-nums">
                              {formatINR(netDue)}
                            </span>
                            <span className="text-[11px] font-medium text-indigo-600">
                              Collect Due →
                            </span>
                          </button>
                        ) : (
                          <span className="font-mono font-bold text-rose-600 tabular-nums">
                            {formatINR(netDue)}
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center justify-end gap-1 font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Cleared</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setViewingStudent(stu)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700"
                          title="View Full Student Profile & Archive Records"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Profile</span>
                        </button>
                        {canManageStudents && (!isDeactive || isCurrentUserAdmin) && (
                          <button
                            type="button"
                            onClick={() => openEditAdmissionModal(stu)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700"
                            title="Edit Student Details"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>Edit</span>
                          </button>
                        )}
                        {canAccessModule('id-cards') && (
                          <button
                            type="button"
                            onClick={() => openIdCardForStudent(stu.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700"
                            title="Generate & Download Student ID Card"
                          >
                            <IdCard className="h-3.5 w-3.5" />
                            <span>ID Card</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            openPrintPreview({
                              type: 'admission-slip',
                              student: stu,
                              route: assignedRoute,
                            })
                          }
                          className="rounded p-1.5 text-slate-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                          title="Print Admission Slip"
                          aria-label={`Print admission slip for ${stu.name}`}
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        {canDeleteRecords && (
                          <button
                            type="button"
                            onClick={() =>
                              requestConfirm({
                                title: 'Delete Student Admission Permanently?',
                                description: `Permanently delete ${stu.name} (${stu.admissionId})? Tip: If the student left the school, mark them "Deactive" instead to freeze monthly fees while keeping archive records.`,
                                confirmLabel: 'Delete Permanently',
                                destructive: true,
                                onConfirm: () => {
                                  if (viewingStudent?.id === stu.id) setViewingStudent(null);
                                  deleteStudent(stu.id);
                                },
                              })
                            }
                            className="rounded p-1.5 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                            title="Delete Student Record Permanently"
                            aria-label={`Delete ${stu.name}`}
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

      {/* ===================================================================== */}
      {/* MODAL: DEACTIVATE STUDENT (FEE FREEZE CONFIRMATION)                   */}
      {/* ===================================================================== */}
      <ModalShell
        open={Boolean(deactivatingStudent)}
        onClose={() => setDeactivatingStudent(null)}
        title={
          deactivatingStudent
            ? `Mark Student Deactive (Fee Freeze) — ${deactivatingStudent.name}`
            : 'Mark Student Deactive'
        }
        subtitle="Deactivating a student pauses ongoing monthly fee billing and removes them from active attendance and exam rosters while preserving all historical archive records."
        maxWidthClass="max-w-md"
      >
        {deactivatingStudent && (
          <form onSubmit={handleConfirmDeactivate} className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 space-y-1">
              <p className="font-bold">
                Student: {deactivatingStudent.name} ({deactivatingStudent.admissionId}) · Class{' '}
                {deactivatingStudent.className}-{deactivatingStudent.section}
              </p>
              <p className="text-amber-800 leading-relaxed">
                Monthly Tuition &amp; Transport fee generation will stop immediately (Fee Freeze), and this student will move to the{' '}
                <strong>Deactive / Archive</strong> tab. Past fee receipts and marksheets remain intact.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Leaving / Deactivation Reason (Optional)
              </label>
              <input
                type="text"
                value={deactivateReasonInput}
                onChange={(e) => setDeactivateReasonInput(e.target.value)}
                placeholder="e.g., TC Issued — Relocated to another city"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setDeactivatingStudent(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 whitespace-nowrap"
              >
                Confirm Deactive &amp; Freeze Fees
              </button>
            </div>
          </form>
        )}
      </ModalShell>

      {/* ===================================================================== */}
      {/* COMPREHENSIVE ADVANCED ADMISSION & FULL STUDENT EDIT MODAL            */}
      {/* ===================================================================== */}
      <ModalShell
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editingStudent
            ? `Edit Student Profile — ${editingStudent.name} (${editingStudent.admissionId})`
            : 'Comprehensive Student Admission Form'
        }
        subtitle={
          editingStudent
            ? 'Modify any personal, academic, parent/contact, fee, status, or transport detail at any time.'
            : 'Class & Session fee rates auto-populate dynamically and feed into the Automated Due Engine.'
        }
        maxWidthClass="max-w-4xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* Enrollment Status & Fee Freeze Control (Visible when editing an existing student) */}
          {editingStudent && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900">
                    Enrollment Status &amp; Monthly Fee Freeze
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Switch to Deactive if the student has left the school — pauses monthly fee dues and hides from active attendance/exams
                  </p>
                </div>

                <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setStudentStatusField('Active')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      studentStatusField === 'Active'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>Active</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentStatusField('Deactive')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      studentStatusField === 'Deactive'
                        ? 'bg-amber-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <PauseCircle className="h-3.5 w-3.5" />
                    <span>Deactive (Fee Freeze)</span>
                  </button>
                </div>
              </div>

              {studentStatusField === 'Deactive' && (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <label className="block text-xs font-semibold text-slate-700">
                    Reason for Deactivation / Leaving Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={deactivatedReasonField}
                    onChange={(e) => setDeactivatedReasonField(e.target.value)}
                    placeholder="e.g., TC Issued on parent request / Shifted residence"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Section 01: Academic Session, Class, & Auto-Populated Admission / Tuition Fees */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <h3 className="text-xs font-bold tracking-wide text-slate-900">
                01. Session, Class Allocation &amp; Auto-Populated Fee Schedule
              </h3>
              <button
                type="button"
                onClick={applyScheduleDefaults}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Apply Class {className} ({academicSession}) Default Rates (Adm:{' '}
                {formatINR(activeClassSchedule.admissionFee)} · Tuition:{' '}
                {formatINR(activeClassSchedule.monthlyTuitionFee)}/mo)
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Academic Session *
                </label>
                <select
                  value={academicSession}
                  onChange={(e) => handleSessionChange(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  {availableSessionNames.map((ses) => (
                    <option key={ses} value={ses}>
                      {ses}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Admission Date *
                </label>
                <input
                  type="date"
                  required
                  value={admissionDate}
                  onChange={(e) => setAdmissionDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Class *</label>
                <select
                  value={className}
                  onChange={(e) => handleClassChange(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  {db.classes.map((cls) => (
                    <option key={cls.id} value={cls.className}>
                      Class {cls.className}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Section *</label>
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  {availableSections.map((sec) => (
                    <option key={sec} value={sec}>
                      Section {sec}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Roll No (Optional)
                </label>
                <input
                  type="text"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  placeholder="Auto e.g. A-01"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Admission Type *
                </label>
                <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg border border-slate-300 bg-slate-50 p-1">
                  {(['Paid', 'Free'] as AdmissionType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setAdmissionType(type);
                        if (type === 'Free') {
                          setAdmissionFeeInput('0');
                        } else {
                          setAdmissionFeeInput(String(activeClassSchedule.admissionFee));
                        }
                      }}
                      className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                        admissionType === type
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {type === 'Paid' ? 'Paid Admission' : 'Free / RTE'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Admission Fee (₹) {admissionType === 'Paid' ? '*' : ''}
                </label>
                <input
                  type="number"
                  min={0}
                  step="50"
                  disabled={admissionType === 'Free'}
                  value={admissionType === 'Free' ? '0' : admissionFeeInput}
                  onChange={(e) => setAdmissionFeeInput(e.target.value)}
                  placeholder="Auto-populated"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Monthly Tuition Fee (₹) *
                </label>
                <input
                  type="number"
                  min={0}
                  step="50"
                  required
                  value={monthlyTuitionFeeInput}
                  onChange={(e) => setMonthlyTuitionFeeInput(e.target.value)}
                  placeholder="Auto-populated"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none tabular-nums"
                />
              </div>
            </div>

            {!editingStudent && admissionType === 'Paid' && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs">
                <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={recordAdmissionFeeInLedger}
                    onChange={(e) => setRecordAdmissionFeeInLedger(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span>
                    Collect Admission Fee right now &amp; issue Receipt (uncheck to keep as Pending Due)
                  </span>
                </label>
                {recordAdmissionFeeInLedger && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Mode:</span>
                    <select
                      value={admissionFeePaymentMode}
                      onChange={(e) => setAdmissionFeePaymentMode(e.target.value as PaymentMode)}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 focus:border-indigo-600 focus:outline-none"
                    >
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Bank">Bank</option>
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 02: Student Basic Details */}
          <div className="space-y-4">
            <h3 className="border-b border-slate-200 pb-2 text-xs font-bold tracking-wide text-slate-900">
              02. Student Basic Details
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Student Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Aarav Kumar Sharma"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Date of Birth *
                </label>
                <input
                  type="date"
                  required
                  max={getTodayISO()}
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Gender *</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as Gender)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Caste / Category *
                </label>
                <select
                  value={casteCategory}
                  onChange={(e) => setCasteCategory(e.target.value as CasteCategory)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  {CASTE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 03: Pre-School Information */}
          <div className="space-y-4">
            <h3 className="border-b border-slate-200 pb-2 text-xs font-bold tracking-wide text-slate-900">
              03. Pre-School &amp; Transfer Certificate (TC) Information
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Previous School Name
                </label>
                <input
                  type="text"
                  value={previousSchool}
                  onChange={(e) => setPreviousSchool(e.target.value)}
                  placeholder="e.g. First Admission / St. Mary's Prep"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Last Grade Passed
                </label>
                <input
                  type="text"
                  value={lastGradePassed}
                  onChange={(e) => setLastGradePassed(e.target.value)}
                  placeholder="e.g. UKG / Class 2nd / Fresher"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Transfer Certificate (TC) Details
                </label>
                <input
                  type="text"
                  value={tcDetails}
                  onChange={(e) => setTcDetails(e.target.value)}
                  placeholder="e.g. TC #4092 Submitted / Pending"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 04: Parent/Guardian Details */}
          <div className="space-y-4">
            <h3 className="border-b border-slate-200 pb-2 text-xs font-bold tracking-wide text-slate-900">
              04. Parent / Guardian &amp; Contact Information
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Father&apos;s Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={fatherName}
                  onChange={(e) => setFatherName(e.target.value)}
                  placeholder="Father's full name"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Mother&apos;s Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={motherName}
                  onChange={(e) => setMotherName(e.target.value)}
                  placeholder="Mother's full name"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Primary Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit primary mobile"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Alternate Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  value={alternatePhone}
                  onChange={(e) => setAlternatePhone(e.target.value)}
                  placeholder="Emergency / WhatsApp contact"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Residential Address *
                </label>
                <textarea
                  rows={2}
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House No, Colony / Village, Post Office, District, PIN Code"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 05: Identity & Cloud Photo Uploads */}
          <div className="space-y-4">
            <h3 className="border-b border-slate-200 pb-2 text-xs font-bold tracking-wide text-slate-900">
              05. Identity Verification &amp; Cloud Document Uploads (Optional)
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4">
                <label className="block text-xs font-semibold text-slate-700">
                  Student Passport Photo
                </label>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Uploaded securely to Cloud Storage and linked to the student record
                </p>
                <div className="mt-3 flex items-center gap-4">
                  {photoDataUrl ? (
                    <img
                      src={photoDataUrl}
                      alt="Student passport preview"
                      referrerPolicy="no-referrer"
                      className="h-16 w-16 rounded-lg border border-slate-300 object-cover shrink-0"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs font-medium text-slate-400 shrink-0">
                      Photo
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={uploadingPhoto}
                      onClick={() => photoInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>
                        {uploadingPhoto
                          ? 'Uploading...'
                          : photoDataUrl
                          ? 'Change Photo'
                          : 'Upload Photo'}
                      </span>
                    </button>
                    {photoDataUrl && !uploadingPhoto && (
                      <button
                        type="button"
                        onClick={() => setPhotoDataUrl('')}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Student Aadhaar Number (Optional)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={14}
                    value={aadhaarNumber}
                    onChange={(e) => setAadhaarNumber(formatAadhaarInput(e.target.value))}
                    placeholder="XXXX XXXX XXXX"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tracking-wider text-slate-900 focus:border-indigo-600 focus:outline-none tabular-nums"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700">Aadhaar Card Copy</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {uploadingAadhaar
                        ? 'Uploading to Cloud Storage...'
                        : aadhaarDocDataUrl
                        ? 'Saved in Cloud Storage'
                        : 'Optional image or PDF'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      ref={aadhaarInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleAadhaarDocUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={uploadingAadhaar}
                      onClick={() => aadhaarInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>
                        {uploadingAadhaar
                          ? 'Uploading...'
                          : aadhaarDocDataUrl
                          ? 'Replace'
                          : 'Upload'}
                      </span>
                    </button>
                    {aadhaarDocDataUrl && !uploadingAadhaar && (
                      <button
                        type="button"
                        onClick={() => setAadhaarDocDataUrl('')}
                        className="rounded p-1.5 text-rose-600 hover:bg-rose-50"
                        title="Remove Aadhaar document"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 06: Transport Setup */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-xs font-bold tracking-wide text-slate-900">
                06. School Bus &amp; Transport Setup
              </h3>
              <button
                type="button"
                role="switch"
                aria-checked={transportEnabled}
                onClick={() => {
                  const next = !transportEnabled;
                  setTransportEnabled(next);
                  if (next && !routeId && db.routes[0]) {
                    setRouteId(db.routes[0].id);
                  }
                }}
                className="inline-flex items-center gap-2.5 text-xs font-semibold text-slate-800"
              >
                <span>Transport Facility: {transportEnabled ? 'ON' : 'OFF'}</span>
                <span
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    transportEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      transportEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </span>
              </button>
            </div>

            {transportEnabled && (
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
                {db.routes.length === 0 ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs">
                    <p className="text-slate-700">
                      No active bus routes exist in the Route Chart yet. Add a bus route first or turn Transport OFF.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setModalOpen(false);
                        setActiveModule('transport');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 whitespace-nowrap shrink-0"
                    >
                      <Bus className="h-3.5 w-3.5" />
                      <span>Open Route Manager</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Select Route from Transport Route Chart *
                      </label>
                      <select
                        value={routeId}
                        onChange={(e) => setRouteId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                      >
                        {db.routes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.routeName} ({r.busNumber}) — {r.pickupPoints || 'Direct'} —{' '}
                            {formatINR(r.monthlyFare)}/mo
                          </option>
                        ))}
                      </select>
                      {selectedRouteObj && (
                        <p className="mt-1.5 text-xs text-slate-600">
                          Driver: <strong>{selectedRouteObj.driverName}</strong> (
                          {selectedRouteObj.driverPhone})
                          {selectedRouteObj.pickupPoints
                            ? ` · Stops: ${selectedRouteObj.pickupPoints}`
                            : ''}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Auto Transport Fee (₹/mo)
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={formatINR(computedTransportFee)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm font-bold text-emerald-700 tabular-nums"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 07: Other / Custom Details & AI Custom Fields */}
          <div className="space-y-3">
            <h3 className="border-b border-slate-200 pb-2 text-xs font-bold tracking-wide text-slate-900">
              07. Custom School Fields, Medical History &amp; Administrative Notes
            </h3>

            {aiCustomization.customStudentFields.length > 0 && (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3.5">
                {aiCustomization.customStudentFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs font-semibold text-slate-700">
                      {field.label}
                    </label>
                    <input
                      type="text"
                      value={customFieldValues[field.key] || ''}
                      onChange={(e) =>
                        setCustomFieldValues((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      placeholder={field.placeholder || `Enter ${field.label}`}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            )}

            <textarea
              rows={2}
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="Optional notes: sibling fee concession details, allergies/medical conditions, document remarks..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
            />
          </div>

          {formError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploadingPhoto || uploadingAadhaar}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap"
            >
              {editingStudent ? 'Save Profile Changes' : 'Confirm Admission & Generate Slip'}
            </button>
          </div>
        </form>
      </ModalShell>

      {/* ===================================================================== */}
      {/* FULL STUDENT PROFILE, STATUS CONTROL & ARCHIVE DOSSIER MODAL          */}
      {/* ===================================================================== */}
      <ModalShell
        open={Boolean(liveViewingStudent)}
        onClose={() => setViewingStudent(null)}
        title={
          liveViewingStudent
            ? `Student Profile — ${liveViewingStudent.name} (${liveViewingStudent.admissionId})`
            : 'Student Profile'
        }
        subtitle="Complete admission dossier, Active/Deactive Fee Freeze status, promotion history, and preserved academic/fee records"
        maxWidthClass="max-w-3xl"
      >
        {liveViewingStudent && (
          <div className="space-y-6 text-xs">
            {/* Fee Freeze Banner if Deactive */}
            {liveViewingStudent.status === 'Deactive' && (
              <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-amber-950">
                    Deactive / Archive Status — Monthly Fee Billing Frozen
                  </p>
                  <p className="mt-0.5 text-amber-800">
                    {liveViewingStudent.deactivatedAt
                      ? `Marked Deactive on ${formatDateDisplay(liveViewingStudent.deactivatedAt)}`
                      : 'Marked Deactive'}
                    {liveViewingStudent.deactivatedReason
                      ? ` · Reason: ${liveViewingStudent.deactivatedReason}`
                      : ''}
                  </p>
                </div>
                {isCurrentUserAdmin && (
                  <button
                    type="button"
                    onClick={() => setStudentStatus(liveViewingStudent.id, 'Active')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>Reactivate Student</span>
                  </button>
                )}
              </div>
            )}

            {/* Top Identity Banner */}
            <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                {getEffectiveStudentPhoto(liveViewingStudent) ? (
                  <img
                    src={getEffectiveStudentPhoto(liveViewingStudent)}
                    alt={liveViewingStudent.name}
                    referrerPolicy="no-referrer"
                    className="h-20 w-20 rounded-xl border border-slate-300 object-cover shrink-0"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-slate-300 bg-white font-mono text-xl font-bold text-slate-700 shrink-0">
                    {getInitials(liveViewingStudent.name)}
                  </div>
                )}

                <div>
                  <div className="flex flex-wrap items-center gap-2 text-slate-500">
                    <span className="font-mono font-bold text-indigo-700">
                      {liveViewingStudent.admissionId}
                    </span>
                    <span>·</span>
                    <span>Session {liveViewingStudent.academicSession}</span>
                    <span>·</span>
                    <span
                      className={
                        liveViewingStudent.status === 'Deactive'
                          ? 'font-semibold text-amber-700'
                          : 'font-semibold text-emerald-700'
                      }
                    >
                      {liveViewingStudent.status === 'Deactive' ? 'Deactive (Archived)' : 'Active'}
                    </span>
                  </div>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">
                    {liveViewingStudent.name}
                  </h3>
                  <p className="mt-0.5 text-slate-600">
                    Class {liveViewingStudent.className} — Section {liveViewingStudent.section} (
                    <span className="font-mono">
                      Roll {resolveStudentRollNumber(liveViewingStudent, db.students)}
                    </span>
                    ) · {liveViewingStudent.gender} · DOB:{' '}
                    <span className="font-mono">{formatDateDisplay(liveViewingStudent.dob)}</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {canManageFees &&
                  liveViewingStudent.status !== 'Deactive' &&
                  liveViewingDue &&
                  liveViewingDue.totalOutstandingDue > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const stuId = liveViewingStudent.id;
                        setViewingStudent(null);
                        openFeeModuleForStudent(stuId, 'dues');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                    >
                      <IndianRupee className="h-3.5 w-3.5" />
                      <span>Pay Due ({formatINR(liveViewingDue.totalOutstandingDue)})</span>
                    </button>
                  )}
                {canManageStudents &&
                  (liveViewingStudent.status !== 'Deactive' || isCurrentUserAdmin) && (
                    <button
                      type="button"
                      onClick={() => {
                        const stu = liveViewingStudent;
                        setViewingStudent(null);
                        openEditAdmissionModal(stu);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>Edit Details</span>
                    </button>
                  )}
                {canAccessModule('id-cards') && (
                  <button
                    type="button"
                    onClick={() => {
                      const stuId = liveViewingStudent.id;
                      setViewingStudent(null);
                      openIdCardForStudent(stuId);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 whitespace-nowrap"
                  >
                    <IdCard className="h-3.5 w-3.5" />
                    <span>ID Card</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const stu = liveViewingStudent;
                    openPrintPreview({
                      type: 'admission-slip',
                      student: stu,
                      route:
                        stu.transportEnabled && stu.routeId ? routeMap.get(stu.routeId) : undefined,
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Admission Slip</span>
                </button>
                {canManageStudents && liveViewingStudent.status !== 'Deactive' && (
                  <button
                    type="button"
                    onClick={() => handleToggleStudentStatusPrompt(liveViewingStudent)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 whitespace-nowrap"
                  >
                    <PauseCircle className="h-3.5 w-3.5" />
                    <span>Deactivate</span>
                  </button>
                )}
              </div>
            </div>

            {/* Fee & Automated Due Summary */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 p-3.5">
                <p className="text-slate-500">Admission Fee</p>
                <p className="mt-1 font-mono text-sm font-bold text-slate-900 tabular-nums">
                  {liveViewingStudent.admissionType} · {formatINR(liveViewingStudent.admissionFee)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3.5">
                <p className="text-slate-500">Monthly Tuition</p>
                <p className="mt-1 font-mono text-sm font-bold text-slate-900 tabular-nums">
                  {formatINR(liveViewingStudent.monthlyTuitionFee)}/mo
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3.5">
                <p className="text-slate-500">Total Paid (All Time)</p>
                <p className="mt-1 font-mono text-sm font-bold text-emerald-700 tabular-nums">
                  {formatINR(liveViewingDue ? liveViewingDue.totalPaidAll : 0)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3.5">
                <p className="text-slate-500">Current Balance Due</p>
                {liveViewingStudent.status === 'Deactive' ? (
                  <p className="mt-1 font-mono text-sm font-bold text-slate-500">
                    Frozen (Paused)
                  </p>
                ) : (
                  <p
                    className={`mt-1 font-mono text-sm font-bold tabular-nums ${
                      liveViewingDue && liveViewingDue.totalOutstandingDue > 0
                        ? 'text-rose-600'
                        : 'text-emerald-700'
                    }`}
                  >
                    {formatINR(liveViewingDue ? liveViewingDue.totalOutstandingDue : 0)}
                  </p>
                )}
              </div>
            </div>

            {/* Detailed Grid */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2.5">
                <h4 className="border-b border-slate-200 pb-1.5 font-bold text-slate-900">
                  Parent &amp; Contact Details
                </h4>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">Father&apos;s Name</span>
                  <span className="font-medium text-slate-900">{liveViewingStudent.fatherName}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">Mother&apos;s Name</span>
                  <span className="font-medium text-slate-900">{liveViewingStudent.motherName}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">Primary Mobile</span>
                  <span className="font-mono font-medium text-slate-900 tabular-nums">
                    {liveViewingStudent.phone}
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">Alternate Mobile</span>
                  <span className="font-mono font-medium text-slate-900 tabular-nums">
                    {liveViewingStudent.alternatePhone || '—'}
                  </span>
                </div>
                <div className="pt-1">
                  <span className="text-slate-500">Residential Address</span>
                  <p className="mt-0.5 font-medium text-slate-900">{liveViewingStudent.address}</p>
                </div>
              </div>

              <div className="space-y-2.5">
                <h4 className="border-b border-slate-200 pb-1.5 font-bold text-slate-900">
                  Pre-School, Identity &amp; Transport
                </h4>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">Previous School</span>
                  <span className="font-medium text-slate-900">
                    {liveViewingStudent.previousSchool || '—'}
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">Last Grade Passed</span>
                  <span className="font-medium text-slate-900">
                    {liveViewingStudent.lastGradePassed || '—'}
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">TC Details</span>
                  <span className="font-medium text-slate-900">
                    {liveViewingStudent.tcDetails || '—'}
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">Aadhaar Number</span>
                  <span className="font-mono font-medium text-slate-900 tabular-nums">
                    {liveViewingStudent.aadhaarNumber || 'Not Provided'}
                  </span>
                </div>
                <div className="pt-1">
                  <span className="text-slate-500">Bus Route Assignment</span>
                  <p className="mt-0.5 font-medium text-slate-900">
                    {(() => {
                      const r =
                        liveViewingStudent.transportEnabled && liveViewingStudent.routeId
                          ? routeMap.get(liveViewingStudent.routeId)
                          : undefined;
                      if (!r) return 'Transport OFF (Private / Self Commute)';
                      return `${r.routeName} (${r.busNumber}) · Driver: ${r.driverName} (${r.driverPhone})`;
                    })()}
                  </p>
                </div>
              </div>
            </div>

            {/* Academic Promotion History (if promoted across sessions) */}
            {liveViewingStudent.promotionHistory &&
              liveViewingStudent.promotionHistory.length > 0 && (
                <div className="rounded-lg border border-slate-200 p-4">
                  <h4 className="font-bold text-slate-900">
                    Academic Session &amp; Class Promotion History
                  </h4>
                  <div className="mt-2.5 divide-y divide-slate-100">
                    {liveViewingStudent.promotionHistory.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
                      >
                        <div className="text-slate-700">
                          <span className="font-mono text-slate-500">{item.fromSession}</span>{' '}
                          <strong className="text-slate-900">
                            Class {item.fromClass}-{item.fromSection}
                          </strong>{' '}
                          (Roll {item.previousRollNumber || '—'}) →{' '}
                          <span className="font-mono text-indigo-700">{item.toSession}</span>{' '}
                          <strong className="text-indigo-900">
                            Class {item.toClass}-{item.toSection}
                          </strong>{' '}
                          (Roll {item.newRollNumber})
                        </div>
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {formatDateDisplay(item.promotedAt.slice(0, 10))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Preserved Historical Fee Receipts & Exam Marksheets */}
            {(liveViewingReceipts.length > 0 || liveViewingMarksheets.length > 0) && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h4 className="font-bold text-slate-900">
                      Fee Payment History ({liveViewingReceipts.length})
                    </h4>
                    <Receipt className="h-4 w-4 text-emerald-600" />
                  </div>
                  {liveViewingReceipts.length === 0 ? (
                    <p className="mt-2 text-slate-400">No fee receipts recorded yet.</p>
                  ) : (
                    <div className="mt-2 max-h-40 divide-y divide-slate-100 overflow-y-auto">
                      {liveViewingReceipts.map((fee) => (
                        <div
                          key={fee.id}
                          className="flex items-center justify-between gap-2 py-1.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">
                              {fee.category} ({fee.feeMonth})
                            </p>
                            <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                              {fee.receiptNo} · {formatDateDisplay(fee.date)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openPrintPreview({ type: 'fee-receipt', fee })}
                            className="font-mono font-bold text-emerald-700 hover:underline tabular-nums shrink-0"
                          >
                            {formatINR(fee.amount)}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h4 className="font-bold text-slate-900">
                      Academic Marksheets ({liveViewingMarksheets.length})
                    </h4>
                    <Award className="h-4 w-4 text-indigo-600" />
                  </div>
                  {liveViewingMarksheets.length === 0 ? (
                    <p className="mt-2 text-slate-400">No exam marksheets recorded yet.</p>
                  ) : (
                    <div className="mt-2 max-h-40 divide-y divide-slate-100 overflow-y-auto">
                      {liveViewingMarksheets.map((ms) => (
                        <div
                          key={ms.id}
                          className="flex items-center justify-between gap-2 py-1.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">{ms.examName}</p>
                            <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                              Class {ms.className}-{ms.section} · {ms.academicSession}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              openPrintPreview({
                                type: 'marksheet',
                                marksheet: ms,
                                student: liveViewingStudent,
                              })
                            }
                            className="font-mono font-bold text-indigo-700 hover:underline tabular-nums shrink-0"
                          >
                            {ms.percentage.toFixed(1)}% ({ms.overallGrade})
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {liveViewingStudent.aadhaarDocDataUrl && (
              <div className="rounded-lg border border-slate-200 p-4">
                <h4 className="mb-2 font-bold text-slate-900">Uploaded Aadhaar Document</h4>
                {liveViewingStudent.aadhaarDocDataUrl.startsWith('data:image/') ? (
                  <img
                    src={liveViewingStudent.aadhaarDocDataUrl}
                    alt="Uploaded Aadhaar Card"
                    referrerPolicy="no-referrer"
                    className="max-h-56 rounded-lg border border-slate-200 object-contain"
                  />
                ) : (
                  <a
                    href={liveViewingStudent.aadhaarDocDataUrl}
                    download={`${liveViewingStudent.admissionId}-aadhaar-doc`}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-indigo-700 hover:bg-slate-50"
                  >
                    <FileText className="h-4 w-4" />
                    <span>Download Attached Aadhaar Document</span>
                  </a>
                )}
              </div>
            )}

            {(() => {
              const populatedFields = getPopulatedCustomStudentFields(
                liveViewingStudent.customNotes,
                aiCustomization.customStudentFields
              );
              const { plainNotes } = extractCustomFieldsAndNotes(liveViewingStudent.customNotes);
              if (populatedFields.length === 0 && !plainNotes) return null;
              return (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                  {populatedFields.length > 0 && (
                    <div>
                      <h4 className="font-bold text-slate-900">Additional Custom Details</h4>
                      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {populatedFields.map((item) => (
                          <div
                            key={item.key}
                            className="rounded-md border border-slate-200 bg-white px-3 py-2"
                          >
                            <p className="text-[11px] text-slate-500">{item.label}</p>
                            <p className="mt-0.5 font-semibold text-slate-900">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {plainNotes && (
                    <div>
                      <h4 className="font-bold text-slate-900">
                        Administrative / Medical / Concession Notes
                      </h4>
                      <p className="mt-1 whitespace-pre-line leading-relaxed text-slate-700">
                        {plainNotes}
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </ModalShell>
    </section>
  );
};
