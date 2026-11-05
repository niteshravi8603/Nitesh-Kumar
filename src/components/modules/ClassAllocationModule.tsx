import React, { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { sanitizeNumber } from '../../utils/formatters';
import { ModalShell } from '../ui/ModalShell';

export const ClassAllocationModule: React.FC = () => {
  const {
    db,
    canManageCampusOps,
    addClassAllocation,
    addSectionToClass,
    removeSectionFromClass,
    updateClassCapacity,
    deleteClassAllocation,
    requestConfirm,
  } = useSchool();

  const [modalOpen, setModalOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newSectionsText, setNewSectionsText] = useState('A, B');
  const [newCapacity, setNewCapacity] = useState('35');
  const [formError, setFormError] = useState('');

  // Inline section addition per class
  const [addingSectionForClass, setAddingSectionForClass] = useState<string | null>(null);
  const [inlineSectionInput, setInlineSectionInput] = useState('');

  const enrollmentMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    db.students.forEach((stu) => {
      if (stu.status === 'Deactive') return;
      if (!map[stu.className]) map[stu.className] = {};
      map[stu.className][stu.section] = (map[stu.className][stu.section] || 0) + 1;
    });
    return map;
  }, [db.students]);

  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!newClassName.trim()) {
      setFormError('Please enter a class name (e.g. 6th, Pre-Nursery).');
      return;
    }
    const sections = newSectionsText
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (sections.length === 0) {
      setFormError('Specify at least one section (e.g. A, B).');
      return;
    }
    const cap = sanitizeNumber(newCapacity, 5, 200);
    const ok = addClassAllocation(newClassName, sections, cap);
    if (ok) {
      setNewClassName('');
      setNewSectionsText('A, B');
      setNewCapacity('35');
      setModalOpen(false);
    }
  };

  const handleInlineSectionSubmit = (classId: string) => {
    if (!inlineSectionInput.trim()) return;
    const ok = addSectionToClass(classId, inlineSectionInput);
    if (ok) {
      setInlineSectionInput('');
      setAddingSectionForClass(null);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            05. Class &amp; Section Allocation
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Live seat occupancy across Nursery to 5th and custom classes with dynamic section controls
          </p>
        </div>

        {canManageCampusOps && (
          <button
            type="button"
            onClick={() => {
              setFormError('');
              setModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Custom Class</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 lg:grid-cols-3">
        {db.classes.map((cls) => {
          const secCounts = enrollmentMap[cls.className] || {};
          const totalEnrolled = Object.values(secCounts).reduce((a, b) => a + b, 0);
          const totalCapacity = cls.sections.length * cls.sectionCapacity;
          const utilizationPct =
            totalCapacity > 0 ? Math.min(100, Math.round((totalEnrolled / totalCapacity) * 100)) : 0;

          return (
            <div
              key={cls.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Class {cls.className}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {cls.sections.length} {cls.sections.length === 1 ? 'section' : 'sections'} ·{' '}
                      <span className="font-mono tabular-nums">{cls.sectionCapacity}</span> seats/sec
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                      {totalEnrolled}/{totalCapacity}
                    </span>
                    {canManageCampusOps && !cls.isDefault && (
                      <button
                        type="button"
                        onClick={() =>
                          requestConfirm({
                            title: `Remove Class ${cls.className}?`,
                            description: `Remove Class ${cls.className} from the class allocation list?`,
                            confirmLabel: 'Remove Class',
                            destructive: true,
                            onConfirm: () => deleteClassAllocation(cls.id),
                          })
                        }
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Remove custom class"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Utilization Bar */}
                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full transition-all ${
                        utilizationPct >= 90
                          ? 'bg-rose-500'
                          : utilizationPct >= 70
                          ? 'bg-amber-500'
                          : 'bg-indigo-600'
                      }`}
                      style={{ width: `${utilizationPct}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                    <span>Seat Occupancy</span>
                    <span className="font-mono tabular-nums">{utilizationPct}%</span>
                  </div>
                </div>

                {/* Section Breakdown Rows */}
                <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
                  {cls.sections.map((sec) => {
                    const count = secCounts[sec] || 0;
                    return (
                      <div key={sec} className="flex items-center justify-between py-2 text-xs">
                        <span className="font-medium text-slate-800">Section {sec}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-600 tabular-nums">
                            {count} / {cls.sectionCapacity} students
                          </span>
                          {canManageCampusOps && cls.sections.length > 1 && count === 0 && (
                            <button
                              type="button"
                              onClick={() => removeSectionFromClass(cls.id, sec)}
                              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                              title={`Remove empty Section ${sec}`}
                              aria-label={`Remove Section ${sec}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer Controls: Add Section & Capacity */}
              {canManageCampusOps && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  {addingSectionForClass === cls.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={4}
                        value={inlineSectionInput}
                        onChange={(e) => setInlineSectionInput(e.target.value.toUpperCase())}
                        placeholder="Sec (e.g. D)"
                        className="w-24 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-mono uppercase text-slate-900 focus:border-indigo-600 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleInlineSectionSubmit(cls.id)}
                        className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingSectionForClass(null);
                          setInlineSectionInput('');
                        }}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setAddingSectionForClass(cls.id);
                          setInlineSectionInput('');
                        }}
                        className="font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
                      >
                        + Add Section
                      </button>

                      <div className="flex items-center gap-1.5 text-slate-500">
                        <label htmlFor={`cap-${cls.id}`}>Cap/Sec:</label>
                        <input
                          id={`cap-${cls.id}`}
                          type="number"
                          min={5}
                          max={200}
                          defaultValue={cls.sectionCapacity}
                          onBlur={(e) => {
                            const next = sanitizeNumber(e.target.value, 5, 200);
                            if (next !== cls.sectionCapacity) {
                              updateClassCapacity(cls.id, next);
                            }
                          }}
                          className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-right font-mono text-xs text-slate-800 focus:border-indigo-600 focus:outline-none tabular-nums"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ModalShell
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Custom Class & Sections"
        subtitle="New classes become immediately selectable in Admissions, Attendance, and Exams."
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleAddClass} className="space-y-4" noValidate>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Class Name *</label>
            <input
              type="text"
              required
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="e.g. 6th or Pre-Nursery"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Assigned Sections (comma-separated) *
            </label>
            <input
              type="text"
              required
              value={newSectionsText}
              onChange={(e) => setNewSectionsText(e.target.value)}
              placeholder="A, B, C"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase text-slate-900 focus:border-indigo-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Max Student Capacity per Section *
            </label>
            <input
              type="number"
              min={5}
              max={200}
              required
              value={newCapacity}
              onChange={(e) => setNewCapacity(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none tabular-nums"
            />
          </div>

          {formError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Allocate Class
            </button>
          </div>
        </form>
      </ModalShell>
    </section>
  );
};
