import ExcelJS from 'exceljs';
import {
  AttendanceStatus,
  ClassSessionFeeRate,
  ExamDefinition,
  FeeMonth,
  FeeRecord,
  SchoolProfileSettings,
  StaffMember,
  StudentDueSummary,
  StudentExamMarksheet,
  StudentRecord,
  TransportRoute,
} from '../types/erp';
import { resolveStudentRollNumber, sortExamSubjects } from './examEngine';
import { getTodayISO } from './formatters';

export interface ExcelExportResult {
  filename: string;
  rowCount: number;
  elapsedMs: number;
}

type HorizontalAlign = 'left' | 'center' | 'right';

interface ColumnSpec {
  header: string;
  key: string;
  align?: HorizontalAlign;
  numFmt?: string;
  minWidth?: number;
  maxWidth?: number;
}

interface SummaryRowCell {
  colIndex: number; // 1-based column index
  value?: string | number;
  formula?: string;
  result?: number | string;
  numFmt?: string;
  align?: HorizontalAlign;
  textColorArgb?: string;
}

interface SummaryRowSpec {
  cells: SummaryRowCell[];
  fillArgb?: string;
}

// ============================================================================
// EXCEL COLOR PALETTE & BORDERS (OpenXML ARGB)
// ============================================================================
const ARGB_HEADER_NAVY = 'FF1A365D'; // Exact #1a365d Dark Blue requested
const ARGB_WHITE = 'FFFFFFFF';
const ARGB_ZEBRA_ALT = 'FFF1F5F9'; // Soft slate zebra tint
const ARGB_BANNER_BG = 'FFF8FAFC';
const ARGB_REPORT_BAR_BG = 'FFEFF6FF';
const ARGB_SUMMARY_BG = 'FFE2E8F0';
const ARGB_SUMMARY_SUB_BG = 'FFF8FAFC';
const ARGB_BORDER_GREY = 'FFD1D5DB'; // Clean light-grey cell border
const ARGB_TEXT_DARK = 'FF0F172A';
const ARGB_TEXT_MUTED = 'FF334155';
const ARGB_TEXT_EMERALD = 'FF047857';
const ARGB_TEXT_ROSE = 'FFBE123C';

const NUMFMT_INR = '"₹"#,##0.00';
const NUMFMT_DATE = 'dd/mm/yyyy';
const NUMFMT_PERCENT = '0.0%';
const NUMFMT_INT = '#,##0';

const THIN_GREY_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: ARGB_BORDER_GREY } },
  left: { style: 'thin', color: { argb: ARGB_BORDER_GREY } },
  bottom: { style: 'thin', color: { argb: ARGB_BORDER_GREY } },
  right: { style: 'thin', color: { argb: ARGB_BORDER_GREY } },
};

const SUMMARY_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'medium', color: { argb: ARGB_HEADER_NAVY } },
  left: { style: 'thin', color: { argb: ARGB_BORDER_GREY } },
  bottom: { style: 'double', color: { argb: ARGB_HEADER_NAVY } },
  right: { style: 'thin', color: { argb: ARGB_BORDER_GREY } },
};

// ============================================================================
// LOW-LEVEL HELPERS
// ============================================================================

export function colIndexToLetter(col1Based: number): string {
  let n = col1Based;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters || 'A';
}

/**
 * Parses YYYY-MM-DD (or ISO timestamp) into an exact UTC midnight Date object
 * so Excel serializes the exact calendar date with zero timezone drift.
 */
function parseExcelDate(isoStr?: string): Date | string {
  if (!isoStr) return '—';
  const clean = isoStr.trim().split('T')[0];
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day));
    }
  }
  const fallback = new Date(isoStr);
  return Number.isNaN(fallback.getTime()) ? isoStr : fallback;
}

function sanitizeFilenameToken(raw: string): string {
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildSchoolPrefix(profile: SchoolProfileSettings): string {
  const name = (profile.schoolName || 'RB PUBLIC SCHOOL').trim();
  if (/^rb\s+public\s+school$/i.test(name)) {
    return 'RB_School';
  }
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)
    .slice(0, 3)
    .map((w) =>
      w.length <= 3 && w === w.toUpperCase()
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    );
  return words.join('_') || 'School';
}

function extractSessionYearToken(sessionOrDate?: string): string {
  if (sessionOrDate) {
    const yearMatch = sessionOrDate.match(/20\d{2}/);
    if (yearMatch) return yearMatch[0];
  }
  return String(new Date().getFullYear());
}

export function buildDynamicExcelFilename(
  profile: SchoolProfileSettings,
  datasetSlug: string,
  contextParts: string[],
  sessionOrYear?: string
): string {
  const prefix = buildSchoolPrefix(profile);
  const cleanParts = [
    prefix,
    sanitizeFilenameToken(datasetSlug),
    ...contextParts.map(sanitizeFilenameToken).filter(Boolean),
    sanitizeFilenameToken(extractSessionYearToken(sessionOrYear)),
  ].filter(Boolean);

  return `${cleanParts.join('_')}.xlsx`;
}

function formatSchoolAddressLine(
  profile: SchoolProfileSettings,
  activeSession?: string
): string {
  const segments: string[] = [];
  if (profile.address?.trim()) {
    segments.push(profile.address.trim());
  } else if (profile.tagline?.trim()) {
    segments.push(profile.tagline.trim());
  }
  if (profile.phone?.trim()) {
    segments.push(`Ph: ${profile.phone.trim()}`);
  }
  if (profile.affiliationNo?.trim()) {
    segments.push(`Affiliation No: ${profile.affiliationNo.trim()}`);
  }
  if (activeSession) {
    segments.push(`Academic Session: ${activeSession}`);
  }
  return segments.join('  •  ') || 'Official School ERP Data Export';
}

async function yieldToBrowserFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function triggerExcelBlobDownload(buffer: ExcelJS.Buffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ============================================================================
// CORE STYLED WORKSHEET GENERATOR
// ============================================================================

interface StyledSheetConfig {
  workbook: ExcelJS.Workbook;
  sheetName: string;
  schoolProfile: SchoolProfileSettings;
  activeSession?: string;
  reportTitle: string;
  reportMetaSubtitle?: string;
  columns: ColumnSpec[];
  rows: Array<Record<string, unknown>>;
  buildSummaryRows?: (bounds: {
    firstDataRow: number;
    lastDataRow: number;
    rowCount: number;
  }) => SummaryRowSpec[];
}

function populateStyledWorksheet(cfg: StyledSheetConfig): ExcelJS.Worksheet {
  const {
    workbook,
    sheetName,
    schoolProfile,
    activeSession,
    reportTitle,
    reportMetaSubtitle,
    columns,
    rows,
    buildSummaryRows,
  } = cfg;

  const safeSheetName =
    sheetName.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || 'Report';
  const ws = workbook.addWorksheet(safeSheetName, {
    pageSetup: {
      paperSize: 9, // A4
      orientation: columns.length > 7 ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  const colCount = Math.max(columns.length, 1);
  const lastColLetter = colIndexToLetter(colCount);

  // Track max text width per column for auto-fitting
  const colMaxLengths = columns.map((c) => Math.max(c.minWidth ?? 10, c.header.length + 3));

  // --------------------------------------------------------------------------
  // ROW 1: TOP HEADER BANNER — SCHOOL NAME (Bold, Centered, Merged)
  // --------------------------------------------------------------------------
  const schoolName = (schoolProfile.schoolName || 'RB PUBLIC SCHOOL').toUpperCase();
  const row1 = ws.getRow(1);
  row1.getCell(1).value = schoolName;
  ws.mergeCells(`A1:${lastColLetter}1`);
  row1.height = 28;
  row1.getCell(1).font = {
    name: 'Calibri',
    size: 16,
    bold: true,
    color: { argb: ARGB_HEADER_NAVY },
  };
  row1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  row1.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: ARGB_BANNER_BG },
  };

  // --------------------------------------------------------------------------
  // ROW 2: SCHOOL ADDRESS, CONTACT & AFFILIATION (Bold/Medium, Centered)
  // --------------------------------------------------------------------------
  const addressLine = formatSchoolAddressLine(schoolProfile, activeSession);
  const row2 = ws.getRow(2);
  row2.getCell(1).value = addressLine;
  ws.mergeCells(`A2:${lastColLetter}2`);
  row2.height = 20;
  row2.getCell(1).font = {
    name: 'Calibri',
    size: 10,
    bold: true,
    color: { argb: ARGB_TEXT_MUTED },
  };
  row2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  row2.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: ARGB_BANNER_BG },
  };

  // --------------------------------------------------------------------------
  // ROW 3: REPORT NAME & EXPORT CONTEXT (Centered, Bold)
  // --------------------------------------------------------------------------
  const todayDisplay = getTodayISO().split('-').reverse().join('/');
  const fullReportBanner = reportMetaSubtitle
    ? `${reportTitle}  —  ${reportMetaSubtitle}  |  Exported: ${todayDisplay}`
    : `${reportTitle}  |  Exported: ${todayDisplay}`;

  const row3 = ws.getRow(3);
  row3.getCell(1).value = fullReportBanner;
  ws.mergeCells(`A3:${lastColLetter}3`);
  row3.height = 23;
  row3.getCell(1).font = {
    name: 'Calibri',
    size: 11,
    bold: true,
    color: { argb: ARGB_HEADER_NAVY },
  };
  row3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  row3.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: ARGB_REPORT_BAR_BG },
  };
  row3.getCell(1).border = {
    top: { style: 'thin', color: { argb: 'FFBFDBFE' } },
    bottom: { style: 'thin', color: { argb: 'FF93C5FD' } },
  };

  // --------------------------------------------------------------------------
  // ROW 4: CLEAN SPACER ROW
  // --------------------------------------------------------------------------
  ws.getRow(4).height = 7;

  // --------------------------------------------------------------------------
  // ROW 5: TABLE HEADERS (#1a365d Fill, Bold White Text, Auto-Filter)
  // --------------------------------------------------------------------------
  const HEADER_ROW_INDEX = 5;
  const headerRow = ws.getRow(HEADER_ROW_INDEX);
  headerRow.height = 26;

  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: ARGB_HEADER_NAVY },
    };
    cell.font = {
      name: 'Calibri',
      size: 10.5,
      bold: true,
      color: { argb: ARGB_WHITE },
    };
    cell.alignment = {
      horizontal: col.align || 'left',
      vertical: 'middle',
      wrapText: false,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: ARGB_HEADER_NAVY } },
      left: { style: 'thin', color: { argb: 'FF334E68' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FF334E68' } },
    };
  });

  // Enable Auto-Filter across all header columns & freeze top 5 rows
  ws.autoFilter = {
    from: { row: HEADER_ROW_INDEX, column: 1 },
    to: { row: HEADER_ROW_INDEX, column: colCount },
  };
  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW_INDEX }];

  // --------------------------------------------------------------------------
  // ROWS 6..N: DATA ROWS (Zebra Striping, Borders, Native Formats & Formulas)
  // --------------------------------------------------------------------------
  const firstDataRow = HEADER_ROW_INDEX + 1;

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const excelRowNum = firstDataRow + rIdx;
    const rowData = rows[rIdx];
    const excelRow = ws.getRow(excelRowNum);
    excelRow.height = 20;

    const isOddRow = rIdx % 2 === 1;
    const rowFillArgb = isOddRow ? ARGB_ZEBRA_ALT : ARGB_WHITE;

    for (let cIdx = 0; cIdx < columns.length; cIdx++) {
      const col = columns[cIdx];
      const cell = excelRow.getCell(cIdx + 1);
      const rawVal = rowData[col.key];

      if (
        rawVal &&
        typeof rawVal === 'object' &&
        !(rawVal instanceof Date) &&
        'formula' in (rawVal as Record<string, unknown>)
      ) {
        const fObj = rawVal as { formula: string; result?: number | string };
        cell.value = { formula: fObj.formula, result: fObj.result };
      } else {
        cell.value = (rawVal ?? '') as ExcelJS.CellValue;
      }

      if (col.numFmt) {
        cell.numFmt = col.numFmt;
      }

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowFillArgb },
      };

      // Semantic text coloring for Pass/Fail or Active/Absent while keeping crisp legibility
      let fontColor = ARGB_TEXT_DARK;
      let isBold = false;
      if (typeof rawVal === 'string') {
        if (rawVal === 'PASSED' || rawVal === 'PASS') {
          fontColor = ARGB_TEXT_EMERALD;
          isBold = true;
        } else if (rawVal === 'FAILED' || rawVal === 'FAIL' || rawVal === 'Absent') {
          fontColor = ARGB_TEXT_ROSE;
          isBold = true;
        }
      }

      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: isBold,
        color: { argb: fontColor },
      };
      cell.alignment = {
        horizontal: col.align || 'left',
        vertical: 'middle',
      };
      cell.border = THIN_GREY_BORDER;

      // Sample first 500 rows for lightning-fast column auto-fit calculation
      if (rIdx < 500) {
        let displayLen = 0;
        if (rawVal instanceof Date) {
          displayLen = 12; // DD/MM/YYYY
        } else if (
          rawVal &&
          typeof rawVal === 'object' &&
          'result' in (rawVal as Record<string, unknown>)
        ) {
          const resVal = (rawVal as { result?: unknown }).result;
          displayLen =
            col.numFmt === NUMFMT_INR
              ? String(Math.round(Number(resVal) || 0)).length + 6
              : String(resVal ?? '').length + 3;
        } else if (typeof rawVal === 'number') {
          displayLen =
            col.numFmt === NUMFMT_INR
              ? String(Math.round(rawVal)).length + 6
              : col.numFmt === NUMFMT_PERCENT
              ? 8
              : String(rawVal).length + 2;
        } else if (rawVal !== null && rawVal !== undefined) {
          displayLen = String(rawVal).length;
        }

        if (displayLen + 3 > colMaxLengths[cIdx]) {
          colMaxLengths[cIdx] = displayLen + 3;
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // AUTOMATED CALCULATIONS & SUMMARY FORMULA FOOTER ROWS
  // --------------------------------------------------------------------------
  const lastDataRow = rows.length > 0 ? firstDataRow + rows.length - 1 : firstDataRow;
  if (rows.length > 0 && buildSummaryRows) {
    const summarySpecs = buildSummaryRows({
      firstDataRow,
      lastDataRow,
      rowCount: rows.length,
    });

    summarySpecs.forEach((spec, sIdx) => {
      const sumRowIdx = lastDataRow + 1 + sIdx;
      const sumRow = ws.getRow(sumRowIdx);
      sumRow.height = 23;
      const bgArgb = spec.fillArgb || (sIdx === 0 ? ARGB_SUMMARY_BG : ARGB_SUMMARY_SUB_BG);

      // Style entire summary row uniformly first
      for (let c = 1; c <= colCount; c++) {
        const cell = sumRow.getCell(c);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: bgArgb },
        };
        cell.font = {
          name: 'Calibri',
          size: 10.5,
          bold: true,
          color: { argb: ARGB_HEADER_NAVY },
        };
        cell.border = sIdx === 0 ? SUMMARY_BORDER : THIN_GREY_BORDER;
        cell.alignment = {
          horizontal: columns[c - 1]?.align || 'left',
          vertical: 'middle',
        };
      }

      // Populate formula & label cells
      spec.cells.forEach((sc) => {
        if (sc.colIndex < 1 || sc.colIndex > colCount) return;
        const cell = sumRow.getCell(sc.colIndex);
        if (sc.formula) {
          cell.value = { formula: sc.formula, result: sc.result };
        } else if (sc.value !== undefined) {
          cell.value = sc.value;
        }
        if (sc.numFmt) {
          cell.numFmt = sc.numFmt;
        } else if (columns[sc.colIndex - 1]?.numFmt && sc.formula) {
          cell.numFmt = columns[sc.colIndex - 1].numFmt!;
        }
        if (sc.align) {
          cell.alignment = { horizontal: sc.align, vertical: 'middle' };
        }
        if (sc.textColorArgb) {
          cell.font = {
            name: 'Calibri',
            size: 10.5,
            bold: true,
            color: { argb: sc.textColorArgb },
          };
        }

        // Factor summary value width into auto-fit
        const estText =
          sc.value !== undefined
            ? String(sc.value)
            : sc.result !== undefined
            ? String(sc.result)
            : '';
        if (estText.length + 5 > colMaxLengths[sc.colIndex - 1]) {
          colMaxLengths[sc.colIndex - 1] = estText.length + 5;
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // APPLY AUTO-FITTED COLUMN WIDTHS
  // --------------------------------------------------------------------------
  columns.forEach((col, idx) => {
    const minW = col.minWidth ?? 11;
    const maxW = col.maxWidth ?? 42;
    ws.getColumn(idx + 1).width = Math.min(maxW, Math.max(minW, colMaxLengths[idx]));
  });

  return ws;
}

async function finalizeAndDownloadWorkbook(
  workbook: ExcelJS.Workbook,
  filename: string,
  rowCount: number,
  startTime: number
): Promise<ExcelExportResult> {
  const buffer = await workbook.xlsx.writeBuffer();
  triggerExcelBlobDownload(buffer, filename);
  const elapsedMs = Math.max(1, Math.round(performance.now() - startTime));
  return { filename, rowCount, elapsedMs };
}

// ============================================================================
// 1. STUDENTS DIRECTORY EXPORTER (AdmissionsModule)
// ============================================================================

export async function exportStudentsToExcel(params: {
  students: StudentRecord[];
  allStudentsForRoll: StudentRecord[];
  dueByStudentId: Record<string, StudentDueSummary>;
  routes: TransportRoute[];
  schoolProfile: SchoolProfileSettings;
  activeSession: string;
  classFilter: string;
  sessionFilter: string;
  statusFilter: string;
  isPartialSelection: boolean;
}): Promise<ExcelExportResult> {
  const t0 = performance.now();
  await yieldToBrowserFrame();

  const {
    students,
    allStudentsForRoll,
    dueByStudentId,
    routes,
    schoolProfile,
    activeSession,
    classFilter,
    sessionFilter,
    statusFilter,
    isPartialSelection,
  } = params;

  const routeMap = new Map<string, TransportRoute>();
  routes.forEach((r) => routeMap.set(r.id, r));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = schoolProfile.schoolName || 'RB Public School ERP';
  workbook.created = new Date();

  const columns: ColumnSpec[] = [
    { header: 'S.No', key: 'sno', align: 'center', numFmt: NUMFMT_INT, minWidth: 7 }, // A (1)
    { header: 'Admission ID', key: 'admissionId', align: 'center', minWidth: 13 }, // B (2)
    { header: 'Roll No', key: 'rollNo', align: 'center', minWidth: 10 }, // C (3)
    { header: 'Student Name', key: 'name', align: 'left', minWidth: 22 }, // D (4)
    { header: 'Class', key: 'className', align: 'center', minWidth: 10 }, // E (5)
    { header: 'Section', key: 'section', align: 'center', minWidth: 9 }, // F (6)
    { header: 'Session', key: 'session', align: 'center', minWidth: 12 }, // G (7)
    { header: 'Status', key: 'status', align: 'center', minWidth: 11 }, // H (8)
    { header: 'Gender', key: 'gender', align: 'center', minWidth: 10 }, // I (9)
    { header: 'Category', key: 'category', align: 'center', minWidth: 10 }, // J (10)
    { header: 'Date of Birth', key: 'dob', align: 'center', numFmt: NUMFMT_DATE, minWidth: 14 }, // K (11)
    { header: 'Admission Date', key: 'admissionDate', align: 'center', numFmt: NUMFMT_DATE, minWidth: 15 }, // L (12)
    { header: 'Father Name', key: 'fatherName', align: 'left', minWidth: 20 }, // M (13)
    { header: 'Mother Name', key: 'motherName', align: 'left', minWidth: 20 }, // N (14)
    { header: 'Mobile No', key: 'phone', align: 'center', minWidth: 14 }, // O (15)
    { header: 'Admission Fee (₹)', key: 'admissionFee', align: 'right', numFmt: NUMFMT_INR, minWidth: 17 }, // P (16)
    { header: 'Monthly Tuition (₹)', key: 'tuitionFee', align: 'right', numFmt: NUMFMT_INR, minWidth: 18 }, // Q (17)
    { header: 'Transport Route', key: 'routeName', align: 'left', minWidth: 18 }, // R (18)
    { header: 'Bus Fee / Mo (₹)', key: 'transportFee', align: 'right', numFmt: NUMFMT_INR, minWidth: 16 }, // S (19)
    { header: 'Monthly Total (₹)', key: 'monthlyTotal', align: 'right', numFmt: NUMFMT_INR, minWidth: 18 }, // T (20) Formula =Q+S
    { header: 'Balance Due (₹)', key: 'balanceDue', align: 'right', numFmt: NUMFMT_INR, minWidth: 17 }, // U (21)
    { header: 'Address', key: 'address', align: 'left', minWidth: 24, maxWidth: 44 }, // V (22)
  ];

  const firstDataRow = 6;
  let sumAdm = 0;
  let sumTuition = 0;
  let sumBus = 0;
  let sumMonthly = 0;
  let sumDue = 0;
  let activeCount = 0;

  const rows = students.map((stu, idx) => {
    const excelRow = firstDataRow + idx;
    const route = stu.transportEnabled && stu.routeId ? routeMap.get(stu.routeId) : undefined;
    const dueObj = dueByStudentId[stu.id];
    const netDue = stu.status === 'Deactive' ? 0 : dueObj?.totalOutstandingDue || 0;
    const busFee = stu.transportEnabled ? Number(stu.transportFee) || 0 : 0;
    const tuition = Number(stu.monthlyTuitionFee) || 0;
    const admFee = Number(stu.admissionFee) || 0;
    const monthlyCombined = tuition + busFee;
    const statusStr = stu.status === 'Deactive' ? 'Deactive' : 'Active';

    sumAdm += admFee;
    sumTuition += tuition;
    sumBus += busFee;
    sumMonthly += monthlyCombined;
    sumDue += netDue;
    if (statusStr === 'Active') activeCount += 1;

    return {
      sno: idx + 1,
      admissionId: stu.admissionId,
      rollNo: resolveStudentRollNumber(stu, allStudentsForRoll),
      name: stu.name,
      className: stu.className,
      section: stu.section,
      session: stu.academicSession,
      status: statusStr,
      gender: stu.gender,
      category: stu.casteCategory,
      dob: parseExcelDate(stu.dob),
      admissionDate: parseExcelDate(stu.admissionDate),
      fatherName: stu.fatherName,
      motherName: stu.motherName,
      phone: stu.phone,
      admissionFee: admFee,
      tuitionFee: tuition,
      routeName: route ? `${route.routeName} (${route.busNumber})` : 'Self / Off',
      transportFee: busFee,
      monthlyTotal: {
        formula: `Q${excelRow}+S${excelRow}`,
        result: monthlyCombined,
      },
      balanceDue: netDue,
      address: stu.address,
    };
  });

  const classLabel = classFilter === 'ALL' ? 'All Classes' : `Class ${classFilter}`;
  const sessionLabel = sessionFilter === 'ALL' ? activeSession : sessionFilter;
  const scopeTag = isPartialSelection
    ? `Selected ${students.length} Students`
    : `${classLabel} (${statusFilter})`;

  populateStyledWorksheet({
    workbook,
    sheetName: 'Students_Directory',
    schoolProfile,
    activeSession: sessionLabel,
    reportTitle: 'STUDENT ADMISSION & DIRECTORY REGISTER',
    reportMetaSubtitle: scopeTag,
    columns,
    rows,
    buildSummaryRows: ({ firstDataRow: r1, lastDataRow: r2, rowCount }) => [
      {
        cells: [
          { colIndex: 2, value: 'GRAND TOTALS', align: 'left' },
          {
            colIndex: 4,
            formula: `COUNTA(D${r1}:D${r2})`,
            result: rowCount,
            numFmt: '0" Students"',
            align: 'left',
          },
          {
            colIndex: 8,
            formula: `COUNTIF(H${r1}:H${r2},"Active")`,
            result: activeCount,
            numFmt: '0" Active"',
            align: 'center',
            textColorArgb: ARGB_TEXT_EMERALD,
          },
          { colIndex: 16, formula: `SUM(P${r1}:P${r2})`, result: sumAdm, numFmt: NUMFMT_INR, align: 'right' },
          { colIndex: 17, formula: `SUM(Q${r1}:Q${r2})`, result: sumTuition, numFmt: NUMFMT_INR, align: 'right' },
          { colIndex: 19, formula: `SUM(S${r1}:S${r2})`, result: sumBus, numFmt: NUMFMT_INR, align: 'right' },
          { colIndex: 20, formula: `SUM(T${r1}:T${r2})`, result: sumMonthly, numFmt: NUMFMT_INR, align: 'right' },
          {
            colIndex: 21,
            formula: `SUM(U${r1}:U${r2})`,
            result: sumDue,
            numFmt: NUMFMT_INR,
            align: 'right',
            textColorArgb: sumDue > 0 ? ARGB_TEXT_ROSE : ARGB_TEXT_EMERALD,
          },
        ],
      },
      {
        cells: [
          { colIndex: 2, value: 'CLASS AVERAGES', align: 'left' },
          {
            colIndex: 8,
            formula: `COUNTIF(H${r1}:H${r2},"Deactive")`,
            result: rowCount - activeCount,
            numFmt: '0" Deactive"',
            align: 'center',
          },
          {
            colIndex: 17,
            formula: `AVERAGE(Q${r1}:Q${r2})`,
            result: rowCount > 0 ? sumTuition / rowCount : 0,
            numFmt: NUMFMT_INR,
            align: 'right',
          },
          {
            colIndex: 20,
            formula: `AVERAGE(T${r1}:T${r2})`,
            result: rowCount > 0 ? sumMonthly / rowCount : 0,
            numFmt: NUMFMT_INR,
            align: 'right',
          },
          {
            colIndex: 21,
            formula: `AVERAGE(U${r1}:U${r2})`,
            result: rowCount > 0 ? sumDue / rowCount : 0,
            numFmt: NUMFMT_INR,
            align: 'right',
          },
        ],
      },
    ],
  });

  const filenameContext = [
    classFilter === 'ALL' ? 'All_Classes' : `Class_${classFilter}`,
    isPartialSelection ? `Selected_${students.length}` : '',
  ];
  const filename = buildDynamicExcelFilename(
    schoolProfile,
    'Students',
    filenameContext,
    sessionLabel
  );

  return finalizeAndDownloadWorkbook(workbook, filename, students.length, t0);
}

// ============================================================================
// 2. STAFF & FACULTY DIRECTORY EXPORTER (StaffModule)
// ============================================================================

export async function exportStaffToExcel(params: {
  staff: StaffMember[];
  schoolProfile: SchoolProfileSettings;
  activeSession: string;
  roleFilter: string;
  isPartialSelection: boolean;
}): Promise<ExcelExportResult> {
  const t0 = performance.now();
  await yieldToBrowserFrame();

  const { staff, schoolProfile, activeSession, roleFilter, isPartialSelection } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = schoolProfile.schoolName || 'RB Public School ERP';
  workbook.created = new Date();

  const columns: ColumnSpec[] = [
    { header: 'S.No', key: 'sno', align: 'center', numFmt: NUMFMT_INT, minWidth: 7 }, // A (1)
    { header: 'Emp / Staff ID', key: 'staffId', align: 'center', minWidth: 14 }, // B (2)
    { header: 'Full Name', key: 'fullName', align: 'left', minWidth: 22 }, // C (3)
    { header: 'Designation / Post', key: 'designation', align: 'left', minWidth: 22 }, // D (4)
    { header: 'Department / Assigned Classes', key: 'department', align: 'left', minWidth: 24 }, // E (5)
    { header: 'Qualification', key: 'qualification', align: 'left', minWidth: 16 }, // F (6)
    { header: 'Father / Spouse Name', key: 'guardian', align: 'left', minWidth: 20 }, // G (7)
    { header: 'Mobile Number', key: 'phone', align: 'center', minWidth: 15 }, // H (8)
    { header: 'Emergency Contact', key: 'emergency', align: 'center', minWidth: 16 }, // I (9)
    { header: 'Joined Date', key: 'joinedDate', align: 'center', numFmt: NUMFMT_DATE, minWidth: 14 }, // J (10)
    { header: 'Monthly Salary (₹)', key: 'monthlySalary', align: 'right', numFmt: NUMFMT_INR, minWidth: 18 }, // K (11)
    { header: 'Annualized CTC (₹)', key: 'annualSalary', align: 'right', numFmt: NUMFMT_INR, minWidth: 19 }, // L (12) Formula =K*12
    { header: 'Residential Address', key: 'address', align: 'left', minWidth: 25, maxWidth: 44 }, // M (13)
  ];

  const firstDataRow = 6;
  let totalMonthly = 0;

  const rows = staff.map((m, idx) => {
    const excelRow = firstDataRow + idx;
    const sal = Number(m.monthlySalary) || 0;
    totalMonthly += sal;

    return {
      sno: idx + 1,
      staffId: m.staffId,
      fullName: m.fullName,
      designation: m.designation,
      department: m.assignedDepartment || 'General Campus',
      qualification: m.qualification || '—',
      guardian: m.fatherOrSpouseName || '—',
      phone: m.phone,
      emergency: m.emergencyContact || '—',
      joinedDate: parseExcelDate(m.joinedDate),
      monthlySalary: sal,
      annualSalary: {
        formula: `K${excelRow}*12`,
        result: sal * 12,
      },
      address: m.address,
    };
  });

  const postScope = roleFilter === 'ALL' ? 'All Designations' : roleFilter;

  populateStyledWorksheet({
    workbook,
    sheetName: 'Staff_Directory',
    schoolProfile,
    activeSession,
    reportTitle: 'FACULTY & STAFF PAYROLL DIRECTORY',
    reportMetaSubtitle: isPartialSelection
      ? `Selected ${staff.length} Staff Members (${postScope})`
      : postScope,
    columns,
    rows,
    buildSummaryRows: ({ firstDataRow: r1, lastDataRow: r2, rowCount }) => [
      {
        cells: [
          { colIndex: 2, value: 'TOTAL PAYROLL', align: 'left' },
          {
            colIndex: 3,
            formula: `COUNTA(C${r1}:C${r2})`,
            result: rowCount,
            numFmt: '0" Staff Members"',
            align: 'left',
          },
          {
            colIndex: 11,
            formula: `SUM(K${r1}:K${r2})`,
            result: totalMonthly,
            numFmt: NUMFMT_INR,
            align: 'right',
            textColorArgb: ARGB_TEXT_EMERALD,
          },
          {
            colIndex: 12,
            formula: `SUM(L${r1}:L${r2})`,
            result: totalMonthly * 12,
            numFmt: NUMFMT_INR,
            align: 'right',
          },
        ],
      },
      {
        cells: [
          { colIndex: 2, value: 'AVERAGE SALARY', align: 'left' },
          {
            colIndex: 11,
            formula: `AVERAGE(K${r1}:K${r2})`,
            result: rowCount > 0 ? totalMonthly / rowCount : 0,
            numFmt: NUMFMT_INR,
            align: 'right',
          },
          {
            colIndex: 12,
            formula: `AVERAGE(L${r1}:L${r2})`,
            result: rowCount > 0 ? (totalMonthly * 12) / rowCount : 0,
            numFmt: NUMFMT_INR,
            align: 'right',
          },
        ],
      },
    ],
  });

  const filename = buildDynamicExcelFilename(
    schoolProfile,
    'Staff',
    [
      roleFilter === 'ALL' ? 'Directory' : roleFilter,
      isPartialSelection ? `Selected_${staff.length}` : '',
    ],
    activeSession
  );

  return finalizeAndDownloadWorkbook(workbook, filename, staff.length, t0);
}

// ============================================================================
// 3. DAILY ATTENDANCE REGISTER EXPORTER (AttendanceModule)
// ============================================================================

export async function exportAttendanceToExcel(params: {
  students: StudentRecord[];
  allStudentsForRoll: StudentRecord[];
  entries: Record<string, AttendanceStatus>;
  notes: Record<string, string>;
  date: string;
  className: string;
  section: string;
  markedBy: string;
  schoolProfile: SchoolProfileSettings;
  activeSession: string;
  isPartialSelection: boolean;
}): Promise<ExcelExportResult> {
  const t0 = performance.now();
  await yieldToBrowserFrame();

  const {
    students,
    allStudentsForRoll,
    entries,
    notes,
    date,
    className,
    section,
    markedBy,
    schoolProfile,
    activeSession,
    isPartialSelection,
  } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = schoolProfile.schoolName || 'RB Public School ERP';
  workbook.created = new Date();

  const columns: ColumnSpec[] = [
    { header: 'S.No', key: 'sno', align: 'center', numFmt: NUMFMT_INT, minWidth: 7 }, // A (1)
    { header: 'Date', key: 'date', align: 'center', numFmt: NUMFMT_DATE, minWidth: 13 }, // B (2)
    { header: 'Admission ID', key: 'admissionId', align: 'center', minWidth: 14 }, // C (3)
    { header: 'Roll No', key: 'rollNo', align: 'center', minWidth: 10 }, // D (4)
    { header: 'Student Name', key: 'name', align: 'left', minWidth: 22 }, // E (5)
    { header: 'Class & Sec', key: 'classSec', align: 'center', minWidth: 13 }, // F (6)
    { header: 'Father Name', key: 'fatherName', align: 'left', minWidth: 20 }, // G (7)
    { header: 'Parent Mobile', key: 'phone', align: 'center', minWidth: 14 }, // H (8)
    { header: 'Attendance Status', key: 'status', align: 'center', minWidth: 18 }, // I (9)
    { header: 'Credit (%)', key: 'creditPct', align: 'right', numFmt: NUMFMT_PERCENT, minWidth: 13 }, // J (10) Formula
    { header: 'Remarks / Leave Note', key: 'note', align: 'left', minWidth: 24 }, // K (11)
    { header: 'Marked By', key: 'markedBy', align: 'left', minWidth: 18 }, // L (12)
  ];

  const firstDataRow = 6;
  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;

  const rows = students.map((stu, idx) => {
    const excelRow = firstDataRow + idx;
    const st: AttendanceStatus = entries[stu.id] || 'Present';
    if (st === 'Present') presentCount += 1;
    else if (st === 'Absent') absentCount += 1;
    else lateCount += 1;

    const creditVal = st === 'Absent' ? 0 : 1;

    return {
      sno: idx + 1,
      date: parseExcelDate(date),
      admissionId: stu.admissionId,
      rollNo: resolveStudentRollNumber(stu, allStudentsForRoll),
      name: stu.name,
      classSec: `${stu.className}-${stu.section}`,
      fatherName: stu.fatherName,
      phone: stu.phone,
      status: st,
      creditPct: {
        formula: `IF(OR(I${excelRow}="Present",I${excelRow}="Late"),1,0)`,
        result: creditVal,
      },
      note: notes[stu.id] || '',
      markedBy,
    };
  });

  const secTitle = section === 'ALL' ? 'All Sections' : `Section ${section}`;

  populateStyledWorksheet({
    workbook,
    sheetName: `Attendance_Cls_${className}`,
    schoolProfile,
    activeSession,
    reportTitle: `DAILY STUDENT ATTENDANCE REGISTER — CLASS ${className} (${secTitle})`,
    reportMetaSubtitle: `Attendance Date: ${date.split('-').reverse().join('/')}${
      isPartialSelection ? ` (Selected ${students.length})` : ''
    }`,
    columns,
    rows,
    buildSummaryRows: ({ firstDataRow: r1, lastDataRow: r2, rowCount }) => {
      const attRate = rowCount > 0 ? (presentCount + lateCount) / rowCount : 0;
      return [
        {
          cells: [
            { colIndex: 3, value: 'ATTENDANCE SUMMARY', align: 'left' },
            {
              colIndex: 5,
              formula: `COUNTA(E${r1}:E${r2})`,
              result: rowCount,
              numFmt: '0" Students"',
              align: 'left',
            },
            {
              colIndex: 9,
              formula: `COUNTIF(I${r1}:I${r2},"Present")`,
              result: presentCount,
              numFmt: '0" Present"',
              align: 'center',
              textColorArgb: ARGB_TEXT_EMERALD,
            },
            {
              colIndex: 10,
              formula: `AVERAGE(J${r1}:J${r2})`,
              result: attRate,
              numFmt: NUMFMT_PERCENT,
              align: 'right',
              textColorArgb: ARGB_TEXT_EMERALD,
            },
          ],
        },
        {
          cells: [
            { colIndex: 3, value: 'ABSENT / LATE BREAKDOWN', align: 'left' },
            {
              colIndex: 9,
              formula: `COUNTIF(I${r1}:I${r2},"Absent")`,
              result: absentCount,
              numFmt: '0" Absent"',
              align: 'center',
              textColorArgb: absentCount > 0 ? ARGB_TEXT_ROSE : ARGB_TEXT_MUTED,
            },
            {
              colIndex: 11,
              formula: `COUNTIF(I${r1}:I${r2},"Late")`,
              result: lateCount,
              numFmt: '0" Late Arrivals"',
              align: 'left',
            },
          ],
        },
      ];
    },
  });

  const filename = buildDynamicExcelFilename(
    schoolProfile,
    'Attendance',
    [
      `Class_${className}`,
      section === 'ALL' ? 'All_Sec' : `Sec_${section}`,
      date,
      isPartialSelection ? `Selected_${students.length}` : '',
    ],
    date
  );

  return finalizeAndDownloadWorkbook(workbook, filename, students.length, t0);
}

// ============================================================================
// 4A. FEE RECEIPTS LEDGER EXPORTER (FeeModule — Ledger Tab)
// ============================================================================

export async function exportFeeReceiptsToExcel(params: {
  fees: FeeRecord[];
  schoolProfile: SchoolProfileSettings;
  activeSession: string;
  categoryFilter: string;
  modeFilter: string;
  isPartialSelection: boolean;
}): Promise<ExcelExportResult> {
  const t0 = performance.now();
  await yieldToBrowserFrame();

  const {
    fees,
    schoolProfile,
    activeSession,
    categoryFilter,
    modeFilter,
    isPartialSelection,
  } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = schoolProfile.schoolName || 'RB Public School ERP';
  workbook.created = new Date();

  const columns: ColumnSpec[] = [
    { header: 'S.No', key: 'sno', align: 'center', numFmt: NUMFMT_INT, minWidth: 7 }, // A (1)
    { header: 'Receipt No', key: 'receiptNo', align: 'center', minWidth: 14 }, // B (2)
    { header: 'Payment Date', key: 'date', align: 'center', numFmt: NUMFMT_DATE, minWidth: 14 }, // C (3)
    { header: 'Admission ID', key: 'admissionId', align: 'center', minWidth: 14 }, // D (4)
    { header: 'Student Name', key: 'studentName', align: 'left', minWidth: 22 }, // E (5)
    { header: 'Class & Sec', key: 'classSec', align: 'center', minWidth: 12 }, // F (6)
    { header: 'Father Name', key: 'fatherName', align: 'left', minWidth: 20 }, // G (7)
    { header: 'Fee Category', key: 'category', align: 'center', minWidth: 14 }, // H (8)
    { header: 'Fee Month', key: 'feeMonth', align: 'center', minWidth: 13 }, // I (9)
    { header: 'Payment Mode', key: 'paymentMode', align: 'center', minWidth: 14 }, // J (10)
    { header: 'Paid Amount (₹)', key: 'amount', align: 'right', numFmt: NUMFMT_INR, minWidth: 18 }, // K (11)
    { header: 'Remarks', key: 'remarks', align: 'left', minWidth: 22, maxWidth: 40 }, // L (12)
  ];

  let totalCollected = 0;
  let cashSum = 0;
  let upiSum = 0;
  let bankSum = 0;

  const rows = fees.map((f, idx) => {
    const amt = Number(f.amount) || 0;
    totalCollected += amt;
    if (f.paymentMode === 'Cash') cashSum += amt;
    else if (f.paymentMode === 'UPI') upiSum += amt;
    else if (f.paymentMode === 'Bank') bankSum += amt;

    return {
      sno: idx + 1,
      receiptNo: f.receiptNo,
      date: parseExcelDate(f.date),
      admissionId: f.admissionId,
      studentName: f.studentName,
      classSec: `${f.className}-${f.section}`,
      fatherName: f.fatherName,
      category: f.category,
      feeMonth: f.feeMonth,
      paymentMode: f.paymentMode,
      amount: amt,
      remarks: f.remarks || '—',
    };
  });

  const subtitleParts = [
    categoryFilter === 'ALL' ? 'All Categories' : `${categoryFilter} Fee`,
    modeFilter === 'ALL' ? 'All Payment Modes' : modeFilter,
    isPartialSelection ? `Selected ${fees.length} Receipts` : '',
  ].filter(Boolean);

  populateStyledWorksheet({
    workbook,
    sheetName: 'Fee_Receipts_Ledger',
    schoolProfile,
    activeSession,
    reportTitle: 'FEE COLLECTION & RECEIPT LEDGER REGISTER',
    reportMetaSubtitle: subtitleParts.join(' • '),
    columns,
    rows,
    buildSummaryRows: ({ firstDataRow: r1, lastDataRow: r2, rowCount }) => [
      {
        cells: [
          { colIndex: 2, value: 'TOTAL FEE COLLECTED', align: 'left' },
          {
            colIndex: 5,
            formula: `COUNTA(E${r1}:E${r2})`,
            result: rowCount,
            numFmt: '0" Receipts"',
            align: 'left',
          },
          {
            colIndex: 11,
            formula: `SUM(K${r1}:K${r2})`,
            result: totalCollected,
            numFmt: NUMFMT_INR,
            align: 'right',
            textColorArgb: ARGB_TEXT_EMERALD,
          },
        ],
      },
      {
        cells: [
          { colIndex: 2, value: 'MODE TOTALS & AVG', align: 'left' },
          { colIndex: 4, value: 'Cash:', align: 'right' },
          {
            colIndex: 5,
            formula: `SUMIF(J${r1}:J${r2},"Cash",K${r1}:K${r2})`,
            result: cashSum,
            numFmt: NUMFMT_INR,
            align: 'left',
          },
          { colIndex: 6, value: 'UPI:', align: 'right' },
          {
            colIndex: 7,
            formula: `SUMIF(J${r1}:J${r2},"UPI",K${r1}:K${r2})`,
            result: upiSum,
            numFmt: NUMFMT_INR,
            align: 'left',
          },
          { colIndex: 8, value: 'Bank:', align: 'right' },
          {
            colIndex: 9,
            formula: `SUMIF(J${r1}:J${r2},"Bank",K${r1}:K${r2})`,
            result: bankSum,
            numFmt: NUMFMT_INR,
            align: 'left',
          },
          { colIndex: 10, value: 'Avg Receipt:', align: 'right' },
          {
            colIndex: 11,
            formula: `AVERAGE(K${r1}:K${r2})`,
            result: rowCount > 0 ? totalCollected / rowCount : 0,
            numFmt: NUMFMT_INR,
            align: 'right',
          },
        ],
      },
    ],
  });

  const filename = buildDynamicExcelFilename(
    schoolProfile,
    'Fee_Receipts',
    [
      categoryFilter === 'ALL' ? 'All_Heads' : categoryFilter,
      modeFilter === 'ALL' ? '' : modeFilter,
      isPartialSelection ? `Selected_${fees.length}` : '',
    ],
    activeSession
  );

  return finalizeAndDownloadWorkbook(workbook, filename, fees.length, t0);
}

// ============================================================================
// 4B. AUTOMATED FEE DUES REGISTER EXPORTER (FeeModule — Dues Tab)
// ============================================================================

export async function exportFeeDuesToExcel(params: {
  summaries: StudentDueSummary[];
  cutoffMonth: FeeMonth;
  classFilter: string;
  rosterMode: 'active' | 'frozen';
  schoolProfile: SchoolProfileSettings;
  activeSession: string;
  isPartialSelection: boolean;
}): Promise<ExcelExportResult> {
  const t0 = performance.now();
  await yieldToBrowserFrame();

  const {
    summaries,
    cutoffMonth,
    classFilter,
    rosterMode,
    schoolProfile,
    activeSession,
    isPartialSelection,
  } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = schoolProfile.schoolName || 'RB Public School ERP';
  workbook.created = new Date();

  const columns: ColumnSpec[] = [
    { header: 'S.No', key: 'sno', align: 'center', numFmt: NUMFMT_INT, minWidth: 7 }, // A (1)
    { header: 'Admission ID', key: 'admissionId', align: 'center', minWidth: 13 }, // B (2)
    { header: 'Student Name', key: 'name', align: 'left', minWidth: 22 }, // C (3)
    { header: 'Class & Sec', key: 'classSec', align: 'center', minWidth: 12 }, // D (4)
    { header: 'Father Name', key: 'fatherName', align: 'left', minWidth: 19 }, // E (5)
    { header: 'Mobile', key: 'phone', align: 'center', minWidth: 14 }, // F (6)
    { header: 'Billing Status', key: 'status', align: 'center', minWidth: 14 }, // G (7)
    { header: 'Billable Mos', key: 'months', align: 'center', numFmt: NUMFMT_INT, minWidth: 13 }, // H (8)
    { header: 'Expected Fee (₹)', key: 'expected', align: 'right', numFmt: NUMFMT_INR, minWidth: 17 }, // I (9)
    { header: 'Total Paid (₹)', key: 'paid', align: 'right', numFmt: NUMFMT_INR, minWidth: 17 }, // J (10)
    { header: 'Net Due (₹)', key: 'netDue', align: 'right', numFmt: NUMFMT_INR, minWidth: 17 }, // K (11) Formula
    { header: 'Collection %', key: 'paidPct', align: 'right', numFmt: NUMFMT_PERCENT, minWidth: 14 }, // L (12) Formula
    { header: 'Unpaid Months / Breakdown', key: 'breakdown', align: 'left', minWidth: 28, maxWidth: 44 }, // M (13)
  ];

  const firstDataRow = 6;
  let sumExpected = 0;
  let sumPaid = 0;
  let sumDue = 0;
  let defaultersCount = 0;

  const rows = summaries.map((item, idx) => {
    const excelRow = firstDataRow + idx;
    const { student } = item;
    const expected = item.isFeeFrozen ? 0 : Number(item.totalExpected) || 0;
    const paid = Number(item.totalPaidAll) || 0;
    const due = item.isFeeFrozen ? 0 : Math.max(0, expected - paid);
    const pct = expected > 0 ? Math.min(1, paid / expected) : 1;

    sumExpected += expected;
    sumPaid += paid;
    sumDue += due;
    if (due > 0) defaultersCount += 1;

    const unpaidList = item.isFeeFrozen
      ? 'Fee Frozen (Deactive)'
      : item.unpaidTuitionMonths.length > 0
      ? `Unpaid Tuition: ${item.unpaidTuitionMonths.map((m) => m.slice(0, 3)).join(', ')}`
      : due > 0
      ? 'Admission / Bus Balance Pending'
      : 'All Billed Heads Cleared';

    return {
      sno: idx + 1,
      admissionId: student.admissionId,
      name: student.name,
      classSec: `${student.className}-${student.section}`,
      fatherName: student.fatherName,
      phone: student.phone,
      status: item.isFeeFrozen ? 'Frozen' : due > 0 ? 'Pending Due' : 'Cleared',
      months: item.billableMonths.length,
      expected,
      paid,
      netDue: {
        formula: `IF(G${excelRow}="Frozen",0,MAX(0,I${excelRow}-J${excelRow}))`,
        result: due,
      },
      paidPct: {
        formula: `IF(I${excelRow}>0,MIN(1,J${excelRow}/I${excelRow}),1)`,
        result: pct,
      },
      breakdown: unpaidList,
    };
  });

  const clsTitle = classFilter === 'ALL' ? 'All Classes' : `Class ${classFilter}`;

  populateStyledWorksheet({
    workbook,
    sheetName: 'Fee_Dues_Register',
    schoolProfile,
    activeSession,
    reportTitle: `STUDENT FEE DUES & COLLECTION STATUS (UP TO ${cutoffMonth.toUpperCase()})`,
    reportMetaSubtitle: `${clsTitle} • ${
      rosterMode === 'frozen' ? 'Fee-Frozen Archive' : 'Active Roster'
    }${isPartialSelection ? ` • Selected ${summaries.length}` : ''}`,
    columns,
    rows,
    buildSummaryRows: ({ firstDataRow: r1, lastDataRow: r2, rowCount }) => [
      {
        cells: [
          { colIndex: 2, value: 'GRAND TOTALS', align: 'left' },
          {
            colIndex: 3,
            formula: `COUNTA(C${r1}:C${r2})`,
            result: rowCount,
            numFmt: '0" Students"',
            align: 'left',
          },
          {
            colIndex: 7,
            formula: `COUNTIF(K${r1}:K${r2},">0")`,
            result: defaultersCount,
            numFmt: '0" Defaulters"',
            align: 'center',
            textColorArgb: defaultersCount > 0 ? ARGB_TEXT_ROSE : ARGB_TEXT_EMERALD,
          },
          { colIndex: 9, formula: `SUM(I${r1}:I${r2})`, result: sumExpected, numFmt: NUMFMT_INR, align: 'right' },
          {
            colIndex: 10,
            formula: `SUM(J${r1}:J${r2})`,
            result: sumPaid,
            numFmt: NUMFMT_INR,
            align: 'right',
            textColorArgb: ARGB_TEXT_EMERALD,
          },
          {
            colIndex: 11,
            formula: `SUM(K${r1}:K${r2})`,
            result: sumDue,
            numFmt: NUMFMT_INR,
            align: 'right',
            textColorArgb: sumDue > 0 ? ARGB_TEXT_ROSE : ARGB_TEXT_EMERALD,
          },
          {
            colIndex: 12,
            formula: `IF(I${r2 + 1}>0,J${r2 + 1}/I${r2 + 1},1)`,
            result: sumExpected > 0 ? sumPaid / sumExpected : 1,
            numFmt: NUMFMT_PERCENT,
            align: 'right',
          },
        ],
      },
    ],
  });

  const filename = buildDynamicExcelFilename(
    schoolProfile,
    'Fee_Dues',
    [
      classFilter === 'ALL' ? 'All_Classes' : `Class_${classFilter}`,
      `Thru_${cutoffMonth}`,
      isPartialSelection ? `Selected_${summaries.length}` : '',
    ],
    activeSession
  );

  return finalizeAndDownloadWorkbook(workbook, filename, summaries.length, t0);
}

// ============================================================================
// 4C. CLASS FEE STRUCTURE SCHEDULE EXPORTER (FeeModule — Structure Tab)
// ============================================================================

export async function exportFeeStructureToExcel(params: {
  schedules: ClassSessionFeeRate[];
  schoolProfile: SchoolProfileSettings;
  sessionName: string;
}): Promise<ExcelExportResult> {
  const t0 = performance.now();
  await yieldToBrowserFrame();

  const { schedules, schoolProfile, sessionName } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = schoolProfile.schoolName || 'RB Public School ERP';
  workbook.created = new Date();

  const columns: ColumnSpec[] = [
    { header: 'S.No', key: 'sno', align: 'center', numFmt: NUMFMT_INT, minWidth: 8 }, // A (1)
    { header: 'Class', key: 'className', align: 'center', minWidth: 16 }, // B (2)
    { header: 'Academic Session', key: 'session', align: 'center', minWidth: 18 }, // C (3)
    { header: 'Admission Fee (₹)', key: 'adm', align: 'right', numFmt: NUMFMT_INR, minWidth: 20 }, // D (4)
    { header: 'Monthly Tuition Fee (₹)', key: 'tuition', align: 'right', numFmt: NUMFMT_INR, minWidth: 22 }, // E (5)
    { header: 'Annual Exam Fee (₹)', key: 'exam', align: 'right', numFmt: NUMFMT_INR, minWidth: 20 }, // F (6)
    { header: '12-Month Annual Total (₹)', key: 'annualTotal', align: 'right', numFmt: NUMFMT_INR, minWidth: 24 }, // G (7)
  ];

  const firstDataRow = 6;
  let sumAnnual = 0;

  const rows = schedules.map((s, idx) => {
    const excelRow = firstDataRow + idx;
    const annual = s.admissionFee + s.monthlyTuitionFee * 12 + s.annualExamFee;
    sumAnnual += annual;
    return {
      sno: idx + 1,
      className: `Class ${s.className}`,
      session: s.academicSession,
      adm: s.admissionFee,
      tuition: s.monthlyTuitionFee,
      exam: s.annualExamFee,
      annualTotal: {
        formula: `D${excelRow}+(E${excelRow}*12)+F${excelRow}`,
        result: annual,
      },
    };
  });

  populateStyledWorksheet({
    workbook,
    sheetName: 'Class_Fee_Structure',
    schoolProfile,
    activeSession: sessionName,
    reportTitle: `OFFICIAL CLASS-WISE FEE MASTER SCHEDULE — SESSION ${sessionName}`,
    columns,
    rows,
    buildSummaryRows: ({ firstDataRow: r1, lastDataRow: r2, rowCount }) => [
      {
        cells: [
          { colIndex: 2, value: 'SCHOOL AVERAGE', align: 'left' },
          { colIndex: 4, formula: `AVERAGE(D${r1}:D${r2})`, result: 0, numFmt: NUMFMT_INR, align: 'right' },
          { colIndex: 5, formula: `AVERAGE(E${r1}:E${r2})`, result: 0, numFmt: NUMFMT_INR, align: 'right' },
          { colIndex: 6, formula: `AVERAGE(F${r1}:F${r2})`, result: 0, numFmt: NUMFMT_INR, align: 'right' },
          {
            colIndex: 7,
            formula: `AVERAGE(G${r1}:G${r2})`,
            result: rowCount > 0 ? sumAnnual / rowCount : 0,
            numFmt: NUMFMT_INR,
            align: 'right',
          },
        ],
      },
    ],
  });

  const filename = buildDynamicExcelFilename(
    schoolProfile,
    'Fee_Structure',
    ['All_Classes'],
    sessionName
  );
  return finalizeAndDownloadWorkbook(workbook, filename, schedules.length, t0);
}

// ============================================================================
// 5. MARKS & EXAM RESULTS EXPORTER (ExamsModule — Marks & Marksheets Tabs)
// ============================================================================

export interface ExamExportRowInput {
  student: StudentRecord;
  rollNumber: string;
  section: string;
  marksheet: StudentExamMarksheet | null;
  draftSubjectScores?: Record<string, { value: string; isAbsent: boolean }>;
}

export async function exportExamResultsToExcel(params: {
  exam: ExamDefinition;
  items: ExamExportRowInput[];
  sectionFilter: string;
  schoolProfile: SchoolProfileSettings;
  isPartialSelection: boolean;
  modeLabel?: 'Exam_Results' | 'Marks_Sheet';
}): Promise<ExcelExportResult> {
  const t0 = performance.now();
  await yieldToBrowserFrame();

  const {
    exam,
    items,
    sectionFilter,
    schoolProfile,
    isPartialSelection,
    modeLabel = 'Exam_Results',
  } = params;

  const sortedSubjects = sortExamSubjects(exam.subjects);
  const totalExamMax = sortedSubjects.reduce((acc, s) => acc + (Number(s.maxMarks) || 0), 0);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = schoolProfile.schoolName || 'RB Public School ERP';
  workbook.created = new Date();

  // Dynamic Columns: Fixed Info + Subject Columns + Formula Summary Columns
  // Col 1: S.No (A)
  // Col 2: Roll No (B)
  // Col 3: Admission ID (C)
  // Col 4: Student Name (D)
  // Col 5: Father Name (E)
  // Col 6: Class-Sec (F)
  // Col 7..(6+N): Subject_i
  // Col 7+N: Marks Obtained (=SUM)
  // Col 8+N: Max Marks
  // Col 9+N: Percentage (=Obtained/Max, 0.0%)
  // Col 10+N: Grade
  // Col 11+N: Result (PASSED / FAILED / PENDING)
  // Col 12+N: Remarks

  const subjectColumns: ColumnSpec[] = sortedSubjects.map((sub, sIdx) => ({
    header: `${sub.subjectName} (/${sub.maxMarks})`,
    key: `sub_${sIdx}`,
    align: 'right' as HorizontalAlign,
    numFmt: '0.##',
    minWidth: Math.max(14, sub.subjectName.length + 8),
  }));

  const columns: ColumnSpec[] = [
    { header: 'S.No', key: 'sno', align: 'center', numFmt: NUMFMT_INT, minWidth: 7 },
    { header: 'Roll No', key: 'rollNo', align: 'center', minWidth: 11 },
    { header: 'Admission ID', key: 'admissionId', align: 'center', minWidth: 13 },
    { header: 'Student Name', key: 'name', align: 'left', minWidth: 22 },
    { header: 'Father Name', key: 'fatherName', align: 'left', minWidth: 19 },
    { header: 'Class-Sec', key: 'classSec', align: 'center', minWidth: 11 },
    ...subjectColumns,
    { header: 'Total Obtained', key: 'totalObtained', align: 'right', numFmt: '0.##', minWidth: 16 },
    { header: 'Max Marks', key: 'totalMax', align: 'right', numFmt: NUMFMT_INT, minWidth: 13 },
    { header: 'Percentage', key: 'percentage', align: 'right', numFmt: NUMFMT_PERCENT, minWidth: 14 },
    { header: 'Grade', key: 'grade', align: 'center', minWidth: 10 },
    { header: 'Result', key: 'result', align: 'center', minWidth: 13 },
    { header: 'Remarks', key: 'remarks', align: 'left', minWidth: 24, maxWidth: 42 },
  ];

  const firstSubColIdx = 7; // Column G
  const lastSubColIdx = 6 + sortedSubjects.length;
  const totalObtColIdx = lastSubColIdx + 1;
  const totalMaxColIdx = lastSubColIdx + 2;
  const pctColIdx = lastSubColIdx + 3;
  const gradeColIdx = lastSubColIdx + 4;
  const resultColIdx = lastSubColIdx + 5;

  const firstSubLetter = colIndexToLetter(firstSubColIdx);
  const lastSubLetter = colIndexToLetter(Math.max(firstSubColIdx, lastSubColIdx));
  const obtLetter = colIndexToLetter(totalObtColIdx);
  const maxLetter = colIndexToLetter(totalMaxColIdx);
  const pctLetter = colIndexToLetter(pctColIdx);
  const resultLetter = colIndexToLetter(resultColIdx);

  const firstDataRow = 6;
  const subjectSums = sortedSubjects.map(() => 0);
  const subjectCounts = sortedSubjects.map(() => 0);
  let sumObtainedAll = 0;
  let gradedCount = 0;
  let passedCount = 0;
  let failedCount = 0;

  const rows = items.map((entry, idx) => {
    const excelRow = firstDataRow + idx;
    const { student, rollNumber, section, marksheet, draftSubjectScores } = entry;

    const rowObj: Record<string, unknown> = {
      sno: idx + 1,
      rollNo: rollNumber,
      admissionId: student.admissionId,
      name: student.name,
      fatherName: student.fatherName,
      classSec: `${exam.className}-${section}`,
    };

    let rowSum = 0;
    let hasAllMarks = true;
    let failedPaper = false;

    sortedSubjects.forEach((sub, sIdx) => {
      const savedSub = marksheet?.subjectMarks.find((sm) => sm.subjectId === sub.id);
      const draftSub = draftSubjectScores?.[sub.id];

      if (savedSub) {
        if (savedSub.isAbsent) {
          rowObj[`sub_${sIdx}`] = 'AB';
          failedPaper = true;
        } else {
          const val = Number(savedSub.marksObtained) || 0;
          rowObj[`sub_${sIdx}`] = val;
          rowSum += val;
          subjectSums[sIdx] += val;
          subjectCounts[sIdx] += 1;
          if (val < sub.minMarks) failedPaper = true;
        }
      } else if (draftSub && (draftSub.isAbsent || draftSub.value.trim() !== '')) {
        if (draftSub.isAbsent) {
          rowObj[`sub_${sIdx}`] = 'AB';
          failedPaper = true;
        } else {
          const val = Number(draftSub.value) || 0;
          rowObj[`sub_${sIdx}`] = val;
          rowSum += val;
          subjectSums[sIdx] += val;
          subjectCounts[sIdx] += 1;
          if (val < sub.minMarks) failedPaper = true;
        }
      } else {
        rowObj[`sub_${sIdx}`] = '';
        hasAllMarks = false;
      }
    });

    const pctDecimal = totalExamMax > 0 ? rowSum / totalExamMax : 0;

    let resultStatus = 'PENDING';
    let gradeStr = '—';
    if (marksheet) {
      resultStatus = marksheet.passed ? 'PASSED' : 'FAILED';
      gradeStr = marksheet.overallGrade;
    } else if (hasAllMarks && sortedSubjects.length > 0) {
      resultStatus = failedPaper ? 'FAILED' : 'PASSED';
      const pct100 = pctDecimal * 100;
      gradeStr = failedPaper
        ? 'E'
        : pct100 >= 90
        ? 'A+'
        : pct100 >= 80
        ? 'A'
        : pct100 >= 70
        ? 'B+'
        : pct100 >= 60
        ? 'B'
        : pct100 >= 50
        ? 'C'
        : 'D';
    }

    if (resultStatus === 'PASSED') {
      gradedCount += 1;
      passedCount += 1;
      sumObtainedAll += rowSum;
    } else if (resultStatus === 'FAILED') {
      gradedCount += 1;
      failedCount += 1;
      sumObtainedAll += rowSum;
    }

    rowObj.totalObtained =
      sortedSubjects.length > 0
        ? {
            formula: `SUM(${firstSubLetter}${excelRow}:${lastSubLetter}${excelRow})`,
            result: rowSum,
          }
        : rowSum;
    rowObj.totalMax = totalExamMax;
    rowObj.percentage = {
      formula: `IF(${maxLetter}${excelRow}>0,${obtLetter}${excelRow}/${maxLetter}${excelRow},0)`,
      result: pctDecimal,
    };
    rowObj.grade = gradeStr;
    rowObj.result = resultStatus;
    rowObj.remarks = marksheet?.remarks || (resultStatus === 'PENDING' ? 'Marks Pending' : '');

    return rowObj;
  });

  const secSubtitle = sectionFilter === 'ALL' ? 'All Sections' : `Section ${sectionFilter}`;

  populateStyledWorksheet({
    workbook,
    sheetName: `${exam.examCode}_Class_${exam.className}`,
    schoolProfile,
    activeSession: exam.academicSession,
    reportTitle: `${exam.examName.toUpperCase()} — CLASS ${exam.className} RESULT & MARKSHEET REGISTER`,
    reportMetaSubtitle: `${secSubtitle} • Session ${exam.academicSession}${
      isPartialSelection ? ` • Selected ${items.length} Students` : ''
    }`,
    columns,
    rows,
    buildSummaryRows: ({ firstDataRow: r1, lastDataRow: r2, rowCount }) => {
      const avgSubjectCells: SummaryRowCell[] = sortedSubjects.map((_, sIdx) => {
        const colIdx = firstSubColIdx + sIdx;
        const colLet = colIndexToLetter(colIdx);
        const avg = subjectCounts[sIdx] > 0 ? subjectSums[sIdx] / subjectCounts[sIdx] : 0;
        return {
          colIndex: colIdx,
          formula: `IFERROR(AVERAGE(${colLet}${r1}:${colLet}${r2}),0)`,
          result: Number(avg.toFixed(1)),
          numFmt: '0.0',
          align: 'right',
        };
      });

      const avgObtained = gradedCount > 0 ? sumObtainedAll / gradedCount : 0;
      const avgPct = totalExamMax > 0 ? avgObtained / totalExamMax : 0;
      const passRate = gradedCount > 0 ? passedCount / gradedCount : 0;

      return [
        {
          cells: [
            { colIndex: 2, value: 'CLASS AVERAGES', align: 'left' },
            {
              colIndex: 4,
              formula: `COUNTA(D${r1}:D${r2})`,
              result: rowCount,
              numFmt: '0" Candidates"',
              align: 'left',
            },
            ...avgSubjectCells,
            {
              colIndex: totalObtColIdx,
              formula: `IFERROR(AVERAGE(${obtLetter}${r1}:${obtLetter}${r2}),0)`,
              result: Number(avgObtained.toFixed(1)),
              numFmt: '0.0',
              align: 'right',
            },
            {
              colIndex: totalMaxColIdx,
              value: totalExamMax,
              numFmt: NUMFMT_INT,
              align: 'right',
            },
            {
              colIndex: pctColIdx,
              formula: `IFERROR(AVERAGE(${pctLetter}${r1}:${pctLetter}${r2}),0)`,
              result: avgPct,
              numFmt: NUMFMT_PERCENT,
              align: 'right',
              textColorArgb: ARGB_TEXT_EMERALD,
            },
            {
              colIndex: resultColIdx,
              formula: `COUNTIF(${resultLetter}${r1}:${resultLetter}${r2},"PASSED")`,
              result: passedCount,
              numFmt: '0" Passed"',
              align: 'center',
              textColorArgb: ARGB_TEXT_EMERALD,
            },
          ],
        },
        {
          cells: [
            { colIndex: 2, value: 'PASS / FAIL SUMMARY', align: 'left' },
            { colIndex: gradeColIdx, value: 'Pass Rate:', align: 'right' },
            {
              colIndex: pctColIdx,
              formula: `IF((COUNTIF(${resultLetter}${r1}:${resultLetter}${r2},"PASSED")+COUNTIF(${resultLetter}${r1}:${resultLetter}${r2},"FAILED"))>0,COUNTIF(${resultLetter}${r1}:${resultLetter}${r2},"PASSED")/(COUNTIF(${resultLetter}${r1}:${resultLetter}${r2},"PASSED")+COUNTIF(${resultLetter}${r1}:${resultLetter}${r2},"FAILED")),0)`,
              result: passRate,
              numFmt: NUMFMT_PERCENT,
              align: 'right',
              textColorArgb: ARGB_TEXT_EMERALD,
            },
            {
              colIndex: resultColIdx,
              formula: `COUNTIF(${resultLetter}${r1}:${resultLetter}${r2},"FAILED")`,
              result: failedCount,
              numFmt: '0" Failed"',
              align: 'center',
              textColorArgb: failedCount > 0 ? ARGB_TEXT_ROSE : ARGB_TEXT_MUTED,
            },
          ],
        },
      ];
    },
  });

  const filename = buildDynamicExcelFilename(
    schoolProfile,
    modeLabel,
    [
      exam.examName,
      `Class_${exam.className}`,
      sectionFilter === 'ALL' ? '' : `Sec_${sectionFilter}`,
      isPartialSelection ? `Selected_${items.length}` : '',
    ],
    exam.academicSession
  );

  return finalizeAndDownloadWorkbook(workbook, filename, items.length, t0);
}
