import React from 'react';
import { Building2, GraduationCap, Mail, Phone, ShieldCheck } from 'lucide-react';

export const GLOBAL_APP_TITLE = 'NITESH SCHOOL MANAGEMENT SYSTEM';
export const GLOBAL_CONTACT_PHONE = '+91 8603219331';
export const GLOBAL_CONTACT_PHONE_HREF = 'tel:+918603219331';
export const GLOBAL_CONTACT_EMAIL = 'NITESHRAVI8603@GMAIL.COM';
export const GLOBAL_CONTACT_EMAIL_HREF = 'mailto:NITESHRAVI8603@GMAIL.COM';

interface AcademicBrandCrestProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'indigo' | 'dark' | 'emerald';
}

/**
 * Sleek, modern academic brand emblem combining GraduationCap and ShieldCheck.
 */
export const AcademicBrandCrest: React.FC<AcademicBrandCrestProps> = ({
  size = 'md',
  variant = 'indigo',
}) => {
  const boxClass =
    size === 'sm'
      ? 'h-7 w-7 rounded-lg'
      : size === 'lg'
      ? 'h-13 w-13 rounded-xl'
      : 'h-10 w-10 rounded-xl';

  const capClass =
    size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5';

  const badgeBoxClass =
    size === 'sm'
      ? '-right-1 -bottom-1 h-3.5 w-3.5 rounded'
      : size === 'lg'
      ? '-right-1 -bottom-1 h-5 w-5 rounded-md'
      : '-right-1 -bottom-1 h-4 w-4 rounded';

  const badgeIconClass =
    size === 'sm' ? 'h-2.5 w-2.5' : size === 'lg' ? 'h-3.5 w-3.5' : 'h-3 w-3';

  const surfaceClass =
    variant === 'dark'
      ? 'border border-slate-700 bg-slate-900 text-white'
      : variant === 'emerald'
      ? 'border border-emerald-400/30 bg-gradient-to-br from-emerald-600 to-teal-700 text-white'
      : 'border border-indigo-400/30 bg-gradient-to-br from-indigo-600 to-slate-900 text-white';

  return (
    <div className={`relative inline-flex shrink-0 items-center justify-center ${boxClass} ${surfaceClass}`}>
      <GraduationCap className={capClass} />
      <span
        aria-hidden="true"
        className={`absolute inline-flex items-center justify-center border border-slate-900 bg-emerald-500 text-white ${badgeBoxClass}`}
      >
        <ShieldCheck className={badgeIconClass} />
      </span>
    </div>
  );
};

interface TopBrandContactBarProps {
  fullWidthContainer?: boolean;
}

/**
 * Global top header banner displaying NITESH SCHOOL MANAGEMENT SYSTEM and official contact details.
 */
export const TopBrandContactBar: React.FC<TopBrandContactBarProps> = ({
  fullWidthContainer = true,
}) => {
  return (
    <div className="no-print w-full border-b border-slate-800/90 bg-slate-950 text-slate-200">
      <div
        className={`mx-auto flex flex-col gap-1.5 px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 ${
          fullWidthContainer ? 'w-full' : 'max-w-7xl'
        }`}
      >
        {/* Left: Aesthetic Academic Icon + Global App Name */}
        <div className="flex min-w-0 items-center gap-2.5">
          <AcademicBrandCrest size="sm" variant="indigo" />
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-display text-xs font-bold tracking-wide text-white sm:text-[13px]">
              {GLOBAL_APP_TITLE}
            </span>
            <span aria-hidden="true" className="hidden text-slate-600 xl:inline">
              ·
            </span>
            <span className="hidden items-center gap-1 text-[11px] font-medium text-slate-400 xl:inline-flex">
              <Building2 className="h-3 w-3 shrink-0 text-indigo-400" />
              <span>Academic ERP Suite</span>
            </span>
          </div>
        </div>

        {/* Right: Clean Unboxed Contact Info with Subtle Aesthetic Icons */}
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] font-medium tracking-wide text-slate-300 sm:text-xs">
          <a
            href={GLOBAL_CONTACT_PHONE_HREF}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
          >
            <Phone className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
            <span className="text-slate-400">Phone / WhatsApp:</span>
            <span className="font-mono font-semibold text-white tabular-nums">
              {GLOBAL_CONTACT_PHONE}
            </span>
          </a>

          <span aria-hidden="true" className="text-slate-700">
            |
          </span>

          <a
            href={GLOBAL_CONTACT_EMAIL_HREF}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
          >
            <Mail className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
            <span className="text-slate-400">Email:</span>
            <span className="font-mono font-semibold text-white">
              {GLOBAL_CONTACT_EMAIL}
            </span>
          </a>
        </div>
      </div>
    </div>
  );
};

/**
 * Clean printable top header banner rendered inside Invoices, Marksheets, Admit Cards, and ID Card Sheets.
 */
export const PrintableBrandContactStrip: React.FC<{ position?: 'header' | 'footer' }> = ({
  position = 'header',
}) => {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-700 ${
        position === 'header'
          ? 'mb-3.5 border-b border-slate-200 pb-2'
          : 'mt-5 border-t border-slate-200 pt-2.5'
      }`}
    >
      <div className="inline-flex items-center gap-1.5 font-display font-bold tracking-wide text-slate-900">
        <GraduationCap className="h-3.5 w-3.5 shrink-0 text-indigo-700" />
        <span>{GLOBAL_APP_TITLE}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 font-mono text-[9.5px] font-semibold text-slate-700 tabular-nums">
        <span className="inline-flex items-center gap-1">
          <Phone className="h-3 w-3 shrink-0 text-slate-600" />
          <span>Phone / WhatsApp: {GLOBAL_CONTACT_PHONE}</span>
        </span>
        <span aria-hidden="true" className="text-slate-400">
          |
        </span>
        <span className="inline-flex items-center gap-1">
          <Mail className="h-3 w-3 shrink-0 text-slate-600" />
          <span>Email: {GLOBAL_CONTACT_EMAIL}</span>
        </span>
      </div>
    </div>
  );
};
