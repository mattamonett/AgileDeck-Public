import http from 'node:http';
import { Server, type ServerOptions } from 'socket.io';
import { createApp } from './app';
import type { ServerEnv } from './config/env';
import { startCleanupJob } from './modules/maintenance/cleanup.job';
import { isUnlockedFor } from './modules/site/site-access';
import { throwStats } from './modules/rooms/throw-stats';
import prisma from './platform/db/prisma';
import {
  isSameOriginRequest,
  logOriginRejection,
  originAllowList,
  type OriginCheck,
} from './platform/http/origin-policy';
import { TransportAdmission } from './platform/transport-admission';
import { setupSocket } from './socket';
import { memberChannels } from './socket/channels';
import type { PokerServer } from './socket/types';
import { logger } from './platform/logger';

export interface ApiServer {
  readonly httpServer: http.Server;
  readonly io: PokerServer;
  /** Schedules background work and starts listening on the configured port. */
  start(): void;
  /** Stops accepting requests and disconnects sockets and the database. */
  stop(signal: string): Promise<void>;
}

/**
 * Engine.IO handles its own requests before Express, so transports are
 * authenticated and budgeted here, before any namespace middleware runs.
 */
function socketServerOptions(
  allowedOrigins: readonly string[],
  isOriginAllowed: OriginCheck,
  admission: TransportAdmission,
): Partial<ServerOptions> {
  return {
    cors: {
      origin: [...allowedOrigins],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    allowRequest: (req, callback) => {
      const originHeader = req.headers.origin;
      const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
      if (isOriginAllowed(origin) || isSameOriginRequest(req.headers)) {
        const error = admission.admit(req);
        callback(error, error === null);
        return;
      }

      logOriginRejection('Socket.IO');
      callback('origin not allowed', false);
    },
    allowEIO3: false,
    maxHttpBufferSize: 16_384,
    connectTimeout: 10_000,
    pingTimeout: 60000,
    pingInterval: 25000,
  };
}

async function logDatabaseDiagnostic(): Promise<void> {
  try {
    const roomCount = await prisma.room.count();
    logger.log(`[DIAG] Database connected. Current Room Count: ${roomCount}`);
  } catch (err) {
    logger.error('[DIAG] Database connection failed on startup:', err);
  }
}

/** The public HTTP API and Socket.IO server on one port. */
export function createServer(env: ServerEnv): ApiServer {
  const isOriginAllowed = originAllowList(env.allowedOrigins);
  const admission = new TransportAdmission((req, visitorId) =>
    isUnlockedFor('everything', req.headers.cookie, visitorId),
  );
  const io: PokerServer = new Server(
    socketServerOptions(env.allowedOrigins, isOriginAllowed, admission),
  );
  const app = createApp({
    io,
    isOriginAllowed,
    secureCookies: env.secureCookies,
    buildTime: env.buildTime,
  });
  // Express must handle requests before Socket.IO attaches, so Engine.IO can
  // claim its own paths and pass every other request on to the app.
  const httpServer = http.createServer(app);
  io.attach(httpServer);
  io.engine?.on('connection', (transport) => {
    if (!admission.connected(transport.request, (release) => transport.once('close', release)))
      transport.close(true);
  });
  setupSocket(io);

  return {
    httpServer,
    io,
    start() {
      // Never purge a room that still has connected members.
      startCleanupJob((roomId) =>
        memberChannels(roomId).some(
          (channel) => (io.sockets.adapter.rooms.get(channel)?.size ?? 0) > 0,
        ),
      );
      if (process.env.DATABASE_URL) void logDatabaseDiagnostic();
      httpServer.listen(env.port, () => {
        logger.log(`Server running on http://localhost:${env.port}`);
      });
    },
    async stop(signal) {
      logger.log(`\nReceived ${signal}. Gracefully stopping server...`);
      httpServer.close(() => {
        logger.log('HTTP server closed.');
      });
      io.disconnectSockets(true);
      logger.log('All socket connections terminated.');
      try {
        await throwStats.drain();
      } catch (err) {
        logger.error('Error saving buffered throw statistics:', err);
      }
      try {
        await prisma.$disconnect();
        logger.log('Database connection closed.');
      } catch (err) {
        logger.error('Error closing database connection:', err);
      }
    },
  };
}
