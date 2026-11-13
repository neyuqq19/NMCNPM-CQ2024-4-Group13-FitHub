import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Package } from '@prisma/client';
import type {
  CreatePackageRequest,
  CurrentUser,
  PackageDto,
  UpdatePackageRequest,
} from '@fithub/contracts';
import { PrismaService } from '../../database/prisma.service';

function toPackageDto(p: Package): PackageDto {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    durationMonths: p.durationMonths,
    price: Number(p.price),
    grantsGymAccess: p.grantsGymAccess,
    accessWindow: p.accessWindow,
    ptSessionsIncluded: p.ptSessionsIncluded,
    isActive: p.isActive,
  };
}

@Injectable()
export class PackagesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  requireAdmin(user: CurrentUser) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: 'Chỉ Admin có quyền quản lý danh mục gói tập.',
      });
    }
  }

  async listPackages(includeInactive = false): Promise<PackageDto[]> {
    const list = await this.prisma.package.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ durationMonths: 'asc' }, { code: 'asc' }],
    });
    return list.map(toPackageDto);
  }

  async listActivePackages(): Promise<PackageDto[]> {
    return this.listPackages(false);
  }

  async createPackage(
    actorId: string,
    input: CreatePackageRequest,
  ): Promise<PackageDto> {
    const code = input.code?.trim().toUpperCase();
    const name = input.name?.trim();
    if (!code || !name) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Mã gói và tên gói không được để trống.',
      });
    }
    if (![1, 3, 6, 12].includes(input.durationMonths)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Thời hạn gói phải là 1, 3, 6 hoặc 12 tháng.',
      });
    }
    if (!Number.isInteger(input.price) || input.price <= 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Giá gói phải là số nguyên dương.',
      });
    }
    const ptSessionsIncluded = input.ptSessionsIncluded ?? 0;
    if (!Number.isInteger(ptSessionsIncluded) || ptSessionsIncluded < 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Số buổi PT đi kèm phải là số nguyên không âm.',
      });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.package.findUnique({ where: { code } });
        if (existing) {
          throw new ConflictException({
            code: 'PACKAGE_CODE_EXISTS',
            message: `Mã gói "${code}" đã tồn tại.`,
          });
        }
        const created = await tx.package.create({
          data: {
            code,
            name,
            durationMonths: input.durationMonths,
            price: input.price,
            accessWindow: input.accessWindow ?? 'REGULAR',
            grantsGymAccess: input.grantsGymAccess ?? true,
            ptSessionsIncluded,
            isActive: input.isActive ?? true,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'PACKAGE_CREATE',
            entityType: 'Package',
            entityId: created.id,
            changedFields: [
              'code',
              'name',
              'durationMonths',
              'price',
              'accessWindow',
              'grantsGymAccess',
              'ptSessionsIncluded',
              'isActive',
            ],
          },
        });
        return toPackageDto(created);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'PACKAGE_CODE_EXISTS',
          message: `Mã gói "${code}" đã tồn tại.`,
        });
      }
      throw error;
    }
  }

  async updatePackage(
    actorId: string,
    id: string,
    input: UpdatePackageRequest,
  ): Promise<PackageDto> {
    const data: Prisma.PackageUpdateInput = {};
    const changedFields: string[] = [];

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Tên gói không được để trống.',
        });
      }
      data.name = name;
      changedFields.push('name');
    }
    if (input.durationMonths !== undefined) {
      if (![1, 3, 6, 12].includes(input.durationMonths)) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Thời hạn gói phải là 1, 3, 6 hoặc 12 tháng.',
        });
      }
      data.durationMonths = input.durationMonths;
      changedFields.push('durationMonths');
    }
    if (input.price !== undefined) {
      if (!Number.isInteger(input.price) || input.price <= 0) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Giá gói phải là số nguyên dương.',
        });
      }
      data.price = input.price;
      changedFields.push('price');
    }
    if (input.accessWindow !== undefined) {
      data.accessWindow = input.accessWindow;
      changedFields.push('accessWindow');
    }
    if (input.grantsGymAccess !== undefined) {
      data.grantsGymAccess = input.grantsGymAccess;
      changedFields.push('grantsGymAccess');
    }
    if (input.ptSessionsIncluded !== undefined) {
      if (
        !Number.isInteger(input.ptSessionsIncluded) ||
        input.ptSessionsIncluded < 0
      ) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Số buổi PT đi kèm phải là số nguyên không âm.',
        });
      }
      data.ptSessionsIncluded = input.ptSessionsIncluded;
      changedFields.push('ptSessionsIncluded');
    }
    if (input.isActive !== undefined) {
      data.isActive = input.isActive;
      changedFields.push('isActive');
    }

    if (changedFields.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Không có trường nào cần cập nhật.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.package.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException({
          code: 'PACKAGE_NOT_FOUND',
          message: 'Không tìm thấy gói tập.',
        });
      }
      const updated = await tx.package.update({
        where: { id },
        data,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'PACKAGE_UPDATE',
          entityType: 'Package',
          entityId: id,
          changedFields,
        },
      });
      return toPackageDto(updated);
    });
  }
}
