import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronRight } from 'lucide-react';
import { Checkbox } from './SelectionControls';
import { Pagination } from './Navigation';
import { Skeleton } from './Card';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  width?: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface DataTableProps<T extends { id?: string | number }> {
  columns: Column<T>[];
  data: T[];
  keyExtractor?: (row: T) => string | number;
  selectable?: boolean;
  selectedIds?: (string | number)[];
  onSelectionChange?: (selectedIds: (string | number)[]) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  actions?: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T extends { id?: string | number }>({
  columns,
  data,
  keyExtractor = (row) => row.id || JSON.stringify(row),
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  isLoading = false,
  emptyMessage = 'No records found',
  pageSize = 15,
  onRowClick,
  actions,
  className = '',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  // Sorting
  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find(c => c.key === sortKey);
    if (!col) return data;

    return [...data].sort((a, b) => {
      let valA: any = col.sortValue ? col.sortValue(a) : (a as any)[sortKey];
      let valB: any = col.sortValue ? col.sortValue(b) : (b as any)[sortKey];

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return sortDirection === 'asc' ? -1 : 1;
      if (strA > strB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDirection, columns]);

  // Pagination
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    if (!pageSize) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortKey(null);
        setSortDirection('asc');
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      const allIds = data.map(keyExtractor);
      onSelectionChange(allIds);
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectRow = (id: string | number, checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange([...selectedIds, id]);
    } else {
      onSelectionChange(selectedIds.filter(selectedId => selectedId !== id));
    }
  };

  const isAllSelected = data.length > 0 && selectedIds.length === data.length;
  const isIndeterminate = selectedIds.length > 0 && selectedIds.length < data.length;

  return (
    <div className={`w-full flex flex-col bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-2xs overflow-hidden ${className}`}>
      {/* Table Scroll Area with Sticky Header */}
      <div className="overflow-x-auto w-full max-w-full scrollbar-thin">
        <table className="w-full text-left border-collapse text-sm">
          {/* Sticky Header */}
          <thead className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-850/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 select-none">
            <tr>
              {selectable && (
                <th className="w-10 px-4 py-3.5 text-center">
                  <Checkbox
                    checked={isAllSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    aria-label="Select all rows"
                  />
                </th>
              )}

              {columns.map((column) => {
                const isSorted = sortKey === column.key;
                const alignClass = 
                  column.align === 'right' ? 'text-right' : 
                  column.align === 'center' ? 'text-center' : 'text-left';

                return (
                  <th
                    key={column.key}
                    onClick={() => column.sortable && handleSort(column.key)}
                    style={{ width: column.width }}
                    className={`
                      px-4 py-3.5 text-xs font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400
                      ${alignClass}
                      ${column.sortable ? 'cursor-pointer hover:text-slate-900 dark:hover:text-slate-100 transition-colors' : ''}
                      ${column.className || ''}
                    `}
                  >
                    <div className={`inline-flex items-center gap-1.5 ${column.align === 'right' ? 'justify-end' : column.align === 'center' ? 'justify-center' : 'justify-start'}`}>
                      <span>{column.header}</span>
                      {column.sortable && (
                        <span className="text-slate-400">
                          {isSorted ? (
                            sortDirection === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-[#D4AF37]" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-[#D4AF37]" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-60" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}

              {actions && (
                <th className="px-4 py-3.5 text-xs font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">
                  Actions
                </th>
              )}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-sans text-slate-700 dark:text-slate-200">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)} className="p-0">
                    <Skeleton variant="table-row" />
                  </td>
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)}
                  className="py-12 text-center text-xs text-slate-400 dark:text-slate-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => {
                const id = keyExtractor(row);
                const isSelected = selectedIds.includes(id);

                return (
                  <tr
                    key={String(id)}
                    onClick={() => onRowClick?.(row)}
                    className={`
                      transition-colors duration-100
                      hover:bg-slate-50/80 dark:hover:bg-slate-800/50
                      ${isSelected ? 'bg-[#D4AF37]/5 dark:bg-[#D4AF37]/10' : ''}
                      ${onRowClick ? 'cursor-pointer' : ''}
                    `}
                  >
                    {selectable && (
                      <td className="w-10 px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onChange={(e) => handleSelectRow(id, e.target.checked)}
                          aria-label={`Select row ${index + 1}`}
                        />
                      </td>
                    )}

                    {columns.map((column) => {
                      const alignClass = 
                        column.align === 'right' ? 'text-right' : 
                        column.align === 'center' ? 'text-center' : 'text-left';

                      return (
                        <td
                          key={column.key}
                          className={`px-4 py-3 text-xs sm:text-sm ${alignClass} ${column.className || ''}`}
                        >
                          {column.render 
                            ? column.render(row, (currentPage - 1) * pageSize + index) 
                            : String((row as any)[column.key] ?? '')}
                        </td>
                      );
                    })}

                    {actions && (
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {actions(row)}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={sortedData.length}
            pageSize={pageSize}
          />
        </div>
      )}
    </div>
  );
}
