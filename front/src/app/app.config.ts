import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';

import { authInterceptor } from './auth/auth.interceptor';
import { routes } from './app.routes';

/**
 * Configuracion de la aplicacion.
 *
 * >>> DOS DETALLES QUE HAY QUE MIRAR DOS VECES <<<
 *
 * 1. provideHttpClient(withInterceptors([...])) va DENTRO del array providers.
 *    Si se cierra el objeto antes, el archivo compila, la aplicacion arranca y
 *    el interceptor NO se registra: las peticiones salen sin Bearer y todo
 *    responde 401. Es el error que la guia del curso marca dos veces.
 *
 * 2. withHashLocation(): las rutas viven detras de "#" (…/index.html#/catalogo).
 *    El sitio se sirve desde el endpoint REST de S3, que devuelve los objetos
 *    que existen y nada mas: si la ruta fuera /catalogo, S3 respondaria 404 al
 *    recargar la pagina. El "website endpoint" de S3 si sabe redirigir a
 *    index.html, pero es HTTP puro y Cognito rechaza callbacks sin TLS.
 *    Con CloudFront delante se podria volver a rutas limpias.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    provideHttpClient(
      withInterceptors([authInterceptor]),
    ),
  ],
};
