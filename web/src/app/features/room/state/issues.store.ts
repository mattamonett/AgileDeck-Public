import { computed, effect, inject, untracked, DestroyRef } from '@angular/core';
import {
  signalStore,
  withState,
  withComputed,
  withMethods,
  withHooks,
  patchState,
} from '@ngrx/signals';
import {
  GameEvents,
  IssueStatus,
  type Issue,
  IssuePageSchema,
  IssueListSchema,
  ImportIssuesResultSchema,
  ClosedIssuesResultSchema,
  type CreateIssueInput,
  type UpdateIssueInput,
  type TransferIssue,
} from '@poker/shared';
import { PokerStore } from './poker.store';
import { SocketService } from '@core/socket/socket.service';
import { apiErrorMessage } from '@core/api/api-request';
import { SiteConfigService } from '@core/config/site-config.service';

interface IssuesState {
  issues: Issue[];
  activeIssue: Issue | null;
  loading: boolean;
  saving: boolean;
  error: string;
  page: number;
  nextCursor: string | null;
  _cursors: (string | null)[];
}

const initialState: IssuesState = {
  issues: [],
  activeIssue: null,
  loading: false,
  saving: false,
  error: '',
  page: 1,
  nextCursor: null,
  _cursors: [null],
};

// Provided by the issue panel so requests and listeners follow the room view's lifetime.
export const IssuesStore = signalStore(
  withState(initialState),
  withComputed((_store, poker = inject(PokerStore), site = inject(SiteConfigService)) => ({
    // No context while the site has issues off, so nothing asks the API for them.
    context: computed(
      () => {
        const roomId = poker.currentRoom()?.id;
        const user = poker.currentUser();
        return roomId && user?.isApproved && poker.isConnected() && site.config().features.issues
          ? { roomId, userId: user.id }
          : null;
      },
      { equal: (a, b) => a?.roomId === b?.roomId && a?.userId === b?.userId },
    ),
  })),
  withMethods((store, sockets = inject(SocketService)) => {
    let generation = 0;
    let contextGeneration = 0;
    let controller: AbortController | undefined;
    function url(context: { roomId: string; userId: string }, id?: string) {
      return `${sockets.getApiUrl()}/api/rooms/${encodeURIComponent(context.roomId)}/issues${id ? '/' + encodeURIComponent(id) : ''}?userId=${encodeURIComponent(context.userId)}`;
    }

    async function refresh() {
      const context = store.context();
      if (!context) return;
      const requestGeneration = ++generation;
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      const timeout = setTimeout(() => requestController.abort(), 15_000);
      patchState(store, { loading: true });
      try {
        const cursor = store._cursors()[store.page() - 1];
        const response = await fetch(
          url(context) + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''),
          {
            credentials: 'include',
            cache: 'no-store',
            signal: requestController.signal,
          },
        );
        if (!response.ok) throw new Error(await message(response));
        const data = IssuePageSchema.parse(await response.json());
        if (requestGeneration !== generation) return;
        patchState(store, {
          issues: data.issues,
          activeIssue: data.activeIssue,
          nextCursor: data.nextCursor,
          error: '',
        });
        // Deleting the last root on a page returns to the preceding page.
        if (!data.issues.length && store.page() > 1) {
          patchState(store, { page: store.page() - 1 });
          void refresh();
        }
      } catch (error) {
        if (requestGeneration === generation)
          patchState(store, {
            error:
              error instanceof Error && error.name !== 'AbortError'
                ? error.message
                : 'Could not load issues. Please retry.',
          });
      } finally {
        clearTimeout(timeout);
        if (requestGeneration === generation) patchState(store, { loading: false });
      }
    }

    function next() {
      if (!store.nextCursor() || store.loading()) return;
      patchState(store, {
        _cursors: [...store._cursors().slice(0, store.page()), store.nextCursor()],
        page: store.page() + 1,
      });
      void refresh();
    }
    function previous() {
      if (store.page() <= 1 || store.loading()) return;
      patchState(store, { page: store.page() - 1 });
      void refresh();
    }

    async function mutate(
      method: 'POST' | 'PUT' | 'DELETE',
      input: CreateIssueInput | UpdateIssueInput = {},
      id?: string,
    ) {
      return send(method, id, method === 'DELETE' ? undefined : input, () => {
        if (method === 'POST' && !('parentId' in input))
          patchState(store, { page: 1, _cursors: [null] });
      });
    }

    // Each issue switch starts a fresh round so votes always belong to the heading.
    async function startVoting(id: string) {
      if (await mutate('PUT', { status: IssueStatus.IN_PROGRESS }, id)) sockets.reset();
    }

    async function startNext() {
      if ((await send('POST', 'next')) && store.activeIssue()) sockets.reset();
    }

    async function send(
      method: 'POST' | 'PUT' | 'DELETE',
      id?: string,
      body?: CreateIssueInput | UpdateIssueInput,
      beforeRefresh?: () => void,
    ) {
      const context = store.context();
      if (!context || store.saving()) return false;
      const mutationGeneration = contextGeneration;
      patchState(store, { saving: true });
      patchState(store, { error: '' });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(url(context, id), {
          method,
          credentials: 'include',
          signal: controller.signal,
          ...(body === undefined
            ? {}
            : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        });
        if (!response.ok) throw new Error(await message(response));
        if (
          mutationGeneration !== contextGeneration ||
          store.context()?.roomId !== context.roomId ||
          store.context()?.userId !== context.userId
        )
          return false;
        beforeRefresh?.();
        await refresh();
        return true;
      } catch (error) {
        if (mutationGeneration !== contextGeneration) return false;
        patchState(store, {
          error:
            error instanceof Error && error.name !== 'AbortError'
              ? error.message
              : 'The request timed out. Refresh to check whether the change was saved before retrying.',
        });
        return false;
      } finally {
        clearTimeout(timeout);
        if (mutationGeneration === contextGeneration) patchState(store, { saving: false });
      }
    }

    /** Counts closed issues across every page so the confirmation can name the total. */
    async function countClosed(): Promise<number> {
      const context = store.context();
      if (!context) throw new Error('Connect to the room before clearing issues.');
      const response = await fetch(url(context, 'closed'), {
        credentials: 'include',
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(await message(response));
      return ClosedIssuesResultSchema.parse(await response.json()).count;
    }

    async function clearClosed() {
      return send('DELETE', 'closed', undefined, () =>
        patchState(store, { page: 1, _cursors: [null] }),
      );
    }

    async function loadExport(): Promise<Issue[]> {
      const context = store.context();
      if (!context) throw new Error('Connect to the room before exporting.');
      const response = await fetch(url(context, 'export'), {
        credentials: 'include',
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(await message(response));
      const issues = IssueListSchema.parse(await response.json());
      if (store.context() !== context) throw new Error('The room changed. Open export again.');
      return issues;
    }

    async function importAll(issues: TransferIssue[]): Promise<number> {
      const context = store.context();
      if (!context || store.saving()) throw new Error('Wait until the room is ready.');
      const mutationGeneration = contextGeneration;
      patchState(store, { saving: true });
      try {
        const response = await fetch(url(context, 'import'), {
          method: 'POST',
          credentials: 'include',
          signal: AbortSignal.timeout(20_000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(issues),
        });
        if (!response.ok) throw new Error(await message(response));
        const result = ImportIssuesResultSchema.parse(await response.json());
        if (mutationGeneration !== contextGeneration || store.context() !== context)
          throw new Error('The room changed during import. Check the original room.');
        patchState(store, { page: 1, _cursors: [null] });
        await refresh();
        return result.count;
      } finally {
        if (mutationGeneration === contextGeneration) patchState(store, { saving: false });
      }
    }

    async function message(response: Response) {
      return (
        apiErrorMessage(await response.json().catch(() => null)) ??
        `Could not complete the request (${response.status}). Please retry.`
      );
    }
    return {
      countClosed,
      clearClosed,
      loadExport,
      importAll,
      refresh,
      next,
      previous,
      mutate,
      startVoting,
      startNext,
      _cancelLoad() {
        contextGeneration++;
        generation++;
        controller?.abort();
      },
      _reset() {
        contextGeneration++;
        generation++;
        controller?.abort();
        patchState(store, {
          issues: [],
          activeIssue: null,
          page: 1,
          _cursors: [null],
          nextCursor: null,
          loading: false,
          saving: false,
          error: '',
        });
      },
    };
  }),
  withHooks({
    onInit(store) {
      effect(() => {
        const context = store.context();
        untracked(() => {
          store._reset();
          if (context) void store.refresh();
        });
      });
      const socket = inject(SocketService).getSocket();
      const changed = (event: { roomId: string }) => {
        if (event.roomId === store.context()?.roomId) void store.refresh();
      };
      const joined = () => {
        if (store.context()) void store.refresh();
      };
      socket.on(GameEvents.ISSUES_CHANGED, changed);
      socket.on(GameEvents.JOINED, joined);
      inject(DestroyRef).onDestroy(() => {
        socket.off(GameEvents.ISSUES_CHANGED, changed);
        socket.off(GameEvents.JOINED, joined);
      });
    },
    onDestroy(store) {
      store._cancelLoad();
    },
  }),
);
