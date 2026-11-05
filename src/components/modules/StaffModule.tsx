import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UserCheck,
  Plus,
  Search,
  Pencil,
  Trash2,
  IdCard,
  Download,
  Printer,
  Image as ImageIcon,
  LayoutGrid,
  Barcode,
  QrCode,
  Eye,
  Upload,
  X,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { useRowSelection } from '../../hooks/useRowSelection';
import {
  DEFAULT_STAFF_DESIGNATIONS,
  IdCardCodeStyle,
  StaffMember,
} from '../../types/erp';
import { exportStaffToExcel } from '../../utils/excelExporter';
import {
  downloadStaffIdCardPng,
  downloadStaffIdCardsPdf,
} from '../../utils/idCardGenerator';
import {
  formatDateDisplay,
  formatINR,
  getInitials,
  getTodayISO,
  sanitizeNumber,
} from '../../utils/formatters';
import { QuickPhotoAttachmentControl } from '../QuickPhotoAttachmentControl';
import { StaffIdCardVisual } from '../StaffIdCardVisual';
import { ExcelExportBar, TableSelectCheckbox } from '../ui/ExcelExportControl';
import { ModalShell } from '../ui/ModalShell';

const SUBJECT_TEACHER_SENTINEL = '__SUBJECT_TEACHER__';
const CUSTOM_POST_SENTINEL = '__CUSTOM_POST__';

const QUICK_DEPARTMENTS = [
  'Administration Office',
  'Accounts & Finance',
  'Pre-Primary Wing',
  'Primary Faculty',
  'Campus Security',
  'General Support',
];

export const StaffModule: React.FC = () => {
  const {
    db,
    canManageCampusOps,
    staffSubTab,
    setStaffSubTab,
    preselectedStaffIdCardId,
    clearPreselectedStaffIdCard,
    addStaff,
    updateStaff,
    deleteStaff,
    addCustomDesignation,
    openPrintPreview,
    requestConfirm,
    notify,
    uploadCloudMedia,
    getEffectiveStaffPhoto,
    setTemporaryPhotoOverride,
    saveQuickPersonPhoto,
  } = useSchool();

  // Directory filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // ID Card Studio state
  const [studioSearch, setStudioSearch] = useState('');
  const [studioRoleFilter, setStudioRoleFilter] = useState<string>('ALL');
  const [selectedStudioStaffId, setSelectedStudioStaffId] = useState<string>('');
  const [codeStyle, setCodeStyle] = useState<IdCardCodeStyle>('barcode');
  const [downloadingPng, setDownloadingPng] = useState(false);

  // Staff Registration / Edit Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [openIdStudioOnSave, setOpenIdStudioOnSave] = useState(true);

  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Form fields
  const [staffIdInput, setStaffIdInput] = useState('');
  const [joinedDate, setJoinedDate] = useState(getTodayISO());
  const [fullName, setFullName] = useState('');
  const [fatherOrSpouseName, setFatherOrSpouseName] = useState('');
  const [designationSelect, setDesignationSelect] = useState<string>('Teacher (Mathematics)');
  const [teacherSubjectInput, setTeacherSubjectInput] = useState('');
  const [customPostInput, setCustomPostInput] = useState('');
  const [assignedDepartment, setAssignedDepartment] = useState('');
  const [qualification, setQualification] = useState('');
  const [salaryInput, setSalaryInput] = useState('');
  const [phone, setPhone] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [address, setAddress] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');

  // Combined list of all selectable designations (built-in + custom + any existing staff designations)
  const allDesignations = useMemo(() => {
    const list: string[] = [...DEFAULT_STAFF_DESIGNATIONS];
    const seen = new Set(list.map((d) => d.toLowerCase()));
    for (const custom of db.customDesignations || []) {
      const clean = custom.trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        list.push(clean);
      }
    }
    for (const member of db.staff) {
      const clean = (member.designation || '').trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        list.push(clean);
      }
    }
    return list;
  }, [db.customDesignations, db.staff]);

  // Distinct designations currently assigned in staff directory for quick filtering
  const activeStaffDesignations = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const member of db.staff) {
      const clean = (member.designation || '').trim();
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        list.push(clean);
      }
    }
    return list;
  }, [db.staff]);

  // Sync preselected staff ID when navigating to Staff ID Card Studio
  useEffect(() => {
    if (preselectedStaffIdCardId) {
      const exists = db.staff.some((m) => m.id === preselectedStaffIdCardId);
      if (exists) {
        setStudioRoleFilter('ALL');
        setStudioSearch('');
        setSelectedStudioStaffId(preselectedStaffIdCardId);
      }
      clearPreselectedStaffIdCard();
    }
  }, [preselectedStaffIdCardId, db.staff, clearPreselectedStaffIdCard]);

  const filteredStaff = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return db.staff
      .filter((m) => {
        if (roleFilter !== 'ALL' && m.designation !== roleFilter) return false;
        if (!q) return true;
        return (
          m.staffId.toLowerCase().includes(q) ||
          m.fullName.toLowerCase().includes(q) ||
          m.designation.toLowerCase().includes(q) ||
          m.assignedDepartment.toLowerCase().includes(q) ||
          m.fatherOrSpouseName.toLowerCase().includes(q) ||
          m.qualification.toLowerCase().includes(q) ||
          m.phone.toLowerCase().includes(q) ||
          m.emergencyContact.toLowerCase().includes(q)
        );
      })
      .map((m) => ({
        ...m,
        photoDataUrl: getEffectiveStaffPhoto(m),
      }));
  }, [db.staff, roleFilter, searchQuery, getEffectiveStaffPhoto]);

  const getStaffRowId = useCallback((m: StaffMember) => m.id, []);
  const staffSelection = useRowSelection(filteredStaff, getStaffRowId);
  const [exportingExcel, setExportingExcel] = useState(false);

  const handleExportStaffExcel = async (forceAll = false) => {
    const isPartial = !forceAll && staffSelection.selectedCount > 0;
    const rowsToExport = isPartial ? staffSelection.selectedItems : filteredStaff;
    if (rowsToExport.length === 0) return;

    setExportingExcel(true);
    try {
      const res = await exportStaffToExcel({
        staff: rowsToExport,
        schoolProfile: db.schoolProfile,
        activeSession: db.activeSession,
        roleFilter,
        isPartialSelection: isPartial,
      });
      notify(
        'success',
        'Staff Directory Exported to Excel (.xlsx)',
        `Downloaded ${res.filename} (${res.rowCount} staff profiles in ${res.elapsedMs}ms).`
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

  const studioFilteredStaff = useMemo(() => {
    const q = studioSearch.trim().toLowerCase();
    return db.staff
      .filter((m) => {
        if (studioRoleFilter !== 'ALL' && m.designation !== studioRoleFilter) return false;
        if (!q) return true;
        return (
          m.staffId.toLowerCase().includes(q) ||
          m.fullName.toLowerCase().includes(q) ||
          m.designation.toLowerCase().includes(q) ||
          m.assignedDepartment.toLowerCase().includes(q) ||
          m.phone.toLowerCase().includes(q)
        );
      })
      .map((m) => ({
        ...m,
        photoDataUrl: getEffectiveStaffPhoto(m),
      }));
  }, [db.staff, studioRoleFilter, studioSearch, getEffectiveStaffPhoto]);

  useEffect(() => {
    if (studioFilteredStaff.length === 0) {
      setSelectedStudioStaffId('');
      return;
    }
    const found = studioFilteredStaff.some((m) => m.id === selectedStudioStaffId);
    if (!selectedStudioStaffId || !found) {
      setSelectedStudioStaffId(studioFilteredStaff[0].id);
    }
  }, [studioFilteredStaff, selectedStudioStaffId]);

  const selectedStudioStaff = useMemo(() => {
    const raw = db.staff.find((m) => m.id === selectedStudioStaffId);
    if (!raw) return null;
    return {
      ...raw,
      photoDataUrl: getEffectiveStaffPhoto(raw),
    };
  }, [db.staff, selectedStudioStaffId, getEffectiveStaffPhoto]);

  const viewingMember = useMemo(() => {
    if (!viewingMemberId) return null;
    const raw = db.staff.find((m) => m.id === viewingMemberId);
    if (!raw) return null;
    return {
      ...raw,
      photoDataUrl: getEffectiveStaffPhoto(raw),
    };
  }, [viewingMemberId, db.staff, getEffectiveStaffPhoto]);

  const totalMonthlyPayroll = useMemo(
    () => db.staff.reduce((sum, m) => sum + (Number(m.monthlySalary) || 0), 0),
    [db.staff]
  );

  const nextSuggestedStaffId = useMemo(() => {
    let seq = db.counters.staffSeq || 101;
    while (db.staff.some((m) => m.staffId.toUpperCase() === `STF${seq}`)) {
      seq += 1;
    }
    return `STF${seq}`;
  }, [db.counters.staffSeq, db.staff]);

  const openAddModal = () => {
    setEditingMember(null);
    setStaffIdInput(nextSuggestedStaffId);
    setJoinedDate(getTodayISO());
    setFullName('');
    setFatherOrSpouseName('');
    setDesignationSelect('Teacher (Mathematics)');
    setTeacherSubjectInput('');
    setCustomPostInput('');
    setAssignedDepartment('');
    setQualification('');
    setSalaryInput('');
    setPhone('');
    setEmergencyContact('');
    setAddress('');
    setPhotoDataUrl('');
    setOpenIdStudioOnSave(true);
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (member: StaffMember) => {
    setEditingMember(member);
    setStaffIdInput(member.staffId);
    setJoinedDate(member.joinedDate || getTodayISO());
    setFullName(member.fullName);
    setFatherOrSpouseName(member.fatherOrSpouseName || '');

    if (allDesignations.includes(member.designation)) {
      setDesignationSelect(member.designation);
      setCustomPostInput('');
      setTeacherSubjectInput('');
    } else {
      setDesignationSelect(CUSTOM_POST_SENTINEL);
      setCustomPostInput(member.designation);
      setTeacherSubjectInput('');
    }

    setAssignedDepartment(member.assignedDepartment || '');
    setQualification(member.qualification || '');
    setSalaryInput(member.monthlySalary > 0 ? String(member.monthlySalary) : '0');
    setPhone(member.phone || '');
    setEmergencyContact(member.emergencyContact || '');
    setAddress(member.address || '');
    setPhotoDataUrl(member.photoDataUrl || '');
    setFormError('');
    setModalOpen(true);
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setFormError('');
    try {
      const refCode = staffIdInput.trim() || editingMember?.staffId || nextSuggestedStaffId;
      const uploaded = await uploadCloudMedia(file, 'staff-photo', refCode);
      setPhotoDataUrl(uploaded.displayUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not upload staff photograph.');
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) {
        photoInputRef.current.value = '';
      }
    }
  };

  const handleSaveCustomPostInline = () => {
    const clean = customPostInput.trim();
    if (!clean) {
      setFormError('Enter a designation/post title to add.');
      return;
    }
    const saved = addCustomDesignation(clean);
    if (saved) {
      setDesignationSelect(saved);
      setCustomPostInput('');
      setFormError('');
    }
  };

  const appendDepartmentToken = (token: string) => {
    setAssignedDepartment((prev) => {
      const cleanPrev = prev.trim();
      if (!cleanPrev) return token;
      const parts = cleanPrev.split(',').map((p) => p.trim());
      if (parts.some((p) => p.toLowerCase() === token.toLowerCase())) {
        return cleanPrev;
      }
      return `${cleanPrev}, ${token}`;
    });
  };

  const resolveEffectiveDesignation = (): string => {
    if (designationSelect === SUBJECT_TEACHER_SENTINEL) {
      const sub = teacherSubjectInput.trim();
      return sub ? `Teacher (${sub})` : '';
    }
    if (designationSelect === CUSTOM_POST_SENTINEL) {
      return customPostInput.trim();
    }
    return designationSelect.trim();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!fullName.trim()) {
      setFormError('Staff full name is required.');
      return;
    }
    if (!fatherOrSpouseName.trim()) {
      setFormError("Father's or Spouse name is required.");
      return;
    }

    const finalDesignation = resolveEffectiveDesignation();
    if (!finalDesignation) {
      setFormError(
        designationSelect === SUBJECT_TEACHER_SENTINEL
          ? 'Please enter the subject name for Teacher (Subject-wise).'
          : 'Please enter a valid custom Designation / Post.'
      );
      return;
    }

    if (!assignedDepartment.trim()) {
      setFormError('Assigned Department or Classes is required (e.g. Primary Wing, Class 3rd & 4th).');
      return;
    }

    if (phone.replace(/\D/g, '').length < 10) {
      setFormError('Valid 10-digit primary mobile number is required.');
      return;
    }

    if (emergencyContact.replace(/\D/g, '').length < 10) {
      setFormError('Valid 10-digit emergency contact number is required.');
      return;
    }

    if (!address.trim()) {
      setFormError('Residential address is required for official records and Staff ID Card.');
      return;
    }

    const cleanSalary = sanitizeNumber(salaryInput === '' ? 0 : salaryInput, 0);

    const payload = {
      staffId: staffIdInput.trim().toUpperCase(),
      fullName,
      fatherOrSpouseName,
      designation: finalDesignation,
      assignedDepartment,
      qualification: qualification.trim() || 'Not Specified',
      monthlySalary: cleanSalary,
      address,
      phone,
      emergencyContact,
      joinedDate: joinedDate || getTodayISO(),
      photoDataUrl,
    };

    if (editingMember) {
      const ok = updateStaff(editingMember.id, payload);
      if (!ok) return;
      setModalOpen(false);
    } else {
      const created = addStaff(payload);
      if (!created) return;
      setModalOpen(false);
      if (openIdStudioOnSave) {
        setSelectedStudioStaffId(created.id);
        setStaffSubTab('id-cards');
      }
    }
  };

  const handleQuickDownloadPdf = (member: StaffMember) => {
    downloadStaffIdCardsPdf([member], 'single', codeStyle, db.schoolProfile);
    notify(
      'success',
      'Staff ID Card PDF Downloaded',
      `Downloaded print-ready CR80 PDF for ${member.fullName} (${member.staffId}).`
    );
  };

  const handleQuickDownloadPng = async (member: StaffMember) => {
    setDownloadingPng(true);
    try {
      await downloadStaffIdCardPng(member, codeStyle, db.schoolProfile);
      notify(
        'success',
        'High-Res Staff ID PNG Saved',
        `Downloaded 300-DPI PNG Staff ID Card for ${member.fullName} (${member.staffId}).`
      );
    } finally {
      setDownloadingPng(false);
    }
  };

  const handleBatchGridPdf = () => {
    if (studioFilteredStaff.length === 0) return;
    downloadStaffIdCardsPdf(studioFilteredStaff, 'grid', codeStyle, db.schoolProfile);
    notify(
      'success',
      'Staff Multi-Card Sheet Downloaded',
      `Generated ${studioFilteredStaff.length} Staff ID Cards in 3×3 A4 print grid.`
    );
  };

  return (
    <section className="space-y-5">
      {/* Top Module Header & Sub-Tab Navigation */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              04. Staff &amp; Faculty Management
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span>
                Registered Staff:{' '}
                <strong className="font-mono font-semibold text-slate-800 tabular-nums">
                  {db.staff.length}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Monthly Payroll Outlay:{' '}
                <strong className="font-mono font-semibold text-slate-800 tabular-nums">
                  {formatINR(totalMonthlyPayroll)}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>Instant CR80 Staff ID Cards Enabled</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Sub-Tab Segmented Control */}
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setStaffSubTab('directory')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  staffSubTab === 'directory'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>Staff Directory ({db.staff.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setStaffSubTab('id-cards')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  staffSubTab === 'id-cards'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <IdCard className="h-3.5 w-3.5" />
                <span>Staff ID Card Studio</span>
              </button>
            </div>

            {staffSubTab === 'directory' && filteredStaff.length > 0 && (
              <button
                type="button"
                disabled={exportingExcel}
                onClick={() => void handleExportStaffExcel(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                title="Export selected or filtered staff profiles to formatted Microsoft Excel (.xlsx)"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                <span>
                  {staffSelection.selectedCount > 0
                    ? `Export Selected (${staffSelection.selectedCount}) (.xlsx)`
                    : 'Export to Excel (.xlsx)'}
                </span>
              </button>
            )}

            {canManageCampusOps && (
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>Register Staff Member</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SUB-TAB 1: STAFF DIRECTORY & ONBOARDING                               */}
      {/* ===================================================================== */}
      {staffSubTab === 'directory' && (
        <div className="rounded-xl border border-slate-200 bg-white">
          {/* Search & Dynamic Post Filter */}
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ID, name, post, dept, mobile..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="staff-post-filter"
                className="text-xs font-medium text-slate-500 whitespace-nowrap"
              >
                Designation:
              </label>
              <select
                id="staff-post-filter"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-indigo-600 focus:outline-none"
              >
                <option value="ALL">All Designations ({db.staff.length})</option>
                {activeStaffDesignations.map((post) => (
                  <option key={post} value={post}>
                    {post}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Staff Directory Table */}
          {db.staff.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <UserCheck className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                No Staff Members Registered Yet
              </h3>
              <p className="mt-1 max-w-lg text-xs leading-relaxed text-slate-500">
                Onboard Principal, Vice-Principal, subject-wise Teachers, Office Clerks, Accountants, Guards, Peons, or custom posts with photographs to automatically generate printable CR80 Staff ID Cards.
              </p>
              {canManageCampusOps && (
                <button
                  type="button"
                  onClick={openAddModal}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" />
                  <span>Register First Staff Member</span>
                </button>
              )}
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No staff members match your current search or designation filter.
            </div>
          ) : (
            <div>
              <ExcelExportBar
                totalCount={staffSelection.totalCount}
                selectedCount={staffSelection.selectedCount}
                isAllSelected={staffSelection.isAllSelected}
                exporting={exportingExcel}
                datasetLabel="staff profiles"
                onExportSelectedOrAll={() => void handleExportStaffExcel(false)}
                onExportFullDataset={() => void handleExportStaffExcel(true)}
                onToggleSelectAll={staffSelection.toggleSelectAll}
                onClearSelection={staffSelection.clearSelection}
              />
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                      <th className="w-10 px-4 py-3 text-center">
                        <TableSelectCheckbox
                          checked={staffSelection.isAllSelected}
                          indeterminate={staffSelection.isIndeterminate}
                          onChange={staffSelection.toggleSelectAll}
                          ariaLabel="Select all visible staff rows for Excel export"
                        />
                      </th>
                      <th className="px-4 py-3 whitespace-nowrap">Staff Member</th>
                      <th className="px-4 py-3 whitespace-nowrap">Emp / Reg ID</th>
                      <th className="px-4 py-3">Designation &amp; Department</th>
                      <th className="px-4 py-3 whitespace-nowrap">Mobile &amp; Emergency</th>
                      <th className="px-4 py-3 whitespace-nowrap">Joined / Qual.</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Salary (₹)</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">ID Card &amp; Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStaff.map((member) => {
                      const isRowChecked = staffSelection.isSelected(member.id);
                      return (
                        <tr
                          key={member.id}
                          className={`transition-colors hover:bg-slate-50/80 ${
                            isRowChecked ? 'bg-indigo-50/50' : ''
                          }`}
                        >
                          <td className="w-10 px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isRowChecked}
                              onChange={() => staffSelection.toggleRow(member.id)}
                              aria-label={`Select ${member.fullName} (${member.staffId})`}
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500/30"
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {member.photoDataUrl ? (
                            <img
                              src={member.photoDataUrl}
                              alt={member.fullName}
                              referrerPolicy="no-referrer"
                              className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-bold text-slate-600">
                              {getInitials(member.fullName)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{member.fullName}</p>
                            {member.fatherOrSpouseName && (
                              <p className="text-[11px] text-slate-500">
                                C/O: {member.fatherOrSpouseName}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 font-mono font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                        {member.staffId}
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{member.designation}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {member.assignedDepartment || 'General Campus'}
                        </p>
                      </td>

                      <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap">
                        <p className="font-semibold text-slate-900">{member.phone}</p>
                        {member.emergencyContact && (
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            Emerg: {member.emergencyContact}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-mono text-slate-800 tabular-nums">
                          {formatDateDisplay(member.joinedDate)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {member.qualification || '—'}
                        </p>
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatINR(member.monthlySalary)}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleQuickDownloadPdf(member)}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 whitespace-nowrap shrink-0"
                            title="Instant Download Staff ID Card PDF"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>ID PDF</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              openPrintPreview({
                                type: 'staff-id-card',
                                staffMembers: [member],
                                layoutMode: 'single',
                                codeStyle,
                              })
                            }
                            className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-700"
                            title="Print Staff ID Card"
                            aria-label={`Print ID Card for ${member.fullName}`}
                          >
                            <Printer className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStudioStaffId(member.id);
                              setStaffSubTab('id-cards');
                            }}
                            className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-emerald-700"
                            title="Open in Staff ID Card Studio"
                            aria-label={`Open ID Studio for ${member.fullName}`}
                          >
                            <IdCard className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setViewingMemberId(member.id)}
                            className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                            title="View Full Staff Profile"
                            aria-label={`View profile of ${member.fullName}`}
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {canManageCampusOps && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(member)}
                                className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                                title="Edit Staff Profile & Designation"
                                aria-label={`Edit ${member.fullName}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  requestConfirm({
                                    title: 'Remove Staff Member?',
                                    description: `Remove ${member.fullName} (${member.staffId} — ${member.designation}) from the ${db.schoolProfile.schoolName} directory?`,
                                    confirmLabel: 'Remove Staff',
                                    destructive: true,
                                    onConfirm: () => deleteStaff(member.id),
                                  })
                                }
                                className="rounded p-1.5 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                                title="Remove Staff Member"
                                aria-label={`Remove ${member.fullName}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
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
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 2: AUTOMATED STAFF ID CARD STUDIO                             */}
      {/* ===================================================================== */}
      {staffSubTab === 'id-cards' && (
        <div className="space-y-5">
          {/* Studio Controls Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Automated Staff Identity Card Studio (CR80 Print &amp; PDF)
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Select any registered staff member to generate high-resolution CR80 ID cards with{' '}
                {db.schoolProfile.schoolName} logo, designation, contacts, and verification barcode/QR
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
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

              {studioFilteredStaff.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      openPrintPreview({
                        type: 'staff-id-card',
                        staffMembers: studioFilteredStaff,
                        layoutMode: 'grid',
                        codeStyle,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span>Print Grid ({studioFilteredStaff.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleBatchGridPdf}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Batch Grid PDF ({studioFilteredStaff.length})</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
            {/* LEFT: Staff Selector & Auto-Fetched Details */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900">1. Select Staff Member</h4>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {studioFilteredStaff.length} of {db.staff.length} shown
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div className="relative sm:col-span-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={studioSearch}
                      onChange={(e) => setStudioSearch(e.target.value)}
                      placeholder="Search Staff ID, name, post, mobile..."
                      className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <select
                      value={studioRoleFilter}
                      onChange={(e) => setStudioRoleFilter(e.target.value)}
                      aria-label="Filter by Designation"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-indigo-600 focus:outline-none"
                    >
                      <option value="ALL">All Designations / Posts</option>
                      {activeStaffDesignations.map((post) => (
                        <option key={post} value={post}>
                          {post}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {db.staff.length === 0 ? (
                  <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center">
                    <UserCheck className="mx-auto h-7 w-7 text-slate-400" />
                    <p className="mt-2.5 text-sm font-bold text-slate-900">
                      No Staff Onboarded Yet
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      Register your first teacher or staff member to automatically populate the CR80 Staff ID Card template on the right.
                    </p>
                    <button
                      type="button"
                      onClick={openAddModal}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Register Staff Now</span>
                    </button>
                  </div>
                ) : studioFilteredStaff.length === 0 ? (
                  <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-500">
                    No staff members match your current filter.
                  </div>
                ) : (
                  <>
                    <div className="mt-4">
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Quick Staff Dropdown
                      </label>
                      <select
                        value={selectedStudioStaffId}
                        onChange={(e) => setSelectedStudioStaffId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none"
                      >
                        {studioFilteredStaff.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.staffId} — {m.fullName} ({m.designation})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-3 max-h-60 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {studioFilteredStaff.map((m) => {
                        const active = m.id === selectedStudioStaffId;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setSelectedStudioStaffId(m.id)}
                            className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs transition-colors ${
                              active ? 'bg-emerald-50/90' : 'bg-white hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {m.photoDataUrl ? (
                                <img
                                  src={m.photoDataUrl}
                                  alt={m.fullName}
                                  referrerPolicy="no-referrer"
                                  className="h-8 w-8 shrink-0 rounded-md border border-slate-200 object-cover"
                                />
                              ) : (
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 font-mono text-[11px] font-bold text-slate-600">
                                  {getInitials(m.fullName)}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">
                                  {m.fullName}
                                </p>
                                <p className="truncate text-[11px] text-slate-500">
                                  <span className="font-mono text-emerald-700 tabular-nums">
                                    {m.staffId}
                                  </span>
                                  {' · '}
                                  {m.designation}
                                </p>
                              </div>
                            </div>
                            {active && (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Synced Staff Summary Box */}
              {selectedStudioStaff && (
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-bold text-slate-900">
                      Synced Staff Database Record
                    </span>
                    <button
                      type="button"
                      onClick={() => openEditModal(selectedStudioStaff)}
                      className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:text-indigo-800 whitespace-nowrap"
                    >
                      <Pencil className="h-3 w-3" />
                      <span>Edit Details / Photo</span>
                    </button>
                  </div>
                  <div className="mt-2.5 space-y-1.5 text-[11px]">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Designation / Post</span>
                      <span className="font-semibold text-emerald-700 truncate">
                        {selectedStudioStaff.designation}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Dept / Classes</span>
                      <span className="font-medium text-slate-900 truncate">
                        {selectedStudioStaff.assignedDepartment || 'General Campus'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Mobile &amp; Emergency</span>
                      <span className="font-mono font-medium text-slate-900 tabular-nums">
                        {selectedStudioStaff.phone} / {selectedStudioStaff.emergencyContact || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Photograph</span>
                      <span className="font-medium text-slate-800">
                        {selectedStudioStaff.photoDataUrl
                          ? 'Uploaded (Synced)'
                          : 'Initials Placeholder'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: Live CR80 Staff ID Card Preview & Download/Print Actions */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    2. Print-Ready Staff ID Card Preview
                  </h4>
                  <p className="text-xs text-slate-500">
                    Standard CR80 Portrait Format (54mm × 86mm) · Pre-configured with{' '}
                    {db.schoolProfile.schoolName} crest &amp; signatory
                  </p>
                </div>
                <span className="font-mono text-[11px] font-semibold text-slate-500 tabular-nums">
                  {selectedStudioStaff
                    ? `LIVE · ${selectedStudioStaff.staffId}`
                    : 'TEMPLATE PREVIEW'}
                </span>
              </div>

              <div className="my-5 flex flex-col items-center justify-center rounded-xl border border-slate-200/80 bg-slate-100/75 px-4 py-7">
                <StaffIdCardVisual
                  staff={selectedStudioStaff}
                  codeStyle={codeStyle}
                  schoolProfile={db.schoolProfile}
                />
              </div>

              {selectedStudioStaff && (
                <div className="mb-4">
                  <QuickPhotoAttachmentControl
                    personName={selectedStudioStaff.fullName}
                    recordLabel={selectedStudioStaff.staffId}
                    hasExistingPhoto={Boolean(selectedStudioStaff.photoDataUrl)}
                    canSavePermanently={canManageCampusOps}
                    onSavePermanent={(dataUrl) =>
                      saveQuickPersonPhoto('staff', selectedStudioStaff.id, dataUrl)
                    }
                    onAttachTemporary={(dataUrl) =>
                      setTemporaryPhotoOverride('staff', selectedStudioStaff.id, dataUrl)
                    }
                  />
                </div>
              )}

              <div className="border-t border-slate-100 pt-4">
                {selectedStudioStaff ? (
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuickDownloadPdf(selectedStudioStaff)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap shrink-0"
                      >
                        <Download className="h-4 w-4" />
                        <span>Download ID Card (PDF)</span>
                      </button>

                      <button
                        type="button"
                        disabled={downloadingPng}
                        onClick={() => handleQuickDownloadPng(selectedStudioStaff)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-60 whitespace-nowrap shrink-0"
                      >
                        <ImageIcon className="h-4 w-4" />
                        <span>{downloadingPng ? 'Rendering...' : 'High-Res PNG'}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        openPrintPreview({
                          type: 'staff-id-card',
                          staffMembers: [selectedStudioStaff],
                          layoutMode: 'single',
                          codeStyle,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap shrink-0"
                    >
                      <Printer className="h-4 w-4" />
                      <span>Print Staff ID Card</span>
                    </button>
                  </div>
                ) : (
                  <p className="text-center text-xs text-slate-500">
                    Register or select a staff member on the left to enable direct PDF, 300-DPI PNG, and CR80 Print actions.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: STAFF REGISTRATION & PROFILE EDITING                         */}
      {/* ===================================================================== */}
      <ModalShell
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editingMember
            ? `Edit Staff Profile — ${editingMember.fullName} (${editingMember.staffId})`
            : 'Staff Onboarding & Registration Form'
        }
        subtitle="Capture complete personal, designation, department, contact, and photograph details for payroll & automated Staff ID Card generation."
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Section 1: Registration Number, Joining Date & Dynamic Designation */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold tracking-wide text-slate-800 uppercase">
                1. Employee Registration &amp; Dynamic Designation
              </h4>
              {designationSelect !== CUSTOM_POST_SENTINEL && (
                <button
                  type="button"
                  onClick={() => {
                    setDesignationSelect(CUSTOM_POST_SENTINEL);
                    setCustomPostInput('');
                  }}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 whitespace-nowrap"
                >
                  + Add Custom Post on the Fly
                </button>
              )}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Staff ID / Employee Reg. No. *
                </label>
                <input
                  type="text"
                  required
                  value={staffIdInput}
                  onChange={(e) => setStaffIdInput(e.target.value.toUpperCase())}
                  placeholder="e.g. STF101"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Date of Joining *
                </label>
                <input
                  type="date"
                  required
                  value={joinedDate}
                  onChange={(e) => setJoinedDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Designation / Post *
                </label>
                <select
                  value={designationSelect}
                  onChange={(e) => setDesignationSelect(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  <optgroup label="Standard School Posts">
                    {allDesignations.map((post) => (
                      <option key={post} value={post}>
                        {post}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Dynamic / Custom Options">
                    <option value={SUBJECT_TEACHER_SENTINEL}>
                      Teacher (Subject-wise — Specify Subject)
                    </option>
                    <option value={CUSTOM_POST_SENTINEL}>
                      + Custom Post / Designation (Type New)
                    </option>
                  </optgroup>
                </select>
              </div>
            </div>

            {designationSelect === SUBJECT_TEACHER_SENTINEL && (
              <div className="mt-3 rounded-lg border border-indigo-200 bg-white p-3">
                <label className="block text-xs font-semibold text-indigo-900">
                  Specify Teacher&apos;s Subject * (Saved as &ldquo;Teacher (Subject)&rdquo;)
                </label>
                <input
                  type="text"
                  value={teacherSubjectInput}
                  onChange={(e) => setTeacherSubjectInput(e.target.value)}
                  placeholder="e.g. Sanskrit, Physics, EVS & Art, Spoken English"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>
            )}

            {designationSelect === CUSTOM_POST_SENTINEL && (
              <div className="mt-3 rounded-lg border border-indigo-200 bg-white p-3">
                <label className="block text-xs font-semibold text-indigo-900">
                  New Custom Designation / Post Title *
                </label>
                <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={customPostInput}
                    onChange={(e) => setCustomPostInput(e.target.value)}
                    placeholder="e.g. Coordinator, Librarian, Lab Assistant, Bus Driver, Receptionist"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveCustomPostInline}
                    className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    Save to Post List
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Custom posts are saved to the school database for future staff registrations.
                </p>
              </div>
            )}
          </div>

          {/* Section 2: Personal, Academic & Department Details */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Full Name *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Sunita Verma"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Father&apos;s / Spouse Name *
              </label>
              <input
                type="text"
                required
                value={fatherOrSpouseName}
                onChange={(e) => setFatherOrSpouseName(e.target.value)}
                placeholder="e.g. Rajesh Verma"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700">
                Assigned Department / Classes *
              </label>
              <input
                type="text"
                required
                value={assignedDepartment}
                onChange={(e) => setAssignedDepartment(e.target.value)}
                placeholder="e.g. Primary Wing · Class 3rd & 4th or Administration Office"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400">Quick assign:</span>
                {QUICK_DEPARTMENTS.map((dept) => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => appendDepartmentToken(dept)}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
                  >
                    + {dept}
                  </button>
                ))}
                {db.classes.slice(0, 8).map((cls) => (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => appendDepartmentToken(`Class ${cls.className}`)}
                    className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700 whitespace-nowrap"
                  >
                    + {cls.className}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Qualification
              </label>
              <input
                type="text"
                value={qualification}
                onChange={(e) => setQualification(e.target.value)}
                placeholder="e.g. M.Sc., B.Ed. / B.Com / Graduate"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Monthly Salary (₹)
              </label>
              <input
                type="number"
                min={0}
                step="100"
                value={salaryInput}
                onChange={(e) => setSalaryInput(e.target.value)}
                placeholder="e.g. 18500"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none tabular-nums"
              />
            </div>
          </div>

          {/* Section 3: Contact Numbers, Residential Address & Photograph */}
          <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-12">
            <div className="space-y-4 sm:col-span-8">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Mobile Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit primary mobile"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Emergency Contact Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    placeholder="10-digit emergency contact"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Residential Address *
                </label>
                <textarea
                  rows={2}
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House No., Street / Mohalla, Post, District & PIN"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Staff Passport Photograph Upload */}
            <div className="flex flex-col items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:col-span-4">
              <p className="text-xs font-semibold text-slate-700">Staff Photograph</p>

              <div className="my-2.5">
                {photoDataUrl ? (
                  <div className="relative">
                    <img
                      src={photoDataUrl}
                      alt="Staff preview"
                      referrerPolicy="no-referrer"
                      className="h-28 w-24 rounded-lg border border-slate-300 bg-white object-cover shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotoDataUrl('')}
                      className="absolute -right-2 -top-2 rounded-full border border-slate-200 bg-white p-1 text-slate-600 shadow-xs hover:text-rose-600"
                      title="Remove Photograph"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-28 w-24 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-slate-400">
                    <Upload className="h-5 w-5" />
                    <span className="mt-1 text-[10px] font-medium">Passport Photo</span>
                  </div>
                )}
              </div>

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
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
            </div>
          </div>

          {!editingMember && (
            <label className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5 text-xs font-medium text-emerald-950 cursor-pointer">
              <input
                type="checkbox"
                checked={openIdStudioOnSave}
                onChange={(e) => setOpenIdStudioOnSave(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
              />
              <span>
                Open Staff ID Card Studio immediately after registration for instant PDF download &amp; printing
              </span>
            </label>
          )}

          {formError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploadingPhoto}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap"
            >
              {editingMember ? 'Save Updated Staff Profile' : 'Register Staff & Enable ID Card'}
            </button>
          </div>
        </form>
      </ModalShell>

      {/* ===================================================================== */}
      {/* MODAL 2: FULL STAFF DOSSIER & INSTANT ID CARD ACTIONS                 */}
      {/* ===================================================================== */}
      <ModalShell
        open={Boolean(viewingMember)}
        onClose={() => setViewingMemberId(null)}
        title={
          viewingMember
            ? `${viewingMember.fullName} — Staff Profile (${viewingMember.staffId})`
            : 'Staff Profile'
        }
        subtitle="Complete onboarding record with instant Staff ID Card download, print, and profile edit options."
        maxWidthClass="max-w-2xl"
      >
        {viewingMember && (
          <div className="space-y-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              {viewingMember.photoDataUrl ? (
                <img
                  src={viewingMember.photoDataUrl}
                  alt={viewingMember.fullName}
                  referrerPolicy="no-referrer"
                  className="h-32 w-28 shrink-0 rounded-xl border border-slate-300 object-cover"
                />
              ) : (
                <div className="flex h-32 w-28 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500">
                  <span className="font-mono text-xl font-bold text-slate-700">
                    {getInitials(viewingMember.fullName)}
                  </span>
                  <span className="mt-1 text-[10px]">No Photo</span>
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-2.5 text-xs">
                <div>
                  <h4 className="text-base font-bold text-slate-900">{viewingMember.fullName}</h4>
                  <p className="text-sm font-semibold text-emerald-700">
                    {viewingMember.designation}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
                  <div className="border-b border-slate-100 pb-1.5">
                    <span className="text-slate-500">Employee / Reg ID: </span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {viewingMember.staffId}
                    </span>
                  </div>
                  <div className="border-b border-slate-100 pb-1.5">
                    <span className="text-slate-500">Date of Joining: </span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {formatDateDisplay(viewingMember.joinedDate)}
                    </span>
                  </div>
                  <div className="border-b border-slate-100 pb-1.5">
                    <span className="text-slate-500">Father / Spouse: </span>
                    <span className="font-semibold text-slate-900">
                      {viewingMember.fatherOrSpouseName || '—'}
                    </span>
                  </div>
                  <div className="border-b border-slate-100 pb-1.5">
                    <span className="text-slate-500">Qualification: </span>
                    <span className="font-semibold text-slate-900">
                      {viewingMember.qualification || '—'}
                    </span>
                  </div>
                  <div className="border-b border-slate-100 pb-1.5">
                    <span className="text-slate-500">Mobile No.: </span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {viewingMember.phone}
                    </span>
                  </div>
                  <div className="border-b border-slate-100 pb-1.5">
                    <span className="text-slate-500">Emergency No.: </span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {viewingMember.emergencyContact || '—'}
                    </span>
                  </div>
                  <div className="border-b border-slate-100 pb-1.5">
                    <span className="text-slate-500">Monthly Salary: </span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {formatINR(viewingMember.monthlySalary)}
                    </span>
                  </div>
                  <div className="border-b border-slate-100 pb-1.5">
                    <span className="text-slate-500">Dept / Classes: </span>
                    <span className="font-semibold text-slate-900">
                      {viewingMember.assignedDepartment || 'General Campus'}
                    </span>
                  </div>
                  <div className="sm:col-span-2 pt-0.5">
                    <span className="text-slate-500">Residential Address: </span>
                    <span className="font-medium text-slate-900">
                      {viewingMember.address || '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickDownloadPdf(viewingMember)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download ID PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickDownloadPng(viewingMember)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span>Download PNG</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const target = viewingMember;
                    setViewingMemberId(null);
                    openPrintPreview({
                      type: 'staff-id-card',
                      staffMembers: [target],
                      layoutMode: 'single',
                      codeStyle,
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print ID Card</span>
                </button>
              </div>

              {canManageCampusOps && (
                <button
                  type="button"
                  onClick={() => {
                    const target = viewingMember;
                    setViewingMemberId(null);
                    openEditModal(target);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Edit Profile</span>
                </button>
              )}
            </div>
          </div>
        )}
      </ModalShell>
    </section>
  );
};
