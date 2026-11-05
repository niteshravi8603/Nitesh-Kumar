import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Crop,
  ImagePlus,
  Move,
  RotateCcw,
  Upload,
  ZoomIn,
} from 'lucide-react';
import { ModalShell } from './ui/ModalShell';

interface QuickPhotoAttachmentControlProps {
  personName: string;
  recordLabel: string;
  hasExistingPhoto: boolean;
  canSavePermanently: boolean;
  compact?: boolean;
  onSavePermanent?: (croppedDataUrl: string) => Promise<void> | void;
  onAttachTemporary: (croppedDataUrl: string) => void;
}

const OUTPUT_WIDTH = 360;
const OUTPUT_HEIGHT = 450; // Standard 4:5 / Passport ratio for ID cards, Admit cards & Marksheets

export const QuickPhotoAttachmentControl: React.FC<QuickPhotoAttachmentControlProps> = ({
  personName,
  recordLabel,
  hasExistingPhoto,
  canSavePermanently,
  compact = false,
  onSavePermanent,
  onAttachTemporary,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);

  const [cropperOpen, setCropperOpen] = useState(false);
  const [sourceDataUrl, setSourceDataUrl] = useState<string>('');
  const [zoom, setZoom] = useState<number>(1);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number }>({
    x: 0,
    y: 0,
    ox: 0,
    oy: 0,
  });
  const [saving, setSaving] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceDataUrl(reader.result);
        setZoom(1.05);
        setOffsetX(0);
        setOffsetY(0);
        setCropperOpen(true);
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!cropperOpen || !sourceDataUrl) return;
    const img = new Image();
    img.onload = () => {
      loadedImageRef.current = img;
      renderCropCanvas();
    };
    img.src = sourceDataUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropperOpen, sourceDataUrl]);

  const renderCropCanvas = () => {
    const canvas = previewCanvasRef.current;
    const img = loadedImageRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

    const baseScale = Math.max(OUTPUT_WIDTH / img.width, OUTPUT_HEIGHT / img.height);
    const finalScale = baseScale * zoom;
    const drawW = img.width * finalScale;
    const drawH = img.height * finalScale;

    const drawX = (OUTPUT_WIDTH - drawW) / 2 + offsetX;
    const drawY = (OUTPUT_HEIGHT - drawH) / 2 + offsetY;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  };

  useEffect(() => {
    if (cropperOpen) {
      renderCropCanvas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, offsetX, offsetY, cropperOpen]);

  const exportCroppedDataUrl = (): string => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return sourceDataUrl;
    return canvas.toDataURL('image/jpeg', 0.88);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offsetX,
      oy: offsetY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffsetX(Math.max(-240, Math.min(240, dragStartRef.current.ox + dx)));
    setOffsetY(Math.max(-240, Math.min(240, dragStartRef.current.oy + dy)));
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  const handleSaveCloud = async () => {
    if (!onSavePermanent) return;
    setSaving(true);
    try {
      const cropped = exportCroppedDataUrl();
      onAttachTemporary(cropped);
      await onSavePermanent(cropped);
      setCropperOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAttachSessionOnly = () => {
    const cropped = exportCroppedDataUrl();
    onAttachTemporary(cropped);
    setCropperOpen(false);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {compact ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title={
            hasExistingPhoto
              ? `Change / Re-crop photo for ${personName}`
              : `Upload missing photo for ${personName}`
          }
          className={`no-print inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
            hasExistingPhoto
              ? 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:text-indigo-700'
              : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
          }`}
        >
          <Camera className="h-3.5 w-3.5 shrink-0" />
          <span>{hasExistingPhoto ? 'Change Photo' : 'Upload Photo'}</span>
        </button>
      ) : (
        <div
          className={`no-print flex flex-wrap items-center justify-between gap-2.5 rounded-lg border px-3 py-2 text-xs ${
            hasExistingPhoto
              ? 'border-slate-200 bg-slate-50/80 text-slate-700'
              : 'border-amber-300 bg-amber-50/90 text-amber-950'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <ImagePlus
              className={`h-4 w-4 shrink-0 ${
                hasExistingPhoto ? 'text-indigo-600' : 'text-amber-700'
              }`}
            />
            <span className="truncate font-medium">
              {hasExistingPhoto
                ? `Photo ready for ${personName}`
                : `No photo uploaded for ${personName} — attach now so printed cards aren't blank`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              hasExistingPhoto
                ? 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                : 'bg-amber-600 text-white hover:bg-amber-700'
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            <span>{hasExistingPhoto ? 'Upload / Change Photo' : 'Upload & Crop Photo'}</span>
          </button>
        </div>
      )}

      <ModalShell
        open={cropperOpen}
        onClose={() => !saving && setCropperOpen(false)}
        title={`Crop & Attach Passport Photo — ${personName}`}
        subtitle={`${recordLabel} · Drag photo to center face and adjust zoom for crisp CR80 & A4 printing.`}
        maxWidthClass="max-w-lg"
      >
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-100/80 p-4">
            <div className="relative overflow-hidden rounded-lg border-2 border-slate-900 bg-white shadow-md">
              <canvas
                ref={previewCanvasRef}
                width={OUTPUT_WIDTH}
                height={OUTPUT_HEIGHT}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="h-[250px] w-[200px] cursor-move touch-none block"
              />
              <div className="pointer-events-none absolute inset-0 border border-dashed border-white/60" />
            </div>
            <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
              <Move className="h-3.5 w-3.5 text-indigo-600" />
              <span>Drag inside frame to align portrait</span>
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <ZoomIn className="h-3.5 w-3.5 text-indigo-600" />
                <span>Zoom ({Math.round(zoom * 100)}%)</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setZoom(1.05);
                  setOffsetX(0);
                  setOffsetY(0);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset Framing</span>
              </button>
            </div>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Crop className="h-3.5 w-3.5" />
              <span>Pick Different File</span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAttachSessionOnly}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 whitespace-nowrap"
              >
                <span>Attach for Print Only</span>
              </button>

              {canSavePermanently && onSavePermanent && (
                <button
                  type="button"
                  onClick={() => void handleSaveCloud()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{saving ? 'Saving to Cloud...' : 'Save Permanently to Record'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </ModalShell>
    </>
  );
};
