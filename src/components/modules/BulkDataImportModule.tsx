import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  RotateCcw,
  Sparkles,
  UploadCloud,
  Wallet,
} from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { FeeMonth, PaymentMode, StaffDesignation } from '../../types/erp';
import { getTodayISO } from '../../utils/formatters';

type ImportTab = 'students' | 'staff' | 'fees';

interface ParsedStudentRow {
  rollNo?: string;
  name: string;
  className: string;
  section: string;
  fatherName: string;
  motherName?: string;
  phone: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  address: string;
  monthlyTuitionFee: number;
  admissionFee: number;
  admissionType: 'Paid' | 'Free';
  admissionId?: string;
  isValid: boolean;
  errors: string[];
}

interface ParsedStaffRow {
  staffId?: string;
  fullName: string;
  designation: StaffDesignation;
  department: string;
  phone: string;
  emergencyContact?: string;
  qualification: string;
  monthlySalary: number;
  joinedDate: string;
  address: string;
  isValid: boolean;
  errors: string[];
}

interface ParsedFeeRow {
  admissionId?: string;
  rollNumber?: string;
  studentName: string;
  className: string;
  section: string;
  paidAmount: number;
  balanceDue: number;
  paymentDate: string;
  paymentMode: PaymentMode;
  feeMonth: FeeMonth;
  remarks: string;
  isValid: boolean;
  errors: string[];
}

export const BulkDataImportModule: React.FC = () => {
  const {
    db,
    addStudent,
    addStaff,
    collectFee,
    isCurrentUserAdmin,
    currentRole,
    notify,
    setActiveModule,
  } = useSchool();

  const [activeTab, setActiveTab] = useState<ImportTab>('students');
  const [isProcessing, setIsProcessing] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);

  // Parsed Data States
  const [studentRows, setStudentRows] = useState<ParsedStudentRow[]>([]);
  const [staffRows, setStaffRows] = useState<ParsedStaffRow[]>([]);
  const [feeRows, setFeeRows] = useState<ParsedFeeRow[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canImport = isCurrentUserAdmin || currentRole === 'accountant';

  // ---------------------------------------------------------------------------
  // SAMPLE TEMPLATE GENERATORS (.xlsx & .csv)
  // ---------------------------------------------------------------------------

  const handleDownloadStudentTemplate = (fileType: 'xlsx' | 'csv') => {
    const sampleData = [
      {
        'Roll No': '101',
        'Student Full Name': 'Aarav Sharma',
        'Class': '1st',
        'Section': 'A',
        'Father Name': 'Ramesh Sharma',
        'Mother Name': 'Pooja Sharma',
        'Phone': '9876543210',
        'Date of Birth (YYYY-MM-DD)': '2019-05-14',
        'Gender (Male/Female/Other)': 'Male',
        'Address': '12 Gandhi Marg, City',
        'Monthly Tuition Fee': 1200,
        'Admission Fee': 2500,
        'Admission Type (Free/Paid)': 'Paid',
      },
      {
        'Roll No': '102',
        'Student Full Name': 'Ananya Verma',
        'Class': '1st',
        'Section': 'A',
        'Father Name': 'Sunil Verma',
        'Mother Name': 'Kavita Verma',
        'Phone': '9812345678',
        'Date of Birth (YYYY-MM-DD)': '2019-08-22',
        'Gender (Male/Female/Other)': 'Female',
        'Address': '45 Civil Lines, City',
        'Monthly Tuition Fee': 1200,
        'Admission Fee': 2500,
        'Admission Type (Free/Paid)': 'Paid',
      },
      {
        'Roll No': '201',
        'Student Full Name': 'Rohan Gupta',
        'Class': '2nd',
        'Section': 'B',
        'Father Name': 'Alok Gupta',
        'Mother Name': 'Meena Gupta',
        'Phone': '9723456789',
        'Date of Birth (YYYY-MM-DD)': '2018-03-10',
        'Gender (Male/Female/Other)': 'Male',
        'Address': '88 Station Road, City',
        'Monthly Tuition Fee': 1400,
        'Admission Fee': 0,
        'Admission Type (Free/Paid)': 'Free',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students_Template');

    if (fileType === 'xlsx') {
      XLSX.writeFile(wb, 'Student_Bulk_Import_Template.xlsx');
    } else {
      XLSX.writeFile(wb, 'Student_Bulk_Import_Template.csv', { bookType: 'csv' });
    }
    notify('success', 'Template Downloaded', `Downloaded student import template in .${fileType} format.`);
  };

  const handleDownloadStaffTemplate = (fileType: 'xlsx' | 'csv') => {
    const sampleData = [
      {
        'Staff ID': 'STF101',
        'Full Name': 'Sanjay Tiwari',
        'Designation': 'Teacher (Mathematics)',
        'Department': 'Primary Wing',
        'Phone': '9898989801',
        'Emergency Contact': '9898989802',
        'Qualification': 'M.Sc, B.Ed',
        'Monthly Salary': 28000,
        'Joined Date (YYYY-MM-DD)': '2023-04-01',
        'Address': '15 Teachers Colony, City',
      },
      {
        'Staff ID': 'STF102',
        'Full Name': 'Rashmi Nair',
        'Designation': 'Teacher (English)',
        'Department': 'Secondary Wing',
        'Phone': '9877766554',
        'Emergency Contact': '9877766555',
        'Qualification': 'M.A (English), B.Ed',
        'Monthly Salary': 30000,
        'Joined Date (YYYY-MM-DD)': '2022-07-15',
        'Address': '22 Model Town, City',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff_Template');

    if (fileType === 'xlsx') {
      XLSX.writeFile(wb, 'Staff_Bulk_Import_Template.xlsx');
    } else {
      XLSX.writeFile(wb, 'Staff_Bulk_Import_Template.csv', { bookType: 'csv' });
    }
    notify('success', 'Template Downloaded', `Downloaded staff import template in .${fileType} format.`);
  };

  const handleDownloadFeesTemplate = (fileType: 'xlsx' | 'csv') => {
    const sampleData = [
      {
        'Admission ID': 'RB1001',
        'Roll No': '101',
        'Student Name': 'Aarav Sharma',
        'Class': '1st',
        'Section': 'A',
        'Paid Amount': 2400,
        'Balance Due': 0,
        'Payment Date (YYYY-MM-DD)': '2026-04-10',
        'Payment Mode (Cash/UPI/Bank)': 'Cash',
        'Fee Month (April-March)': 'April',
        'Remarks': 'Migrated opening fee record',
      },
      {
        'Admission ID': 'RB1002',
        'Roll No': '102',
        'Student Name': 'Ananya Verma',
        'Class': '1st',
        'Section': 'A',
        'Paid Amount': 1200,
        'Balance Due': 1200,
        'Payment Date (YYYY-MM-DD)': '2026-04-12',
        'Payment Mode (UPI/Cash/Bank)': 'UPI',
        'Fee Month (April-March)': 'April',
        'Remarks': 'Partial advance received',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fees_Opening_Dues');

    if (fileType === 'xlsx') {
      XLSX.writeFile(wb, 'Fee_Opening_Dues_Template.xlsx');
    } else {
      XLSX.writeFile(wb, 'Fee_Opening_Dues_Template.csv', { bookType: 'csv' });
    }
    notify('success', 'Template Downloaded', `Downloaded fee records template in .${fileType} format.`);
  };

  // ---------------------------------------------------------------------------
  // FILE PARSER HANDLERS (EXCEL & CSV VIA SHEETJS)
  // ---------------------------------------------------------------------------

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportSummary(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result;
        if (!buffer) return;

        const wb = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

        if (rawJson.length === 0) {
          notify('error', 'Empty File', 'The selected workbook or sheet contains no data rows.');
          return;
        }

        if (activeTab === 'students') {
          parseStudents(rawJson);
        } else if (activeTab === 'staff') {
          parseStaff(rawJson);
        } else {
          parseFees(rawJson);
        }
      } catch (err) {
        notify('error', 'Parsing Error', err instanceof Error ? err.message : 'Failed to parse file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const parseStudents = (rows: Record<string, unknown>[]) => {
    const parsed: ParsedStudentRow[] = rows.map((r) => {
      const name = String(r['Student Full Name'] || r['Name'] || r['Student Name'] || '').trim();
      const className = String(r['Class'] || r['ClassName'] || r['Grade'] || '1st').trim();
      const section = String(r['Section'] || 'A').trim().toUpperCase() || 'A';
      const rollNo = String(r['Roll No'] || r['Roll Number'] || r['Roll'] || '').trim();
      const fatherName = String(r['Father Name'] || r['Father'] || '').trim();
      const motherName = String(r['Mother Name'] || r['Mother'] || '').trim();
      const phone = String(r['Phone'] || r['Mobile'] || r['Contact'] || '').trim();
      const dob = String(r['Date of Birth (YYYY-MM-DD)'] || r['DOB'] || r['Date of Birth'] || '').trim();
      const genderRaw = String(r['Gender (Male/Female/Other)'] || r['Gender'] || 'Male').trim();
      const gender = ['Male', 'Female', 'Other'].includes(genderRaw)
        ? (genderRaw as 'Male' | 'Female' | 'Other')
        : 'Male';
      const address = String(r['Address'] || '').trim();
      const monthlyTuitionFee = Number(r['Monthly Tuition Fee'] || r['Tuition Fee'] || r['Fee'] || 1000);
      const admissionFee = Number(r['Admission Fee'] || 0);
      const admissionTypeRaw = String(r['Admission Type (Free/Paid)'] || r['Admission Type'] || 'Paid').trim();
      const admissionType = admissionTypeRaw.toLowerCase() === 'free' ? 'Free' : 'Paid';

      const errors: string[] = [];
      if (!name) errors.push('Missing Student Name');
      if (!className) errors.push('Missing Class');

      return {
        rollNo,
        name: name || 'Unnamed Student',
        className: className || '1st',
        section,
        fatherName: fatherName || 'Guardian',
        motherName,
        phone,
        dob: dob || '2019-01-01',
        gender,
        address,
        monthlyTuitionFee: isNaN(monthlyTuitionFee) ? 1000 : monthlyTuitionFee,
        admissionFee: isNaN(admissionFee) ? 0 : admissionFee,
        admissionType,
        isValid: errors.length === 0,
        errors,
      };
    });

    setStudentRows(parsed);
    notify(
      'info',
      'Workbook Parsed',
      `Parsed ${parsed.length} student records (${parsed.filter((p) => p.isValid).length} ready for batch import).`
    );
  };

  const parseStaff = (rows: Record<string, unknown>[]) => {
    const parsed: ParsedStaffRow[] = rows.map((r) => {
      const fullName = String(r['Full Name'] || r['Name'] || r['Staff Name'] || '').trim();
      const designation = String(r['Designation'] || 'Teacher (Primary / PRT)').trim();
      const department = String(r['Department'] || r['Assigned Department'] || 'General').trim();
      const phone = String(r['Phone'] || r['Mobile'] || '').trim();
      const emergencyContact = String(r['Emergency Contact'] || '').trim();
      const qualification = String(r['Qualification'] || 'Graduate').trim();
      const monthlySalary = Number(r['Monthly Salary'] || r['Salary'] || 20000);
      const joinedDate = String(r['Joined Date (YYYY-MM-DD)'] || r['Joined Date'] || getTodayISO()).trim();
      const address = String(r['Address'] || '').trim();
      const staffId = String(r['Staff ID'] || '').trim();

      const errors: string[] = [];
      if (!fullName) errors.push('Missing Staff Name');

      return {
        staffId,
        fullName: fullName || 'Staff Member',
        designation,
        department,
        phone,
        emergencyContact,
        qualification,
        monthlySalary: isNaN(monthlySalary) ? 20000 : monthlySalary,
        joinedDate: joinedDate || getTodayISO(),
        address,
        isValid: errors.length === 0,
        errors,
      };
    });

    setStaffRows(parsed);
    notify(
      'info',
      'Workbook Parsed',
      `Parsed ${parsed.length} staff records (${parsed.filter((p) => p.isValid).length} ready for batch import).`
    );
  };

  const parseFees = (rows: Record<string, unknown>[]) => {
    const parsed: ParsedFeeRow[] = rows.map((r) => {
      const admissionId = String(r['Admission ID'] || r['AdmissionID'] || '').trim();
      const rollNumber = String(r['Roll No'] || r['Roll Number'] || '').trim();
      const studentName = String(r['Student Name'] || r['Name'] || '').trim();
      const className = String(r['Class'] || '1st').trim();
      const section = String(r['Section'] || 'A').trim().toUpperCase() || 'A';
      const paidAmount = Number(r['Paid Amount'] || r['Amount'] || 0);
      const balanceDue = Number(r['Balance Due'] || 0);
      const paymentDate = String(r['Payment Date (YYYY-MM-DD)'] || r['Date'] || getTodayISO()).trim();
      const paymentModeRaw = String(r['Payment Mode (Cash/UPI/Bank)'] || r['Payment Mode'] || 'Cash').trim();
      const paymentMode: PaymentMode = ['Cash', 'UPI', 'Bank'].includes(paymentModeRaw)
        ? (paymentModeRaw as PaymentMode)
        : 'Cash';
      const feeMonthRaw = String(r['Fee Month (April-March)'] || r['Month'] || 'April').trim();
      const feeMonth = feeMonthRaw as FeeMonth;
      const remarks = String(r['Remarks'] || 'Imported opening fee record').trim();

      const errors: string[] = [];
      if (isNaN(paidAmount) || paidAmount <= 0) errors.push('Paid Amount must be greater than 0');

      return {
        admissionId,
        rollNumber,
        studentName: studentName || 'Student',
        className,
        section,
        paidAmount: isNaN(paidAmount) ? 0 : paidAmount,
        balanceDue: isNaN(balanceDue) ? 0 : balanceDue,
        paymentDate: paymentDate || getTodayISO(),
        paymentMode,
        feeMonth,
        remarks,
        isValid: errors.length === 0,
        errors,
      };
    });

    setFeeRows(parsed);
    notify(
      'info',
      'Workbook Parsed',
      `Parsed ${parsed.length} fee records (${parsed.filter((p) => p.isValid).length} ready for batch import).`
    );
  };

  // ---------------------------------------------------------------------------
  // BATCH INSERTION EXECUTORS
  // ---------------------------------------------------------------------------

  const handleExecuteStudentImport = async () => {
    if (!canImport) {
      notify('error', 'Permission Denied', 'Only Main Admin or Accountant can import students.');
      return;
    }
    const valid = studentRows.filter((r) => r.isValid);
    if (valid.length === 0) {
      notify('error', 'No Valid Rows', 'Please upload a sheet with at least 1 valid student record.');
      return;
    }

    setIsProcessing(true);
    let imported = 0;
    try {
      for (const row of valid) {
        addStudent({
          academicSession: db.activeSession,
          admissionType: row.admissionType,
          admissionFee: row.admissionFee,
          previousSchool: '',
          lastGradePassed: '',
          tcDetails: '',
          rollNumber: row.rollNo || undefined,
          name: row.name,
          dob: row.dob,
          gender: row.gender,
          casteCategory: 'General',
          className: row.className,
          section: row.section,
          monthlyTuitionFee: row.monthlyTuitionFee,
          fatherName: row.fatherName,
          motherName: row.motherName || '',
          phone: row.phone,
          alternatePhone: '',
          address: row.address,
          photoDataUrl: '',
          aadhaarNumber: '',
          aadhaarDocDataUrl: '',
          transportEnabled: false,
          routeId: '',
          transportFee: 0,
          customNotes: 'Bulk Imported via Excel/CSV Migration',
          admissionDate: getTodayISO(),
        });
        imported++;
      }

      setImportSummary(
        `Successfully imported ${imported} students into Academic Session ${db.activeSession}. Cloud sync complete.`
      );
      setStudentRows([]);
      notify(
        'success',
        'Bulk Import Successful',
        `${imported} students added directly to the school database.`
      );
    } catch (err) {
      notify('error', 'Import Incomplete', err instanceof Error ? err.message : 'Error importing records.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecuteStaffImport = async () => {
    if (!isCurrentUserAdmin) {
      notify('error', 'Main Admin Required', 'Only Main Admin can register staff records.');
      return;
    }
    const valid = staffRows.filter((r) => r.isValid);
    if (valid.length === 0) {
      notify('error', 'No Valid Rows', 'Please upload a sheet with at least 1 valid staff record.');
      return;
    }

    setIsProcessing(true);
    let imported = 0;
    try {
      for (const row of valid) {
        addStaff({
          fullName: row.fullName,
          fatherOrSpouseName: '',
          designation: row.designation,
          assignedDepartment: row.department,
          qualification: row.qualification,
          monthlySalary: row.monthlySalary,
          address: row.address,
          phone: row.phone,
          emergencyContact: row.emergencyContact || '',
          joinedDate: row.joinedDate,
          photoDataUrl: '',
        });
        imported++;
      }

      setImportSummary(`Successfully imported ${imported} staff members to the HR directory.`);
      setStaffRows([]);
      notify('success', 'Staff Migration Successful', `${imported} staff members added to the database.`);
    } catch (err) {
      notify('error', 'Staff Import Failed', err instanceof Error ? err.message : 'Error importing staff.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecuteFeeImport = async () => {
    if (!canImport) {
      notify('error', 'Permission Denied', 'Only Main Admin or Accountant can import fee records.');
      return;
    }
    const valid = feeRows.filter((r) => r.isValid);
    if (valid.length === 0) {
      notify('error', 'No Valid Rows', 'Please upload a sheet with at least 1 valid fee record.');
      return;
    }

    setIsProcessing(true);
    let imported = 0;
    let totalAmt = 0;

    try {
      for (const row of valid) {
        // Find existing student by Admission ID or Name + Class
        const matched =
          db.students.find((s) => s.admissionId.toLowerCase() === row.admissionId?.toLowerCase()) ||
          db.students.find(
            (s) =>
              s.name.toLowerCase() === row.studentName.toLowerCase() &&
              s.className.toLowerCase() === row.className.toLowerCase()
          );

        if (matched) {
          collectFee({
            studentId: matched.id,
            category: 'Tuition',
            feeMonth: row.feeMonth || 'April',
            paymentMode: row.paymentMode || 'Cash',
            amount: row.paidAmount,
            date: row.paymentDate || getTodayISO(),
            remarks: row.remarks || 'Migrated ledger record',
          });
          imported++;
          totalAmt += row.paidAmount;
        } else {
          // If student doesn't exist, admit student first then log receipt
          const newStudent = addStudent({
            academicSession: db.activeSession,
            admissionType: 'Paid',
            admissionFee: 0,
            previousSchool: '',
            lastGradePassed: '',
            tcDetails: '',
            rollNumber: row.rollNumber || undefined,
            name: row.studentName,
            dob: '2019-01-01',
            gender: 'Male',
            casteCategory: 'General',
            className: row.className,
            section: row.section || 'A',
            monthlyTuitionFee: row.paidAmount,
            fatherName: 'Guardian',
            motherName: '',
            phone: '',
            alternatePhone: '',
            address: '',
            photoDataUrl: '',
            aadhaarNumber: '',
            aadhaarDocDataUrl: '',
            transportEnabled: false,
            routeId: '',
            transportFee: 0,
            customNotes: 'Auto-created during Fee Migration',
            admissionDate: getTodayISO(),
          });

          collectFee({
            studentId: newStudent.id,
            category: 'Tuition',
            feeMonth: row.feeMonth || 'April',
            paymentMode: row.paymentMode || 'Cash',
            amount: row.paidAmount,
            date: row.paymentDate || getTodayISO(),
            remarks: row.remarks || 'Opening Dues / Legacy Payment Migration',
          });
          imported++;
          totalAmt += row.paidAmount;
        }
      }

      setImportSummary(
        `Successfully imported ${imported} fee records totaling ₹${totalAmt.toLocaleString('en-IN')}. Ledger balances updated.`
      );
      setFeeRows([]);
      notify(
        'success',
        'Fee Migration Complete',
        `${imported} receipts posted to financial ledgers (₹${totalAmt.toLocaleString('en-IN')}).`
      );
    } catch (err) {
      notify('error', 'Fee Import Failed', err instanceof Error ? err.message : 'Error importing fees.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section className="space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                Bulk Excel / CSV Data Migration &amp; Import
              </h2>
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                Live Cloud Sync
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Import existing school records from Excel spreadsheets (.xlsx, .xls) or CSV files directly into your school&apos;s isolated cloud database.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            Active Session: <strong className="text-slate-800">{db.activeSession}</strong>
          </span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => {
            setActiveTab('students');
            setImportSummary(null);
          }}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-bold transition-colors ${
            activeTab === 'students'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <GraduationCap className="h-4 w-4" />
          <span>1. Students Migration ({studentRows.length > 0 ? studentRows.length : db.students.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('staff');
            setImportSummary(null);
          }}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-bold transition-colors ${
            activeTab === 'staff'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Briefcase className="h-4 w-4" />
          <span>2. Staff &amp; Faculty Migration ({staffRows.length > 0 ? staffRows.length : db.staff.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('fees');
            setImportSummary(null);
          }}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-bold transition-colors ${
            activeTab === 'fees'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wallet className="h-4 w-4" />
          <span>3. Fee Records &amp; Opening Dues ({feeRows.length > 0 ? feeRows.length : db.fees.length})</span>
        </button>
      </div>

      {/* Success / Summary Message */}
      {importSummary && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-xs text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{importSummary}</span>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'students' && (
              <button
                type="button"
                onClick={() => setActiveModule('admissions')}
                className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
              >
                Go to Students Directory
              </button>
            )}
            {activeTab === 'staff' && (
              <button
                type="button"
                onClick={() => setActiveModule('staff')}
                className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
              >
                Go to Staff Directory
              </button>
            )}
            {activeTab === 'fees' && (
              <button
                type="button"
                onClick={() => setActiveModule('fees')}
                className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
              >
                Go to Fee Ledgers
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: STUDENTS IMPORT */}
      {activeTab === 'students' && (
        <div className="space-y-6">
          {/* Action Header Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Bulk Student Admission &amp; Profile Migration
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Download the sample template below, fill student records (Roll No, Name, Class, DOB, Parents, Fee), and upload.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadStudentTemplate('xlsx')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <span>Download .xlsx Template</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadStudentTemplate('csv')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
                >
                  <Download className="h-4 w-4 text-slate-500" />
                  <span>Download .csv</span>
                </button>
              </div>
            </div>

            {/* Dropzone */}
            <div className="mt-5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-6 text-center hover:border-indigo-400 hover:bg-indigo-50/20 transition-colors"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-xs border border-slate-200 text-indigo-600">
                  <UploadCloud className="h-6 w-6" />
                </div>
                <p className="mt-2 text-sm font-bold text-slate-800">
                  Click to select an Excel (.xlsx) or CSV file
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Files are parsed safely inside your browser without uploading to any third-party server.
                </p>
              </div>
            </div>
          </div>

          {/* Parsed Preview Table */}
          {studentRows.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Parsed Records Preview ({studentRows.length} rows)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Verify the columns below. Click &quot;Commit Students to Cloud Database&quot; when ready.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStudentRows([])}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Clear</span>
                  </button>

                  <button
                    type="button"
                    disabled={isProcessing || !canImport}
                    onClick={handleExecuteStudentImport}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>
                      {isProcessing
                        ? 'Inserting Records...'
                        : `Commit ${studentRows.filter((r) => r.isValid).length} Students to Cloud`}
                    </span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                    <tr>
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">Roll No</th>
                      <th className="px-3 py-2.5">Student Name</th>
                      <th className="px-3 py-2.5">Class &amp; Sec</th>
                      <th className="px-3 py-2.5">Father Name</th>
                      <th className="px-3 py-2.5">Phone</th>
                      <th className="px-3 py-2.5">DOB</th>
                      <th className="px-3 py-2.5">Tuition Fee</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {studentRows.slice(0, 50).map((row, idx) => (
                      <tr key={idx} className={row.isValid ? 'hover:bg-slate-50/70' : 'bg-rose-50/40'}>
                        <td className="px-3 py-2 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono font-semibold">{row.rollNo || 'Auto'}</td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{row.name}</td>
                        <td className="px-3 py-2 font-medium">
                          {row.className} - {row.section}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{row.fatherName}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{row.phone || '—'}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{row.dob}</td>
                        <td className="px-3 py-2 font-mono font-semibold text-slate-900 tabular-nums">
                          ₹{row.monthlyTuitionFee}
                        </td>
                        <td className="px-3 py-2">
                          {row.isValid ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                              <AlertCircle className="h-3 w-3" />
                              {row.errors.join(', ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {studentRows.length > 50 && (
                <p className="text-right text-[11px] text-slate-500 italic">
                  Showing first 50 rows of {studentRows.length} total. All will be processed upon commit.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: STAFF IMPORT */}
      {activeTab === 'staff' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Bulk Staff &amp; Faculty HR Migration
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Import teachers, office clerks, accountants, and campus staff profiles with designations and salaries.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadStaffTemplate('xlsx')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <span>Download .xlsx Template</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadStaffTemplate('csv')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
                >
                  <Download className="h-4 w-4 text-slate-500" />
                  <span>Download .csv</span>
                </button>
              </div>
            </div>

            <div className="mt-5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-6 text-center hover:border-indigo-400 hover:bg-indigo-50/20 transition-colors"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-xs border border-slate-200 text-indigo-600">
                  <UploadCloud className="h-6 w-6" />
                </div>
                <p className="mt-2 text-sm font-bold text-slate-800">
                  Click to select a Staff Excel (.xlsx) or CSV file
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Parses staff records, designations, contact numbers, and qualifications.
                </p>
              </div>
            </div>
          </div>

          {staffRows.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Parsed Staff Records ({staffRows.length} rows)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Review staff designations and monthly salaries before saving.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStaffRows([])}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Clear</span>
                  </button>

                  <button
                    type="button"
                    disabled={isProcessing || !isCurrentUserAdmin}
                    onClick={handleExecuteStaffImport}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>
                      {isProcessing
                        ? 'Inserting Staff...'
                        : `Commit ${staffRows.filter((r) => r.isValid).length} Staff to Database`}
                    </span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                    <tr>
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">Staff ID</th>
                      <th className="px-3 py-2.5">Full Name</th>
                      <th className="px-3 py-2.5">Designation</th>
                      <th className="px-3 py-2.5">Department</th>
                      <th className="px-3 py-2.5">Phone</th>
                      <th className="px-3 py-2.5">Salary</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {staffRows.map((row, idx) => (
                      <tr key={idx} className={row.isValid ? 'hover:bg-slate-50/70' : 'bg-rose-50/40'}>
                        <td className="px-3 py-2 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono font-semibold">{row.staffId || 'Auto'}</td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{row.fullName}</td>
                        <td className="px-3 py-2 font-medium text-slate-700">{row.designation}</td>
                        <td className="px-3 py-2 text-slate-600">{row.department}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{row.phone || '—'}</td>
                        <td className="px-3 py-2 font-mono font-semibold text-slate-900 tabular-nums">
                          ₹{row.monthlySalary.toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2">
                          {row.isValid ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                              <AlertCircle className="h-3 w-3" />
                              {row.errors.join(', ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FEE RECORDS & OPENING DUES */}
      {activeTab === 'fees' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Import Fee Records, Receipts &amp; Opening Dues
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Import legacy fee collections and opening dues. Records will update student profiles and post into the school&apos;s financial ledger.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadFeesTemplate('xlsx')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <span>Download .xlsx Template</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadFeesTemplate('csv')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
                >
                  <Download className="h-4 w-4 text-slate-500" />
                  <span>Download .csv</span>
                </button>
              </div>
            </div>

            <div className="mt-5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-6 text-center hover:border-indigo-400 hover:bg-indigo-50/20 transition-colors"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-xs border border-slate-200 text-indigo-600">
                  <UploadCloud className="h-6 w-6" />
                </div>
                <p className="mt-2 text-sm font-bold text-slate-800">
                  Click to select Fee / Opening Dues Excel (.xlsx) or CSV file
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Matches students automatically by Admission ID (e.g. RB1001) or Student Name + Class.
                </p>
              </div>
            </div>
          </div>

          {feeRows.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Parsed Fee Records ({feeRows.length} rows)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Review payment amounts and student mappings before posting to the financial ledger.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setFeeRows([])}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Clear</span>
                  </button>

                  <button
                    type="button"
                    disabled={isProcessing || !canImport}
                    onClick={handleExecuteFeeImport}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>
                      {isProcessing
                        ? 'Posting to Ledgers...'
                        : `Post ${feeRows.filter((r) => r.isValid).length} Receipts to Ledger`}
                    </span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                    <tr>
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">Admission ID</th>
                      <th className="px-3 py-2.5">Student Name</th>
                      <th className="px-3 py-2.5">Class</th>
                      <th className="px-3 py-2.5">Paid Amount</th>
                      <th className="px-3 py-2.5">Payment Mode</th>
                      <th className="px-3 py-2.5">Payment Date</th>
                      <th className="px-3 py-2.5">Remarks</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {feeRows.map((row, idx) => (
                      <tr key={idx} className={row.isValid ? 'hover:bg-slate-50/70' : 'bg-rose-50/40'}>
                        <td className="px-3 py-2 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono font-semibold">{row.admissionId || 'Auto-Match'}</td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{row.studentName}</td>
                        <td className="px-3 py-2 font-medium">{row.className}</td>
                        <td className="px-3 py-2 font-mono font-bold text-emerald-700 tabular-nums">
                          ₹{row.paidAmount.toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2 font-medium">{row.paymentMode}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{row.paymentDate}</td>
                        <td className="px-3 py-2 text-slate-600 truncate max-w-[200px]">{row.remarks}</td>
                        <td className="px-3 py-2">
                          {row.isValid ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Valid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                              <AlertCircle className="h-3 w-3" />
                              {row.errors.join(', ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Feature summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <Layers className="h-4 w-4 text-indigo-600" />
            <span>Format Auto-Detection</span>
          </div>
          <p className="mt-1 text-slate-500 leading-relaxed">
            Intelligently supports both Microsoft Excel (.xlsx, .xls) and standard CSV format with dynamic column header matching.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            <span>Automated ID Assignment</span>
          </div>
          <p className="mt-1 text-slate-500 leading-relaxed">
            Preserves custom Roll Numbers and Admission IDs from your old system or auto-assigns sequential IDs if blank.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <CheckCircle2 className="h-4 w-4 text-sky-600" />
            <span>Instant Cloud Sync</span>
          </div>
          <p className="mt-1 text-slate-500 leading-relaxed">
            Records are synced instantly to Cloud Firestore under your school workspace and immediately appear across all ERP modules.
          </p>
        </div>
      </div>
    </section>
  );
};
