import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreateCertificationRequest,
  CurrentUser,
  TrainerListResponse,
  TrainerProfileDto,
  TrainerSummaryDto,
  UpdateTrainerProfileRequest,
} from "@fithub/contracts";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import {
  completeBio,
  completeSpecialties,
  queryText,
} from "./trainers.validation";

const summaryInclude = {
  user: {
    select: { displayName: true, email: true, phone: true, status: true },
  },
  _count: { select: { certifications: true } },
} as const;

const detailInclude = {
  ...summaryInclude,
  certifications: { orderBy: [{ issuedAt: "desc" }, { id: "asc" }] },
} satisfies Prisma.TrainerProfileInclude;

type Summary = Prisma.TrainerProfileGetPayload<{
  include: typeof summaryInclude;
}>;
type Detail = Prisma.TrainerProfileGetPayload<{
  include: typeof detailInclude;
}>;

function summary(p: Summary): TrainerSummaryDto {
  return {
    id: p.id,
    userId: p.userId,
    trainerCode: p.trainerCode,
    displayName: p.user.displayName,
    email: p.user.email,
    phone: p.user.phone,
    accountStatus: p.user.status,
    avatarUrl: p.avatarUrl,
    specialties: p.specialties,
    experienceYears: p.experienceYears,
    certificationCount: p._count.certifications,
  };
}

function detail(p: Detail): TrainerProfileDto {
  return {
    ...summary(p),
    bio: p.bio,
    version: p.version,
    certifications: p.certifications.map(
      ({ id, name, issuer, issuedAt, credentialUrl }) => ({
        id,
        name,
        issuer,
        issuedAt: issuedAt.toISOString().slice(0, 10),
        credentialUrl,
      }),
    ),
  };
}

function complete(p: Summary) {
  return completeBio(p.bio) && completeSpecialties(p.specialties);
}

function notOwner(): never {
  throw new ForbiddenException({
    code: "NOT_PROFILE_OWNER",
    message: "Chỉ huấn luyện viên sở hữu hồ sơ mới được chỉnh sửa.",
  });
}

function missing(): never {
  throw new NotFoundException({
    code: "TRAINER_NOT_FOUND",
    message: "Không tìm thấy hồ sơ huấn luyện viên.",
  });
}

@Injectable()
export class TrainersService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async list(q: unknown, specialty: unknown): Promise<TrainerListResponse> {
    const name = queryText(q, "q");
    const filter = queryText(specialty, "specialty").toLocaleLowerCase("vi");
    const rows = await this.db.trainerProfile.findMany({
      where: {
        user: {
          role: "TRAINER",
          status: "ACTIVE",
          displayName: { contains: name, mode: "insensitive" },
        },
        bio: { not: "" },
        specialties: { isEmpty: false },
      },
      include: summaryInclude,
      orderBy: { trainerCode: "asc" },
    });
    return {
      items: rows
        .filter(
          (p) =>
            complete(p) &&
            p.specialties.some((s) =>
              s.toLocaleLowerCase("vi").includes(filter),
            ),
        )
        .map(summary),
    };
  }

  async mine(user: CurrentUser) {
    if (user.role !== "TRAINER") notOwner();
    const p = await this.db.trainerProfile.findUnique({
      where: { userId: user.id },
      include: detailInclude,
    });
    if (!p) missing();
    return detail(p);
  }

  async get(id: string, viewer: CurrentUser) {
    const p = await this.db.trainerProfile.findFirst({
      where: { id, user: { role: "TRAINER" } },
      include: detailInclude,
    });
    if (
      !p ||
      (viewer.role !== "ADMIN" &&
        viewer.id !== p.userId &&
        (p.user.status !== "ACTIVE" || !complete(p)))
    )
      missing();
    return detail(p);
  }

  async ownerId(user: CurrentUser, target: string) {
    if (user.role !== "TRAINER") notOwner();
    const p = await this.db.trainerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!p) missing();
    if (target !== "me" && target !== p.id) notOwner();
    return p.id;
  }

  private async mutate(
    actorId: string,
    id: string,
    version: number,
    action: string,
    changes: Partial<Omit<UpdateTrainerProfileRequest, "version">>,
    certificationChange?: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    return this.db.$transaction(async (tx) => {
      const result = await tx.trainerProfile.updateMany({
        where: { id, userId: actorId, version },
        data: { ...changes, version: { increment: 1 } },
      });
      if (result.count !== 1)
        throw new ConflictException({
          code: "VERSION_CONFLICT",
          message: "Hồ sơ đã thay đổi. Vui lòng tải lại trước khi lưu.",
        });
      if (certificationChange) await certificationChange(tx);
      await tx.auditLog.create({
        data: {
          actorId,
          action,
          entityType: "TrainerProfile",
          entityId: id,
          changedFields: certificationChange
            ? ["certifications"]
            : Object.keys(changes),
        },
      });
      return detail(
        await tx.trainerProfile.findUniqueOrThrow({
          where: { id },
          include: detailInclude,
        }),
      );
    });
  }

  update(
    actorId: string,
    id: string,
    { version, ...changes }: UpdateTrainerProfileRequest,
  ) {
    return this.mutate(actorId, id, version, "UPDATE_TRAINER_PROFILE", changes);
  }

  addCertification(
    actorId: string,
    id: string,
    input: CreateCertificationRequest,
  ) {
    const { version, issuedAt, ...fields } = input;
    return this.mutate(
      actorId,
      id,
      version,
      "ADD_TRAINER_CERTIFICATION",
      {},
      async (tx) => {
        await tx.trainerCertification.create({
          data: { ...fields, issuedAt: new Date(issuedAt), trainerId: id },
        });
      },
    );
  }

  removeCertification(
    actorId: string,
    id: string,
    certId: string,
    version: number,
  ) {
    return this.mutate(
      actorId,
      id,
      version,
      "DELETE_TRAINER_CERTIFICATION",
      {},
      async (tx) => {
        const cert = await tx.trainerCertification.findUnique({
          where: { id: certId },
          select: { trainerId: true },
        });
        if (!cert)
          throw new NotFoundException({
            code: "CERTIFICATION_NOT_FOUND",
            message: "Không tìm thấy chứng chỉ.",
          });
        if (cert.trainerId !== id) notOwner();
        await tx.trainerCertification.delete({
          where: { id: certId, trainerId: id },
        });
      },
    );
  }
}
