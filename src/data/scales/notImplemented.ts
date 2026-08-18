/**
 * Instruments named in the teaching reference that are deliberately not scored
 * here.
 *
 * Both are real, validated and relevant. Neither ships, because shipping an
 * instrument means shipping its item definitions and anchors, and reproducing
 * those from memory rather than from the licensed table is exactly the failure
 * this codebase was built to avoid. They are listed so the gap is visible and so
 * the clinician knows a better tool exists for the situation in front of them.
 */
export interface UnimplementedScale {
  name: string;
  fullName: string;
  shape: string;
  bestFor: string;
  population: string;
  whyNotHere: string;
}

export const NOT_IMPLEMENTED: UnimplementedScale[] = [
  {
    name: 'FANS',
    fullName: 'Faceless Acute Neonatal pain Scale',
    shape: '3 items, 0 to 10, no facial component',
    bestFor: 'Acute pain when the face is obscured',
    population: 'Preterm',
    whyNotHere:
      'This is the instrument for the case TENDER currently handles by abstaining: prone positioning, CPAP prongs, tape and eye shields. It is not implemented because the item definitions and anchors would have to be reproduced accurately, and they should come from the source rather than from recollection. Supply the licensed table and it can be added.',
  },
  {
    name: 'BPSN',
    fullName: 'Bernese Pain Scale for Neonates',
    shape: 'Behavioural plus physiological items',
    bestFor: 'Acute pain including in ventilated infants',
    population: '27 to 41 weeks',
    whyNotHere:
      'Same reason. It covers the ventilated infant well, which is a population this unit sees constantly.',
  },
];
