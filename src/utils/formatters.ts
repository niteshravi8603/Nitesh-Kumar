import { FeeMonth } from '../types/erp';

export const ACADEMIC_SESSIONS: string[] = [
  '2025-2026',
  '2026-2027',
  '2027-2028',
  '2028-2029',
];

export const CALENDAR_MONTHS: FeeMonth[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const FEE_MONTHS: FeeMonth[] = [
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'January',
  'February',
  'March',
];

export function getSessionMonthsOrder(startMonth: FeeMonth, endMonth: FeeMonth): FeeMonth[] {
  const startIdx = CALENDAR_MONTHS.indexOf(startMonth);
  const endIdx = CALENDAR_MONTHS.indexOf(endMonth);
  if (startIdx < 0 || endIdx < 0) {
    return [...FEE_MONTHS];
  }
  const result: FeeMonth[] = [];
  for (let step = 0; step < 12; step++) {
    const idx = (startIdx + step) % 12;
    const month = CALENDAR_MONTHS[idx];
    result.push(month);
    if (idx === endIdx && step > 0) {
      break;
    }
    if (startIdx === endIdx) {
      break;
    }
  }
  return result.length > 0 ? result : [...FEE_MONTHS];
}

const STANDARD_CLASS_PROGRESSION: string[] = [
  'Pre-Nursery',
  'Nursery',
  'LKG',
  'UKG',
  '1st',
  '2nd',
  '3rd',
  '4th',
  '5th',
  '6th',
  '7th',
  '8th',
  '9th',
  '10th',
  '11th',
  '12th',
  'Graduated',
];

function formatOrdinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function getSuggestedNextClass(currentClass: string): string {
  const clean = (currentClass || '').trim();
  if (!clean) return 'LKG';

  const exactIdx = STANDARD_CLASS_PROGRESSION.findIndex(
    (c) => c.toLowerCase() === clean.toLowerCase()
  );
  if (exactIdx >= 0 && exactIdx < STANDARD_CLASS_PROGRESSION.length - 1) {
    return STANDARD_CLASS_PROGRESSION[exactIdx + 1];
  }

  // Handle "Class 5" -> "Class 6" or "Grade 4" -> "Grade 5"
  const prefixMatch = clean.match(/^(class|grade|std|standard)\s*(\d+)$/i);
  if (prefixMatch) {
    const prefix = prefixMatch[1];
    const num = Number(prefixMatch[2]);
    if (Number.isFinite(num) && num < 12) {
      return `${prefix} ${num + 1}`;
    }
    return 'Graduated';
  }

  // Handle plain numeric or ordinal e.g. "5" -> "6" or "5th" -> "6th"
  const ordMatch = clean.match(/^(\d+)(st|nd|rd|th)?$/i);
  if (ordMatch) {
    const num = Number(ordMatch[1]);
    const hasSuffix = Boolean(ordMatch[2]);
    if (Number.isFinite(num) && num < 12) {
      return hasSuffix ? formatOrdinal(num + 1) : String(num + 1);
    }
    return 'Graduated';
  }

  return clean;
}

export function getSchoolAcronym(schoolName: string): string {
  const words = (schoolName || 'RB PUBLIC SCHOOL')
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean);
  if (words.length === 0) return 'RBPS';
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words
    .map((w) => (w.length <= 2 && w === w.toUpperCase() ? w : w[0]))
    .join('')
    .toUpperCase()
    .slice(0, 4);
}

export function formatINR(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(safe);
}

export function formatDateDisplay(isoDate: string): string {
  if (!isoDate) return '—';
  const parts = isoDate.split('T')[0].split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mIdx = Number(month) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      return `${day} ${months[mIdx]} ${year}`;
    }
  }
  return isoDate;
}

export function formatTimestampDisplay(isoString: string): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function getTodayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function sanitizeNumber(
  value: string | number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER
): number {
  const parsed =
    typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

export function formatAadhaarInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  const groups = digits.match(/.{1,4}/g);
  return groups ? groups.join(' ') : '';
}

export function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'ST';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function fileToCompressedDataUrl(
  file: File,
  maxDimension = 640,
  quality = 0.78
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      if (file.size > 800 * 1024) {
        reject(new Error('Document file must be an image or a PDF smaller than 800 KB.'));
        return;
      }
      const rawReader = new FileReader();
      rawReader.onload = () => {
        if (typeof rawReader.result === 'string') {
          resolve(rawReader.result);
        } else {
          reject(new Error('Could not read file.'));
        }
      };
      rawReader.onerror = () => reject(new Error('Failed to read selected file.'));
      rawReader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Invalid image file selected.'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export function computeLetterGrade(scoreOutOf100: number): string {
  if (scoreOutOf100 >= 90) return 'A+';
  if (scoreOutOf100 >= 75) return 'A';
  if (scoreOutOf100 >= 60) return 'B';
  if (scoreOutOf100 >= 45) return 'C';
  if (scoreOutOf100 >= 33) return 'D';
  return 'E';
}

export function numberToIndianWords(num: number): string {
  const n = Math.floor(Math.max(0, num));
  if (n === 0) return 'Zero Rupees Only';

  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertBelowThousand = (val: number): string => {
    let str = '';
    if (val >= 100) {
      str += `${ones[Math.floor(val / 100)]} Hundred `;
      val %= 100;
    }
    if (val >= 20) {
      str += `${tens[Math.floor(val / 10)]} `;
      val %= 10;
    }
    if (val > 0) {
      str += `${ones[val]} `;
    }
    return str.trim();
  };

  let rem = n;
  const parts: string[] = [];

  if (rem >= 10000000) {
    parts.push(`${convertBelowThousand(Math.floor(rem / 10000000))} Crore`);
    rem %= 10000000;
  }
  if (rem >= 100000) {
    parts.push(`${convertBelowThousand(Math.floor(rem / 100000))} Lakh`);
    rem %= 100000;
  }
  if (rem >= 1000) {
    parts.push(`${convertBelowThousand(Math.floor(rem / 1000))} Thousand`);
    rem %= 1000;
  }
  if (rem > 0) {
    parts.push(convertBelowThousand(rem));
  }

  return `${parts.join(' ').trim()} Rupees Only`;
}

export async function hashPassword(password: string): Promise<string> {
  const normalized = password.trim();
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(`rb-public-school-salt::${normalized}`);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 5381;
  const salted = `rb-public-school-salt::${normalized}`;
  for (let i = 0; i < salted.length; i++) {
    hash = (hash * 33) ^ salted.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}
