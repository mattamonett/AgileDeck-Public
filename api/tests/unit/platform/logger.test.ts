import { logger } from '../../../src/platform/logger';

describe('logger', () => {
  const saved = { level: process.env.LOG_LEVEL, format: process.env.LOG_FORMAT };
  const spies = {
    log: jest.spyOn(console, 'log').mockImplementation(() => undefined),
    info: jest.spyOn(console, 'info').mockImplementation(() => undefined),
    warn: jest.spyOn(console, 'warn').mockImplementation(() => undefined),
    error: jest.spyOn(console, 'error').mockImplementation(() => undefined),
    debug: jest.spyOn(console, 'debug').mockImplementation(() => undefined),
  };

  beforeEach(() => {
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_FORMAT;
    for (const spy of Object.values(spies)) spy.mockClear();
  });
  afterAll(() => {
    for (const spy of Object.values(spies)) spy.mockRestore();
    for (const [key, value] of [
      ['LOG_LEVEL', saved.level],
      ['LOG_FORMAT', saved.format],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('writes info and above as plain arguments by default', () => {
    logger.log('started', 3);
    logger.debug('hidden');
    logger.error('failed');
    expect(spies.log).toHaveBeenCalledWith('started', 3);
    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.error).toHaveBeenCalledWith('failed');
  });

  it('drops messages below LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'warn';
    logger.log('quiet');
    logger.info('quiet');
    logger.warn('loud');
    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
    expect(spies.warn).toHaveBeenCalledWith('loud');

    process.env.LOG_LEVEL = 'debug';
    logger.debug('detail');
    expect(spies.debug).toHaveBeenCalledWith('detail');
  });

  it('writes one JSON object per message with LOG_FORMAT=json', () => {
    process.env.LOG_FORMAT = 'json';
    logger.warn('Room %s is full', 'abc', { users: 25 });
    const [line] = spies.warn.mock.calls[0] ?? [];
    expect(typeof line).toBe('string');
    expect(JSON.parse(String(line))).toEqual({
      time: expect.any(String),
      level: 'warn',
      message: 'Room abc is full { users: 25 }',
    });
  });
});
