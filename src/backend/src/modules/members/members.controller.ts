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
} from "@nestjs/common";
import type {
  CreateMemberRequest,
  UpdateMemberRequest,
} from "@fithub/contracts";
import { AuthService } from "../auth/auth.service";
import { MembersService } from "./members.service";
import { profileInput } from "./members.validation";

@Controller("api")
export class MembersController {
  constructor(
    @Inject(MembersService) private readonly membersService: MembersService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}
  private async admin(header?: string) {
    const user = await this.authService.validateSession(header);
    this.membersService.requireAdmin(user.role);
    return user;
  }
  @Get("members")
  async listMembers(
    @Headers("authorization") header?: string,
    @Query() query: Record<string, string> = {},
  ) {
    const user = await this.admin(header);
    return this.membersService.listMembers(user.role, query);
  }
  @Get("members/overview")
  async overview(@Headers("authorization") header?: string) {
    await this.admin(header);
    return this.membersService.getOverview();
  }
  @Get("members/:id")
  async getMember(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("authorization") header?: string,
  ) {
    await this.admin(header);
    return this.membersService.getMember(id);
  }
  @Post("members")
  async create(
    @Body() body: unknown,
    @Headers("authorization") header?: string,
  ) {
    const user = await this.admin(header);
    return this.membersService.createMember(
      user.id,
      profileInput(body, true) as CreateMemberRequest,
    );
  }
  @Patch("members/:id")
  async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Headers("authorization") header?: string,
  ) {
    const user = await this.admin(header);
    return this.membersService.updateMember(
      user.id,
      id,
      profileInput(body, false) as UpdateMemberRequest,
    );
  }
  @Post("members/:id/deactivate")
  async deactivate(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: { version: number; reason: string },
    @Headers("authorization") header?: string,
  ) {
    const user = await this.admin(header);
    return this.membersService.deactivateMember(
      user.id,
      id,
      body?.version,
      body?.reason,
    );
  }
  @Get("memberships/my")
  async getMyMembership(@Headers("authorization") header?: string) {
    const user = await this.authService.validateSession(header);
    return this.membersService.getMyMembership(user.id);
  }
}
