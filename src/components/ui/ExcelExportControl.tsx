import React, { useEffect, useRef } from 'react';
import { FileSpreadsheet, CheckSquare, X, Loader2 } from 'lucide-react';

interface SelectAllCheckboxProps {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: () => void;
  ariaLabel?: string;
}

export const TableSelectCheckbox: React.FC<SelectAllCheckboxProps> = ({
  checked,
  indeterminate,
  disabled = false,
  onChange,
  ariaLabel = 'Select all rows',
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={ariaLabel}
      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
};

interface ExcelExportBarProps {
  totalCount: number;
  selectedCount: number;
  isAllSelected: boolean;
  exporting?: boolean;
  datasetLabel: string;
  onExportSelectedOrAll: () => void;
  onExportFullDataset?: () => void;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
}

export const ExcelExportBar: React.FC<ExcelExportBarProps> = ({
  totalCount,
  selectedCount,
  isAllSelected,
  exporting = false,
  datasetLabel,
  onExportSelectedOrAll,
  onExportFullDataset,
  onToggleSelectAll,
  onClearSelection,
}) => {
  if (totalCount === 0) return null;

  const hasPartialOrFullSelection = selectedCount > 0;

  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 bg-emerald-50/40 px-5 py-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onToggleSelectAll}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 whitespace-nowrap"
        >
          <CheckSquare className="h-3.5 w-3.5 text-indigo-600" />
          <span>{isAllSelected ? 'Deselect All' : `Select All (${totalCount})`}</span>
        </button>

        {hasPartialOrFullSelection ? (
          <div className="inline-flex items-center gap-2 font-medium text-slate-700">
            <span>
              <strong className="font-mono font-bold text-indigo-700 tabular-nums">
                {selectedCount}
              </strong>{' '}
              of{' '}
              <span className="font-mono tabular-nums">{totalCount}</span> {datasetLabel} selected
            </span>
            <button
              type="button"
              onClick={onClearSelection}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"
              title="Clear row selection"
            >
              <X className="h-3 w-3" />
              <span>Clear</span>
            </button>
          </div>
        ) : (
          <span className="text-slate-600">
            Ready to export{' '}
            <strong className="font-mono font-semibold text-slate-900 tabular-nums">
              {totalCount}
            </strong>{' '}
            {datasetLabel} (or tick checkboxes to export selected rows)
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {hasPartialOrFullSelection &&
          selectedCount < totalCount &&
          onExportFullDataset && (
            <button
              type="button"
              disabled={exporting}
              onClick={onExportFullDataset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-50 disabled:opacity-50 whitespace-nowrap"
              title={`Export all ${totalCount} rows in current view`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
              <span>Export All ({totalCount})</span>
            </button>
          )}

        <button
          type="button"
          disabled={exporting}
          onClick={onExportSelectedOrAll}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
          title={
            hasPartialOrFullSelection
              ? `Download Microsoft Excel (.xlsx) with ${selectedCount} selected rows`
              : `Download Microsoft Excel (.xlsx) with all ${totalCount} ${datasetLabel}`
          }
        >
          {exporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-3.5 w-3.5" />
          )}
          <span>
            {exporting
              ? 'Generating .xlsx...'
              : hasPartialOrFullSelection
              ? `Export Selected (${selectedCount}) to Excel (.xlsx)`
              : 'Export to Excel (.xlsx)'}
          </span>
        </button>
      </div>
    </div>
  );
};
