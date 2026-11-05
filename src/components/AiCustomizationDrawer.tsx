import React, { useState } from 'react';
import {
  Check,
  Loader2,
  Palette,
  Plus,
  QrCode,
  RotateCcw,
  Send,
  Sliders,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { useSchool } from '../context/SchoolContext';
import {
  AiAccentTheme,
  AiCustomizationSettings,
  DEFAULT_AI_CUSTOMIZATION,
  FeeReceiptStyle,
  MarksheetLayoutStyle,
} from '../types/erp';

const QUICK_AI_ACTIONS: Array<{ label: string; prompt: string }> = [
  {
    label: 'Add QR Code to Fee Receipt',
    prompt:
      'Add a scannable verification QR Code and Modern Boxed layout to Official Fee Payment Receipts with a non-refundable footer note.',
  },
  {
    label: 'Redesign Marksheet Layout',
    prompt:
      'Redesign the Student Marksheet to the Executive Crest layout with a Merit/Distinction rank badge and verification QR code.',
  },
  {
    label: 'CBSE Detailed Marksheet + Admit QR',
    prompt:
      'Switch Marksheets to CBSE Detailed scholastic layout and enable verification QR codes on both Admit Cards and Marksheets.',
  },
  {
    label: 'Add Blood Group & House Fields',
    prompt:
      'Add "Blood Group" and "School House" custom fields to the Student Admission form and print them on Admission Slips and Fee Receipts.',
  },
  {
    label: 'Emerald Campus Theme',
    prompt:
      'Switch the ERP workspace and printable stationery accent theme to Emerald Green with school emblem watermark on receipts.',
  },
  {
    label: 'Royal Blue Executive Theme',
    prompt:
      'Apply the Royal Blue institutional theme across the ERP header, buttons, and printable official documents.',
  },
];

const THEME_SWATCHES: Array<{ id: AiAccentTheme; label: string; dotClass: string }> = [
  { id: 'indigo', label: 'Indigo', dotClass: 'bg-indigo-600' },
  { id: 'emerald', label: 'Emerald', dotClass: 'bg-emerald-600' },
  { id: 'royal-blue', label: 'Royal Blue', dotClass: 'bg-blue-600' },
  { id: 'crimson', label: 'Crimson', dotClass: 'bg-rose-600' },
  { id: 'amber', label: 'Amber Gold', dotClass: 'bg-amber-600' },
  { id: 'slate', label: 'Executive Slate', dotClass: 'bg-slate-800' },
];

export const AiCustomizationDrawer: React.FC = () => {
  const {
    db,
    isCurrentUserAdmin,
    aiCustomization,
    aiDrawerOpen,
    setAiDrawerOpen,
    updateAiCustomization,
    resetAiCustomization,
    notify,
  } = useSchool();

  const [promptInput, setPromptInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [lastSummary, setLastSummary] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [newFieldLabel, setNewFieldLabel] = useState('');

  // Strictly visible ONLY to Main Admin (Owner)
  if (!isCurrentUserAdmin) {
    return null;
  }

  const runAiPrompt = async (promptText: string) => {
    const clean = promptText.trim();
    if (!clean || processing) return;

    setProcessing(true);
    setErrorMsg('');
    try {
      const response = await fetch('/api/ai/customize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: clean,
          currentConfig: aiCustomization,
          schoolName: db.schoolProfile.schoolName || 'School ERP',
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        assistantSummary?: string;
        configPatch?: Partial<AiCustomizationSettings>;
      };

      if (!response.ok || !data.ok || !data.configPatch) {
        setErrorMsg(data.error || 'Could not process customization request.');
        return;
      }

      const nextHistory = [
        clean,
        ...(aiCustomization.promptHistory || []).filter((p) => p !== clean),
      ].slice(0, 20);

      updateAiCustomization({
        ...aiCustomization,
        ...data.configPatch,
        promptHistory: nextHistory,
      });

      setLastSummary(data.assistantSummary || 'Live layout & stationery updated.');
      setPromptInput('');
      notify(
        'success',
        'ERP Customization Saved to Cloud',
        data.assistantSummary || 'Updated live theme, printable templates, and form settings.'
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Network error reaching customization engine.'
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    void runAiPrompt(promptInput);
  };

  const handleAddManualField = () => {
    const label = newFieldLabel.trim();
    if (!label) return;
    const key = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
    if (!key) return;
    if (aiCustomization.customStudentFields.some((f) => f.key === key)) {
      setNewFieldLabel('');
      return;
    }
    const nextFields = [
      ...aiCustomization.customStudentFields,
      {
        key,
        label: label.slice(0, 48),
        placeholder: `Enter ${label}`,
        showOnReceipt: false,
        showOnAdmissionSlip: true,
      },
    ].slice(0, 12);

    updateAiCustomization({
      ...aiCustomization,
      customStudentFields: nextFields,
    });
    setNewFieldLabel('');
  };

  const handleRemoveCustomField = (key: string) => {
    updateAiCustomization({
      ...aiCustomization,
      customStudentFields: aiCustomization.customStudentFields.filter((f) => f.key !== key),
    });
  };

  return (
    <>
      {/* Sticky Floating Widget (Main Admin Only, Hidden when Printing) */}
      <button
        type="button"
        onClick={() => setAiDrawerOpen(true)}
        className="no-print fixed right-5 bottom-5 z-40 inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:bg-slate-900"
      >
        <Wand2 className="h-4 w-4 text-indigo-400" />
        <span>Ask AI / Change Us</span>
      </button>

      {aiDrawerOpen && (
        <div
          className="no-print fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-[1px]"
          onClick={() => !processing && setAiDrawerOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Ask AI / Change Us Customization Studio"
        >
          <div
            className="flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
              <div>
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-indigo-400" />
                  <h2 className="text-sm font-bold tracking-tight">
                    Ask AI / Change Us — Live ERP Customizer
                  </h2>
                </div>
                <p className="mt-1 text-[11px] text-slate-300">
                  Main Admin Exclusive · Modify themes, Fee Receipt QR codes, Marksheet layouts, and custom Admission fields in real time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAiDrawerOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                aria-label="Close customization drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Prompt Form */}
              <form onSubmit={handleSubmitForm} className="space-y-2.5">
                <label className="block text-xs font-bold text-slate-900">
                  AI Layout &amp; Feature Prompt
                </label>
                <textarea
                  rows={3}
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="Describe what change or new feature you want to add/modify..."
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">
                    Syncs directly to your school&apos;s bound cloud database
                  </span>
                  <button
                    type="submit"
                    disabled={processing || !promptInput.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    {processing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    <span>{processing ? 'Applying...' : 'Apply with AI'}</span>
                  </button>
                </div>
              </form>

              {errorMsg && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                  {errorMsg}
                </div>
              )}

              {lastSummary && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3.5 py-2.5 text-xs text-emerald-900">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Applied to Workspace</span>
                  </div>
                  <p className="mt-1 leading-relaxed text-emerald-800">{lastSummary}</p>
                </div>
              )}

              {/* Quick Action Buttons */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-900">One-Click Quick Actions</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {QUICK_AI_ACTIONS.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      disabled={processing}
                      onClick={() => void runAiPrompt(item.prompt)}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-left text-xs font-semibold text-slate-800 transition-colors hover:border-indigo-300 hover:bg-indigo-50/60 disabled:opacity-50"
                    >
                      <span className="truncate">{item.label}</span>
                      <Wand2 className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Direct Real-Time Inspector & Toggles */}
              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-900">
                      Active Workspace &amp; Stationery Modifiers
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      resetAiCustomization();
                      setLastSummary('Restored default ERP theme and document layouts.');
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset Defaults</span>
                  </button>
                </div>

                {/* Theme Selector */}
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                    <Palette className="h-3.5 w-3.5 text-slate-500" />
                    <span>Brand &amp; Print Accent Theme</span>
                  </label>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {THEME_SWATCHES.map((sw) => {
                      const active = aiCustomization.accentTheme === sw.id;
                      return (
                        <button
                          key={sw.id}
                          type="button"
                          onClick={() =>
                            updateAiCustomization({
                              ...aiCustomization,
                              accentTheme: sw.id,
                            })
                          }
                          className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                            active
                              ? 'border-slate-900 bg-white text-slate-900 shadow-2xs'
                              : 'border-slate-200 bg-white/60 text-slate-600 hover:bg-white'
                          }`}
                        >
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${sw.dotClass}`} />
                          <span className="truncate">{sw.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Printable Template Controls */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Fee Receipt Style
                    </label>
                    <select
                      value={aiCustomization.feeReceiptStyle}
                      onChange={(e) =>
                        updateAiCustomization({
                          ...aiCustomization,
                          feeReceiptStyle: e.target.value as FeeReceiptStyle,
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                    >
                      <option value="classic">Classic Official Ledger</option>
                      <option value="modern-boxed">Modern Boxed Voucher</option>
                      <option value="compact-slip">Compact Office Slip</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Marksheet Layout
                    </label>
                    <select
                      value={aiCustomization.marksheetLayout}
                      onChange={(e) =>
                        updateAiCustomization({
                          ...aiCustomization,
                          marksheetLayout: e.target.value as MarksheetLayoutStyle,
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                    >
                      <option value="standard">Standard Official</option>
                      <option value="executive-crest">Executive Crest + Merit</option>
                      <option value="cbse-detailed">CBSE Detailed Scholastic</option>
                    </select>
                  </div>
                </div>

                {/* QR & Feature Checkboxes */}
                <div className="space-y-2 pt-1 text-xs">
                  <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                      <QrCode className="h-3.5 w-3.5 text-indigo-600" />
                      <span>QR Verification on Fee Receipts</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={aiCustomization.feeReceiptShowQr}
                      onChange={(e) =>
                        updateAiCustomization({
                          ...aiCustomization,
                          feeReceiptShowQr: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                  </label>

                  <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className="font-medium text-slate-800">
                      QR Verification &amp; Merit Badge on Marksheets
                    </span>
                    <input
                      type="checkbox"
                      checked={aiCustomization.marksheetShowQr}
                      onChange={(e) =>
                        updateAiCustomization({
                          ...aiCustomization,
                          marksheetShowQr: e.target.checked,
                          marksheetShowRankBadge: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                  </label>

                  <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className="font-medium text-slate-800">
                      QR Verification on Exam Admit Cards
                    </span>
                    <input
                      type="checkbox"
                      checked={aiCustomization.admitCardShowQr}
                      onChange={(e) =>
                        updateAiCustomization({
                          ...aiCustomization,
                          admitCardShowQr: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                  </label>
                </div>

                {/* Receipt Custom Footer Note */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Custom Fee Receipt Footer Note
                  </label>
                  <input
                    type="text"
                    value={aiCustomization.feeReceiptFooterNote}
                    onChange={(e) =>
                      updateAiCustomization({
                        ...aiCustomization,
                        feeReceiptFooterNote: e.target.value.slice(0, 350),
                      })
                    }
                    placeholder="e.g., Fees once paid are non-refundable."
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
                  />
                </div>

                {/* Custom Admission Form Fields */}
                <div className="border-t border-slate-200 pt-3">
                  <label className="block text-[11px] font-bold text-slate-800">
                    Custom Admission Form &amp; Stationery Fields (
                    {aiCustomization.customStudentFields.length})
                  </label>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={newFieldLabel}
                      onChange={(e) => setNewFieldLabel(e.target.value)}
                      placeholder="Add custom field (e.g., Blood Group, House)"
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={handleAddManualField}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add</span>
                    </button>
                  </div>

                  {aiCustomization.customStudentFields.length > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      {aiCustomization.customStudentFields.map((field) => (
                        <div
                          key={field.key}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-900">{field.label}</span>
                            <span className="ml-2 font-mono text-[10px] text-slate-400">
                              {field.showOnReceipt ? 'Receipt + Slip' : 'Admission Slip'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <label className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                              <input
                                type="checkbox"
                                checked={field.showOnReceipt}
                                onChange={(e) =>
                                  updateAiCustomization({
                                    ...aiCustomization,
                                    customStudentFields:
                                      aiCustomization.customStudentFields.map((f) =>
                                        f.key === field.key
                                          ? { ...f, showOnReceipt: e.target.checked }
                                          : f
                                      ),
                                  })
                                }
                                className="h-3.5 w-3.5 rounded border-slate-300"
                              />
                              <span>On Receipt</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomField(field.key)}
                              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              aria-label={`Remove ${field.label}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[11px] text-slate-500 flex items-center justify-between">
              <span>
                Theme: <strong className="text-slate-800">{aiCustomization.accentTheme}</strong>
              </span>
              <button
                type="button"
                onClick={() => setAiDrawerOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
