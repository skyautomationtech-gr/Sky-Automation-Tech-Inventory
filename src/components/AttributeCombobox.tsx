import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Plus, Search } from 'lucide-react';
import { normalizeAttributeCompareKey, normalizeAttributeName } from '../utils/productVariants';

export interface AttributeOption {
  id: string;
  name: string;
  hexCode?: string;
}

interface AttributeComboboxProps {
  value: string;
  options: AttributeOption[];
  builtinDefault?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  hasError?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onCreateNew: (name: string) => Promise<AttributeOption | string | void>;
}

export default function AttributeCombobox({
  value,
  options,
  builtinDefault,
  placeholder = 'Select or type...',
  searchPlaceholder = 'Type to search or add...',
  hasError = false,
  disabled = false,
  onChange,
  onCreateNew,
}: AttributeComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
        setCreateError('');
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  // Merge builtin default + options + current value cleanly without case-insensitive duplicates
  const mergedOptions = useMemo(() => {
    const map = new Map<string, AttributeOption>();
    if (builtinDefault) {
      const defClean = normalizeAttributeName(builtinDefault);
      if (defClean) {
        map.set(normalizeAttributeCompareKey(defClean), {
          id: `__builtin_${defClean.toLowerCase()}`,
          name: defClean,
        });
      }
    }
    for (const opt of options || []) {
      const clean = normalizeAttributeName(opt.name);
      if (!clean) continue;
      const key = normalizeAttributeCompareKey(clean);
      if (!map.has(key)) {
        map.set(key, { ...opt, name: clean });
      }
    }
    const currentClean = normalizeAttributeName(value);
    if (currentClean) {
      const key = normalizeAttributeCompareKey(currentClean);
      if (!map.has(key)) {
        map.set(key, { id: `__val_${key}`, name: currentClean });
      }
    }
    return Array.from(map.values());
  }, [options, builtinDefault, value]);

  const trimmedQuery = normalizeAttributeName(query);
  const queryKey = normalizeAttributeCompareKey(trimmedQuery);

  const filteredOptions = useMemo(() => {
    if (!queryKey) return mergedOptions;
    return mergedOptions.filter((opt) =>
      normalizeAttributeCompareKey(opt.name).includes(queryKey)
    );
  }, [mergedOptions, queryKey]);

  const exactMatch = useMemo(
    () =>
      queryKey
        ? mergedOptions.find((opt) => normalizeAttributeCompareKey(opt.name) === queryKey)
        : undefined,
    [mergedOptions, queryKey]
  );

  const canCreateNew = Boolean(trimmedQuery && !exactMatch);

  const handleSelect = (name: string) => {
    onChange(name);
    setIsOpen(false);
    setQuery('');
    setCreateError('');
  };

  const handleCreate = async () => {
    if (!trimmedQuery || exactMatch || creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const created = await onCreateNew(trimmedQuery);
      const finalName =
        typeof created === 'string'
          ? created
          : created && typeof created === 'object' && created.name
          ? created.name
          : trimmedQuery;
      onChange(finalName);
      setIsOpen(false);
      setQuery('');
    } catch (err: any) {
      setCreateError(err?.message || 'Could not add attribute.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`mt-1 w-full flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800 border rounded-xl py-2 px-3 text-sm text-left transition-colors cursor-pointer disabled:opacity-50 ${
          hasError
            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20'
            : isOpen
            ? 'border-amber-400 ring-2 ring-amber-400/20'
            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
      >
        <span className="truncate flex items-center gap-2 min-w-0">
          {(() => {
            const matched = mergedOptions.find(
              (o) => normalizeAttributeCompareKey(o.name) === normalizeAttributeCompareKey(value)
            );
            return matched?.hexCode ? (
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-300 dark:border-slate-600"
                style={{ backgroundColor: matched.hexCode }}
              />
            ) : null;
          })()}
          <span
            className={
              value
                ? 'text-slate-900 dark:text-slate-100 font-medium truncate'
                : 'text-slate-400 truncate'
            }
          >
            {value || placeholder}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 z-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950/50">
            <Search size={13} className="text-slate-400 shrink-0 ml-1" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (createError) setCreateError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (canCreateNew && filteredOptions.length === 0) {
                    void handleCreate();
                  } else if (exactMatch) {
                    handleSelect(exactMatch.name);
                  } else if (filteredOptions.length > 0 && !canCreateNew) {
                    handleSelect(filteredOptions[0].name);
                  } else if (canCreateNew) {
                    void handleCreate();
                  }
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsOpen(false);
                }
              }}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none py-1"
            />
          </div>

          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100/70 dark:divide-slate-800/70">
            {filteredOptions.map((opt) => {
              const isSelected =
                normalizeAttributeCompareKey(opt.name) === normalizeAttributeCompareKey(value);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelect(opt.name)}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 font-bold'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    {opt.hexCode && (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-300 dark:border-slate-600"
                        style={{ backgroundColor: opt.hexCode }}
                      />
                    )}
                    <span className="truncate">{opt.name}</span>
                  </span>
                  {isSelected && <Check size={13} className="shrink-0 text-amber-500" />}
                </button>
              );
            })}

            {filteredOptions.length === 0 && !canCreateNew && (
              <div className="px-3 py-3 text-center text-xs text-slate-400">
                No matching values
              </div>
            )}

            {canCreateNew && (
              <button
                type="button"
                disabled={creating}
                onClick={() => void handleCreate()}
                className="w-full px-3 py-2.5 text-left text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/20 hover:bg-amber-100/80 dark:hover:bg-amber-950/40 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 size={13} className="animate-spin shrink-0" />
                ) : (
                  <Plus size={13} className="shrink-0" />
                )}
                <span className="truncate">
                  {creating ? `Adding "${trimmedQuery}"...` : `+ Add "${trimmedQuery}"`}
                </span>
              </button>
            )}
          </div>

          {createError && (
            <div className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 text-[11px] font-semibold text-rose-600 dark:text-rose-300 border-t border-rose-200 dark:border-rose-900">
              {createError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
