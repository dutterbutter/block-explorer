import { RiskModelAdapter, ScoreRequest } from "../types";
import { validateModelResponse } from "../schema";

export interface OpenAiAdapterOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  organization?: string;
  timeoutMs?: number;
}

export class OpenAiAdapter implements RiskModelAdapter {
  public readonly name = "openai-http";

  private static readonly SYSTEM_PROMPT = `
You are an expert on-chain risk analyst for a blockchain explorer. For each transaction you receive:
- Determine an overall verdict: "normal", "suspicious", or "security_concern".
- Use severity and confidence scores in [0,1].
- Prefer known descriptor ids when they fit (dex.high_price_impact, flash.loan_detected, bridge.unknown_destination, contract.unverified_creation, address.watchlist_hit, protocol.sandwich_pattern, protocol.flash_loan_attack, protocol.bridge_anomaly, generic.unusual_value_transfer). Create new ids only if necessary, using kebab-case with a domain prefix (e.g. protocol.sandwich-pattern).
- Include concise "why" explanations referencing concrete evidence from the supplied features (addresses, selectors, price impact, etc.).
- Do not invent details not present in the features.
- If data is incomplete, mark verdict "suspicious" only with moderate confidence; use "security_concern" only with strong signals (e.g. flash loan + high price impact, known malicious addresses, suspicious bridge routes).
Respond strictly in the JSON schema provided.`;

  public constructor(private readonly options: OpenAiAdapterOptions) {}

  public async score(request: ScoreRequest) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15000);

    const requestPayload = {
      request_hash: request.requestHash,
      feature_version: request.featureVersion,
      transactions: request.transactions.map((tx) => ({
        tx_hash: tx.txHash,
        features: tx.payload,
      })),
    };

    const payload = {
      model: this.options.model,
      temperature: 0.1,
      max_output_tokens: 1500,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "tx_ai_risk_response",
          schema: {
            type: "object",
            required: ["request_hash", "model", "results"],
            properties: {
              request_hash: { type: "string" },
              model: {
                type: "object",
                required: ["name", "version"],
                properties: {
                  name: { type: "string" },
                  version: { type: "string" },
                },
              },
              results: {
                type: "array",
                items: {
                  type: "object",
                  required: ["tx_hash", "verdict", "confidence", "descriptors"],
                  properties: {
                    tx_hash: { type: "string" },
                    verdict: { type: "string", enum: ["normal", "suspicious", "security_concern"] },
                    confidence: {
                      type: "object",
                      required: ["overall"],
                      properties: {
                        overall: { type: "number" },
                      },
                    },
                    descriptors: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["id", "severity", "confidence"],
                        properties: {
                          id: { type: "string" },
                          severity: { type: "number" },
                          confidence: { type: "number" },
                          why: { type: "string" },
                        },
                      },
                    },
                    error: { type: ["string", "null"] },
                  },
                },
              },
            },
          },
        },
      },
      input: [
        {
          role: "system",
          content: [
            {
              type: "text",
              text: OpenAiAdapter.SYSTEM_PROMPT.trim(),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify(requestPayload, null, 2),
            },
          ],
        },
      ],
      metadata: {
        request_hash: request.requestHash,
        caller: "block-explorer-ai-scorer",
      },
    };

    try {
      const response = await fetch(`${this.options.baseUrl}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.apiKey}`,
          ...(this.options.organization ? { "OpenAI-Organization": this.options.organization } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Model request failed with status ${response.status}`);
      }

      const raw = await response.json();
      const schemaOutput = raw?.output?.find?.((item: any) => item?.type === "output_json_schema");
      let jsonPayload =
        schemaOutput?.content?.find?.((part: any) => part?.type === "output_json_schema")?.json ??
        schemaOutput?.content?.find?.((part: any) => part?.type === "json")?.json;

      if (!jsonPayload) {
        const textPayload = schemaOutput?.content?.find?.((part: any) => part?.type === "text")?.text;
        if (typeof textPayload === "string") {
          try {
            jsonPayload = JSON.parse(textPayload);
          } catch (error) {
            throw new Error("Model response provided text output that is not valid JSON");
          }
        }
      }

      if (!jsonPayload) {
        throw new Error("Model response missing JSON schema output payload");
      }

      return validateModelResponse(jsonPayload);
    } finally {
      clearTimeout(timeout);
    }
  }
}
