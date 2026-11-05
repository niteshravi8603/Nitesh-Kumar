import { jsPDF } from 'jspdf';
import {
  IdCardCodeStyle,
  IdCardPrintLayout,
  SchoolProfileSettings,
  StaffMember,
  StudentRecord,
} from '../types/erp';
import { resolveStudentRollNumber } from './examEngine';
import { formatDateDisplay, getInitials, getSchoolAcronym } from './formatters';
import { getSyncDataUrlForPdf } from '../services/cloudStorage';
import {
  GLOBAL_APP_TITLE,
  GLOBAL_CONTACT_EMAIL,
  GLOBAL_CONTACT_PHONE,
} from '../components/TopBrandContactBar';

function safeSlug(text: string): string {
  return text
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
}

/**
 * Generates deterministic high-contrast bar widths (1, 2, or 3 units) for linear ID card barcodes.
 */
export function generateDeterministicBarcodeBars(payload: string): number[] {
  const clean = (payload || 'RB1001').toUpperCase();
  const bars: number[] = [2, 1, 1, 2, 1, 1];
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    bars.push(((code >> 0) % 2) + 1);
    bars.push(((code >> 1) % 2) + 1);
    bars.push(((code >> 2) % 3) + 1);
    bars.push(((code >> 4) % 2) + 1);
    bars.push(((code >> 5) % 2) + 1);
    bars.push(1);
  }
  bars.push(2, 1, 1, 1, 2, 2);
  return bars;
}

/**
 * Generates a deterministic 21x21 QR-style verification matrix with standard 7x7 finder patterns.
 */
export function generateVerificationMatrix(payload: string): boolean[][] {
  const size = 21;
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const placeFinder = (rowOffset: number, colOffset: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = rowOffset + r;
        const cc = colOffset + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        reserved[rr][cc] = true;
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const onOuterRing = r === 0 || r === 6 || c === 0 || c === 6;
        const inInnerCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[rr][cc] = inOuter && (onOuterRing || inInnerCore);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    reserved[6][i] = true;
    reserved[i][6] = true;
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  let seed = 2166136261;
  const text = payload || 'RB-PUBLIC-SCHOOL';
  for (let i = 0; i < text.length; i++) {
    seed ^= text.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reserved[r][c]) continue;
      seed ^= (r * 31 + c * 17) & 0xff;
      seed = Math.imul(seed, 16777619);
      grid[r][c] = ((seed >>> 3) & 1) === 1;
    }
  }

  return grid;
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  const effectiveSrc = getSyncDataUrlForPdf(src) || src;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = effectiveSrc;
  });
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = (text || '—').trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(last).width > maxWidth && last.length > 4) {
      last = `${last.slice(0, -4)}...`;
    }
    lines[maxLines - 1] = last;
  }
  return lines.length > 0 ? lines : ['—'];
}

/**
 * Generates and downloads a high-resolution (1080 x 1720 px, >300 DPI) PNG Student ID Card.
 */
export async function downloadStudentIdCardPng(
  student: StudentRecord,
  allStudents: StudentRecord[],
  codeStyle: IdCardCodeStyle,
  schoolProfile?: SchoolProfileSettings
): Promise<void> {
  const W = 1080;
  const H = 1720;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const schoolName = schoolProfile?.schoolName?.trim() || GLOBAL_APP_TITLE;
  const schoolAcronym = getSchoolAcronym(schoolName);
  const schoolSubtitle =
    schoolProfile?.address?.trim() ||
    schoolProfile?.tagline?.trim() ||
    'Recognized Primary & Preparatory Institution';
  const principalName = schoolProfile?.principalName?.trim() || '';
  const directorName = schoolProfile?.directorName?.trim() || '';
  const authorityDesignation = schoolProfile?.authorityDesignation?.trim() || 'Principal';
  const schoolPhone = schoolProfile?.phone?.trim() || GLOBAL_CONTACT_PHONE;

  const rollNo = resolveStudentRollNumber(student, allStudents);
  const qrPayload = `${schoolAcronym}|${student.admissionId}|${student.name}|${student.className}-${student.section}|${student.phone}`;

  // Background Card Surface
  ctx.fillStyle = '#ffffff';
  drawRoundedRectPath(ctx, 0, 0, W, H, 44);
  ctx.fill();

  // Top Institutional Header Block
  ctx.save();
  drawRoundedRectPath(ctx, 0, 0, W, 310, 44);
  ctx.rect(0, 160, W, 150);
  ctx.clip();
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, 310);
  ctx.restore();

  // Indigo Accent Bar beneath Header
  ctx.fillStyle = '#4f46e5';
  ctx.fillRect(0, 300, W, 18);

  // School Logo Emblem Box
  const loadedSchoolLogo = schoolProfile?.logoDataUrl
    ? await loadImageElement(schoolProfile.logoDataUrl)
    : null;

  if (loadedSchoolLogo) {
    ctx.fillStyle = '#ffffff';
    drawRoundedRectPath(ctx, 64, 62, 118, 118, 22);
    ctx.fill();
    ctx.save();
    drawRoundedRectPath(ctx, 70, 68, 106, 106, 18);
    ctx.clip();
    ctx.drawImage(loadedSchoolLogo, 70, 68, 106, 106);
    ctx.restore();
  } else {
    ctx.fillStyle = '#4f46e5';
    drawRoundedRectPath(ctx, 64, 62, 118, 118, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(123, 86);
    ctx.lineTo(84, 108);
    ctx.lineTo(123, 128);
    ctx.lineTo(162, 108);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(98, 120);
    ctx.lineTo(98, 144);
    ctx.lineTo(148, 144);
    ctx.lineTo(148, 120);
    ctx.stroke();

    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(schoolAcronym, 123, 168);
  }

  // School Title & Session
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 50px "Plus Jakarta Sans", sans-serif';
  const titleLines = wrapCanvasText(ctx, schoolName.toUpperCase(), W - 260, 1);
  ctx.fillText(titleLines[0], 208, 110);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 24px "DM Sans", sans-serif';
  const subLines = wrapCanvasText(
    ctx,
    schoolPhone ? `${schoolSubtitle} · Tel: ${schoolPhone}` : schoolSubtitle,
    W - 260,
    1
  );
  ctx.fillText(subLines[0], 208, 152);

  ctx.fillStyle = '#a5b4fc';
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillText(`STUDENT IDENTITY CARD  ·  SESSION ${student.academicSession}`, 208, 248);

  // Student Photo Frame + Basic Identity Row
  const photoX = 68;
  const photoY = 368;
  const photoW = 260;
  const photoH = 316;

  ctx.fillStyle = '#f8fafc';
  drawRoundedRectPath(ctx, photoX, photoY, photoW, photoH, 20);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();

  const loadedImg = await loadImageElement(student.photoDataUrl);
  if (loadedImg) {
    ctx.save();
    drawRoundedRectPath(ctx, photoX + 6, photoY + 6, photoW - 12, photoH - 12, 15);
    ctx.clip();
    const imgRatio = loadedImg.width / loadedImg.height;
    const boxRatio = (photoW - 12) / (photoH - 12);
    let drawW = photoW - 12;
    let drawH = photoH - 12;
    let dx = photoX + 6;
    let dy = photoY + 6;
    if (imgRatio > boxRatio) {
      drawW = (photoH - 12) * imgRatio;
      dx = photoX + 6 - (drawW - (photoW - 12)) / 2;
    } else {
      drawH = (photoW - 12) / imgRatio;
      dy = photoY + 6 - (drawH - (photoH - 12)) / 2;
    }
    ctx.drawImage(loadedImg, dx, dy, drawW, drawH);
    ctx.restore();
  } else {
    ctx.fillStyle = '#475569';
    ctx.font = '700 76px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(getInitials(student.name), photoX + photoW / 2, photoY + photoH / 2 + 10);
    ctx.font = '600 22px "DM Sans", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('PASSPORT PHOTO', photoX + photoW / 2, photoY + photoH / 2 + 62);
  }

  // Primary Name & Reg No beside Photo
  const rightX = 366;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.font = '600 22px "DM Sans", sans-serif';
  ctx.fillText('STUDENT NAME', rightX, 404);

  ctx.fillStyle = '#0f172a';
  ctx.font = '800 46px "Plus Jakarta Sans", sans-serif';
  const wrappedName = wrapCanvasText(ctx, student.name, W - rightX - 64, 2);
  let nameY = 456;
  wrappedName.forEach((ln) => {
    ctx.fillText(ln, rightX, nameY);
    nameY += 52;
  });

  // Reg / Admission Number & Class-Section Highlight Box
  const pillY = Math.max(nameY + 10, 536);
  ctx.fillStyle = '#eef2ff';
  drawRoundedRectPath(ctx, rightX, pillY, W - rightX - 64, 142, 18);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#c7d2fe';
  ctx.stroke();

  ctx.fillStyle = '#4338ca';
  ctx.font = '600 21px "DM Sans", sans-serif';
  ctx.fillText('REG / ADMISSION NO.', rightX + 26, pillY + 46);
  ctx.fillText('CLASS & SECTION', rightX + 350, pillY + 46);

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 36px "JetBrains Mono", monospace';
  ctx.fillText(student.admissionId, rightX + 26, pillY + 102);
  ctx.font = '700 34px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`${student.className} - ${student.section} (${rollNo})`, rightX + 350, pillY + 102);

  // Structured Details Table
  let detailY = 748;
  const drawDetailRow = (label: string, value: string, isMono = false, maxLines = 1) => {
    ctx.fillStyle = '#64748b';
    ctx.font = '600 25px "DM Sans", sans-serif';
    ctx.fillText(label, 68, detailY);

    ctx.fillStyle = '#0f172a';
    ctx.font = isMono
      ? '700 29px "JetBrains Mono", monospace'
      : '700 29px "DM Sans", sans-serif';
    const lines = wrapCanvasText(ctx, value || '—', 640, maxLines);
    lines.forEach((line, idx) => {
      ctx.fillText(line, 366, detailY + idx * 38);
    });

    const rowAdvance = 58 + (lines.length - 1) * 38;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(68, detailY + rowAdvance - 24);
    ctx.lineTo(W - 68, detailY + rowAdvance - 24);
    ctx.stroke();

    detailY += rowAdvance + 16;
  };

  drawDetailRow("Father's Name", student.fatherName);
  drawDetailRow('Date of Birth', formatDateDisplay(student.dob), true);
  drawDetailRow('Contact Mobile', student.phone, true);
  drawDetailRow('Address', student.address, false, 2);

  // Bottom Verification Zone (Barcode / QR + Principal Signature)
  const footerTop = 1380;
  ctx.fillStyle = '#f8fafc';
  drawRoundedRectPath(ctx, 56, footerTop, W - 112, 268, 22);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (codeStyle === 'barcode') {
    const bars = generateDeterministicBarcodeBars(
      `${student.admissionId}-${student.className}${student.section}`
    );
    const totalUnits = bars.reduce((s, u) => s + u, 0);
    const barAreaW = 540;
    const unitPx = barAreaW / totalUnits;
    let bx = 92;
    const by = footerTop + 46;
    const bh = 122;

    bars.forEach((units, idx) => {
      const w = units * unitPx;
      if (idx % 2 === 0) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(bx, by, Math.max(2, w), bh);
      }
      bx += w;
    });

    ctx.fillStyle = '#475569';
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      `ID: ${student.admissionId} · ${student.className}-${student.section}${
        directorName ? ` · Dir: ${directorName}` : ''
      }`,
      92 + barAreaW / 2,
      by + bh + 38
    );
  } else if (codeStyle === 'qr') {
    const matrix = generateVerificationMatrix(qrPayload);
    const qrSize = 184;
    const cell = qrSize / matrix.length;
    const qx = 96;
    const qy = footerTop + 42;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qx - 10, qy - 10, qrSize + 20, qrSize + 20);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(qx - 10, qy - 10, qrSize + 20, qrSize + 20);

    ctx.fillStyle = '#0f172a';
    matrix.forEach((row, r) => {
      row.forEach((on, c) => {
        if (on) {
          ctx.fillRect(qx + c * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
        }
      });
    });

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 24px "DM Sans", sans-serif';
    ctx.fillText('Verified Student ID', qx + qrSize + 32, qy + 68);
    ctx.fillStyle = '#64748b';
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.fillText(student.admissionId, qx + qrSize + 32, qy + 108);
    ctx.fillText(`Ph: ${student.phone}`, qx + qrSize + 32, qy + 144);
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 26px "DM Sans", sans-serif';
    ctx.fillText(`${schoolName} Pass`, 96, footerTop + 115);
    ctx.fillStyle = '#64748b';
    ctx.font = '500 22px "DM Sans", sans-serif';
    ctx.fillText(
      directorName
        ? `Director: ${directorName}`
        : 'If found, please return to School Office.',
      96,
      footerTop + 156
    );
  }

  // Principal Signature Block on Right
  ctx.textAlign = 'center';
  if (principalName) {
    ctx.fillStyle = '#334155';
    ctx.font = '700 23px "DM Sans", sans-serif';
    ctx.fillText(principalName, 852, footerTop + 148);
  }
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(720, footerTop + 166);
  ctx.lineTo(984, footerTop + 166);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 24px "DM Sans", sans-serif';
  ctx.fillText(`${authorityDesignation} Signature`, 852, footerTop + 204);
  ctx.fillStyle = '#64748b';
  ctx.font = '500 20px "DM Sans", sans-serif';
  ctx.fillText(schoolName.slice(0, 26), 852, footerTop + 234);

  // Bottom Branding & Contact Bar on Student PNG Card
  ctx.save();
  drawRoundedRectPath(ctx, 0, H - 56, W, 56, 44);
  ctx.rect(0, H - 56, W, 28);
  ctx.clip();
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, H - 56, W, 56);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.fillText(
    `${GLOBAL_APP_TITLE} · ${GLOBAL_CONTACT_PHONE} · ${GLOBAL_CONTACT_EMAIL}`,
    W / 2,
    H - 22
  );

  // Outer Card Border
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 6;
  drawRoundedRectPath(ctx, 3, 3, W - 6, H - 6, 44);
  ctx.stroke();

  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `${safeSlug(schoolAcronym)}_ID_Card_${student.admissionId}_${safeSlug(student.name)}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Draws a single exact-scale CR80 (54mm x 86mm) Student ID Card on a jsPDF page at (x, y).
 */
function drawCr80CardVector(
  doc: jsPDF,
  student: StudentRecord,
  rollNo: string,
  x: number,
  y: number,
  codeStyle: IdCardCodeStyle,
  showTrimMarks = true,
  schoolProfile?: SchoolProfileSettings
): void {
  const w = 54;
  const h = 86;
  const schoolName = schoolProfile?.schoolName?.trim() || GLOBAL_APP_TITLE;
  const schoolAcronym = getSchoolAcronym(schoolName);
  const schoolSubtitle =
    schoolProfile?.address?.trim() ||
    schoolProfile?.tagline?.trim() ||
    'Primary & Preparatory Institution';
  const principalName = schoolProfile?.principalName?.trim() || '';
  const directorName = schoolProfile?.directorName?.trim() || '';
  const authorityDesignation = schoolProfile?.authorityDesignation?.trim() || 'Principal';

  if (showTrimMarks) {
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.15);
    const m = 2;
    doc.line(x - m, y, x - 0.5, y);
    doc.line(x, y - m, x, y - 0.5);
    doc.line(x + w + 0.5, y, x + w + m, y);
    doc.line(x + w, y - m, x + w, y - 0.5);
    doc.line(x - m, y + h, x - 0.5, y + h);
    doc.line(x, y + h + 0.5, x, y + h + m);
    doc.line(x + w + 0.5, y + h, x + w + m, y + h);
    doc.line(x + w, y + h + 0.5, x + w, y + h + m);
  }

  // Card Base
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');

  // Top Header (15.5mm tall)
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(x, y, w, 15.5, 2, 2, 'F');
  doc.rect(x, y + 8, w, 7.5, 'F');

  // Indigo Stripe
  doc.setFillColor(79, 70, 229);
  doc.rect(x, y + 15, w, 1.1, 'F');

  // School Crest Emblem (Left)
  let logoRendered = false;
  const resolvedLogoDataUrl = getSyncDataUrlForPdf(schoolProfile?.logoDataUrl);
  if (resolvedLogoDataUrl && resolvedLogoDataUrl.startsWith('data:image/')) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x + 2.8, y + 2.6, 6.6, 6.6, 1, 1, 'F');
      const fmt = resolvedLogoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(resolvedLogoDataUrl, fmt, x + 3.1, y + 2.9, 6.0, 6.0);
      logoRendered = true;
    } catch {
      logoRendered = false;
    }
  }
  if (!logoRendered) {
    doc.setFillColor(79, 70, 229);
    doc.roundedRect(x + 2.8, y + 2.6, 6.6, 6.6, 1, 1, 'F');
    doc.setFillColor(255, 255, 255);
    doc.triangle(x + 6.1, y + 3.9, x + 3.9, y + 5.1, x + 6.1, y + 6.2, 'F');
    doc.triangle(x + 6.1, y + 3.9, x + 8.3, y + 5.1, x + 6.1, y + 6.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(3.6);
    doc.setTextColor(255, 255, 255);
    doc.text(schoolAcronym, x + 6.1, y + 8.4, { align: 'center' });
  }

  // Header School Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(255, 255, 255);
  doc.text(schoolName.toUpperCase().slice(0, 25), x + 10.8, y + 5.6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.2);
  doc.setTextColor(203, 213, 225);
  doc.text(schoolSubtitle.slice(0, 38), x + 10.8, y + 8.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.6);
  doc.setTextColor(199, 210, 254);
  doc.text(`STUDENT ID CARD  ·  ${student.academicSession}`, x + w / 2, y + 13.3, {
    align: 'center',
  });

  // Photo Box (Left: 14.5mm x 18mm) + Name & Admission Box (Right)
  const px = x + 3.2;
  const py = y + 18.5;
  const pw = 14.5;
  const ph = 18;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.roundedRect(px, py, pw, ph, 1, 1, 'FD');

  let photoDrawn = false;
  const resolvedStudentPhoto = getSyncDataUrlForPdf(student.photoDataUrl);
  if (resolvedStudentPhoto && resolvedStudentPhoto.startsWith('data:image/')) {
    try {
      const fmt = resolvedStudentPhoto.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(resolvedStudentPhoto, fmt, px + 0.5, py + 0.5, pw - 1, ph - 1);
      photoDrawn = true;
    } catch {
      photoDrawn = false;
    }
  }
  if (!photoDrawn) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(getInitials(student.name), px + pw / 2, py + ph / 2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(3.6);
    doc.setTextColor(148, 163, 184);
    doc.text('PHOTO', px + pw / 2, py + ph / 2 + 3.2, { align: 'center' });
  }

  // Student Name & Reg Badge beside Photo
  const rx = x + 19.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.3);
  doc.setTextColor(100, 116, 139);
  doc.text('STUDENT NAME', rx, py + 2.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(15, 23, 42);
  const nameLines = doc.splitTextToSize(student.name || '—', 31.5).slice(0, 2);
  doc.text(nameLines, rx, py + 6.2);

  const badgeY = py + (nameLines.length > 1 ? 10.6 : 8.6);
  doc.setFillColor(238, 242, 255);
  doc.setDrawColor(199, 210, 254);
  doc.roundedRect(rx, badgeY, 31.3, 7.4, 1, 1, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(3.9);
  doc.setTextColor(67, 56, 202);
  doc.text('REG NO.', rx + 1.6, badgeY + 2.6);
  doc.text('CLASS / SEC', rx + 14.5, badgeY + 2.6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.6);
  doc.setTextColor(15, 23, 42);
  doc.text(student.admissionId, rx + 1.6, badgeY + 5.9);
  doc.text(`${student.className}-${student.section} (${rollNo})`.slice(0, 14), rx + 14.5, badgeY + 5.9);

  // Core Student Fields
  let fy = y + 40.5;
  const fieldRows: Array<[string, string, number]> = [
    ["Father's Name", student.fatherName || '—', 1],
    ['Date of Birth', formatDateDisplay(student.dob), 1],
    ['Mobile No.', student.phone || '—', 1],
    ['Address', student.address || '—', 2],
  ];

  fieldRows.forEach(([label, val, maxL]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.8);
    doc.setTextColor(100, 116, 139);
    doc.text(`${label}:`, x + 3.2, fy);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.2);
    doc.setTextColor(15, 23, 42);
    const lines = doc.splitTextToSize(val, 31.8).slice(0, maxL);
    doc.text(lines, x + 19, fy);

    const step = maxL > 1 && lines.length > 1 ? 7.6 : 5.5;
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.18);
    doc.line(x + 3.2, fy + step - 3.3, x + w - 3.2, fy + step - 3.3);
    fy += step;
  });

  // Bottom Verification Barcode / QR + Principal Signature
  const botY = y + 68.5;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(x + 2.8, botY, w - 5.6, 14.6, 1.2, 1.2, 'FD');

  if (codeStyle === 'barcode') {
    const bars = generateDeterministicBarcodeBars(
      `${student.admissionId}-${student.className}${student.section}`
    );
    const totalUnits = bars.reduce((s, u) => s + u, 0);
    const barW = 28;
    const unitMm = barW / totalUnits;
    let bx = x + 4.5;
    doc.setFillColor(15, 23, 42);
    bars.forEach((u, i) => {
      const segW = u * unitMm;
      if (i % 2 === 0) {
        doc.rect(bx, botY + 2.2, Math.max(0.18, segW), 7.2, 'F');
      }
      bx += segW;
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(3.9);
    doc.setTextColor(71, 85, 105);
    doc.text(`${student.admissionId} · ${student.className}-${student.section}`, x + 4.5 + barW / 2, botY + 12.1, {
      align: 'center',
    });
  } else if (codeStyle === 'qr') {
    const matrix = generateVerificationMatrix(
      `${schoolAcronym}|${student.admissionId}|${student.name}|${student.phone}`
    );
    const qrMm = 10.6;
    const cellMm = qrMm / matrix.length;
    const qx = x + 4.8;
    const qy = botY + 2;
    doc.setFillColor(255, 255, 255);
    doc.rect(qx - 0.5, qy - 0.5, qrMm + 1, qrMm + 1, 'F');
    doc.setFillColor(15, 23, 42);
    matrix.forEach((row, r) => {
      row.forEach((on, c) => {
        if (on) {
          doc.rect(qx + c * cellMm, qy + r * cellMm, cellMm + 0.04, cellMm + 0.04, 'F');
        }
      });
    });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.4);
    doc.setTextColor(15, 23, 42);
    doc.text(student.admissionId, qx + qrMm + 2.2, botY + 6.8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(3.8);
    doc.setTextColor(100, 116, 139);
    doc.text('Verified ID', qx + qrMm + 2.2, botY + 9.8);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.6);
    doc.setTextColor(15, 23, 42);
    doc.text('Campus Identity Card', x + 5, botY + 6.8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(3.8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      directorName ? `Dir: ${directorName.slice(0, 20)}` : `Return to ${schoolName.slice(0, 18)}`,
      x + 5,
      botY + 10
    );
  }

  // Principal Signature on Right
  if (principalName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(3.7);
    doc.setTextColor(51, 65, 85);
    doc.text(principalName.slice(0, 16), x + 42.5, botY + 7.8, { align: 'center' });
  }
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.2);
  doc.line(x + 35.5, botY + 9.2, x + 49.5, botY + 9.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.2);
  doc.setTextColor(15, 23, 42);
  doc.text(authorityDesignation, x + 42.5, botY + 12.1, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(3.1);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${GLOBAL_APP_TITLE} · ${GLOBAL_CONTACT_PHONE}`,
    x + w / 2,
    y + h - 1.0,
    { align: 'center' }
  );
}

/**
 * Downloads print-ready vector PDF of either a Single Student ID Card or a Multi-Card 3x3 A4 Sheet.
 */
export function downloadStudentIdCardsPdf(
  students: StudentRecord[],
  allStudents: StudentRecord[],
  layoutMode: IdCardPrintLayout,
  codeStyle: IdCardCodeStyle,
  schoolProfile?: SchoolProfileSettings
): void {
  if (students.length === 0) return;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const schoolName = schoolProfile?.schoolName?.trim() || GLOBAL_APP_TITLE;
  const schoolAcronym = getSchoolAcronym(schoolName);

  if (layoutMode === 'single' || students.length === 1) {
    const stu = students[0];
    const roll = resolveStudentRollNumber(stu, allStudents);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(79, 70, 229);
    doc.text(
      `${GLOBAL_APP_TITLE}  |  Phone/WhatsApp: ${GLOBAL_CONTACT_PHONE}  |  Email: ${GLOBAL_CONTACT_EMAIL}`,
      105,
      11.5,
      { align: 'center' }
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${schoolName.toUpperCase()} — OFFICIAL STUDENT ID CARD (CR80 PRINT SHEET)`, 105, 18, {
      align: 'center',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Standard CR80 Size (54mm × 86mm) with Crop Marks · ${stu.name} (${stu.admissionId})`,
      105,
      23.5,
      { align: 'center' }
    );

    drawCr80CardVector(doc, stu, roll, (210 - 54) / 2, 36, codeStyle, true, schoolProfile);

    const filename = `${safeSlug(schoolAcronym)}_ID_Card_${stu.admissionId}_${safeSlug(stu.name)}.pdf`;
    doc.save(filename);
    return;
  }

  // Multi-Card 3x3 Grid on A4 (9 CR80 cards per sheet)
  const cols = 3;
  const rows = 3;
  const perPage = cols * rows;
  const cardW = 54;
  const cardH = 86;
  const gapX = 7;
  const gapY = 6;
  const startX = (210 - (cols * cardW + (cols - 1) * gapX)) / 2;
  const startY = 15;

  students.forEach((stu, idx) => {
    const pageIndex = Math.floor(idx / perPage);
    const indexInPage = idx % perPage;
    if (indexInPage === 0 && pageIndex > 0) {
      doc.addPage('a4', 'portrait');
    }
    if (indexInPage === 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `${GLOBAL_APP_TITLE} · ${schoolName.toUpperCase()} — ID PRINT SHEET (Page ${pageIndex + 1} of ${Math.ceil(
          students.length / perPage
        )}) · ${GLOBAL_CONTACT_PHONE} · ${GLOBAL_CONTACT_EMAIL}`,
        105,
        9.5,
        { align: 'center' }
      );
    }

    const r = Math.floor(indexInPage / cols);
    const c = indexInPage % cols;
    const cx = startX + c * (cardW + gapX);
    const cy = startY + r * (cardH + gapY);
    const roll = resolveStudentRollNumber(stu, allStudents);

    drawCr80CardVector(doc, stu, roll, cx, cy, codeStyle, true, schoolProfile);
  });

  doc.save(`${safeSlug(schoolAcronym)}_Student_ID_Cards_Batch_${students.length}.pdf`);
}

/**
 * Generates and downloads a high-resolution (1080 x 1720 px, >300 DPI) PNG Staff ID Card.
 */
export async function downloadStaffIdCardPng(
  staff: StaffMember,
  codeStyle: IdCardCodeStyle,
  schoolProfile?: SchoolProfileSettings
): Promise<void> {
  const W = 1080;
  const H = 1720;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const schoolName = schoolProfile?.schoolName?.trim() || GLOBAL_APP_TITLE;
  const schoolAcronym = getSchoolAcronym(schoolName);
  const schoolSubtitle =
    schoolProfile?.address?.trim() ||
    schoolProfile?.tagline?.trim() ||
    'Recognized Primary & Preparatory Institution';
  const principalName = schoolProfile?.principalName?.trim() || '';
  const directorName = schoolProfile?.directorName?.trim() || '';
  const schoolPhone = schoolProfile?.phone?.trim() || GLOBAL_CONTACT_PHONE;
  const authorityName = directorName || principalName;
  const authorityTitle = directorName ? 'Director / Management' : 'Principal Signature';

  const qrPayload = `${schoolAcronym}|STAFF|${staff.staffId}|${staff.fullName}|${staff.designation}|${staff.phone}`;

  // Background Card Surface
  ctx.fillStyle = '#ffffff';
  drawRoundedRectPath(ctx, 0, 0, W, H, 44);
  ctx.fill();

  // Top Institutional Header Block
  ctx.save();
  drawRoundedRectPath(ctx, 0, 0, W, 310, 44);
  ctx.rect(0, 160, W, 150);
  ctx.clip();
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, 310);
  ctx.restore();

  // Emerald Accent Bar beneath Header
  ctx.fillStyle = '#059669';
  ctx.fillRect(0, 300, W, 18);

  // School Logo Emblem Box
  const loadedSchoolLogo = schoolProfile?.logoDataUrl
    ? await loadImageElement(schoolProfile.logoDataUrl)
    : null;

  if (loadedSchoolLogo) {
    ctx.fillStyle = '#ffffff';
    drawRoundedRectPath(ctx, 64, 62, 118, 118, 22);
    ctx.fill();
    ctx.save();
    drawRoundedRectPath(ctx, 70, 68, 106, 106, 18);
    ctx.clip();
    ctx.drawImage(loadedSchoolLogo, 70, 68, 106, 106);
    ctx.restore();
  } else {
    ctx.fillStyle = '#059669';
    drawRoundedRectPath(ctx, 64, 62, 118, 118, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(123, 86);
    ctx.lineTo(84, 108);
    ctx.lineTo(123, 128);
    ctx.lineTo(162, 108);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(98, 120);
    ctx.lineTo(98, 144);
    ctx.lineTo(148, 144);
    ctx.lineTo(148, 120);
    ctx.stroke();

    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(schoolAcronym, 123, 168);
  }

  // School Title & Subtitle
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 50px "Plus Jakarta Sans", sans-serif';
  const titleLines = wrapCanvasText(ctx, schoolName.toUpperCase(), W - 260, 1);
  ctx.fillText(titleLines[0], 208, 110);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 24px "DM Sans", sans-serif';
  const subLines = wrapCanvasText(
    ctx,
    schoolPhone ? `${schoolSubtitle} · Tel: ${schoolPhone}` : schoolSubtitle,
    W - 260,
    1
  );
  ctx.fillText(subLines[0], 208, 152);

  ctx.fillStyle = '#6ee7b7';
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillText(`OFFICIAL STAFF IDENTITY CARD  ·  ID ${staff.staffId}`, 208, 248);

  // Staff Photo Frame + Basic Identity Row
  const photoX = 68;
  const photoY = 368;
  const photoW = 260;
  const photoH = 316;

  ctx.fillStyle = '#f8fafc';
  drawRoundedRectPath(ctx, photoX, photoY, photoW, photoH, 20);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();

  const loadedImg = await loadImageElement(staff.photoDataUrl);
  if (loadedImg) {
    ctx.save();
    drawRoundedRectPath(ctx, photoX + 6, photoY + 6, photoW - 12, photoH - 12, 15);
    ctx.clip();
    const imgRatio = loadedImg.width / loadedImg.height;
    const boxRatio = (photoW - 12) / (photoH - 12);
    let drawW = photoW - 12;
    let drawH = photoH - 12;
    let dx = photoX + 6;
    let dy = photoY + 6;
    if (imgRatio > boxRatio) {
      drawW = (photoH - 12) * imgRatio;
      dx = photoX + 6 - (drawW - (photoW - 12)) / 2;
    } else {
      drawH = (photoW - 12) / imgRatio;
      dy = photoY + 6 - (drawH - (photoH - 12)) / 2;
    }
    ctx.drawImage(loadedImg, dx, dy, drawW, drawH);
    ctx.restore();
  } else {
    ctx.fillStyle = '#475569';
    ctx.font = '700 76px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(getInitials(staff.fullName), photoX + photoW / 2, photoY + photoH / 2 + 10);
    ctx.font = '600 22px "DM Sans", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('STAFF PHOTO', photoX + photoW / 2, photoY + photoH / 2 + 62);
  }

  // Staff Full Name, Designation & Employee ID beside Photo
  const rightX = 366;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.font = '600 21px "DM Sans", sans-serif';
  ctx.fillText('STAFF FULL NAME', rightX, 400);

  ctx.fillStyle = '#0f172a';
  ctx.font = '800 44px "Plus Jakarta Sans", sans-serif';
  const wrappedName = wrapCanvasText(ctx, staff.fullName, W - rightX - 64, 2);
  let nameY = 448;
  wrappedName.forEach((ln) => {
    ctx.fillText(ln, rightX, nameY);
    nameY += 48;
  });

  // Designation Subtitle
  ctx.fillStyle = '#047857';
  ctx.font = '700 28px "Plus Jakarta Sans", sans-serif';
  const desigLine = wrapCanvasText(ctx, staff.designation, W - rightX - 64, 1);
  ctx.fillText(desigLine[0], rightX, nameY + 4);

  // Employee ID & Joining Date Highlight Box
  const pillY = Math.max(nameY + 26, 548);
  ctx.fillStyle = '#ecfdf5';
  drawRoundedRectPath(ctx, rightX, pillY, W - rightX - 64, 134, 18);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#a7f3d0';
  ctx.stroke();

  ctx.fillStyle = '#065f46';
  ctx.font = '600 20px "DM Sans", sans-serif';
  ctx.fillText('EMPLOYEE / REG NO.', rightX + 26, pillY + 44);
  ctx.fillText('DATE OF JOINING', rightX + 350, pillY + 44);

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 34px "JetBrains Mono", monospace';
  ctx.fillText(staff.staffId, rightX + 26, pillY + 98);
  ctx.font = '700 30px "JetBrains Mono", monospace';
  ctx.fillText(formatDateDisplay(staff.joinedDate), rightX + 350, pillY + 98);

  // Structured Details Table
  let detailY = 748;
  const drawDetailRow = (label: string, value: string, isMono = false, maxLines = 1) => {
    ctx.fillStyle = '#64748b';
    ctx.font = '600 24px "DM Sans", sans-serif';
    ctx.fillText(label, 68, detailY);

    ctx.fillStyle = '#0f172a';
    ctx.font = isMono
      ? '700 28px "JetBrains Mono", monospace'
      : '700 28px "DM Sans", sans-serif';
    const lines = wrapCanvasText(ctx, value || '—', 640, maxLines);
    lines.forEach((line, idx) => {
      ctx.fillText(line, 366, detailY + idx * 36);
    });

    const rowAdvance = 54 + (lines.length - 1) * 36;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(68, detailY + rowAdvance - 22);
    ctx.lineTo(W - 68, detailY + rowAdvance - 22);
    ctx.stroke();

    detailY += rowAdvance + 14;
  };

  drawDetailRow('Dept / Classes', staff.assignedDepartment || 'General Campus');
  drawDetailRow('Father / Spouse', staff.fatherOrSpouseName || '—');
  drawDetailRow(
    'Mobile / Emerg.',
    staff.emergencyContact ? `${staff.phone} / ${staff.emergencyContact}` : staff.phone,
    true
  );
  drawDetailRow('Address', staff.address || '—', false, 2);

  // Bottom Verification Zone (Barcode / QR + Authorized Signature)
  const footerTop = 1380;
  ctx.fillStyle = '#f8fafc';
  drawRoundedRectPath(ctx, 56, footerTop, W - 112, 268, 22);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (codeStyle === 'barcode') {
    const bars = generateDeterministicBarcodeBars(`STAFF-${staff.staffId}-${staff.phone}`);
    const totalUnits = bars.reduce((s, u) => s + u, 0);
    const barAreaW = 540;
    const unitPx = barAreaW / totalUnits;
    let bx = 92;
    const by = footerTop + 46;
    const bh = 122;

    bars.forEach((units, idx) => {
      const w = units * unitPx;
      if (idx % 2 === 0) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(bx, by, Math.max(2, w), bh);
      }
      bx += w;
    });

    ctx.fillStyle = '#475569';
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      `EMP: ${staff.staffId} · ${staff.designation.slice(0, 26)}`,
      92 + barAreaW / 2,
      by + bh + 38
    );
  } else if (codeStyle === 'qr') {
    const matrix = generateVerificationMatrix(qrPayload);
    const qrSize = 184;
    const cell = qrSize / matrix.length;
    const qx = 96;
    const qy = footerTop + 42;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qx - 10, qy - 10, qrSize + 20, qrSize + 20);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(qx - 10, qy - 10, qrSize + 20, qrSize + 20);

    ctx.fillStyle = '#0f172a';
    matrix.forEach((row, r) => {
      row.forEach((on, c) => {
        if (on) {
          ctx.fillRect(qx + c * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
        }
      });
    });

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 24px "DM Sans", sans-serif';
    ctx.fillText('Verified Faculty ID', qx + qrSize + 32, qy + 68);
    ctx.fillStyle = '#64748b';
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.fillText(staff.staffId, qx + qrSize + 32, qy + 108);
    ctx.fillText(`Ph: ${staff.phone}`, qx + qrSize + 32, qy + 144);
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 26px "DM Sans", sans-serif';
    ctx.fillText('Authorized Faculty & Staff', 96, footerTop + 115);
    ctx.fillStyle = '#64748b';
    ctx.font = '500 22px "DM Sans", sans-serif';
    ctx.fillText('If found, please return to School Office.', 96, footerTop + 156);
  }

  // Authority Signature Block on Right
  ctx.textAlign = 'center';
  if (authorityName) {
    ctx.fillStyle = '#334155';
    ctx.font = '700 23px "DM Sans", sans-serif';
    ctx.fillText(authorityName, 852, footerTop + 148);
  }
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(720, footerTop + 166);
  ctx.lineTo(984, footerTop + 166);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 24px "DM Sans", sans-serif';
  ctx.fillText(authorityTitle, 852, footerTop + 204);
  ctx.fillStyle = '#64748b';
  ctx.font = '500 20px "DM Sans", sans-serif';
  ctx.fillText(schoolName.slice(0, 26), 852, footerTop + 234);

  // Bottom Branding & Contact Bar on Staff PNG Card
  ctx.save();
  drawRoundedRectPath(ctx, 0, H - 56, W, 56, 44);
  ctx.rect(0, H - 56, W, 28);
  ctx.clip();
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, H - 56, W, 56);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.fillText(
    `${GLOBAL_APP_TITLE} · ${GLOBAL_CONTACT_PHONE} · ${GLOBAL_CONTACT_EMAIL}`,
    W / 2,
    H - 22
  );

  // Outer Card Border
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 6;
  drawRoundedRectPath(ctx, 3, 3, W - 6, H - 6, 44);
  ctx.stroke();

  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `${safeSlug(schoolAcronym)}_Staff_ID_${staff.staffId}_${safeSlug(staff.fullName)}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Draws a single exact-scale CR80 (54mm x 86mm) Staff ID Card on a jsPDF page at (x, y).
 */
function drawStaffCr80CardVector(
  doc: jsPDF,
  staff: StaffMember,
  x: number,
  y: number,
  codeStyle: IdCardCodeStyle,
  showTrimMarks = true,
  schoolProfile?: SchoolProfileSettings
): void {
  const w = 54;
  const h = 86;
  const schoolName = schoolProfile?.schoolName?.trim() || GLOBAL_APP_TITLE;
  const schoolAcronym = getSchoolAcronym(schoolName);
  const schoolSubtitle =
    schoolProfile?.address?.trim() ||
    schoolProfile?.tagline?.trim() ||
    'Primary & Preparatory Institution';
  const principalName = schoolProfile?.principalName?.trim() || '';
  const directorName = schoolProfile?.directorName?.trim() || '';
  const authorityName = directorName || principalName;
  const authorityTitle = directorName ? 'Director' : 'Principal';

  if (showTrimMarks) {
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.15);
    const m = 2;
    doc.line(x - m, y, x - 0.5, y);
    doc.line(x, y - m, x, y - 0.5);
    doc.line(x + w + 0.5, y, x + w + m, y);
    doc.line(x + w, y - m, x + w, y - 0.5);
    doc.line(x - m, y + h, x - 0.5, y + h);
    doc.line(x, y + h + 0.5, x, y + h + m);
    doc.line(x + w + 0.5, y + h, x + w + m, y + h);
    doc.line(x + w, y + h + 0.5, x + w, y + h + m);
  }

  // Card Base
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');

  // Top Header (15.5mm tall)
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(x, y, w, 15.5, 2, 2, 'F');
  doc.rect(x, y + 8, w, 7.5, 'F');

  // Emerald Stripe
  doc.setFillColor(5, 150, 105);
  doc.rect(x, y + 15, w, 1.1, 'F');

  // School Crest Emblem (Left)
  let logoRendered = false;
  const resolvedStaffLogo = getSyncDataUrlForPdf(schoolProfile?.logoDataUrl);
  if (resolvedStaffLogo && resolvedStaffLogo.startsWith('data:image/')) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x + 2.8, y + 2.6, 6.6, 6.6, 1, 1, 'F');
      const fmt = resolvedStaffLogo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(resolvedStaffLogo, fmt, x + 3.1, y + 2.9, 6.0, 6.0);
      logoRendered = true;
    } catch {
      logoRendered = false;
    }
  }
  if (!logoRendered) {
    doc.setFillColor(5, 150, 105);
    doc.roundedRect(x + 2.8, y + 2.6, 6.6, 6.6, 1, 1, 'F');
    doc.setFillColor(255, 255, 255);
    doc.triangle(x + 6.1, y + 3.9, x + 3.9, y + 5.1, x + 6.1, y + 6.2, 'F');
    doc.triangle(x + 6.1, y + 3.9, x + 8.3, y + 5.1, x + 6.1, y + 6.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(3.6);
    doc.setTextColor(255, 255, 255);
    doc.text(schoolAcronym, x + 6.1, y + 8.4, { align: 'center' });
  }

  // Header School Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(255, 255, 255);
  doc.text(schoolName.toUpperCase().slice(0, 25), x + 10.8, y + 5.6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.2);
  doc.setTextColor(203, 213, 225);
  doc.text(schoolSubtitle.slice(0, 38), x + 10.8, y + 8.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.6);
  doc.setTextColor(167, 243, 208);
  doc.text(`OFFICIAL STAFF IDENTITY CARD  ·  ${staff.staffId}`, x + w / 2, y + 13.3, {
    align: 'center',
  });

  // Photo Box (Left: 14.5mm x 18.5mm) + Name, Designation & Emp Badge (Right)
  const px = x + 3.2;
  const py = y + 18.4;
  const pw = 14.5;
  const ph = 18.5;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.roundedRect(px, py, pw, ph, 1, 1, 'FD');

  let photoDrawn = false;
  const resolvedStaffPhoto = getSyncDataUrlForPdf(staff.photoDataUrl);
  if (resolvedStaffPhoto && resolvedStaffPhoto.startsWith('data:image/')) {
    try {
      const fmt = resolvedStaffPhoto.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(resolvedStaffPhoto, fmt, px + 0.5, py + 0.5, pw - 1, ph - 1);
      photoDrawn = true;
    } catch {
      photoDrawn = false;
    }
  }
  if (!photoDrawn) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(getInitials(staff.fullName), px + pw / 2, py + ph / 2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(3.6);
    doc.setTextColor(148, 163, 184);
    doc.text('PHOTO', px + pw / 2, py + ph / 2 + 3.2, { align: 'center' });
  }

  // Staff Name, Designation & Emp Badge beside Photo
  const rx = x + 19.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.1);
  doc.setTextColor(100, 116, 139);
  doc.text('STAFF FULL NAME', rx, py + 2.3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.1);
  doc.setTextColor(15, 23, 42);
  const nameLines = doc.splitTextToSize(staff.fullName || '—', 31.5).slice(0, 1);
  doc.text(nameLines, rx, py + 5.6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  doc.setTextColor(4, 120, 87);
  doc.text((staff.designation || 'Faculty').slice(0, 26), rx, py + 8.6);

  const badgeY = py + 10.2;
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(rx, badgeY, 31.3, 7.2, 1, 1, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(3.7);
  doc.setTextColor(6, 95, 70);
  doc.text('EMP / REG NO.', rx + 1.5, badgeY + 2.5);
  doc.text('JOINED ON', rx + 16.0, badgeY + 2.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.3);
  doc.setTextColor(15, 23, 42);
  doc.text(staff.staffId.slice(0, 12), rx + 1.5, badgeY + 5.7);
  doc.text(formatDateDisplay(staff.joinedDate).slice(0, 12), rx + 16.0, badgeY + 5.7);

  // Core Staff Fields
  let fy = y + 40.5;
  const mobileLine = staff.emergencyContact
    ? `${staff.phone} / ${staff.emergencyContact}`
    : staff.phone || '—';

  const fieldRows: Array<[string, string, number]> = [
    ['Dept / Classes', staff.assignedDepartment || 'General Campus', 1],
    ['Father / Spouse', staff.fatherOrSpouseName || '—', 1],
    ['Mobile / Emerg.', mobileLine, 1],
    ['Address', staff.address || '—', 2],
  ];

  fieldRows.forEach(([label, val, maxL]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.6);
    doc.setTextColor(100, 116, 139);
    doc.text(`${label}:`, x + 3.2, fy);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.0);
    doc.setTextColor(15, 23, 42);
    const lines = doc.splitTextToSize(val, 31.2).slice(0, maxL);
    doc.text(lines, x + 19.6, fy);

    const step = maxL > 1 && lines.length > 1 ? 7.6 : 5.5;
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.18);
    doc.line(x + 3.2, fy + step - 3.3, x + w - 3.2, fy + step - 3.3);
    fy += step;
  });

  // Bottom Verification Barcode / QR + Authority Signature
  const botY = y + 68.5;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(x + 2.8, botY, w - 5.6, 14.6, 1.2, 1.2, 'FD');

  if (codeStyle === 'barcode') {
    const bars = generateDeterministicBarcodeBars(`STAFF-${staff.staffId}-${staff.phone}`);
    const totalUnits = bars.reduce((s, u) => s + u, 0);
    const barW = 28;
    const unitMm = barW / totalUnits;
    let bx = x + 4.5;
    doc.setFillColor(15, 23, 42);
    bars.forEach((u, i) => {
      const segW = u * unitMm;
      if (i % 2 === 0) {
        doc.rect(bx, botY + 2.2, Math.max(0.18, segW), 7.2, 'F');
      }
      bx += segW;
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(3.8);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `${staff.staffId} · ${staff.designation.slice(0, 18)}`,
      x + 4.5 + barW / 2,
      botY + 12.1,
      { align: 'center' }
    );
  } else if (codeStyle === 'qr') {
    const matrix = generateVerificationMatrix(
      `${schoolAcronym}|STAFF|${staff.staffId}|${staff.fullName}|${staff.phone}`
    );
    const qrMm = 10.6;
    const cellMm = qrMm / matrix.length;
    const qx = x + 4.8;
    const qy = botY + 2;
    doc.setFillColor(255, 255, 255);
    doc.rect(qx - 0.5, qy - 0.5, qrMm + 1, qrMm + 1, 'F');
    doc.setFillColor(15, 23, 42);
    matrix.forEach((row, r) => {
      row.forEach((on, c) => {
        if (on) {
          doc.rect(qx + c * cellMm, qy + r * cellMm, cellMm + 0.04, cellMm + 0.04, 'F');
        }
      });
    });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.4);
    doc.setTextColor(15, 23, 42);
    doc.text(staff.staffId, qx + qrMm + 2.2, botY + 6.8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(3.8);
    doc.setTextColor(100, 116, 139);
    doc.text('Verified Staff', qx + qrMm + 2.2, botY + 9.8);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Faculty & Staff Pass', x + 5, botY + 6.8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(3.8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Return to ${schoolName.slice(0, 18)}`, x + 5, botY + 10);
  }

  // Authority Signature on Right
  if (authorityName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(3.7);
    doc.setTextColor(51, 65, 85);
    doc.text(authorityName.slice(0, 16), x + 42.5, botY + 7.8, { align: 'center' });
  }
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.2);
  doc.line(x + 35.5, botY + 9.2, x + 49.5, botY + 9.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.2);
  doc.setTextColor(15, 23, 42);
  doc.text(authorityTitle, x + 42.5, botY + 12.1, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(3.1);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${GLOBAL_APP_TITLE} · ${GLOBAL_CONTACT_PHONE}`,
    x + w / 2,
    y + h - 1.0,
    { align: 'center' }
  );
}

/**
 * Downloads print-ready vector PDF of either a Single Staff ID Card or a Multi-Card 3x3 A4 Sheet.
 */
export function downloadStaffIdCardsPdf(
  staffMembers: StaffMember[],
  layoutMode: IdCardPrintLayout,
  codeStyle: IdCardCodeStyle,
  schoolProfile?: SchoolProfileSettings
): void {
  if (staffMembers.length === 0) return;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const schoolName = schoolProfile?.schoolName?.trim() || GLOBAL_APP_TITLE;
  const schoolAcronym = getSchoolAcronym(schoolName);

  if (layoutMode === 'single' || staffMembers.length === 1) {
    const member = staffMembers[0];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(5, 150, 105);
    doc.text(
      `${GLOBAL_APP_TITLE}  |  Phone/WhatsApp: ${GLOBAL_CONTACT_PHONE}  |  Email: ${GLOBAL_CONTACT_EMAIL}`,
      105,
      11.5,
      { align: 'center' }
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${schoolName.toUpperCase()} — OFFICIAL STAFF ID CARD (CR80 PRINT SHEET)`, 105, 18, {
      align: 'center',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Standard CR80 Size (54mm × 86mm) with Crop Marks · ${member.fullName} (${member.staffId} — ${member.designation})`,
      105,
      23.5,
      { align: 'center' }
    );

    drawStaffCr80CardVector(doc, member, (210 - 54) / 2, 36, codeStyle, true, schoolProfile);

    const filename = `${safeSlug(schoolAcronym)}_Staff_ID_${member.staffId}_${safeSlug(member.fullName)}.pdf`;
    doc.save(filename);
    return;
  }

  // Multi-Card 3x3 Grid on A4 (9 CR80 cards per sheet)
  const cols = 3;
  const rows = 3;
  const perPage = cols * rows;
  const cardW = 54;
  const cardH = 86;
  const gapX = 7;
  const gapY = 6;
  const startX = (210 - (cols * cardW + (cols - 1) * gapX)) / 2;
  const startY = 15;

  staffMembers.forEach((member, idx) => {
    const pageIndex = Math.floor(idx / perPage);
    const indexInPage = idx % perPage;
    if (indexInPage === 0 && pageIndex > 0) {
      doc.addPage('a4', 'portrait');
    }
    if (indexInPage === 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `${GLOBAL_APP_TITLE} · ${schoolName.toUpperCase()} — STAFF ID PRINT SHEET (Page ${pageIndex + 1} of ${Math.ceil(
          staffMembers.length / perPage
        )}) · ${GLOBAL_CONTACT_PHONE} · ${GLOBAL_CONTACT_EMAIL}`,
        105,
        9.5,
        { align: 'center' }
      );
    }

    const r = Math.floor(indexInPage / cols);
    const c = indexInPage % cols;
    const cx = startX + c * (cardW + gapX);
    const cy = startY + r * (cardH + gapY);

    drawStaffCr80CardVector(doc, member, cx, cy, codeStyle, true, schoolProfile);
  });

  doc.save(`${safeSlug(schoolAcronym)}_Staff_ID_Cards_Batch_${staffMembers.length}.pdf`);
}
