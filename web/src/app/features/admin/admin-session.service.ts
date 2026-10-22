import { Injectable, signal } from '@angular/core';
import { ApiPath, AdminSessionStatusSchema, type AdminSessionStatus } from '@poker/shared';
import type { UnlockResult } from '@core/access/site-access.service';
import { apiErrorMessage, readJsonResponse } from '@core/api/api-request';
import { resolveApiUrl } from '@core/api/api-url';
import { requestVisitorSession } from '@core/session/visitor-session';

/** What the admin page can show: the API decides each state. */
export type AdminAccess = 'checking' | 'off' | 'unreachable' | 'signed-out' | 'signed-in';

type AdminEnvironment = Extract<AdminSessionStatus, { signedIn: true }>['environment'];

/**
 * The admin session lives in an HttpOnly cookie set by the API after the admin
 * password; this only mirrors the API's answers. Any 401 from an admin route
 * means the cookie expired or the password changed, so the page signs out.
 */
@Injectable({ providedIn: 'root' })
export class AdminSessionService {
  private readonly accessState = signal<AdminAccess>('checking');
  private readonly environmentState = signal<AdminEnvironment | null>(null);
  readonly access = this.accessState.asReadonly();
  readonly environment = this.environmentState.asReadonly();

  /** An admin API request carrying the admin cookie. */
  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(`${resolveApiUrl()}${ApiPath.ADMIN}${path}`, {
      ...init,
      cache: 'no-store',
      credentials: 'include',
    });
    if (response.status === 401) this.signedOut();
    return response;
  }

  /** An admin request whose JSON body is returned, or whose error message is thrown. */
  async request(path: string, fallback: string, init: RequestInit = {}): Promise<unknown> {
    return readJsonResponse(await this.fetch(path, init), fallback);
  }

  /** Asks the API whether the admin page is on and this browser is signed in. */
  async refresh(): Promise<void> {
    try {
      const response = await fetch(`${resolveApiUrl()}${ApiPath.ADMIN}/session`, {
        cache: 'no-store',
        credentials: 'include',
      });
      if (response.status === 404) {
        this.accessState.set('off');
        return;
      }
      const status = AdminSessionStatusSchema.safeParse(await response.json());
      if (!response.ok || !status.success) {
        this.accessState.set('unreachable');
        return;
      }
      this.apply(status.data);
    } catch {
      this.accessState.set('unreachable');
    }
  }

  async signIn(password: string): Promise<UnlockResult> {
    const apiUrl = resolveApiUrl();
    try {
      // The admin cookie is bound to the browser ID, so make sure there is one.
      await requestVisitorSession(apiUrl);
      const response = await fetch(`${apiUrl}${ApiPath.ADMIN}/session`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body: unknown = await response.json().catch(() => null);
      const status = AdminSessionStatusSchema.safeParse(body);
      if (response.ok && status.success && status.data.signedIn) {
        this.apply(status.data);
        return { ok: true };
      }
      if (response.status === 404) this.accessState.set('off');
      return {
        ok: false,
        message: apiErrorMessage(body) ?? 'That did not work. Please try again.',
      };
    } catch {
      return { ok: false, message: 'Could not reach the admin service. Please try again.' };
    }
  }

  async signOut(): Promise<void> {
    try {
      await fetch(`${resolveApiUrl()}${ApiPath.ADMIN}/session`, {
        method: 'DELETE',
        cache: 'no-store',
        credentials: 'include',
      });
    } catch {
      // The page signs out either way; the cookie expires on its own.
    }
    this.signedOut();
  }

  private apply(status: AdminSessionStatus): void {
    if (status.signedIn) {
      this.environmentState.set(status.environment);
      this.accessState.set('signed-in');
    } else {
      this.signedOut();
    }
  }

  private signedOut(): void {
    this.environmentState.set(null);
    this.accessState.set('signed-out');
  }
}
