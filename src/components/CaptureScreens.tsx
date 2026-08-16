import { useStore } from '../state/store';
import { Callout } from './ui';
import { FacialCapture } from './FacialCapture';
import { ClipAnalysis } from './ClipAnalysis';
import { StillAnalysis } from './StillAnalysis';
import { VisionAssist } from './VisionAssist';

/**
 * The original app split capture into Static Analysis and Live & Video, and that
 * division is better than the one TENDER had. A photograph and a bedside video
 * are different tasks done at different moments, and stacking every capture route
 * inside the scoring form meant scrolling past four panels to reach the item you
 * wanted to score.
 *
 * Anything either screen proposes lands in the session rather than being wired
 * directly into a form field, so the scoring screen can pick it up whenever the
 * clinician gets there.
 */

const ProposalNote = () => {
  const proposed = useStore((s) => s.proposedFacialTension);
  const setScreen = useStore((s) => s.setScreen);
  if (proposed === null) return null;
  return (
    <Callout tone="info" title={`Level ${proposed} is waiting on the scoring form`}>
      Nothing has been scored. Open{' '}
      <button className="underline font-medium" onClick={() => setScreen('assess')}>
        Score an instrument
      </button>{' '}
      and it will be offered for the COMFORT facial tension item, marked as model-derived
      until you accept or change it.
    </Callout>
  );
};

export const StaticAnalysisScreen = () => (
  <div className="space-y-5">
    <ProposalNote />
    <StillAnalysis />
    <VisionAssist />
  </div>
);

export const LiveVideoScreen = () => (
  <div className="space-y-5">
    <ProposalNote />
    <FacialCapture />
    <ClipAnalysis />
  </div>
);
