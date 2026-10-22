import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ROOM_TEXT_REGEX } from '@poker/shared';
import { clearLegacyClientIdentity, USER_NAME_STORAGE_KEY } from '@core/storage/storage-keys';
import { SiteAgreementComponent } from '@shared/legal/site-agreement.component';
import { SitePasswordFormComponent } from '@shared/access/site-password-form.component';
import { SiteAccessService } from '@core/access/site-access.service';
import { SiteConfigService } from '@core/config/site-config.service';

@Component({
  selector: 'app-home',
  imports: [FormsModule, RouterLink, SiteAgreementComponent, SitePasswordFormComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private readonly siteConfig = inject(SiteConfigService);
  private readonly access = inject(SiteAccessService);

  readonly siteName = this.siteConfig.siteName;
  readonly agreementRequired = this.siteConfig.agreementRequired;
  name = '';
  roomId = '';
  hasName = signal(false);
  readonly agreementAccepted = signal(this.siteConfig.hasAcceptedAgreement());
  /** The visitor may continue: no agreement is asked for, or they accepted it. */
  readonly canContinue = computed(() => !this.agreementRequired() || this.agreementAccepted());
  /** Shown after "Create New Room" while the site password protects room creation. */
  readonly askingPassword = signal(false);

  constructor() {
    clearLegacyClientIdentity();
    const savedName = localStorage.getItem(USER_NAME_STORAGE_KEY);
    if (savedName) {
      this.name = savedName;
      this.hasName.set(this.canContinue());
    }

    // Check if we were redirected from a room link
    const joinId = this.route.snapshot.queryParamMap.get('join');
    if (joinId) this.roomId = joinId;
  }

  private createRandomHex(length: number): string {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, length);
  }

  private createRoomId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().split('-')[0] ?? this.createRandomHex(8);
    }
    return this.createRandomHex(8);
  }

  submitName() {
    const trimmed = this.name.trim();
    if (!trimmed || !this.canContinue()) return;
    if (!ROOM_TEXT_REGEX.test(trimmed)) {
      alert(
        'Only alphanumeric characters, spaces, hyphens, and underscores are allowed for names.',
      );
      return;
    }
    localStorage.setItem(USER_NAME_STORAGE_KEY, trimmed);
    this.siteConfig.rememberAgreement();
    this.hasName.set(true);
  }

  editName() {
    this.hasName.set(false);
  }

  createRoom() {
    if (!this.name || !this.canContinue()) return;
    if (!ROOM_TEXT_REGEX.test(this.name.trim())) return;
    if (!this.access.unlocked()) {
      this.askingPassword.set(true);
      return;
    }

    localStorage.setItem(USER_NAME_STORAGE_KEY, this.name.trim());
    const newRoomId = this.createRoomId().toLowerCase();
    this.router.navigate(['/room', newRoomId], { state: { create: true } });
  }

  passwordAccepted() {
    this.askingPassword.set(false);
    this.createRoom();
  }

  joinRoom() {
    if (!this.canContinue()) return;
    const trimmedName = this.name.trim();
    const trimmedRoom = this.roomId.trim().toLowerCase();
    if (!trimmedName || !trimmedRoom) return;
    if (!ROOM_TEXT_REGEX.test(trimmedName) || !ROOM_TEXT_REGEX.test(trimmedRoom)) {
      alert('Invalid characters in name or Room ID.');
      return;
    }
    localStorage.setItem(USER_NAME_STORAGE_KEY, trimmedName);
    this.router.navigate(['/room', trimmedRoom]);
  }
}
