export type Priority = "high" | "medium" | "low";

export type PriorityInputs = {
  urgency: number;        // 0-1
  impactInr: number;      // expected INR delta
  confidence: number;     // 0-1
};

export function scorePriority({ urgency, impactInr, confidence }: PriorityInputs): Priority {
  const cappedUrgency = clamp01(urgency);
  const cappedConf = clamp01(confidence);
  const normalizedImpact = impactInr >= 5000 ? 1 : impactInr <= 0 ? 0 : impactInr / 5000;
  const score = 0.5 * cappedUrgency + 0.3 * normalizedImpact + 0.2 * cappedConf;

  if (score >= 0.66) return "high";
  if (score >= 0.35) return "medium";
  return "low";
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}
