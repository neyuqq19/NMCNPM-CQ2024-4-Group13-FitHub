import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CurrentUser,
  FreezeMembershipRequest,
  FreezeMembershipResponse,
  FreezePeriodDto,
  MyMembershipDetailDto,
} from '@fithub/contracts';
import { PrismaService } from '../../database/prisma.service';
import {
  effectiveMembershipStatus,
  gymClock,
} from '../check-ins/eligibility';

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

  now(): Date {
    return new Date();
  }

  async syncMemberLifecycle(
    tx: Prisma.TransactionClient,
    memberId: string,
    now: Date = this.now(),
  ) {
    const today = gymClock(now).day;
    const todayDate = new Date(`${today}T00:00:00Z`);

    const memberships = await tx.membership.findMany({
      where: { memberId },
      include: { freezePeriods: true },
    });

    for (const m of memberships) {
      if (m.status === 'CANCELLED' || m.status === 'PENDING_PAYMENT') {
        continue;
      }

      for (const f of m.freezePeriods) {
        if (f.status === 'ACTIVE' && f.endsBefore <= todayDate) {
          await tx.freezePeriod.update({
            where: { id: f.id },
            data: {
              status: 'ENDED',
              endedAt: f.endsBefore,
            },
          });
          f.status = 'ENDED';
          f.endedAt = f.endsBefore;
        }
      }

      const desiredStatus = effectiveMembershipStatus(m, today);
      if (desiredStatus !== m.status) {
        await tx.membership.update({
          where: { id: m.id },
          data: {
            status: desiredStatus,
            version: { increment: 1 },
          },
        });
      }
    }
  }

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

    const now = this.now();
    const today = gymClock(now).day;
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

      const initial = await tx.membership.findUnique({
        where: { id },
        select: { memberId: true },
      });
      if (!initial) {
        throw new NotFoundException({
          code: 'MEMBERSHIP_NOT_FOUND',
          message: 'Không tìm thấy gói tập.',
        });
      }

      await this.syncMemberLifecycle(tx, initial.memberId, now);

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

      if (membership.freezePeriods.some((f) => f.status === 'ACTIVE')) {
        throw new ConflictException({
          code: 'ALREADY_FROZEN',
          message: 'Gói tập đang có lịch bảo lưu hoạt động.',
        });
      }

      const membershipStartStr = isoDate(membership.startsOn);
      const membershipEndStr = isoDate(membership.endsBefore);

      if (
        membership.status !== 'ACTIVE' ||
        !membership.grantsGymAccessSnapshot ||
        membership.durationMonthsSnapshot < 6 ||
        membershipEndStr <= today
      ) {
        throw new BadRequestException({
          code: 'FREEZE_NOT_ELIGIBLE',
          message:
            'Chỉ gói tập từ 6 tháng trở lên đang trong thời hạn hoạt động mới được bảo lưu.',
        });
      }

      if (
        startsOnStr < membershipStartStr ||
        startsOnStr >= membershipEndStr
      ) {
        throw new BadRequestException({
          code: 'INVALID_START_DATE',
          message:
            'Ngày bắt đầu bảo lưu phải nằm trong thời hạn sử dụng hợp lệ của gói tập.',
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
      const nextStatus = startsOnStr === today ? 'FROZEN' : 'ACTIVE';

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
          status: nextStatus,
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

    const now = this.now();
    const today = gymClock(now).day;
    const todayDate = new Date(`${today}T00:00:00Z`);

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

      const activeFreeze = membership.freezePeriods.find(
        (f) => f.status === 'ACTIVE',
      );
      if (membership.status !== 'FROZEN' && !activeFreeze) {
        throw new ConflictException({
          code: 'NOT_FROZEN',
          message: 'Gói tập hiện không ở trạng thái bảo lưu.',
        });
      }

      let unusedDays = 0;
      if (activeFreeze) {
        const elapsedDays = Math.floor(
          (todayDate.getTime() - activeFreeze.startsOn.getTime()) / DAY_MS,
        );
        const actualDays = Math.max(
          0,
          Math.min(activeFreeze.days, elapsedDays),
        );
        unusedDays = Math.max(0, activeFreeze.days - actualDays);

        await tx.freezePeriod.update({
          where: { id: activeFreeze.id },
          data: {
            status: 'ENDED',
            endedAt: now,
            days: actualDays,
            endsBefore: addDays(activeFreeze.startsOn, actualDays),
          },
        });
      }

      const newEndsBefore = addDays(membership.endsBefore, -unusedDays);
      const nextStatus =
        isoDate(newEndsBefore) <= today
          ? 'EXPIRED'
          : isoDate(membership.startsOn) <= today
            ? 'ACTIVE'
            : 'SCHEDULED';

      const updated = await tx.membership.update({
        where: { id },
        data: {
          status: nextStatus,
          endsBefore: newEndsBefore,
          version: { increment: 1 },
        },
        include: {
          freezePeriods: { orderBy: { createdAt: 'desc' } },
        },
      });

      let shiftedScheduled = null;
      if (unusedDays > 0) {
        const scheduled = await tx.membership.findFirst({
          where: {
            memberId: membership.memberId,
            grantsGymAccessSnapshot: true,
            status: 'SCHEDULED',
            id: { not: membership.id },
          },
          orderBy: { startsOn: 'asc' },
        });
        if (scheduled) {
          await tx.$executeRawUnsafe(
            "SET LOCAL fithub.allow_schedule_shift = 'on'",
          );
          shiftedScheduled = await tx.membership.update({
            where: { id: scheduled.id },
            data: {
              startsOn: addDays(scheduled.startsOn, -unusedDays),
              endsBefore: addDays(scheduled.endsBefore, -unusedDays),
              version: { increment: 1 },
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'MEMBERSHIP_UNFREEZE',
          entityType: 'Membership',
          entityId: id,
          changedFields: ['status', 'endsBefore', 'freezePeriods'],
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

  async getFreezePeriods(
    user: CurrentUser,
    id: string,
  ): Promise<FreezePeriodDto[]> {
    const now = this.now();
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.membership.findUnique({
        where: { id },
        select: { memberId: true },
      });
      if (!initial) {
        throw new NotFoundException({
          code: 'MEMBERSHIP_NOT_FOUND',
          message: 'Không tìm thấy gói tập.',
        });
      }

      await this.syncMemberLifecycle(tx, initial.memberId, now);

      const membership = await tx.membership.findUnique({
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
    });
  }

  async getMyMembershipDetail(userId: string): Promise<MyMembershipDetailDto> {
    const now = this.now();
    const today = gymClock(now).day;

    return this.prisma.$transaction(async (tx) => {
      const existingProfile = await tx.memberProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (existingProfile) {
        await this.syncMemberLifecycle(tx, existingProfile.id, now);
      }

      const profile = await tx.memberProfile.findUnique({
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

      const withEffective = profile.memberships.map((m) => ({
        ...m,
        status: effectiveMembershipStatus(m, today),
      }));

      const activeOrLatest =
        withEffective.find((m) => ['ACTIVE', 'FROZEN'].includes(m.status)) ||
        withEffective.find((m) => m.status !== 'CANCELLED') ||
        withEffective[0] ||
        null;

      const scheduled =
        withEffective.find((m) => m.status === 'SCHEDULED') || null;

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
        recentMemberships: withEffective.slice(0, 10).map((m) => ({
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
    });
  }

  /**
   * Internal service methods (PKG-06) for PT session reservation/consumption/refund (UC08 integration)
   */
  async holdPTSession(membershipId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id"=${membershipId}::uuid FOR UPDATE`;
      const m = await tx.membership.findUnique({ where: { id: membershipId } });
      if (!m) {
        throw new NotFoundException({
          code: 'MEMBERSHIP_NOT_FOUND',
          message: 'Không tìm thấy gói tập.',
        });
      }
      if (m.status !== 'ACTIVE' || m.ptSessionsRemaining < 1) {
        throw new BadRequestException({
          code: 'NO_PT_SESSIONS_AVAILABLE',
          message: 'Gói tập không còn buổi PT khả dụng để đặt lịch.',
        });
      }
      return tx.membership.update({
        where: { id: membershipId },
        data: {
          ptSessionsRemaining: { decrement: 1 },
          version: { increment: 1 },
        },
      });
    });
  }

  async consumePTSession(membershipId: string) {
    const m = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });
    if (!m) {
      throw new NotFoundException({
        code: 'MEMBERSHIP_NOT_FOUND',
        message: 'Không tìm thấy gói tập.',
      });
    }
    return m;
  }

  async refundPTSession(membershipId: string, grantCompensation = false) {
    const delta = grantCompensation ? 2 : 1;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id"=${membershipId}::uuid FOR UPDATE`;
      const m = await tx.membership.findUnique({ where: { id: membershipId } });
      if (!m) {
        throw new NotFoundException({
          code: 'MEMBERSHIP_NOT_FOUND',
          message: 'Không tìm thấy gói tập.',
        });
      }
      const nextRemaining = m.ptSessionsRemaining + delta;
      const nextSnapshot = Math.max(m.ptSessionsSnapshot, nextRemaining);
      if (nextSnapshot > m.ptSessionsSnapshot) {
        await tx.$executeRawUnsafe(
          "SET LOCAL fithub.allow_pt_compensation = 'on'",
        );
      }
      return tx.membership.update({
        where: { id: membershipId },
        data: {
          ptSessionsRemaining: nextRemaining,
          ptSessionsSnapshot: nextSnapshot,
          version: { increment: 1 },
        },
      });
    });
  }
}
