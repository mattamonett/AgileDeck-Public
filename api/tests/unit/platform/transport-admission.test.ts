import { IncomingMessage, createServer } from 'node:http';
import { Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { TransportAdmission } from '../../../src/platform/transport-admission';
import {
  encodeVisitorCookie,
  VISITOR_COOKIE_NAME,
} from '../../../src/platform/http/visitor-session';
import { WindowBudget } from '../../../src/platform/concurrency/window-budget';

function request(visitor = randomUUID(), address = '192.0.2.1') {
  const socket = new Socket();
  Object.defineProperty(socket, 'remoteAddress', { value: address });
  const req = new IncomingMessage(socket);
  req.headers.cookie = `${VISITOR_COOKIE_NAME}=${encodeVisitorCookie(visitor)}`;
  return req;
}

describe('transport admission before namespace allocation', () => {
  it('rejects missing and invalid sessions', () => {
    const admission = new TransportAdmission();
    const req = request();
    delete req.headers.cookie;
    expect(admission.admit(req)).toBe('A valid session is required');
    req.headers.cookie = `${VISITOR_COOKIE_NAME}=invalid`;
    expect(admission.admit(req)).toBe('A valid session is required');
  });

  it('holds concurrent reservations until transport close, including unjoined transports', () => {
    const admission = new TransportAdmission();
    const visitor = randomUUID();
    const requests = Array.from({ length: 5 }, () => request(visitor));
    for (const req of requests) expect(admission.admit(req)).toBeNull();
    expect(admission.admit(request(visitor))).toBe('Connection capacity reached');
    const first = requests[0];
    if (!first) throw new Error('Missing request');
    let close: (() => void) | undefined;
    admission.connected(first, (release) => {
      close = release;
    });
    if (!close) throw new Error('Missing release');
    close();
    close();
    expect(admission.admit(request(visitor))).toBeNull();
  });

  it('reclaims failed handshakes and bounds expiring counter storage', () => {
    jest.useFakeTimers();
    try {
      const admission = new TransportAdmission();
      const visitor = randomUUID();
      for (let i = 0; i < 5; i++) expect(admission.admit(request(visitor))).toBeNull();
      jest.advanceTimersByTime(10_001);
      expect(admission.admit(request(visitor))).toBeNull();
      const budget = new WindowBudget(1, 100, 2);
      expect(budget.consume('a')).toBe(true);
      expect(budget.consume('b')).toBe(true);
      expect(budget.consume('b')).toBe(false);
      // A full table admits a new key by forgetting the oldest window.
      expect(budget.consume('c')).toBe(true);
      expect(budget.consume('c')).toBe(false);
      expect(budget.consume('b')).toBe(false);
      expect(budget.consume('a')).toBe(true);
      jest.advanceTimersByTime(101);
      expect(budget.consume('b')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('groups rotating IPv6 addresses into one network limit', () => {
    const admission = new TransportAdmission();
    for (let i = 0; i < 100; i++)
      expect(
        admission.admit(request(randomUUID(), `2001:db8:abcd:1::${i.toString(16)}`)),
      ).toBeNull();
    expect(admission.admit(request(randomUUID(), '2001:db8:abcd:2::1'))).toBe(
      'Connection capacity reached',
    );
  });

  it("keeps one network's rejected handshakes out of the global budget", () => {
    const admission = new TransportAdmission();
    const attacker = request(randomUUID(), '192.0.2.1');
    delete attacker.headers.cookie;
    for (let i = 0; i < 1_100; i++) admission.admit(attacker);
    expect(admission.admit(attacker)).toBe('Too many connection attempts');

    const capped = randomUUID();
    for (let i = 0; i < 5; i++) expect(admission.admit(request(capped, '192.0.2.2'))).toBeNull();
    for (let i = 0; i < 1_000; i++) admission.admit(request(capped, '192.0.2.2'));

    expect(admission.admit(request(randomUUID(), '198.51.100.1'))).toBeNull();
  });

  it('still caps total admitted handshakes globally', () => {
    jest.useFakeTimers();
    try {
      const admission = new TransportAdmission();
      for (let i = 0; i < 1_000; i++)
        expect(
          admission.admit(request(randomUUID(), `10.0.${Math.floor(i / 250)}.${i % 250}`)),
        ).toBeNull();
      expect(admission.admit(request(randomUUID(), '198.51.100.1'))).toBe(
        'Too many connection attempts',
      );
      jest.advanceTimersByTime(60_001);
      expect(admission.admit(request(randomUUID(), '198.51.100.1'))).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects a real unauthenticated polling handshake before allocating an Engine.IO client', async () => {
    const admission = new TransportAdmission();
    const server = createServer();
    let closeFirst: (() => void) | undefined;
    const io = new Server(server, {
      allowRequest: (req, done) => {
        const error = admission.admit(req);
        done(error, error === null);
      },
    });
    io.engine.on('connection', (transport) => {
      closeFirst ??= () => transport.close(true);
      admission.connected(transport.request, (release) => transport.once('close', release));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing port');
      const response = await fetch(
        `http://127.0.0.1:${address.port}/socket.io/?EIO=4&transport=polling`,
      );
      expect(response.status).toBe(403);
      expect(io.engine.clientsCount).toBe(0);
      const headers = {
        Cookie: `${VISITOR_COOKIE_NAME}=${encodeVisitorCookie(randomUUID())}`,
      };
      const url = `http://127.0.0.1:${address.port}/socket.io/?EIO=4&transport=polling`;
      for (let i = 0; i < 5; i++) {
        const accepted = await fetch(url, { headers });
        expect(accepted.status).toBe(200);
        await accepted.text();
      }
      expect(io.engine.clientsCount).toBe(5);
      const denied = await fetch(url, { headers });
      expect(denied.status).toBe(403);
      await denied.text();
      if (!closeFirst) throw new Error('Missing transport');
      closeFirst();
      const replacement = await fetch(url, { headers });
      expect(replacement.status).toBe(200);
      await replacement.text();
      expect(io.engine.clientsCount).toBe(5);
    } finally {
      await new Promise<void>((resolve) => io.close(() => resolve()));
    }
  });
});
