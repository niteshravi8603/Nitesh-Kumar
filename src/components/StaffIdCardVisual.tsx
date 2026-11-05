import React, { useMemo } from 'react';
import { GraduationCap, Mail, Phone, ShieldCheck, User } from 'lucide-react';
import { IdCardCodeStyle, SchoolProfileSettings, StaffMember } from '../types/erp';
import { formatDateDisplay, getInitials, getSchoolAcronym } from '../utils/formatters';
import {
  generateDeterministicBarcodeBars,
  generateVerificationMatrix,
} from '../utils/idCardGenerator';
import {
  GLOBAL_APP_TITLE,
  GLOBAL_CONTACT_EMAIL,
  GLOBAL_CONTACT_PHONE,
} from './TopBrandContactBar';

interface StaffIdCardVisualProps {
  staff?: StaffMember | null;
  codeStyle: IdCardCodeStyle;
  compactForPrintGrid?: boolean;
  schoolProfile?: SchoolProfileSettings;
}

export const StaffIdCardVisual: React.FC<StaffIdCardVisualProps> = ({
  staff,
  codeStyle,
  compactForPrintGrid = false,
  schoolProfile,
}) => {
  const isPlaceholder = !staff;
  const schoolName = schoolProfile?.schoolName?.trim() || GLOBAL_APP_TITLE;
  const schoolAcronym = getSchoolAcronym(schoolName);
  const schoolSubtitle =
    schoolProfile?.address?.trim() ||
    schoolProfile?.tagline?.trim() ||
    'Recognized Primary & Preparatory Institution';
  const schoolLogoUrl = schoolProfile?.logoDataUrl || '';
  const principalName = schoolProfile?.principalName?.trim() || '';
  const directorName = schoolProfile?.directorName?.trim() || '';
  const schoolPhone = schoolProfile?.phone?.trim() || GLOBAL_CONTACT_PHONE;

  const display = {
    fullName: staff?.fullName || 'Staff Full Name',
    staffId: staff?.staffId || 'STF101',
    designation: staff?.designation || 'Teacher (Mathematics)',
    fatherOrSpouseName: staff?.fatherOrSpouseName || 'Father / Spouse Name',
    assignedDepartment: staff?.assignedDepartment || 'Academic Faculty / Classes',
    phone: staff?.phone || '98XXXXXXXX',
    emergencyContact: staff?.emergencyContact || '99XXXXXXXX',
    joinedDate: staff?.joinedDate ? formatDateDisplay(staff.joinedDate) : 'DD Mon YYYY',
    address: staff?.address || 'House / Street, Locality, City',
    photoDataUrl: staff?.photoDataUrl || '',
  };

  const barcodeBars = useMemo(
    () => generateDeterministicBarcodeBars(`STAFF-${display.staffId}-${display.phone}`),
    [display.staffId, display.phone]
  );

  const qrMatrix = useMemo(
    () =>
      generateVerificationMatrix(
        `${schoolAcronym}|STAFF|${display.staffId}|${display.fullName}|${display.designation}|${display.phone}`
      ),
    [schoolAcronym, display.staffId, display.fullName, display.designation, display.phone]
  );

  const totalBarUnits = useMemo(
    () => barcodeBars.reduce((acc, u) => acc + u, 0),
    [barcodeBars]
  );

  const signatureUrl = schoolProfile?.signatureDataUrl || '';
  const stampUrl = schoolProfile?.stampDataUrl || '';
  const authorityDesignation = schoolProfile?.authorityDesignation?.trim() || (directorName ? 'Director' : 'Principal');
  const authorityTitle = `${authorityDesignation} Signature`;
  const authorityName = principalName || directorName || '';

  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-white text-slate-900 select-none ${
        compactForPrintGrid
          ? 'w-[54mm] h-[86mm] border-slate-300 text-[9px] rounded-lg shadow-none break-inside-avoid'
          : 'w-[324px] min-h-[516px] border-slate-300 shadow-lg'
      }`}
    >
      {/* Top Institutional Header */}
      <div>
        <div
          className={`bg-slate-900 text-white ${
            compactForPrintGrid ? 'px-2.5 pt-2.5 pb-2' : 'px-4 pt-4 pb-3'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {schoolLogoUrl ? (
              <img
                src={schoolLogoUrl}
                alt={schoolName}
                referrerPolicy="no-referrer"
                className={`shrink-0 rounded-lg bg-white object-contain p-0.5 border border-white/20 ${
                  compactForPrintGrid ? 'h-7 w-7' : 'h-10 w-10'
                }`}
              />
            ) : (
              <div
                className={`relative flex shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white border border-white/20 ${
                  compactForPrintGrid ? 'h-7 w-7' : 'h-10 w-10'
                }`}
              >
                <GraduationCap className={compactForPrintGrid ? 'h-4 w-4' : 'h-5 w-5'} />
                <ShieldCheck
                  className={`absolute -right-1 -bottom-1 rounded bg-slate-900 text-emerald-300 ${
                    compactForPrintGrid ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5 p-0.5'
                  }`}
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p
                className={`font-bold tracking-tight text-white leading-tight truncate ${
                  compactForPrintGrid ? 'text-[10.5px]' : 'text-base'
                }`}
              >
                {schoolName}
              </p>
              <p
                className={`text-slate-300 truncate ${
                  compactForPrintGrid ? 'text-[6.8px]' : 'text-[10px]'
                }`}
              >
                {schoolSubtitle}
              </p>
              {schoolPhone && !compactForPrintGrid && (
                <p className="font-mono text-[9.5px] text-slate-400 truncate tabular-nums">
                  Office: {schoolPhone}
                </p>
              )}
            </div>
          </div>

          <div
            className={`mt-2 flex items-center justify-between border-t border-white/15 pt-1.5 font-mono font-semibold text-emerald-300 tabular-nums ${
              compactForPrintGrid ? 'text-[7px]' : 'text-[10px]'
            }`}
          >
            <span>STAFF IDENTITY CARD</span>
            <span>ID: {display.staffId}</span>
          </div>
        </div>
        <div className={compactForPrintGrid ? 'h-1 bg-emerald-600' : 'h-1.5 bg-emerald-600'} />

        {/* Photo + Staff Name, Exact Designation & Employee ID */}
        <div
          className={`flex items-start gap-3 ${
            compactForPrintGrid ? 'px-2.5 pt-2.5' : 'px-4 pt-4'
          }`}
        >
          {display.photoDataUrl ? (
            <img
              src={display.photoDataUrl}
              alt={display.fullName}
              referrerPolicy="no-referrer"
              className={`shrink-0 rounded-lg border border-slate-300 object-cover ${
                compactForPrintGrid ? 'h-[66px] w-[54px]' : 'h-24 w-20'
              }`}
            />
          ) : (
            <div
              className={`flex shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400 ${
                compactForPrintGrid ? 'h-[66px] w-[54px]' : 'h-24 w-20'
              }`}
            >
              {isPlaceholder ? (
                <User className={compactForPrintGrid ? 'h-5 w-5' : 'h-7 w-7'} />
              ) : (
                <span
                  className={`font-mono font-bold text-slate-600 ${
                    compactForPrintGrid ? 'text-xs' : 'text-base'
                  }`}
                >
                  {getInitials(display.fullName)}
                </span>
              )}
              <span
                className={`mt-1 font-medium text-slate-400 ${
                  compactForPrintGrid ? 'text-[6px]' : 'text-[9px]'
                }`}
              >
                PHOTO
              </span>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p
              className={`font-semibold text-slate-400 ${
                compactForPrintGrid ? 'text-[6.5px]' : 'text-[10px]'
              }`}
            >
              STAFF FULL NAME
            </p>
            <p
              className={`font-bold leading-snug line-clamp-2 ${
                isPlaceholder ? 'text-slate-400 italic' : 'text-slate-900'
              } ${compactForPrintGrid ? 'text-[10px]' : 'text-sm'}`}
            >
              {display.fullName}
            </p>

            <p
              className={`mt-0.5 font-semibold truncate ${
                isPlaceholder ? 'text-emerald-600/70 italic' : 'text-emerald-700'
              } ${compactForPrintGrid ? 'text-[7.5px]' : 'text-xs'}`}
            >
              {display.designation}
            </p>

            <div
              className={`mt-1.5 rounded-md border border-emerald-200 bg-emerald-50/75 ${
                compactForPrintGrid ? 'px-1.5 py-1' : 'px-2.5 py-1.5'
              }`}
            >
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <p
                    className={`font-semibold text-emerald-800 ${
                      compactForPrintGrid ? 'text-[5.8px]' : 'text-[9px]'
                    }`}
                  >
                    EMP / REG NO.
                  </p>
                  <p
                    className={`font-mono font-bold text-slate-900 tabular-nums truncate ${
                      compactForPrintGrid ? 'text-[7.8px]' : 'text-xs'
                    }`}
                  >
                    {display.staffId}
                  </p>
                </div>
                <div>
                  <p
                    className={`font-semibold text-emerald-800 ${
                      compactForPrintGrid ? 'text-[5.8px]' : 'text-[9px]'
                    }`}
                  >
                    JOINED ON
                  </p>
                  <p
                    className={`font-mono font-bold text-slate-900 tabular-nums truncate ${
                      compactForPrintGrid ? 'text-[7.2px]' : 'text-[11px]'
                    }`}
                  >
                    {display.joinedDate}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Core Staff Details Table */}
        <div
          className={`space-y-1 ${
            compactForPrintGrid ? 'px-2.5 pt-2 text-[7.2px]' : 'px-4 pt-3 text-xs'
          }`}
        >
          <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-1">
            <span className="shrink-0 text-slate-500">Dept / Classes</span>
            <span
              className={`truncate font-semibold text-right ${
                isPlaceholder ? 'text-slate-400 italic' : 'text-slate-900'
              }`}
            >
              {display.assignedDepartment || 'General Campus'}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-1">
            <span className="shrink-0 text-slate-500">Father / Spouse</span>
            <span
              className={`truncate font-semibold text-right ${
                isPlaceholder ? 'text-slate-400 italic' : 'text-slate-900'
              }`}
            >
              {display.fatherOrSpouseName || '—'}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-1">
            <span className="shrink-0 text-slate-500">Mobile / Emerg.</span>
            <span
              className={`font-mono font-semibold tabular-nums text-right truncate ${
                isPlaceholder ? 'text-slate-400' : 'text-slate-900'
              }`}
            >
              {display.phone}
              {staff?.emergencyContact || isPlaceholder
                ? ` / ${display.emergencyContact}`
                : ''}
            </span>
          </div>

          <div className="flex items-start justify-between gap-3 pt-0.5">
            <span className="shrink-0 text-slate-500">Address</span>
            <span
              className={`line-clamp-2 text-right font-medium leading-snug ${
                isPlaceholder ? 'text-slate-400 italic' : 'text-slate-800'
              }`}
            >
              {display.address || '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Verification Barcode / QR & Authorized Signatory */}
      <div
        className={`border-t border-slate-200 bg-slate-50/90 ${
          compactForPrintGrid
            ? 'mx-2 mb-2 rounded px-2 py-1.5'
            : 'mx-3.5 mb-3.5 rounded-xl px-3 py-2.5'
        }`}
      >
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            {codeStyle === 'barcode' && (
              <div>
                <svg
                  viewBox={`0 0 ${totalBarUnits} 28`}
                  preserveAspectRatio="none"
                  className={compactForPrintGrid ? 'h-5 w-28' : 'h-8 w-44'}
                  aria-label="Staff Verification Barcode"
                >
                  {(() => {
                    let xCursor = 0;
                    return barcodeBars.map((units, i) => {
                      const x = xCursor;
                      xCursor += units;
                      if (i % 2 !== 0) return null;
                      return (
                        <rect
                          key={i}
                          x={x}
                          y={0}
                          width={units}
                          height={28}
                          fill="#0f172a"
                        />
                      );
                    });
                  })()}
                </svg>
                <p
                  className={`mt-0.5 font-mono text-slate-500 tabular-nums truncate ${
                    compactForPrintGrid ? 'text-[6px]' : 'text-[9px]'
                  }`}
                >
                  EMP: {display.staffId} · {display.designation}
                </p>
              </div>
            )}

            {codeStyle === 'qr' && (
              <div className="flex items-center gap-2">
                <svg
                  viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
                  className={`shrink-0 rounded border border-slate-200 bg-white p-0.5 ${
                    compactForPrintGrid ? 'h-9 w-9' : 'h-12 w-12'
                  }`}
                  aria-label="Staff Verification QR"
                >
                  {qrMatrix.map((row, r) =>
                    row.map((cell, c) =>
                      cell ? (
                        <rect
                          key={`${r}-${c}`}
                          x={c}
                          y={r}
                          width={1.04}
                          height={1.04}
                          fill="#0f172a"
                        />
                      ) : null
                    )
                  )}
                </svg>
                <div className="min-w-0">
                  <p
                    className={`font-bold text-slate-800 ${
                      compactForPrintGrid ? 'text-[6.5px]' : 'text-[10px]'
                    }`}
                  >
                    Verified Staff
                  </p>
                  <p
                    className={`font-mono text-slate-500 tabular-nums truncate ${
                      compactForPrintGrid ? 'text-[6px]' : 'text-[9px]'
                    }`}
                  >
                    {display.staffId}
                  </p>
                </div>
              </div>
            )}

            {codeStyle === 'none' && (
              <div>
                <p
                  className={`font-semibold text-slate-800 truncate ${
                    compactForPrintGrid ? 'text-[7px]' : 'text-[10px]'
                  }`}
                >
                  Authorized Faculty &amp; Staff
                </p>
                <p
                  className={`text-slate-500 truncate ${
                    compactForPrintGrid ? 'text-[6px]' : 'text-[9px]'
                  }`}
                >
                  Return to {schoolName} Office if found
                </p>
              </div>
            )}
          </div>

          <div className="relative shrink-0 text-center max-w-[104px]">
            {/* Stamp seal watermark */}
            {stampUrl && (
              <img
                src={stampUrl}
                alt="Stamp"
                referrerPolicy="no-referrer"
                className={`pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 object-contain opacity-70 rotate-[-10deg] ${
                  compactForPrintGrid ? 'h-7 w-7' : 'h-11 w-11'
                }`}
              />
            )}

            {/* Signature image */}
            {signatureUrl ? (
              <div className="flex justify-center mb-0.5">
                <img
                  src={signatureUrl}
                  alt="Signature"
                  referrerPolicy="no-referrer"
                  className={`object-contain ${
                    compactForPrintGrid ? 'h-3.5 max-w-[45px]' : 'h-6 max-w-[80px]'
                  }`}
                />
              </div>
            ) : null}

            {authorityName && (
              <p
                className={`font-semibold text-slate-700 truncate ${
                  compactForPrintGrid ? 'text-[5.8px]' : 'text-[9px]'
                }`}
              >
                {authorityName}
              </p>
            )}
            <div
              className={`mx-auto border-b border-slate-400 ${
                compactForPrintGrid ? 'w-14 mb-0.5' : 'w-20 mb-1'
              }`}
            />
            <p
              className={`font-bold text-slate-800 truncate ${
                compactForPrintGrid ? 'text-[6px]' : 'text-[9.5px]'
              }`}
            >
              {authorityTitle}
            </p>
          </div>
        </div>
      </div>

      {/* Card Bottom Branding & Contact Bar */}
      <div
        className={`flex items-center justify-between gap-1 bg-slate-900 font-mono text-slate-300 tabular-nums ${
          compactForPrintGrid
            ? 'px-2 py-1 text-[5.2px]'
            : 'px-3.5 py-1.5 text-[8.5px]'
        }`}
      >
        <span className="truncate font-semibold text-white">{GLOBAL_APP_TITLE}</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-emerald-200">
          <Phone className={compactForPrintGrid ? 'h-2 w-2' : 'h-2.5 w-2.5'} />
          <span>{GLOBAL_CONTACT_PHONE}</span>
          {!compactForPrintGrid && (
            <>
              <span aria-hidden="true">·</span>
              <Mail className="h-2.5 w-2.5" />
              <span>{GLOBAL_CONTACT_EMAIL}</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
};
