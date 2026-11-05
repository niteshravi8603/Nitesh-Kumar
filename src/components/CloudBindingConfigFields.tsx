import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Database,
  Loader2,
  Server,
  ShieldAlert,
} from 'lucide-react';
import { CloudStorageProvider, DynamicCloudBinding } from '../types/erp';
import {
  SUPABASE_SETUP_SQL,
  testDynamicCloudConnection,
} from '../services/dynamicCloudBinding';

interface CloudBindingConfigFieldsProps {
  value: DynamicCloudBinding;
  onChange: (next: DynamicCloudBinding) => void;
  compact?: boolean;
  disabled?: boolean;
}

export const CloudBindingConfigFields: React.FC<CloudBindingConfigFieldsProps> = ({
  value,
  onChange,
  compact = false,
  disabled = false,
}) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    needsSupabaseTable?: boolean;
    message: string;
  } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const selectProvider = (provider: CloudStorageProvider) => {
    setTestResult(null);
    onChange({
      ...value,
      provider,
    });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testDynamicCloudConnection(value);
      setTestResult(res);
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Cloud connection test failed.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
      setCopiedSql(true);
      window.setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      // Fallback: user can manually select the preformatted SQL block
    }
  };

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-slate-50/70 ${
        compact ? 'p-3.5 space-y-3' : 'p-4 space-y-3.5'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 shrink-0 text-indigo-600" />
          <div>
            <p className="text-xs font-bold text-slate-900">
              Dynamic User-Owned Cloud Storage Binding
            </p>
            <p className="text-[11px] text-slate-500">
              Bind your personal Supabase or Firebase project (linked to your Gmail for any-device login)
            </p>
          </div>
        </div>
      </div>

      {/* 3-Way Provider Switcher */}
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        {(
          [
            {
              id: 'supabase' as const,
              title: 'Supabase Cloud',
              sub: 'Self-Hosted URL + Anon Key',
              icon: Server,
            },
            {
              id: 'firebase' as const,
              title: 'Firebase Cloud',
              sub: 'Project ID/URL + Web Key',
              icon: Database,
            },
            {
              id: 'managed' as const,
              title: 'Managed Cloud',
              sub: 'Zero-Setup Default Cloud',
              icon: Cloud,
            },
          ] as const
        ).map((opt) => {
          const Icon = opt.icon;
          const active = value.provider === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={() => selectProvider(opt.id)}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                active
                  ? 'border-indigo-600 bg-white text-slate-900 shadow-2xs'
                  : 'border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  active ? 'text-indigo-600' : 'text-slate-400'
                }`}
              />
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{opt.title}</p>
                <p className="truncate text-[10px] text-slate-500">{opt.sub}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Dynamic Credential Fields for Supabase or Firebase */}
      {value.provider === 'supabase' && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700">
                Supabase Project API URL <span className="text-rose-600">*</span>
              </label>
              <input
                type="url"
                disabled={disabled}
                value={value.apiUrl}
                onChange={(e) => {
                  setTestResult(null);
                  onChange({ ...value, apiUrl: e.target.value });
                }}
                placeholder="https://your-project-ref.supabase.co"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700">
                Supabase Public Anon Key <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                disabled={disabled}
                value={value.publicKey}
                onChange={(e) => {
                  setTestResult(null);
                  onChange({ ...value, publicKey: e.target.value });
                }}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-600">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">
                One-Time Supabase SQL Table Setup (`school_erp_tenants`)
              </span>
              <button
                type="button"
                onClick={handleCopySql}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                {copiedSql ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600" />
                    <span>SQL Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy SQL Setup</span>
                  </>
                )}
              </button>
            </div>
            <pre className="mt-2 max-h-28 overflow-x-auto rounded border border-slate-200 bg-slate-900 p-2 font-mono text-[10px] leading-relaxed text-slate-100">
              {SUPABASE_SETUP_SQL}
            </pre>
          </div>
        </div>
      )}

      {value.provider === 'firebase' && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Firebase Project ID or URL <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                disabled={disabled}
                value={value.apiUrl}
                onChange={(e) => {
                  setTestResult(null);
                  onChange({
                    ...value,
                    apiUrl: e.target.value,
                    firebaseProjectId: '',
                  });
                }}
                placeholder="my-school-erp-id or https://my-school.firebaseio.com"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Firestore Database ID (Optional)
              </label>
              <input
                type="text"
                disabled={disabled}
                value={value.firebaseDatabaseId || ''}
                onChange={(e) => {
                  setTestResult(null);
                  onChange({ ...value, firebaseDatabaseId: e.target.value });
                }}
                placeholder="(default)"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700">
                Firebase Public Web API Key <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                disabled={disabled}
                value={value.publicKey}
                onChange={(e) => {
                  setTestResult(null);
                  onChange({ ...value, publicKey: e.target.value });
                }}
                placeholder="AIzaSy..."
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            All Students, Fees, Staff, Attendance, and Exam records save directly inside{' '}
            <code className="font-mono text-slate-700">school_erp_tenants/&#123;school_id&#125;</code> in your personal Firebase project.
          </p>
        </div>
      )}

      {value.provider === 'managed' && (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
          Uses isolated multi-tenant Cloud Firestore storage out of the box. You can bind your own Supabase or Firebase project now or switch anytime from <strong>School Settings</strong>.
        </p>
      )}

      {/* Test Connection Bar */}
      {value.provider !== 'managed' && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <button
            type="button"
            disabled={testing || disabled}
            onClick={handleTestConnection}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60 whitespace-nowrap"
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            <span>{testing ? 'Testing Cloud Endpoint...' : 'Test Cloud Connection'}</span>
          </button>

          {testResult && (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                testResult.ok ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};
