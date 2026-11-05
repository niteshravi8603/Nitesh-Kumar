import {
  ClassSessionFeeRate,
  FeeMonth,
  FeeRecord,
  StudentDueSummary,
  StudentRecord,
} from '../types/erp';
import { ACADEMIC_SESSIONS, CALENDAR_MONTHS, FEE_MONTHS } from './formatters';

const BASE_CLASS_FEES: Record<
  string,
  { admissionFee: number; monthlyTuitionFee: number; annualExamFee: number }
> = {
  'Pre-Nursery': { admissionFee: 1400, monthlyTuitionFee: 750, annualExamFee: 350 },
  Nursery: { admissionFee: 1500, monthlyTuitionFee: 800, annualExamFee: 400 },
  LKG: { admissionFee: 1800, monthlyTuitionFee: 900, annualExamFee: 450 },
  UKG: { admissionFee: 2000, monthlyTuitionFee: 1000, annualExamFee: 500 },
  '1st': { admissionFee: 2200, monthlyTuitionFee: 1100, annualExamFee: 550 },
  '2nd': { admissionFee: 2400, monthlyTuitionFee: 1200, annualExamFee: 600 },
  '3rd': { admissionFee: 2600, monthlyTuitionFee: 1300, annualExamFee: 650 },
  '4th': { admissionFee: 2800, monthlyTuitionFee: 1400, annualExamFee: 700 },
  '5th': { admissionFee: 3000, monthlyTuitionFee: 1500, annualExamFee: 750 },
  '6th': { admissionFee: 3200, monthlyTuitionFee: 1650, annualExamFee: 800 },
  '7th': { admissionFee: 3400, monthlyTuitionFee: 1800, annualExamFee: 850 },
  '8th': { admissionFee: 3600, monthlyTuitionFee: 1950, annualExamFee: 900 },
  '9th': { admissionFee: 4000, monthlyTuitionFee: 2200, annualExamFee: 1000 },
  '10th': { admissionFee: 4200, monthlyTuitionFee: 2400, annualExamFee: 1100 },
  '11th': { admissionFee: 4500, monthlyTuitionFee: 2600, annualExamFee: 1200 },
  '12th': { admissionFee: 4800, monthlyTuitionFee: 2800, annualExamFee: 1300 },
};

export function getCurrentAcademicMonth(): FeeMonth {
  const jsMonth = new Date().getMonth(); // 0 = Jan .. 11 = Dec
  const academicIdx = (jsMonth + 9) % 12;
  return FEE_MONTHS[academicIdx] || 'April';
}

export function getDefaultClassFeeBase(className: string): {
  admissionFee: number;
  monthlyTuitionFee: number;
  annualExamFee: number;
} {
  return (
    BASE_CLASS_FEES[className] || {
      admissionFee: 2500,
      monthlyTuitionFee: 1250,
      annualExamFee: 600,
    }
  );
}

export function buildDefaultFeeSchedules(
  classNames: string[],
  sessionNames: string[] = ACADEMIC_SESSIONS
): ClassSessionFeeRate[] {
  const schedules: ClassSessionFeeRate[] = [];
  sessionNames.forEach((session, sIdx) => {
    const sessionDelta = Math.max(0, sIdx - 1) * 100;
    classNames.forEach((cls) => {
      const base = getDefaultClassFeeBase(cls);
      schedules.push({
        className: cls,
        academicSession: session,
        admissionFee: base.admissionFee + sessionDelta * 2,
        monthlyTuitionFee: base.monthlyTuitionFee + sessionDelta,
        annualExamFee: base.annualExamFee,
      });
    });
  });
  return schedules;
}

function getAdmissionAcademicMonthIndex(
  admissionDate: string,
  academicSession: string,
  monthsOrder: FeeMonth[]
): number {
  if (!admissionDate || monthsOrder.length === 0) return 0;
  const sessionParts = academicSession.split('-').map((p) => Number(p.trim()));
  const startYear = Number.isFinite(sessionParts[0]) ? sessionParts[0] : 2026;
  const endYear = Number.isFinite(sessionParts[1]) ? sessionParts[1] : startYear + 1;

  const dateParts = admissionDate.split('-').map(Number);
  if (dateParts.length !== 3 || dateParts.some((n) => !Number.isFinite(n))) {
    return 0;
  }
  const [yr, mo] = dateParts; // mo is 1..12
  const firstSessionMonthName = monthsOrder[0] || 'April';
  const startCalMonthNumber = CALENDAR_MONTHS.indexOf(firstSessionMonthName) + 1; // 1..12

  if (yr < startYear || (yr === startYear && mo <= startCalMonthNumber)) {
    return 0;
  }
  if (yr > endYear) {
    return 0;
  }

  const admittedMonthName = CALENDAR_MONTHS[(mo - 1 + 12) % 12];
  const idxInOrder = monthsOrder.indexOf(admittedMonthName);
  return idxInOrder >= 0 ? idxInOrder : 0;
}

export function computeStudentDueSummary(
  student: StudentRecord,
  studentFees: FeeRecord[],
  billingCutoffMonth: FeeMonth,
  sessionMonthsOrder: FeeMonth[] = FEE_MONTHS
): StudentDueSummary {
  let paidAdmission = 0;
  let paidTuition = 0;
  let paidTransport = 0;
  let paidExam = 0;

  const tuitionPaidMonthsSet = new Set<FeeMonth>();
  const transportPaidMonthsSet = new Set<FeeMonth>();

  studentFees.forEach((f) => {
    const amt = Math.max(0, Number(f.amount) || 0);
    if (f.category === 'Admission') {
      paidAdmission += amt;
    } else if (f.category === 'Tuition') {
      paidTuition += amt;
      tuitionPaidMonthsSet.add(f.feeMonth);
    } else if (f.category === 'Transport') {
      paidTransport += amt;
      transportPaidMonthsSet.add(f.feeMonth);
    } else if (f.category === 'Exam') {
      paidExam += amt;
    }
  });

  const totalPaidAll = paidAdmission + paidTuition + paidTransport + paidExam;

  // Fee Freeze: Deactive students have paused ongoing monthly fee generation and zero active dues
  if (student.status === 'Deactive') {
    return {
      student,
      isFeeFrozen: true,
      billableMonths: [],
      unpaidTuitionMonths: [],
      unpaidTransportMonths: [],
      expectedAdmission: 0,
      expectedTuition: 0,
      expectedTransport: 0,
      totalExpected: 0,
      paidAdmission,
      paidTuition,
      paidTransport,
      paidExam,
      totalPaidAll,
      dueAdmission: 0,
      dueTuition: 0,
      dueTransport: 0,
      totalOutstandingDue: 0,
      advanceCredit: 0,
    };
  }

  const orderedMonths = sessionMonthsOrder.length > 0 ? sessionMonthsOrder : FEE_MONTHS;
  const rawCutoffIdx = orderedMonths.indexOf(billingCutoffMonth);
  const cutoffIdx = rawCutoffIdx >= 0 ? rawCutoffIdx : orderedMonths.length - 1;
  const startIdx = getAdmissionAcademicMonthIndex(
    student.admissionDate,
    student.academicSession,
    orderedMonths
  );
  const effectiveEndIdx = Math.max(startIdx, cutoffIdx);
  const billableMonths = orderedMonths.slice(startIdx, effectiveEndIdx + 1);
  const monthsCount = billableMonths.length;

  const expectedAdmission =
    student.admissionType === 'Paid' ? Math.max(0, Number(student.admissionFee) || 0) : 0;
  const expectedTuition = Math.max(0, Number(student.monthlyTuitionFee) || 0) * monthsCount;
  const expectedTransport = student.transportEnabled
    ? Math.max(0, Number(student.transportFee) || 0) * monthsCount
    : 0;
  const totalExpected = expectedAdmission + expectedTuition + expectedTransport;

  const dueAdmission = Math.max(0, expectedAdmission - paidAdmission);
  const dueTuition = Math.max(0, expectedTuition - paidTuition);
  const dueTransport = Math.max(0, expectedTransport - paidTransport);

  const totalRegularPaid = paidAdmission + paidTuition + paidTransport;
  const totalOutstandingDue = dueAdmission + dueTuition + dueTransport;
  const advanceCredit = Math.max(0, totalRegularPaid - totalExpected);

  const unpaidTuitionMonths =
    dueTuition > 0 ? billableMonths.filter((m) => !tuitionPaidMonthsSet.has(m)) : [];
  const unpaidTransportMonths =
    student.transportEnabled && dueTransport > 0
      ? billableMonths.filter((m) => !transportPaidMonthsSet.has(m))
      : [];

  return {
    student,
    isFeeFrozen: false,
    billableMonths,
    unpaidTuitionMonths,
    unpaidTransportMonths,
    expectedAdmission,
    expectedTuition,
    expectedTransport,
    totalExpected,
    paidAdmission,
    paidTuition,
    paidTransport,
    paidExam,
    totalPaidAll,
    dueAdmission,
    dueTuition,
    dueTransport,
    totalOutstandingDue,
    advanceCredit,
  };
}

export function computeSchoolDueOverview(
  students: StudentRecord[],
  fees: FeeRecord[],
  billingCutoffMonth: FeeMonth,
  sessionMonthsOrder: FeeMonth[] = FEE_MONTHS
): {
  totalExpected: number;
  totalOutstandingDues: number;
  defaultersCount: number;
  summaries: StudentDueSummary[];
  byStudentId: Record<string, StudentDueSummary>;
} {
  const feesByStudent = new Map<string, FeeRecord[]>();
  fees.forEach((f) => {
    const list = feesByStudent.get(f.studentId);
    if (list) list.push(f);
    else feesByStudent.set(f.studentId, [f]);
  });

  let totalExpected = 0;
  let totalOutstandingDues = 0;
  let defaultersCount = 0;
  const summaries: StudentDueSummary[] = [];
  const byStudentId: Record<string, StudentDueSummary> = {};

  students.forEach((stu) => {
    const stuFees = feesByStudent.get(stu.id) || [];
    const summary = computeStudentDueSummary(
      stu,
      stuFees,
      billingCutoffMonth,
      sessionMonthsOrder
    );
    summaries.push(summary);
    byStudentId[stu.id] = summary;

    if (!summary.isFeeFrozen) {
      totalExpected += summary.totalExpected;
      totalOutstandingDues += summary.totalOutstandingDue;
      if (summary.totalOutstandingDue > 0) {
        defaultersCount += 1;
      }
    }
  });

  return {
    totalExpected,
    totalOutstandingDues,
    defaultersCount,
    summaries,
    byStudentId,
  };
}
