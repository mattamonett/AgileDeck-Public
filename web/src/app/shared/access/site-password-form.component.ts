import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SiteAccessService, type UnlockResult } from '@core/access/site-access.service';

/** Sends a typed password to the server and reports whether it was accepted. */
export type PasswordCheck = (password: string) => Promise<UnlockResult>;

/**
 * Asks for a password and reports when the server accepted it. It checks the
 * site password unless given another check, such as the admin password.
 */
@Component({
  selector: 'app-site-password-form',
  imports: [FormsModule],
  template: `
    <form class="password-form" (ngSubmit)="submit()">
      <label [for]="inputId()">{{ prompt() }}</label>
      <input
        [id]="inputId()"
        name="password"
        type="password"
        autocomplete="current-password"
        maxlength="256"
        [ngModel]="password()"
        (ngModelChange)="password.set($event)"
      />
      @if (error()) {
        <p class="password-error" role="alert">{{ error() }}</p>
      }
      <button type="submit" class="btn-primary" [disabled]="!password() || busy()">
        {{ busy() ? 'Checking…' : 'Continue' }}
      </button>
    </form>
  `,
  styles: `
    .password-form {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .password-error {
      margin: 0;
      color: #fca5a5;
      font-size: 0.9rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SitePasswordFormComponent {
  private readonly access = inject(SiteAccessService);
  readonly prompt = input('Enter the site password');
  readonly inputId = input('site-password');
  readonly check = input<PasswordCheck>((password) => this.access.unlock(password));
  readonly unlocked = output<void>();
  readonly password = signal('');
  readonly error = signal('');
  readonly busy = signal(false);

  async submit(): Promise<void> {
    const password = this.password();
    if (!password || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const result = await this.check()(password);
    this.busy.set(false);
    if (result.ok) {
      this.password.set('');
      this.unlocked.emit();
    } else {
      this.error.set(result.message);
    }
  }
}
