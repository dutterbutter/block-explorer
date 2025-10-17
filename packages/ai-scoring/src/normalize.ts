import { ModelResponseEnvelope, NormalizedDescriptor, NormalizedRiskScore } from "./types";

const NORMALIZER_VERSION = "tx-risk-normalizer/poc-v1";

const DESCRIPTOR_LABELS: Record<string, string> = {
  "dex.high_price_impact": "High DEX price impact",
  "flash.loan_detected": "Flash-loan pattern detected",
  "bridge.unknown_destination": "Unknown bridge destination",
};

function severityBucket(score: number): "low" | "medium" | "high" {
  if (score < 0.34) {
    return "low";
  }
  if (score < 0.67) {
    return "medium";
  }
  return "high";
}

export function normalizeModelResponse(
  envelope: ModelResponseEnvelope,
  featureVersion: string
): NormalizedRiskScore[] {
  const now = new Date();

  return envelope.results.map((result) => {
    const descriptors: NormalizedDescriptor[] = (result.descriptors ?? []).map((desc) => {
      return {
        id: desc.id,
        label: DESCRIPTOR_LABELS[desc.id] ?? desc.id,
        severityScore: Math.max(0, Math.min(1, desc.severity ?? 0)),
        confidence: Math.max(0, Math.min(1, desc.confidence ?? 0)),
        severityBucket: severityBucket(desc.severity ?? 0),
        why: desc.why,
      };
    });

    return {
      txHash: result.tx_hash,
      requestHash: envelope.request_hash,
      featureVersion,
      normalizerVersion: NORMALIZER_VERSION,
      modelName: envelope.model.name,
      modelVersion: envelope.model.version,
      verdict: result.verdict,
      confidenceOverall: Math.max(0, Math.min(1, result.confidence?.overall ?? 0)),
      descriptors,
      rawResponse: envelope,
      status: result.error ? "error" : "ok",
      error: result.error ?? undefined,
      requestedAt: now,
      receivedAt: now,
    };
  });
}

export function getNormalizerVersion(): string {
  return NORMALIZER_VERSION;
}
