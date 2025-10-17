import { Column, Entity, PrimaryColumn } from "typeorm";
import { hexTransformer } from "../transformers/hex.transformer";

@Entity({ name: "tx_ai_risk_scores" })
export class TxAiRiskScore {
  @PrimaryColumn({ name: "tx_hash", type: "bytea", transformer: hexTransformer })
  public readonly txHash: string;

  @Column({ name: "request_hash", type: "varchar" })
  public readonly requestHash: string;

  @Column({ name: "feature_version", type: "varchar" })
  public readonly featureVersion: string;

  @Column({ name: "normalizer_version", type: "varchar" })
  public readonly normalizerVersion: string;

  @Column({ name: "model_name", type: "varchar" })
  public readonly modelName: string;

  @Column({ name: "model_version", type: "varchar" })
  public readonly modelVersion: string;

  @Column({ name: "verdict", type: "varchar" })
  public readonly verdict: string;

  @Column({ name: "confidence_overall", type: "double precision", nullable: true })
  public readonly confidenceOverall?: number;

  @Column({ name: "descriptors", type: "jsonb" })
  public readonly descriptors: unknown;

  @Column({ name: "raw_response", type: "jsonb" })
  public readonly rawResponse: unknown;

  @Column({ name: "status", type: "varchar" })
  public readonly status: string;

  @Column({ name: "error", type: "text", nullable: true })
  public readonly error?: string | null;

  @Column({ name: "requested_at", type: "timestamptz" })
  public readonly requestedAt: Date;

  @Column({ name: "received_at", type: "timestamptz", nullable: true })
  public readonly receivedAt?: Date | null;
}
