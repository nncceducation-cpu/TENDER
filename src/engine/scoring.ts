import type {
  Assessment,
  PatientContext,
  ScaleBand,
  ScaleDefinition,
  ScaleItem,
  ScoredItem,
  VitalsSnapshot,
  AiEvidence,
} from '../domain/types';

/** Items that apply to this patient. Inapplicable items are never silently scored zero. */
export const applicableItems = (scale: ScaleDefinition, ctx: PatientContext): ScaleItem[] =>
  scale.items.filter((i) => (i.appliesWhen ? i.appliesWhen(ctx) : true));

export const bandFor = (scale: ScaleDefinition, total: number): ScaleBand | null =>
  scale.bands.find((b) => total >= b.min && (b.max === null || total <= b.max)) ?? null;

export class IncompleteAssessmentError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Assessment incomplete. Unscored items: ${missing.join(', ')}`);
    this.name = 'IncompleteAssessmentError';
    this.missing = missing;
  }
}

export interface ScoreInput {
  scale: ScaleDefinition;
  ctx: PatientContext;
  items: ScoredItem[];
  scoredBy: string;
  vitals?: VitalsSnapshot;
  aiEvidence?: AiEvidence;
  note?: string;
  now?: () => Date;
}

/**
 * Score an assessment.
 *
 * Refuses to produce a total from a partially completed scale. The original tool
 * coerced every missing or malformed value to zero with `parseInt(x) || 0`, so a
 * blank form and a genuinely comfortable infant produced the same number and the
 * same recommendation. Silence and zero are not the same clinical statement.
 */
export const scoreAssessment = (input: ScoreInput): Assessment => {
  const { scale, ctx, items, scoredBy } = input;
  const now = input.now ?? (() => new Date());

  const required = applicableItems(scale, ctx);
  const byId = new Map(items.map((i) => [i.itemId, i]));
  const missing = required.filter((i) => !byId.has(i.id)).map((i) => i.label);
  if (missing.length > 0) throw new IncompleteAssessmentError(missing);

  const extraneous = items.filter((i) => !required.some((r) => r.id === i.itemId));
  if (extraneous.length > 0) {
    throw new Error(
      `Items scored that do not apply to this patient: ${extraneous.map((e) => e.itemId).join(', ')}`,
    );
  }

  for (const item of required) {
    const scored = byId.get(item.id)!;
    if (!item.options.some((o) => o.value === scored.value)) {
      throw new Error(
        `Value ${scored.value} is not a valid option for item "${item.label}" on ${scale.name}.`,
      );
    }
  }

  const raw: Record<string, number> = {};
  for (const item of required) raw[item.id] = byId.get(item.id)!.value;

  const result = scale.transform
    ? scale.transform(raw, ctx)
    : {
        total: Object.values(raw).reduce((a, b) => a + b, 0),
        workings: [`Items summed to ${Object.values(raw).reduce((a, b) => a + b, 0)}.`],
      };

  const workings = [...result.workings, ...contextWarnings(scale, ctx)];

  return {
    id: crypto.randomUUID(),
    scaleId: scale.id,
    construct: scale.constructs[0],
    timestamp: now().toISOString(),
    items,
    total: result.total,
    band: bandFor(scale, result.total),
    workings,
    secondary: result.secondary,
    vitals: input.vitals,
    aiEvidence: input.aiEvidence,
    note: input.note,
    scoredBy,
  };
};

/**
 * States in which a low behavioural score is uninformative. These are printed
 * with the score rather than buried in documentation, because the failure mode
 * they cause, treating a suppressed infant as a comfortable one, is silent.
 */
const contextWarnings = (scale: ScaleDefinition, ctx: PatientContext): string[] => {
  const warnings: string[] = [];
  const usesBehaviour = scale.items.some((i) =>
    ['motor', 'facial', 'vocal', 'state', 'interaction'].includes(i.channel),
  );

  if (usesBehaviour && ctx.modifiers.includes('neuromuscular_blockade')) {
    warnings.push(
      'Neuromuscular blockade: behavioural items cannot express pain. This total is not a valid measure of nociception.',
    );
  }
  if (usesBehaviour && ctx.modifiers.includes('therapeutic_hypothermia')) {
    warnings.push(
      'Therapeutic hypothermia: behavioural responsiveness is suppressed during cooling. A low total does not exclude pain.',
    );
  }
  if (usesBehaviour && ctx.modifiers.includes('encephalopathy')) {
    warnings.push(
      'Encephalopathy recorded: the behavioural repertoire may be reduced independent of pain.',
    );
  }
  if (usesBehaviour && ctx.modifiers.includes('deep_sedation')) {
    warnings.push(
      'Deep sedation recorded: sedation depresses behavioural pain expression. Consider whether a sedation-sensitive instrument is the right choice.',
    );
  }
  return warnings;
};
