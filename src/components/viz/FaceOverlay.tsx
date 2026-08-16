import { useEffect, useRef, useState } from 'react';
import { Download, Eye, EyeOff } from 'lucide-react';
import type { SingleImageAssessment } from '../../ai/faceGeometry';
import { RELAXED_REFERENCE } from '../../ai/faceGeometry';
import { Button } from '../ui';
import { INK, SERIES, STATUS } from './tokens';

/**
 * Draw the reading back onto the photograph.
 *
 * The point is not decoration. A clinician looking at a level of 4 has one
 * reasonable question, which is what the tool actually measured, and the honest
 * answer is three distances on this face. Drawing them lets the reading be
 * disagreed with: a mouth line landing on a nasogastric tube, or an eye line on a
 * half-closed lid mid-blink, is visible in a second and invisible in a table of
 * numbers.
 *
 * Everything is drawn at the image's own resolution and scaled by CSS, so the
 * exported PNG is full size rather than whatever the panel happened to be wide.
 */

/**
 * Place a label so it stays on the canvas.
 *
 * The first version anchored labels to the landmark and let them run off both
 * edges: on a 400px image the eye and brow readings were half outside the frame,
 * which is exactly what looking at the rendered output is for. The box is now
 * measured, clamped into the canvas, and nudged down if it would sit above the
 * top edge.
 */
const label = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale: number,
  align: 'left' | 'right' | 'center' = 'left',
  /** Lowest y the box may occupy, so labels stay clear of the caption block. */
  maxY?: number,
) => {
  ctx.font = `${Math.round(13 * scale)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const w = ctx.measureText(text).width;
  const padX = 6 * scale;
  const h = 18 * scale;
  const boxW = w + padX * 2;
  const margin = 4 * scale;

  let bx = align === 'right' ? x - boxW : align === 'center' ? x - boxW / 2 : x;
  bx = Math.max(margin, Math.min(bx, ctx.canvas.width - boxW - margin));
  const floor = maxY ?? ctx.canvas.height - margin;
  const by = Math.max(h + margin, Math.min(y, floor));

  ctx.fillStyle = 'rgba(11,11,11,0.72)';
  ctx.beginPath();
  ctx.roundRect(bx, by - h, boxW, h, 4 * scale);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + padX, by - h / 2);
};

const line = (
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  colour: string,
  width: number,
) => {
  // A surface ring keeps the mark legible over any photograph.
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = width + 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
};

const dot = (
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  r: number,
  colour: string,
) => {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(p.x, p.y, r + 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
};

const STATUS_FOR_LEVEL: Record<number, keyof typeof STATUS> = {
  1: 'good',
  2: 'good',
  3: 'warning',
  4: 'serious',
  5: 'critical',
};

export const FaceOverlay = ({
  imageUrl,
  assessment,
  name,
}: {
  imageUrl: string;
  assessment: SingleImageAssessment;
  name: string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setError('This browser did not provide a 2D canvas context.');
        return;
      }

      ctx.drawImage(img, 0, 0);
      if (!showOverlay) return;

      const p = assessment.measures.points;

      /**
       * Marks are scaled to the face, not to the frame.
       *
       * Frame-relative scaling was wrong in both directions. On a 3000x4000 phone
       * photo of a face occupying 800 pixels it drew labels twice the size they
       * needed to be; on a wide cot shot with a small face it drew labels large
       * enough to cover the features they pointed at. Interocular distance is the
       * ruler every measure here already uses, so it is the right basis for the
       * annotation as well.
       */
      const interocularPx = Math.hypot(
        p.rightEye.outer.x - p.leftEye.outer.x,
        p.rightEye.outer.y - p.leftEye.outer.y,
      );
      const scale = Math.max(1, Math.min(6, interocularPx / 110));

      /**
       * The caption is chrome, not annotation, so it is sized to the frame. Tying
       * it to the face put 96px type on an 820px close-up and clipped every line
       * of the safety text, which is the one thing on this image that must always
       * be readable.
       */
      const chrome = Math.max(0.8, Math.min(3, Math.min(img.naturalWidth, img.naturalHeight) / 500));
      const boxH = 74 * chrome;
      const boxW = Math.min(canvas.width - 24 * chrome, 470 * chrome);
      const bx = 12 * chrome;
      const by = canvas.height - boxH - 12 * chrome;
      /** Labels stop here so none of them lands on the caption. */
      const labelFloor = by - 8 * chrome;
      const R = RELAXED_REFERENCE;

      // Interocular distance: the ruler everything else is measured against.
      line(ctx, p.leftEye.outer, p.rightEye.outer, INK.muted, 2 * scale);
      // Centred on the ruler and dropped below it. Above the line it collided
      // with the brow label, which on a narrow face sits at almost the same
      // height; the band between the eyes and the mouth is the clear space.
      label(
        ctx,
        'interocular = 1.00',
        (p.leftEye.outer.x + p.rightEye.outer.x) / 2,
        Math.max(p.leftEye.outer.y, p.rightEye.outer.y) + 30 * scale,
        scale,
        'center',
        labelFloor,
      );

      // Eye aperture, both sides.
      const eyeTense = assessment.measures.eyeAperture <= R.eyeApertureClosed;
      const eyeColour = eyeTense ? STATUS.critical : SERIES;
      line(ctx, p.leftEye.top, p.leftEye.bottom, eyeColour, 3 * scale);
      line(ctx, p.rightEye.top, p.rightEye.bottom, eyeColour, 3 * scale);
      label(
        ctx,
        `eye aperture ${assessment.measures.eyeAperture.toFixed(3)}`,
        p.rightEye.outer.x + 10 * scale,
        p.rightEye.bottom.y + 62 * scale,
        scale,
        'left',
        labelFloor,
      );

      // Brow to eyelid, drawn dashed because it is the weak measure.
      ctx.setLineDash([6 * scale, 4 * scale]);
      line(ctx, p.leftEye.brow, p.leftEye.top, INK.secondary, 2 * scale);
      line(ctx, p.rightEye.brow, p.rightEye.top, INK.secondary, 2 * scale);
      ctx.setLineDash([]);
      label(
        ctx,
        `brow ${assessment.measures.browToEye.toFixed(3)} (weak)`,
        p.leftEye.brow.x - 8 * scale,
        p.leftEye.brow.y - 4 * scale,
        scale,
        'right',
        labelFloor,
      );

      // Mouth opening and width.
      line(ctx, p.mouth.top, p.mouth.bottom, SERIES, 3 * scale);
      line(ctx, p.mouth.left, p.mouth.right, SERIES, 2 * scale);
      label(
        ctx,
        `mouth ${assessment.measures.mouthOpening.toFixed(3)}`,
        p.mouth.right.x + 10 * scale,
        p.mouth.bottom.y + 22 * scale,
        scale,
        'left',
        labelFloor,
      );

      for (const q of [
        p.leftEye.top,
        p.leftEye.bottom,
        p.rightEye.top,
        p.rightEye.bottom,
        p.mouth.top,
        p.mouth.bottom,
        p.mouth.left,
        p.mouth.right,
      ]) {
        dot(ctx, q, 3 * scale, SERIES);
      }

      // The headline, bottom left, with the caveat it must never lose.
      const status = STATUS[STATUS_FOR_LEVEL[assessment.facialTension]];

      ctx.fillStyle = 'rgba(11,11,11,0.78)';
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 8 * chrome);
      ctx.fill();

      ctx.fillStyle = status;
      ctx.beginPath();
      ctx.roundRect(bx, by, 5 * chrome, boxH, 8 * chrome);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `bold ${Math.round(23 * chrome)}px system-ui, sans-serif`;
      ctx.fillText(
        `COMFORT facial tension ${assessment.facialTension}`,
        bx + 16 * chrome,
        by + 29 * chrome,
      );
      ctx.font = `${Math.round(13 * chrome)}px system-ui, sans-serif`;
      ctx.fillText(assessment.anchor, bx + 16 * chrome, by + 48 * chrome);
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = `${Math.round(11.5 * chrome)}px system-ui, sans-serif`;
      ctx.fillText(
        'Uncalibrated. Not for patient care. TENDER pre-release.',
        bx + 16 * chrome,
        by + 64 * chrome,
      );
    };
    img.onerror = () => setError('The image could not be drawn onto the canvas.');
    img.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl, assessment, showOverlay]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tender-overlay-${name.replace(/\.[^.]+$/, '')}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <div className="space-y-2">
      {/*
        The canvas is sized to the image's own pixels so the exported PNG is full
        resolution. Displayed, that is the wrong size: a 4000px phone photo filled
        the panel and pushed the charts below the fold. CSS caps the drawn size and
        letterboxes it, which changes nothing about what `toBlob` writes out.
      */}
      <div
        className="rounded-lg border grid place-items-center overflow-hidden"
        style={{ borderColor: INK.grid, background: INK.track }}
      >
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-[420px] w-auto h-auto"
          style={{ objectFit: 'contain' }}
        />
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setShowOverlay((v) => !v)}>
          {showOverlay ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showOverlay ? 'Hide measurements' : 'Show measurements'}
        </Button>
        <Button variant="ghost" onClick={download}>
          <Download className="w-4 h-4" /> Save annotated image
        </Button>
      </div>
      <p className="text-xs" style={{ color: INK.muted }}>
        Solid lines are the measures that can be trusted most. The dashed brow line
        is the weak one. If a line has landed on a tube, a tape edge or a closed lid,
        the reading above it is wrong and this is where you will see that.
      </p>
    </div>
  );
};
