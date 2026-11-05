import { CustomStudentFieldDef } from '../types/erp';

const CUSTOM_FIELDS_MARKER = '\n[[ERP_CUSTOM_FIELDS]]:';

export function extractCustomFieldsAndNotes(rawNotes?: string): {
  plainNotes: string;
  customValues: Record<string, string>;
} {
  if (!rawNotes) {
    return { plainNotes: '', customValues: {} };
  }
  const idx = rawNotes.indexOf(CUSTOM_FIELDS_MARKER);
  if (idx === -1) {
    return { plainNotes: rawNotes, customValues: {} };
  }
  const plainNotes = rawNotes.slice(0, idx).trim();
  const jsonPart = rawNotes.slice(idx + CUSTOM_FIELDS_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart) as Record<string, unknown>;
    const customValues: Record<string, string> = {};
    if (parsed && typeof parsed === 'object') {
      Object.entries(parsed).forEach(([k, v]) => {
        if (typeof v === 'string' && v.trim()) {
          customValues[k] = v.trim();
        }
      });
    }
    return { plainNotes, customValues };
  } catch {
    return { plainNotes, customValues: {} };
  }
}

export function combineCustomFieldsAndNotes(
  plainNotes: string,
  customValues: Record<string, string>
): string {
  const cleanNotes = plainNotes.trim();
  const nonEmptyEntries = Object.entries(customValues).filter(
    ([k, v]) => Boolean(k && typeof v === 'string' && v.trim())
  );
  if (nonEmptyEntries.length === 0) {
    return cleanNotes.slice(0, 495);
  }
  const compactObj: Record<string, string> = {};
  nonEmptyEntries.forEach(([k, v]) => {
    compactObj[k] = v.trim().slice(0, 60);
  });
  const jsonStr = JSON.stringify(compactObj);
  const maxPlainLen = Math.max(0, 490 - CUSTOM_FIELDS_MARKER.length - jsonStr.length);
  const clippedPlain = cleanNotes.slice(0, maxPlainLen);
  return `${clippedPlain}${CUSTOM_FIELDS_MARKER}${jsonStr}`.slice(0, 498);
}

export function getPopulatedCustomStudentFields(
  rawNotes: string | undefined,
  definitions: CustomStudentFieldDef[],
  filterTarget?: 'receipt' | 'admission-slip'
): Array<{ key: string; label: string; value: string }> {
  if (!definitions || definitions.length === 0) return [];
  const { customValues } = extractCustomFieldsAndNotes(rawNotes);
  return definitions
    .filter((def) => {
      if (filterTarget === 'receipt' && !def.showOnReceipt) return false;
      if (filterTarget === 'admission-slip' && !def.showOnAdmissionSlip) return false;
      return Boolean(customValues[def.key]?.trim());
    })
    .map((def) => ({
      key: def.key,
      label: def.label,
      value: customValues[def.key].trim(),
    }));
}
