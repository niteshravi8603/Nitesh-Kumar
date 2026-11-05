import { jsPDF } from 'jspdf';
import {
  AiCustomizationSettings,
  ExamDefinition,
  SchoolProfileSettings,
  StudentExamMarksheet,
  StudentRecord,
} from '../types/erp';
import { formatDateDisplay, getInitials, getSchoolAcronym, getTodayISO } from './formatters';
import {
  DEFAULT_EXAM_INSTRUCTIONS,
  formatExamDayName,
  formatTimeSlot,
  sortExamSubjects,
} from './examEngine';
import { generateVerificationMatrix } from './idCardGenerator';
import { getSyncDataUrlForPdf } from '../services/cloudStorage';
import {
  GLOBAL_APP_TITLE,
  GLOBAL_CONTACT_EMAIL,
  GLOBAL_CONTACT_PHONE,
} from '../components/TopBrandContactBar';

function safeFileSlug(text: string): string {
  return text
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function drawQrMatrixOnPdf(
  doc: jsPDF,
  payload: string,
  x: number,
  y: number,
  sizeMm = 18
): void {
  const matrix = generateVerificationMatrix(payload);
  const cells = matrix.length;
  const pad = 1.2;
  const cellSize = (sizeMm - pad * 2) / cells;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, sizeMm, sizeMm, 1, 1, 'FD');

  doc.setFillColor(15, 23, 42);
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if (matrix[r][c]) {
        doc.rect(
          x + pad + c * cellSize,
          y + pad + r * cellSize,
          cellSize + 0.04,
          cellSize + 0.04,
          'F'
        );
      }
    }
  }
}

function drawSchoolCrestAndHeader(
  doc: jsPDF,
  sessionLabel: string,
  documentBannerTitle: string,
  subBannerRight: string,
  schoolProfile?: SchoolProfileSettings,
  darkExecutiveBanner = false
): number {
  const schoolName = schoolProfile?.schoolName?.trim() || GLOBAL_APP_TITLE;
  const schoolAcronym = getSchoolAcronym(schoolName);
  const taglineOrAddress =
    schoolProfile?.address?.trim() ||
    schoolProfile?.tagline?.trim() ||
    'Recognized Primary & Preparatory Institution';
  const contactParts: string[] = [];
  contactParts.push(`Phone/WhatsApp: ${schoolProfile?.phone?.trim() || GLOBAL_CONTACT_PHONE}`);
  contactParts.push(schoolProfile?.email?.trim() || GLOBAL_CONTACT_EMAIL);
  if (schoolProfile?.directorName?.trim()) {
    contactParts.push(`Director: ${schoolProfile.directorName.trim()}`);
  }
  const secondSubtitle = contactParts.join(' · ');

  // Top Global Branding & Contact Strip above Frame
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(30, 41, 59);
  doc.text(
    `${GLOBAL_APP_TITLE}   |   Phone / WhatsApp: ${GLOBAL_CONTACT_PHONE}   |   Email: ${GLOBAL_CONTACT_EMAIL}`,
    105,
    7.6,
    { align: 'center' }
  );

  // Outer Institutional Double Frame (A4: 210 x 297 mm)
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.6);
  doc.rect(10, 10, 190, 277);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.rect(11.5, 11.5, 187, 274);

  // School Emblem Crest Box (Left)
  let logoRendered = false;
  const resolvedLogo = getSyncDataUrlForPdf(schoolProfile?.logoDataUrl);
  if (resolvedLogo && resolvedLogo.startsWith('data:image/')) {
    try {
      doc.setDrawColor(203, 213, 225);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(16, 16, 16, 16, 2, 2, 'FD');
      const fmt = resolvedLogo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(resolvedLogo, fmt, 16.8, 16.8, 14.4, 14.4);
      logoRendered = true;
    } catch {
      logoRendered = false;
    }
  }

  if (!logoRendered) {
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(16, 16, 16, 16, 2, 2, 'F');
    doc.setDrawColor(255, 255, 255);
    doc.setFillColor(255, 255, 255);
    doc.setLineWidth(0.45);
    doc.triangle(24, 19.2, 18.8, 22, 24, 24.6, 'F');
    doc.triangle(24, 19.2, 29.2, 22, 24, 24.6, 'F');
    doc.line(20.6, 23.8, 20.6, 26.8);
    doc.line(27.4, 23.8, 27.4, 26.8);
    doc.line(20.6, 26.8, 27.4, 26.8);
    doc.line(29.0, 22.1, 29.0, 26.4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(schoolAcronym, 24, 30.3, { align: 'center' });
  }

  // School Title & Subtitle
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(schoolName.toUpperCase().slice(0, 38), 36, 22.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(71, 85, 105);
  doc.text(taglineOrAddress.slice(0, 68), 36, 27.5);
  doc.text(secondSubtitle.slice(0, 72), 36, 31.5);

  // Right Session Metadata
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`Session: ${sessionLabel}`, 194, 22.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(subBannerRight, 194, 27.5, { align: 'right' });
  if (schoolProfile?.affiliationNo?.trim()) {
    doc.setFontSize(7.5);
    doc.text(`Reg/Aff: ${schoolProfile.affiliationNo.trim()}`, 194, 31.5, { align: 'right' });
  }

  // Header Divider
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(16, 35.5, 194, 35.5);

  // Document Title Banner
  if (darkExecutiveBanner) {
    doc.setFillColor(15, 23, 42);
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.25);
    doc.roundedRect(16, 39, 178, 9, 1.2, 1.2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    doc.text(documentBannerTitle, 105, 45, { align: 'center' });
  } else {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.roundedRect(16, 39, 178, 9, 1.2, 1.2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(documentBannerTitle, 105, 45, { align: 'center' });
  }

  return 52;
}

function drawStudentPhotoBox(
  doc: jsPDF,
  photoDataUrl: string | undefined,
  studentName: string,
  x: number,
  y: number,
  w = 28,
  h = 34
): void {
  doc.setDrawColor(148, 163, 184);
  doc.setFillColor(248, 250, 252);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 1.2, 1.2, 'FD');

  let rendered = false;
  const resolvedPhoto = getSyncDataUrlForPdf(photoDataUrl);
  if (resolvedPhoto && resolvedPhoto.startsWith('data:image/')) {
    try {
      const format = resolvedPhoto.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(resolvedPhoto, format, x + 0.8, y + 0.8, w - 1.6, h - 1.6);
      rendered = true;
    } catch {
      rendered = false;
    }
  }

  if (!rendered) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(71, 85, 105);
    doc.text(getInitials(studentName), x + w / 2, y + h / 2 - 1, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('STUDENT PHOTO', x + w / 2, y + h / 2 + 5, { align: 'center' });
  }
}

export function renderAdmitCardPageOnDoc(
  doc: jsPDF,
  exam: ExamDefinition,
  student: StudentRecord,
  rollNumber: string,
  schoolProfile?: SchoolProfileSettings,
  aiCustomization?: AiCustomizationSettings
): void {
  const schoolName = schoolProfile?.schoolName?.trim() || 'RB Public School';
  const principalName = schoolProfile?.principalName?.trim() || '';

  const startY = drawSchoolCrestAndHeader(
    doc,
    exam.academicSession,
    `EXAMINATION ADMIT CARD — ${exam.examName.toUpperCase()}`,
    `Exam Code: ${exam.examCode}`,
    schoolProfile
  );

  drawStudentPhotoBox(doc, student.photoDataUrl, student.name, 166, startY, 28, 35);

  const infoRows: Array<[string, string, string, string]> = [
    ['Candidate Name', student.name, 'Roll Number', rollNumber],
    ['Admission ID', student.admissionId, 'Class & Section', `Class ${student.className} - Sec ${student.section}`],
    ["Father's Name", student.fatherName || '—', 'Date of Birth', formatDateDisplay(student.dob)],
    ["Mother's Name", student.motherName || '—', 'Gender', student.gender],
  ];

  let curY = startY + 2;
  doc.setLineWidth(0.2);
  infoRows.forEach(([lbl1, val1, lbl2, val2]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`${lbl1}:`, 16, curY + 3.5);
    doc.text(`${lbl2}:`, 96, curY + 3.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(15, 23, 42);
    doc.text(String(val1).slice(0, 26), 44, curY + 3.5);
    doc.text(String(val2).slice(0, 22), 124, curY + 3.5);

    doc.setDrawColor(226, 232, 240);
    doc.line(16, curY + 6, 161, curY + 6);
    curY += 8.2;
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Exam Center:', 16, curY + 3.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(15, 23, 42);
  doc.text((exam.examCenter || `${schoolName} — Main Campus`).slice(0, 68), 44, curY + 3.5);
  doc.setDrawColor(226, 232, 240);
  doc.line(16, curY + 6, 194, curY + 6);

  let tableY = curY + 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Subject-Wise Examination Schedule & Timing', 16, tableY);
  tableY += 3.5;

  const cols = [16, 26, 60, 102, 144, 160, 176, 194];
  const headerH = 8;

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.rect(16, tableY, 178, headerH, 'FD');

  for (let i = 1; i < cols.length - 1; i++) {
    doc.line(cols[i], tableY, cols[i], tableY + headerH);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(30, 41, 59);
  doc.text('S.No', 21, tableY + 5.2, { align: 'center' });
  doc.text('Exam Date & Day', 28, tableY + 5.2);
  doc.text('Time Slot', 62, tableY + 5.2);
  doc.text('Subject', 104, tableY + 5.2);
  doc.text('Max', 152, tableY + 5.2, { align: 'center' });
  doc.text('Min', 168, tableY + 5.2, { align: 'center' });
  doc.text('Invigilator', 185, tableY + 5.2, { align: 'center' });

  let rowY = tableY + headerH;
  const sortedSubjects = sortExamSubjects(exam.subjects);
  const rowH = 8.2;

  sortedSubjects.forEach((sub, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(16, rowY, 178, rowH, 'F');
    }
    doc.setDrawColor(203, 213, 225);
    doc.rect(16, rowY, 178, rowH, 'S');
    for (let i = 1; i < cols.length - 1; i++) {
      doc.line(cols[i], rowY, cols[i], rowY + rowH);
    }

    const dayStr = formatExamDayName(sub.examDate);
    const dateLabel = `${formatDateDisplay(sub.examDate)}${dayStr ? ` (${dayStr})` : ''}`;
    const subjectLabel = sub.subjectCode
      ? `${sub.subjectName} (${sub.subjectCode})`
      : sub.subjectName;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(String(idx + 1).padStart(2, '0'), 21, rowY + 5.3, { align: 'center' });
    doc.text(dateLabel.slice(0, 22), 28, rowY + 5.3);
    doc.text(formatTimeSlot(sub.startTime, sub.endTime), 62, rowY + 5.3);
    doc.setFont('helvetica', 'bold');
    doc.text(subjectLabel.slice(0, 25), 104, rowY + 5.3);
    doc.setFont('helvetica', 'normal');
    doc.text(String(sub.maxMarks), 152, rowY + 5.3, { align: 'center' });
    doc.text(String(sub.minMarks), 168, rowY + 5.3, { align: 'center' });

    rowY += rowH;
  });

  const showAdmitQr = Boolean(aiCustomization?.admitCardShowQr);
  const instY = Math.min(rowY + 8, 232);
  const instBoxW = showAdmitQr ? 154 : 178;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(16, instY, instBoxW, 24, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('Important Instructions for Candidates:', 20, instY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const rawInst = (exam.instructions || DEFAULT_EXAM_INSTRUCTIONS).trim();
  const splitInst = doc.splitTextToSize(rawInst, instBoxW - 8).slice(0, 4);
  doc.text(splitInst, 20, instY + 10.5);

  if (showAdmitQr) {
    drawQrMatrixOnPdf(
      doc,
      `ADMIT|${exam.examCode}|${student.admissionId}|${rollNumber}`,
      173,
      instY + 1.5,
      21
    );
  }

  const sigY = 274;
  if (principalName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(51, 65, 85);
    doc.text(principalName.slice(0, 28), 167, sigY - 8.2, { align: 'center' });
  }
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.line(20, sigY - 6, 62, sigY - 6);
  doc.line(84, sigY - 6, 126, sigY - 6);
  doc.line(144, sigY - 6, 190, sigY - 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Candidate Signature', 41, sigY - 1.5, { align: 'center' });
  doc.text('Class Teacher Signature', 105, sigY - 1.5, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Controller of Exams / Principal', 167, sigY - 1.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${GLOBAL_APP_TITLE}  ·  Phone / WhatsApp: ${GLOBAL_CONTACT_PHONE}  ·  Email: ${GLOBAL_CONTACT_EMAIL}`,
    105,
    291.5,
    { align: 'center' }
  );
}

export function downloadAdmitCardPdf(
  exam: ExamDefinition,
  student: StudentRecord,
  rollNumber: string,
  schoolProfile?: SchoolProfileSettings,
  aiCustomization?: AiCustomizationSettings
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  renderAdmitCardPageOnDoc(doc, exam, student, rollNumber, schoolProfile, aiCustomization);
  const acronym = getSchoolAcronym(schoolProfile?.schoolName || GLOBAL_APP_TITLE);
  const filename = `${safeFileSlug(acronym)}_AdmitCard_${student.admissionId}_${safeFileSlug(exam.examName)}.pdf`;
  doc.save(filename);
}

export function downloadClassAdmitCardsPdf(
  exam: ExamDefinition,
  studentsWithRolls: Array<{ student: StudentRecord; rollNumber: string }>,
  schoolProfile?: SchoolProfileSettings,
  aiCustomization?: AiCustomizationSettings
): void {
  if (studentsWithRolls.length === 0) return;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  studentsWithRolls.forEach((item, index) => {
    if (index > 0) {
      doc.addPage('a4', 'portrait');
    }
    renderAdmitCardPageOnDoc(
      doc,
      exam,
      item.student,
      item.rollNumber,
      schoolProfile,
      aiCustomization
    );
  });
  const acronym = getSchoolAcronym(schoolProfile?.schoolName || GLOBAL_APP_TITLE);
  const filename = `${safeFileSlug(acronym)}_Class_${safeFileSlug(exam.className)}_AdmitCards_${safeFileSlug(
    exam.examName
  )}.pdf`;
  doc.save(filename);
}

export function downloadMarksheetPdf(
  marksheet: StudentExamMarksheet,
  student?: StudentRecord,
  schoolProfile?: SchoolProfileSettings,
  aiCustomization?: AiCustomizationSettings
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const principalName = schoolProfile?.principalName?.trim() || '';
  const directorName = schoolProfile?.directorName?.trim() || '';
  const authorityDesignation = schoolProfile?.authorityDesignation?.trim() || 'Principal';
  const layoutStyle = aiCustomization?.marksheetLayout || 'standard';
  const bannerLabel =
    layoutStyle === 'cbse-detailed'
      ? `SCHOLASTIC PERFORMANCE STATEMENT — ${marksheet.examName.toUpperCase()}`
      : layoutStyle === 'executive-crest'
      ? `EXECUTIVE ACADEMIC TRANSCRIPT — ${marksheet.examName.toUpperCase()}`
      : `OFFICIAL ACADEMIC MARKSHEET — ${marksheet.examName.toUpperCase()}`;

  const startY = drawSchoolCrestAndHeader(
    doc,
    marksheet.academicSession,
    bannerLabel,
    `Issued: ${formatDateDisplay(marksheet.updatedAt || getTodayISO())}`,
    schoolProfile,
    layoutStyle === 'executive-crest'
  );

  drawStudentPhotoBox(doc, student?.photoDataUrl, marksheet.studentName, 166, startY, 28, 35);

  const infoRows: Array<[string, string, string, string]> = [
    ['Student Name', marksheet.studentName, 'Roll Number', marksheet.rollNumber],
    [
      'Admission ID',
      marksheet.admissionId,
      'Class & Section',
      `Class ${marksheet.className} - Sec ${marksheet.section}`,
    ],
    ["Father's Name", marksheet.fatherName || '—', 'Date of Birth', formatDateDisplay(marksheet.dob)],
    ["Mother's Name", marksheet.motherName || '—', 'Exam Code', marksheet.examCode || '—'],
  ];

  let curY = startY + 2;
  doc.setLineWidth(0.2);
  infoRows.forEach(([lbl1, val1, lbl2, val2]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`${lbl1}:`, 16, curY + 3.5);
    doc.text(`${lbl2}:`, 96, curY + 3.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(15, 23, 42);
    doc.text(String(val1).slice(0, 26), 44, curY + 3.5);
    doc.text(String(val2).slice(0, 22), 124, curY + 3.5);

    doc.setDrawColor(226, 232, 240);
    doc.line(16, curY + 6, 161, curY + 6);
    curY += 8.2;
  });

  let tableY = curY + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Subject-Wise Statement of Marks', 16, tableY);
  tableY += 3.5;

  const cols = [16, 27, 95, 118, 141, 164, 178, 194];
  const headerH = 8.5;

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.rect(16, tableY, 178, headerH, 'FD');
  for (let i = 1; i < cols.length - 1; i++) {
    doc.line(cols[i], tableY, cols[i], tableY + headerH);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(30, 41, 59);
  doc.text('S.No', 21.5, tableY + 5.5, { align: 'center' });
  doc.text('Subject Name', 30, tableY + 5.5);
  doc.text('Max Marks', 106.5, tableY + 5.5, { align: 'center' });
  doc.text('Min Marks', 129.5, tableY + 5.5, { align: 'center' });
  doc.text('Obtained', 152.5, tableY + 5.5, { align: 'center' });
  doc.text('Grade', 171, tableY + 5.5, { align: 'center' });
  doc.text('Result', 186, tableY + 5.5, { align: 'center' });

  let rowY = tableY + headerH;
  const rowH = 8.2;

  marksheet.subjectMarks.forEach((sub, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(16, rowY, 178, rowH, 'F');
    }
    doc.setDrawColor(203, 213, 225);
    doc.rect(16, rowY, 178, rowH, 'S');
    for (let i = 1; i < cols.length - 1; i++) {
      doc.line(cols[i], rowY, cols[i], rowY + rowH);
    }

    const subjTitle = sub.subjectCode
      ? `${sub.subjectName} (${sub.subjectCode})`
      : sub.subjectName;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(15, 23, 42);
    doc.text(String(idx + 1).padStart(2, '0'), 21.5, rowY + 5.4, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(subjTitle.slice(0, 38), 30, rowY + 5.4);
    doc.setFont('helvetica', 'normal');
    doc.text(String(sub.maxMarks), 106.5, rowY + 5.4, { align: 'center' });
    doc.text(String(sub.minMarks), 129.5, rowY + 5.4, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    if (!sub.passedSubject) {
      doc.setTextColor(190, 18, 60);
    } else {
      doc.setTextColor(15, 23, 42);
    }
    doc.text(sub.isAbsent ? 'AB' : String(sub.marksObtained), 152.5, rowY + 5.4, {
      align: 'center',
    });
    doc.text(sub.subjectGrade, 171, rowY + 5.4, { align: 'center' });

    if (sub.passedSubject) {
      doc.setTextColor(4, 120, 87);
      doc.text('PASS', 186, rowY + 5.4, { align: 'center' });
    } else {
      doc.setTextColor(190, 18, 60);
      doc.text(sub.isAbsent ? 'ABSENT' : 'FAIL', 186, rowY + 5.4, { align: 'center' });
    }

    rowY += rowH;
  });

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(148, 163, 184);
  doc.rect(16, rowY, 178, 9, 'FD');
  for (let i = 2; i < cols.length - 1; i++) {
    doc.line(cols[i], rowY, cols[i], rowY + 9);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(15, 23, 42);
  doc.text('GRAND TOTAL', 30, rowY + 5.8);
  doc.text(String(marksheet.totalMaxMarks), 106.5, rowY + 5.8, { align: 'center' });
  doc.text(String(marksheet.totalMinMarks), 129.5, rowY + 5.8, { align: 'center' });
  doc.text(String(marksheet.totalObtained), 152.5, rowY + 5.8, { align: 'center' });
  doc.text(marksheet.overallGrade, 171, rowY + 5.8, { align: 'center' });

  if (marksheet.passed) {
    doc.setTextColor(4, 120, 87);
    doc.text('PASSED', 186, rowY + 5.8, { align: 'center' });
  } else {
    doc.setTextColor(190, 18, 60);
    doc.text('FAILED', 186, rowY + 5.8, { align: 'center' });
  }

  const sumY = rowY + 14;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(16, sumY, 178, 17, 1.2, 1.2, 'FD');
  doc.line(60.5, sumY, 60.5, sumY + 17);
  doc.line(105, sumY, 105, sumY + 17);
  doc.line(149.5, sumY, 149.5, sumY + 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Aggregate Marks', 38.2, sumY + 5.5, { align: 'center' });
  doc.text('Overall Percentage', 82.7, sumY + 5.5, { align: 'center' });
  doc.text('Overall Grade', 127.2, sumY + 5.5, { align: 'center' });
  doc.text('Final Result Status', 171.7, sumY + 5.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`${marksheet.totalObtained} / ${marksheet.totalMaxMarks}`, 38.2, sumY + 12.8, {
    align: 'center',
  });
  doc.text(`${marksheet.percentage.toFixed(2)}%`, 82.7, sumY + 12.8, { align: 'center' });
  doc.text(marksheet.overallGrade, 127.2, sumY + 12.8, { align: 'center' });

  if (marksheet.passed) {
    doc.setTextColor(4, 120, 87);
    doc.text('PASSED', 171.7, sumY + 12.8, { align: 'center' });
  } else {
    doc.setTextColor(190, 18, 60);
    doc.text('FAILED', 171.7, sumY + 12.8, { align: 'center' });
  }

  const showMsQr = Boolean(aiCustomization?.marksheetShowQr);
  const showRankBadge = Boolean(aiCustomization?.marksheetShowRankBadge);
  const standingLabel = !marksheet.passed
    ? 'NEEDS IMPROVEMENT'
    : marksheet.percentage >= 75
    ? 'DISTINCTION HONOURS'
    : marksheet.percentage >= 60
    ? 'FIRST DIVISION'
    : 'SECOND DIVISION';

  const remY = sumY + 22;
  const remBoxW = showMsQr ? 154 : 178;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(16, remY, remBoxW, 18, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('Academic Remarks:', 20, remY + 5.8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  const remarksLine = showRankBadge
    ? `[${standingLabel}] ${marksheet.remarks || '—'}`
    : marksheet.remarks || '—';
  const splitRemarks = doc.splitTextToSize(remarksLine, remBoxW - 35).slice(0, 2);
  doc.text(splitRemarks, 49, remY + 5.8);

  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Grading Key: A1 (91-100%) · A2 (81-90%) · B1 (71-80%) · B2 (61-70%) · C1 (51-60%) · C2 (41-50%) · D (Pass-40%) · E (Below Min)',
    16 + remBoxW / 2,
    remY + 15,
    { align: 'center' }
  );

  if (showMsQr) {
    drawQrMatrixOnPdf(
      doc,
      `RESULT|${marksheet.admissionId}|${marksheet.examCode}|${marksheet.percentage.toFixed(1)}%`,
      174,
      remY - 1,
      20
    );
  }

  const sigY = 274;
  if (directorName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(directorName.slice(0, 26), 105, sigY - 8.2, { align: 'center' });
  }
  if (principalName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(51, 65, 85);
    doc.text(principalName.slice(0, 28), 167, sigY - 8.2, { align: 'center' });
  }
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.line(20, sigY - 6, 62, sigY - 6);
  doc.line(84, sigY - 6, 126, sigY - 6);
  doc.line(144, sigY - 6, 190, sigY - 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Class Teacher Signature', 41, sigY - 1.5, { align: 'center' });
  doc.text(directorName ? 'Director / Guardian Sign' : 'Parent / Guardian Signature', 105, sigY - 1.5, {
    align: 'center',
  });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${authorityDesignation} Signature & Seal`, 167, sigY - 1.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${GLOBAL_APP_TITLE}  ·  Phone / WhatsApp: ${GLOBAL_CONTACT_PHONE}  ·  Email: ${GLOBAL_CONTACT_EMAIL}`,
    105,
    291.5,
    { align: 'center' }
  );

  const acronym = getSchoolAcronym(schoolProfile?.schoolName || GLOBAL_APP_TITLE);
  const filename = `${safeFileSlug(acronym)}_Marksheet_${marksheet.admissionId}_${safeFileSlug(marksheet.examName)}.pdf`;
  doc.save(filename);
}
