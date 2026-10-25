'use client';

import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type DragEvent } from 'react';

import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

import { Button } from './button';
import { AlertIcon, CheckIcon, FileIcon, UploadIcon } from './icons';

export type UploadStatus =
  | { state: 'idle' }
  | { state: 'uploading'; fileName: string; progress: number }
  | { state: 'done'; fileName: string }
  | { state: 'error'; message: string };

/**
 * PDF drop zone with progress and cancel (SPEC §4.4). Validation of type/size happens here for
 * fast feedback and again on the server (magic bytes).
 */
export function FileDropzone({
  accept = 'application/pdf',
  maxBytes,
  status,
  onFile,
  onCancel,
  label,
  hint,
}: {
  accept?: string;
  maxBytes: number;
  status: UploadStatus;
  onFile: (file: File) => void;
  onCancel?: () => void;
  label: string;
  hint?: string;
}) {
  const t = useTranslations('ui.dropzone');
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const maxMb = Math.round(maxBytes / (1024 * 1024));

  function accepts(file: File): boolean {
    if (file.size > maxBytes) {
      setLocalError(t('tooLarge', { max: maxMb }));
      return false;
    }
    if (
      accept === 'application/pdf' &&
      file.type !== 'application/pdf' &&
      !file.name.toLowerCase().endsWith('.pdf')
    ) {
      setLocalError(t('notPdf'));
      return false;
    }
    setLocalError(null);
    return true;
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file && accepts(file)) onFile(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    handleFiles(event.dataTransfer.files);
  }

  const error = localError ?? (status.state === 'error' ? status.message : null);
  const busy = status.state === 'uploading';

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={busy ? undefined : onDrop}
        className={cn(
          'flex flex-col items-center gap-3 rounded-lg border-[1.5px] border-dashed px-4 py-8 text-center transition-colors',
          dragging ? 'border-pen bg-pen-soft' : 'border-field bg-paper-raised',
          error && 'border-danger',
        )}
      >
        {status.state === 'uploading' ? (
          <div className="flex w-full max-w-sm flex-col gap-3" aria-live="polite">
            <p className="flex items-center justify-center gap-2 truncate">
              <FileIcon className="size-5 shrink-0" />{' '}
              <span className="truncate">{status.fileName}</span>
            </p>
            <div
              role="progressbar"
              aria-label={t('progressLabel')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(status.progress)}
              className="h-2.5 w-full overflow-hidden rounded-full bg-paper-sunk"
            >
              <div
                className="h-full bg-pen transition-[width]"
                style={{ width: `${status.progress}%` }}
              />
            </div>
            <p className="tabular text-sm text-ink-muted">
              {t('progress', { percent: formatNumber(Math.round(status.progress)) })}
            </p>
            {onCancel ? (
              <Button variant="ghost" size="sm" onClick={onCancel} className="self-center">
                {t('cancel')}
              </Button>
            ) : null}
          </div>
        ) : status.state === 'done' ? (
          <p className="flex items-center gap-2 text-success" aria-live="polite">
            <CheckIcon className="size-5" /> {t('done', { name: status.fileName })}
          </p>
        ) : (
          <>
            <UploadIcon className="size-8 text-ink-muted" />
            <div>
              <label
                htmlFor={id}
                className="cursor-pointer font-medium text-pen underline-offset-4 hover:underline"
              >
                {label}
              </label>
              <p className="text-sm text-ink-muted">{hint ?? t('hint', { max: maxMb })}</p>
            </div>
          </>
        )}
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          disabled={busy}
          aria-label={label}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-sm text-danger">
          <AlertIcon className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      ) : null}
    </div>
  );
}
