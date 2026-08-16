import { CircleCheck, Ruler } from 'lucide-react';
import type { StillDescription } from '../../ai/stillAnalysis';
import { Button } from '../ui';
import { FaceOverlay } from './FaceOverlay';
import { FindingChip, Gauge, ReportTile } from './Gauge';
import { INK, severityStatus, type Severity } from './tokens';

/**
 * The clinical report panel.
 *
 * Same furniture as the original app: a titled report card, two headline tiles, a
 * dial, a row of detected-feature chips. Different contents, because the original
 * tiles were an AI confidence of 95.0% and a score of 92%, and neither number was
 * measured. Nothing computed either one.
 *
 * What sits in those slots now is what the geometry actually produces. The
 * severity tile carries the COMFORT facial tension level and its published
 * anchor. The dial carries weighted tension, which is the mean of the three
 * regional tensions weighted by how far each measure can be trusted, and is the
 * continuous quantity the level is banded from. The second tile carries
 * measurement quality and the face box in pixels, because the honest answer to
 * "how confident are you" for a geometric reading is a statement about the
 * photograph, not a probability about the infant.
 */

const tensionSeverity = (level: number): Severity =>
  level >= 5 ? 'severe' : level >= 4 ? 'moderate' : level >= 3 ? 'mild' : 'none';

export const StillReport = ({
  d,
  imageUrl,
  onPropose,
}: {
  d: StillDescription;
  imageUrl?: string;
  onPropose?: (level: number) => void;
}) => {
  const a = d.assessment;

  if (!a) {
    return (
      <div className="rounded-xl border bg-white p-5" style={{ borderColor: INK.grid }}>
        <p className="text-sm font-semibold" style={{ color: INK.primary }}>
          {d.frame.name}
        </p>
        <p className="text-sm mt-1" style={{ color: INK.secondary }}>
          Landmarks were insufficient to measure this face geometrically. No level is
          offered, which is the correct output rather than a missing one.
        </p>
      </div>
    );
  }

  const sev = tensionSeverity(a.facialTension);
  const levelText = d.frame.levelStable
    ? String(a.facialTension)
    : `${Math.min(a.facialTension, d.frame.alternateLevel ?? a.facialTension)}–${Math.max(
        a.facialTension,
        d.frame.alternateLevel ?? a.facialTension,
      )}`;

  return (
    <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: INK.grid }}>
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: INK.grid }}
      >
        <CircleCheck className="w-[18px] h-[18px]" style={{ color: '#0f766e' }} />
        <p className="font-semibold text-sm flex-1 truncate" style={{ color: INK.primary }}>
          Clinical report
        </p>
        <span className="text-xs truncate max-w-[45%]" style={{ color: INK.muted }}>
          {d.frame.name}
        </span>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex gap-3 flex-wrap">
          <ReportTile
            label="COMFORT facial tension"
            value={`${levelText} of 5`}
            detail={a.anchor}
            tone={severityStatus(sev)}
          />
          <ReportTile
            label="Measurement quality"
            value={d.frame.quality.toFixed(2)}
            detail={
              d.frame.faceBoxPx === null
                ? 'Face size unknown.'
                : `Face box ${Math.round(d.frame.faceBoxPx)} px in the original image.`
            }
          />
        </div>

        {!d.frame.levelStable && (
          <p
            className="text-xs rounded-lg px-3 py-2"
            style={{ background: '#fab21914', color: INK.secondary }}
          >
            Re-measured at a different resampling scale this face read as level{' '}
            {d.frame.alternateLevel}. The reading spans two levels; treat it as a boundary
            case rather than a number.
          </p>
        )}

        <div className="flex gap-5 items-start flex-wrap">
          <Gauge
            value={a.overallTension}
            label={`${Math.round(a.overallTension * 100)}%`}
            caption="Weighted tension"
            severity={sev}
          />
          <div className="flex-1 min-w-[180px]">
            <p
              className="text-[11px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: INK.muted }}
            >
              Regions measured
            </p>
            <div className="flex flex-wrap gap-1.5">
              {a.regions.map((r) => (
                <FindingChip
                  key={r.region}
                  text={`${r.region} ${(r.tension * 100).toFixed(0)}%`}
                  present={r.tension >= 0.34}
                  detail={r.reading}
                />
              ))}
            </div>
            <p className="text-[11px] mt-2 leading-snug" style={{ color: INK.muted }}>
              A filled chip means that region measured above a third of its range. These are
              measurements of the photograph, not NFCS actions: calling an action present
              requires a settled baseline for this infant.
            </p>
          </div>
        </div>

        {imageUrl && <FaceOverlay imageUrl={imageUrl} assessment={a} name={d.frame.name} />}

        {d.frame.problems.length > 0 && (
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5"
              style={{ color: INK.muted }}
            >
              <Ruler className="w-3 h-3" /> Things that limit this reading
            </p>
            <ul className="text-xs list-disc list-inside space-y-0.5" style={{ color: '#92400e' }}>
              {d.frame.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        <ul className="text-xs list-disc list-inside space-y-0.5" style={{ color: INK.secondary }}>
          {a.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>

        {onPropose && (
          <Button variant="ghost" onClick={() => onPropose(a.facialTension)}>
            Offer level {a.facialTension} to the scoring form
          </Button>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-xs" style={{ color: INK.secondary }}>
            Raw activations behind the coding
          </summary>
          <table className="w-full text-sm mt-1">
            <tbody>
              {d.ranked.map(({ action, activation }) => (
                <tr key={action}>
                  <td className="py-0.5 capitalize w-48" style={{ color: INK.secondary }}>
                    {action.replace(/_/g, ' ')}
                  </td>
                  <td className="py-0.5">
                    <span
                      className="inline-block h-1.5 rounded align-middle"
                      style={{
                        width: `${Math.min(100, activation * 100)}%`,
                        background: '#2a78d6',
                      }}
                    />
                  </td>
                  <td
                    className="py-0.5 text-right tabular-nums w-16"
                    style={{ color: INK.muted }}
                  >
                    {activation.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </div>
  );
};
