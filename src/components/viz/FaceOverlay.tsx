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
  align: 'left' | 'right' = 'left',
) => {
  ctx.font = `${Math.round(13 * scale)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const w = ctx.measureText(text).width;
  const padX = 6 * scale;
  const h = 18 * scale;
  const boxW = w + padX * 2;
  const margin = 4 * scale;

  let bx = align === 'right' ? x - boxW : x;
  bx = Math.max(margin, Math.min(bx, ctx.canvas.width - boxW - margin));
  const by = Math.max(h + margin, Math.min(y, ctx.canvas.height - margin));

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

      // Scale marks to the image so a 4000px photo does not get hairlines.
      const scale = Math.max(1, Math.min(img.naturalWidth, img.naturalHeight) / 500);
      const p = assessment.measures.points;
      const R = RELAXED_REFERENCE;

      // Interocular distance: the ruler everything else is measured against.
      line(ctx, p.leftEye.outer, p.rightEye.outer, INK.muted, 2 * scale);
      label(
        ctx,
        'interocular = 1.00',
        (p.leftEye.outer.x + p.rightEye.outer.x) / 2,
        p.leftEye.outer.y - 10 * scale,
        scale,
        'left',
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
        p.rightEye.top.y + 26 * scale,
        scale,
        'left',
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
      const boxH = 74 * scale;
      const boxW = Math.min(canvas.width - 24 * scale, 480 * scale);
      const bx = 12 * scale;
      const by = canvas.height - boxH - 12 * scale;

      ctx.fillStyle = 'rgba(11,11,11,0.78)';
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 8 * scale);
      ctx.fill();

      ctx.fillStyle = status;
      ctx.beginPath();
      ctx.roundRect(bx, by, 5 * scale, boxH, 8 * scale);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `bold ${Math.round(24 * scale)}px system-ui, sans-serif`;
      ctx.fillText(
        `COMFORT facial tension ${assessment.facialTension}`,
        bx + 16 * scale,
        by + 30 * scale,
      );
      ctx.font = `${Math.round(14 * scale)}px system-ui, sans-serif`;
      ctx.fillText(assessment.anchor, bx + 16 * scale, by + 50 * scale);
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = `${Math.round(12 * scale)}px system-ui, sans-serif`;
      ctx.fillText(
        'Uncalibrated. Not for patient care. TENDER pre-release.',
        bx + 16 * scale,
        by + 66 * scale,
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
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg border"
        style={{ borderColor: INK.grid, background: INK.track }}
      />
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
