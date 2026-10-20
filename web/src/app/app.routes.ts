import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('@features/home/home.component').then((module) => module.HomeComponent),
  },
  {
    path: 'feedback',
    canActivate: [
      () => import('@features/feedback/feedback.guard').then((module) => module.feedbackGuard),
    ],
    loadComponent: () =>
      import('@features/feedback/feedback.component').then((module) => module.FeedbackComponent),
  },
  {
    path: 'terms',
    data: { page: 'terms' },
    loadComponent: () =>
      import('@features/legal/legal-page.component').then((module) => module.LegalPageComponent),
  },
  {
    path: 'privacy',
    data: { page: 'privacy' },
    loadComponent: () =>
      import('@features/legal/legal-page.component').then((module) => module.LegalPageComponent),
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('@features/admin/feedback-admin.component').then(
        (module) => module.FeedbackAdminComponent,
      ),
  },
  {
    path: 'room',
    loadChildren: () => import('@features/room/room.routes').then((module) => module.ROOM_ROUTES),
  },
];
