import { isPlainHttpBeyondThisComputer } from './plain-http';

describe('isPlainHttpBeyondThisComputer', () => {
  it('flags plain HTTP from another machine', () => {
    expect(isPlainHttpBeyondThisComputer({ protocol: 'http:', hostname: '192.168.1.20' })).toBe(
      true,
    );
    expect(
      isPlainHttpBeyondThisComputer({ protocol: 'http:', hostname: 'poker.example.com' }),
    ).toBe(true);
  });

  it('allows HTTPS and this computer', () => {
    expect(
      isPlainHttpBeyondThisComputer({ protocol: 'https:', hostname: 'poker.example.com' }),
    ).toBe(false);
    for (const hostname of ['localhost', '127.0.0.1', '[::1]'])
      expect(isPlainHttpBeyondThisComputer({ protocol: 'http:', hostname })).toBe(false);
  });
});
