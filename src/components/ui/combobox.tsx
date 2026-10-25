'use client';

import { useTranslations } from 'next-intl';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/cn';
import { normalizeForSearch } from '@/lib/search/normalize';

import { useField } from './field';
import { CheckIcon, ChevronDownIcon } from './icons';
import { controlClasses } from './input';
import { Spinner } from './spinner';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  /** Extra text that should match the query (e.g. short name "ETF"). */
  keywords?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null, option: ComboboxOption | null) => void;
  placeholder?: string;
  /** If set, filtering happens on the server: called with the raw query (debounced by caller). */
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  emptyMessage?: ReactNode;
  footer?: ReactNode;
  disabled?: boolean;
  id?: string;
  name?: string;
}

/**
 * ARIA 1.2 combobox with listbox popup (WAI-ARIA APG "Select-Only/Editable Combobox").
 * Local filtering is diacritics- and script-insensitive: "nis" finds "Niš".
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  onQueryChange,
  loading,
  emptyMessage,
  footer,
  disabled,
  id: idProp,
  name,
}: ComboboxProps) {
  const t = useTranslations('ui');
  const field = useField();
  const generated = useId();
  const inputId = idProp ?? field?.id ?? generated;
  const listId = `${inputId}-listbox`;
  const selected = options.find((option) => option.value === value) ?? null;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    if (onQueryChange || !query) return options;
    const q = normalizeForSearch(query);
    return options.filter((option) =>
      normalizeForSearch(
        `${option.label} ${option.keywords ?? ''} ${option.description ?? ''}`,
      ).includes(q),
    );
  }, [options, query, onQueryChange]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function commit(option: ComboboxOption) {
    onChange(option.value, option);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) setOpen(true);
        else setActive((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        if (open) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (open) {
          event.preventDefault();
          setActive(Math.max(filtered.length - 1, 0));
        }
        break;
      case 'Enter': {
        const option = filtered[active];
        if (open && option) {
          event.preventDefault();
          commit(option);
        }
        break;
      }
      case 'Escape':
        if (open) {
          event.preventDefault();
          setOpen(false);
          setQuery('');
        } else if (value) {
          onChange(null, null);
        }
        break;
      default:
        break;
    }
  }

  const activeOption = open ? filtered[active] : undefined;
  const displayValue = open ? query : (selected?.label ?? '');

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOption ? `${listId}-${activeOption.value}` : undefined}
        aria-invalid={field?.invalid || undefined}
        aria-describedby={field?.describedBy}
        autoComplete="off"
        disabled={disabled}
        placeholder={selected ? selected.label : placeholder}
        value={displayValue}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
          onQueryChange?.(event.target.value);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={(event) => {
          if (!listRef.current?.contains(event.relatedTarget as Node | null)) {
            setOpen(false);
            setQuery('');
          }
        }}
        onKeyDown={onKeyDown}
        className={cn(controlClasses, 'min-h-11 pr-10')}
      />
      {name ? <input type="hidden" name={name} value={value ?? ''} /> : null}
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted">
        {loading ? <Spinner /> : <ChevronDownIcon />}
      </span>
      <div
        className={cn(
          'absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-rule bg-paper-raised shadow-lift',
          !open && 'hidden',
        )}
      >
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={placeholder}
          className="max-h-72 overflow-y-auto p-1"
          tabIndex={-1}
        >
          {filtered.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${listId}-${option.value}`}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => commit(option)}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-sm px-3 py-1.5',
                  index === active && 'bg-paper-sunk',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.description ? (
                    <span className="block truncate text-sm text-ink-muted">
                      {option.description}
                    </span>
                  ) : null}
                </span>
                {isSelected ? <CheckIcon className="size-4 shrink-0 text-pen" /> : null}
              </li>
            );
          })}
        </ul>
        {filtered.length === 0 && !loading ? (
          <p className="px-4 py-3 text-sm text-ink-muted" role="status">
            {emptyMessage ?? t('noResults')}
          </p>
        ) : null}
        {footer ? <div className="border-t border-rule p-1">{footer}</div> : null}
      </div>
    </div>
  );
}
