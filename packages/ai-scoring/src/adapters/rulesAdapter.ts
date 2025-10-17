import { RiskModelAdapter, ScoreRequest, Verdict } from "../types";

export class RulesAdapter implements RiskModelAdapter {
  public readonly name = "rules-offline";

  public async score(request: ScoreRequest) {
    return {
      request_hash: request.requestHash,
      model: {
        name: this.name,
        version: "poc-v1",
      },
      results: request.transactions.map((tx) => {
        const verdict = this.deriveVerdict(tx.payload);
        const descriptors = this.buildDescriptors(tx.payload);

        return {
          tx_hash: tx.txHash,
          verdict,
          confidence: {
            overall: verdict === "normal" ? 0.2 : 0.6,
          },
          descriptors,
          error: null,
        };
      }),
    };
  }

  private deriveVerdict(payload: ScoreRequest["transactions"][number]["payload"]): Verdict {
    if (payload.flashLoan?.present && (payload.dexRoute?.priceImpactBps ?? 0) > 1500) {
      return "security_concern";
    }
    if ((payload.dexRoute?.priceImpactBps ?? 0) > 800) {
      return "suspicious";
    }
    return "normal";
  }

  private buildDescriptors(payload: ScoreRequest["transactions"][number]["payload"]) {
    const descriptors = [];
    if (payload.dexRoute?.priceImpactBps) {
      descriptors.push({
        id: "dex.high_price_impact",
        severity: Math.min(1, Math.max(0, payload.dexRoute.priceImpactBps / 2000)),
        confidence: 0.5,
        why: `Price impact ${(payload.dexRoute.priceImpactBps / 100).toFixed(2)}%`,
      });
    }

    if (payload.flashLoan?.present) {
      descriptors.push({
        id: "flash.loan_detected",
        severity: 0.7,
        confidence: 0.6,
        why: "Flash-loan pattern observed in execution trace.",
      });
    }

    return descriptors;
  }
}
