import type { ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Optional footer (action buttons). */
  footer?: ReactNode;
}

/**
 * Accessible centred dialog with a dimmed backdrop. Closing is deliberate —
 * only the ✕ (or an explicit footer button) closes it, never a backdrop click,
 * so admins don't lose a half-filled form by mis-clicking outside.
 */
export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  if (!open) {
    return null;
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {title && (
          <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-bold">{title}</h2>
            <button
              onClick={onClose}
              className="text-2xl leading-none text-slate-400 hover:text-slate-700"
              aria-label="Закрити"
            >
              ×
            </button>
          </header>
        )}
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
