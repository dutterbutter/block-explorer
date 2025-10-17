import { ModelDescriptor, ModelResponseEnvelope, ModelResponseItem, Verdict } from "./types";

const VERDICTS: Verdict[] = ["normal", "suspicious", "security_concern"];

function isVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && VERDICTS.includes(value as Verdict);
}

function isDescriptor(input: unknown): input is ModelDescriptor {
  if (!input || typeof input !== "object") {
    return false;
  }

  const candidate = input as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.severity === "number" &&
    typeof candidate.confidence === "number" &&
    (candidate.why === undefined || typeof candidate.why === "string")
  );
}

function isResponseItem(input: unknown): input is ModelResponseItem {
  if (!input || typeof input !== "object") {
    return false;
  }
  const candidate = input as Record<string, unknown>;
  return (
    typeof candidate.tx_hash === "string" &&
    isVerdict(candidate.verdict) &&
    candidate.confidence !== undefined &&
    typeof (candidate.confidence as Record<string, unknown>).overall === "number" &&
    Array.isArray(candidate.descriptors) &&
    candidate.descriptors.every(isDescriptor) &&
    (candidate.error === undefined || candidate.error === null || typeof candidate.error === "string")
  );
}

export function validateModelResponse(payload: unknown): ModelResponseEnvelope {
  if (!payload || typeof payload !== "object") {
    throw new Error("Model response is not an object");
  }

  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.request_hash !== "string" || !candidate.request_hash) {
    throw new Error("Model response missing request_hash");
  }

  if (!candidate.model || typeof candidate.model !== "object") {
    throw new Error("Model response missing model section");
  }

  const model = candidate.model as Record<string, unknown>;
  if (typeof model.name !== "string" || typeof model.version !== "string") {
    throw new Error("Model response missing model name/version");
  }

  if (!Array.isArray(candidate.results)) {
    throw new Error("Model response results must be array");
  }

  const results = candidate.results;
  if (!results.every(isResponseItem)) {
    throw new Error("Model response has invalid result item");
  }

  return {
    request_hash: candidate.request_hash,
    model: {
      name: model.name,
      version: model.version,
    },
    results: results as ModelResponseItem[],
  };
}
