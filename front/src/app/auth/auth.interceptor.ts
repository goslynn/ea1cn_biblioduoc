import { HttpInterceptorFn } from '@angular/common/http';
import { fetchAuthSession } from 'aws-amplify/auth';
import { from, switchMap } from 'rxjs';

/**
 * Anade "Authorization: Bearer <access_token>" a TODA peticion de HttpClient.
 *
 * Por que un interceptor y no ponerlo en cada servicio:
 *   * un solo sitio decide como se autentica la aplicacion;
 *   * los servicios de negocio no saben nada de tokens;
 *   * si manana cambia el esquema de autenticacion, cambia este archivo y ya.
 *
 * Ojo con la diferencia respecto de un Guard: el Guard controla la NAVEGACION
 * (que rutas puede abrir el usuario) y este interceptor controla las LLAMADAS
 * HTTP. Son cosas distintas, y ninguna de las dos protege la API: eso lo hacen
 * API Gateway y Spring Security, en el servidor.
 *
 * Si no hay sesion, la peticion sale SIN cabecera a proposito: asi el 401 lo
 * da el servidor y se ve en la pestana Network, en vez de que el frontend
 * disimule el problema.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) =>
  from(fetchAuthSession()).pipe(
    switchMap((sesion) => {
      const token = sesion.tokens?.accessToken?.toString();
      if (!token) {
        return next(req);
      }
      return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
    }),
  );
