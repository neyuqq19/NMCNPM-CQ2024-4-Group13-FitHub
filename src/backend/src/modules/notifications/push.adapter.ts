import { Injectable } from "@nestjs/common";

// PushAdapter hides the push provider (FCM in production) behind one method.
export const PUSH_ADAPTER = Symbol("PUSH_ADAPTER");

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}
export interface PushSendOptions {
  // Demo / test switch to exercise the E1 path (push fails, inbox row stays).
  simulateFailure?: boolean;
}
export interface PushAdapter {
  sendPush(message: PushMessage, options?: PushSendOptions): Promise<void>;
}

/**
 * Simulated push used until FCM credentials exist. It "delivers" every message,
 * and fails on demand so the in-app inbox independence (BR04, E1) can be shown.
 */
@Injectable()
export class SimulatedPushAdapter implements PushAdapter {
  async sendPush(message: PushMessage, options: PushSendOptions = {}) {
    if (options.simulateFailure || message.token.startsWith("invalid"))
      throw new Error("Simulated FCM error: UNREGISTERED (thiết bị không nhận được thông báo đẩy).");
  }
}
