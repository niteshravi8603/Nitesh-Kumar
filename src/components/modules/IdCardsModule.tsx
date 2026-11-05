import React, { useEffect, useMemo, useState } from 'react';
import {
  IdCard,
  Search,
  Download,
  Printer,
  Image as ImageIcon,
  LayoutGrid,
  QrCode,
  Barcode,
  ArrowRight,
  CheckCircle2,
  Users,
  Pencil,
} from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { IdCardCodeStyle } from '../../types/erp';
import { resolveStudentRollNumber } from '../../utils/examEngine';
import {
  downloadStudentIdCardPng,
  downloadStudentIdCardsPdf,
} from '../../utils/idCardGenerator';
import { formatDateDisplay, getInitials } from '../../utils/formatters';
import { IdCardVisual } from '../IdCardVisual';
import { QuickPhotoAttachmentControl } from '../QuickPhotoAttachmentControl';

export const IdCardsModule: React.FC = () => {
  const {
    db,
    canManageStudents,
    canManageMarks,
    preselectedIdCardStudentId,
    clearPreselectedIdCardStudent,
    openEditStudentModal,
    openStaffIdCardStudio,
    openPrintPreview,
    setActiveModule,
    notify,
    getEffectiveStudentPhoto,
    setTemporaryPhotoOverride,
    saveQuickPersonPhoto,
  } = useSchool();

  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [sectionFilter, setSectionFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'Active' | 'Deactive' | 'ALL'>('Active');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [codeStyle, setCodeStyle] = useState<IdCardCodeStyle>('barcode');
  const [downloadingPng, setDownloadingPng] = useState(false);

  // Sync preselected student when arriving from Admissions directory
  useEffect(() => {
    if (preselectedIdCardStudentId) {
      const target = db.students.find((s) => s.id === preselectedIdCardStudentId);
      if (target) {
        if (target.status === 'Deactive' && statusFilter === 'Active') {
          setStatusFilter('ALL');
        }
        setSelectedStudentId(preselectedIdCardStudentId);
      }
      clearPreselectedIdCardStudent();
    }
  }, [preselectedIdCardStudentId, db.students, statusFilter, clearPreselectedIdCardStudent]);

  const availableSections = useMemo(() => {
    if (classFilter === 'ALL') return ['A', 'B', 'C'];
    const cls = db.classes.find((c) => c.className === classFilter);
    return cls && cls.sections.length > 0 ? cls.sections : ['A', 'B', 'C'];
  }, [classFilter, db.classes]);

  const activeStudentsCount = useMemo(
    () => db.students.filter((s) => s.status !== 'Deactive').length,
    [db.students]
  );

  const archivedStudentsCount = useMemo(
    () => db.students.filter((s) => s.status === 'Deactive').length,
    [db.students]
  );

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return db.students
      .filter((stu) => {
        const effectiveStatus = stu.status === 'Deactive' ? 'Deactive' : 'Active';
        if (statusFilter !== 'ALL' && effectiveStatus !== statusFilter) return false;
        if (classFilter !== 'ALL' && stu.className !== classFilter) return false;
        if (sectionFilter !== 'ALL' && stu.section !== sectionFilter) return false;
        if (q) {
          const hit =
            stu.name.toLowerCase().includes(q) ||
            stu.admissionId.toLowerCase().includes(q) ||
            stu.fatherName.toLowerCase().includes(q) ||
            stu.phone.toLowerCase().includes(q);
          if (!hit) return false;
        }
        return true;
      })
      .map((stu) => ({
        ...stu,
        photoDataUrl: getEffectiveStudentPhoto(stu),
      }));
  }, [db.students, statusFilter, classFilter, sectionFilter, searchQuery, getEffectiveStudentPhoto]);

  // Keep selectedStudentId automatically synced to the first available student
  useEffect(() => {
    if (filteredStudents.length === 0) {
      setSelectedStudentId('');
      return;
    }
    const inFiltered = filteredStudents.some((s) => s.id === selectedStudentId);
    if (!selectedStudentId || !inFiltered) {
      setSelectedStudentId(filteredStudents[0].id);
    }
  }, [filteredStudents, selectedStudentId]);

  const selectedStudent = useMemo(() => {
    const raw = db.students.find((s) => s.id === selectedStudentId);
    if (!raw) return null;
    return {
      ...raw,
      photoDataUrl: getEffectiveStudentPhoto(raw),
    };
  }, [db.students, selectedStudentId, getEffectiveStudentPhoto]);

  const selectedRollNo = useMemo(
    () => (selectedStudent ? resolveStudentRollNumber(selectedStudent, db.students) : ''),
    [selectedStudent, db.students]
  );

  const handleDownloadPng = async () => {
    if (!selectedStudent) return;
    setDownloadingPng(true);
    try {
      await downloadStudentIdCardPng(
        selectedStudent,
        db.students,
        codeStyle,
        db.schoolProfile
      );
      notify(
        'success',
        'High-Res ID Card Image Saved',
        `Downloaded 300-DPI PNG ID Card for ${selectedStudent.name} (${selectedStudent.admissionId}).`
      );
    } finally {
      setDownloadingPng(false);
    }
  };

  const handleDownloadSinglePdf = () => {
    if (!selectedStudent) return;
    downloadStudentIdCardsPdf(
      [selectedStudent],
      db.students,
      'single',
      codeStyle,
      db.schoolProfile
    );
    notify(
      'success',
      'ID Card PDF Downloaded',
      `Downloaded print-ready CR80 PDF for ${selectedStudent.name}.`
    );
  };

  const handleDownloadBatchGridPdf = () => {
    if (filteredStudents.length === 0) return;
    downloadStudentIdCardsPdf(
      filteredStudents,
      db.students,
      'grid',
      codeStyle,
      db.schoolProfile
    );
    notify(
      'success',
      'Multi-Card Sheet PDF Downloaded',
      `Generated ${filteredStudents.length} Student ID Cards in 3×3 A4 print grid.`
    );
  };

  return (
    <section className="space-y-5">
      {/* Module Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              Student Identity Card Studio
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Select any admitted student to auto-populate official CR80 ID cards with live{' '}
              {db.schoolProfile.schoolName} branding — download as High-Res PNG / PDF or print sheets
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openStaffIdCardStudio()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 whitespace-nowrap shrink-0"
            >
              <IdCard className="h-3.5 w-3.5" />
              <span>Staff ID Cards ({db.staff.length})</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>

            {/* Verification Code Selector */}
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setCodeStyle('barcode')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  codeStyle === 'barcode'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Barcode className="h-3.5 w-3.5" />
                <span>Barcode</span>
              </button>
              <button
                type="button"
                onClick={() => setCodeStyle('qr')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  codeStyle === 'qr'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <QrCode className="h-3.5 w-3.5" />
                <span>QR Code</span>
              </button>
              <button
                type="button"
                onClick={() => setCodeStyle('none')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  codeStyle === 'none'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>No Code</span>
              </button>
            </div>

            {filteredStudents.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    openPrintPreview({
                      type: 'student-id-card',
                      students: filteredStudents,
                      layoutMode: 'grid',
                      codeStyle,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Print Grid ({filteredStudents.length})</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadBatchGridPdf}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Batch Grid PDF ({filteredStudents.length})</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* LEFT COLUMN: Student Search, Filter & Automated Selector */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                01. Select Student from Admission Database
              </h3>
              <span className="font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                {filteredStudents.length} / {db.students.length} Students
              </span>
            </div>

            {/* Active vs Archived Filter */}
            {db.students.length > 0 && (
              <div className="mt-3 flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setStatusFilter('Active')}
                  className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
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
                  className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    statusFilter === 'Deactive'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Archived ({archivedStudentsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    statusFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({db.students.length})
                </button>
              </div>
            )}

            {/* Search & Class/Section Filters */}
            <div className="mt-3 space-y-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by Student Name, Admission ID (RB1001), Father, Phone..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <select
                  value={classFilter}
                  onChange={(e) => {
                    setClassFilter(e.target.value);
                    setSectionFilter('ALL');
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-indigo-600 focus:outline-none"
                >
                  <option value="ALL">All Classes</option>
                  {db.classes.map((c) => (
                    <option key={c.id} value={c.className}>
                      Class {c.className}
                    </option>
                  ))}
                </select>

                <select
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-indigo-600 focus:outline-none"
                >
                  <option value="ALL">All Sections</option>
                  {availableSections.map((sec) => (
                    <option key={sec} value={sec}>
                      Section {sec}
                    </option>
                  ))}
                </select>
              </div>

              {/* Direct Dropdown Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500">
                  Quick Student Dropdown
                </label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  disabled={filteredStudents.length === 0}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {filteredStudents.length === 0 ? (
                    <option value="">
                      {db.students.length === 0
                        ? 'No students admitted yet — Template Preview Active'
                        : 'No matching students in current filter'}
                    </option>
                  ) : (
                    filteredStudents.map((stu) => (
                      <option key={stu.id} value={stu.id}>
                        {stu.admissionId} — {stu.name} (Class {stu.className}-{stu.section}
                        {stu.status === 'Deactive' ? ' · Archived' : ''})
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* Interactive Student List */}
            <div className="mt-4">
              {db.students.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center">
                  <Users className="mx-auto h-6 w-6 text-indigo-600" />
                  <p className="mt-2 text-xs font-bold text-slate-900">
                    Admission Directory Is Currently Empty
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    The pre-configured {db.schoolProfile.schoolName} ID Card template is displayed on the right. Admit a student in Module 1 to automatically populate and download live ID cards.
                  </p>
                  {canManageStudents && (
                    <button
                      type="button"
                      onClick={() => setActiveModule('admissions')}
                      className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap"
                    >
                      <span>Go to Student Admissions</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
                  No students match your current status, search, or class/section filter.
                </div>
              ) : (
                <div className="max-h-[320px] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {filteredStudents.map((stu) => {
                    const isSelected = stu.id === selectedStudentId;
                    return (
                      <button
                        key={stu.id}
                        type="button"
                        onClick={() => setSelectedStudentId(stu.id)}
                        className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors ${
                          isSelected
                            ? 'bg-indigo-50/90 text-slate-900'
                            : 'bg-white hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          {stu.photoDataUrl ? (
                            <img
                              src={stu.photoDataUrl}
                              alt={stu.name}
                              referrerPolicy="no-referrer"
                              className="h-9 w-9 shrink-0 rounded-md border border-slate-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 font-mono text-xs font-bold text-slate-600">
                              {getInitials(stu.name)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-900">
                              {stu.name}
                            </p>
                            <p className="truncate font-mono text-[11px] text-slate-500 tabular-nums">
                              {stu.admissionId} · Class {stu.className}-{stu.section}
                              {stu.status === 'Deactive' ? ' · Deactive' : ''}
                            </p>
                          </div>
                        </div>

                        {isSelected && (
                          <span className="font-mono text-[11px] font-bold text-indigo-700 shrink-0">
                            Selected
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
            Zero manual data entry required — all fields &amp; school branding sync live.
          </div>
        </div>

        {/* RIGHT COLUMN: Live Pre-Configured ID Card Preview + Auto-Populated Data Summary + Actions */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {selectedStudent
                  ? `02. Live ID Card — ${selectedStudent.name}`
                  : '02. Pre-Configured ID Card Template Preview'}
              </h3>
              <p className="text-xs text-slate-500">
                Standard CR80 Portrait Layout (54mm × 86mm) · {db.schoolProfile.schoolName} Official Styling
              </p>
            </div>

            {selectedStudent && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Auto-Fetched ({selectedStudent.admissionId})</span>
                </span>
                {canManageStudents && (
                  <button
                    type="button"
                    onClick={() => openEditStudentModal(selectedStudent.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 whitespace-nowrap"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span>Edit Student</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-6 xl:grid-cols-12 items-start">
            {/* Card Visual Canvas */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50/80 p-5 xl:col-span-6">
              <IdCardVisual
                student={selectedStudent}
                rollNumber={selectedRollNo}
                codeStyle={codeStyle}
                schoolProfile={db.schoolProfile}
              />
            </div>

            {/* Auto-Fetched Fields Breakdown + Manual Photo Fallback + Download & Print Controls */}
            <div className="space-y-4 xl:col-span-6">
              {selectedStudent && (
                <QuickPhotoAttachmentControl
                  personName={selectedStudent.name}
                  recordLabel={selectedStudent.admissionId}
                  hasExistingPhoto={Boolean(selectedStudent.photoDataUrl)}
                  canSavePermanently={canManageStudents || canManageMarks}
                  onSavePermanent={(dataUrl) =>
                    saveQuickPersonPhoto('student', selectedStudent.id, dataUrl)
                  }
                  onAttachTemporary={(dataUrl) =>
                    setTemporaryPhotoOverride('student', selectedStudent.id, dataUrl)
                  }
                />
              )}

              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-900">
                    Auto-Populated Database Fields
                  </span>
                  <IdCard className="h-4 w-4 text-indigo-600" />
                </div>

                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 shrink-0">Student Name</dt>
                    <dd className="font-semibold text-slate-900 text-right truncate">
                      {selectedStudent ? selectedStudent.name : 'Template Placeholder'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 shrink-0">Registration / Adm No.</dt>
                    <dd className="font-mono font-semibold text-indigo-700 tabular-nums text-right">
                      {selectedStudent ? selectedStudent.admissionId : 'RB1001'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 shrink-0">Class &amp; Section</dt>
                    <dd className="font-semibold text-slate-900 text-right">
                      {selectedStudent
                        ? `Class ${selectedStudent.className} - Sec ${selectedStudent.section} (${selectedRollNo})`
                        : 'Class 1st - Sec A'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 shrink-0">Father&apos;s Name</dt>
                    <dd className="font-medium text-slate-900 text-right truncate">
                      {selectedStudent ? selectedStudent.fatherName : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 shrink-0">Date of Birth</dt>
                    <dd className="font-mono font-medium text-slate-900 tabular-nums text-right">
                      {selectedStudent ? formatDateDisplay(selectedStudent.dob) : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 shrink-0">Contact Mobile</dt>
                    <dd className="font-mono font-medium text-slate-900 tabular-nums text-right">
                      {selectedStudent ? selectedStudent.phone : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 shrink-0">Photograph</dt>
                    <dd className="font-medium text-slate-900 text-right">
                      {selectedStudent
                        ? selectedStudent.photoDataUrl
                          ? 'Uploaded Photo Linked'
                          : 'Initials Avatar Fallback'
                        : 'Placeholder Frame'}
                    </dd>
                  </div>
                  <div className="border-t border-slate-200 pt-2">
                    <dt className="text-slate-500">Residential Address</dt>
                    <dd className="mt-0.5 font-medium text-slate-800 leading-snug">
                      {selectedStudent ? selectedStudent.address : '—'}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Download & Print Action Suite */}
              <div className="space-y-2.5">
                <p className="text-xs font-bold text-slate-900">
                  Instant Download &amp; Print Actions
                </p>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={!selectedStudent}
                    onClick={handleDownloadSinglePdf}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 whitespace-nowrap"
                  >
                    <Download className="h-4 w-4 shrink-0" />
                    <span>Download ID Card (PDF)</span>
                  </button>

                  <button
                    type="button"
                    disabled={!selectedStudent || downloadingPng}
                    onClick={handleDownloadPng}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 whitespace-nowrap"
                  >
                    <ImageIcon className="h-4 w-4 shrink-0" />
                    <span>
                      {downloadingPng ? 'Rendering PNG...' : 'Download High-Res PNG'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={!selectedStudent}
                    onClick={() => {
                      if (!selectedStudent) return;
                      openPrintPreview({
                        type: 'student-id-card',
                        students: [selectedStudent],
                        layoutMode: 'single',
                        codeStyle,
                      });
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 whitespace-nowrap"
                  >
                    <Printer className="h-4 w-4 shrink-0" />
                    <span>Print Single ID Card</span>
                  </button>

                  <button
                    type="button"
                    disabled={filteredStudents.length === 0}
                    onClick={() =>
                      openPrintPreview({
                        type: 'student-id-card',
                        students: filteredStudents,
                        layoutMode: 'grid',
                        codeStyle,
                      })
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 whitespace-nowrap"
                  >
                    <LayoutGrid className="h-4 w-4 shrink-0" />
                    <span>Print Multi-Card Grid</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
