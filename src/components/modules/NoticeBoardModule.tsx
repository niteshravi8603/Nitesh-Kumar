import React, { useMemo, useState } from 'react';
import { Bell, Plus, Trash2 } from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { NoticeCategory } from '../../types/erp';
import { formatTimestampDisplay } from '../../utils/formatters';
import { ModalShell } from '../ui/ModalShell';

const NOTICE_CATEGORIES: NoticeCategory[] = [
  'Academic',
  'Examination',
  'Holiday',
  'Transport',
  'Admissions',
  'General',
];

export const NoticeBoardModule: React.FC = () => {
  const { db, canManageCampusOps, addNotice, deleteNotice, requestConfirm } = useSchool();

  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<NoticeCategory>('Academic');
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState('');

  const filteredNotices = useMemo(() => {
    if (categoryFilter === 'ALL') return db.notices;
    return db.notices.filter((n) => n.category === categoryFilter);
  }, [db.notices, categoryFilter]);

  const openModal = () => {
    setTitle('');
    setCategory('Academic');
    setBody('');
    setFormError('');
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!title.trim()) {
      setFormError('Notice headline/title is required.');
      return;
    }
    if (!body.trim()) {
      setFormError('Notice announcement message body is required.');
      return;
    }
    addNotice({ title, category, body });
    setModalOpen(false);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            08. Digital Notice Board
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Broadcast school circulars, holiday schedules, examination alerts, and parent notices
          </p>
        </div>

        {canManageCampusOps && (
          <button
            type="button"
            onClick={openModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Post New Notice</span>
          </button>
        )}
      </div>

      {/* Category Filter Buttons */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/60 px-5 py-3">
        {(['ALL', ...NOTICE_CATEGORIES] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              categoryFilter === cat
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
            }`}
          >
            {cat === 'ALL' ? 'All Notices' : cat}
          </button>
        ))}
      </div>

      {/* Notice Stream */}
      {db.notices.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <Bell className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900">No Broadcast Notices Yet</h3>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            Publish official school announcements, PTM schedules, holiday circulars, or bus updates to keep faculty and staff informed.
          </p>
          {canManageCampusOps && (
            <button
              type="button"
              onClick={openModal}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>Create First Notice</span>
            </button>
          )}
        </div>
      ) : filteredNotices.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-slate-500">
          No notices published under the {categoryFilter} category.
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {filteredNotices.map((notice) => (
            <article key={notice.id} className="p-6 transition-colors hover:bg-slate-50/50">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {/* Unboxed clean metadata per Zero-Pill rule */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-indigo-700">{notice.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatTimestampDisplay(notice.createdAt)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Posted by {notice.postedBy}</span>
                  </div>

                  <h3 className="mt-1.5 text-base font-bold text-slate-900">{notice.title}</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                    {notice.body}
                  </p>
                </div>

                {canManageCampusOps && (
                  <button
                    type="button"
                    onClick={() =>
                      requestConfirm({
                        title: 'Delete Notice?',
                        description: `Delete "${notice.title}" from the Digital Notice Board?`,
                        confirmLabel: 'Delete Notice',
                        destructive: true,
                        onConfirm: () => deleteNotice(notice.id),
                      })
                    }
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 shrink-0"
                    title="Delete Notice"
                    aria-label={`Delete notice ${notice.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <ModalShell
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Post Digital Notice"
        subtitle="Publishes immediately to the RB Public School notice stream."
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Notice Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Parent-Teacher Meeting Schedule for Saturday"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Category *</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as NoticeCategory)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
            >
              {NOTICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Announcement Details *
            </label>
            <textarea
              rows={4}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write complete circular details, dates, and instructions..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
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
              Publish Notice
            </button>
          </div>
        </form>
      </ModalShell>
    </section>
  );
};
