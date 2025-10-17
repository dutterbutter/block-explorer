import crypto from "node:crypto";
import { TxFeaturePayload } from "./types";

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortObject(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a > b ? 1 : a < b ? -1 : 0))
      .map(([key, val]) => [key, sortObject(val)]);
    return Object.fromEntries(entries);
  }

  return value;
}

export function createRequestHash(featureVersion: string, txHash: string, payload: TxFeaturePayload): string {
  const stablePayload = sortObject(payload);
  const payloadString = JSON.stringify(stablePayload);
  const hash = crypto.createHash("sha256");
  hash.update(`${featureVersion}:${txHash}:${payloadString}`);
  return hash.digest("hex");
}
