import { sanitize } from '../../../src/socket/sanitize';

it('sanitizes text inputs and trims length', () => {
  expect(sanitize(123)).toBe('');
  expect(sanitize('<b>hello</b>', 20)).toBe('bhello/b');
  expect(sanitize('   spaced   ', 5)).toBe('space');
});
