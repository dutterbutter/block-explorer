#!/usr/bin/env ts-node

import "dotenv/config";
import { Client, ClientConfig } from "pg";

function buildClientConfig(): ClientConfig {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  return {
    host: process.env.DATABASE_HOST ?? "localhost",
    port: Number(process.env.DATABASE_PORT ?? 5432),
    user: process.env.DATABASE_USER ?? "postgres",
    password: process.env.DATABASE_PASSWORD ?? "postgres",
    database: process.env.DATABASE_NAME ?? "block-explorer",
  };
}

function normalizeHash(raw: string): string {
  const value = raw.trim().toLowerCase();
  return value.startsWith("0x") ? value.slice(2) : value;
}

async function main() {
  const hash = process.argv[2];
  if (!hash) {
    console.error("Usage: ts-node scripts/get-ai-risk-score.ts <txHash>");
    process.exit(1);
  }

  const normalized = normalizeHash(hash);
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    console.error("Invalid transaction hash supplied.");
    process.exit(1);
  }

  const client = new Client(buildClientConfig());
  await client.connect();

  try {
    const query = `
      SELECT
        '0x' || encode(tx_hash, 'hex') AS "txHash",
        request_hash AS "requestHash",
        feature_version AS "featureVersion",
        normalizer_version AS "normalizerVersion",
        model_name AS "modelName",
        model_version AS "modelVersion",
        verdict,
        confidence_overall AS "confidenceOverall",
        descriptors,
        status,
        error,
        requested_at AS "requestedAt",
        received_at AS "receivedAt"
      FROM tx_ai_risk_scores
      WHERE tx_hash = decode($1, 'hex')
      LIMIT 1;
    `;

    const result = await client.query(query, [normalized]);
    if (result.rowCount === 0) {
      console.error("No AI risk score found for that hash.");
      process.exit(2);
    }

    const [row] = result.rows;
    console.log(JSON.stringify(row, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to fetch AI risk score:", error instanceof Error ? error.message : error);
  process.exit(1);
});
