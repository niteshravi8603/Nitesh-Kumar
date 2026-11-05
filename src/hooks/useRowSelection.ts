import { useCallback, useMemo, useState } from 'react';

export interface RowSelectionState<T> {
  selectedIds: Set<string>;
  selectedItems: T[];
  selectedCount: number;
  totalCount: number;
  isAllSelected: boolean;
  isIndeterminate: boolean;
  isSelected: (id: string) => boolean;
  toggleRow: (id: string) => void;
  toggleSelectAll: () => void;
  selectAll: () => void;
  clearSelection: () => void;
}

/**
 * High-speed O(1) row selection hook scoped to the currently visible table dataset.
 * Automatically ignores stale IDs when search or class/session filters change.
 */
export function useRowSelection<T>(
  items: T[],
  getId: (item: T) => string
): RowSelectionState<T> {
  const [rawSelectedIds, setRawSelectedIds] = useState<Set<string>>(() => new Set());

  const visibleIdSet = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      set.add(getId(items[i]));
    }
    return set;
  }, [items, getId]);

  const selectedIds = useMemo(() => {
    if (rawSelectedIds.size === 0 || visibleIdSet.size === 0) {
      return new Set<string>();
    }
    const filtered = new Set<string>();
    rawSelectedIds.forEach((id) => {
      if (visibleIdSet.has(id)) {
        filtered.add(id);
      }
    });
    return filtered;
  }, [rawSelectedIds, visibleIdSet]);

  const selectedItems = useMemo(() => {
    if (selectedIds.size === 0) return [];
    return items.filter((item) => selectedIds.has(getId(item)));
  }, [items, selectedIds, getId]);

  const totalCount = items.length;
  const selectedCount = selectedIds.size;
  const isAllSelected = totalCount > 0 && selectedCount === totalCount;
  const isIndeterminate = selectedCount > 0 && selectedCount < totalCount;

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const toggleRow = useCallback((id: string) => {
    setRawSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const next = new Set<string>();
    visibleIdSet.forEach((id) => next.add(id));
    setRawSelectedIds(next);
  }, [visibleIdSet]);

  const clearSelection = useCallback(() => {
    setRawSelectedIds(new Set());
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setRawSelectedIds(new Set());
    } else {
      const next = new Set<string>();
      visibleIdSet.forEach((id) => next.add(id));
      setRawSelectedIds(next);
    }
  }, [isAllSelected, visibleIdSet]);

  return {
    selectedIds,
    selectedItems,
    selectedCount,
    totalCount,
    isAllSelected,
    isIndeterminate,
    isSelected,
    toggleRow,
    toggleSelectAll,
    selectAll,
    clearSelection,
  };
}
