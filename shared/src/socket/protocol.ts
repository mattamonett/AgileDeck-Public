import { z } from 'zod';

export interface SocketData {
  userId: string | null;
  roomId: string | null;
  visitorId: string | null;
  clientIp: string | null;
  connectionNonce: string;
  lastClientSeq: number;
}

export interface ReplayProtectionMetadata {
  connectionNonce: string;
  clientSeq: number;
}

export const ReplayEnvelopeSchema = z.object({
  _meta: z.object({
    connectionNonce: z.string().min(1),
    clientSeq: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }),
});

export const ErrorResponseSchema = z.object({ message: z.string() });

export const VersionSchema = z.object({ version: z.string().min(1) });

export interface HealthStatus {
  api: 'healthy' | 'unhealthy';
  db: 'healthy' | 'unhealthy';
  timestamp: string;
}

export const HealthStatusSchema: z.ZodType<HealthStatus> = z.object({
  api: z.enum(['healthy', 'unhealthy']),
  db: z.enum(['healthy', 'unhealthy']),
  timestamp: z.iso.datetime(),
});
