jest.mock('../../../src/modules/rooms/room-stats.repository', () => ({
  setVoteWithStats: jest.fn(),
}));
import { setVoteWithStats } from '../../../src/modules/rooms/room-stats.repository';
jest.mock('../../../src/modules/rooms/user.repository', () => ({
  update: jest.fn(),
  updateObserverStatus: jest.fn(),
  findById: jest.fn(),
}));

import * as memberService from '../../../src/modules/rooms/member.service';
import * as userRepository from '../../../src/modules/rooms/user.repository';

describe('user service', () => {
  const mockedUserRepository = jest.mocked(userRepository);
  const userFixture = {
    id: 'user-1',
    name: 'User 1',
    roomId: 'room-1',
    vote: null,
    isObserver: false,
    visitorId: 'visitor-1',
    isApproved: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    agreementVersion: null,
    agreementText: null,
    agreementAcceptedAt: null,
  };

  it('updates name and vote', async () => {
    const service = memberService;
    mockedUserRepository.update.mockResolvedValue(userFixture);

    await service.updateName('user-1', 'New');
    await service.setVote('user-1', '5');

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      name: 'New',
    });
    expect(setVoteWithStats).toHaveBeenCalledWith('user-1', '5');
  });

  it('toggles observer state and clears vote', async () => {
    const service = memberService;
    mockedUserRepository.updateObserverStatus.mockResolvedValue(userFixture);

    await service.toggleObserver('user-1', true);
    await service.toggleObserver('user-1', false);

    expect(userRepository.updateObserverStatus).toHaveBeenCalledWith('user-1', true);
    expect(userRepository.updateObserverStatus).toHaveBeenCalledWith('user-1', false);
  });

  it('retrieves user by id', async () => {
    const service = memberService;
    mockedUserRepository.findById.mockResolvedValue(userFixture);

    const user = await service.getById('user-1');

    expect(userRepository.findById).toHaveBeenCalledWith('user-1');
    expect(user).toEqual(userFixture);
  });
});
