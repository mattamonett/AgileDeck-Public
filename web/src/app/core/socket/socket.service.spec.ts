import { TestBed } from '@angular/core/testing';
import { DefaultUrlSerializer, NavigationCancel, NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { GameEvents, SocketEvents } from '@poker/shared';
import { SocketService } from './socket.service';
import type { Socket } from 'socket.io-client';
import { USER_NAME_STORAGE_KEY } from '../storage/storage-keys';

describe('room navigation membership', () => {
  let service: SocketService;
  let socket: Socket;
  let events: Subject<NavigationEnd | NavigationCancel>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    events = new Subject();
    const serializer = new DefaultUrlSerializer();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: {
            events,
            parseUrl: (url: string) => serializer.parse(url),
          },
        },
      ],
    });
    service = TestBed.inject(SocketService);
    socket = service.getSocket();
    vi.spyOn(socket, 'connect').mockReturnValue(socket);
    vi.spyOn(socket, 'emit').mockReturnValue(socket);
    socket.connected = true;
    service.joinRoom('test-room', 'Tester');
    vi.mocked(socket.emit).mockClear();
  });

  afterEach(() => {
    socket.connected = false;
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function navigate(url: string) {
    events.next(new NavigationEnd(1, url, url));
  }

  it('keeps membership through stats, feedback, and the return to the board', () => {
    for (const url of [
      '/room/test-room/stats?page=2',
      '/feedback?from=test-room',
      '/room/test-room',
    ]) {
      navigate(url);
      expect(service.isInRoom('test-room')).toBe(true);
      expect(socket.emit).not.toHaveBeenCalled();
    }
  });

  it.each(['/', '/feedback', '/feedback?from=another-room', '/room/another-room/stats'])(
    'leaves the retained room when navigating to %s',
    (url) => {
      navigate('/room/test-room/stats');
      navigate(url);
      expect(socket.emit).toHaveBeenCalledExactlyOnceWith(SocketEvents.LEAVE_ROOM);
      expect(service.isInRoom('test-room')).toBe(false);
    },
  );

  it('does not leave on cancelled navigation', () => {
    events.next(new NavigationCancel(1, '/', 'guard rejected navigation'));
    expect(service.isInRoom('test-room')).toBe(true);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('leaves the old room before joining a different room', () => {
    service.joinRoom('another-room', 'Tester');
    navigate('/room/another-room');
    expect(socket.emit).toHaveBeenNthCalledWith(1, SocketEvents.LEAVE_ROOM);
    expect(socket.emit).toHaveBeenNthCalledWith(
      2,
      SocketEvents.JOIN_ROOM,
      expect.objectContaining({ roomId: 'another-room' }),
    );
    expect(service.isInRoom('another-room')).toBe(true);
  });

  it('reopens a socket the server closed for idling outside a room before joining', async () => {
    await vi.waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(1));
    navigate('/');
    socket.connected = false;
    expect(socket.active).toBe(false);
    service.joinRoom('another-room', 'Tester');
    expect(socket.connect).toHaveBeenCalledTimes(2);
  });

  it('keeps a new name only after the server accepts it', () => {
    localStorage.setItem(USER_NAME_STORAGE_KEY, 'Tester');
    const reconnect = () => {
      for (const listener of socket.listeners('connect')) listener();
    };

    service.updateUser('Matt');
    expect(localStorage.getItem(USER_NAME_STORAGE_KEY)).toBe('Tester');
    reconnect();
    expect(socket.emit).toHaveBeenLastCalledWith(
      SocketEvents.JOIN_ROOM,
      expect.objectContaining({ userName: 'Tester' }),
    );

    for (const listener of socket.listeners(GameEvents.USER_UPDATED)) {
      listener({
        id: 'user-1',
        name: 'Tess',
        hasVoted: false,
        vote: null,
        isObserver: false,
        isApproved: true,
      });
    }
    expect(localStorage.getItem(USER_NAME_STORAGE_KEY)).toBe('Tess');
    reconnect();
    expect(socket.emit).toHaveBeenLastCalledWith(
      SocketEvents.JOIN_ROOM,
      expect.objectContaining({ userName: 'Tess' }),
    );
  });
});
