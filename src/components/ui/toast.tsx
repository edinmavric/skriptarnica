'use client';

import { useTranslations } from 'next-intl';
import { Toast as ToastPrimitive } from 'radix-ui';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './icons';

type ToastTone = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; tone?: ToastTone }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

const toneIcon = { info: InfoIcon, success: CheckIcon, error: AlertIcon } as const;

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('ui');
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback<ToastContextValue['toast']>(({ title, description, tone = 'info' }) => {
    const item: ToastItem = { id: nextId++, title, tone, ...(description ? { description } : {}) };
    setItems((current) => [...current.slice(-2), item]);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="down" duration={5000} label={t('notifications')}>
        {children}
        {items.map((item) => {
          const Icon = toneIcon[item.tone];
          return (
            <ToastPrimitive.Root
              key={item.id}
              type={item.tone === 'error' ? 'foreground' : 'background'}
              onOpenChange={(open) => {
                if (!open) setItems((current) => current.filter((x) => x.id !== item.id));
              }}
              className="flex items-start gap-3 rounded-md border border-rule bg-paper-raised p-3 pr-1 shadow-lift data-[state=open]:animate-pop-in data-[swipe=end]:translate-y-[var(--radix-toast-swipe-end-y)]"
            >
              <Icon
                className={cn(
                  'mt-0.5 size-5 shrink-0',
                  item.tone === 'success' && 'text-success',
                  item.tone === 'error' && 'text-danger',
                  item.tone === 'info' && 'text-pen',
                )}
              />
              <div className="min-w-0 flex-1">
                <ToastPrimitive.Title className="font-medium">{item.title}</ToastPrimitive.Title>
                {item.description ? (
                  <ToastPrimitive.Description className="text-sm text-ink-muted">
                    {item.description}
                  </ToastPrimitive.Description>
                ) : null}
              </div>
              <ToastPrimitive.Close
                aria-label={t('close')}
                className="grid size-9 place-items-center rounded-sm text-ink-muted hover:bg-paper-sunk"
              >
                <CloseIcon className="size-4" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="fixed right-0 bottom-20 left-0 z-[60] mx-auto flex w-full max-w-md flex-col gap-2 px-4 outline-none md:right-4 md:bottom-4 md:left-auto md:mx-0" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
