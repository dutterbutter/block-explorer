import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interface } from "ethers";
import { utils } from "zksync-ethers";
import { BlockInfo, TransactionData } from "../dataFetcher/types";
import { unixTimeToDate } from "../utils/date";
import {
  buildFeaturePayload,
  createRequestHash,
  normalizeModelResponse,
  OpenAiAdapter,
  OpenAiAdapterOptions,
  RiskModelAdapter,
  RulesAdapter,
} from "ai-scoring";
import { TokenRepository, TxAiRiskScoreRepository } from "../repositories";
import { TokenType } from "../entities";

interface AiScoringConfig {
  enabled: boolean;
  featureVersion: string;
  adapterMode: "auto" | "external" | "offline";
  model: {
    baseUrl: string;
    name: string;
    apiKey?: string;
    organization?: string;
  };
}

interface DexSwapMetadata {
  kind: "dexSwap";
  path: string[];
  recipient?: string;
  amountIn?: string;
  minAmountOut?: string;
  functionName: string;
}

interface DecodedCallResult {
  selector: string;
  name: string;
  signature: string;
  params: Array<{ name: string; type: string; value: unknown }>;
  metadata?: DexSwapMetadata;
}

interface TokenDescriptor {
  address: string;
  symbol?: string;
  decimals: number;
}

type MetadataBuilder = (decoded: any, tx: TransactionData["transaction"]) => DexSwapMetadata;

const MAX_CAPTURED_LOGS = 12;

const FLASH_LOAN_EVENT_TOPICS = new Set<string>([
  "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9", // Aave V2 FlashLoan
  "0x668357d96ad1aefac431bd09379a808ce82d4de6fd57d06f2dbce9df0b20b002", // Aave V3 FlashLoan
  "0x3bf4f32020bfe69d137e446fdcb4172018122468b28043650fd752672eb65e29", // Balancer FlashLoan
  "0x3659d15bd4bb92ab352a8d35bc3119ec6e7e0ab48e4d46201c8a28e02b6a8a86", // DyDx style FlashLoan
  "0x93ca6fb053a3a5322256122f2ddca24108629fd4895725364e3c65fbec910a97", // Generic FlashLoan variant
  "0x0d7d75e01ab95780d3cd1c8ec0dd6c2ce19e3a20427eec8bf53283b6fb8e95f0", // Simple flash loan
]);

const KNOWN_FUNCTIONS = (() => {
  const configurations: Array<{
    signature: string;
    name: string;
    metadata: MetadataBuilder;
  }> = [
    {
      signature:
        "function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)",
      name: "swapExactTokensForTokens",
      metadata: (decoded: any, _tx: TransactionData["transaction"]): DexSwapMetadata => ({
        kind: "dexSwap",
        path: (decoded.path ?? decoded[2])?.map((address: string) => address.toLowerCase()) ?? [],
        recipient: decoded.to?.toLowerCase?.() ?? decoded[3]?.toLowerCase?.(),
        amountIn: decoded.amountIn?.toString?.() ?? decoded[0]?.toString?.(),
        minAmountOut: decoded.amountOutMin?.toString?.() ?? decoded[1]?.toString?.(),
        functionName: "swapExactTokensForTokens",
      }),
    },
    {
      signature:
        "function swapExactTokensForETH(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)",
      name: "swapExactTokensForETH",
      metadata: (decoded: any, _tx: TransactionData["transaction"]): DexSwapMetadata => ({
        kind: "dexSwap",
        path: (decoded.path ?? decoded[2])?.map((address: string) => address.toLowerCase()) ?? [],
        recipient: decoded.to?.toLowerCase?.() ?? decoded[3]?.toLowerCase?.(),
        amountIn: decoded.amountIn?.toString?.() ?? decoded[0]?.toString?.(),
        minAmountOut: decoded.amountOutMin?.toString?.() ?? decoded[1]?.toString?.(),
        functionName: "swapExactTokensForETH",
      }),
    },
    {
      signature: "function swapExactETHForTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline)",
      name: "swapExactETHForTokens",
      metadata: (decoded: any, tx: TransactionData["transaction"]): DexSwapMetadata => ({
        kind: "dexSwap",
        path: (decoded.path ?? decoded[1])?.map((address: string) => address.toLowerCase()) ?? [],
        recipient: decoded.to?.toLowerCase?.() ?? decoded[2]?.toLowerCase?.(),
        amountIn: tx.value?.toString?.() ?? undefined,
        minAmountOut: decoded.amountOutMin?.toString?.() ?? decoded[0]?.toString?.(),
        functionName: "swapExactETHForTokens",
      }),
    },
    {
      signature:
        "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)",
      name: "swapExactTokensForTokensSupportingFeeOnTransferTokens",
      metadata: (decoded: any, _tx: TransactionData["transaction"]): DexSwapMetadata => ({
        kind: "dexSwap",
        path: (decoded.path ?? decoded[2])?.map((address: string) => address.toLowerCase()) ?? [],
        recipient: decoded.to?.toLowerCase?.() ?? decoded[3]?.toLowerCase?.(),
        amountIn: decoded.amountIn?.toString?.() ?? decoded[0]?.toString?.(),
        minAmountOut: decoded.amountOutMin?.toString?.() ?? decoded[1]?.toString?.(),
        functionName: "swapExactTokensForTokensSupportingFeeOnTransferTokens",
      }),
    },
    {
      signature:
        "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)",
      name: "swapExactTokensForETHSupportingFeeOnTransferTokens",
      metadata: (decoded: any, _tx: TransactionData["transaction"]): DexSwapMetadata => ({
        kind: "dexSwap",
        path: (decoded.path ?? decoded[2])?.map((address: string) => address.toLowerCase()) ?? [],
        recipient: decoded.to?.toLowerCase?.() ?? decoded[3]?.toLowerCase?.(),
        amountIn: decoded.amountIn?.toString?.() ?? decoded[0]?.toString?.(),
        minAmountOut: decoded.amountOutMin?.toString?.() ?? decoded[1]?.toString?.(),
        functionName: "swapExactTokensForETHSupportingFeeOnTransferTokens",
      }),
    },
    {
      signature:
        "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline)",
      name: "swapExactETHForTokensSupportingFeeOnTransferTokens",
      metadata: (decoded: any, tx: TransactionData["transaction"]): DexSwapMetadata => ({
        kind: "dexSwap",
        path: (decoded.path ?? decoded[1])?.map((address: string) => address.toLowerCase()) ?? [],
        recipient: decoded.to?.toLowerCase?.() ?? decoded[2]?.toLowerCase?.(),
        amountIn: tx.value?.toString?.() ?? undefined,
        minAmountOut: decoded.amountOutMin?.toString?.() ?? decoded[0]?.toString?.(),
        functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens",
      }),
    },
  ];

  return configurations.reduce<
    Map<string, { iface: Interface; name: string; signature: string; metadata: MetadataBuilder }>
  >((acc, item) => {
    const iface = new Interface([item.signature]);
    const selector = iface.getSighash(item.name);
    acc.set(selector, { iface, name: item.name, signature: item.signature, metadata: item.metadata });
    return acc;
  }, new Map());
})();
@Injectable()
export class AiRiskScoringService {
  private readonly logger = new Logger(AiRiskScoringService.name);
  private readonly config: AiScoringConfig;
  private readonly adapter: RiskModelAdapter;
  private readonly baseTokenSymbol: string;
  private readonly baseTokenDecimals: number;

  public constructor(
    configService: ConfigService,
    private readonly scoreRepository: TxAiRiskScoreRepository,
    private readonly tokenRepository: TokenRepository
  ) {
    this.config = configService.get<AiScoringConfig>("aiScoring") ?? {
      enabled: false,
      featureVersion: "tx-risk-features/poc-v1",
      adapterMode: "auto",
      model: { baseUrl: "https://api.openai.com/v1", name: "gpt-4o-mini" },
    };

    const baseTokenConfig = configService.get<{
      symbol?: string;
      decimals?: number;
    }>("tokens.baseToken") ?? { symbol: "ETH", decimals: 18 };
    this.baseTokenSymbol = baseTokenConfig.symbol ?? "ETH";
    this.baseTokenDecimals = baseTokenConfig.decimals ?? 18;

    this.adapter = this.selectAdapter(this.config);

    if (this.config.enabled && this.config.adapterMode !== "offline" && this.adapter instanceof RulesAdapter) {
      this.logger.warn(
        "AI scoring enabled but external adapter is not configured (missing API key or model); using offline fallback"
      );
    }
  }

  public async scoreTransaction(block: BlockInfo, transactionData: TransactionData): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const featureInput = await this.buildFeatureInput(block, transactionData);
      if (!featureInput) {
        this.logger.warn({ txHash: transactionData.transaction.hash }, "Failed to build AI feature payload");
        return;
      }

      const payload = buildFeaturePayload(featureInput);
      const requestHash = createRequestHash(this.config.featureVersion, payload.txHash, payload);

      const envelope = await this.adapter.score({
        featureVersion: this.config.featureVersion,
        requestHash,
        transactions: [{ txHash: payload.txHash, payload }],
      });

      const [normalized] = normalizeModelResponse(envelope, this.config.featureVersion);

      if (!normalized) {
        this.logger.warn({ txHash: payload.txHash }, "Model response did not return results");
        return;
      }

      await this.scoreRepository.upsertScore(normalized);
      this.logger.debug({ txHash: payload.txHash, verdict: normalized.verdict }, "AI risk score stored");
    } catch (error) {
      this.logger.error(
        {
          txHash: transactionData.transaction.hash,
          error: error instanceof Error ? error.message : String(error),
        },
        "AI risk scoring failed"
      );
    }
  }

  private async buildFeatureInput(block: BlockInfo, transactionData: TransactionData) {
    const blockTimestampIso = unixTimeToDate(block.timestamp).toISOString();
    const tx = transactionData.transaction;
    const receipt = transactionData.transactionReceipt;
    const sender = tx.from?.toLowerCase?.() ?? "";

    const decodedCall = this.decodeCallData(tx.data, tx);

    const rawTransfers = transactionData.transfers ?? [];
    const tokenTransfers = rawTransfers.map((transfer) => {
      const toAddress = transfer.to ? transfer.to.toLowerCase() : "";
      const tokenAddress = transfer.tokenAddress ? transfer.tokenAddress.toLowerCase() : "";
      return {
        standard:
          transfer.tokenType === TokenType.ERC20
            ? "erc20"
            : transfer.tokenType === TokenType.ERC721
            ? "erc721"
            : "unknown",
        from: transfer.from ? transfer.from.toLowerCase() : "",
        to: toAddress,
        token: tokenAddress,
        amount: transfer.amount !== undefined && transfer.amount !== null ? transfer.amount.toString() : undefined,
        tokenId: transfer.fields?.tokenId?.toString?.(),
        direction: toAddress === sender ? "inbound" : "outbound",
      };
    });

    const tokenAddresses = new Set<string>();
    tokenTransfers.forEach((transfer) => {
      if (transfer.token) {
        tokenAddresses.add(transfer.token);
      }
    });
    decodedCall?.metadata?.path?.forEach((address) => tokenAddresses.add(address));

    const tokenMetadata = await this.fetchTokenMetadata(Array.from(tokenAddresses));

    const dexRoute = this.buildDexRouteInsights(tx, rawTransfers, decodedCall?.metadata, tokenMetadata);
    const flashLoan = this.detectFlashLoan(receipt.logs ?? []);

    const logs = (receipt.logs ?? []).slice(0, MAX_CAPTURED_LOGS).map((log) => ({
      address: log.address,
      topic0: log.topics?.[0],
      topic1: log.topics?.[1],
      topic2: log.topics?.[2],
      topic3: log.topics?.[3],
      dataPreview: log.data?.slice?.(0, 66),
    }));

    const feePaid = this.computeFeePaid(receipt);

    const contractMetadata =
      tx.to === null && transactionData.contractAddresses.length > 0
        ? {
            ageSeconds: 0,
            verified: false,
            bytecodeHash: transactionData.contractAddresses[0]?.bytecode
              ? `hash:${transactionData.contractAddresses[0]?.bytecode?.length ?? 0}`
              : null,
            implementation: null,
            proxyType: null,
          }
        : undefined;

    return {
      chainId: this.normalizeChainId(tx.chainId),
      blockNumber: `0x${block.number.toString(16)}`,
      blockTimestamp: blockTimestampIso,
      txHash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: this.normalizeBigNumberish(tx.value) ?? "0",
      gas: this.normalizeBigNumberish(tx.gasLimit),
      gasPrice: this.normalizeBigNumberish(tx.gasPrice),
      maxFeePerGas: this.normalizeBigNumberish(tx.maxFeePerGas),
      maxPriorityFeePerGas: this.normalizeBigNumberish(tx.maxPriorityFeePerGas),
      data: tx.data,
      decodedParams: decodedCall?.params ?? [],
      tokenTransfers,
      isContractCreation: !tx.to,
      contractMetadata,
      addressMetadata: {
        from: {},
        to: {},
      },
      dexRoute,
      flashLoan,
      bridgeMetadata: undefined,
      receiptStatus: Number(receipt.status ?? 0),
      gasUsed: this.normalizeBigNumberish(receipt.gasUsed),
      cumulativeGasUsed: this.normalizeBigNumberish(receipt.cumulativeGasUsed),
      effectiveGasPrice: this.normalizeBigNumberish(receipt.effectiveGasPrice),
      feePaid,
      error: tx.error ?? null,
      revertReason: tx.revertReason ?? null,
      confirmations: tx.confirmations,
      logs,
    };
  }

  private selectAdapter(config: AiScoringConfig): RiskModelAdapter {
    const mode = config.adapterMode ?? "offline";
    if (mode === "offline") {
      this.logger.log("AI risk scoring using offline rules adapter");
      return new RulesAdapter();
    }

    if (mode === "external" || mode === "auto") {
      const { apiKey, baseUrl, name, organization } = config.model;
      if (!apiKey || !name) {
        if (mode === "external") {
          this.logger.warn("AI scoring external adapter selected but missing API key or model name; falling back");
        }
        return new RulesAdapter();
      }

      const options: OpenAiAdapterOptions = {
        apiKey,
        baseUrl,
        model: name,
        organization,
      };
      this.logger.log("AI risk scoring using OpenAI HTTP adapter");
      return new OpenAiAdapter(options);
    }

    return new RulesAdapter();
  }

  private normalizeChainId(chainId: unknown): string {
    try {
      if (chainId === undefined || chainId === null) {
        return "0x0";
      }
      if (typeof chainId === "bigint") {
        return `0x${chainId.toString(16)}`;
      }
      if (typeof chainId === "number") {
        return `0x${BigInt(chainId).toString(16)}`;
      }
      if (typeof chainId === "string") {
        if (chainId.startsWith("0x")) {
          return chainId.toLowerCase();
        }
        return `0x${BigInt(chainId).toString(16)}`;
      }
      if (typeof chainId === "object" && "toString" in chainId) {
        const str = (chainId as { toString(): string }).toString();
        if (!str) {
          return "0x0";
        }
        return this.normalizeChainId(str);
      }
    } catch {}
    return "0x0";
  }

  private normalizeBigNumberish(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (typeof value === "number") {
      return value.toString();
    }
    if (typeof value === "object" && "toString" in value) {
      try {
        return (value as { toString(): string }).toString();
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private decodeCallData(data: string | undefined, tx: TransactionData["transaction"]): DecodedCallResult | undefined {
    if (!data || data === "0x" || data.length < 10) {
      return undefined;
    }

    const selector = data.slice(0, 10).toLowerCase();
    const config = KNOWN_FUNCTIONS.get(selector);
    if (!config) {
      return undefined;
    }

    try {
      const decoded = config.iface.decodeFunctionData(config.name, data);
      const fragment = config.iface.getFunction(config.name);
      const params = fragment.inputs.map((input, index) => ({
        name: input.name || `arg${index}`,
        type: input.type,
        value: this.normalizeDecodedValue(decoded[index]),
      }));

      const metadata = config.metadata(decoded, tx);

      return {
        selector,
        name: config.name,
        signature: config.signature,
        params,
        metadata,
      };
    } catch (error) {
      this.logger.debug({ selector, error: error instanceof Error ? error.message : error }, "Failed to decode call");
      return undefined;
    }
  }

  private normalizeDecodedValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeDecodedValue(item));
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      return value.startsWith("0x") ? value.toLowerCase() : value;
    }
    if (value && typeof value === "object") {
      if ("toString" in value) {
        try {
          const converted = (value as { toString(): string }).toString();
          return converted.startsWith("0x") ? converted.toLowerCase() : converted;
        } catch {
          return undefined;
        }
      }
    }
    return value;
  }

  private async fetchTokenMetadata(addresses: string[]): Promise<Map<string, TokenDescriptor>> {
    const metadata = new Map<string, TokenDescriptor>();
    const unique = Array.from(new Set(addresses.map((addr) => addr?.toLowerCase?.()).filter(Boolean)));
    if (unique.length === 0) {
      return metadata;
    }

    for (const address of unique) {
      if (!address) {
        continue;
      }

      if (address === utils.L2_BASE_TOKEN_ADDRESS.toLowerCase()) {
        metadata.set(address, {
          address,
          symbol: this.baseTokenSymbol,
          decimals: this.baseTokenDecimals,
        });
        continue;
      }

      try {
        const token = await this.tokenRepository.findOneBy({ l2Address: address });
        if (token) {
          metadata.set(address, {
            address,
            symbol: token.symbol,
            decimals: token.decimals ?? 18,
          });
          continue;
        }
      } catch (error) {
        this.logger.debug({ tokenAddress: address, error }, "Token metadata lookup failed");
      }

      if (!metadata.has(address)) {
        metadata.set(address, {
          address,
          decimals: 18,
        });
      }
    }

    return metadata;
  }

  private buildDexRouteInsights(
    tx: TransactionData["transaction"],
    transfers: TransactionData["transfers"],
    metadata: DexSwapMetadata | undefined,
    tokenMetadata: Map<string, TokenDescriptor>
  ) {
    const pathFromMetadata = metadata?.path ?? [];
    const derivedPath = this.derivePathFromTransfers(transfers, tx.from);
    const path = pathFromMetadata.length ? pathFromMetadata : derivedPath;

    if (!metadata && (!path || path.length < 2)) {
      return undefined;
    }

    const normalizedPath = path.filter(Boolean);
    const firstToken = normalizedPath[0];
    const lastToken = normalizedPath[normalizedPath.length - 1];
    const recipient = metadata?.recipient ?? tx.from?.toLowerCase?.();

    const amountInBigInt = metadata?.amountIn
      ? this.toBigInt(metadata.amountIn)
      : firstToken
      ? this.sumTransfers(
          transfers,
          (transfer) =>
            transfer.tokenAddress?.toLowerCase?.() === firstToken &&
            transfer.from?.toLowerCase?.() === tx.from?.toLowerCase?.()
        )
      : undefined;

    const amountOutBigInt = lastToken
      ? this.sumTransfers(
          transfers,
          (transfer) =>
            transfer.tokenAddress?.toLowerCase?.() === lastToken &&
            transfer.to?.toLowerCase?.() === (recipient ?? tx.from?.toLowerCase?.())
        )
      : undefined;

    const amountIn = amountInBigInt !== undefined ? amountInBigInt.toString() : metadata?.amountIn;
    const amountOut = amountOutBigInt !== undefined ? amountOutBigInt.toString() : undefined;
    const minAmountOut = metadata?.minAmountOut;

    let priceImpactBps: number | undefined;
    if (minAmountOut && amountOut) {
      const minOut = this.toBigInt(minAmountOut);
      const actualOut = this.toBigInt(amountOut);
      if (minOut !== undefined && actualOut !== undefined && minOut > BigInt(0)) {
        const diff = minOut > actualOut ? minOut - actualOut : BigInt(0);
        priceImpactBps = Number((diff * BigInt(10000)) / minOut);
      }
    }

    const routeSummary = normalizedPath.length
      ? normalizedPath.map((address) => tokenMetadata.get(address)?.symbol ?? this.shortenAddress(address)).join(" -> ")
      : undefined;

    return {
      routeSummary,
      priceImpactBps,
      path: normalizedPath.length ? normalizedPath : undefined,
      amountIn,
      amountOut,
      minAmountOut,
      recipient,
      swapCount: normalizedPath.length ? Math.max(normalizedPath.length - 1, 0) : undefined,
    };
  }

  private derivePathFromTransfers(transfers: TransactionData["transfers"], sender?: string): string[] {
    if (!transfers?.length) {
      return [];
    }
    const senderLower = sender?.toLowerCase?.() ?? "";
    const outbound: string[] = [];
    const inbound: string[] = [];

    for (const transfer of transfers) {
      const token = transfer.tokenAddress?.toLowerCase?.();
      if (!token) {
        continue;
      }
      const fromLower = transfer.from?.toLowerCase?.() ?? "";
      const toLower = transfer.to?.toLowerCase?.() ?? "";

      if (senderLower && fromLower === senderLower) {
        if (!outbound.includes(token)) {
          outbound.push(token);
        }
      } else if (senderLower && toLower === senderLower) {
        if (!inbound.includes(token)) {
          inbound.push(token);
        }
      }
    }

    return [...outbound, ...inbound.filter((token) => !outbound.includes(token))];
  }

  private sumTransfers(
    transfers: TransactionData["transfers"],
    predicate: (transfer: TransactionData["transfers"][number]) => boolean
  ): bigint | undefined {
    let total = BigInt(0);
    let matched = false;

    for (const transfer of transfers) {
      if (!transfer || transfer.amount === undefined || transfer.amount === null) {
        continue;
      }
      if (!predicate(transfer)) {
        continue;
      }
      const value = this.toBigInt(transfer.amount);
      if (value !== undefined) {
        total += value;
        matched = true;
      }
    }

    return matched ? total : undefined;
  }

  private detectFlashLoan(logs: readonly { topics?: readonly string[]; address: string }[]) {
    if (!logs?.length) {
      return undefined;
    }
    const providers = new Set<string>();
    for (const log of logs) {
      const topic0 = log.topics?.[0]?.toLowerCase();
      if (topic0 && FLASH_LOAN_EVENT_TOPICS.has(topic0)) {
        providers.add(log.address.toLowerCase());
      }
    }

    if (providers.size === 0) {
      return undefined;
    }

    return {
      present: true,
      providers: Array.from(providers),
    };
  }

  private computeFeePaid(receipt: TransactionData["transactionReceipt"]): string | undefined {
    try {
      const gasUsed = this.toBigInt(receipt.gasUsed);
      if (gasUsed === undefined) {
        return undefined;
      }
      const gasPrice = this.toBigInt(receipt.effectiveGasPrice) ?? this.toBigInt(receipt.gasPrice) ?? undefined;
      if (gasPrice === undefined) {
        return undefined;
      }
      return (gasUsed * gasPrice).toString();
    } catch {
      return undefined;
    }
  }

  private toBigInt(value: unknown): bigint | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === "bigint") {
      return value;
    }
    if (typeof value === "number") {
      return BigInt(Math.trunc(value));
    }
    if (typeof value === "string") {
      if (!value) {
        return undefined;
      }
      try {
        return value.startsWith("0x") ? BigInt(value) : BigInt(value);
      } catch {
        return undefined;
      }
    }
    if (typeof value === "object" && "toString" in value) {
      try {
        const converted = (value as { toString(): string }).toString();
        if (!converted) {
          return undefined;
        }
        return converted.startsWith("0x") ? BigInt(converted) : BigInt(converted);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private shortenAddress(address: string) {
    if (!address || address.length < 10) {
      return address;
    }
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }
}
