import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreateEquipmentRequest,
  CreateIncidentRequest,
  EquipmentCategory,
  EquipmentDetailDto,
  EquipmentDto,
  EquipmentHistoryDto,
  EquipmentIncidentDto,
  EquipmentPageDto,
  EquipmentStatus,
  IncidentSeverity,
  ResolveMaintenanceRequest,
  RetireEquipmentRequest,
  UpdateEquipmentRequest,
} from "@fithub/contracts";
import { PrismaService } from "../../database/prisma.service";

const VALID_CATEGORIES: EquipmentCategory[] = [
  "CARDIO",
  "STRENGTH",
  "FREE_WEIGHT",
  "FUNCTIONAL",
];
const VALID_STATUSES: EquipmentStatus[] = [
  "OPERATIONAL",
  "OUT_OF_ORDER",
  "RETIRED",
];
const VALID_SEVERITIES: IncidentSeverity[] = ["LOW", "MEDIUM", "HIGH"];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CATEGORY_LOCK_KEY: Record<EquipmentCategory, number> = {
  CARDIO: 1001,
  STRENGTH: 1002,
  FREE_WEIGHT: 1003,
  FUNCTIONAL: 1004,
};

function fmtDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function parseOptionalDate(
  value: string | null | undefined,
  field: string,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === "") return null;
  const trimmed = value.trim();
  if (!DATE_RE.test(trimmed)) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: "Ngày tháng không đúng định dạng YYYY-MM-DD.",
      fieldErrors: { [field]: "Định dạng ngày phải là YYYY-MM-DD." },
    });
  }
  const dt = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== trimmed) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: "Ngày tháng không hợp lệ.",
      fieldErrors: { [field]: "Ngày tháng không tồn tại." },
    });
  }
  return dt;
}

@Injectable()
export class EquipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertUuid(id: string) {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException({
        code: "EQUIPMENT_NOT_FOUND",
        message: "Không tìm thấy thiết bị.",
      });
    }
  }

  private toIncidentDto(inc: {
    id: string;
    equipmentId: string;
    description: string;
    severity: IncidentSeverity;
    status: "OPEN" | "RESOLVED" | "REJECTED";
    resolutionNote: string | null;
    reportedAt: Date;
    resolvedAt: Date | null;
    reportedBy?: { displayName: string } | null;
    resolvedBy?: { displayName: string } | null;
  }): EquipmentIncidentDto {
    return {
      id: inc.id,
      equipmentId: inc.equipmentId,
      description: inc.description,
      severity: inc.severity,
      status: inc.status,
      resolutionNote: inc.resolutionNote,
      reportedBy: inc.reportedBy?.displayName ?? null,
      resolvedBy: inc.resolvedBy?.displayName ?? null,
      reportedAt: inc.reportedAt.toISOString(),
      resolvedAt: inc.resolvedAt ? inc.resolvedAt.toISOString() : null,
    };
  }

  private toHistoryDto(h: {
    id: string;
    equipmentId: string;
    action: string;
    fromStatus: EquipmentStatus | null;
    toStatus: EquipmentStatus;
    note: string | null;
    createdAt: Date;
    actor?: { displayName: string } | null;
  }): EquipmentHistoryDto {
    return {
      id: h.id,
      equipmentId: h.equipmentId,
      action: h.action,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      note: h.note,
      actorName: h.actor?.displayName ?? null,
      createdAt: h.createdAt.toISOString(),
    };
  }

  private toDto(eq: {
    id: string;
    code: string;
    name: string;
    category: EquipmentCategory;
    zone: string;
    status: EquipmentStatus;
    qrCodePayload: string;
    purchasedAt: Date | null;
    warrantyUntil: Date | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    incidents?: {
      id: string;
      equipmentId: string;
      description: string;
      severity: IncidentSeverity;
      status: "OPEN" | "RESOLVED" | "REJECTED";
      resolutionNote: string | null;
      reportedAt: Date;
      resolvedAt: Date | null;
      reportedBy?: { displayName: string } | null;
      resolvedBy?: { displayName: string } | null;
    }[];
  }): EquipmentDto {
    const openInc = eq.incidents?.find((i) => i.status === "OPEN") ?? null;
    return {
      id: eq.id,
      code: eq.code,
      name: eq.name,
      category: eq.category,
      zone: eq.zone,
      status: eq.status,
      qrCodePayload: eq.qrCodePayload,
      purchasedAt: fmtDate(eq.purchasedAt),
      warrantyUntil: fmtDate(eq.warrantyUntil),
      notes: eq.notes,
      openIncident: openInc ? this.toIncidentDto(openInc) : null,
      createdAt: eq.createdAt.toISOString(),
      updatedAt: eq.updatedAt.toISOString(),
    };
  }

  async list(query: {
    q?: string;
    category?: string;
    zone?: string;
    status?: string;
  }): Promise<EquipmentPageDto> {
    const where: Record<string, unknown> = {};
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { zone: { contains: q, mode: "insensitive" } },
      ];
    }
    if (
      query.category &&
      VALID_CATEGORIES.includes(query.category as EquipmentCategory)
    ) {
      where.category = query.category;
    }
    if (query.zone?.trim()) {
      where.zone = query.zone.trim();
    }
    if (
      query.status &&
      VALID_STATUSES.includes(query.status as EquipmentStatus)
    ) {
      where.status = query.status;
    }

    const [rows, allRows] = await Promise.all([
      this.prisma.equipment.findMany({
        where,
        include: {
          incidents: {
            where: { status: "OPEN" },
            include: {
              reportedBy: { select: { displayName: true } },
              resolvedBy: { select: { displayName: true } },
            },
          },
        },
        orderBy: [{ code: "asc" }],
      }),
      this.prisma.equipment.findMany({
        select: { status: true, zone: true },
      }),
    ]);

    const overview = {
      total: allRows.length,
      operational: allRows.filter((r) => r.status === "OPERATIONAL").length,
      outOfOrder: allRows.filter((r) => r.status === "OUT_OF_ORDER").length,
      retired: allRows.filter((r) => r.status === "RETIRED").length,
    };

    const zones = Array.from(new Set(allRows.map((r) => r.zone))).sort();

    return {
      items: rows.map((r) => this.toDto(r)),
      overview,
      zones,
    };
  }

  async detail(id: string): Promise<EquipmentDetailDto> {
    this.assertUuid(id);
    const eq = await this.prisma.equipment.findUnique({
      where: { id },
      include: {
        incidents: {
          include: {
            reportedBy: { select: { displayName: true } },
            resolvedBy: { select: { displayName: true } },
          },
          orderBy: { reportedAt: "desc" },
        },
        history: {
          include: {
            actor: { select: { displayName: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!eq) {
      throw new NotFoundException({
        code: "EQUIPMENT_NOT_FOUND",
        message: "Không tìm thấy thiết bị.",
      });
    }
    return {
      ...this.toDto(eq),
      incidents: eq.incidents.map((i) => this.toIncidentDto(i)),
      history: eq.history.map((h) => this.toHistoryDto(h)),
    };
  }

  async create(
    body: CreateEquipmentRequest,
    actorId: string,
  ): Promise<EquipmentDetailDto> {
    const fieldErrors: Record<string, string> = {};
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const zone = typeof body?.zone === "string" ? body.zone.trim() : "";
    const category = body?.category;

    if (!name || name.length > 150) {
      fieldErrors.name = "Tên thiết bị bắt buộc (1–150 ký tự).";
    }
    if (!zone || zone.length > 120) {
      fieldErrors.zone = "Khu vực đặt máy bắt buộc (1–120 ký tự).";
    }
    if (!VALID_CATEGORIES.includes(category)) {
      fieldErrors.category =
        "Nhóm thiết bị phải thuộc CARDIO, STRENGTH, FREE_WEIGHT hoặc FUNCTIONAL.";
    }
    if (Object.keys(fieldErrors).length > 0) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Dữ liệu thiết bị không hợp lệ.",
        fieldErrors,
      });
    }

    const purchasedAt = parseOptionalDate(body.purchasedAt, "purchasedAt") ?? null;
    const warrantyUntil =
      parseOptionalDate(body.warrantyUntil, "warrantyUntil") ?? null;
    if (purchasedAt && warrantyUntil && warrantyUntil < purchasedAt) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Hạn bảo hành không được nhỏ hơn ngày mua.",
        fieldErrors: {
          warrantyUntil: "Hạn bảo hành phải sau hoặc bằng ngày mua.",
        },
      });
    }

    const notes =
      typeof body.notes === "string" && body.notes.trim()
        ? body.notes.trim().slice(0, 1000)
        : null;

    const createdId = await this.prisma.$transaction(async (tx) => {
      const lockId = CATEGORY_LOCK_KEY[category];
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;

      const existingCodes = await tx.equipment.findMany({
        where: { category },
        select: { code: true },
      });

      const prefix = `EQ-${category}-`;
      let maxSeq = 0;
      for (const row of existingCodes) {
        if (row.code.startsWith(prefix)) {
          const num = Number.parseInt(row.code.slice(prefix.length), 10);
          if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
        }
      }
      const nextCode = `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
      const qrCodePayload = `FITHUB://EQUIPMENT/${nextCode}`;

      const eq = await tx.equipment.create({
        data: {
          code: nextCode,
          name,
          category,
          zone,
          status: "OPERATIONAL",
          qrCodePayload,
          purchasedAt,
          warrantyUntil,
          notes,
        },
      });

      await tx.equipmentHistory.create({
        data: {
          equipmentId: eq.id,
          actorId,
          action: "CREATED",
          fromStatus: null,
          toStatus: "OPERATIONAL",
          note: `Khởi tạo thiết bị mới (${nextCode}) tại ${zone}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: "EQUIPMENT_CREATE",
          entityType: "Equipment",
          entityId: eq.id,
          changedFields: [
            "code",
            "name",
            "category",
            "zone",
            "status",
            "qrCodePayload",
          ],
        },
      });

      return eq.id;
    });

    return this.detail(createdId);
  }

  async update(
    id: string,
    body: UpdateEquipmentRequest,
    actorId: string,
  ): Promise<EquipmentDetailDto> {
    this.assertUuid(id);

    const raw = body as Record<string, unknown>;
    if ("code" in raw || "qrCodePayload" in raw || "status" in raw) {
      throw new BadRequestException({
        code: "IMMUTABLE_FIELD",
        message:
          "Không được phép sửa trực tiếp mã thiết bị, tem QR hoặc trạng thái qua API cập nhật thông tin.",
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        {
          id: string;
          status: EquipmentStatus;
          purchasedAt: Date | null;
          warrantyUntil: Date | null;
        }[]
      >`SELECT "id", "status", "purchasedAt", "warrantyUntil" FROM "Equipment" WHERE "id" = ${id}::uuid FOR UPDATE`;

      const eq = rows[0];
      if (!eq) {
        throw new NotFoundException({
          code: "EQUIPMENT_NOT_FOUND",
          message: "Không tìm thấy thiết bị.",
        });
      }
      if (eq.status === "RETIRED") {
        throw new ConflictException({
          code: "EQUIPMENT_RETIRED",
          message:
            "Thiết bị đã ngưng sử dụng vĩnh viễn, không thể thay đổi trạng thái.",
        });
      }

      const data: Record<string, unknown> = {};
      const changedFields: string[] = [];

      if (body.name !== undefined) {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name || name.length > 150) {
          throw new BadRequestException({
            code: "VALIDATION_ERROR",
            message: "Tên thiết bị không hợp lệ.",
            fieldErrors: { name: "Tên thiết bị bắt buộc (1–150 ký tự)." },
          });
        }
        data.name = name;
        changedFields.push("name");
      }

      if (body.zone !== undefined) {
        const zone = typeof body.zone === "string" ? body.zone.trim() : "";
        if (!zone || zone.length > 120) {
          throw new BadRequestException({
            code: "VALIDATION_ERROR",
            message: "Khu vực đặt máy không hợp lệ.",
            fieldErrors: { zone: "Khu vực đặt máy bắt buộc (1–120 ký tự)." },
          });
        }
        data.zone = zone;
        changedFields.push("zone");
      }

      const nextPurchased =
        body.purchasedAt !== undefined
          ? parseOptionalDate(body.purchasedAt, "purchasedAt")
          : eq.purchasedAt;
      const nextWarranty =
        body.warrantyUntil !== undefined
          ? parseOptionalDate(body.warrantyUntil, "warrantyUntil")
          : eq.warrantyUntil;

      if (nextPurchased && nextWarranty && nextWarranty < nextPurchased) {
        throw new BadRequestException({
          code: "VALIDATION_ERROR",
          message: "Hạn bảo hành không được nhỏ hơn ngày mua.",
          fieldErrors: {
            warrantyUntil: "Hạn bảo hành phải sau hoặc bằng ngày mua.",
          },
        });
      }

      if (body.purchasedAt !== undefined) {
        data.purchasedAt = nextPurchased ?? null;
        changedFields.push("purchasedAt");
      }
      if (body.warrantyUntil !== undefined) {
        data.warrantyUntil = nextWarranty ?? null;
        changedFields.push("warrantyUntil");
      }
      if (body.notes !== undefined) {
        data.notes =
          typeof body.notes === "string" && body.notes.trim()
            ? body.notes.trim().slice(0, 1000)
            : null;
        changedFields.push("notes");
      }

      if (changedFields.length === 0) {
        throw new BadRequestException({
          code: "VALIDATION_ERROR",
          message: "Không có trường dữ liệu nào được cập nhật.",
        });
      }

      await tx.equipment.update({
        where: { id },
        data,
      });

      await tx.equipmentHistory.create({
        data: {
          equipmentId: id,
          actorId,
          action: "UPDATED",
          fromStatus: eq.status,
          toStatus: eq.status,
          note: `Cập nhật thông tin thiết bị (${changedFields.join(", ")})`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: "EQUIPMENT_UPDATE",
          entityType: "Equipment",
          entityId: id,
          changedFields,
        },
      });
    });

    return this.detail(id);
  }

  async reportIncident(
    id: string,
    body: CreateIncidentRequest,
    actorId: string,
  ): Promise<EquipmentDetailDto> {
    this.assertUuid(id);
    const description =
      typeof body?.description === "string" ? body.description.trim() : "";
    if (!description || description.length > 1000) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Vui lòng nhập mô tả sự cố hỏng hóc (1–1000 ký tự).",
        fieldErrors: {
          description: "Mô tả sự cố bắt buộc (1–1000 ký tự).",
        },
      });
    }
    const severity: IncidentSeverity =
      body?.severity && VALID_SEVERITIES.includes(body.severity)
        ? body.severity
        : "MEDIUM";

    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; status: EquipmentStatus }[]
      >`SELECT "id", "status" FROM "Equipment" WHERE "id" = ${id}::uuid FOR UPDATE`;

      const eq = rows[0];
      if (!eq) {
        throw new NotFoundException({
          code: "EQUIPMENT_NOT_FOUND",
          message: "Không tìm thấy thiết bị.",
        });
      }
      if (eq.status === "RETIRED") {
        throw new ConflictException({
          code: "EQUIPMENT_RETIRED",
          message:
            "Thiết bị đã ngưng sử dụng vĩnh viễn, không thể thay đổi trạng thái.",
        });
      }

      const openIncident = await tx.equipmentIncident.findFirst({
        where: { equipmentId: id, status: "OPEN" },
      });
      if (openIncident || eq.status === "OUT_OF_ORDER") {
        throw new ConflictException({
          code: "INCIDENT_ALREADY_OPEN",
          message:
            "Thiết bị đang có sự cố mở chờ bảo trì, không thể tạo chồng phiếu sự cố mới.",
        });
      }

      await tx.equipmentIncident.create({
        data: {
          equipmentId: id,
          reportedById: actorId,
          description,
          severity,
          status: "OPEN",
        },
      });

      await tx.equipment.update({
        where: { id },
        data: { status: "OUT_OF_ORDER" },
      });

      await tx.equipmentHistory.create({
        data: {
          equipmentId: id,
          actorId,
          action: "INCIDENT_REPORTED",
          fromStatus: eq.status,
          toStatus: "OUT_OF_ORDER",
          note: `[${severity}] ${description}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: "EQUIPMENT_INCIDENT_REPORT",
          entityType: "Equipment",
          entityId: id,
          changedFields: ["status"],
          reason: description,
        },
      });
    });

    return this.detail(id);
  }

  async resolveMaintenance(
    id: string,
    body: ResolveMaintenanceRequest,
    actorId: string,
  ): Promise<EquipmentDetailDto> {
    this.assertUuid(id);
    const resolutionNote =
      typeof body?.resolutionNote === "string"
        ? body.resolutionNote.trim()
        : "";
    if (!resolutionNote || resolutionNote.length > 1000) {
      throw new BadRequestException({
        code: "RESOLUTION_NOTE_REQUIRED",
        message: "Bắt buộc nhập ghi chú nghiệm thu xử lý bảo trì.",
        fieldErrors: {
          resolutionNote: "Vui lòng nhập kết quả xử lý bảo trì (1–1000 ký tự).",
        },
      });
    }
    const nextStatus: "OPERATIONAL" | "RETIRED" =
      body?.nextStatus === "RETIRED" ? "RETIRED" : "OPERATIONAL";

    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; status: EquipmentStatus }[]
      >`SELECT "id", "status" FROM "Equipment" WHERE "id" = ${id}::uuid FOR UPDATE`;

      const eq = rows[0];
      if (!eq) {
        throw new NotFoundException({
          code: "EQUIPMENT_NOT_FOUND",
          message: "Không tìm thấy thiết bị.",
        });
      }
      if (eq.status === "RETIRED") {
        throw new ConflictException({
          code: "EQUIPMENT_RETIRED",
          message:
            "Thiết bị đã ngưng sử dụng vĩnh viễn, không thể thay đổi trạng thái.",
        });
      }
      if (eq.status !== "OUT_OF_ORDER") {
        throw new ConflictException({
          code: "INVALID_STATUS_TRANSITION",
          message:
            "Chỉ có thể nghiệm thu bảo trì cho thiết bị đang ở trạng thái hỏng / bảo trì.",
        });
      }

      const openIncident = await tx.equipmentIncident.findFirst({
        where: { equipmentId: id, status: "OPEN" },
      });
      if (openIncident) {
        await tx.equipmentIncident.update({
          where: { id: openIncident.id },
          data: {
            status: "RESOLVED",
            resolutionNote,
            resolvedById: actorId,
            resolvedAt: new Date(),
          },
        });
      }

      await tx.equipment.update({
        where: { id },
        data: { status: nextStatus },
      });

      await tx.equipmentHistory.create({
        data: {
          equipmentId: id,
          actorId,
          action:
            nextStatus === "RETIRED" ? "RETIRED" : "MAINTENANCE_RESOLVED",
          fromStatus: "OUT_OF_ORDER",
          toStatus: nextStatus,
          note: resolutionNote,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: "EQUIPMENT_MAINTENANCE_RESOLVE",
          entityType: "Equipment",
          entityId: id,
          changedFields: ["status"],
          reason: resolutionNote,
        },
      });
    });

    return this.detail(id);
  }

  async retire(
    id: string,
    body: RetireEquipmentRequest,
    actorId: string,
  ): Promise<EquipmentDetailDto> {
    this.assertUuid(id);
    const reason =
      typeof body?.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 1000)
        : "Thanh lý / ngưng sử dụng vĩnh viễn thiết bị";

    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; status: EquipmentStatus }[]
      >`SELECT "id", "status" FROM "Equipment" WHERE "id" = ${id}::uuid FOR UPDATE`;

      const eq = rows[0];
      if (!eq) {
        throw new NotFoundException({
          code: "EQUIPMENT_NOT_FOUND",
          message: "Không tìm thấy thiết bị.",
        });
      }
      if (eq.status === "RETIRED") {
        throw new ConflictException({
          code: "EQUIPMENT_RETIRED",
          message:
            "Thiết bị đã ngưng sử dụng vĩnh viễn, không thể thay đổi trạng thái.",
        });
      }

      const openIncident = await tx.equipmentIncident.findFirst({
        where: { equipmentId: id, status: "OPEN" },
      });
      if (openIncident) {
        await tx.equipmentIncident.update({
          where: { id: openIncident.id },
          data: {
            status: "RESOLVED",
            resolutionNote: reason,
            resolvedById: actorId,
            resolvedAt: new Date(),
          },
        });
      }

      await tx.equipment.update({
        where: { id },
        data: { status: "RETIRED" },
      });

      await tx.equipmentHistory.create({
        data: {
          equipmentId: id,
          actorId,
          action: "RETIRED",
          fromStatus: eq.status,
          toStatus: "RETIRED",
          note: reason,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: "EQUIPMENT_RETIRE",
          entityType: "Equipment",
          entityId: id,
          changedFields: ["status"],
          reason,
        },
      });
    });

    return this.detail(id);
  }
}

