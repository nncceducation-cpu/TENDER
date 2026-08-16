import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Shown on the public deployment only.
 *
 * Anyone arriving at a URL that calculates opioid doses should learn what this
 * is before they learn what it does. The banner is dismissible because a
 * reviewer clicking through fifteen screens should not have to read it fifteen
 * times, and it does not remember the dismissal, because a fresh visit is a
 * fresh person.
 */
export const PreReleaseBanner = () => {
  const [open, setOpen] = useState(true);
  if (!__TENDER_PUBLIC_DEMO__) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg bg-red-900 text-red-50 text-xs py-1.5 px-4 text-center hover:bg-red-800 transition mb-5"
      >
        Pre-release demonstration. Not for patient care. Click to read why.
      </button>
    );
  }

  return (
    <div className="bg-red-900 text-red-50 rounded-lg mb-5">
      <div className="px-4 py-3 flex gap-3 text-sm">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="space-y-2 flex-1">
          <p className="font-bold uppercase tracking-wide text-xs">
            Pre-release demonstration. Not for patient care.
          </p>
          <p className="leading-relaxed text-red-100">
            This tool has not been validated at any site, has not been reviewed by a
            research ethics board or a regulator, and contains dosing calculations whose
            underlying protocol questions are still open. Two of those open questions
            concern opioid dosing and are listed on the Protocol screen. Do not use any
            number produced here to treat an infant.
          </p>
          <p className="leading-relaxed text-red-100">
            The facial coding layer is very likely a device function under FDA clinical
            decision support criteria and should be treated as investigational. Camera and
            audio processing run entirely in your browser, and nothing is transmitted or
            stored.
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="shrink-0 h-fit p-1 rounded hover:bg-red-800 transition"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
