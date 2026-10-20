import type { Routes } from '@angular/router';

export const ROOM_ROUTES: Routes = [
  {
    path: ':id/stats',
    loadComponent: () =>
      import('./room-stats/room-stats.component').then((module) => module.RoomStatsComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./room-page/room-page.component').then((module) => module.RoomPageComponent),
  },
];
