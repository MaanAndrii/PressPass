import type { InputHTMLAttributes } from 'react';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Field({ label, id, className = '', ...rest }: FieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        id={inputId}
        className={`block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
        {...rest}
      />
    </label>
  );
}
