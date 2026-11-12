import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CurrentUser,
  FreezeMembershipRequest,
  FreezeMembershipResponse,
  FreezePeriodDto,
  MyMembershipDetailDto,
} from '@fithub/contracts';
import { PrismaService } from '../../database/prisma.service';
import { gymClock } from '../check-ins/eligibility';

const DAY_MS = 86_400_000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

function toFreezeDto(f: {
  id: string;
  membershipId: string;
  startsOn: Date;
  endsBefore: Date;
  days: number;
  reason: string;
  status: 'ACTIVE' | 'ENDED';
  endedAt: Date | null;
  createdAt: Date;
}): FreezePeriodDto {
  return {
    id: f.id,
    membershipId: f.membershipId,
    startsOn: isoDate(f.startsOn),
    endsBefore: isoDate(f.endsBefore),
    days: f.days,
    reason: f.reason,
    status: f.status,
    endedAt: f.endedAt ? f.endedAt.toISOString() : null,
    createdAt: f.createdAt.toISOString(),
  };
}

@Injectable()
export class MembershipsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async freezeMembership(
    user: CurrentUser,
    id: string,
    input: FreezeMembershipRequest,
  ): Promise<FreezeMembershipResponse> {
    const days = input.days;
    if (!Number.isInteger(days) || days < 7) {
      throw new BadRequestException({
        code: 'FREEZE_MIN_7_DAYS',
        message: 'Mỗi đợt bảo lưu tối thiểu 7 ngày.',
      });
    }
    if (days > 30) {
      throw new BadRequestException({
        code: 'FREEZE_MAX_30_DAYS',
        message: 'Mỗi đợt bảo lưu tối đa 30 ngày.',
      });
    }

    const reason = (input.reason || '').trim();
    if (!reason || reason.length > 1000) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Lý do bảo lưu phải từ 1 đến 1000 ký tự.',
      });
    }

    const today = gymClock(new Date()).day;
    const startsOnStr = input.startsOn ?? today;
    const freezeStart = new Date(`${startsOnStr}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startsOnStr) ||
      !Number.isFinite(freezeStart.getTime()) ||
      isoDate(freezeStart) !== startsOnStr ||
      startsOnStr < today
    ) {
      throw new BadRequestException({
        code: 'INVALID_START_DATE',
        message: 'Ngày bắt đầu bảo lưu phải hợp lệ và không trước hôm nay.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id"=${id}::uuid FOR UPDATE`;

      const membership = await tx.membership.findUnique({
        where: { id },
        include: {
          member: { include: { user: true } },
          freezePeriods: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (!membership) {
        throw new NotFoundException({
          code: 'MEMBERSHIP_NOT_FOUND',
          message: 'Không tìm thấy gói tập.',
        });
      }

      const isOwner =
        user.role === 'MEMBER' && membership.member.userId === user.id;
      if (user.role !== 'ADMIN' && !isOwner) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_ROLE',
          message: 'Bạn không có quyền bảo lưu gói tập này.',
        });
      }

      if (
        membership.status !== 'ACTIVE' ||
        !membership.grantsGymAccessSnapshot ||
        membership.durationMonthsSnapshot < 6
      ) {
        throw new BadRequestException({
          code: 'FREEZE_NOT_ELIGIBLE',
          message:
            'Chỉ gói tập từ 6 tháng trở lên đang hoạt động mới được bảo lưu.',
        });
      }

      if (membership.freezePeriods.some((f) => f.status === 'ACTIVE')) {
        throw new ConflictException({
          code: 'ALREADY_FROZEN',
          message: 'Gói tập đang trong thời gian bảo lưu.',
        });
      }

      const usedDays = membership.freezePeriods.reduce(
        (sum, f) => sum + f.days,
        0,
      );
      if (usedDays + days > 30) {
        throw new BadRequestException({
          code: 'FREEZE_MAX_30_DAYS',
          message: 'Tổng thời gian bảo lưu tối đa là 30 ngày cho mỗi gói.',
        });
      }

      const freezeEnd = addDays(freezeStart, days);
      const newEndsBefore = addDays(membership.endsBefore, days);

      await tx.freezePeriod.create({
        data: {
          membershipId: membership.id,
          startsOn: freezeStart,
          endsBefore: freezeEnd,
          days,
          reason,
          status: 'ACTIVE',
          createdById: user.id,
        },
      });

      const updatedMembership = await tx.membership.update({
        where: { id: membership.id },
        data: {
          status: 'FROZEN',
          endsBefore: newEndsBefore,
          version: { increment: 1 },
        },
        include: {
          freezePeriods: { orderBy: { createdAt: 'desc' } },
        },
      });

      const scheduled = await tx.membership.findFirst({
        where: {
          memberId: membership.memberId,
          grantsGymAccessSnapshot: true,
          status: 'SCHEDULED',
          id: { not: membership.id },
        },
        orderBy: { startsOn: 'asc' },
      });

      let shiftedScheduled: typeof scheduled | null = null;
      if (scheduled) {
        await tx.$executeRawUnsafe(
          "SET LOCAL fithub.allow_schedule_shift = 'on'",
        );
        shiftedScheduled = await tx.membership.update({
          where: { id: scheduled.id },
          data: {
            startsOn: addDays(scheduled.startsOn, days),
            endsBefore: addDays(scheduled.endsBefore, days),
            version: { increment: 1 },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'MEMBERSHIP_FREEZE',
          entityType: 'Membership',
          entityId: membership.id,
          changedFields: ['status', 'endsBefore', 'freezePeriods'],
          reason,
        },
      });

      return {
        membership: {
          id: updatedMembership.id,
          code: updatedMembership.code,
          packageName: updatedMembership.packageNameSnapshot,
          status: updatedMembership.status,
          startsOn: isoDate(updatedMembership.startsOn),
          endsBefore: isoDate(updatedMembership.endsBefore),
          durationMonths: updatedMembership.durationMonthsSnapshot,
          ptSessionsRemaining: updatedMembership.ptSessionsRemaining,
          frozenDaysUsed: usedDays + days,
          freezePeriods: updatedMembership.freezePeriods.map(toFreezeDto),
        },
        shiftedScheduledMembership: shiftedScheduled
          ? {
              id: shiftedScheduled.id,
              code: shiftedScheduled.code,
              packageName: shiftedScheduled.packageNameSnapshot,
              status: shiftedScheduled.status,
              startsOn: isoDate(shiftedScheduled.startsOn),
              endsBefore: isoDate(shiftedScheduled.endsBefore),
            }
          : null,
      };
    });
  }

  async unfreezeMembership(
    user: CurrentUser,
    id: string,
  ): Promise<FreezeMembershipResponse> {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: 'Chỉ Admin có quyền kích hoạt lại gói đang bảo lưu.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id"=${id}::uuid FOR UPDATE`;

      const membership = await tx.membership.findUnique({
        where: { id },
        include: {
          freezePeriods: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (!membership) {
        throw new NotFoundException({
          code: 'MEMBERSHIP_NOT_FOUND',
          message: 'Không tìm thấy gói tập.',
        });
      }

      if (membership.status !== 'FROZEN') {
        throw new ConflictException({
          code: 'NOT_FROZEN',
          message: 'Gói tập hiện không ở trạng thái bảo lưu.',
        });
      }

      const now = new Date();
      await tx.freezePeriod.updateMany({
        where: { membershipId: id, status: 'ACTIVE' },
        data: { status: 'ENDED', endedAt: now },
      });

      const updated = await tx.membership.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          version: { increment: 1 },
        },
        include: {
          freezePeriods: { orderBy: { createdAt: 'desc' } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'MEMBERSHIP_UNFREEZE',
          entityType: 'Membership',
          entityId: id,
          changedFields: ['status', 'freezePeriods'],
        },
      });

      const frozenDaysUsed = updated.freezePeriods.reduce(
        (sum, f) => sum + f.days,
        0,
      );

      return {
        membership: {
          id: updated.id,
          code: updated.code,
          packageName: updated.packageNameSnapshot,
          status: updated.status,
          startsOn: isoDate(updated.startsOn),
          endsBefore: isoDate(updated.endsBefore),
          durationMonths: updated.durationMonthsSnapshot,
          ptSessionsRemaining: updated.ptSessionsRemaining,
          frozenDaysUsed,
          freezePeriods: updated.freezePeriods.map(toFreezeDto),
        },
        shiftedScheduledMembership: null,
      };
    });
  }

  async getFreezePeriods(
    user: CurrentUser,
    id: string,
  ): Promise<FreezePeriodDto[]> {
    const membership = await this.prisma.membership.findUnique({
      where: { id },
      include: {
        member: true,
        freezePeriods: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!membership) {
      throw new NotFoundException({
        code: 'MEMBERSHIP_NOT_FOUND',
        message: 'Không tìm thấy gói tập.',
      });
    }
    const isOwner =
      user.role === 'MEMBER' && membership.member.userId === user.id;
    if (user.role !== 'ADMIN' && !isOwner) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: 'Bạn không có quyền xem lịch sử bảo lưu của gói tập này.',
      });
    }
    return membership.freezePeriods.map(toFreezeDto);
  }

  async getMyMembershipDetail(userId: string): Promise<MyMembershipDetailDto> {
    const profile = await this.prisma.memberProfile.findUnique({
      where: { userId },
      include: {
        memberships: {
          orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
          include: {
            freezePeriods: { orderBy: { createdAt: 'desc' } },
          },
        },
      },
    });

    if (!profile) {
      return {
        hasProfile: false,
        memberCode: null,
        activeMembership: null,
        scheduledMembership: null,
        recentMemberships: [],
      };
    }

    const activeOrLatest =
      profile.memberships.find((m) =>
        ['ACTIVE', 'FROZEN'].includes(m.status),
      ) ||
      profile.memberships.find((m) => m.status !== 'CANCELLED') ||
      profile.memberships[0] ||
      null;

    const scheduled =
      profile.memberships.find((m) => m.status === 'SCHEDULED') || null;

    return {
      hasProfile: true,
      memberCode: profile.memberCode,
      activeMembership: activeOrLatest
        ? {
            id: activeOrLatest.id,
            code: activeOrLatest.code,
            packageName: activeOrLatest.packageNameSnapshot,
            status: activeOrLatest.status,
            startsOn: isoDate(activeOrLatest.startsOn),
            endsBefore: isoDate(activeOrLatest.endsBefore),
            durationMonths: activeOrLatest.durationMonthsSnapshot,
            accessWindow: activeOrLatest.accessWindowSnapshot,
            grantsGymAccess: activeOrLatest.grantsGymAccessSnapshot,
            ptSessionsSnapshot: activeOrLatest.ptSessionsSnapshot,
            ptSessionsRemaining: activeOrLatest.ptSessionsRemaining,
            frozenDaysUsed: activeOrLatest.freezePeriods.reduce(
              (sum, f) => sum + f.days,
              0,
            ),
            freezePeriods: activeOrLatest.freezePeriods.map(toFreezeDto),
          }
        : null,
      scheduledMembership: scheduled
        ? {
            id: scheduled.id,
            code: scheduled.code,
            packageName: scheduled.packageNameSnapshot,
            status: scheduled.status,
            startsOn: isoDate(scheduled.startsOn),
            endsBefore: isoDate(scheduled.endsBefore),
            durationMonths: scheduled.durationMonthsSnapshot,
            accessWindow: scheduled.accessWindowSnapshot,
            grantsGymAccess: scheduled.grantsGymAccessSnapshot,
            ptSessionsSnapshot: scheduled.ptSessionsSnapshot,
            ptSessionsRemaining: scheduled.ptSessionsRemaining,
          }
        : null,
      recentMemberships: profile.memberships.slice(0, 10).map((m) => ({
        id: m.id,
        code: m.code,
        packageName: m.packageNameSnapshot,
        status: m.status,
        startsOn: isoDate(m.startsOn),
        endsBefore: isoDate(m.endsBefore),
        durationMonths: m.durationMonthsSnapshot,
        price: Number(m.priceSnapshot),
      })),
    };
  }
}

