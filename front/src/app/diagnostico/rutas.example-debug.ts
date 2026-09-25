// La version ENCENDIDA de diagnostico/rutas.ts: la que genera
// aws/pipeline/publish-web.sh cuando se le pasa DEBUG=true.
//
// Esta aqui por dos motivos: para poder encender la vista en local sin
// desplegar (copiandola a diagnostico/rutas.ts) y para que el generador del
// pipeline tenga un original legible contra el que compararse.
//
// No la dejes copiada al publicar: esta pantalla ensena el access token en
// claro. Ver diagnostico/diagnostico.ts.
import { Routes } from '@angular/router';

import { authGuard } from '../auth/auth.guard';

export const rutasDiagnostico: Routes = [
  {
    path: 'diagnostico',
    canActivate: [authGuard],
    title: 'Diagnostico · Biblioteca Duoc',
    loadComponent: () => import('./diagnostico').then((m) => m.Diagnostico),
  },
];
