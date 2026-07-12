import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../lib/api';

export type FilterPropertyKey =
  | 'tag'
  | 'serial'
  | 'qr'
  | 'location'
  | 'status'
  | 'categoryId'
  | 'departmentId';

export interface ActiveFilter {
  id: string;
  property: FilterPropertyKey;
  propertyLabel: string;
  value: string;
  displayValue: string;
}

interface FilterValue {
  value: string;
  label: string;
}

interface FilterProperty {
  key: FilterPropertyKey;
  label: string;
  description: string;
  values: FilterValue[];
}

interface FilterOptionsResponse {
  properties: FilterProperty[];
}

export function activeFiltersToParams(search: string, filters: ActiveFilter[]): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {
    search: search.trim() || undefined,
  };
  const grouped = new Map<FilterPropertyKey, string[]>();
  for (const f of filters) {
    const list = grouped.get(f.property) ?? [];
    if (!list.includes(f.value)) list.push(f.value);
    grouped.set(f.property, list);
  }
  for (const [key, values] of grouped) {
    params[key] = values.join(',');
  }
  return params;
}

export function AssetFilterBar({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  resultCount,
  isFetching,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  filters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
  resultCount?: number;
  isFetching?: boolean;
}) {
  const { data, isLoading: optionsLoading } = useQuery({
    queryKey: ['asset-filter-options'],
    queryFn: () => api<FilterOptionsResponse>('/assets/filter-options'),
    staleTime: 30_000,
  });

  const properties = data?.properties ?? [];
  const [open, setOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<FilterProperty | null>(null);
  const [propertyQuery, setPropertyQuery] = useState('');
  const [valueQuery, setValueQuery] = useState('');

  const filteredProperties = useMemo(() => {
    const q = propertyQuery.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  }, [properties, propertyQuery]);

  const filteredValues = useMemo(() => {
    if (!selectedProperty) return [];
    const q = valueQuery.trim().toLowerCase();
    const activeForProp = new Set(filters.filter((f) => f.property === selectedProperty.key).map((f) => f.value));
    return selectedProperty.values.filter((v) => {
      if (activeForProp.has(v.value)) return false;
      if (!q) return true;
      return v.label.toLowerCase().includes(q) || v.value.toLowerCase().includes(q);
    });
  }, [selectedProperty, valueQuery, filters]);

  function toggleOpen() {
    if (open) {
      closePanel();
    } else {
      setOpen(true);
      setSelectedProperty(null);
      setPropertyQuery('');
      setValueQuery('');
    }
  }

  function closePanel() {
    setOpen(false);
    setSelectedProperty(null);
    setPropertyQuery('');
    setValueQuery('');
  }

  function pickProperty(prop: FilterProperty) {
    setSelectedProperty(prop);
    setValueQuery('');
  }

  function addFilter(value: FilterValue) {
    if (!selectedProperty) return;
    onFiltersChange([
      ...filters,
      {
        id: `${selectedProperty.key}:${value.value}:${Date.now()}`,
        property: selectedProperty.key,
        propertyLabel: selectedProperty.label,
        value: value.value,
        displayValue: value.label,
      },
    ]);
    setValueQuery('');
  }

  function removeFilter(id: string) {
    onFiltersChange(filters.filter((f) => f.id !== id));
  }

  function clearAll() {
    onSearchChange('');
    onFiltersChange([]);
    closePanel();
  }

  return (
    <div className="mb-6 space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            className="input h-11 border-ink-600/80 bg-ink-900 pl-10 pr-3 shadow-sm"
            placeholder="Search by tag, serial, QR, category, status, department, or location"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {typeof resultCount === 'number' && (
            <span className="inline-flex h-11 items-center rounded-lg border border-ink-700 bg-ink-900 px-3 text-xs font-medium text-slate-400">
              {isFetching ? '…' : resultCount} total
            </span>
          )}

          <button
            type="button"
            onClick={toggleOpen}
            className={clsx(
              'inline-flex h-11 items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors',
              open
                ? 'border-accent/60 bg-accent/10 text-accent-soft'
                : 'border-ink-600 bg-ink-900 text-slate-200 hover:border-ink-500 hover:bg-ink-800',
            )}
          >
            <svg className="h-4 w-4 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
            </svg>
            Add filter
          </button>

          {(search || filters.length > 0) && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex h-11 items-center rounded-lg px-3 text-xs font-medium text-slate-400 hover:bg-ink-800 hover:text-slate-200"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-xs"
            >
              <span className="text-slate-500">{f.propertyLabel}</span>
              <span className="text-slate-600">=</span>
              <span className="font-medium text-slate-100">{f.displayValue}</span>
              <button
                type="button"
                className="ml-1 rounded p-0.5 text-slate-500 hover:bg-ink-700 hover:text-rose-300"
                onClick={() => removeFilter(f.id)}
                aria-label={`Remove ${f.propertyLabel} filter`}
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setSelectedProperty(null);
            }}
            className="text-xs font-medium text-accent-soft hover:underline"
          >
            + Add
          </button>
        </div>
      )}

      {/* Inline filter builder — no absolute overlay */}
      {open && (
        <div className="overflow-hidden rounded-xl border border-ink-600 bg-ink-900 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {selectedProperty ? `Filter by ${selectedProperty.label}` : 'Choose a property'}
            </p>
            <button type="button" onClick={closePanel} className="text-xs text-slate-500 hover:text-slate-200">
              Close
            </button>
          </div>

          <div className="grid min-h-[280px] md:grid-cols-[220px_1fr]">
            {/* Properties */}
            <div className="border-b border-ink-700 md:border-b-0 md:border-r">
              <div className="border-b border-ink-700 p-2">
                <input
                  className="input h-9 bg-ink-950/50 text-xs"
                  placeholder="Search properties…"
                  value={propertyQuery}
                  onChange={(e) => setPropertyQuery(e.target.value)}
                  autoFocus={!selectedProperty}
                />
              </div>
              <div className="max-h-64 overflow-y-auto p-1.5">
                {optionsLoading && <p className="px-3 py-8 text-center text-xs text-slate-500">Loading…</p>}
                {!optionsLoading && filteredProperties.length === 0 && (
                  <p className="px-3 py-8 text-center text-xs text-slate-500">No properties</p>
                )}
                {filteredProperties.map((prop) => (
                  <button
                    key={prop.key}
                    type="button"
                    onClick={() => pickProperty(prop)}
                    className={clsx(
                      'mb-0.5 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors',
                      selectedProperty?.key === prop.key
                        ? 'bg-accent/15 text-accent-soft'
                        : 'text-slate-300 hover:bg-ink-800',
                    )}
                  >
                    <span className="text-sm font-medium">{prop.label}</span>
                    <span className="rounded-md bg-ink-800 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-500">
                      {prop.values.length}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Values */}
            <div className="flex flex-col bg-ink-950/30">
              {!selectedProperty ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                  <p className="text-sm text-slate-400">Select a property on the left</p>
                  <p className="max-w-xs text-xs text-slate-600">
                    Unique values are loaded from your assets — pick one or more to narrow the list.
                  </p>
                </div>
              ) : (
                <>
                  <div className="border-b border-ink-700 px-4 py-3">
                    <p className="text-sm font-medium text-white">{selectedProperty.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{selectedProperty.description}</p>
                  </div>
                  <div className="border-b border-ink-700 p-2">
                    <input
                      className="input h-9 bg-ink-950/50 text-xs"
                      placeholder={`Search ${selectedProperty.label.toLowerCase()}…`}
                      value={valueQuery}
                      onChange={(e) => setValueQuery(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="max-h-52 flex-1 overflow-y-auto p-1.5">
                    {filteredValues.length === 0 ? (
                      <p className="px-3 py-8 text-center text-xs text-slate-500">
                        {selectedProperty.values.length === 0
                          ? 'No values in the database yet'
                          : 'No matching values (or already applied)'}
                      </p>
                    ) : (
                      filteredValues.map((v) => (
                        <button
                          key={v.value}
                          type="button"
                          onClick={() => addFilter(v)}
                          className="mb-0.5 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-ink-800"
                        >
                          <span className="truncate">{v.label}</span>
                          <span className="ml-3 shrink-0 text-xs font-medium text-accent-soft">Add</span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
