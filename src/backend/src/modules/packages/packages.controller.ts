import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { AuthService } from '../auth/auth.service';
import { PackagesService } from './packages.service';

class CreatePackageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsInt()
  @IsIn([1, 3, 6, 12])
  durationMonths!: 1 | 3 | 6 | 12;

  @IsInt()
  @Min(1)
  price!: number;

  @IsOptional()
  @IsIn(['REGULAR', 'OFF_PEAK'])
  accessWindow?: 'REGULAR' | 'OFF_PEAK';

  @IsOptional()
  @IsBoolean()
  grantsGymAccess?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  ptSessionsIncluded?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class UpdatePackageDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt()
  @IsIn([1, 3, 6, 12])
  durationMonths?: 1 | 3 | 6 | 12;

  @IsOptional()
  @IsInt()
  @Min(1)
  price?: number;

  @IsOptional()
  @IsIn(['REGULAR', 'OFF_PEAK'])
  accessWindow?: 'REGULAR' | 'OFF_PEAK';

  @IsOptional()
  @IsBoolean()
  grantsGymAccess?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  ptSessionsIncluded?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Controller('api/packages')
export class PackagesController {
  constructor(
    @Inject(PackagesService) private readonly packagesService: PackagesService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Get()
  async listPackages(
    @Query('includeInactive') includeInactive?: string,
    @Headers('authorization') authorization?: string,
  ) {
    if (includeInactive === 'true') {
      const user = await this.authService.validateSession(authorization);
      this.packagesService.requireAdmin(user);
      return this.packagesService.listPackages(true);
    }
    return this.packagesService.listActivePackages();
  }

  @Post()
  async createPackage(
    @Body(
      new ValidationPipe({
        expectedType: CreatePackageDto,
        whitelist: true,
        transform: true,
      }),
    )
    body: CreatePackageDto,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.authService.validateSession(authorization);
    this.packagesService.requireAdmin(user);
    return this.packagesService.createPackage(user.id, body);
  }

  @Patch(':id')
  async updatePackage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        expectedType: UpdatePackageDto,
        whitelist: true,
        transform: true,
      }),
    )
    body: UpdatePackageDto,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.authService.validateSession(authorization);
    this.packagesService.requireAdmin(user);
    return this.packagesService.updatePackage(user.id, id, body);
  }
}
