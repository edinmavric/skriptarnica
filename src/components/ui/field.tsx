'use client';

import { createContext, useContext, useId, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface FieldContextValue {
  id: string;
  descriptionId: string;
  errorId: string;
  invalid: boolean;
  describedBy: string | undefined;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Returns aria wiring for a control rendered inside <Field>. Works outside a Field too. */
export function useField(): FieldContextValue | null {
  return useContext(FieldContext);
}

interface FieldProps {
  label: ReactNode;
  description?: ReactNode;
  error?: string | undefined;
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
  children: ReactNode;
}

/**
 * Label + description + error wiring (SPEC §8.1): every control gets a label, errors are
 * linked with aria-describedby and announced.
 */
export function Field({
  label,
  description,
  error,
  hideLabel,
  required,
  className,
  id: idProp,
  children,
}: FieldProps) {
  const generated = useId();
  const id = idProp ?? generated;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy =
    [description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(' ') ||
    undefined;
  return (
    <FieldContext.Provider
      value={{ id, descriptionId, errorId, invalid: Boolean(error), describedBy }}
    >
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className={cn('text-sm font-medium text-ink', hideLabel && 'sr-only')}>
          {label}
          {required ? (
            <span aria-hidden="true" className="text-danger">
              {' '}
              *
            </span>
          ) : null}
        </label>
        {description ? (
          <p id={descriptionId} className="text-sm text-ink-muted">
            {description}
          </p>
        ) : null}
        {children}
        {error ? (
          <p id={errorId} className="flex items-start gap-1.5 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
