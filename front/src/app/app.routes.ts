import { Routes } from '@angular/router';

import { authGuard } from './auth/auth.guard';
import { Inicio } from './inicio';

/**
 * Rutas de la aplicacion.
 *
 * Solo /inicio es publica. Todo lo demas pasa por authGuard, porque todo lo
 * demas llama a la API y la API exige token: sin sesion, esas vistas solo
 * podrian mostrar errores 401.
 *
 * Los componentes se cargan con import() (lazy loading): el bundle inicial no
 * arrastra el catalogo ni el formulario, que es lo que ve alguien que todavia
 * no ha entrado.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },

  { path: 'inicio', component: Inicio, title: 'Biblioteca Duoc' },

  {
    path: 'catalogo',
    canActivate: [authGuard],
    title: 'Catalogo · Biblioteca Duoc',
    loadComponent: () => import('./catalogo/catalogo').then((m) => m.Catalogo),
  },
  {
    path: 'solicitud',
    canActivate: [authGuard],
    title: 'Nueva solicitud · Biblioteca Duoc',
    loadComponent: () => import('./solicitudes/formulario').then((m) => m.FormularioSolicitud),
  },
  {
    path: 'mis-solicitudes',
    canActivate: [authGuard],
    title: 'Mis solicitudes · Biblioteca Duoc',
    loadComponent: () => import('./solicitudes/mis-solicitudes').then((m) => m.MisSolicitudes),
  },
  {
    path: 'sesion',
    canActivate: [authGuard],
    title: 'Sesion · Biblioteca Duoc',
    loadComponent: () => import('./sesion/sesion').then((m) => m.Sesion),
  },

  { path: '**', redirectTo: 'inicio' },
];
