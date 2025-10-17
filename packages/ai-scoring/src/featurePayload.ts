import { TxFeaturePayload } from "./types";

export interface FeatureExtractionInput {
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
  data?: string;
  decodedParams?: Array<{ name: string; type: string; value: unknown }>;
  tokenTransfers?: Array<{
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
  addressMetadata?: {
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
  receiptStatus?: number;
  gasUsed?: string;
  cumulativeGasUsed?: string;
  effectiveGasPrice?: string;
  feePaid?: string;
  error?: string | null;
  revertReason?: string | null;
  confirmations?: number;
  logs?: Array<{
    address: string;
    topic0?: string;
    topic1?: string;
    topic2?: string;
    topic3?: string;
    dataPreview?: string;
  }>;
}

export function buildFeaturePayload(input: FeatureExtractionInput): TxFeaturePayload {
  const {
    chainId,
    blockNumber,
    blockTimestamp,
    txHash,
    from,
    to,
    value,
    gas,
    gasPrice,
    maxFeePerGas,
    maxPriorityFeePerGas,
    data,
    decodedParams,
    tokenTransfers,
    isContractCreation,
    contractMetadata,
    addressMetadata,
    dexRoute,
    flashLoan,
    bridgeMetadata,
    receiptStatus,
    gasUsed,
    cumulativeGasUsed,
    effectiveGasPrice,
    feePaid,
    error,
    revertReason,
    confirmations,
    logs,
  } = input;

  const normalizedTransfers = (tokenTransfers ?? []).map((transfer) => ({
    ...transfer,
    from: transfer.from.toLowerCase(),
    to: transfer.to.toLowerCase(),
    token: transfer.token.toLowerCase(),
  }));

  const rawInput = data?.length ? data.toLowerCase() : "0x";
  const functionSelector = rawInput.slice(0, 10);

  const normalizedLogs = (logs ?? []).map((log) => ({
    address: log.address.toLowerCase(),
    topic0: log.topic0?.toLowerCase(),
    topic1: log.topic1?.toLowerCase(),
    topic2: log.topic2?.toLowerCase(),
    topic3: log.topic3?.toLowerCase(),
    dataPreview: log.dataPreview,
  }));

  return {
    chainId,
    blockNumber,
    blockTimestamp,
    txHash,
    from: from.toLowerCase(),
    to: to ? to.toLowerCase() : null,
    value,
    gas,
    gasPrice,
    maxFeePerGas,
    maxPriorityFeePerGas,
    input: rawInput,
    functionSelector,
    receiptStatus,
    gasUsed,
    cumulativeGasUsed,
    effectiveGasPrice,
    feePaid,
    error,
    revertReason,
    confirmations,
    decodedParams: decodedParams ?? [],
    tokenTransfers: normalizedTransfers,
    isContractCreation,
    contractMetadata,
    addressMetadata: addressMetadata ?? {},
    dexRoute,
    flashLoan,
    bridgeMetadata,
    logs: normalizedLogs,
  };
}
