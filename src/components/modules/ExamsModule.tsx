import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Plus,
  Printer,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Download,
  Upload,
  FileSpreadsheet,
  Calendar,
  Clock,
  Search,
  Save,
  FileText,
  IdCard,
  AlertTriangle,
} from 'lucide-react';
import { useSchool, BulkStudentMarksInput } from '../../context/SchoolContext';
import { useRowSelection } from '../../hooks/useRowSelection';
import {
  ExamDefinition,
  StudentExamMarksheet,
  StudentRecord,
} from '../../types/erp';
import {
  exportExamResultsToExcel,
  ExamExportRowInput,
} from '../../utils/excelExporter';
import {
  COMMON_SUBJECT_PRESETS,
  computeExamGradeLetter,
  DEFAULT_EXAM_INSTRUCTIONS,
  EXAM_NAME_PRESETS,
  formatExamDayName,
  formatTimeSlot,
  RawSubjectMarkInput,
  resolveStudentRollNumber,
  sortExamSubjects,
} from '../../utils/examEngine';
import {
  downloadAdmitCardPdf,
  downloadClassAdmitCardsPdf,
  downloadMarksheetPdf,
} from '../../utils/examPdfGenerator';
import {
  ACADEMIC_SESSIONS,
  formatDateDisplay,
  getInitials,
  getTodayISO,
} from '../../utils/formatters';
import { QuickPhotoAttachmentControl } from '../QuickPhotoAttachmentControl';
import { ExcelExportBar, TableSelectCheckbox } from '../ui/ExcelExportControl';
import { ModalShell } from '../ui/ModalShell';

type ExamSubTab = 'schedules' | 'marks' | 'admit-cards' | 'marksheets';

interface DraftSubjectRow {
  id: string;
  subjectName: string;
  subjectCode: string;
  maxMarks: string;
  minMarks: string;
  examDate: string;
  startTime: string;
  endTime: string;
}

interface DraftCellState {
  value: string;
  isAbsent: boolean;
}

function addDaysISO(baseIso: string, daysToAdd: number): string {
  const parts = baseIso.split('-').map(Number);
  if (parts.length !== 3) return getTodayISO();
  const d = new Date(parts[0], parts[1] - 1, parts[2] + daysToAdd);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface ExamsModuleProps {
  initialMode?: 'exams' | 'admit-cards' | 'marksheets';
}

export const ExamsModule: React.FC<ExamsModuleProps> = ({ initialMode = 'exams' }) => {
  const {
    db,
    canAccessModule,
    canManageStudents,
    canManageMarks,
    canManageExamSchedules,
    canDeleteRecords,
    createExam,
    updateExam,
    deleteExam,
    saveStudentMarksheet,
    saveBulkExamMarksheets,
    deleteStudentMarksheet,
    openPrintPreview,
    requestConfirm,
    activeModule,
    setActiveModule,
    notify,
    aiCustomization,
    getEffectiveStudentPhoto,
    setTemporaryPhotoOverride,
    saveQuickPersonPhoto,
  } = useSchool();

  const [subTab, setSubTab] = useState<ExamSubTab>(() => {
    if (initialMode === 'admit-cards' && canAccessModule('admit-cards')) return 'admit-cards';
    if (initialMode === 'marksheets') return 'marksheets';
    if (canAccessModule('exams')) return 'schedules';
    return 'marks';
  });

  useEffect(() => {
    if (initialMode === 'admit-cards' && canAccessModule('admit-cards')) {
      setSubTab('admit-cards');
    } else if (initialMode === 'marksheets') {
      setSubTab('marksheets');
    } else if (initialMode === 'exams' && canAccessModule('exams')) {
      setSubTab((prev) => (prev === 'marks' && canManageMarks ? 'marks' : 'schedules'));
    } else if (!canAccessModule('exams') && subTab === 'schedules') {
      setSubTab('marks');
    }
  }, [initialMode, canAccessModule, canManageMarks, subTab]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [scheduleClassFilter, setScheduleClassFilter] = useState<string>('ALL');
  const [scheduleSessionFilter, setScheduleSessionFilter] = useState<string>('ALL');

  // Shared filters for Marks, Admit Cards, Marksheets views
  const [sectionFilter, setSectionFilter] = useState<string>('ALL');
  const [resultFilter, setResultFilter] = useState<'ALL' | 'PASSED' | 'FAILED' | 'PENDING'>('ALL');
  const [studentSearch, setStudentSearch] = useState<string>('');

  // Exam Creation / Edit Modal State
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<ExamDefinition | null>(null);
  const [examName, setExamName] = useState('');
  const [examClassName, setExamClassName] = useState(db.classes[0]?.className || 'Nursery');
  const [examSession, setExamSession] = useState(db.activeSession || '2026-2027');
  const [examCenter, setExamCenter] = useState(
    `${db.schoolProfile.schoolName || 'RB Public School'} — Main Campus`
  );
  const [examInstructions, setExamInstructions] = useState(DEFAULT_EXAM_INSTRUCTIONS);
  const [draftSubjects, setDraftSubjects] = useState<DraftSubjectRow[]>([]);
  const [examFormError, setExamFormError] = useState('');

  const availableSessionNames = useMemo(() => {
    const names = new Set<string>(db.sessions.map((s) => s.name));
    ACADEMIC_SESSIONS.forEach((s) => names.add(s));
    db.exams.forEach((ex) => {
      if (ex.academicSession) names.add(ex.academicSession);
    });
    return Array.from(names);
  }, [db.sessions, db.exams]);

  // Spreadsheet Bulk Marks Draft State: Record<studentId, Record<subjectId, DraftCellState>>
  const [marksGridDraft, setMarksGridDraft] = useState<
    Record<string, Record<string, DraftCellState>>
  >({});
  const [remarksDraft, setRemarksDraft] = useState<Record<string, string>>({});
  const [bulkMarksError, setBulkMarksError] = useState('');
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);

  // Single-Student Marks Upload Modal State
  const [singleMarkModalOpen, setSingleMarkModalOpen] = useState(false);
  const [singleMarkStudent, setSingleMarkStudent] = useState<StudentRecord | null>(null);
  const [singleSubjectInputs, setSingleSubjectInputs] = useState<
    Record<string, DraftCellState>
  >({});
  const [singleRemarksInput, setSingleRemarksInput] = useState('');
  const [singleMarkError, setSingleMarkError] = useState('');

  // Keep selectedExamId valid whenever db.exams changes
  useEffect(() => {
    if (db.exams.length === 0) {
      if (selectedExamId !== '') setSelectedExamId('');
      return;
    }
    if (!selectedExamId || !db.exams.some((e) => e.id === selectedExamId)) {
      setSelectedExamId(db.exams[0].id);
    }
  }, [db.exams, selectedExamId]);

  const activeExam = useMemo(
    () => db.exams.find((e) => e.id === selectedExamId) || null,
    [db.exams, selectedExamId]
  );

  // Hydrate marksGridDraft whenever activeExam or db.marksheets or db.students updates
  useEffect(() => {
    if (!activeExam) {
      setMarksGridDraft({});
      setRemarksDraft({});
      setBulkMarksError('');
      return;
    }
    const classStudents = db.students.filter(
      (s) => s.status !== 'Deactive' && s.className === activeExam.className
    );
    const existingMarksheets = db.marksheets.filter((m) => m.examId === activeExam.id);
    const msByStudent = new Map<string, StudentExamMarksheet>();
    existingMarksheets.forEach((m) => msByStudent.set(m.studentId, m));

    const nextGrid: Record<string, Record<string, DraftCellState>> = {};
    const nextRemarks: Record<string, string> = {};

    classStudents.forEach((stu) => {
      const existing = msByStudent.get(stu.id);
      const rowCells: Record<string, DraftCellState> = {};
      activeExam.subjects.forEach((sub) => {
        const savedSub = existing?.subjectMarks.find((sm) => sm.subjectId === sub.id);
        rowCells[sub.id] = {
          value: savedSub ? String(savedSub.marksObtained) : '',
          isAbsent: savedSub ? Boolean(savedSub.isAbsent) : false,
        };
      });
      nextGrid[stu.id] = rowCells;
      nextRemarks[stu.id] = existing?.customRemarks || '';
    });

    setMarksGridDraft(nextGrid);
    setRemarksDraft(nextRemarks);
    setBulkMarksError('');
  }, [activeExam, db.marksheets, db.students]);

  const filteredExams = useMemo(() => {
    return db.exams.filter((ex) => {
      if (scheduleClassFilter !== 'ALL' && ex.className !== scheduleClassFilter) return false;
      if (scheduleSessionFilter !== 'ALL' && ex.academicSession !== scheduleSessionFilter) {
        return false;
      }
      return true;
    });
  }, [db.exams, scheduleClassFilter, scheduleSessionFilter]);

  const marksheetByStudentId = useMemo(() => {
    const map = new Map<string, StudentExamMarksheet>();
    if (!activeExam) return map;
    db.marksheets
      .filter((m) => m.examId === activeExam.id)
      .forEach((m) => map.set(m.studentId, m));
    return map;
  }, [activeExam, db.marksheets]);

  // Active students currently enrolled in activeExam.className (for Marks Upload & Admit Cards)
  const activeExamStudents = useMemo(() => {
    if (!activeExam) return [];
    const q = studentSearch.trim().toLowerCase();
    return db.students
      .filter((s) => {
        if (s.status === 'Deactive') return false;
        if (s.className !== activeExam.className) return false;
        if (sectionFilter !== 'ALL' && s.section !== sectionFilter) return false;
        if (q) {
          const roll = resolveStudentRollNumber(s, db.students).toLowerCase();
          const match =
            s.name.toLowerCase().includes(q) ||
            s.admissionId.toLowerCase().includes(q) ||
            roll.includes(q) ||
            s.fatherName.toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      })
      .map((s) => ({
        ...s,
        photoDataUrl: getEffectiveStudentPhoto(s),
      }))
      .sort((a, b) => {
        const secCmp = a.section.localeCompare(b.section);
        if (secCmp !== 0) return secCmp;
        return a.admissionId.localeCompare(b.admissionId, undefined, { numeric: true });
      });
  }, [activeExam, db.students, sectionFilter, studentSearch, getEffectiveStudentPhoto]);

  // Marksheets roster: includes active class students PLUS promoted/archived students who have saved marksheets for this exam
  const marksheetCandidateStudents = useMemo(() => {
    if (!activeExam) return [];
    const q = studentSearch.trim().toLowerCase();
    return db.students
      .filter((s) => {
        const savedMs = marksheetByStudentId.get(s.id);
        const isCurrentActiveInClass =
          s.status !== 'Deactive' && s.className === activeExam.className;
        if (!isCurrentActiveInClass && !savedMs) return false;

        const effectiveSection = savedMs ? savedMs.section : s.section;
        if (sectionFilter !== 'ALL' && effectiveSection !== sectionFilter) return false;

        if (q) {
          const roll = (
            savedMs ? savedMs.rollNumber : resolveStudentRollNumber(s, db.students)
          ).toLowerCase();
          const match =
            s.name.toLowerCase().includes(q) ||
            s.admissionId.toLowerCase().includes(q) ||
            roll.includes(q) ||
            s.fatherName.toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      })
      .map((s) => ({
        ...s,
        photoDataUrl: getEffectiveStudentPhoto(s),
      }))
      .sort((a, b) => {
        const secA = marksheetByStudentId.get(a.id)?.section || a.section;
        const secB = marksheetByStudentId.get(b.id)?.section || b.section;
        const secCmp = secA.localeCompare(secB);
        if (secCmp !== 0) return secCmp;
        return a.admissionId.localeCompare(b.admissionId, undefined, { numeric: true });
      });
  }, [activeExam, db.students, marksheetByStudentId, sectionFilter, studentSearch, getEffectiveStudentPhoto]);

  const activeExamSections = useMemo(() => {
    if (!activeExam) return ['A', 'B', 'C'];
    const cls = db.classes.find((c) => c.className === activeExam.className);
    return cls && cls.sections.length > 0 ? cls.sections : ['A', 'B', 'C'];
  }, [activeExam, db.classes]);

  // =========================================================================
  // EXAM CREATION & EDITING HANDLERS
  // =========================================================================

  const createBlankSubjectRow = (
    indexOffset = 0,
    preset?: { name: string; code: string; defaultMax: number; defaultMin: number }
  ): DraftSubjectRow => ({
    id: `sub-${Date.now()}-${indexOffset}-${Math.random().toString(36).slice(2, 6)}`,
    subjectName: preset?.name || '',
    subjectCode: preset?.code || '',
    maxMarks: String(preset?.defaultMax ?? 100),
    minMarks: String(preset?.defaultMin ?? 33),
    examDate: addDaysISO(getTodayISO(), indexOffset),
    startTime: '09:00',
    endTime: '12:00',
  });

  const openCreateExamModal = () => {
    setEditingExam(null);
    setExamName('');
    setExamClassName(db.classes[0]?.className || 'Nursery');
    setExamSession(db.activeSession || '2026-2027');
    setExamCenter(`${db.schoolProfile.schoolName || 'RB Public School'} — Main Campus`);
    setExamInstructions(DEFAULT_EXAM_INSTRUCTIONS);
    // Start with the 4 core school subjects pre-mapped as editable rows for convenience
    setDraftSubjects(
      COMMON_SUBJECT_PRESETS.slice(0, 4).map((preset, idx) => createBlankSubjectRow(idx, preset))
    );
    setExamFormError('');
    setExamModalOpen(true);
  };

  const openEditExamModal = (exam: ExamDefinition) => {
    setEditingExam(exam);
    setExamName(exam.examName);
    setExamClassName(exam.className);
    setExamSession(exam.academicSession);
    setExamCenter(exam.examCenter);
    setExamInstructions(exam.instructions);
    setDraftSubjects(
      sortExamSubjects(exam.subjects).map((sub) => ({
        id: sub.id,
        subjectName: sub.subjectName,
        subjectCode: sub.subjectCode,
        maxMarks: String(sub.maxMarks),
        minMarks: String(sub.minMarks),
        examDate: sub.examDate,
        startTime: sub.startTime,
        endTime: sub.endTime,
      }))
    );
    setExamFormError('');
    setExamModalOpen(true);
  };

  const addDraftSubject = (preset?: {
    name: string;
    code: string;
    defaultMax: number;
    defaultMin: number;
  }) => {
    if (
      preset &&
      draftSubjects.some((s) => s.subjectName.trim().toLowerCase() === preset.name.toLowerCase())
    ) {
      setExamFormError(`"${preset.name}" is already mapped in this exam schedule.`);
      return;
    }
    setExamFormError('');
    setDraftSubjects((prev) => [...prev, createBlankSubjectRow(prev.length, preset)]);
  };

  const updateDraftSubject = (
    id: string,
    field: keyof DraftSubjectRow,
    value: string
  ) => {
    setExamFormError('');
    setDraftSubjects((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const removeDraftSubject = (id: string) => {
    setDraftSubjects((prev) => prev.filter((row) => row.id !== id));
  };

  const handleSaveExam = (e: React.FormEvent) => {
    e.preventDefault();
    setExamFormError('');

    if (!examName.trim()) {
      setExamFormError('Please enter an Exam Name (e.g., Half-Yearly Examination).');
      return;
    }
    if (draftSubjects.length === 0) {
      setExamFormError('Map at least one subject to create the examination schedule.');
      return;
    }

    const seenNames = new Set<string>();
    const validatedSubjects = [];

    for (let i = 0; i < draftSubjects.length; i++) {
      const s = draftSubjects[i];
      const cleanSubName = s.subjectName.trim();
      if (!cleanSubName) {
        setExamFormError(`Subject Name is required in row #${i + 1}.`);
        return;
      }
      const lower = cleanSubName.toLowerCase();
      if (seenNames.has(lower)) {
        setExamFormError(`Duplicate subject "${cleanSubName}" found. Each subject must be unique.`);
        return;
      }
      seenNames.add(lower);

      const maxM = Number(s.maxMarks);
      const minM = Number(s.minMarks);
      if (!Number.isFinite(maxM) || maxM <= 0) {
        setExamFormError(`Maximum Marks for ${cleanSubName} must be greater than 0.`);
        return;
      }
      if (!Number.isFinite(minM) || minM < 0 || minM > maxM) {
        setExamFormError(
          `Minimum Passing Marks for ${cleanSubName} must be between 0 and Maximum Marks (${maxM}).`
        );
        return;
      }
      if (!s.examDate) {
        setExamFormError(`Please select an Exam Date for ${cleanSubName}.`);
        return;
      }
      if (!s.startTime || !s.endTime) {
        setExamFormError(`Please specify both Start Time and End Time for ${cleanSubName}.`);
        return;
      }

      validatedSubjects.push({
        id: s.id,
        subjectName: cleanSubName,
        subjectCode: s.subjectCode.trim().toUpperCase(),
        maxMarks: maxM,
        minMarks: minM,
        examDate: s.examDate,
        startTime: s.startTime,
        endTime: s.endTime,
      });
    }

    const payload = {
      examName: examName.trim(),
      academicSession: examSession,
      className: examClassName,
      examCenter: examCenter.trim() || 'RB Public School — Main Campus',
      instructions: examInstructions.trim() || DEFAULT_EXAM_INSTRUCTIONS,
      subjects: validatedSubjects,
    };

    const result = editingExam
      ? updateExam(editingExam.id, payload)
      : createExam(payload);

    if (result) {
      setSelectedExamId(result.id);
      setExamModalOpen(false);
    }
  };

  // =========================================================================
  // STUDENT-WISE MARKS UPLOAD HANDLERS (GRID + SINGLE MODAL + CSV)
  // =========================================================================

  const handleGridCellChange = (studentId: string, subjectId: string, rawVal: string) => {
    setBulkMarksError('');
    setMarksGridDraft((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [subjectId]: {
          value: rawVal,
          isAbsent: false,
        },
      },
    }));
  };

  const handleGridToggleAbsent = (studentId: string, subjectId: string) => {
    setBulkMarksError('');
    setMarksGridDraft((prev) => {
      const currentCell = prev[studentId]?.[subjectId] || { value: '', isAbsent: false };
      const nextAbsent = !currentCell.isAbsent;
      return {
        ...prev,
        [studentId]: {
          ...(prev[studentId] || {}),
          [subjectId]: {
            value: nextAbsent ? '0' : '',
            isAbsent: nextAbsent,
          },
        },
      };
    });
  };

  const evaluateStudentDraftRow = (student: StudentRecord) => {
    if (!activeExam) {
      return {
        anyFilled: false,
        allFilled: false,
        hasInvalidMax: false,
        invalidMessage: '',
        totalObtained: 0,
        totalMax: 0,
        percentage: 0,
        passed: false,
        grade: '—',
      };
    }

    const cells = marksGridDraft[student.id] || {};
    let anyFilled = false;
    let allFilled = true;
    let hasInvalidMax = false;
    let invalidMessage = '';
    let totalObtained = 0;
    let totalMax = 0;
    let failedAnySubject = false;

    for (const sub of activeExam.subjects) {
      totalMax += sub.maxMarks;
      const cell = cells[sub.id];
      const isAbsent = Boolean(cell?.isAbsent);
      const valStr = cell?.value?.trim() ?? '';

      if (!isAbsent && valStr === '') {
        allFilled = false;
        continue;
      }

      anyFilled = true;
      const num = isAbsent ? 0 : Number(valStr);
      if (!Number.isFinite(num) || num < 0) {
        hasInvalidMax = true;
        invalidMessage = `${sub.subjectName} cannot be negative`;
      } else if (num > sub.maxMarks) {
        hasInvalidMax = true;
        invalidMessage = `${sub.subjectName} (${num}) exceeds Max Marks (${sub.maxMarks})`;
      } else {
        totalObtained += num;
        if (isAbsent || num < sub.minMarks) {
          failedAnySubject = true;
        }
      }
    }

    const percentage =
      totalMax > 0 ? Number(((totalObtained / totalMax) * 100).toFixed(2)) : 0;
    const passed = allFilled && !hasInvalidMax && !failedAnySubject;
    const grade = allFilled && !hasInvalidMax ? computeExamGradeLetter(percentage, passed) : '—';

    return {
      anyFilled,
      allFilled,
      hasInvalidMax,
      invalidMessage,
      totalObtained: Math.round(totalObtained * 100) / 100,
      totalMax,
      percentage,
      passed,
      grade,
    };
  };

  const handleSaveSingleRowFromGrid = (student: StudentRecord) => {
    if (!activeExam) return;
    setBulkMarksError('');
    const rowEval = evaluateStudentDraftRow(student);
    if (rowEval.hasInvalidMax) {
      setBulkMarksError(`${student.name}: ${rowEval.invalidMessage}.`);
      return;
    }
    if (!rowEval.allFilled) {
      setBulkMarksError(
        `Please enter marks (or mark AB) for all ${activeExam.subjects.length} subjects for ${student.name}.`
      );
      return;
    }

    const cells = marksGridDraft[student.id] || {};
    const scoresBySubjectId: Record<string, RawSubjectMarkInput> = {};
    activeExam.subjects.forEach((sub) => {
      const c = cells[sub.id];
      scoresBySubjectId[sub.id] = {
        marksObtained: c?.isAbsent ? 0 : Number(c?.value || 0),
        isAbsent: Boolean(c?.isAbsent),
      };
    });

    const res = saveStudentMarksheet({
      examId: activeExam.id,
      studentId: student.id,
      scoresBySubjectId,
      customRemarks: remarksDraft[student.id] || '',
    });

    if (!res.ok && res.error) {
      setBulkMarksError(res.error);
    }
  };

  const handleSaveAllEnteredMarks = () => {
    if (!activeExam) return;
    setBulkMarksError('');

    const entriesToSave: BulkStudentMarksInput[] = [];
    for (const stu of activeExamStudents) {
      const rowEval = evaluateStudentDraftRow(stu);
      if (!rowEval.anyFilled) continue;

      if (rowEval.hasInvalidMax) {
        setBulkMarksError(`${stu.name} (${stu.admissionId}): ${rowEval.invalidMessage}.`);
        return;
      }
      if (!rowEval.allFilled) {
        setBulkMarksError(
          `Incomplete marks for ${stu.name} (${stu.admissionId}). Enter marks for all mapped subjects or clear all cells for that student.`
        );
        return;
      }

      const cells = marksGridDraft[stu.id] || {};
      const scoresBySubjectId: Record<string, RawSubjectMarkInput> = {};
      activeExam.subjects.forEach((sub) => {
        const c = cells[sub.id];
        scoresBySubjectId[sub.id] = {
          marksObtained: c?.isAbsent ? 0 : Number(c?.value || 0),
          isAbsent: Boolean(c?.isAbsent),
        };
      });

      entriesToSave.push({
        studentId: stu.id,
        scoresBySubjectId,
        customRemarks: remarksDraft[stu.id],
      });
    }

    if (entriesToSave.length === 0) {
      setBulkMarksError(
        'Enter complete subject marks for at least one student before clicking Save All Marks.'
      );
      return;
    }

    const res = saveBulkExamMarksheets(activeExam.id, entriesToSave);
    if (!res.ok && res.error) {
      setBulkMarksError(res.error);
    }
  };

  // Single-Student Detailed Marks Modal
  const openSingleStudentMarksModal = (student: StudentRecord) => {
    if (!activeExam) return;
    setSingleMarkStudent(student);
    const existing = marksheetByStudentId.get(student.id);
    const inputs: Record<string, DraftCellState> = {};
    activeExam.subjects.forEach((sub) => {
      const gridCell = marksGridDraft[student.id]?.[sub.id];
      const savedSub = existing?.subjectMarks.find((sm) => sm.subjectId === sub.id);
      if (gridCell && (gridCell.value !== '' || gridCell.isAbsent)) {
        inputs[sub.id] = { ...gridCell };
      } else if (savedSub) {
        inputs[sub.id] = {
          value: String(savedSub.marksObtained),
          isAbsent: savedSub.isAbsent,
        };
      } else {
        inputs[sub.id] = { value: '', isAbsent: false };
      }
    });
    setSingleSubjectInputs(inputs);
    setSingleRemarksInput(existing?.customRemarks || remarksDraft[student.id] || '');
    setSingleMarkError('');
    setSingleMarkModalOpen(true);
  };

  const handleSaveSingleModal = (e: React.FormEvent, previewMarksheetAfter = false) => {
    e.preventDefault();
    if (!activeExam || !singleMarkStudent) return;
    setSingleMarkError('');

    const scoresBySubjectId: Record<string, RawSubjectMarkInput> = {};
    for (const sub of activeExam.subjects) {
      const cell = singleSubjectInputs[sub.id] || { value: '', isAbsent: false };
      if (!cell.isAbsent && cell.value.trim() === '') {
        setSingleMarkError(`Please enter marks for ${sub.subjectName} (Max: ${sub.maxMarks}).`);
        return;
      }
      const numeric = cell.isAbsent ? 0 : Number(cell.value);
      if (!Number.isFinite(numeric) || numeric < 0) {
        setSingleMarkError(`${sub.subjectName} marks cannot be negative.`);
        return;
      }
      if (numeric > sub.maxMarks) {
        setSingleMarkError(
          `${sub.subjectName} marks (${numeric}) cannot exceed Maximum Marks (${sub.maxMarks}).`
        );
        return;
      }
      scoresBySubjectId[sub.id] = {
        marksObtained: numeric,
        isAbsent: cell.isAbsent,
      };
    }

    const res = saveStudentMarksheet({
      examId: activeExam.id,
      studentId: singleMarkStudent.id,
      scoresBySubjectId,
      customRemarks: singleRemarksInput,
    });

    if (!res.ok) {
      setSingleMarkError(res.error || 'Failed to save marks.');
      return;
    }

    setSingleMarkModalOpen(false);
    if (previewMarksheetAfter && res.marksheet) {
      openPrintPreview({
        type: 'marksheet',
        marksheet: res.marksheet,
        student: singleMarkStudent,
        exam: activeExam,
      });
    }
  };

  // CSV Marks Template Export & CSV Upload
  const handleDownloadMarksCsvTemplate = () => {
    if (!activeExam) return;
    const classStudents = db.students
      .filter((s) => s.status !== 'Deactive' && s.className === activeExam.className)
      .sort((a, b) => a.admissionId.localeCompare(b.admissionId, undefined, { numeric: true }));

    const headers = [
      'AdmissionID',
      'RollNumber',
      'StudentName',
      'Section',
      ...activeExam.subjects.map((s) => `${s.subjectName} (Max ${s.maxMarks})`),
      'Remarks',
    ];

    const escapeCsv = (val: string) =>
      val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;

    const rows = classStudents.map((stu) => {
      const roll = resolveStudentRollNumber(stu, db.students);
      const existing = marksheetByStudentId.get(stu.id);
      const subCols = activeExam.subjects.map((sub) => {
        const sm = existing?.subjectMarks.find((x) => x.subjectId === sub.id);
        if (!sm) return '';
        return sm.isAbsent ? 'AB' : String(sm.marksObtained);
      });
      return [
        escapeCsv(stu.admissionId),
        escapeCsv(roll),
        escapeCsv(stu.name),
        escapeCsv(stu.section),
        ...subCols,
        escapeCsv(existing?.customRemarks || ''),
      ].join(',');
    });

    const csvContent = [headers.map(escapeCsv).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Marks_Template_${activeExam.examCode}_Class_${activeExam.className}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify(
      'info',
      'Marks CSV Template Downloaded',
      `Fill marks up to each subject's Max Marks (or 'AB' for absent) and upload.`
    );
  };

  const parseCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const handleCsvMarksUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeExam) return;
    setBulkMarksError('');
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length < 2) {
          setBulkMarksError('Uploaded CSV file contains no student mark rows.');
          return;
        }

        const classStudents = db.students.filter(
          (s) => s.status !== 'Deactive' && s.className === activeExam.className
        );
        const byAdmId = new Map<string, StudentRecord>();
        classStudents.forEach((s) => byAdmId.set(s.admissionId.toUpperCase(), s));

        const batchEntries: BulkStudentMarksInput[] = [];
        for (let r = 1; r < lines.length; r++) {
          const cols = parseCsvLine(lines[r]);
          const admId = (cols[0] || '').toUpperCase();
          if (!admId) continue;
          const student = byAdmId.get(admId);
          if (!student) continue;

          const scoresBySubjectId: Record<string, RawSubjectMarkInput> = {};
          for (let sIdx = 0; sIdx < activeExam.subjects.length; sIdx++) {
            const sub = activeExam.subjects[sIdx];
            const rawCell = (cols[4 + sIdx] || '').trim();
            if (rawCell === '') {
              setBulkMarksError(
                `CSV Row ${r + 1} (${student.name}): Missing marks for ${sub.subjectName}.`
              );
              return;
            }
            const isAb = rawCell.toUpperCase() === 'AB';
            const num = isAb ? 0 : Number(rawCell);
            if (!isAb && (!Number.isFinite(num) || num < 0)) {
              setBulkMarksError(
                `CSV Row ${r + 1} (${student.name}): Invalid mark "${rawCell}" for ${sub.subjectName}.`
              );
              return;
            }
            if (!isAb && num > sub.maxMarks) {
              setBulkMarksError(
                `CSV Row ${r + 1} (${student.name}): ${sub.subjectName} mark (${num}) exceeds Maximum Marks (${sub.maxMarks}).`
              );
              return;
            }
            scoresBySubjectId[sub.id] = {
              marksObtained: isAb ? 0 : num,
              isAbsent: isAb,
            };
          }

          const remarksCell = cols[4 + activeExam.subjects.length] || '';
          batchEntries.push({
            studentId: student.id,
            scoresBySubjectId,
            customRemarks: remarksCell,
          });
        }

        if (batchEntries.length === 0) {
          setBulkMarksError(
            `No matching Class ${activeExam.className} Admission IDs found in the uploaded CSV.`
          );
          return;
        }

        const result = saveBulkExamMarksheets(activeExam.id, batchEntries);
        if (!result.ok && result.error) {
          setBulkMarksError(result.error);
        }
      } finally {
        if (csvFileInputRef.current) {
          csvFileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  // =========================================================================
  // COMPUTED ANALYTICS FOR MARKSHEETS TAB
  // =========================================================================

  const marksheetRows = useMemo(() => {
    return marksheetCandidateStudents
      .map((student) => {
        const marksheet = marksheetByStudentId.get(student.id) || null;
        const rollNumber = marksheet
          ? marksheet.rollNumber
          : resolveStudentRollNumber(student, db.students);
        return { student, rollNumber, marksheet };
      })
      .filter((row) => {
        if (resultFilter === 'PASSED') return Boolean(row.marksheet && row.marksheet.passed);
        if (resultFilter === 'FAILED') return Boolean(row.marksheet && !row.marksheet.passed);
        if (resultFilter === 'PENDING') return !row.marksheet;
        return true;
      });
  }, [marksheetCandidateStudents, db.students, marksheetByStudentId, resultFilter]);

  const getExamStuId = useCallback((s: StudentRecord) => s.id, []);
  const getMarksheetRowId = useCallback(
    (r: { student: StudentRecord; rollNumber: string; marksheet: StudentExamMarksheet | null }) =>
      r.student.id,
    []
  );

  const marksUploadSelection = useRowSelection(activeExamStudents, getExamStuId);
  const marksheetSelection = useRowSelection(marksheetRows, getMarksheetRowId);
  const [exportingExcel, setExportingExcel] = useState(false);

  const handleExportMarksSheetExcel = async (forceAll = false) => {
    if (!activeExam) return;
    const isPartial = !forceAll && marksUploadSelection.selectedCount > 0;
    const targetStudents = isPartial ? marksUploadSelection.selectedItems : activeExamStudents;
    if (targetStudents.length === 0) return;

    setExportingExcel(true);
    try {
      const items: ExamExportRowInput[] = targetStudents.map((stu) => ({
        student: stu,
        rollNumber: resolveStudentRollNumber(stu, db.students),
        section: stu.section,
        marksheet: marksheetByStudentId.get(stu.id) || null,
        draftSubjectScores: marksGridDraft[stu.id],
      }));
      const res = await exportExamResultsToExcel({
        exam: activeExam,
        items,
        sectionFilter,
        schoolProfile: db.schoolProfile,
        isPartialSelection: isPartial,
        modeLabel: 'Marks_Sheet',
      });
      notify(
        'success',
        'Marks Sheet Exported to Excel (.xlsx)',
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

  const handleExportExamResultsExcel = async (forceAll = false) => {
    if (!activeExam) return;
    const isPartial = !forceAll && marksheetSelection.selectedCount > 0;
    const targetRows = isPartial ? marksheetSelection.selectedItems : marksheetRows;
    if (targetRows.length === 0) return;

    setExportingExcel(true);
    try {
      const items: ExamExportRowInput[] = targetRows.map(({ student, rollNumber, marksheet }) => ({
        student,
        rollNumber,
        section: marksheet ? marksheet.section : student.section,
        marksheet,
      }));
      const res = await exportExamResultsToExcel({
        exam: activeExam,
        items,
        sectionFilter,
        schoolProfile: db.schoolProfile,
        isPartialSelection: isPartial,
        modeLabel: 'Exam_Results',
      });
      notify(
        'success',
        'Exam Results Exported to Excel (.xlsx)',
        `Downloaded ${res.filename} (${res.rowCount} candidates in ${res.elapsedMs}ms).`
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

  const classExamAnalytics = useMemo(() => {
    if (!activeExam) {
      return { enrolled: 0, graded: 0, passed: 0, failed: 0, passRate: 0, avgPct: 0 };
    }
    const activeEnrolledStudents = db.students.filter(
      (s) => s.status !== 'Deactive' && s.className === activeExam.className
    );
    const marksheets = Array.from(marksheetByStudentId.values());

    const graded = marksheets.length;
    const passed = marksheets.filter((m) => m.passed).length;
    const failed = graded - passed;
    const passRate = graded > 0 ? Number(((passed / graded) * 100).toFixed(1)) : 0;
    const avgPct =
      graded > 0
        ? Number((marksheets.reduce((acc, m) => acc + m.percentage, 0) / graded).toFixed(1))
        : 0;

    return {
      enrolled: Math.max(activeEnrolledStudents.length, graded),
      graded,
      passed,
      failed,
      passRate,
      avgPct,
    };
  }, [activeExam, db.students, marksheetByStudentId]);

  const draftScheduleTotals = useMemo(() => {
    let maxSum = 0;
    let minSum = 0;
    draftSubjects.forEach((s) => {
      const mx = Number(s.maxMarks);
      const mn = Number(s.minMarks);
      if (Number.isFinite(mx) && mx > 0) maxSum += mx;
      if (Number.isFinite(mn) && mn >= 0) minSum += mn;
    });
    return { maxSum, minSum };
  }, [draftSubjects]);

  return (
    <section className="space-y-5">
      {/* Main Header & Sub-Navigation */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              {subTab === 'admit-cards'
                ? '06. Admit Cards — Student-wise Hall Ticket Download & Print'
                : subTab === 'marksheets'
                ? '07. Marksheets — Auto-Grade, Result Analytics & Print'
                : '05. Exam Management — Exam Creation, Min/Max Marks & Datesheet'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {subTab === 'admit-cards'
                ? 'Generate, preview, download PDF, or print official student-wise examination Admit Cards with subject timetable'
                : subTab === 'marksheets'
                ? 'Auto-graded student marksheets with percentage, pass/fail verification, PDF download, and A4 stationery print'
                : 'Create class-wise exam schedules, define subject min/max marks & datesheets, and upload validated marks'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Interactive Workflow Segmented Bar (Role-Scoped) */}
            <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
              {canAccessModule('exams') && (
                <button
                  type="button"
                  onClick={() => {
                    setSubTab('schedules');
                    if (activeModule !== 'exams') setActiveModule('exams');
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    subTab === 'schedules'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Exams &amp; Datesheet ({db.exams.length})</span>
                </button>
              )}
              {canManageMarks && (
                <button
                  type="button"
                  onClick={() => {
                    setSubTab('marks');
                    if (activeModule !== 'exams' && canAccessModule('exams')) {
                      setActiveModule('exams');
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    subTab === 'marks'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Marks Upload</span>
                </button>
              )}
              {canAccessModule('admit-cards') && (
                <button
                  type="button"
                  onClick={() => {
                    setSubTab('admit-cards');
                    if (activeModule !== 'admit-cards') setActiveModule('admit-cards');
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    subTab === 'admit-cards'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <IdCard className="h-3.5 w-3.5" />
                  <span>Admit Cards</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSubTab('marksheets');
                  if (activeModule !== 'marksheets') setActiveModule('marksheets');
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  subTab === 'marksheets'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Award className="h-3.5 w-3.5" />
                <span>Marksheets ({db.marksheets.length})</span>
              </button>
            </div>

            {canManageExamSchedules && (
              <button
                type="button"
                onClick={openCreateExamModal}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>Create Exam</span>
              </button>
            )}
          </div>
        </div>

        {/* =================================================================== */}
        {/* STAGE 1: EXAMS & SUBJECT SCHEDULES                                  */}
        {/* =================================================================== */}
        {subTab === 'schedules' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={scheduleClassFilter}
                  onChange={(e) => setScheduleClassFilter(e.target.value)}
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
                  value={scheduleSessionFilter}
                  onChange={(e) => setScheduleSessionFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs font-medium text-slate-800 focus:border-indigo-600 focus:outline-none"
                >
                  <option value="ALL">All Academic Sessions</option>
                  {availableSessionNames.map((ses) => (
                    <option key={ses} value={ses}>
                      Session {ses}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-slate-500 tabular-nums">
                Showing {filteredExams.length} of {db.exams.length}{' '}
                {db.exams.length === 1 ? 'scheduled exam' : 'scheduled exams'}
              </p>
            </div>

            {db.exams.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Calendar className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900">
                  No Examinations Created Yet
                </h3>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                  Create an exam for any class and map its subjects with Max Marks, Min Passing Marks, Exam Dates, and Time Slots. Student Admit Cards unlock automatically upon creation.
                </p>
                {canManageExamSchedules && (
                  <button
                    type="button"
                    onClick={openCreateExamModal}
                    className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create First Examination</span>
                  </button>
                )}
              </div>
            ) : filteredExams.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-slate-500">
                No examinations match the selected Class or Academic Session filter.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {filteredExams.map((exam) => {
                  const sortedSubjects = sortExamSubjects(exam.subjects);
                  const totalMax = sortedSubjects.reduce((s, x) => s + x.maxMarks, 0);
                  const classEnrollment = db.students.filter(
                    (s) => s.status !== 'Deactive' && s.className === exam.className
                  ).length;
                  const gradedCount = db.marksheets.filter(
                    (m) => m.examId === exam.id
                  ).length;
                  const firstDate = sortedSubjects[0]?.examDate || '';
                  const lastDate = sortedSubjects[sortedSubjects.length - 1]?.examDate || '';

                  return (
                    <div key={exam.id} className="p-5 transition-colors hover:bg-slate-50/40">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-baseline gap-2">
                            <h3 className="text-base font-bold text-slate-900">
                              {exam.examName}
                            </h3>
                            <span className="text-slate-300">·</span>
                            <span className="font-mono text-xs font-semibold text-indigo-700 tabular-nums">
                              Class {exam.className}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="font-mono text-xs text-slate-500 tabular-nums">
                              {exam.examCode}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="font-mono text-xs text-slate-500 tabular-nums">
                              Session {exam.academicSession}
                            </span>
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 tabular-nums">
                            <span>{sortedSubjects.length} Mapped Subjects</span>
                            <span aria-hidden="true">·</span>
                            <span>Aggregate Max: {totalMax} Marks</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Schedule:{' '}
                              {firstDate === lastDate
                                ? formatDateDisplay(firstDate)
                                : `${formatDateDisplay(firstDate)} – ${formatDateDisplay(
                                    lastDate
                                  )}`}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Enrolled: {classEnrollment} · Graded: {gradedCount}/{classEnrollment}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {canAccessModule('admit-cards') && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedExamId(exam.id);
                                setSubTab('admit-cards');
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 whitespace-nowrap shrink-0"
                            >
                              <IdCard className="h-3.5 w-3.5" />
                              <span>Admit Cards ({classEnrollment})</span>
                            </button>
                          )}

                          {canManageMarks && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedExamId(exam.id);
                                setSubTab('marks');
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 whitespace-nowrap shrink-0"
                            >
                              <FileSpreadsheet className="h-3.5 w-3.5" />
                              <span>Upload Marks</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedExamId(exam.id);
                              setSubTab('marksheets');
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 whitespace-nowrap shrink-0"
                          >
                            <Award className="h-3.5 w-3.5" />
                            <span>Marksheets ({gradedCount})</span>
                          </button>

                          {canManageExamSchedules && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditExamModal(exam)}
                                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                                title="Edit Exam & Subject Schedule"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  requestConfirm({
                                    title: 'Delete Examination & Marksheets?',
                                    description: `Permanently delete "${exam.examName}" (Class ${exam.className}) and ${gradedCount} uploaded student marksheets?`,
                                    confirmLabel: 'Delete Exam',
                                    destructive: true,
                                    onConfirm: () => deleteExam(exam.id),
                                  })
                                }
                                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                                title="Delete Exam"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Subject Schedule Table Preview */}
                      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                              <th className="px-3.5 py-2 whitespace-nowrap">S.No</th>
                              <th className="px-3.5 py-2 whitespace-nowrap">Subject</th>
                              <th className="px-3.5 py-2 whitespace-nowrap">Exam Date &amp; Day</th>
                              <th className="px-3.5 py-2 whitespace-nowrap">Time Slot</th>
                              <th className="px-3.5 py-2 text-right whitespace-nowrap">Max Marks</th>
                              <th className="px-3.5 py-2 text-right whitespace-nowrap">
                                Min Passing Marks
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {sortedSubjects.map((sub, idx) => (
                              <tr key={sub.id}>
                                <td className="px-3.5 py-2 font-mono text-slate-500 tabular-nums">
                                  {String(idx + 1).padStart(2, '0')}
                                </td>
                                <td className="px-3.5 py-2 font-semibold text-slate-900 whitespace-nowrap">
                                  {sub.subjectName}
                                  {sub.subjectCode ? (
                                    <span className="ml-1.5 font-mono text-[11px] font-normal text-slate-500">
                                      ({sub.subjectCode})
                                    </span>
                                  ) : null}
                                </td>
                                <td className="px-3.5 py-2 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                                  {formatDateDisplay(sub.examDate)}
                                  {formatExamDayName(sub.examDate)
                                    ? ` · ${formatExamDayName(sub.examDate)}`
                                    : ''}
                                </td>
                                <td className="px-3.5 py-2 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                                  {formatTimeSlot(sub.startTime, sub.endTime)}
                                </td>
                                <td className="px-3.5 py-2 text-right font-mono font-semibold text-slate-900 tabular-nums">
                                  {sub.maxMarks}
                                </td>
                                <td className="px-3.5 py-2 text-right font-mono text-slate-600 tabular-nums">
                                  {sub.minMarks}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* SHARED ACTIVE EXAM SELECTOR BAR (FOR TABS 2, 3, 4)                  */}
        {/* =================================================================== */}
        {subTab !== 'schedules' && (
          <div>
            {db.exams.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Award className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900">
                  Create an Examination First
                </h3>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                  Create an exam and map class subjects first to unlock student-wise Marks Upload, Admit Card generation, and automated Marksheets.
                </p>
                <button
                  type="button"
                  onClick={openCreateExamModal}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create New Exam</span>
                </button>
              </div>
            ) : (
              <>
                {/* Contextual Toolbar */}
                <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-3.5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                        Active Exam:
                      </label>
                      <select
                        value={selectedExamId}
                        onChange={(e) => {
                          setSelectedExamId(e.target.value);
                          setSectionFilter('ALL');
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none"
                      >
                        {db.exams.map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            {ex.examName} — Class {ex.className} ({ex.academicSession})
                          </option>
                        ))}
                      </select>
                    </div>

                    <select
                      value={sectionFilter}
                      onChange={(e) => setSectionFilter(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-indigo-600 focus:outline-none"
                    >
                      <option value="ALL">All Sections</option>
                      {activeExamSections.map((sec) => (
                        <option key={sec} value={sec}>
                          Section {sec}
                        </option>
                      ))}
                    </select>

                    {subTab === 'marksheets' && (
                      <select
                        value={resultFilter}
                        onChange={(e) =>
                          setResultFilter(
                            e.target.value as 'ALL' | 'PASSED' | 'FAILED' | 'PENDING'
                          )
                        }
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-indigo-600 focus:outline-none"
                      >
                        <option value="ALL">All Students</option>
                        <option value="PASSED">Passed Only</option>
                        <option value="FAILED">Failed Only</option>
                        <option value="PENDING">Pending Marks</option>
                      </select>
                    )}

                    <div className="relative min-w-[200px]">
                      <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder="Search name, ID, roll no..."
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Stage-Specific Primary Actions */}
                  {subTab === 'marks' && activeExam && activeExamStudents.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={exportingExcel}
                        onClick={() => void handleExportMarksSheetExcel(false)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                        title="Export student marks sheet with subject formulas to Microsoft Excel (.xlsx)"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
                        <span>
                          {marksUploadSelection.selectedCount > 0
                            ? `Export Selected (${marksUploadSelection.selectedCount}) (.xlsx)`
                            : 'Export to Excel (.xlsx)'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadMarksCsvTemplate}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>CSV Template</span>
                      </button>

                      <input
                        ref={csvFileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        onChange={handleCsvMarksUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => csvFileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span>Upload CSV</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveAllEnteredMarks}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>Save All Entered Marks</span>
                      </button>
                    </div>
                  )}

                  {subTab === 'marksheets' && activeExam && marksheetRows.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={exportingExcel}
                        onClick={() => void handleExportExamResultsExcel(false)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                        title="Export class exam results & marksheets to formatted Microsoft Excel (.xlsx)"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
                        <span>
                          {marksheetSelection.selectedCount > 0
                            ? `Export Selected (${marksheetSelection.selectedCount}) (.xlsx)`
                            : 'Export to Excel (.xlsx)'}
                        </span>
                      </button>
                    </div>
                  )}

                  {subTab === 'admit-cards' && activeExam && activeExamStudents.length > 0 && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const list = activeExamStudents.map((student) => ({
                            student,
                            rollNumber: resolveStudentRollNumber(student, db.students),
                          }));
                          downloadClassAdmitCardsPdf(
                            activeExam,
                            list,
                            db.schoolProfile,
                            aiCustomization
                          );
                          notify(
                            'success',
                            'Batch Admit Cards Downloaded',
                            `Downloaded ${list.length} Admit Cards for Class ${activeExam.className} as PDF.`
                          );
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download All Admit Cards (PDF)</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Empty Class Roster Helper */}
                {activeExam &&
                (subTab === 'marksheets'
                  ? marksheetCandidateStudents.length === 0
                  : activeExamStudents.length === 0) ? (
                  <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                    <p className="text-sm font-semibold text-slate-900">
                      {db.students.some(
                        (s) => s.status !== 'Deactive' && s.className === activeExam.className
                      )
                        ? 'No active students match your current section or search filter.'
                        : `No active students are currently enrolled in Class ${activeExam.className}.`}
                    </p>
                    <p className="mt-1 max-w-md text-xs text-slate-500">
                      {db.students.some(
                        (s) => s.status !== 'Deactive' && s.className === activeExam.className
                      )
                        ? 'Clear the search query or switch section filter to view students.'
                        : `Admit active students into Class ${activeExam.className} in Module 1 to upload marks and download Admit Cards or Marksheets.`}
                    </p>
                    {!db.students.some(
                      (s) => s.status !== 'Deactive' && s.className === activeExam.className
                    ) &&
                      canAccessModule('admissions') && (
                        <button
                          type="button"
                          onClick={() => setActiveModule('admissions')}
                          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                        >
                          <span>Go to Student Admissions</span>
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      )}
                  </div>
                ) : null}

                {/* =========================================================== */}
                {/* STAGE 2: STUDENT-WISE MARKS UPLOAD                          */}
                {/* =========================================================== */}
                {subTab === 'marks' && activeExam && activeExamStudents.length > 0 && (
                  <div>
                    {bulkMarksError && (
                      <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>{bulkMarksError}</span>
                      </div>
                    )}

                    <div className="px-5 py-2.5 text-xs text-slate-500">
                      <span>
                        Enter marks up to each subject&apos;s Maximum Marks (or click{' '}
                        <strong className="font-mono text-slate-700">AB</strong> if absent). Values exceeding Maximum Marks are blocked automatically.
                      </span>
                    </div>

                    <ExcelExportBar
                      totalCount={marksUploadSelection.totalCount}
                      selectedCount={marksUploadSelection.selectedCount}
                      isAllSelected={marksUploadSelection.isAllSelected}
                      exporting={exportingExcel}
                      datasetLabel="student mark rows"
                      onExportSelectedOrAll={() => void handleExportMarksSheetExcel(false)}
                      onExportFullDataset={() => void handleExportMarksSheetExcel(true)}
                      onToggleSelectAll={marksUploadSelection.toggleSelectAll}
                      onClearSelection={marksUploadSelection.clearSelection}
                    />

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                            <th className="w-10 px-4 py-3 text-center">
                              <TableSelectCheckbox
                                checked={marksUploadSelection.isAllSelected}
                                indeterminate={marksUploadSelection.isIndeterminate}
                                onChange={marksUploadSelection.toggleSelectAll}
                                ariaLabel="Select all students in marks upload sheet"
                              />
                            </th>
                            <th className="px-4 py-3 whitespace-nowrap">Roll No</th>
                            <th className="px-4 py-3 whitespace-nowrap">Student &amp; ID</th>
                            <th className="px-3 py-3 text-center whitespace-nowrap">Sec</th>
                            {activeExam.subjects.map((sub) => (
                              <th
                                key={sub.id}
                                className="min-w-[140px] px-3 py-2.5 whitespace-nowrap"
                              >
                                <div className="font-semibold text-slate-900">
                                  {sub.subjectName}
                                </div>
                                <div className="font-mono text-[11px] font-normal text-slate-500 tabular-nums">
                                  Max: {sub.maxMarks} · Min: {sub.minMarks}
                                </div>
                              </th>
                            ))}
                            <th className="px-3.5 py-3 text-right whitespace-nowrap">Total</th>
                            <th className="px-3.5 py-3 text-right whitespace-nowrap">% / Grade</th>
                            <th className="px-3.5 py-3 whitespace-nowrap">Status</th>
                            <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {activeExamStudents.map((stu) => {
                            const rollNo = resolveStudentRollNumber(stu, db.students);
                            const rowEval = evaluateStudentDraftRow(stu);
                            const savedMs = marksheetByStudentId.get(stu.id);
                            const isRowChecked = marksUploadSelection.isSelected(stu.id);

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
                                    onChange={() => marksUploadSelection.toggleRow(stu.id)}
                                    aria-label={`Select ${stu.name} (${stu.admissionId})`}
                                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500/30"
                                  />
                                </td>
                                <td className="px-4 py-2.5 font-mono font-semibold text-slate-700 whitespace-nowrap tabular-nums">
                                  {rollNo}
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                  <div className="font-semibold text-slate-900">{stu.name}</div>
                                  <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                                    {stu.admissionId}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-center font-mono text-slate-600">
                                  {stu.section}
                                </td>

                                {activeExam.subjects.map((sub) => {
                                  const cell = marksGridDraft[stu.id]?.[sub.id] || {
                                    value: '',
                                    isAbsent: false,
                                  };
                                  const numVal = Number(cell.value);
                                  const exceedsMax =
                                    !cell.isAbsent &&
                                    cell.value.trim() !== '' &&
                                    (!Number.isFinite(numVal) ||
                                      numVal < 0 ||
                                      numVal > sub.maxMarks);
                                  const belowMin =
                                    !exceedsMax &&
                                    !cell.isAbsent &&
                                    cell.value.trim() !== '' &&
                                    numVal < sub.minMarks;

                                  return (
                                    <td key={sub.id} className="px-3 py-2 align-top">
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          min={0}
                                          max={sub.maxMarks}
                                          step="any"
                                          disabled={cell.isAbsent}
                                          value={cell.isAbsent ? '' : cell.value}
                                          onChange={(e) =>
                                            handleGridCellChange(stu.id, sub.id, e.target.value)
                                          }
                                          placeholder={
                                            cell.isAbsent ? 'ABSENT' : `0–${sub.maxMarks}`
                                          }
                                          className={`w-20 rounded-md border px-2.5 py-1.5 font-mono text-xs tabular-nums focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 ${
                                            exceedsMax
                                              ? 'border-rose-500 bg-rose-50 font-bold text-rose-800 focus:border-rose-600'
                                              : belowMin
                                              ? 'border-amber-400 bg-amber-50/40 text-slate-900 focus:border-indigo-600'
                                              : 'border-slate-300 bg-white text-slate-900 focus:border-indigo-600'
                                          }`}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleGridToggleAbsent(stu.id, sub.id)}
                                          title="Mark student Absent for this paper"
                                          className={`rounded px-1.5 py-1.5 font-mono text-[10px] font-bold transition-colors shrink-0 ${
                                            cell.isAbsent
                                              ? 'bg-rose-600 text-white'
                                              : 'border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                                          }`}
                                        >
                                          AB
                                        </button>
                                      </div>
                                      {exceedsMax && (
                                        <p className="mt-1 font-mono text-[10px] font-semibold text-rose-600">
                                          Max {sub.maxMarks} allowed
                                        </p>
                                      )}
                                    </td>
                                  );
                                })}

                                <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap tabular-nums">
                                  {rowEval.anyFilled
                                    ? `${rowEval.totalObtained} / ${rowEval.totalMax}`
                                    : '—'}
                                </td>
                                <td className="px-3.5 py-2.5 text-right font-mono whitespace-nowrap tabular-nums">
                                  {rowEval.allFilled && !rowEval.hasInvalidMax ? (
                                    <span className="font-semibold text-indigo-700">
                                      {rowEval.percentage.toFixed(1)}% · {rowEval.grade}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="px-3.5 py-2.5 whitespace-nowrap">
                                  {rowEval.hasInvalidMax ? (
                                    <span className="font-semibold text-rose-600">
                                      Invalid Marks
                                    </span>
                                  ) : rowEval.allFilled ? (
                                    rowEval.passed ? (
                                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                        <span>Pass</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
                                        <XCircle className="h-3.5 w-3.5 shrink-0" />
                                        <span>Fail</span>
                                      </span>
                                    )
                                  ) : (
                                    <span className="text-slate-400">Pending</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveSingleRowFromGrid(stu)}
                                      disabled={!rowEval.allFilled || rowEval.hasInvalidMax}
                                      className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 whitespace-nowrap"
                                    >
                                      <Save className="h-3 w-3" />
                                      <span>{savedMs ? 'Update' : 'Save'}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openSingleStudentMarksModal(stu)}
                                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700 whitespace-nowrap"
                                      title="Open Student Marks & Remarks Form"
                                    >
                                      Form
                                    </button>
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

                {/* =========================================================== */}
                {/* STAGE 3: STUDENT-WISE ADMIT CARDS                           */}
                {/* =========================================================== */}
                {subTab === 'admit-cards' && activeExam && activeExamStudents.length > 0 && (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center gap-2 tabular-nums">
                        <span className="font-semibold text-slate-900">
                          {activeExam.examName}
                        </span>
                        <span>·</span>
                        <span>Class {activeExam.className}</span>
                        <span>·</span>
                        <span>{activeExam.subjects.length} Scheduled Papers</span>
                        <span>·</span>
                        <span>Center: {activeExam.examCenter}</span>
                      </div>
                      <span className="text-emerald-700 font-semibold">
                        Admit Cards Active &amp; Ready for Download
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                            <th className="px-4 py-3 whitespace-nowrap">Student</th>
                            <th className="px-4 py-3 whitespace-nowrap">Roll Number</th>
                            <th className="px-4 py-3 whitespace-nowrap">Admission ID</th>
                            <th className="px-4 py-3 whitespace-nowrap">Class &amp; Sec</th>
                            <th className="px-4 py-3 whitespace-nowrap">Father&apos;s Name</th>
                            <th className="px-4 py-3 whitespace-nowrap">Exam Schedule</th>
                            <th className="px-4 py-3 text-right whitespace-nowrap">
                              Admit Card Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {activeExamStudents.map((stu) => {
                            const rollNo = resolveStudentRollNumber(stu, db.students);
                            const sorted = sortExamSubjects(activeExam.subjects);
                            const firstD = sorted[0]?.examDate || '';
                            const lastD = sorted[sorted.length - 1]?.examDate || '';

                            return (
                              <tr
                                key={stu.id}
                                className="transition-colors hover:bg-slate-50/80"
                              >
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                  <div className="flex items-center gap-2.5">
                                    {stu.photoDataUrl ? (
                                      <img
                                        src={stu.photoDataUrl}
                                        alt={stu.name}
                                        referrerPolicy="no-referrer"
                                        className="h-8 w-8 rounded-md border border-slate-200 object-cover shrink-0"
                                      />
                                    ) : (
                                      <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-100 font-mono text-[11px] font-bold text-slate-600 shrink-0">
                                        {getInitials(stu.name)}
                                      </div>
                                    )}
                                    <span className="font-semibold text-slate-900">
                                      {stu.name}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 font-mono font-semibold text-indigo-700 whitespace-nowrap tabular-nums">
                                  {rollNo}
                                </td>
                                <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap tabular-nums">
                                  {stu.admissionId}
                                </td>
                                <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                                  Class {stu.className} · Sec {stu.section}
                                </td>
                                <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                                  {stu.fatherName || '—'}
                                </td>
                                <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap tabular-nums">
                                  {sorted.length} Papers · {formatDateDisplay(firstD)}
                                  {lastD && lastD !== firstD
                                    ? ` – ${formatDateDisplay(lastD)}`
                                    : ''}
                                </td>
                                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center justify-end gap-1.5">
                                    <QuickPhotoAttachmentControl
                                      compact
                                      personName={stu.name}
                                      recordLabel={`Roll ${rollNo} · ${stu.admissionId}`}
                                      hasExistingPhoto={Boolean(stu.photoDataUrl)}
                                      canSavePermanently={canManageStudents || canManageMarks}
                                      onSavePermanent={(dataUrl) =>
                                        saveQuickPersonPhoto('student', stu.id, dataUrl)
                                      }
                                      onAttachTemporary={(dataUrl) =>
                                        setTemporaryPhotoOverride('student', stu.id, dataUrl)
                                      }
                                    />

                                    <button
                                      type="button"
                                      onClick={() => {
                                        downloadAdmitCardPdf(
                                          activeExam,
                                          stu,
                                          rollNo,
                                          db.schoolProfile,
                                          aiCustomization
                                        );
                                        notify(
                                          'success',
                                          'Admit Card PDF Downloaded',
                                          `Saved Admit Card for ${stu.name} (Roll ${rollNo}).`
                                        );
                                      }}
                                      className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                      <span>Download PDF</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        openPrintPreview({
                                          type: 'admit-card',
                                          exam: activeExam,
                                          student: stu,
                                          rollNumber: rollNo,
                                        })
                                      }
                                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 whitespace-nowrap"
                                    >
                                      <Printer className="h-3.5 w-3.5" />
                                      <span>Print</span>
                                    </button>
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

                {/* =========================================================== */}
                {/* STAGE 4: AUTOMATED MARKSHEETS & CLASS RESULTS               */}
                {/* =========================================================== */}
                {subTab === 'marksheets' &&
                  activeExam &&
                  marksheetCandidateStudents.length > 0 && (
                  <div>
                    {/* Analytics Summary Bar */}
                    <div className="grid grid-cols-2 gap-4 border-b border-slate-200 bg-white px-5 py-3.5 sm:grid-cols-4 text-xs">
                      <div>
                        <p className="text-slate-500">Marksheets Generated</p>
                        <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
                          {classExamAnalytics.graded} / {classExamAnalytics.enrolled} Students
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Passed / Failed</p>
                        <p className="mt-0.5 font-mono text-sm font-bold tabular-nums">
                          <span className="text-emerald-700">
                            {classExamAnalytics.passed} Passed
                          </span>
                          <span className="mx-1.5 text-slate-300">·</span>
                          <span className="text-rose-700">
                            {classExamAnalytics.failed} Failed
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Class Pass Rate</p>
                        <p className="mt-0.5 font-mono text-sm font-bold text-indigo-700 tabular-nums">
                          {classExamAnalytics.graded > 0
                            ? `${classExamAnalytics.passRate}%`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Class Average Percentage</p>
                        <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
                          {classExamAnalytics.graded > 0
                            ? `${classExamAnalytics.avgPct}%`
                            : '—'}
                        </p>
                      </div>
                    </div>

                    {marksheetRows.length === 0 ? (
                      <div className="px-6 py-12 text-center text-sm text-slate-500">
                        No student marksheets match the selected result filter.
                      </div>
                    ) : (
                      <div>
                        <ExcelExportBar
                          totalCount={marksheetSelection.totalCount}
                          selectedCount={marksheetSelection.selectedCount}
                          isAllSelected={marksheetSelection.isAllSelected}
                          exporting={exportingExcel}
                          datasetLabel="exam result records"
                          onExportSelectedOrAll={() => void handleExportExamResultsExcel(false)}
                          onExportFullDataset={() => void handleExportExamResultsExcel(true)}
                          onToggleSelectAll={marksheetSelection.toggleSelectAll}
                          onClearSelection={marksheetSelection.clearSelection}
                        />
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                                <th className="w-10 px-4 py-3 text-center">
                                  <TableSelectCheckbox
                                    checked={marksheetSelection.isAllSelected}
                                    indeterminate={marksheetSelection.isIndeterminate}
                                    onChange={marksheetSelection.toggleSelectAll}
                                    ariaLabel="Select all visible marksheet rows for Excel export"
                                  />
                                </th>
                                <th className="px-4 py-3 whitespace-nowrap">Student</th>
                                <th className="px-3.5 py-3 whitespace-nowrap">Roll No</th>
                                <th className="px-3.5 py-3 whitespace-nowrap">Class-Sec</th>
                                <th className="px-3.5 py-3 text-right whitespace-nowrap">
                                  Grand Total
                                </th>
                                <th className="px-3.5 py-3 text-right whitespace-nowrap">
                                  Percentage
                                </th>
                                <th className="px-3.5 py-3 text-center whitespace-nowrap">Grade</th>
                                <th className="px-3.5 py-3 whitespace-nowrap">Result</th>
                                <th className="px-3.5 py-3 whitespace-nowrap">Remarks</th>
                                <th className="px-4 py-3 text-right whitespace-nowrap">
                                  Marksheet Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {marksheetRows.map(({ student, rollNumber, marksheet }) => {
                                const isRowChecked = marksheetSelection.isSelected(student.id);
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
                                        onChange={() => marksheetSelection.toggleRow(student.id)}
                                        aria-label={`Select ${student.name} (${student.admissionId})`}
                                        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500/30"
                                      />
                                    </td>
                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                  <div className="flex items-center gap-2.5">
                                    {student.photoDataUrl ? (
                                      <img
                                        src={student.photoDataUrl}
                                        alt={student.name}
                                        referrerPolicy="no-referrer"
                                        className="h-8 w-8 rounded-md border border-slate-200 object-cover shrink-0"
                                      />
                                    ) : (
                                      <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-100 font-mono text-[11px] font-bold text-slate-600 shrink-0">
                                        {getInitials(student.name)}
                                      </div>
                                    )}
                                    <div>
                                      <div className="font-semibold text-slate-900">
                                        {student.name}
                                      </div>
                                      <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                                        {student.admissionId}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3.5 py-2.5 font-mono font-semibold text-slate-700 whitespace-nowrap tabular-nums">
                                  {rollNumber}
                                </td>
                                <td className="px-3.5 py-2.5 text-slate-700 whitespace-nowrap">
                                  {marksheet
                                    ? `${marksheet.className}-${marksheet.section}`
                                    : `${student.className}-${student.section}`}
                                </td>

                                {marksheet ? (
                                  <>
                                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap tabular-nums">
                                      {marksheet.totalObtained} / {marksheet.totalMaxMarks}
                                    </td>
                                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-indigo-700 whitespace-nowrap tabular-nums">
                                      {marksheet.percentage.toFixed(2)}%
                                    </td>
                                    <td className="px-3.5 py-2.5 text-center font-mono font-bold text-slate-900">
                                      {marksheet.overallGrade}
                                    </td>
                                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                                      {marksheet.passed ? (
                                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                          <span>Passed</span>
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
                                          <XCircle className="h-3.5 w-3.5 shrink-0" />
                                          <span>Failed</span>
                                        </span>
                                      )}
                                    </td>
                                    <td className="max-w-[200px] truncate px-3.5 py-2.5 text-slate-600">
                                      {marksheet.remarks}
                                    </td>
                                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                      <div className="inline-flex items-center justify-end gap-1.5">
                                        <QuickPhotoAttachmentControl
                                          compact
                                          personName={student.name}
                                          recordLabel={`Marksheet · ${student.admissionId}`}
                                          hasExistingPhoto={Boolean(student.photoDataUrl)}
                                          canSavePermanently={canManageStudents || canManageMarks}
                                          onSavePermanent={(dataUrl) =>
                                            saveQuickPersonPhoto('student', student.id, dataUrl)
                                          }
                                          onAttachTemporary={(dataUrl) =>
                                            setTemporaryPhotoOverride(
                                              'student',
                                              student.id,
                                              dataUrl
                                            )
                                          }
                                        />

                                        <button
                                          type="button"
                                          onClick={() => {
                                            downloadMarksheetPdf(
                                              marksheet,
                                              student,
                                              db.schoolProfile,
                                              aiCustomization
                                            );
                                            notify(
                                              'success',
                                              'Marksheet PDF Downloaded',
                                              `Saved official marksheet PDF for ${student.name}.`
                                            );
                                          }}
                                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap"
                                        >
                                          <Download className="h-3.5 w-3.5" />
                                          <span>Download PDF</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            openPrintPreview({
                                              type: 'marksheet',
                                              marksheet,
                                              student,
                                              exam: activeExam,
                                            })
                                          }
                                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 whitespace-nowrap"
                                        >
                                          <Printer className="h-3.5 w-3.5" />
                                          <span>Print</span>
                                        </button>

                                        {canManageMarks && (
                                          <button
                                            type="button"
                                            onClick={() => openSingleStudentMarksModal(student)}
                                            className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                                            title="Edit Student Marks"
                                          >
                                            <Pencil className="h-4 w-4" />
                                          </button>
                                        )}

                                        {canDeleteRecords && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              requestConfirm({
                                                title: 'Delete Student Marksheet?',
                                                description: `Remove uploaded ${activeExam.examName} marksheet for ${student.name}?`,
                                                confirmLabel: 'Delete Marksheet',
                                                destructive: true,
                                                onConfirm: () =>
                                                  deleteStudentMarksheet(marksheet.id),
                                              })
                                            }
                                            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                                            title="Delete Marksheet"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td
                                      colSpan={5}
                                      className="px-3.5 py-2.5 text-slate-400 italic"
                                    >
                                      Marks not uploaded yet for {activeExam.examName}
                                    </td>
                                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                      {canManageMarks ? (
                                        <button
                                          type="button"
                                          onClick={() => openSingleStudentMarksModal(student)}
                                          className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 whitespace-nowrap"
                                        >
                                          <FileText className="h-3.5 w-3.5" />
                                          <span>Upload Marks →</span>
                                        </button>
                                      ) : (
                                        <span className="text-xs font-medium text-slate-400">
                                          Pending
                                        </span>
                                      )}
                                    </td>
                                  </>
                                )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MODAL 1: CREATE / EDIT EXAM & SUBJECT SCHEDULE                        */}
      {/* ===================================================================== */}
      <ModalShell
        open={examModalOpen}
        onClose={() => setExamModalOpen(false)}
        title={
          editingExam
            ? `Edit Examination Schedule — ${editingExam.examCode}`
            : 'Create New Examination & Map Class Subjects'
        }
        subtitle="Configure exam details, map class subjects, and set Max Marks, Min Passing Marks, Exam Date, and Time Slots."
        maxWidthClass="max-w-4xl"
      >
        <form onSubmit={handleSaveExam} className="space-y-5" noValidate>
          {/* Exam Metadata */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <div className="sm:col-span-6">
              <label className="block text-xs font-semibold text-slate-700">
                Examination Name *
              </label>
              <input
                type="text"
                required
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                placeholder="e.g., Half-Yearly Examination 2026"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400">Quick fill:</span>
                {EXAM_NAME_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setExamName(preset)}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700 whitespace-nowrap"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700">
                Target Class *
              </label>
              <select
                value={examClassName}
                onChange={(e) => setExamClassName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              >
                {db.classes.map((cls) => (
                  <option key={cls.id} value={cls.className}>
                    Class {cls.className}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700">
                Academic Session *
              </label>
              <select
                value={examSession}
                onChange={(e) => setExamSession(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              >
                {availableSessionNames.map((ses) => (
                  <option key={ses} value={ses}>
                    {ses}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-6">
              <label className="block text-xs font-semibold text-slate-700">
                Examination Center / Venue
              </label>
              <input
                type="text"
                value={examCenter}
                onChange={(e) => setExamCenter(e.target.value)}
                placeholder="RB Public School — Main Campus"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-6">
              <label className="block text-xs font-semibold text-slate-700">
                Admit Card Candidate Instructions
              </label>
              <input
                type="text"
                value={examInstructions}
                onChange={(e) => setExamInstructions(e.target.value)}
                placeholder="Hall reporting rules printed on Student Admit Cards"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Subject Mapping Builder */}
          <div className="border-t border-slate-200 pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Class {examClassName} — Subject Mapping &amp; Date/Time Schedule
                </h3>
                <p className="text-xs text-slate-500">
                  Set Maximum Marks, Minimum Passing Marks, Exam Date, and Time Slot for each subject
                </p>
              </div>

              <button
                type="button"
                onClick={() => addDraftSubject()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Custom Subject</span>
              </button>
            </div>

            {/* Quick-Add Subject Buttons */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-500">Quick map subject:</span>
              {COMMON_SUBJECT_PRESETS.map((preset) => {
                const alreadyAdded = draftSubjects.some(
                  (s) => s.subjectName.trim().toLowerCase() === preset.name.toLowerCase()
                );
                return (
                  <button
                    key={preset.code}
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => addDraftSubject(preset)}
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                      alreadyAdded
                        ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:text-indigo-700'
                    }`}
                  >
                    + {preset.name}
                  </button>
                );
              })}
            </div>

            {/* Mapped Subjects Schedule Grid */}
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                    <th className="px-3 py-2.5 whitespace-nowrap">Subject Name *</th>
                    <th className="px-2.5 py-2.5 w-24 whitespace-nowrap">Code</th>
                    <th className="px-2.5 py-2.5 w-24 whitespace-nowrap">Max Marks *</th>
                    <th className="px-2.5 py-2.5 w-24 whitespace-nowrap">Min Marks *</th>
                    <th className="px-2.5 py-2.5 w-36 whitespace-nowrap">Exam Date *</th>
                    <th className="px-2.5 py-2.5 w-28 whitespace-nowrap">Start Time *</th>
                    <th className="px-2.5 py-2.5 w-28 whitespace-nowrap">End Time *</th>
                    <th className="px-2.5 py-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {draftSubjects.map((sub, idx) => {
                    const maxNum = Number(sub.maxMarks);
                    const minNum = Number(sub.minMarks);
                    const minExceedsMax =
                      Number.isFinite(maxNum) &&
                      Number.isFinite(minNum) &&
                      minNum > maxNum;

                    return (
                      <tr key={sub.id}>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            required
                            value={sub.subjectName}
                            onChange={(e) =>
                              updateDraftSubject(sub.id, 'subjectName', e.target.value)
                            }
                            placeholder={`Subject ${idx + 1}`}
                            className="w-full min-w-[140px] rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-indigo-600 focus:outline-none"
                          />
                        </td>
                        <td className="px-2.5 py-2">
                          <input
                            type="text"
                            value={sub.subjectCode}
                            onChange={(e) =>
                              updateDraftSubject(sub.id, 'subjectCode', e.target.value)
                            }
                            placeholder="ENG"
                            maxLength={8}
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs uppercase text-slate-800 focus:border-indigo-600 focus:outline-none"
                          />
                        </td>
                        <td className="px-2.5 py-2">
                          <input
                            type="number"
                            min={1}
                            max={1000}
                            required
                            value={sub.maxMarks}
                            onChange={(e) =>
                              updateDraftSubject(sub.id, 'maxMarks', e.target.value)
                            }
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs text-slate-900 focus:border-indigo-600 focus:outline-none tabular-nums"
                          />
                        </td>
                        <td className="px-2.5 py-2">
                          <input
                            type="number"
                            min={0}
                            max={sub.maxMarks || 1000}
                            required
                            value={sub.minMarks}
                            onChange={(e) =>
                              updateDraftSubject(sub.id, 'minMarks', e.target.value)
                            }
                            className={`w-full rounded-md border px-2 py-1.5 font-mono text-xs focus:outline-none tabular-nums ${
                              minExceedsMax
                                ? 'border-rose-500 bg-rose-50 text-rose-800'
                                : 'border-slate-300 text-slate-900 focus:border-indigo-600'
                            }`}
                          />
                        </td>
                        <td className="px-2.5 py-2">
                          <input
                            type="date"
                            required
                            value={sub.examDate}
                            onChange={(e) =>
                              updateDraftSubject(sub.id, 'examDate', e.target.value)
                            }
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs text-slate-900 focus:border-indigo-600 focus:outline-none tabular-nums"
                          />
                        </td>
                        <td className="px-2.5 py-2">
                          <input
                            type="time"
                            required
                            value={sub.startTime}
                            onChange={(e) =>
                              updateDraftSubject(sub.id, 'startTime', e.target.value)
                            }
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs text-slate-900 focus:border-indigo-600 focus:outline-none tabular-nums"
                          />
                        </td>
                        <td className="px-2.5 py-2">
                          <input
                            type="time"
                            required
                            value={sub.endTime}
                            onChange={(e) =>
                              updateDraftSubject(sub.id, 'endTime', e.target.value)
                            }
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs text-slate-900 focus:border-indigo-600 focus:outline-none tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            disabled={draftSubjects.length <= 1}
                            onClick={() => removeDraftSubject(sub.id)}
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                            title="Remove Subject"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs">
              <div className="text-slate-600 tabular-nums">
                <span>Mapped Subjects: </span>
                <strong className="font-mono text-slate-900">{draftSubjects.length}</strong>
                <span className="mx-2 text-slate-300">·</span>
                <span>Aggregate Max Marks: </span>
                <strong className="font-mono text-slate-900">
                  {draftScheduleTotals.maxSum}
                </strong>
                <span className="mx-2 text-slate-300">·</span>
                <span>Aggregate Min Passing: </span>
                <strong className="font-mono text-slate-900">
                  {draftScheduleTotals.minSum}
                </strong>
              </div>
              <span className="inline-flex items-center gap-1 text-slate-500">
                <Clock className="h-3.5 w-3.5" />
                <span>Admit Cards auto-enable upon saving</span>
              </span>
            </div>
          </div>

          {examFormError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
              {examFormError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setExamModalOpen(false)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap"
            >
              {editingExam ? 'Update Exam & Schedule' : 'Create Exam & Enable Admit Cards'}
            </button>
          </div>
        </form>
      </ModalShell>

      {/* ===================================================================== */}
      {/* MODAL 2: SINGLE-STUDENT DETAILED MARKS UPLOAD                         */}
      {/* ===================================================================== */}
      <ModalShell
        open={singleMarkModalOpen}
        onClose={() => setSingleMarkModalOpen(false)}
        title={
          singleMarkStudent
            ? `Upload Subject Marks — ${singleMarkStudent.name}`
            : 'Upload Student Marks'
        }
        subtitle={
          activeExam && singleMarkStudent
            ? `${activeExam.examName} · Class ${singleMarkStudent.className}-${singleMarkStudent.section} · Roll ${resolveStudentRollNumber(
                singleMarkStudent,
                db.students
              )}`
            : ''
        }
        maxWidthClass="max-w-xl"
      >
        {activeExam && singleMarkStudent && (
          <form
            onSubmit={(e) => handleSaveSingleModal(e, false)}
            className="space-y-4"
            noValidate
          >
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                    <th className="px-3.5 py-2.5">Subject</th>
                    <th className="px-3 py-2.5 text-right">Max</th>
                    <th className="px-3 py-2.5 text-right">Min Pass</th>
                    <th className="px-3.5 py-2.5 text-right">Marks Obtained *</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeExam.subjects.map((sub) => {
                    const cell = singleSubjectInputs[sub.id] || {
                      value: '',
                      isAbsent: false,
                    };
                    const numeric = Number(cell.value);
                    const isOverMax =
                      !cell.isAbsent &&
                      cell.value.trim() !== '' &&
                      (!Number.isFinite(numeric) || numeric < 0 || numeric > sub.maxMarks);

                    return (
                      <tr key={sub.id}>
                        <td className="px-3.5 py-2.5 font-semibold text-slate-900">
                          {sub.subjectName}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-700 tabular-nums">
                          {sub.maxMarks}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-500 tabular-nums">
                          {sub.minMarks}
                        </td>
                        <td className="px-3.5 py-2 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <input
                              type="number"
                              min={0}
                              max={sub.maxMarks}
                              step="any"
                              disabled={cell.isAbsent}
                              value={cell.isAbsent ? '' : cell.value}
                              onChange={(e) => {
                                setSingleMarkError('');
                                setSingleSubjectInputs((prev) => ({
                                  ...prev,
                                  [sub.id]: { value: e.target.value, isAbsent: false },
                                }));
                              }}
                              placeholder={cell.isAbsent ? 'ABSENT' : `0–${sub.maxMarks}`}
                              className={`w-24 rounded-md border px-2.5 py-1.5 text-right font-mono text-xs tabular-nums focus:outline-none disabled:bg-slate-100 ${
                                isOverMax
                                  ? 'border-rose-500 bg-rose-50 font-bold text-rose-800'
                                  : 'border-slate-300 text-slate-900 focus:border-indigo-600'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setSingleSubjectInputs((prev) => {
                                  const cur = prev[sub.id] || { value: '', isAbsent: false };
                                  const nextAb = !cur.isAbsent;
                                  return {
                                    ...prev,
                                    [sub.id]: {
                                      value: nextAb ? '0' : '',
                                      isAbsent: nextAb,
                                    },
                                  };
                                })
                              }
                              className={`rounded px-2 py-1.5 font-mono text-[10px] font-bold ${
                                cell.isAbsent
                                  ? 'bg-rose-600 text-white'
                                  : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              AB
                            </button>
                          </div>
                          {isOverMax && (
                            <p className="mt-1 font-mono text-[10px] font-semibold text-rose-600">
                              Cannot exceed {sub.maxMarks}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Class Teacher Remarks (Optional — auto-generated if left blank)
              </label>
              <input
                type="text"
                value={singleRemarksInput}
                onChange={(e) => setSingleRemarksInput(e.target.value)}
                placeholder="e.g., Consistent effort in Mathematics and Science."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            {singleMarkError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                {singleMarkError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setSingleMarkModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => handleSaveSingleModal(e, true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 whitespace-nowrap"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Save &amp; View Marksheet</span>
              </button>
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap"
              >
                Save Marks
              </button>
            </div>
          </form>
        )}
      </ModalShell>
    </section>
  );
};
