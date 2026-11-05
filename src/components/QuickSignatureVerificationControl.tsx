import React, { useRef, useState } from 'react';
import { CheckCircle2, Feather, Stamp, Trash2, Upload } from 'lucide-react';
import { useSchool } from '../context/SchoolContext';
import { ModalShell } from './ui/ModalShell';

interface QuickSignatureVerificationControlProps {
  compact?: boolean;
  className?: string;
}

export const QuickSignatureVerificationControl: React.FC<QuickSignatureVerificationControlProps> = ({
  compact = false,
  className = '',
}) => {
  const { db, updateSchoolProfile, uploadCloudMedia, isCurrentUserAdmin, notify } = useSchool();
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [uploadingStamp, setUploadingStamp] = useState(false);

  const signatureInputRef = useRef<HTMLInputElement | null>(null);
  const stampInputRef = useRef<HTMLInputElement | null>(null);

  const signatureUrl = db.schoolProfile?.signatureDataUrl || '';
  const stampUrl = db.schoolProfile?.stampDataUrl || '';
  const authorityName = db.schoolProfile?.principalName || db.schoolProfile?.directorName || '';
  const authorityDesignation = db.schoolProfile?.authorityDesignation || 'Principal';

  const [draftName, setDraftName] = useState(authorityName);
  const [draftDesignation, setDraftDesignation] = useState(authorityDesignation);

  const openModal = () => {
    setDraftName(db.schoolProfile?.principalName || db.schoolProfile?.directorName || '');
    setDraftDesignation(db.schoolProfile?.authorityDesignation || 'Principal');
    setModalOpen(true);
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingSignature(true);
    try {
      const uploaded = await uploadCloudMedia(file, 'school-logo', 'school_signature');
      const updatedProfile = {
        ...db.schoolProfile,
        signatureDataUrl: uploaded.displayUrl,
      };
      updateSchoolProfile(updatedProfile);
      notify('success', 'Digital Signature Applied', 'Saved to School Settings and reflected on all documents.');
    } catch (err) {
      notify('error', 'Signature Upload Failed', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingSignature(false);
    }
  };

  const handleStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingStamp(true);
    try {
      const uploaded = await uploadCloudMedia(file, 'school-logo', 'school_stamp');
      const updatedProfile = {
        ...db.schoolProfile,
        stampDataUrl: uploaded.displayUrl,
      };
      updateSchoolProfile(updatedProfile);
      notify('success', 'Official Stamp Applied', 'Saved to School Settings and reflected on all documents.');
    } catch (err) {
      notify('error', 'Stamp Upload Failed', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingStamp(false);
    }
  };

  const handleSaveAuthorityText = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedProfile = {
      ...db.schoolProfile,
      principalName: draftName.trim() || db.schoolProfile?.principalName || '',
      authorityDesignation: draftDesignation.trim() || 'Principal',
    };
    updateSchoolProfile(updatedProfile);
    notify('success', 'Signatory Updated', 'Authority name & designation saved.');
    setModalOpen(false);
  };

  const handleRemoveSignature = () => {
    updateSchoolProfile({
      ...db.schoolProfile,
      signatureDataUrl: '',
    });
    notify('info', 'Signature Removed', 'Digital signature cleared from stationery.');
  };

  const handleRemoveStamp = () => {
    updateSchoolProfile({
      ...db.schoolProfile,
      stampDataUrl: '',
    });
    notify('info', 'Stamp Removed', 'Official school seal cleared from stationery.');
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <input
        ref={signatureInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleSignatureUpload}
        className="hidden"
      />
      <input
        ref={stampInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleStampUpload}
        className="hidden"
      />

      {compact ? (
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-xs hover:border-indigo-400 hover:bg-slate-50 transition-colors"
          title="Configure Principal Digital Signature & School Stamp"
        >
          <Feather className="h-3 w-3 text-indigo-600" />
          <span>{signatureUrl && stampUrl ? 'Signature & Seal (Active)' : 'Sign & Stamp'}</span>
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openModal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:border-indigo-400 hover:bg-slate-50 transition-colors"
          >
            <Feather className="h-3.5 w-3.5 text-indigo-600" />
            <span>Digital Signature &amp; Stamp</span>
            {signatureUrl && stampUrl && (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            )}
          </button>
        </div>
      )}

      {/* Quick Setup Modal */}
      <ModalShell
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Digital Signature & Official Stamp Verification"
        subtitle="Manage the authorized signature and official seal dynamically stamped on ID cards, marksheets, admit cards, and receipts."
        maxWidthClass="max-w-xl"
      >
        <div className="space-y-5">
          {/* Authority Name & Designation Form */}
          <form onSubmit={handleSaveAuthorityText} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Signatory Credentials
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Authorized Person / Principal Name
                </label>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="e.g., Mrs. Sunita Verma"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Designation Title
                </label>
                <input
                  type="text"
                  value={draftDesignation}
                  onChange={(e) => setDraftDesignation(e.target.value)}
                  placeholder="e.g., Principal / Director"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={!isCurrentUserAdmin}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Save Signatory Text
              </button>
            </div>
          </form>

          {/* Upload Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Digital Signature Card */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <Feather className="h-4 w-4 text-indigo-600" />
                  <span>Digital Signature</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 leading-normal">
                  Transparent PNG recommended. Renders directly over the authority line.
                </p>

                <div className="mt-3 flex h-20 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
                  {signatureUrl ? (
                    <img
                      src={signatureUrl}
                      alt="Digital Signature"
                      referrerPolicy="no-referrer"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">No signature uploaded</span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                <button
                  type="button"
                  disabled={uploadingSignature || !isCurrentUserAdmin}
                  onClick={() => signatureInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{uploadingSignature ? 'Uploading...' : signatureUrl ? 'Change' : 'Upload PNG'}</span>
                </button>
                {signatureUrl && isCurrentUserAdmin && (
                  <button
                    type="button"
                    onClick={handleRemoveSignature}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    title="Remove signature"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Official School Stamp Card */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <Stamp className="h-4 w-4 text-emerald-600" />
                  <span>Official School Stamp / Seal</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 leading-normal">
                  Circular institutional stamp/seal watermark overlaid on verification blocks.
                </p>

                <div className="mt-3 flex h-20 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
                  {stampUrl ? (
                    <img
                      src={stampUrl}
                      alt="Official Stamp"
                      referrerPolicy="no-referrer"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">No stamp uploaded</span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                <button
                  type="button"
                  disabled={uploadingStamp || !isCurrentUserAdmin}
                  onClick={() => stampInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{uploadingStamp ? 'Uploading...' : stampUrl ? 'Change' : 'Upload Seal'}</span>
                </button>
                {stampUrl && isCurrentUserAdmin && (
                  <button
                    type="button"
                    onClick={handleRemoveStamp}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    title="Remove stamp"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-slate-100 p-3 text-center text-xs text-slate-600">
            Preview of this signature and seal will immediately display on Student ID Cards, Staff ID Cards, Admit Cards, and Marksheets.
          </div>
        </div>
      </ModalShell>
    </div>
  );
};
