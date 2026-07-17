'use client';

import { Field } from '@presspass/ui';
import { useState } from 'react';

import { downloadKeyfile, generateKeyfileSecret, readKeyfile } from '@/lib/keyfile';

/**
 * Admin encryption credential input: either a typed passphrase or a key-file.
 * Both resolve to the same secret string passed to `onChange`, so callers keep
 * sending it as the ordinary `passphrase`.
 */
export function EncryptionCredentialInput({
  value,
  onChange,
  label = 'Криптографічна фраза',
  required = false,
  allowGenerate = false,
  generateFilename,
}: {
  value: string;
  onChange: (secret: string) => void;
  label?: string;
  required?: boolean;
  /** Show a "generate a new key-file" button (only when setting a new credential). */
  allowGenerate?: boolean;
  generateFilename?: string;
}) {
  const [mode, setMode] = useState<'phrase' | 'file'>('phrase');
  const [fileName, setFileName] = useState<string | null>(null);

  function switchMode(next: 'phrase' | 'file') {
    setMode(next);
    onChange('');
    setFileName(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-4 text-xs">
        <button
          type="button"
          onClick={() => switchMode('phrase')}
          className={mode === 'phrase' ? 'font-semibold text-blue-700' : 'text-slate-500'}
        >
          Фраза
        </button>
        <button
          type="button"
          onClick={() => switchMode('file')}
          className={mode === 'file' ? 'font-semibold text-blue-700' : 'text-slate-500'}
        >
          Ключ-файл
        </button>
      </div>

      {mode === 'phrase' ? (
        <Field
          label={label}
          type="password"
          autoComplete="off"
          required={required}
          minLength={12}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div className="space-y-2">
          <span className="block text-sm font-medium text-slate-700">{label} — ключ-файл</span>
          <input
            type="file"
            accept=".key,.txt,text/plain"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              onChange(await readKeyfile(file));
              setFileName(file.name);
            }}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
          />
          {fileName && <p className="text-xs text-emerald-600">Завантажено: {fileName}</p>}
          {allowGenerate && (
            <button
              type="button"
              onClick={() => {
                const secret = generateKeyfileSecret();
                const name = generateFilename ?? 'presspass-admin.key';
                downloadKeyfile(secret, name);
                onChange(secret);
                setFileName(name);
              }}
              className="text-xs font-semibold text-blue-700 underline"
            >
              Згенерувати й завантажити новий ключ-файл
            </button>
          )}
        </div>
      )}
    </div>
  );
}
