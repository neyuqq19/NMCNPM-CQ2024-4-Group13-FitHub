import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService } from "../../modules/auth/auth.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Thiếu hoặc sai định dạng Bearer token.");
    }

    const user = await this.authService.validateSession(authHeader);

    if (!user) {
      throw new UnauthorizedException(
        "Phiên đăng nhập đã hết hạn hoặc không hợp lệ.",
      );
    }

    request.user = user;
    return true;
  }
}
