import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import type {
  CreateEquipmentRequest,
  CreateIncidentRequest,
  CurrentUser,
  ResolveMaintenanceRequest,
  RetireEquipmentRequest,
  UpdateEquipmentRequest,
} from "@fithub/contracts";
import { AuthService } from "../auth/auth.service";
import { EquipmentsService } from "./equipments.service";

@Controller("api/equipments")
export class EquipmentsController {
  constructor(
    @Inject(EquipmentsService)
    private readonly equipmentsService: EquipmentsService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  private async requireAdmin(authorization?: string): Promise<CurrentUser> {
    const user = await this.authService.validateSession(authorization);
    if (user.role !== "ADMIN") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Chỉ quản trị viên mới có quyền quản lý thiết bị phòng tập.",
      });
    }
    return user;
  }

  @Get()
  async list(
    @Query("q") q?: string,
    @Query("category") category?: string,
    @Query("zone") zone?: string,
    @Query("status") status?: string,
    @Headers("authorization") authorization?: string,
  ) {
    await this.requireAdmin(authorization);
    return this.equipmentsService.list({ q, category, zone, status });
  }

  @Get(":id")
  async detail(
    @Param("id") id: string,
    @Headers("authorization") authorization?: string,
  ) {
    await this.requireAdmin(authorization);
    return this.equipmentsService.detail(id);
  }

  @Post()
  async create(
    @Body() body: CreateEquipmentRequest,
    @Headers("authorization") authorization?: string,
  ) {
    const user = await this.requireAdmin(authorization);
    return this.equipmentsService.create(body, user.id);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateEquipmentRequest,
    @Headers("authorization") authorization?: string,
  ) {
    const user = await this.requireAdmin(authorization);
    return this.equipmentsService.update(id, body, user.id);
  }

  @Post(":id/incidents")
  async reportIncident(
    @Param("id") id: string,
    @Body() body: CreateIncidentRequest,
    @Headers("authorization") authorization?: string,
  ) {
    const user = await this.requireAdmin(authorization);
    return this.equipmentsService.reportIncident(id, body, user.id);
  }

  @Post(":id/resolve-maintenance")
  @HttpCode(200)
  async resolveMaintenance(
    @Param("id") id: string,
    @Body() body: ResolveMaintenanceRequest,
    @Headers("authorization") authorization?: string,
  ) {
    const user = await this.requireAdmin(authorization);
    return this.equipmentsService.resolveMaintenance(id, body, user.id);
  }

  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @Param("id") id: string,
    @Body() body: RetireEquipmentRequest,
    @Headers("authorization") authorization?: string,
  ) {
    const user = await this.requireAdmin(authorization);
    return this.equipmentsService.retire(id, body, user.id);
  }
}

