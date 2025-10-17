import { Injectable } from "@nestjs/common";
import { NormalizedRiskScore } from "ai-scoring";
import { TxAiRiskScore } from "../entities";
import { UnitOfWork } from "../unitOfWork";
import { BaseRepository } from "./base.repository";

@Injectable()
export class TxAiRiskScoreRepository extends BaseRepository<TxAiRiskScore> {
  public constructor(unitOfWork: UnitOfWork) {
    super(TxAiRiskScore, unitOfWork);
  }

  public async upsertScore(score: NormalizedRiskScore): Promise<void> {
    await this.upsert(
      {
        txHash: score.txHash,
        requestHash: score.requestHash,
        featureVersion: score.featureVersion,
        normalizerVersion: score.normalizerVersion,
        modelName: score.modelName,
        modelVersion: score.modelVersion,
        verdict: score.verdict,
        confidenceOverall: score.confidenceOverall,
        descriptors: score.descriptors,
        rawResponse: score.rawResponse,
        status: score.status,
        error: score.error ?? null,
        requestedAt: score.requestedAt,
        receivedAt: score.receivedAt,
      },
      false,
      ["txHash"]
    );
  }
}
