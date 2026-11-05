import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

interface CustomFieldDraft {
  key: string;
  label: string;
  placeholder: string;
  showOnReceipt: boolean;
  showOnAdmissionSlip: boolean;
}

interface AiCustomizationPayload {
  accentTheme?: string;
  densityMode?: string;
  feeReceiptShowQr?: boolean;
  feeReceiptStyle?: string;
  feeReceiptFooterNote?: string;
  feeReceiptShowLogoWatermark?: boolean;
  marksheetLayout?: string;
  marksheetShowQr?: boolean;
  marksheetShowRankBadge?: boolean;
  admitCardShowQr?: boolean;
  dashboardBannerTitle?: string;
  customStudentFields?: CustomFieldDraft[];
}

function getGenAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function applyDeterministicRuleFallback(
  promptText: string,
  currentConfig: AiCustomizationPayload
): { assistantSummary: string; configPatch: AiCustomizationPayload } {
  const lower = promptText.toLowerCase();
  const next: AiCustomizationPayload = { ...currentConfig };
  const changes: string[] = [];

  if (lower.includes('qr') && (lower.includes('receipt') || lower.includes('fee'))) {
    next.feeReceiptShowQr = !lower.includes('remove') && !lower.includes('hide');
    changes.push(
      next.feeReceiptShowQr
        ? 'Enabled scannable verification QR Code on Fee Payment Receipts'
        : 'Hidden QR Code on Fee Payment Receipts'
    );
  }
  if (lower.includes('qr') && lower.includes('admit')) {
    next.admitCardShowQr = !lower.includes('remove') && !lower.includes('hide');
    changes.push('Updated QR verification code on Examination Admit Cards');
  }
  if (lower.includes('marksheet') || lower.includes('report card')) {
    if (lower.includes('cbse')) {
      next.marksheetLayout = 'cbse-detailed';
      next.marksheetShowQr = true;
      next.marksheetShowRankBadge = true;
      changes.push('Switched Marksheets to CBSE Detailed Scholastic Layout with QR & Grade Badge');
    } else if (lower.includes('standard') || lower.includes('classic')) {
      next.marksheetLayout = 'standard';
      changes.push('Switched Marksheets to Standard Official Layout');
    } else {
      next.marksheetLayout = 'executive-crest';
      next.marksheetShowQr = true;
      next.marksheetShowRankBadge = true;
      changes.push('Redesigned Marksheets to Executive Crest Layout with QR & Merit Highlight');
    }
  }
  if (lower.includes('emerald') || lower.includes('green')) {
    next.accentTheme = 'emerald';
    changes.push('Applied Emerald Campus UI & Stationery Theme');
  } else if (lower.includes('royal') || lower.includes('blue')) {
    next.accentTheme = 'royal-blue';
    changes.push('Applied Royal Blue Institutional UI & Stationery Theme');
  } else if (lower.includes('crimson') || lower.includes('red') || lower.includes('maroon')) {
    next.accentTheme = 'crimson';
    changes.push('Applied Crimson Heritage UI & Stationery Theme');
  } else if (lower.includes('amber') || lower.includes('gold')) {
    next.accentTheme = 'amber';
    changes.push('Applied Warm Amber Gold UI & Stationery Theme');
  } else if (lower.includes('slate') || lower.includes('dark') || lower.includes('minimal')) {
    next.accentTheme = 'slate';
    changes.push('Applied Executive Slate Monochrome Theme');
  } else if (lower.includes('indigo') || lower.includes('default theme')) {
    next.accentTheme = 'indigo';
    changes.push('Restored Classic Indigo ERP Theme');
  }

  if (lower.includes('compact') && lower.includes('receipt')) {
    next.feeReceiptStyle = 'compact-slip';
    changes.push('Switched Fee Receipt template to Compact Office Slip layout');
  } else if (lower.includes('modern') && lower.includes('receipt')) {
    next.feeReceiptStyle = 'modern-boxed';
    changes.push('Switched Fee Receipt template to Modern Boxed Ledger layout');
  }

  if (lower.includes('watermark')) {
    next.feeReceiptShowLogoWatermark = !lower.includes('remove') && !lower.includes('hide');
    changes.push('Updated School Crest Watermark on printable Fee Receipts');
  }

  if (lower.includes('non-refundable') || lower.includes('footer') || lower.includes('note')) {
    next.feeReceiptFooterNote =
      'Fees once paid are non-refundable and non-transferable. Subject to school management rules.';
    changes.push('Added official Fee Receipt footer policy note');
  }

  const existingFields = Array.isArray(currentConfig.customStudentFields)
    ? [...currentConfig.customStudentFields]
    : [];

  if (lower.includes('blood')) {
    if (!existingFields.some((f) => f.key === 'blood_group')) {
      existingFields.push({
        key: 'blood_group',
        label: 'Blood Group',
        placeholder: 'e.g., O+, B+, A+',
        showOnReceipt: false,
        showOnAdmissionSlip: true,
      });
      changes.push('Added "Blood Group" custom field to Admission Form & Confirmation Slip');
    }
  }
  if (lower.includes('house')) {
    if (!existingFields.some((f) => f.key === 'student_house')) {
      existingFields.push({
        key: 'student_house',
        label: 'School House',
        placeholder: 'e.g., Tagore / Ashoka / Raman',
        showOnReceipt: true,
        showOnAdmissionSlip: true,
      });
      changes.push('Added "School House" custom field to Admissions & Fee Receipts');
    }
  }
  if (lower.includes('apaar') || lower.includes('pen') || lower.includes('samagra')) {
    if (!existingFields.some((f) => f.key === 'apaar_pen_id')) {
      existingFields.push({
        key: 'apaar_pen_id',
        label: 'APAAR / PEN ID',
        placeholder: '12-digit National Student ID',
        showOnReceipt: true,
        showOnAdmissionSlip: true,
      });
      changes.push('Added "APAAR / PEN ID" custom field to Admissions & Stationery');
    }
  }
  next.customStudentFields = existingFields.slice(0, 12);

  if (changes.length === 0) {
    next.feeReceiptShowQr = true;
    next.feeReceiptStyle = 'modern-boxed';
    changes.push('Enhanced stationery layout and enabled QR verification');
  }

  return {
    assistantSummary: changes.join(' · '),
    configPatch: next,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post('/api/ai/customize', async (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const currentConfig: AiCustomizationPayload =
      req.body?.currentConfig && typeof req.body.currentConfig === 'object'
        ? req.body.currentConfig
        : {};
    const schoolName =
      typeof req.body?.schoolName === 'string' ? req.body.schoolName.trim() : 'School ERP';

    if (!prompt) {
      res.status(400).json({ error: 'Please enter a customization instruction.' });
      return;
    }

    const ai = getGenAiClient();
    if (!ai) {
      const fallback = applyDeterministicRuleFallback(prompt, currentConfig);
      res.json({
        ok: true,
        engine: 'built-in-modifier',
        assistantSummary: fallback.assistantSummary,
        configPatch: fallback.configPatch,
      });
      return;
    }

    try {
      const systemInstruction = [
        `You are the In-App ERP Layout & Feature Customization Engine for "${schoolName}".`,
        'Given the Main Admin user request and the current JSON customization config, output the COMPLETE updated customization state that fulfills their request while preserving unchanged settings from currentConfig.',
        'Supported capabilities:',
        '- accentTheme: one of "indigo", "emerald", "royal-blue", "crimson", "amber", "slate".',
        '- densityMode: "comfortable" or "compact".',
        '- feeReceiptShowQr: boolean (adds a verification QR code to Fee Payment Receipts).',
        '- feeReceiptStyle: one of "classic", "modern-boxed", "compact-slip".',
        '- feeReceiptFooterNote: string up to 350 chars (custom terms/footer note printed on Fee Receipts).',
        '- feeReceiptShowLogoWatermark: boolean (shows subtle school emblem watermark on Fee Receipts).',
        '- marksheetLayout: one of "standard", "executive-crest", "cbse-detailed".',
        '- marksheetShowQr: boolean (adds verification QR code to Marksheets).',
        '- marksheetShowRankBadge: boolean (displays Distinction/Division/Merit badge on Marksheets).',
        '- admitCardShowQr: boolean (adds verification QR code to Examination Admit Cards).',
        '- dashboardBannerTitle: string up to 140 chars (custom welcome banner headline on Dashboard, empty string uses default school name).',
        '- customStudentFields: array (max 10) of custom fields added to the Student Admission form, each with { key (snake_case alphanumeric), label, placeholder, showOnReceipt, showOnAdmissionSlip }.',
        'Keep assistantSummary concise (1-2 sentences) describing the exact live modifications applied.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Current Config JSON:\n${JSON.stringify(currentConfig)}\n\nMain Admin Request:\n${prompt}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              assistantSummary: {
                type: Type.STRING,
                description: 'Concise 1-2 sentence summary of the changes applied.',
              },
              configPatch: {
                type: Type.OBJECT,
                properties: {
                  accentTheme: {
                    type: Type.STRING,
                    description: 'One of indigo, emerald, royal-blue, crimson, amber, slate.',
                  },
                  densityMode: {
                    type: Type.STRING,
                    description: 'comfortable or compact.',
                  },
                  feeReceiptShowQr: {
                    type: Type.BOOLEAN,
                  },
                  feeReceiptStyle: {
                    type: Type.STRING,
                    description: 'classic, modern-boxed, or compact-slip.',
                  },
                  feeReceiptFooterNote: {
                    type: Type.STRING,
                  },
                  feeReceiptShowLogoWatermark: {
                    type: Type.BOOLEAN,
                  },
                  marksheetLayout: {
                    type: Type.STRING,
                    description: 'standard, executive-crest, or cbse-detailed.',
                  },
                  marksheetShowQr: {
                    type: Type.BOOLEAN,
                  },
                  marksheetShowRankBadge: {
                    type: Type.BOOLEAN,
                  },
                  admitCardShowQr: {
                    type: Type.BOOLEAN,
                  },
                  dashboardBannerTitle: {
                    type: Type.STRING,
                  },
                  customStudentFields: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        key: { type: Type.STRING },
                        label: { type: Type.STRING },
                        placeholder: { type: Type.STRING },
                        showOnReceipt: { type: Type.BOOLEAN },
                        showOnAdmissionSlip: { type: Type.BOOLEAN },
                      },
                      required: [
                        'key',
                        'label',
                        'placeholder',
                        'showOnReceipt',
                        'showOnAdmissionSlip',
                      ],
                    },
                  },
                },
                required: [
                  'accentTheme',
                  'densityMode',
                  'feeReceiptShowQr',
                  'feeReceiptStyle',
                  'feeReceiptFooterNote',
                  'feeReceiptShowLogoWatermark',
                  'marksheetLayout',
                  'marksheetShowQr',
                  'marksheetShowRankBadge',
                  'admitCardShowQr',
                  'dashboardBannerTitle',
                  'customStudentFields',
                ],
              },
            },
            required: ['assistantSummary', 'configPatch'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as {
        assistantSummary?: string;
        configPatch?: AiCustomizationPayload;
      };

      res.json({
        ok: true,
        engine: 'gemini-3.8-flash',
        assistantSummary:
          parsed.assistantSummary || 'Applied your requested ERP layout & stationery changes.',
        configPatch: parsed.configPatch || currentConfig,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('AI Customize Endpoint Error:', errMsg);
      if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('PERMISSION_DENIED')) {
        res.status(403).json({
          ok: false,
          error:
            'Gemini API authentication failed. Please check your API key in the Settings > Secrets panel.',
        });
        return;
      }
      if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429')) {
        res.status(429).json({
          ok: false,
          error:
            'Gemini API rate limit reached. You can retry shortly or select a billing-enabled key in Settings > Secrets.',
        });
        return;
      }
      res.status(500).json({
        ok: false,
        error: `Could not process customization request: ${errMsg}`,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`School ERP SaaS Full-Stack Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
