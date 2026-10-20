import { pendingReveals } from '../../../src/modules/rooms/revelation-state';
import { withRoomLock } from '../../../src/modules/rooms/room-lock';

it('keeps pending reveals in a shared set', () => {
  expect(pendingReveals).toBeInstanceOf(Set);
});

it('releases failed room work and allows other rooms to progress independently', async () => {
  const held = Promise.withResolvers<void>();
  const order: string[] = [];
  const first = withRoomLock('a', async () => {
    await held.promise;
    throw new Error('failed');
  });
  const failure = expect(first).rejects.toThrow('failed');
  const second = withRoomLock('a', async () => {
    order.push('a');
  });
  await withRoomLock('b', async () => {
    order.push('b');
  });
  expect(order).toEqual(['b']);
  held.resolve();
  await failure;
  await second;
  expect(order).toEqual(['b', 'a']);
});
