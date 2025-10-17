export type Verdict = "normal" | "suspicious" | "security_concern";

export interface TxFeaturePayload {
  chainId: string;
  blockNumber: string;
  blockTimestamp: string;
  txHash: string;
  from: string;
  to?: string | null;
  value: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  input: string;
  functionSelector: string;
  receiptStatus?: number;
  gasUsed?: string;
  cumulativeGasUsed?: string;
  effectiveGasPrice?: string;
  feePaid?: string;
  error?: string | null;
  revertReason?: string | null;
  confirmations?: number;
  decodedParams: Array<{ name: string; type: string; value: unknown }>;
  tokenTransfers: Array<{
    standard: "erc20" | "erc721" | "erc1155" | "unknown";
    from: string;
    to: string;
    token: string;
    amount?: string;
    tokenId?: string;
    direction?: "inbound" | "outbound";
  }>;
  isContractCreation: boolean;
  contractMetadata?: {
    ageSeconds?: number;
    verified?: boolean;
    bytecodeHash?: string | null;
    implementation?: string | null;
    proxyType?: string | null;
  };
  addressMetadata: {
    from?: { firstSeenAt?: string; labels?: string[] };
    to?: { firstSeenAt?: string; labels?: string[] };
  };
  dexRoute?: {
    routeSummary?: string;
    priceImpactBps?: number;
    path?: string[];
    amountIn?: string;
    amountOut?: string;
    minAmountOut?: string;
    recipient?: string;
    swapCount?: number;
  };
  flashLoan?: { present: boolean; providers?: string[] };
  bridgeMetadata?: { bridgeId?: string; direction?: "inbound" | "outbound" };
  logs: Array<{
    address: string;
    topic0?: string;
    topic1?: string;
    topic2?: string;
    topic3?: string;
    dataPreview?: string;
  }>;
}

export interface ModelDescriptor {
  id: string;
  severity: number;
  confidence: number;
  why?: string;
}

export interface ModelResponseItem {
  tx_hash: string;
  verdict: Verdict;
  confidence: { overall: number };
  descriptors: ModelDescriptor[];
  error?: string | null;
}

export interface ModelResponseEnvelope {
  request_hash: string;
  model: {
    name: string;
    version: string;
  };
  results: ModelResponseItem[];
}

export interface NormalizedDescriptor {
  id: string;
  label: string;
  severityScore: number;
  confidence: number;
  severityBucket: "low" | "medium" | "high";
  why?: string;
}

export interface NormalizedRiskScore {
  txHash: string;
  requestHash: string;
  featureVersion: string;
  normalizerVersion: string;
  modelName: string;
  modelVersion: string;
  verdict: Verdict;
  confidenceOverall: number;
  descriptors: NormalizedDescriptor[];
  rawResponse: ModelResponseEnvelope;
  status: "ok" | "error";
  error?: string;
  requestedAt: Date;
  receivedAt: Date;
}

export interface ScoreRequest {
  featureVersion: string;
  requestHash: string;
  transactions: Array<{ txHash: string; payload: TxFeaturePayload }>;
}

export interface RiskModelAdapter {
  name: string;
  score(request: ScoreRequest): Promise<ModelResponseEnvelope>;
}
