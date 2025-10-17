import { Controller, Get, Param, NotFoundException, Query } from "@nestjs/common";
import {
  ApiTags,
  ApiParam,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiExcludeController,
} from "@nestjs/swagger";
import { Pagination } from "nestjs-typeorm-paginate";
import { ApiListPageOkResponse } from "../common/decorators/apiListPageOkResponse";
import { PagingOptionsWithMaxItemsLimitDto, ListFiltersDto } from "../common/dtos";
import { buildDateFilter, isAddressEqual } from "../common/utils";
import { FilterTransactionsOptionsDto } from "./dtos/filterTransactionsOptions.dto";
import { TransferDto } from "../transfer/transfer.dto";
import { TransactionDto } from "./dtos/transaction.dto";
import { TransferService } from "../transfer/transfer.service";
import { LogDto } from "../log/log.dto";
import { LogService } from "../log/log.service";
import { FilterTransactionsOptions, TransactionService } from "./transaction.service";
import { ParseTransactionHashPipe, TX_HASH_REGEX_PATTERN } from "../common/pipes/parseTransactionHash.pipe";
import { swagger } from "../config/featureFlags";
import { constants } from "../config/docs";
import { User, UserParam } from "../user/user.decorator";
import { AiRiskScoreDto } from "./dtos/aiRiskScore.dto";
import { TxAiRiskScore } from "./entities/txAiRiskScore.entity";

const entityName = "transactions";

@ApiTags("Transaction BFF")
@ApiExcludeController(!swagger.bffEnabled)
@Controller(entityName)
export class TransactionController {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly transferService: TransferService,
    private readonly logService: LogService
  ) {}

  @Get("")
  @ApiListPageOkResponse(TransactionDto, { description: "Successfully returned transactions list" })
  @ApiBadRequestResponse({ description: "Query params are not valid or out of range" })
  public async getTransactions(
    @Query() filterTransactionsOptions: FilterTransactionsOptionsDto,
    @Query() listFilterOptions: ListFiltersDto,
    @Query() pagingOptions: PagingOptionsWithMaxItemsLimitDto,
    @User() user: UserParam
  ): Promise<Pagination<TransactionDto>> {
    const userFilters: FilterTransactionsOptions = {};

    if (user) {
      // In all cases we filter by log topics where the address is mentioned
      userFilters.filterAddressInLogTopics = true;

      // If target address is not provided, we filter by own address
      if (!filterTransactionsOptions.address) {
        userFilters.address = user.address;
      }

      // If target address is provided and it's not own, we filter transactions between own and target address
      if (filterTransactionsOptions.address && !isAddressEqual(filterTransactionsOptions.address, user.address)) {
        userFilters.visibleBy = user.address;
      }
    }

    const filterTransactionsListOptions = buildDateFilter(
      listFilterOptions.fromDate,
      listFilterOptions.toDate,
      "receivedAt"
    );
    return await this.transactionService.findAll(
      {
        ...filterTransactionsOptions,
        ...filterTransactionsListOptions,
        ...userFilters,
      },
      {
        filterOptions: { ...filterTransactionsOptions, ...listFilterOptions },
        ...pagingOptions,
        route: entityName,
      }
    );
  }

  @Get(":transactionHash")
  @ApiParam({
    name: "transactionHash",
    type: String,
    schema: { pattern: TX_HASH_REGEX_PATTERN },
    example: constants.txHash,
    description: "Valid transaction hash",
  })
  @ApiOkResponse({ description: "Transaction was returned successfully", type: TransactionDto })
  @ApiBadRequestResponse({ description: "Transaction hash is invalid" })
  @ApiNotFoundResponse({ description: "Transaction with the specified hash does not exist" })
  public async getTransaction(
    @Param("transactionHash", new ParseTransactionHashPipe()) transactionHash: string
  ): Promise<TransactionDto> {
    const transactionDetail = await this.transactionService.findOne(transactionHash);
    if (!transactionDetail) {
      throw new NotFoundException();
    }
    return transactionDetail;
  }

  @Get(":transactionHash/transfers")
  @ApiParam({
    name: "transactionHash",
    type: String,
    schema: { pattern: TX_HASH_REGEX_PATTERN },
    example: constants.txHash,
    description: "Valid transaction hash",
  })
  @ApiListPageOkResponse(TransferDto, { description: "Successfully returned transaction transfers list" })
  @ApiBadRequestResponse({
    description: "Transaction hash is invalid or paging query params are not valid or out of range",
  })
  @ApiNotFoundResponse({ description: "Transaction with the specified hash does not exist" })
  public async getTransactionTransfers(
    @Param("transactionHash", new ParseTransactionHashPipe()) transactionHash: string,
    @Query() pagingOptions: PagingOptionsWithMaxItemsLimitDto
  ): Promise<Pagination<TransferDto>> {
    if (!(await this.transactionService.exists(transactionHash))) {
      throw new NotFoundException();
    }

    const transfers = await this.transferService.findAll(
      { transactionHash },
      {
        ...pagingOptions,
        route: `${entityName}/${transactionHash}/transfers`,
      }
    );
    return transfers;
  }

  @Get(":transactionHash/logs")
  @ApiParam({
    name: "transactionHash",
    type: String,
    schema: { pattern: TX_HASH_REGEX_PATTERN },
    example: constants.txHash,
    description: "Valid transaction hash",
  })
  @ApiListPageOkResponse(LogDto, { description: "Successfully returned transaction logs list" })
  @ApiBadRequestResponse({
    description: "Transaction hash is invalid or paging query params are not valid or out of range",
  })
  @ApiNotFoundResponse({ description: "Transaction with the specified hash does not exist" })
  public async getTransactionLogs(
    @Param("transactionHash", new ParseTransactionHashPipe()) transactionHash: string,
    @Query() pagingOptions: PagingOptionsWithMaxItemsLimitDto
  ): Promise<Pagination<LogDto>> {
    if (!(await this.transactionService.exists(transactionHash))) {
      throw new NotFoundException();
    }

    return await this.logService.findAll(
      { transactionHash },
      {
        ...pagingOptions,
        route: `${entityName}/${transactionHash}/logs`,
      }
    );
  }

  @Get(":transactionHash/ai-risk-score")
  @ApiParam({
    name: "transactionHash",
    type: String,
    schema: { pattern: TX_HASH_REGEX_PATTERN },
    example: constants.txHash,
    description: "Valid transaction hash",
  })
  @ApiOkResponse({ description: "AI risk score for the transaction", type: AiRiskScoreDto })
  @ApiNotFoundResponse({ description: "AI score for the specified hash does not exist" })
  public async getTransactionAiRiskScore(
    @Param("transactionHash", new ParseTransactionHashPipe()) transactionHash: string
  ): Promise<AiRiskScoreDto> {
    const score = await this.transactionService.getAiRiskScore(transactionHash);
    if (!score) {
      throw new NotFoundException();
    }
    return this.mapScoreToDto(score);
  }

  private mapScoreToDto(score: TxAiRiskScore): AiRiskScoreDto {
    const descriptorsRaw = Array.isArray(score.descriptors) ? score.descriptors : [];
    const descriptors = descriptorsRaw.map((descriptor: any) => ({
      id: descriptor?.id,
      label: descriptor?.label,
      severity: descriptor?.severity,
      severityScore: descriptor?.severityScore ?? descriptor?.severity_score ?? 0,
      confidence: descriptor?.confidence ?? 0,
      why: descriptor?.why ?? null,
    }));

    return {
      txHash: score.txHash,
      requestHash: score.requestHash,
      featureVersion: score.featureVersion,
      normalizerVersion: score.normalizerVersion,
      modelName: score.modelName,
      modelVersion: score.modelVersion,
      verdict: score.verdict,
      confidenceOverall: score.confidenceOverall ?? null,
      descriptors,
      status: score.status,
      error: score.error ?? null,
      requestedAt: score.requestedAt,
      receivedAt: score.receivedAt ?? null,
    };
  }
}
