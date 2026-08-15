import type { ScaleDefinition, ScaleId } from '../../domain/types';
import { NIPS } from './nips';
import { PIPP_R } from './pippR';
import { N_PASS } from './npass';
import { COMFORTNEO } from './comfortneo';
import { EDIN } from './edin';
import { NFCS_P3 } from './nfcs';
import { WAT_1 } from './wat1';

export const SCALES: Record<ScaleId, ScaleDefinition> = {
  NIPS,
  PIPP_R,
  N_PASS,
  COMFORTneo: COMFORTNEO,
  EDIN,
  NFCS_P3,
  WAT_1,
};

/** Pain and sedation instruments. WAT-1 measures withdrawal and is handled separately. */
export const PAIN_SCALES: ScaleDefinition[] = [NIPS, PIPP_R, N_PASS, COMFORTNEO, EDIN, NFCS_P3];

export { NIPS, PIPP_R, N_PASS, COMFORTNEO, EDIN, NFCS_P3, WAT_1 };
