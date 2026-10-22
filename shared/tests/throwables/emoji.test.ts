import { NEW_THROWABLE_DAYS, isNewThrowable, throwableAddedAt } from '../../src/throwables/emoji';

describe('new throwables', () => {
  const released = { char: '🧪', tags: 'test tube', addedOn: '2026-10-22' };

  it('is new from the release date for the new window', () => {
    expect(isNewThrowable(released, new Date('2026-10-22T00:00:00Z'))).toBe(true);
    expect(isNewThrowable(released, new Date('2026-11-20T23:59:59Z'))).toBe(true);
    expect(NEW_THROWABLE_DAYS).toBe(30);
    const today = new Date().toISOString().slice(0, 10);
    expect(isNewThrowable({ ...released, addedOn: today })).toBe(true);
  });

  it('is not new before release or once the window ends', () => {
    expect(isNewThrowable(released, new Date('2026-10-21T23:59:59Z'))).toBe(false);
    expect(isNewThrowable(released, new Date('2026-11-21T00:00:00Z'))).toBe(false);
  });

  it('is never new without a valid release date', () => {
    const now = new Date('2026-10-22T12:00:00Z');
    expect(isNewThrowable({ char: '🧪', tags: 'test tube' }, now)).toBe(false);
    expect(isNewThrowable({ ...released, addedOn: '2026-02-30' }, now)).toBe(false);
    expect(isNewThrowable({ ...released, addedOn: '22/10/2026' }, now)).toBe(false);
    expect(throwableAddedAt({ ...released, addedOn: '2026-10-22T05:00:00Z' })).toBeNull();
  });
});
