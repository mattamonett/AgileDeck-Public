import { ChangeDetectionStrategy, Component, OnInit, output, signal } from '@angular/core';
import * as QRCode from 'qrcode';

/**
 * Full-screen overlay with a QR code of the current room link, for joining from a phone.
 * The room page renders it in a @defer block, so it and the QR encoder load on first use.
 */
@Component({
  selector: 'app-room-qr-overlay',
  templateUrl: './room-qr-overlay.component.html',
  styleUrl: './room-qr-overlay.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomQrOverlayComponent implements OnInit {
  readonly closeOverlay = output();
  protected readonly qrCodeDataUrl = signal('');

  ngOnInit(): void {
    void this.generateQrCode(window.location.href);
  }

  private async generateQrCode(url: string): Promise<void> {
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: { dark: '#ffffff', light: '#00000000' },
      });
      this.qrCodeDataUrl.set(dataUrl);
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  }
}
