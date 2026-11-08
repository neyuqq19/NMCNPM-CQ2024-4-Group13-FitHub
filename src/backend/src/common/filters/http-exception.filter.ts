import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message = "Lỗi hệ thống máy chủ nội bộ";
    let code = "INTERNAL_ERROR";

    if (typeof exceptionResponse === "string") {
      message = exceptionResponse;
    } else if (
      typeof exceptionResponse === "object" &&
      exceptionResponse !== null
    ) {
      const respObj = exceptionResponse as Record<string, any>;
      message = Array.isArray(respObj.message)
        ? respObj.message.join("; ")
        : respObj.message || message;
      code = respObj.code || code;
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      code,
      message,
      ...(exceptionResponse && typeof exceptionResponse === "object"
        ? Object.fromEntries(
            Object.entries(exceptionResponse).filter(([key]) =>
              [
                "fieldErrors",
                "memberId",
                "existingUserId",
                "retryAt",
                "verification",
              ].includes(key),
            ),
          )
        : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
