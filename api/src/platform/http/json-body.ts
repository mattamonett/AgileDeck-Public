import express, { type RequestHandler } from 'express';

/** Request body size caps; each route takes the smallest that fits its payload. */
export const JsonBodyLimit = {
  /** A password or a one-field command. */
  PASSWORD: '1kb',
  /** A list of read receipts. */
  RECEIPTS: '2kb',
  /** A short command or a feedback post. */
  COMMAND: '4kb',
  /** A reply or a review note. */
  MESSAGE: '8kb',
  /** An issue and anything else room-sized. */
  DOCUMENT: '100kb',
} as const;

export type JsonBodyLimit = (typeof JsonBodyLimit)[keyof typeof JsonBodyLimit];

/**
 * A JSON body parser that refuses compressed bodies, so the cost of reading a
 * request stays bounded by its limit.
 */
export function jsonBody(limit: JsonBodyLimit | number = JsonBodyLimit.DOCUMENT): RequestHandler {
  return express.json({ limit, inflate: false });
}
