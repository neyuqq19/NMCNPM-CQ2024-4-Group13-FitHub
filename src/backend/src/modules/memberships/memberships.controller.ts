import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { AuthService } from '../auth/auth.service';
import { MembershipsService } from './memberships.service';

class FreezeMembershipDto {
  @IsInt()
  days!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startsOn?: string;
}

@Controller('api/memberships')
export class MembershipsController {
  constructor(
    @Inject(MembershipsService)
    private readonly membershipsService: MembershipsService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Get('my/detail')
  async getMyDetail(@Headers('authorization') authorization?: string) {
    const user = await this.authService.validateSession(authorization);
    return this.membershipsService.getMyMembershipDetail(user.id);
  }

  @Get(':id/freezes')
  async getFreezes(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.authService.validateSession(authorization);
    return this.membershipsService.getFreezePeriods(user, id);
  }

  @Post(':id/freeze')
  @HttpCode(200)
  async freeze(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        expectedType: FreezeMembershipDto,
        whitelist: true,
        transform: true,
      }),
    )
    body: FreezeMembershipDto,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.authService.validateSession(authorization);
    return this.membershipsService.freezeMembership(user, id, body);
  }

  @Post(':id/unfreeze')
  @HttpCode(200)
  async unfreeze(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.authService.validateSession(authorization);
    return this.membershipsService.unfreezeMembership(user, id);
  }
}

