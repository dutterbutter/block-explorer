import { ApiProperty } from "@nestjs/swagger";

class AiRiskDescriptorDto {
  @ApiProperty({ type: String })
  public readonly id: string;

  @ApiProperty({ type: String })
  public readonly label: string;

  @ApiProperty({ enum: ["low", "medium", "high"] })
  public readonly severity: "low" | "medium" | "high";

  @ApiProperty({ type: Number })
  public readonly severityScore: number;

  @ApiProperty({ type: Number })
  public readonly confidence: number;

  @ApiProperty({ type: String, required: false, nullable: true })
  public readonly why?: string | null;
}

export class AiRiskScoreDto {
  @ApiProperty({ type: String })
  public readonly txHash: string;

  @ApiProperty({ type: String })
  public readonly requestHash: string;

  @ApiProperty({ type: String })
  public readonly featureVersion: string;

  @ApiProperty({ type: String })
  public readonly normalizerVersion: string;

  @ApiProperty({ type: String })
  public readonly modelName: string;

  @ApiProperty({ type: String })
  public readonly modelVersion: string;

  @ApiProperty({ type: String, enum: ["normal", "suspicious", "security_concern"] })
  public readonly verdict: string;

  @ApiProperty({ type: Number, nullable: true, required: false })
  public readonly confidenceOverall?: number | null;

  @ApiProperty({ type: [AiRiskDescriptorDto] })
  public readonly descriptors: AiRiskDescriptorDto[];

  @ApiProperty({ type: String })
  public readonly status: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  public readonly error?: string | null;

  @ApiProperty({ type: Date })
  public readonly requestedAt: Date;

  @ApiProperty({ type: Date, required: false, nullable: true })
  public readonly receivedAt?: Date | null;
}
