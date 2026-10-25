'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { FormAlert } from '@/components/forms/form-alert';

import { ProcessingStep, UploadStep } from './note-wizard';

/** Upload a new file version of a published note (with changelog); buyers get it too. */
export function NewVersion({ noteId, maxBytes }: { noteId: string; maxBytes: number }) {
  const t = useTranslations('seller.newVersion');
  const [stage, setStage] = useState<'upload' | 'processing' | 'done'>('upload');
  if (stage === 'done') return <FormAlert tone="success" message={t('done')} />;
  return stage === 'upload' ? (
    <UploadStep
      noteId={noteId}
      maxBytes={maxBytes}
      isNewVersion
      onUploaded={() => setStage('processing')}
    />
  ) : (
    <ProcessingStep
      noteId={noteId}
      onReady={() => setStage('done')}
      onRetry={() => setStage('upload')}
    />
  );
}
