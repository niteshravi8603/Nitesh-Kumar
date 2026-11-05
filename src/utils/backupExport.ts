import * as XLSX from 'xlsx';
import { SchoolDatabase } from '../types/erp';
import { getTodayISO } from './formatters';

function setAutoColWidths(ws: XLSX.WorkSheet, rows: Record<string, unknown>[]): void {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  ws['!cols'] = headers.map((header) => {
    let maxLen = header.length;
    for (let i = 0; i < Math.min(rows.length, 250); i++) {
      const val = rows[i][header];
      const str = val !== undefined && val !== null ? String(val) : '';
      if (str.length > maxLen) {
        maxLen = Math.min(str.length, 48);
      }
    }
    return { wch: Math.max(12, maxLen + 3) };
  });
}

function appendSheetFromRows(
  wb: XLSX.WorkBook,
  sheetName: string,
  rows: Record<string, unknown>[],
  emptyPlaceholderHeader: string[]
): void {
  const ws =
    rows.length > 0
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.aoa_to_sheet([emptyPlaceholderHeader]);
  if (rows.length > 0) {
    setAutoColWidths(ws, rows);
  } else {
    ws['!cols'] = emptyPlaceholderHeader.map((h) => ({ wch: Math.max(14, h.length + 4) }));
  }
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
}

export function downloadFullBackupJson(jsonPayload: string, schoolSlug = 'rb-public-school'): void {
  const blob = new Blob([jsonPayload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${schoolSlug}-cloud-backup-${getTodayISO()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates and downloads a multi-sheet Excel (.xlsx) workbook containing all school collections:
 * School Summary, Students, Staff Profiles, Fee Receipts, Fee Schedules, Exam Schedules,
 * Marksheets, Term Grades, Attendance Registers, Transport Routes, and Notices/Sessions.
 */
export function downloadFullBackupExcel(
  db: SchoolDatabase,
  authorizedEmails: string[],
  exportedBy: string | null,
  cloudMediaUrls?: {
    studentPhotoUrls?: Record<string, string>;
    staffPhotoUrls?: Record<string, string>;
    schoolLogoUrl?: string;
  }
): string {
  const wb = XLSX.utils.book_new();
  const schoolName = db.schoolProfile?.schoolName || 'RB PUBLIC SCHOOL';
  const exportedIso = new Date().toISOString();

  // 1. School Summary & Cloud Config
  const summaryRows = [
    { Field: 'Official School Name', Value: schoolName },
    { Field: 'Tagline', Value: db.schoolProfile.tagline || '' },
    { Field: 'Affiliation / Reg No.', Value: db.schoolProfile.affiliationNo || '' },
    { Field: 'Director Name', Value: db.schoolProfile.directorName || '' },
    { Field: 'Principal Name', Value: db.schoolProfile.principalName || '' },
    { Field: 'Address', Value: db.schoolProfile.address || '' },
    { Field: 'Primary Phone', Value: db.schoolProfile.phone || '' },
    { Field: 'Official Email', Value: db.schoolProfile.email || '' },
    { Field: 'Website', Value: db.schoolProfile.website || '' },
    { Field: 'Active Academic Session', Value: db.activeSession },
    { Field: 'Billing Cutoff Month', Value: db.billingCutoffMonth },
    {
      Field: 'School Logo Cloud URL',
      Value:
        cloudMediaUrls?.schoolLogoUrl ||
        (db.schoolProfile.logoDataUrl?.startsWith('http') ? db.schoolProfile.logoDataUrl : db.schoolProfile.logoDataUrl ? 'Stored in Cloud Media' : ''),
    },
    { Field: 'Authorized Staff Emails', Value: authorizedEmails.join(', ') },
    { Field: 'Total Students', Value: db.students.length },
    { Field: 'Total Staff Profiles', Value: db.staff.length },
    { Field: 'Total Fee Receipts', Value: db.fees.length },
    { Field: 'Total Exam Schedules', Value: db.exams.length },
    { Field: 'Total Exam Marksheets', Value: db.marksheets.length },
    { Field: 'Backup Exported By', Value: exportedBy || 'Administrator' },
    { Field: 'Backup Timestamp (ISO)', Value: exportedIso },
  ];
  appendSheetFromRows(wb, 'School_Summary', summaryRows, ['Field', 'Value']);

  // 2. Students Directory
  const studentRows = db.students.map((s) => ({
    'Admission ID': s.admissionId,
    'Student Name': s.name,
    Status: s.status,
    'Academic Session': s.academicSession,
    Class: s.className,
    Section: s.section,
    'Roll No': s.rollNumber || 'Auto',
    Gender: s.gender,
    Category: s.casteCategory,
    'Date of Birth': s.dob,
    'Admission Date': s.admissionDate,
    'Admission Type': s.admissionType,
    'Admission Fee (INR)': s.admissionFee,
    'Monthly Tuition Fee (INR)': s.monthlyTuitionFee,
    "Father's Name": s.fatherName,
    "Mother's Name": s.motherName,
    'Primary Mobile': s.phone,
    'Alternate Mobile': s.alternatePhone,
    Address: s.address,
    'Aadhaar Number': s.aadhaarNumber,
    'Transport Enabled': s.transportEnabled ? 'Yes' : 'No',
    'Transport Fee (INR)': s.transportFee,
    'Previous School': s.previousSchool,
    'Photo Cloud URL':
      cloudMediaUrls?.studentPhotoUrls?.[s.id] ||
      (s.photoDataUrl?.startsWith('http') ? s.photoDataUrl : s.photoDataUrl ? 'Stored in Cloud Media' : ''),
    Notes: s.customNotes,
  }));
  appendSheetFromRows(wb, 'Students', studentRows, [
    'Admission ID',
    'Student Name',
    'Status',
    'Academic Session',
    'Class',
    'Section',
    "Father's Name",
    'Primary Mobile',
  ]);

  // 3. Staff & Faculty Profiles
  const staffRows = db.staff.map((m) => ({
    'Staff ID': m.staffId,
    'Full Name': m.fullName,
    'Designation / Post': m.designation,
    'Assigned Dept / Classes': m.assignedDepartment,
    "Father's / Spouse Name": m.fatherOrSpouseName,
    Qualification: m.qualification,
    'Monthly Salary (INR)': m.monthlySalary,
    'Mobile Number': m.phone,
    'Emergency Contact': m.emergencyContact,
    'Joined Date': m.joinedDate,
    Address: m.address,
    'Photo Cloud URL':
      cloudMediaUrls?.staffPhotoUrls?.[m.id] ||
      (m.photoDataUrl?.startsWith('http') ? m.photoDataUrl : m.photoDataUrl ? 'Stored in Cloud Media' : ''),
  }));
  appendSheetFromRows(wb, 'Staff_Profiles', staffRows, [
    'Staff ID',
    'Full Name',
    'Designation / Post',
    'Assigned Dept / Classes',
    'Mobile Number',
    'Joined Date',
  ]);

  // 4. Fee Receipts Ledger
  const feeRows = db.fees.map((f) => ({
    'Receipt No': f.receiptNo,
    Date: f.date,
    'Admission ID': f.admissionId,
    'Student Name': f.studentName,
    Class: f.className,
    Section: f.section,
    "Father's Name": f.fatherName,
    Category: f.category,
    'Fee Month': f.feeMonth,
    'Payment Mode': f.paymentMode,
    'Amount (INR)': f.amount,
    Remarks: f.remarks || '',
  }));
  appendSheetFromRows(wb, 'Fee_Receipts', feeRows, [
    'Receipt No',
    'Date',
    'Admission ID',
    'Student Name',
    'Category',
    'Fee Month',
    'Payment Mode',
    'Amount (INR)',
  ]);

  // 5. Class-Session Fee Schedules
  const scheduleRows = db.feeSchedules.map((fs) => ({
    'Academic Session': fs.academicSession,
    Class: fs.className,
    'Admission Fee (INR)': fs.admissionFee,
    'Monthly Tuition Fee (INR)': fs.monthlyTuitionFee,
    'Annual Exam Fee (INR)': fs.annualExamFee,
  }));
  appendSheetFromRows(wb, 'Fee_Schedules', scheduleRows, [
    'Academic Session',
    'Class',
    'Admission Fee (INR)',
    'Monthly Tuition Fee (INR)',
    'Annual Exam Fee (INR)',
  ]);

  // 6. Exam Schedules (Subject-wise Flattened Timetable)
  const examRows: Record<string, unknown>[] = [];
  db.exams.forEach((ex) => {
    if (!ex.subjects || ex.subjects.length === 0) {
      examRows.push({
        'Exam Code': ex.examCode,
        'Exam Name': ex.examName,
        'Academic Session': ex.academicSession,
        Class: ex.className,
        'Subject Name': '—',
        'Subject Code': '—',
        'Max Marks': 0,
        'Min Passing Marks': 0,
        'Exam Date': '',
        'Start Time': '',
        'End Time': '',
        'Exam Center': ex.examCenter,
      });
    } else {
      ex.subjects.forEach((sub) => {
        examRows.push({
          'Exam Code': ex.examCode,
          'Exam Name': ex.examName,
          'Academic Session': ex.academicSession,
          Class: ex.className,
          'Subject Name': sub.subjectName,
          'Subject Code': sub.subjectCode,
          'Max Marks': sub.maxMarks,
          'Min Passing Marks': sub.minMarks,
          'Exam Date': sub.examDate,
          'Start Time': sub.startTime,
          'End Time': sub.endTime,
          'Exam Center': ex.examCenter,
        });
      });
    }
  });
  appendSheetFromRows(wb, 'Exam_Schedules', examRows, [
    'Exam Code',
    'Exam Name',
    'Academic Session',
    'Class',
    'Subject Name',
    'Max Marks',
    'Min Passing Marks',
    'Exam Date',
  ]);

  // 7. Student Exam Marksheets
  const marksheetRows = db.marksheets.map((m) => ({
    'Exam Code': m.examCode,
    'Exam Name': m.examName,
    'Academic Session': m.academicSession,
    'Admission ID': m.admissionId,
    'Roll Number': m.rollNumber,
    'Student Name': m.studentName,
    Class: m.className,
    Section: m.section,
    'Subject Breakdown': m.subjectMarks
      .map((sm) => `${sm.subjectName}: ${sm.isAbsent ? 'AB' : sm.marksObtained}/${sm.maxMarks}`)
      .join(' | '),
    'Total Obtained': m.totalObtained,
    'Total Max Marks': m.totalMaxMarks,
    'Percentage (%)': m.percentage,
    'Overall Grade': m.overallGrade,
    Result: m.passed ? 'PASSED' : 'FAILED',
    Remarks: m.remarks,
    'Updated At': m.updatedAt,
  }));
  appendSheetFromRows(wb, 'Exam_Marksheets', marksheetRows, [
    'Exam Code',
    'Exam Name',
    'Admission ID',
    'Student Name',
    'Class',
    'Total Obtained',
    'Total Max Marks',
    'Percentage (%)',
    'Result',
  ]);

  // 8. Term Grades
  const gradeRows = db.grades.map((g) => ({
    'Admission ID': g.admissionId,
    'Student Name': g.studentName,
    Class: g.className,
    Section: g.section,
    Term: g.term,
    English: g.english,
    Hindi: g.hindi,
    Maths: g.maths,
    Science: g.science,
    'Total (/400)': g.total,
    'Percentage (%)': g.percentage,
    Result: g.passed ? 'PASSED' : 'FAILED',
    'Recorded At': g.recordedAt,
  }));
  appendSheetFromRows(wb, 'Term_Grades', gradeRows, [
    'Admission ID',
    'Student Name',
    'Class',
    'Term',
    'Total (/400)',
    'Percentage (%)',
    'Result',
  ]);

  // 9. Daily Attendance Registers
  const attendanceRows = Object.values(db.attendance || {}).map((sheet) => {
    const statuses = Object.values(sheet.entries || {});
    const presentCount = statuses.filter((st) => st === 'Present').length;
    const absentCount = statuses.filter((st) => st === 'Absent').length;
    const lateCount = statuses.filter((st) => st === 'Late').length;
    return {
      Date: sheet.date,
      Class: sheet.className,
      Section: sheet.section,
      'Total Marked': statuses.length,
      Present: presentCount,
      Absent: absentCount,
      Late: lateCount,
      'Marked By': sheet.markedBy,
      'Updated At': sheet.updatedAt,
    };
  });
  appendSheetFromRows(wb, 'Attendance', attendanceRows, [
    'Date',
    'Class',
    'Section',
    'Total Marked',
    'Present',
    'Absent',
    'Late',
    'Marked By',
  ]);

  // 10. Transport Routes
  const routeRows = db.routes.map((r) => ({
    'Route Name': r.routeName,
    'Bus Number': r.busNumber,
    'Monthly Fare (INR)': r.monthlyFare,
    'Driver Name': r.driverName,
    'Driver Phone': r.driverPhone,
    'Pickup Points': r.pickupPoints,
  }));
  appendSheetFromRows(wb, 'Transport_Routes', routeRows, [
    'Route Name',
    'Bus Number',
    'Monthly Fare (INR)',
    'Driver Name',
    'Driver Phone',
  ]);

  // 11. Sessions, Classes & Notices
  const metaRows: Record<string, unknown>[] = [
    ...db.sessions.map((s) => ({
      RecordType: 'Academic Session',
      TitleOrName: s.name,
      Details: `${s.startMonth} to ${s.endMonth}`,
      StatusOrCategory: s.isActive ? 'ACTIVE' : 'Inactive',
      CreatedAt: s.createdAt,
    })),
    ...db.classes.map((c) => ({
      RecordType: 'Class Allocation',
      TitleOrName: `Class ${c.className}`,
      Details: `Sections: ${c.sections.join(', ')} (Cap: ${c.sectionCapacity}/sec)`,
      StatusOrCategory: c.isDefault ? 'Default' : 'Custom',
      CreatedAt: '',
    })),
    ...db.notices.map((n) => ({
      RecordType: 'Notice Board',
      TitleOrName: n.title,
      Details: n.body,
      StatusOrCategory: n.category,
      CreatedAt: n.createdAt,
    })),
  ];
  appendSheetFromRows(wb, 'Sessions_Classes_Notices', metaRows, [
    'RecordType',
    'TitleOrName',
    'Details',
    'StatusOrCategory',
    'CreatedAt',
  ]);

  const slug =
    schoolName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'rb-public-school';
  const filename = `${slug}-full-backup-${getTodayISO()}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}
