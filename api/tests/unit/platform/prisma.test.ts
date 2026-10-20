jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({ tag: 'client', $use: jest.fn() })),
}));

import prisma, { sqliteConnectionUrl } from '../../../src/platform/db/prisma';
import { PrismaClient } from '@prisma/client';

describe('prisma client', () => {
  it('instantiates the prisma client once', () => {
    expect(prisma).toMatchObject({ tag: 'client' });
    expect(prisma.$use).toHaveBeenCalledTimes(1);
    expect(PrismaClient).toHaveBeenCalledTimes(1);
  });

  it('limits SQLite to one connection while preserving the file and other options', () => {
    expect(sqliteConnectionUrl('file:/app/api/data/poker.db')).toBe(
      'file:/app/api/data/poker.db?connection_limit=1',
    );
    expect(
      sqliteConnectionUrl('file:C:/path with spaces/test.db?socket_timeout=5&connection_limit=9'),
    ).toBe('file:C:/path with spaces/test.db?socket_timeout=5&connection_limit=1');
  });
});
