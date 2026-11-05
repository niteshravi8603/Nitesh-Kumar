import {
  ExamDefinition,
  ExamSubjectSchedule,
  StudentExamMarksheet,
  StudentRecord,
  SubjectMarkEntry,
} from '../types/erp';

export const EXAM_NAME_PRESETS: string[] = [
  'Unit Test I',
  'Half-Yearly Examination',
  'Unit Test II',
  'Annual Final Examination',
];

export interface SubjectPreset {
  name: string;
  code: string;
  defaultMax: number;
  defaultMin: number;
}

export const COMMON_SUBJECT_PRESETS: SubjectPreset[] = [
  { name: 'English', code: 'ENG', defaultMax: 100, defaultMin: 33 },
  { name: 'Hindi', code: 'HIN', defaultMax: 100, defaultMin: 33 },
  { name: 'Mathematics', code: 'MTH', defaultMax: 100, defaultMin: 33 },
  { name: 'EVS / General Science', code: 'SCI', defaultMax: 100, defaultMin: 33 },
  { name: 'Social Studies', code: 'SST', defaultMax: 100, defaultMin: 33 },
  { name: 'Computer Science', code: 'CMP', defaultMax: 50, defaultMin: 17 },
  { name: 'General Knowledge', code: 'GK', defaultMax: 50, defaultMin: 17 },
  { name: 'Drawing & Art', code: 'ART', defaultMax: 50, defaultMin: 17 },
];

export const DEFAULT_EXAM_INSTRUCTIONS =
  '1. Candidates must carry this Admit Card to the examination hall on all exam days.\n' +
  '2. Report to the allotted examination room at least 20 minutes prior to the scheduled start time.\n' +
  '3. Electronic gadgets, calculators, and unauthorized study material are strictly prohibited.';

export function formatTime12h(time24: string): string {
  if (!time24 || !time24.includes(':')) return time24 || '—';
  const [hStr, mStr] = time24.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatTimeSlot(startTime: string, endTime: string): string {
  const start = formatTime12h(startTime);
  const end = formatTime12h(endTime);
  if (start === '—' && end === '—') return '—';
  if (end === '—') return start;
  return `${start} – ${end}`;
}

export function formatExamDayName(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('T')[0].split('-');
  if (parts.length !== 3) return '';
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(d);
}

export function sortExamSubjects(subjects: ExamSubjectSchedule[]): ExamSubjectSchedule[] {
  return [...subjects].sort((a, b) => {
    const dateCmp = (a.examDate || '').localeCompare(b.examDate || '');
    if (dateCmp !== 0) return dateCmp;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });
}

export function resolveStudentRollNumber(
  student: StudentRecord,
  allStudents: StudentRecord[]
): string {
  if (student.rollNumber && student.rollNumber.trim()) {
    return student.rollNumber.trim();
  }
  const peers = allStudents
    .filter(
      (s) =>
        s.className === student.className &&
        s.section === student.section &&
        (student.status === 'Deactive' || s.status !== 'Deactive')
    )
    .sort((a, b) => a.admissionId.localeCompare(b.admissionId, undefined, { numeric: true }));

  const index = peers.findIndex((s) => s.id === student.id);
  const seq = index >= 0 ? index + 1 : 1;
  return `${student.section}-${String(seq).padStart(2, '0')}`;
}

export function computeSubjectGradeLetter(
  marksObtained: number,
  maxMarks: number,
  passedSubject: boolean,
  isAbsent = false
): string {
  if (isAbsent) return 'AB';
  if (!passedSubject) return 'E';
  const pct = maxMarks > 0 ? (marksObtained / maxMarks) * 100 : 0;
  if (pct >= 91) return 'A1';
  if (pct >= 81) return 'A2';
  if (pct >= 71) return 'B1';
  if (pct >= 61) return 'B2';
  if (pct >= 51) return 'C1';
  if (pct >= 41) return 'C2';
  return 'D';
}

export function computeExamGradeLetter(percentage: number, passed: boolean): string {
  if (!passed) return 'E';
  if (percentage >= 91) return 'A1';
  if (percentage >= 81) return 'A2';
  if (percentage >= 71) return 'B1';
  if (percentage >= 61) return 'B2';
  if (percentage >= 51) return 'C1';
  if (percentage >= 41) return 'C2';
  return 'D';
}

export function computeAutomatedRemarks(
  percentage: number,
  passed: boolean,
  failedSubjectCount: number
): string {
  if (!passed) {
    return failedSubjectCount === 1
      ? 'Needs Improvement — Minimum passing marks not achieved in 1 subject.'
      : `Needs Improvement — Minimum passing marks not achieved in ${failedSubjectCount} subjects.`;
  }
  if (percentage >= 90) {
    return 'Outstanding Performance — Exemplary command across all subjects.';
  }
  if (percentage >= 75) {
    return 'Distinction — Consistently strong academic achievement.';
  }
  if (percentage >= 60) {
    return 'First Division — Commendable progress and conceptual clarity.';
  }
  if (percentage >= 45) {
    return 'Second Division — Satisfactory performance with scope for higher scores.';
  }
  return 'Passed — Regular revision and practice advised for next term.';
}

export interface RawSubjectMarkInput {
  marksObtained: number;
  isAbsent?: boolean;
}

export function buildValidatedMarksheet(params: {
  existingId?: string;
  exam: ExamDefinition;
  student: StudentRecord;
  rollNumber: string;
  scoresBySubjectId: Record<string, RawSubjectMarkInput>;
  customRemarks?: string;
}): { ok: boolean; marksheet?: StudentExamMarksheet; error?: string } {
  const { existingId, exam, student, rollNumber, scoresBySubjectId, customRemarks } = params;

  if (exam.subjects.length === 0) {
    return { ok: false, error: 'Exam has no mapped subjects.' };
  }

  const orderedSubjects = sortExamSubjects(exam.subjects);
  const subjectMarks: SubjectMarkEntry[] = [];
  let totalMaxMarks = 0;
  let totalMinMarks = 0;
  let totalObtained = 0;
  let failedCount = 0;

  for (const sub of orderedSubjects) {
    const entry = scoresBySubjectId[sub.id];
    if (!entry) {
      return {
        ok: false,
        error: `Missing marks entry for ${sub.subjectName} (${student.name}).`,
      };
    }

    const isAbsent = Boolean(entry.isAbsent);
    const numericMarks = isAbsent ? 0 : Number(entry.marksObtained);

    if (!Number.isFinite(numericMarks) || numericMarks < 0) {
      return {
        ok: false,
        error: `${sub.subjectName} marks for ${student.name} cannot be negative.`,
      };
    }

    if (numericMarks > sub.maxMarks) {
      return {
        ok: false,
        error: `${sub.subjectName} marks (${numericMarks}) for ${student.name} cannot exceed Maximum Marks (${sub.maxMarks}).`,
      };
    }

    const roundedMarks = Math.round(numericMarks * 100) / 100;
    const passedSubject = !isAbsent && roundedMarks >= sub.minMarks;
    if (!passedSubject) {
      failedCount += 1;
    }

    const subjectGrade = computeSubjectGradeLetter(
      roundedMarks,
      sub.maxMarks,
      passedSubject,
      isAbsent
    );

    subjectMarks.push({
      subjectId: sub.id,
      subjectName: sub.subjectName,
      subjectCode: sub.subjectCode,
      maxMarks: sub.maxMarks,
      minMarks: sub.minMarks,
      marksObtained: roundedMarks,
      isAbsent,
      passedSubject,
      subjectGrade,
    });

    totalMaxMarks += sub.maxMarks;
    totalMinMarks += sub.minMarks;
    totalObtained += roundedMarks;
  }

  const percentage =
    totalMaxMarks > 0 ? Number(((totalObtained / totalMaxMarks) * 100).toFixed(2)) : 0;
  const passed = failedCount === 0 && subjectMarks.length > 0;
  const overallGrade = computeExamGradeLetter(percentage, passed);
  const cleanCustomRemarks = customRemarks?.trim() || '';
  const remarks =
    cleanCustomRemarks || computeAutomatedRemarks(percentage, passed, failedCount);

  const marksheet: StudentExamMarksheet = {
    id:
      existingId ||
      `mks-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    examId: exam.id,
    examCode: exam.examCode,
    examName: exam.examName,
    academicSession: exam.academicSession,
    studentId: student.id,
    admissionId: student.admissionId,
    rollNumber,
    studentName: student.name,
    className: student.className,
    section: student.section,
    fatherName: student.fatherName,
    motherName: student.motherName,
    dob: student.dob,
    subjectMarks,
    totalMaxMarks,
    totalMinMarks,
    totalObtained: Math.round(totalObtained * 100) / 100,
    percentage,
    overallGrade,
    passed,
    remarks,
    customRemarks: cleanCustomRemarks,
    updatedAt: new Date().toISOString(),
  };

  return { ok: true, marksheet };
}
