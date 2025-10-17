import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTxAiRiskScores1759100000000 implements MigrationInterface {
  name = "CreateTxAiRiskScores1759100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tx_ai_risk_scores" (
        "tx_hash" bytea NOT NULL,
        "request_hash" character varying NOT NULL,
        "feature_version" character varying NOT NULL,
        "normalizer_version" character varying NOT NULL,
        "model_name" character varying NOT NULL,
        "model_version" character varying NOT NULL,
        "verdict" character varying NOT NULL,
        "confidence_overall" double precision,
        "descriptors" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "raw_response" jsonb NOT NULL,
        "status" character varying NOT NULL,
        "error" text,
        "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "received_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_tx_ai_risk_scores" PRIMARY KEY ("tx_hash")
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_tx_ai_risk_scores_request_hash" ON "tx_ai_risk_scores" ("request_hash");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_tx_ai_risk_scores_request_hash"`);
    await queryRunner.query(`DROP TABLE "tx_ai_risk_scores"`);
  }
}
