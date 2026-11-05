import React from 'react';
import { Printer, X, GraduationCap, Download, Image as ImageIcon } from 'lucide-react';
import { useSchool } from '../context/SchoolContext';
import {
  DEFAULT_EXAM_INSTRUCTIONS,
  formatExamDayName,
  formatTimeSlot,
  resolveStudentRollNumber,
  sortExamSubjects,
} from '../utils/examEngine';
import {
  downloadAdmitCardPdf,
  downloadMarksheetPdf,
} from '../utils/examPdfGenerator';
import {
  downloadStaffIdCardPng,
  downloadStaffIdCardsPdf,
  downloadStudentIdCardPng,
  downloadStudentIdCardsPdf,
  generateVerificationMatrix,
} from '../utils/idCardGenerator';
import { IdCardVisual } from './IdCardVisual';
import { QuickPhotoAttachmentControl } from './QuickPhotoAttachmentControl';
import { QuickSignatureVerificationControl } from './QuickSignatureVerificationControl';
import { StaffIdCardVisual } from './StaffIdCardVisual';
import {
  AcademicBrandCrest,
  GLOBAL_APP_TITLE,
  PrintableBrandContactStrip,
} from './TopBrandContactBar';
import { StaffMember, StudentRecord } from '../types/erp';
import {
  extractCustomFieldsAndNotes,
  getPopulatedCustomStudentFields,
} from '../utils/customFieldsHelper';
import {
  computeLetterGrade,
  formatDateDisplay,
  formatINR,
  getInitials,
  getTodayISO,
  numberToIndianWords,
} from '../utils/formatters';

const InlineQrMatrixSvg: React.FC<{ payload: string; size?: number; label?: string }> = ({
  payload,
  size = 64,
  label,
}) => {
  const matrix = generateVerificationMatrix(payload);
  return (
    <div className="inline-flex flex-col items-center gap-1 shrink-0">
      <div className="rounded border border-slate-300 bg-white p-1.5">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${matrix.length} ${matrix.length}`}
          shapeRendering="crispEdges"
          aria-label={label || 'Verification QR Code'}
        >
          <rect width={matrix.length} height={matrix.length} fill="#ffffff" />
          {matrix.map((row, rIdx) =>
            row.map((cell, cIdx) =>
              cell ? (
                <rect
                  key={`${rIdx}-${cIdx}`}
                  x={cIdx}
                  y={rIdx}
                  width={1}
                  height={1}
                  fill="#0f172a"
                />
              ) : null
            )
          )}
        </svg>
      </div>
      {label && (
        <span className="font-mono text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
          {label}
        </span>
      )}
    </div>
  );
};

export const PrintPreviewModal: React.FC = () => {
  const {
    db,
    activePrintDoc,
    closePrintPreview,
    notify,
    aiCustomization,
    canManageStudents,
    canManageMarks,
    canManageCampusOps,
    getEffectiveStudentPhoto,
    getEffectiveStaffPhoto,
    setTemporaryPhotoOverride,
    saveQuickPersonPhoto,
  } = useSchool();

  if (!activePrintDoc) return null;

  const resolveStudentWithPhoto = (stu: StudentRecord): StudentRecord => {
    const live = db.students.find((s) => s.id === stu.id) || stu;
    return {
      ...live,
      photoDataUrl: getEffectiveStudentPhoto(live),
    };
  };

  const resolveStaffWithPhoto = (stf: StaffMember): StaffMember => {
    const live = db.staff.find((m) => m.id === stf.id) || stf;
    return {
      ...live,
      photoDataUrl: getEffectiveStaffPhoto(live),
    };
  };

  const sp = db.schoolProfile;
  const schoolName = sp.schoolName?.trim() || GLOBAL_APP_TITLE;
  const schoolSubLine =
    sp.address?.trim() ||
    sp.tagline?.trim() ||
    'Recognized Primary & Preparatory Institution';
  const schoolContactLine = [
    sp.phone ? `Tel: ${sp.phone}${sp.alternatePhone ? ` / ${sp.alternatePhone}` : ''}` : '',
    sp.email ? sp.email : '',
    sp.website ? sp.website : '',
    sp.affiliationNo ? `Affiliation: ${sp.affiliationNo}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const handlePrint = () => {
    window.print();
  };

  const handleDirectPdfDownload = () => {
    if (activePrintDoc.type === 'admit-card') {
      const stu = resolveStudentWithPhoto(activePrintDoc.student);
      downloadAdmitCardPdf(
        activePrintDoc.exam,
        stu,
        activePrintDoc.rollNumber,
        db.schoolProfile,
        aiCustomization
      );
      notify(
        'success',
        'Admit Card PDF Downloaded',
        `Downloaded Admit Card for ${stu.name}.`
      );
    } else if (activePrintDoc.type === 'marksheet') {
      const baseStudent =
        activePrintDoc.student ||
        db.students.find((s) => s.id === activePrintDoc.marksheet.studentId);
      const resolvedStudent = baseStudent ? resolveStudentWithPhoto(baseStudent) : undefined;
      downloadMarksheetPdf(
        activePrintDoc.marksheet,
        resolvedStudent,
        db.schoolProfile,
        aiCustomization
      );
      notify(
        'success',
        'Marksheet PDF Downloaded',
        `Downloaded official Marksheet for ${activePrintDoc.marksheet.studentName}.`
      );
    } else if (activePrintDoc.type === 'student-id-card') {
      const enrichedStudents = activePrintDoc.students.map(resolveStudentWithPhoto);
      downloadStudentIdCardsPdf(
        enrichedStudents,
        db.students,
        activePrintDoc.layoutMode,
        activePrintDoc.codeStyle,
        db.schoolProfile
      );
      notify(
        'success',
        'ID Card PDF Downloaded',
        activePrintDoc.layoutMode === 'single'
          ? `Downloaded CR80 PDF for ${enrichedStudents[0]?.name || 'student'}.`
          : `Downloaded ${enrichedStudents.length} ID Cards in A4 print grid.`
      );
    } else if (activePrintDoc.type === 'staff-id-card') {
      const enrichedStaff = activePrintDoc.staffMembers.map(resolveStaffWithPhoto);
      downloadStaffIdCardsPdf(
        enrichedStaff,
        activePrintDoc.layoutMode,
        activePrintDoc.codeStyle,
        db.schoolProfile
      );
      notify(
        'success',
        'Staff ID Card PDF Downloaded',
        activePrintDoc.layoutMode === 'single'
          ? `Downloaded CR80 Staff ID PDF for ${enrichedStaff[0]?.fullName || 'staff'}.`
          : `Downloaded ${enrichedStaff.length} Staff ID Cards in A4 print grid.`
      );
    }
  };

  const handleDirectPngDownload = async () => {
    if (
      activePrintDoc.type === 'student-id-card' &&
      activePrintDoc.students.length === 1
    ) {
      const stu = resolveStudentWithPhoto(activePrintDoc.students[0]);
      await downloadStudentIdCardPng(
        stu,
        db.students,
        activePrintDoc.codeStyle,
        db.schoolProfile
      );
      notify(
        'success',
        'High-Res PNG Downloaded',
        `Downloaded 300-DPI PNG ID Card for ${stu.name}.`
      );
    } else if (
      activePrintDoc.type === 'staff-id-card' &&
      activePrintDoc.staffMembers.length === 1
    ) {
      const stf = resolveStaffWithPhoto(activePrintDoc.staffMembers[0]);
      await downloadStaffIdCardPng(
        stf,
        activePrintDoc.codeStyle,
        db.schoolProfile
      );
      notify(
        'success',
        'High-Res Staff PNG Downloaded',
        `Downloaded 300-DPI PNG Staff ID Card for ${stf.fullName}.`
      );
    }
  };

  const supportsDirectPdf =
    activePrintDoc.type === 'admit-card' ||
    activePrintDoc.type === 'marksheet' ||
    activePrintDoc.type === 'student-id-card' ||
    activePrintDoc.type === 'staff-id-card';

  const supportsDirectPng =
    (activePrintDoc.type === 'student-id-card' &&
      activePrintDoc.layoutMode === 'single' &&
      activePrintDoc.students.length === 1) ||
    (activePrintDoc.type === 'staff-id-card' &&
      activePrintDoc.layoutMode === 'single' &&
      activePrintDoc.staffMembers.length === 1);

  const docTitle =
    activePrintDoc.type === 'fee-receipt'
      ? `Fee Payment Receipt — ${activePrintDoc.fee.receiptNo}`
      : activePrintDoc.type === 'fee-demand-slip'
      ? `Fee Due Demand Notice — ${activePrintDoc.summary.student.name}`
      : activePrintDoc.type === 'admit-card'
      ? `Examination Admit Card — ${activePrintDoc.student.name} (Roll ${activePrintDoc.rollNumber})`
      : activePrintDoc.type === 'marksheet'
      ? `Official Academic Marksheet — ${activePrintDoc.marksheet.studentName}`
      : activePrintDoc.type === 'student-id-card'
      ? activePrintDoc.layoutMode === 'single'
        ? `Student Identity Card — ${activePrintDoc.students[0]?.name || ''}`
        : `Multi-Card A4 ID Sheet (${activePrintDoc.students.length} Students)`
      : activePrintDoc.type === 'staff-id-card'
      ? activePrintDoc.layoutMode === 'single'
        ? `Staff Identity Card — ${activePrintDoc.staffMembers[0]?.fullName || ''} (${activePrintDoc.staffMembers[0]?.staffId || ''})`
        : `Multi-Card A4 Staff ID Sheet (${activePrintDoc.staffMembers.length} Staff Members)`
      : activePrintDoc.type === 'report-card'
      ? `Academic Report Card — ${activePrintDoc.grade.studentName}`
      : activePrintDoc.type === 'admission-slip'
      ? `Admission Confirmation Slip — ${activePrintDoc.student.admissionId}`
      : `Daily Attendance Register — Class ${activePrintDoc.className}`;

  const sessionBanner =
    activePrintDoc.type === 'admission-slip'
      ? `Session ${activePrintDoc.student.academicSession}`
      : activePrintDoc.type === 'fee-demand-slip'
      ? `Session ${activePrintDoc.summary.student.academicSession}`
      : activePrintDoc.type === 'admit-card'
      ? `Session ${activePrintDoc.exam.academicSession}`
      : activePrintDoc.type === 'marksheet'
      ? `Session ${activePrintDoc.marksheet.academicSession}`
      : activePrintDoc.type === 'student-id-card' && activePrintDoc.students[0]
      ? `Session ${activePrintDoc.students[0].academicSession}`
      : `Session ${db.activeSession}`;

  return (
    <div
      id="rb-print-overlay"
      className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-slate-900/60 p-4 sm:p-8"
      onClick={closePrintPreview}
      role="dialog"
      aria-modal="true"
    >
      {/* Action Toolbar (Hidden when printing) */}
      <div
        className="no-print mb-4 flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{docTitle}</p>
          <p className="text-xs text-slate-500">
            Official print-ready A4 stationery layout · {schoolName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {supportsDirectPng && (
            <button
              type="button"
              onClick={handleDirectPngDownload}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 whitespace-nowrap shrink-0"
            >
              <ImageIcon className="h-4 w-4" />
              <span>Download PNG</span>
            </button>
          )}
          {supportsDirectPdf && (
            <button
              type="button"
              onClick={handleDirectPdfDownload}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap shrink-0"
            >
              <Download className="h-4 w-4" />
              <span>Download PDF</span>
            </button>
          )}
          <QuickSignatureVerificationControl compact />
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap shrink-0"
          >
            <Printer className="h-4 w-4" />
            <span>Print Document</span>
          </button>
          <button
            type="button"
            onClick={closePrintPreview}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <X className="h-4 w-4" />
            <span>Close</span>
          </button>
        </div>
      </div>

      {/* Manual Photo Fallback & Passport Cropper Bar (Hidden when printing) */}
      {(() => {
        if (activePrintDoc.type === 'admit-card') {
          const stu = resolveStudentWithPhoto(activePrintDoc.student);
          return (
            <div
              className="no-print mb-3 w-full max-w-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <QuickPhotoAttachmentControl
                personName={stu.name}
                recordLabel={`Roll ${activePrintDoc.rollNumber} · ${stu.admissionId}`}
                hasExistingPhoto={Boolean(stu.photoDataUrl)}
                canSavePermanently={canManageStudents || canManageMarks}
                onSavePermanent={(dataUrl) => saveQuickPersonPhoto('student', stu.id, dataUrl)}
                onAttachTemporary={(dataUrl) =>
                  setTemporaryPhotoOverride('student', stu.id, dataUrl)
                }
              />
            </div>
          );
        }
        if (activePrintDoc.type === 'marksheet') {
          const baseStu =
            activePrintDoc.student ||
            db.students.find((s) => s.id === activePrintDoc.marksheet.studentId);
          if (!baseStu) return null;
          const stu = resolveStudentWithPhoto(baseStu);
          return (
            <div
              className="no-print mb-3 w-full max-w-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <QuickPhotoAttachmentControl
                personName={stu.name}
                recordLabel={`Marksheet · ${stu.admissionId}`}
                hasExistingPhoto={Boolean(stu.photoDataUrl)}
                canSavePermanently={canManageStudents || canManageMarks}
                onSavePermanent={(dataUrl) => saveQuickPersonPhoto('student', stu.id, dataUrl)}
                onAttachTemporary={(dataUrl) =>
                  setTemporaryPhotoOverride('student', stu.id, dataUrl)
                }
              />
            </div>
          );
        }
        if (activePrintDoc.type === 'admission-slip') {
          const stu = resolveStudentWithPhoto(activePrintDoc.student);
          return (
            <div
              className="no-print mb-3 w-full max-w-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <QuickPhotoAttachmentControl
                personName={stu.name}
                recordLabel={`Admission Slip · ${stu.admissionId}`}
                hasExistingPhoto={Boolean(stu.photoDataUrl)}
                canSavePermanently={canManageStudents || canManageMarks}
                onSavePermanent={(dataUrl) => saveQuickPersonPhoto('student', stu.id, dataUrl)}
                onAttachTemporary={(dataUrl) =>
                  setTemporaryPhotoOverride('student', stu.id, dataUrl)
                }
              />
            </div>
          );
        }
        if (
          activePrintDoc.type === 'student-id-card' &&
          activePrintDoc.layoutMode === 'single' &&
          activePrintDoc.students[0]
        ) {
          const stu = resolveStudentWithPhoto(activePrintDoc.students[0]);
          return (
            <div
              className="no-print mb-3 w-full max-w-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <QuickPhotoAttachmentControl
                personName={stu.name}
                recordLabel={`Student ID Card · ${stu.admissionId}`}
                hasExistingPhoto={Boolean(stu.photoDataUrl)}
                canSavePermanently={canManageStudents || canManageMarks}
                onSavePermanent={(dataUrl) => saveQuickPersonPhoto('student', stu.id, dataUrl)}
                onAttachTemporary={(dataUrl) =>
                  setTemporaryPhotoOverride('student', stu.id, dataUrl)
                }
              />
            </div>
          );
        }
        if (
          activePrintDoc.type === 'staff-id-card' &&
          activePrintDoc.layoutMode === 'single' &&
          activePrintDoc.staffMembers[0]
        ) {
          const stf = resolveStaffWithPhoto(activePrintDoc.staffMembers[0]);
          return (
            <div
              className="no-print mb-3 w-full max-w-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <QuickPhotoAttachmentControl
                personName={stf.fullName}
                recordLabel={`Staff ID Card · ${stf.staffId}`}
                hasExistingPhoto={Boolean(stf.photoDataUrl)}
                canSavePermanently={canManageCampusOps}
                onSavePermanent={(dataUrl) => saveQuickPersonPhoto('staff', stf.id, dataUrl)}
                onAttachTemporary={(dataUrl) =>
                  setTemporaryPhotoOverride('staff', stf.id, dataUrl)
                }
              />
            </div>
          );
        }
        return null;
      })()}

      {/* Printable Official Document */}
      <div
        id="rb-printable-document"
        className={`w-full rounded-xl border border-slate-300 bg-white text-slate-900 shadow-2xl ${
          (activePrintDoc.type === 'student-id-card' || activePrintDoc.type === 'staff-id-card') &&
          activePrintDoc.layoutMode === 'grid'
            ? 'max-w-4xl p-5 sm:p-6'
            : 'max-w-3xl p-8 sm:p-10'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Global Platform & Contact Header Banner on All Printable Documents */}
        <PrintableBrandContactStrip position="header" />

        {/* Common School Header (Omitted on Multi-Card ID Grid to maximize A4 card density) */}
        {!(
          (activePrintDoc.type === 'student-id-card' || activePrintDoc.type === 'staff-id-card') &&
          activePrintDoc.layoutMode === 'grid'
        ) && (
          <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-5">
            <div className="flex items-center gap-3.5 min-w-0">
              {sp.logoDataUrl ? (
                <img
                  src={sp.logoDataUrl}
                  alt={schoolName}
                  referrerPolicy="no-referrer"
                  className="h-14 w-14 rounded-lg border border-slate-300 bg-white object-contain p-1 shrink-0"
                />
              ) : (
                <AcademicBrandCrest size="md" variant="dark" />
              )}
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {schoolName.toUpperCase()}
                </h1>
                <p className="text-xs text-slate-600">{schoolSubLine}</p>
                {schoolContactLine && (
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                    {schoolContactLine}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right text-xs text-slate-600 shrink-0">
              <p className="font-semibold text-slate-900">
                {activePrintDoc.type === 'admit-card' || activePrintDoc.type === 'marksheet'
                  ? 'Controller of Examinations'
                  : 'Office of Administration'}
              </p>
              <p className="font-mono tabular-nums">{sessionBanner}</p>
              {sp.directorName && (
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Director: {sp.directorName}
                </p>
              )}
            </div>
          </div>
        )}

        {/* 1. OFFICIAL FEE PAYMENT RECEIPT */}
        {activePrintDoc.type === 'fee-receipt' && (() => {
          const feeStudent = db.students.find((s) => s.id === activePrintDoc.fee.studentId);
          const populatedReceiptFields = getPopulatedCustomStudentFields(
            feeStudent?.customNotes,
            aiCustomization.customStudentFields,
            'receipt'
          );
          const isModernBoxed = aiCustomization.feeReceiptStyle === 'modern-boxed';
          const isCompactSlip = aiCustomization.feeReceiptStyle === 'compact-slip';
          const qrPayload = `${schoolName}|RCPT:${activePrintDoc.fee.receiptNo}|ADM:${activePrintDoc.fee.admissionId}|AMT:${activePrintDoc.fee.amount}|DT:${activePrintDoc.fee.date}`;

          return (
            <div className={`relative ${isCompactSlip ? 'mt-4' : 'mt-6'}`}>
              {aiCustomization.feeReceiptShowLogoWatermark && sp.logoDataUrl && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.06]">
                  <img
                    src={sp.logoDataUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-52 w-52 object-contain"
                  />
                </div>
              )}

              <div
                className={
                  isModernBoxed
                    ? 'flex items-center justify-between rounded-lg bg-slate-900 px-4 py-2.5 text-white'
                    : 'flex items-baseline justify-between border-b border-slate-200 pb-3'
                }
              >
                <h2
                  className={`text-base font-bold ${
                    isModernBoxed ? 'tracking-wide text-white' : 'text-slate-900'
                  }`}
                >
                  OFFICIAL FEE PAYMENT RECEIPT
                </h2>
                <div
                  className={`text-right text-xs ${
                    isModernBoxed ? 'text-slate-200' : 'text-slate-600'
                  }`}
                >
                  <span>Receipt No: </span>
                  <span
                    className={`font-mono font-semibold tabular-nums ${
                      isModernBoxed ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {activePrintDoc.fee.receiptNo}
                  </span>
                  <span className="mx-2">·</span>
                  <span>Date: </span>
                  <span
                    className={`font-mono font-semibold tabular-nums ${
                      isModernBoxed ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {formatDateDisplay(activePrintDoc.fee.date)}
                  </span>
                </div>
              </div>

              <div
                className={`mt-5 grid grid-cols-2 gap-x-8 gap-y-2.5 text-sm ${
                  isModernBoxed
                    ? 'rounded-lg border border-slate-200 bg-slate-50/70 p-4'
                    : ''
                }`}
              >
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-500">Student Name</span>
                  <span className="font-semibold text-slate-900">
                    {activePrintDoc.fee.studentName}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-500">Admission ID</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {activePrintDoc.fee.admissionId}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-500">Class &amp; Section</span>
                  <span className="font-semibold text-slate-900">
                    Class {activePrintDoc.fee.className} — Sec {activePrintDoc.fee.section}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-500">Father&apos;s Name</span>
                  <span className="font-semibold text-slate-900">
                    {activePrintDoc.fee.fatherName || '—'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-500">Fee Month</span>
                  <span className="font-semibold text-slate-900">{activePrintDoc.fee.feeMonth}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-500">Payment Mode</span>
                  <span className="font-semibold text-slate-900">
                    {activePrintDoc.fee.paymentMode}
                  </span>
                </div>
                {populatedReceiptFields.map((cf) => (
                  <div key={cf.key} className="flex justify-between border-b border-slate-100 py-1">
                    <span className="text-slate-500">{cf.label}</span>
                    <span className="font-semibold text-slate-900">{cf.value}</span>
                  </div>
                ))}
              </div>

              <table
                className={`${
                  isCompactSlip ? 'mt-4' : 'mt-6'
                } w-full border-collapse border border-slate-300 text-sm`}
              >
                <thead>
                  <tr className="bg-slate-100 text-left text-xs font-semibold text-slate-700">
                    <th className="border border-slate-300 px-4 py-2.5 w-16">S.No</th>
                    <th className="border border-slate-300 px-4 py-2.5">Fee Particulars</th>
                    <th className="border border-slate-300 px-4 py-2.5">Billing Period</th>
                    <th className="border border-slate-300 px-4 py-2.5 text-right">
                      Amount Paid (INR)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-slate-300 px-4 py-3 font-mono tabular-nums">01</td>
                    <td className="border border-slate-300 px-4 py-3 font-medium text-slate-900">
                      {activePrintDoc.fee.category} Fee
                      {activePrintDoc.fee.remarks ? ` — ${activePrintDoc.fee.remarks}` : ''}
                    </td>
                    <td className="border border-slate-300 px-4 py-3 text-slate-700">
                      {activePrintDoc.fee.feeMonth}
                    </td>
                    <td className="border border-slate-300 px-4 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {formatINR(activePrintDoc.fee.amount)}
                    </td>
                  </tr>
                  <tr className="bg-slate-50 font-bold">
                    <td colSpan={3} className="border border-slate-300 px-4 py-3 text-right">
                      Net Amount Received
                    </td>
                    <td className="border border-slate-300 px-4 py-3 text-right font-mono text-base text-slate-900 tabular-nums">
                      {formatINR(activePrintDoc.fee.amount)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <p className="mt-3 text-xs text-slate-700">
                <span className="font-semibold">Amount in Words:</span>{' '}
                {numberToIndianWords(activePrintDoc.fee.amount)}
              </p>

              {aiCustomization.feeReceiptFooterNote?.trim() && (
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {aiCustomization.feeReceiptFooterNote.trim()}
                </p>
              )}

              <div
                className={`${
                  isCompactSlip ? 'mt-8' : 'mt-12'
                } flex items-end justify-between gap-4 border-t border-slate-200 pt-6 text-xs text-slate-600`}
              >
                <div>
                  <p>Depositor / Parent Signature</p>
                </div>

                {aiCustomization.feeReceiptShowQr && (
                  <InlineQrMatrixSvg payload={qrPayload} size={60} label="Verify Receipt" />
                )}

                <div className="relative text-right min-w-[170px]">
                  {sp.stampDataUrl && (
                    <img
                      src={sp.stampDataUrl}
                      alt="Official Seal"
                      referrerPolicy="no-referrer"
                      className="pointer-events-none absolute right-4 -top-8 h-16 w-16 object-contain opacity-75 rotate-[-8deg]"
                    />
                  )}
                  {sp.signatureDataUrl && (
                    <div className="flex justify-end mb-1">
                      <img
                        src={sp.signatureDataUrl}
                        alt="Signature"
                        referrerPolicy="no-referrer"
                        className="h-9 max-w-[130px] object-contain"
                      />
                    </div>
                  )}
                  <p className="font-semibold text-slate-900">
                    {sp.principalName || 'Authorized Accounts Signatory'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {sp.authorityDesignation || 'Principal / Accounts'} Signature &amp; Seal
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 1B. OFFICIAL FEE DUE DEMAND / REMINDER SLIP */}
        {activePrintDoc.type === 'fee-demand-slip' && (
          <div className="mt-6">
            <div className="flex items-baseline justify-between border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                OFFICIAL FEE DUE DEMAND / REMINDER NOTICE
              </h2>
              <div className="text-right text-xs text-slate-600">
                <span>Billing Cutoff: </span>
                <span className="font-semibold text-slate-900">{activePrintDoc.cutoffMonth}</span>
                <span className="mx-2">·</span>
                <span>Issued: </span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatDateDisplay(getTodayISO())}
                </span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-500">Student Name</span>
                <span className="font-semibold text-slate-900">
                  {activePrintDoc.summary.student.name}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-500">Admission ID</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {activePrintDoc.summary.student.admissionId}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-500">Class &amp; Section</span>
                <span className="font-semibold text-slate-900">
                  Class {activePrintDoc.summary.student.className} — Sec{' '}
                  {activePrintDoc.summary.student.section}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-500">Father&apos;s Name</span>
                <span className="font-semibold text-slate-900">
                  {activePrintDoc.summary.student.fatherName}
                </span>
              </div>
            </div>

            <table className="mt-6 w-full border-collapse border border-slate-300 text-sm">
              <thead>
                <tr className="bg-slate-100 text-left text-xs font-semibold text-slate-700">
                  <th className="border border-slate-300 px-4 py-2.5">Fee Head</th>
                  <th className="border border-slate-300 px-4 py-2.5 text-right">Billed (INR)</th>
                  <th className="border border-slate-300 px-4 py-2.5 text-right">Paid (INR)</th>
                  <th className="border border-slate-300 px-4 py-2.5 text-right">Balance Due (INR)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 px-4 py-2.5 font-medium text-slate-900">
                    Admission Fee ({activePrintDoc.summary.student.admissionType})
                  </td>
                  <td className="border border-slate-300 px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatINR(activePrintDoc.summary.expectedAdmission)}
                  </td>
                  <td className="border border-slate-300 px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatINR(activePrintDoc.summary.paidAdmission)}
                  </td>
                  <td className="border border-slate-300 px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                    {formatINR(activePrintDoc.summary.dueAdmission)}
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-4 py-2.5 font-medium text-slate-900">
                    Tuition Fee ({activePrintDoc.summary.billableMonths.length} mos @{' '}
                    {formatINR(activePrintDoc.summary.student.monthlyTuitionFee)}/mo)
                  </td>
                  <td className="border border-slate-300 px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatINR(activePrintDoc.summary.expectedTuition)}
                  </td>
                  <td className="border border-slate-300 px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatINR(activePrintDoc.summary.paidTuition)}
                  </td>
                  <td className="border border-slate-300 px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                    {formatINR(activePrintDoc.summary.dueTuition)}
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-4 py-2.5 font-medium text-slate-900">
                    Transport Fee (
                    {activePrintDoc.summary.student.transportEnabled
                      ? `${activePrintDoc.summary.billableMonths.length} mos @ ${formatINR(
                          activePrintDoc.summary.student.transportFee
                        )}/mo`
                      : 'Not Opted'}
                    )
                  </td>
                  <td className="border border-slate-300 px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatINR(activePrintDoc.summary.expectedTransport)}
                  </td>
                  <td className="border border-slate-300 px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatINR(activePrintDoc.summary.paidTransport)}
                  </td>
                  <td className="border border-slate-300 px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                    {formatINR(activePrintDoc.summary.dueTransport)}
                  </td>
                </tr>
                <tr className="bg-slate-50 font-bold">
                  <td className="border border-slate-300 px-4 py-3">Total Summary</td>
                  <td className="border border-slate-300 px-4 py-3 text-right font-mono tabular-nums">
                    {formatINR(activePrintDoc.summary.totalExpected)}
                  </td>
                  <td className="border border-slate-300 px-4 py-3 text-right font-mono tabular-nums">
                    {formatINR(
                      activePrintDoc.summary.paidAdmission +
                        activePrintDoc.summary.paidTuition +
                        activePrintDoc.summary.paidTransport
                    )}
                  </td>
                  <td className="border border-slate-300 px-4 py-3 text-right font-mono text-base text-rose-700 tabular-nums">
                    {formatINR(activePrintDoc.summary.totalOutstandingDue)}
                  </td>
                </tr>
              </tbody>
            </table>

            {activePrintDoc.summary.unpaidTuitionMonths.length > 0 && (
              <p className="mt-3 text-xs text-slate-700">
                <span className="font-semibold">Pending Tuition Months:</span>{' '}
                {activePrintDoc.summary.unpaidTuitionMonths.join(', ')}
              </p>
            )}

            <p className="mt-2 text-xs text-slate-700">
              <span className="font-semibold">Net Payable in Words:</span>{' '}
              {numberToIndianWords(activePrintDoc.summary.totalOutstandingDue)}
            </p>

            <div className="mt-14 flex items-end justify-between border-t border-slate-200 pt-6 text-xs text-slate-600">
              <div>Parent / Guardian Acknowledgment</div>
              <div className="relative text-right min-w-[170px]">
                {sp.stampDataUrl && (
                  <img
                    src={sp.stampDataUrl}
                    alt="Official Seal"
                    referrerPolicy="no-referrer"
                    className="pointer-events-none absolute right-4 -top-8 h-16 w-16 object-contain opacity-75 rotate-[-8deg]"
                  />
                )}
                {sp.signatureDataUrl && (
                  <div className="flex justify-end mb-1">
                    <img
                      src={sp.signatureDataUrl}
                      alt="Signature"
                      referrerPolicy="no-referrer"
                      className="h-9 max-w-[130px] object-contain"
                    />
                  </div>
                )}
                <p className="font-semibold text-slate-900">
                  {sp.principalName || 'Accounts Office'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {sp.authorityDesignation || 'Principal / Accounts'} Signature &amp; Seal
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 2. STUDENT ADMISSION CONFIRMATION SLIP */}
        {activePrintDoc.type === 'admission-slip' && (() => {
          const stu = resolveStudentWithPhoto(activePrintDoc.student);
          const { plainNotes } = extractCustomFieldsAndNotes(stu.customNotes);
          const customAdmissionFields = getPopulatedCustomStudentFields(
            stu.customNotes,
            aiCustomization.customStudentFields,
            'admission-slip'
          );

          return (
            <div className="mt-6">
              <div className="flex items-baseline justify-between border-b border-slate-200 pb-3">
                <h2 className="text-base font-bold text-slate-900">
                  STUDENT ADMISSION CONFIRMATION SLIP
                </h2>
                <div className="text-right text-xs text-slate-600">
                  <span>Admission ID: </span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {stu.admissionId}
                  </span>
                  <span className="mx-2">·</span>
                  <span>Date: </span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {formatDateDisplay(stu.admissionDate)}
                  </span>
                </div>
              </div>

              <div className="mt-5 flex items-start justify-between gap-6">
                <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Student Full Name</p>
                    <p className="mt-0.5 font-semibold text-slate-900">{stu.name}</p>
                  </div>
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Allotted Class &amp; Section</p>
                    <p className="mt-0.5 font-semibold text-slate-900">
                      Class {stu.className} — Section {stu.section}
                    </p>
                  </div>
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Date of Birth</p>
                    <p className="mt-0.5 font-mono font-medium text-slate-900 tabular-nums">
                      {formatDateDisplay(stu.dob)}
                    </p>
                  </div>
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Gender &amp; Category</p>
                    <p className="mt-0.5 font-medium text-slate-900">
                      {stu.gender} · {stu.casteCategory}
                    </p>
                  </div>
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Aadhaar Number</p>
                    <p className="mt-0.5 font-mono font-medium text-slate-900 tabular-nums">
                      {stu.aadhaarNumber || 'Not Provided'}
                    </p>
                  </div>
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Academic Session</p>
                    <p className="mt-0.5 font-mono font-medium text-slate-900 tabular-nums">
                      {stu.academicSession}
                    </p>
                  </div>
                </div>

                {stu.photoDataUrl ? (
                  <img
                    src={stu.photoDataUrl}
                    alt={stu.name}
                    referrerPolicy="no-referrer"
                    className="h-28 w-24 rounded-lg border border-slate-300 object-cover shrink-0"
                  />
                ) : (
                  <div className="flex h-28 w-24 flex-col items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-center text-xs text-slate-500 shrink-0">
                    <span className="font-mono text-base font-bold text-slate-700">
                      {getInitials(stu.name)}
                    </span>
                    <span className="mt-1 text-[10px]">Passport Photo</span>
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                <div className="border-b border-slate-200 pb-1.5">
                  <p className="text-xs text-slate-500">Father&apos;s Name</p>
                  <p className="mt-0.5 font-medium text-slate-900">{stu.fatherName}</p>
                </div>
                <div className="border-b border-slate-200 pb-1.5">
                  <p className="text-xs text-slate-500">Mother&apos;s Name</p>
                  <p className="mt-0.5 font-medium text-slate-900">{stu.motherName}</p>
                </div>
                <div className="border-b border-slate-200 pb-1.5">
                  <p className="text-xs text-slate-500">Contact Numbers</p>
                  <p className="mt-0.5 font-mono font-medium text-slate-900 tabular-nums">
                    {stu.phone}
                    {stu.alternatePhone ? ` / ${stu.alternatePhone}` : ''}
                  </p>
                </div>
                <div className="border-b border-slate-200 pb-1.5">
                  <p className="text-xs text-slate-500">Previous School &amp; TC</p>
                  <p className="mt-0.5 font-medium text-slate-900">
                    {stu.previousSchool || 'Fresher'}
                    {stu.lastGradePassed ? ` (${stu.lastGradePassed})` : ''}
                    {stu.tcDetails ? ` · ${stu.tcDetails}` : ''}
                  </p>
                </div>
                {customAdmissionFields.map((cf) => (
                  <div key={cf.key} className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">{cf.label}</p>
                    <p className="mt-0.5 font-medium text-slate-900">{cf.value}</p>
                  </div>
                ))}
                <div className="col-span-2 border-b border-slate-200 pb-1.5">
                  <p className="text-xs text-slate-500">Residential Address</p>
                  <p className="mt-0.5 font-medium text-slate-900">{stu.address}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-4 rounded-lg border border-slate-300 bg-slate-50 p-3.5 text-xs">
                <div>
                  <p className="text-slate-500">Admission Type &amp; Fee</p>
                  <p className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums">
                    {stu.admissionType} · {formatINR(stu.admissionFee)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Monthly Tuition Fee</p>
                  <p className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums">
                    {formatINR(stu.monthlyTuitionFee)} / month
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">School Bus / Transport</p>
                  <p className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums">
                    {stu.transportEnabled && activePrintDoc.route
                      ? `${activePrintDoc.route.routeName} (${formatINR(stu.transportFee)}/mo)`
                      : 'OFF (Self)'}
                  </p>
                </div>
              </div>

              {plainNotes && (
                <div className="mt-3 text-xs text-slate-700">
                  <span className="font-semibold text-slate-900">Administrative Remarks: </span>
                  {plainNotes}
                </div>
              )}

              <div className="mt-12 flex items-end justify-between border-t border-slate-200 pt-5 text-xs text-slate-600">
                <div>
                  <p>Parent / Guardian Signature</p>
                </div>
                <div className="relative text-right min-w-[170px]">
                  {sp.stampDataUrl && (
                    <img
                      src={sp.stampDataUrl}
                      alt="Official Seal"
                      referrerPolicy="no-referrer"
                      className="pointer-events-none absolute right-4 -top-8 h-16 w-16 object-contain opacity-75 rotate-[-8deg]"
                    />
                  )}
                  {sp.signatureDataUrl && (
                    <div className="flex justify-end mb-1">
                      <img
                        src={sp.signatureDataUrl}
                        alt="Signature"
                        referrerPolicy="no-referrer"
                        className="h-9 max-w-[130px] object-contain"
                      />
                    </div>
                  )}
                  <p className="font-semibold text-slate-900">
                    {sp.principalName || 'Principal / Admission In-Charge'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {sp.authorityDesignation || 'Principal'} Signature &amp; Seal
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 3A. STUDENT EXAMINATION ADMIT CARD */}
        {activePrintDoc.type === 'admit-card' && (() => {
          const stu = resolveStudentWithPhoto(activePrintDoc.student);
          const admitQrPayload = `${schoolName}|ADMIT:${activePrintDoc.exam.examCode}|ROLL:${activePrintDoc.rollNumber}|ADM:${stu.admissionId}`;

          return (
            <div className="mt-6">
              <div className="flex items-baseline justify-between rounded-lg border border-slate-300 bg-slate-100 px-4 py-2.5">
                <h2 className="text-sm font-bold tracking-tight text-slate-900">
                  EXAMINATION ADMIT CARD — {activePrintDoc.exam.examName.toUpperCase()}
                </h2>
                <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums">
                  Exam Code: {activePrintDoc.exam.examCode}
                </span>
              </div>

              <div className="mt-5 flex items-start justify-between gap-6">
                <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Candidate Name</p>
                    <p className="mt-0.5 font-bold text-slate-900">{stu.name}</p>
                  </div>
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Roll Number</p>
                    <p className="mt-0.5 font-mono font-bold text-indigo-700 tabular-nums">
                      {activePrintDoc.rollNumber}
                    </p>
                  </div>
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Admission ID</p>
                    <p className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {stu.admissionId}
                    </p>
                  </div>
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Class &amp; Section</p>
                    <p className="mt-0.5 font-semibold text-slate-900">
                      Class {stu.className} — Section {stu.section}
                    </p>
                  </div>
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Father&apos;s Name</p>
                    <p className="mt-0.5 font-medium text-slate-900">
                      {stu.fatherName || '—'}
                    </p>
                  </div>
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Date of Birth</p>
                    <p className="mt-0.5 font-mono font-medium text-slate-900 tabular-nums">
                      {formatDateDisplay(stu.dob)}
                    </p>
                  </div>
                  <div className="col-span-2 border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Examination Center</p>
                    <p className="mt-0.5 font-semibold text-slate-900">
                      {activePrintDoc.exam.examCenter || `${schoolName} — Main Campus`}
                    </p>
                  </div>
                </div>

                {stu.photoDataUrl ? (
                  <img
                    src={stu.photoDataUrl}
                    alt={stu.name}
                    referrerPolicy="no-referrer"
                    className="h-32 w-28 rounded-lg border border-slate-300 object-cover shrink-0"
                  />
                ) : (
                  <div className="flex h-32 w-28 flex-col items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-center text-xs text-slate-500 shrink-0">
                    <span className="font-mono text-lg font-bold text-slate-700">
                      {getInitials(stu.name)}
                    </span>
                    <span className="mt-1 text-[10px]">Candidate Photo</span>
                  </div>
                )}
              </div>

              {/* Subject-wise Exam Schedule */}
              <div className="mt-6">
                <h3 className="text-xs font-bold tracking-wide text-slate-800">
                  SUBJECT-WISE EXAMINATION DATE &amp; TIME SCHEDULE
                </h3>
                <table className="mt-2 w-full border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-left font-semibold text-slate-700">
                      <th className="border border-slate-300 px-3 py-2 w-12 text-center">S.No</th>
                      <th className="border border-slate-300 px-3 py-2">Exam Date &amp; Day</th>
                      <th className="border border-slate-300 px-3 py-2">Time Slot</th>
                      <th className="border border-slate-300 px-3 py-2">Subject</th>
                      <th className="border border-slate-300 px-3 py-2 text-right">Max Marks</th>
                      <th className="border border-slate-300 px-3 py-2 text-right">Pass Marks</th>
                      <th className="border border-slate-300 px-3 py-2 text-center w-28">
                        Invigilator Sign
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortExamSubjects(activePrintDoc.exam.subjects).map((sub, index) => (
                      <tr key={sub.id}>
                        <td className="border border-slate-300 px-3 py-2.5 text-center font-mono tabular-nums">
                          {String(index + 1).padStart(2, '0')}
                        </td>
                        <td className="border border-slate-300 px-3 py-2.5 font-mono text-slate-900 tabular-nums">
                          {formatDateDisplay(sub.examDate)}
                          {formatExamDayName(sub.examDate)
                            ? ` (${formatExamDayName(sub.examDate)})`
                            : ''}
                        </td>
                        <td className="border border-slate-300 px-3 py-2.5 font-mono text-slate-800 tabular-nums">
                          {formatTimeSlot(sub.startTime, sub.endTime)}
                        </td>
                        <td className="border border-slate-300 px-3 py-2.5 font-semibold text-slate-900">
                          {sub.subjectName}
                          {sub.subjectCode ? ` (${sub.subjectCode})` : ''}
                        </td>
                        <td className="border border-slate-300 px-3 py-2.5 text-right font-mono tabular-nums">
                          {sub.maxMarks}
                        </td>
                        <td className="border border-slate-300 px-3 py-2.5 text-right font-mono tabular-nums">
                          {sub.minMarks}
                        </td>
                        <td className="border border-slate-300 px-3 py-2.5"></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">Important Instructions for Candidates:</p>
                  <p className="mt-1 whitespace-pre-line leading-relaxed">
                    {activePrintDoc.exam.instructions || DEFAULT_EXAM_INSTRUCTIONS}
                  </p>
                </div>
                {aiCustomization.admitCardShowQr && (
                  <InlineQrMatrixSvg payload={admitQrPayload} size={62} label="Hall Ticket QR" />
                )}
              </div>

              <div className="mt-14 grid grid-cols-3 gap-8 border-t border-slate-200 pt-6 text-xs text-slate-600 items-end">
                <div>Candidate Signature</div>
                <div className="text-center">Class Teacher Signature</div>
                <div className="relative text-right">
                  {sp.stampDataUrl && (
                    <img
                      src={sp.stampDataUrl}
                      alt="Official Seal"
                      referrerPolicy="no-referrer"
                      className="pointer-events-none absolute right-4 -top-10 h-16 w-16 object-contain opacity-75 rotate-[-8deg]"
                    />
                  )}
                  {sp.signatureDataUrl && (
                    <div className="flex justify-end mb-1">
                      <img
                        src={sp.signatureDataUrl}
                        alt="Signature"
                        referrerPolicy="no-referrer"
                        className="h-9 max-w-[130px] object-contain"
                      />
                    </div>
                  )}
                  <p className="font-semibold text-slate-900">
                    {sp.principalName || 'Controller of Examinations'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {sp.authorityDesignation || 'Principal'} / Seal
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 3B. AUTOMATED DYNAMIC STUDENT MARKSHEET */}
        {activePrintDoc.type === 'marksheet' && (() => {
          const ms = activePrintDoc.marksheet;
          const baseStu =
            activePrintDoc.student || db.students.find((s) => s.id === ms.studentId);
          const stu = baseStu ? resolveStudentWithPhoto(baseStu) : undefined;
          const isExecutiveCrest = aiCustomization.marksheetLayout === 'executive-crest';
          const isCbseDetailed = aiCustomization.marksheetLayout === 'cbse-detailed';
          const honoursDivision = ms.passed
            ? ms.percentage >= 75
              ? 'DISTINCTION HONOURS'
              : ms.percentage >= 60
              ? 'FIRST DIVISION'
              : ms.percentage >= 45
              ? 'SECOND DIVISION'
              : 'PASS DIVISION'
            : 'NEEDS IMPROVEMENT';
          const marksheetQrPayload = `${schoolName}|MS:${ms.examCode || ms.examName}|ADM:${ms.admissionId}|PCT:${ms.percentage.toFixed(1)}|RES:${ms.passed ? 'PASS' : 'FAIL'}`;

          return (
            <div className="mt-6">
              <div
                className={
                  isExecutiveCrest
                    ? 'flex items-center justify-between rounded-lg bg-slate-900 px-4 py-2.5 text-white'
                    : 'flex items-baseline justify-between rounded-lg border border-slate-300 bg-slate-100 px-4 py-2.5'
                }
              >
                <h2
                  className={`text-sm font-bold tracking-tight ${
                    isExecutiveCrest ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {isCbseDetailed
                    ? `SCHOLASTIC PERFORMANCE STATEMENT — ${ms.examName.toUpperCase()}`
                    : isExecutiveCrest
                    ? `EXECUTIVE ACADEMIC TRANSCRIPT — ${ms.examName.toUpperCase()}`
                    : `OFFICIAL ACADEMIC MARKSHEET — ${ms.examName.toUpperCase()}`}
                </h2>
                <span
                  className={`font-mono text-xs tabular-nums ${
                    isExecutiveCrest ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  Issued: {formatDateDisplay(ms.updatedAt || getTodayISO())}
                </span>
              </div>

              <div className="mt-5 flex items-start justify-between gap-6">
                <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Student Name</p>
                    <p className="mt-0.5 font-bold text-slate-900">{ms.studentName}</p>
                  </div>
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Roll Number</p>
                    <p className="mt-0.5 font-mono font-bold text-indigo-700 tabular-nums">
                      {ms.rollNumber}
                    </p>
                  </div>
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Admission ID</p>
                    <p className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {ms.admissionId}
                    </p>
                  </div>
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Class &amp; Section</p>
                    <p className="mt-0.5 font-semibold text-slate-900">
                      Class {ms.className} — Section {ms.section}
                    </p>
                  </div>
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Father&apos;s Name</p>
                    <p className="mt-0.5 font-medium text-slate-900">
                      {ms.fatherName || '—'}
                    </p>
                  </div>
                  <div className="border-b border-slate-200 pb-1.5">
                    <p className="text-xs text-slate-500">Date of Birth</p>
                    <p className="mt-0.5 font-mono font-medium text-slate-900 tabular-nums">
                      {formatDateDisplay(ms.dob)}
                    </p>
                  </div>
                </div>

                {stu?.photoDataUrl ? (
                  <img
                    src={stu.photoDataUrl}
                    alt={ms.studentName}
                    referrerPolicy="no-referrer"
                    className="h-32 w-28 rounded-lg border border-slate-300 object-cover shrink-0"
                  />
                ) : (
                  <div className="flex h-32 w-28 flex-col items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-center text-xs text-slate-500 shrink-0">
                    <span className="font-mono text-lg font-bold text-slate-700">
                      {getInitials(ms.studentName)}
                    </span>
                    <span className="mt-1 text-[10px]">Student Photo</span>
                  </div>
                )}
              </div>

              <table className="mt-6 w-full border-collapse border border-slate-300 text-sm">
                <thead>
                  <tr className="bg-slate-100 text-left text-xs font-semibold text-slate-700">
                    <th className="border border-slate-300 px-3 py-2.5 w-14 text-center">S.No</th>
                    <th className="border border-slate-300 px-4 py-2.5">Subject</th>
                    <th className="border border-slate-300 px-3 py-2.5 text-right">Max Marks</th>
                    <th className="border border-slate-300 px-3 py-2.5 text-right">
                      Min Passing
                    </th>
                    <th className="border border-slate-300 px-3 py-2.5 text-right">
                      Marks Obtained
                    </th>
                    <th className="border border-slate-300 px-3 py-2.5 text-center">Grade</th>
                    <th className="border border-slate-300 px-3 py-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ms.subjectMarks.map((sub, idx) => (
                    <tr key={sub.subjectId}>
                      <td className="border border-slate-300 px-3 py-2.5 text-center font-mono text-xs tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="border border-slate-300 px-4 py-2.5 font-medium text-slate-900">
                        {sub.subjectName}
                        {sub.subjectCode ? (
                          <span className="ml-1.5 font-mono text-xs text-slate-500">
                            ({sub.subjectCode})
                          </span>
                        ) : null}
                      </td>
                      <td className="border border-slate-300 px-3 py-2.5 text-right font-mono tabular-nums">
                        {sub.maxMarks}
                      </td>
                      <td className="border border-slate-300 px-3 py-2.5 text-right font-mono tabular-nums">
                        {sub.minMarks}
                      </td>
                      <td
                        className={`border border-slate-300 px-3 py-2.5 text-right font-mono font-bold tabular-nums ${
                          sub.passedSubject ? 'text-slate-900' : 'text-rose-700'
                        }`}
                      >
                        {sub.isAbsent ? 'AB' : sub.marksObtained}
                      </td>
                      <td className="border border-slate-300 px-3 py-2.5 text-center font-mono font-semibold">
                        {sub.subjectGrade}
                      </td>
                      <td
                        className={`border border-slate-300 px-3 py-2.5 text-center text-xs font-bold ${
                          sub.passedSubject ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {sub.passedSubject ? 'PASS' : sub.isAbsent ? 'ABSENT' : 'FAIL'}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold">
                    <td colSpan={2} className="border border-slate-300 px-4 py-3">
                      Grand Total
                    </td>
                    <td className="border border-slate-300 px-3 py-3 text-right font-mono tabular-nums">
                      {ms.totalMaxMarks}
                    </td>
                    <td className="border border-slate-300 px-3 py-3 text-right font-mono tabular-nums">
                      {ms.totalMinMarks}
                    </td>
                    <td className="border border-slate-300 px-3 py-3 text-right font-mono text-base tabular-nums">
                      {ms.totalObtained}
                    </td>
                    <td className="border border-slate-300 px-3 py-3 text-center font-mono">
                      {ms.overallGrade}
                    </td>
                    <td
                      className={`border border-slate-300 px-3 py-3 text-center text-xs ${
                        ms.passed ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {ms.passed ? 'PASSED' : 'FAILED'}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div
                className={`mt-5 grid gap-4 rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm ${
                  aiCustomization.marksheetShowRankBadge ? 'grid-cols-5' : 'grid-cols-4'
                }`}
              >
                <div>
                  <p className="text-xs text-slate-500">Grand Total</p>
                  <p className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums">
                    {ms.totalObtained} / {ms.totalMaxMarks}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Overall Percentage</p>
                  <p className="mt-0.5 font-mono font-bold text-indigo-700 tabular-nums">
                    {ms.percentage.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Overall Grade</p>
                  <p className="mt-0.5 font-mono font-bold text-slate-900">{ms.overallGrade}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Final Result</p>
                  <p
                    className={`mt-0.5 font-bold ${
                      ms.passed ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {ms.passed ? 'PASSED' : 'FAILED'}
                  </p>
                </div>
                {aiCustomization.marksheetShowRankBadge && (
                  <div>
                    <p className="text-xs text-slate-500">Standing / Division</p>
                    <p className="mt-0.5 text-xs font-bold tracking-tight text-slate-900">
                      {honoursDivision}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="text-slate-700">
                    <span className="font-bold text-slate-900">Remarks: </span>
                    {ms.remarks}
                  </p>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Grading Scale: A1 (91–100%) · A2 (81–90%) · B1 (71–80%) · B2 (61–70%) · C1 (51–60%) · C2 (41–50%) · D (Pass–40%) · E (Below Min Passing Marks)
                  </p>
                </div>
                {aiCustomization.marksheetShowQr && (
                  <InlineQrMatrixSvg payload={marksheetQrPayload} size={60} label="Verify Result" />
                )}
              </div>

              <div className="mt-14 grid grid-cols-3 gap-8 border-t border-slate-200 pt-6 text-xs text-slate-600 items-end">
                <div>Class Teacher Signature</div>
                <div className="text-center">Parent / Guardian Signature</div>
                <div className="relative text-right">
                  {sp.stampDataUrl && (
                    <img
                      src={sp.stampDataUrl}
                      alt="Official Seal"
                      referrerPolicy="no-referrer"
                      className="pointer-events-none absolute right-4 -top-10 h-16 w-16 object-contain opacity-75 rotate-[-8deg]"
                    />
                  )}
                  {sp.signatureDataUrl && (
                    <div className="flex justify-end mb-1">
                      <img
                        src={sp.signatureDataUrl}
                        alt="Signature"
                        referrerPolicy="no-referrer"
                        className="h-9 max-w-[130px] object-contain"
                      />
                    </div>
                  )}
                  <p className="font-semibold text-slate-900">
                    {sp.principalName || 'Principal / Head of Institution'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {sp.authorityDesignation || 'Principal'} Signature &amp; Seal
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 3C. LEGACY REPORT CARD COMPATIBILITY */}
        {activePrintDoc.type === 'report-card' && (
          <div className="mt-6">
            <div className="flex items-baseline justify-between border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                STUDENT ACADEMIC REPORT CARD — {activePrintDoc.grade.term.toUpperCase()}
              </h2>
              <span className="font-mono text-xs text-slate-600 tabular-nums">
                Issued: {formatDateDisplay(activePrintDoc.grade.recordedAt)}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-500">Student Name</span>
                <span className="font-semibold text-slate-900">
                  {activePrintDoc.grade.studentName}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-500">Admission ID</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {activePrintDoc.grade.admissionId}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-500">Class &amp; Section</span>
                <span className="font-semibold text-slate-900">
                  Class {activePrintDoc.grade.className} — Sec {activePrintDoc.grade.section}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-500">Father&apos;s Name</span>
                <span className="font-semibold text-slate-900">
                  {activePrintDoc.grade.fatherName || '—'}
                </span>
              </div>
            </div>

            <table className="mt-6 w-full border-collapse border border-slate-300 text-sm">
              <thead>
                <tr className="bg-slate-100 text-left text-xs font-semibold text-slate-700">
                  <th className="border border-slate-300 px-4 py-2.5">Subject</th>
                  <th className="border border-slate-300 px-4 py-2.5 text-right">Max Marks</th>
                  <th className="border border-slate-300 px-4 py-2.5 text-right">Pass Marks</th>
                  <th className="border border-slate-300 px-4 py-2.5 text-right">Marks Obtained</th>
                  <th className="border border-slate-300 px-4 py-2.5 text-center">Grade</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { subject: 'English', score: activePrintDoc.grade.english },
                  { subject: 'Hindi', score: activePrintDoc.grade.hindi },
                  { subject: 'Mathematics', score: activePrintDoc.grade.maths },
                  { subject: 'General Science', score: activePrintDoc.grade.science },
                ].map((row) => (
                  <tr key={row.subject}>
                    <td className="border border-slate-300 px-4 py-2.5 font-medium text-slate-900">
                      {row.subject}
                    </td>
                    <td className="border border-slate-300 px-4 py-2.5 text-right font-mono tabular-nums">
                      100
                    </td>
                    <td className="border border-slate-300 px-4 py-2.5 text-right font-mono tabular-nums">
                      33
                    </td>
                    <td className="border border-slate-300 px-4 py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {row.score}
                    </td>
                    <td className="border border-slate-300 px-4 py-2.5 text-center font-mono font-semibold">
                      {computeLetterGrade(row.score)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold">
                  <td className="border border-slate-300 px-4 py-3">Grand Total</td>
                  <td className="border border-slate-300 px-4 py-3 text-right font-mono tabular-nums">
                    400
                  </td>
                  <td className="border border-slate-300 px-4 py-3 text-right font-mono tabular-nums">
                    132
                  </td>
                  <td className="border border-slate-300 px-4 py-3 text-right font-mono text-base tabular-nums">
                    {activePrintDoc.grade.total}
                  </td>
                  <td className="border border-slate-300 px-4 py-3 text-center font-mono">
                    {computeLetterGrade(activePrintDoc.grade.percentage)}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="mt-5 grid grid-cols-3 gap-4 rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm">
              <div>
                <p className="text-xs text-slate-500">Aggregate Score</p>
                <p className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums">
                  {activePrintDoc.grade.total} / 400
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Overall Percentage</p>
                <p className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums">
                  {activePrintDoc.grade.percentage.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Final Result</p>
                <p
                  className={`mt-0.5 font-bold ${
                    activePrintDoc.grade.passed ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {activePrintDoc.grade.passed ? 'PASSED' : 'FAILED (NEEDS IMPROVEMENT)'}
                </p>
              </div>
            </div>

            <div className="mt-14 grid grid-cols-3 gap-8 border-t border-slate-200 pt-6 text-xs text-slate-600">
              <div>Class Teacher Signature</div>
              <div className="text-center">Parent / Guardian Signature</div>
              <div className="text-right font-semibold text-slate-900">
                {sp.principalName ? `${sp.principalName} (Principal)` : 'Principal Signature'}
              </div>
            </div>
          </div>
        )}

        {/* 4. DAILY ATTENDANCE REGISTER SHEET */}
        {activePrintDoc.type === 'attendance-sheet' && (
          <div className="mt-6">
            <div className="flex items-baseline justify-between border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900">DAILY ATTENDANCE REGISTER SHEET</h2>
              <div className="text-right text-xs text-slate-600">
                <span>Date: </span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatDateDisplay(activePrintDoc.date)}
                </span>
                <span className="mx-2">·</span>
                <span>Class: </span>
                <span className="font-semibold text-slate-900">
                  {activePrintDoc.className} (
                  {activePrintDoc.section === 'ALL'
                    ? 'All Sections'
                    : `Section ${activePrintDoc.section}`}
                  )
                </span>
              </div>
            </div>

            {(() => {
              const total = activePrintDoc.rows.length;
              const present = activePrintDoc.rows.filter((r) => r.status === 'Present').length;
              const absent = activePrintDoc.rows.filter((r) => r.status === 'Absent').length;
              const late = activePrintDoc.rows.filter((r) => r.status === 'Late').length;
              return (
                <div className="mt-4 grid grid-cols-4 gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
                  <div>
                    <span className="text-slate-500">Total Roll: </span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">{total}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Present: </span>
                    <span className="font-mono font-bold text-emerald-700 tabular-nums">
                      {present}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Absent: </span>
                    <span className="font-mono font-bold text-rose-700 tabular-nums">{absent}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Late: </span>
                    <span className="font-mono font-bold text-amber-700 tabular-nums">{late}</span>
                  </div>
                </div>
              );
            })()}

            <table className="mt-5 w-full border-collapse border border-slate-300 text-xs">
              <thead>
                <tr className="bg-slate-100 text-left font-semibold text-slate-700">
                  <th className="border border-slate-300 px-3 py-2 w-12">S.No</th>
                  <th className="border border-slate-300 px-3 py-2 w-28">Admission ID</th>
                  <th className="border border-slate-300 px-3 py-2">Student Name</th>
                  <th className="border border-slate-300 px-3 py-2 w-16 text-center">Sec</th>
                  <th className="border border-slate-300 px-3 py-2 w-24 text-center">Status</th>
                  <th className="border border-slate-300 px-3 py-2">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {activePrintDoc.rows.map((row, index) => (
                  <tr key={row.student.id}>
                    <td className="border border-slate-300 px-3 py-2 font-mono tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 font-mono font-medium text-slate-900 tabular-nums">
                      {row.student.admissionId}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 font-medium text-slate-900">
                      {row.student.name}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-center font-mono">
                      {row.student.section}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-center font-semibold">
                      {row.status}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-slate-600">
                      {row.note || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-12 flex items-end justify-between border-t border-slate-200 pt-5 text-xs text-slate-600">
              <div>Recorded By: {activePrintDoc.markedBy}</div>
              <div className="text-right font-semibold text-slate-900">
                {sp.principalName
                  ? `${sp.principalName} (Principal) / Class Teacher`
                  : 'Class Teacher / Attendance Coordinator Signature'}
              </div>
            </div>
          </div>
        )}

        {/* 5. STUDENT IDENTITY CARD (SINGLE CR80 OR MULTI-CARD A4 PRINT GRID) */}
        {activePrintDoc.type === 'student-id-card' && (
          <div>
            {activePrintDoc.layoutMode === 'single' && activePrintDoc.students[0] ? (
              <div className="mt-6">
                <div className="flex items-baseline justify-between border-b border-slate-200 pb-3">
                  <h2 className="text-base font-bold text-slate-900">
                    OFFICIAL STUDENT IDENTITY CARD (SINGLE CR80 PRINT FORMAT)
                  </h2>
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    Cut Size: 54mm × 86mm
                  </span>
                </div>

                <div className="my-8 flex flex-col items-center justify-center">
                  <div className="rounded-xl border border-dashed border-slate-400 p-4">
                    <IdCardVisual
                      student={resolveStudentWithPhoto(activePrintDoc.students[0])}
                      rollNumber={resolveStudentRollNumber(
                        activePrintDoc.students[0],
                        db.students
                      )}
                      codeStyle={activePrintDoc.codeStyle}
                      compactForPrintGrid={true}
                      schoolProfile={db.schoolProfile}
                    />
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Trim along the outer card border for standard CR80 PVC / lanyard card holders (100% print scale).
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <div className="no-print mb-4 flex items-center justify-between border-b border-slate-200 pb-3 text-xs text-slate-600">
                  <span className="font-bold text-slate-900">
                    {schoolName.toUpperCase()} — MULTI-CARD A4 PRINT GRID (
                    {activePrintDoc.students.length} Cards)
                  </span>
                  <span>Optimized 3-column CR80 sheet layout (54mm × 86mm per card)</span>
                </div>

                <div className="grid grid-cols-1 justify-items-center gap-4 sm:grid-cols-2 md:grid-cols-3 print:grid-cols-3 print:gap-3">
                  {activePrintDoc.students.map((stu) => {
                    const resolvedStu = resolveStudentWithPhoto(stu);
                    return (
                      <div
                        key={stu.id}
                        className="rounded-lg border border-dashed border-slate-300 p-1 break-inside-avoid"
                      >
                        <IdCardVisual
                          student={resolvedStu}
                          rollNumber={resolveStudentRollNumber(resolvedStu, db.students)}
                          codeStyle={activePrintDoc.codeStyle}
                          compactForPrintGrid={true}
                          schoolProfile={db.schoolProfile}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 6. STAFF IDENTITY CARD (SINGLE CR80 OR MULTI-CARD A4 PRINT GRID) */}
        {activePrintDoc.type === 'staff-id-card' && (
          <div>
            {activePrintDoc.layoutMode === 'single' && activePrintDoc.staffMembers[0] ? (
              <div className="mt-6">
                <div className="flex items-baseline justify-between border-b border-slate-200 pb-3">
                  <h2 className="text-base font-bold text-slate-900">
                    OFFICIAL STAFF IDENTITY CARD (SINGLE CR80 PRINT FORMAT)
                  </h2>
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    Cut Size: 54mm × 86mm
                  </span>
                </div>

                <div className="my-8 flex flex-col items-center justify-center">
                  <div className="rounded-xl border border-dashed border-slate-400 p-4">
                    <StaffIdCardVisual
                      staff={resolveStaffWithPhoto(activePrintDoc.staffMembers[0])}
                      codeStyle={activePrintDoc.codeStyle}
                      compactForPrintGrid={true}
                      schoolProfile={db.schoolProfile}
                    />
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Trim along the outer card border for standard CR80 PVC / lanyard card holders (100% print scale).
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <div className="no-print mb-4 flex items-center justify-between border-b border-slate-200 pb-3 text-xs text-slate-600">
                  <span className="font-bold text-slate-900">
                    {schoolName.toUpperCase()} — MULTI-CARD STAFF ID PRINT GRID (
                    {activePrintDoc.staffMembers.length} Cards)
                  </span>
                  <span>Optimized 3-column CR80 sheet layout (54mm × 86mm per card)</span>
                </div>

                <div className="grid grid-cols-1 justify-items-center gap-4 sm:grid-cols-2 md:grid-cols-3 print:grid-cols-3 print:gap-3">
                  {activePrintDoc.staffMembers.map((member) => {
                    const resolvedMember = resolveStaffWithPhoto(member);
                    return (
                      <div
                        key={member.id}
                        className="rounded-lg border border-dashed border-slate-300 p-1 break-inside-avoid"
                      >
                        <StaffIdCardVisual
                          staff={resolvedMember}
                          codeStyle={activePrintDoc.codeStyle}
                          compactForPrintGrid={true}
                          schoolProfile={db.schoolProfile}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Global Platform & Contact Footer Strip on Printable Documents */}
        <PrintableBrandContactStrip position="footer" />
      </div>
    </div>
  );
};
