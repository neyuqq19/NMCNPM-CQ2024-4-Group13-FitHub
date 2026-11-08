import type { MobileSession, ScreenId } from '../types';

export interface MobileAppState {
  screen: ScreenId;
  session: MobileSession | null;
  apiBaseUrl: string;
}

export type Listener = () => void;

class AuthStore {
  private state: MobileAppState = {
    screen: '00_LOGIN',
    session: null,
    apiBaseUrl: 'http://localhost:3000',
  };

  private listeners: Set<Listener> = new Set();

  getState(): MobileAppState {
    return this.state;
  }

  setScreen(screen: ScreenId) {
    this.state = { ...this.state, screen };
    this.notify();
  }

  setSession(session: MobileSession | null) {
    this.state = { ...this.state, session };
    this.notify();
  }

  setApiBaseUrl(apiBaseUrl: string) {
    this.state = { ...this.state, apiBaseUrl };
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const authStore = new AuthStore();
