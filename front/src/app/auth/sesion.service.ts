import { Injectable, signal } from '@angular/core';
import {
  fetchAuthSession,
  getCurrentUser,
  signInWithRedirect,
  signOut,
} from 'aws-amplify/auth';

/** Lo que la aplicacion necesita saber de la sesion actual. */
export interface EstadoSesion {
  autenticado: boolean;
  usuario: string;
  accessToken: string;
}

const SIN_SESION: EstadoSesion = { autenticado: false, usuario: '', accessToken: '' };

/**
 * Unico punto de la aplicacion que habla con Amplify Auth.
 *
 * El resto de componentes leen la senal {@link estado} y no saben nada de
 * Cognito: si manana se cambiara de proveedor de identidad, solo cambiaria
 * este archivo.
 */
@Injectable({ providedIn: 'root' })
export class SesionService {

  /** Senal de solo lectura con la sesion vigente. */
  readonly estado = signal<EstadoSesion>(SIN_SESION);

  /**
   * Manda al usuario a la Hosted UI de Cognito.
   *
   * A partir de aqui el navegador sale de la aplicacion: se autentica en
   * Cognito y vuelve al redirectUrl con "?code=...". Amplify detecta ese code
   * al arrancar, lo canjea por los tokens (PKCE) y los guarda. Por eso la
   * aplicacion, al volver, ya tiene sesion sin haber hecho nada mas.
   */
  async iniciarSesion(): Promise<void> {
    await signInWithRedirect();
  }

  async cerrarSesion(): Promise<void> {
    this.estado.set(SIN_SESION);
    await signOut();
  }

  /**
   * Refresca la senal leyendo la sesion de Amplify.
   *
   * SE PIDE EL ACCESS TOKEN, no el id token. El id token dice QUIEN eres; el
   * access token dice A QUE tienes derecho, y es el unico que lleva el claim
   * "scope" que exigen API Gateway y Spring. Mandar el id token es el error
   * numero uno con esta arquitectura, y aqui se responde con un 401.
   */
  async refrescar(): Promise<EstadoSesion> {
    try {
      const sesion = await fetchAuthSession();
      const token = sesion.tokens?.accessToken?.toString() ?? '';
      if (!token) {
        this.estado.set(SIN_SESION);
        return SIN_SESION;
      }
      const usuario = await getCurrentUser();
      const nuevo: EstadoSesion = {
        autenticado: true,
        usuario: usuario.signInDetails?.loginId ?? usuario.username,
        accessToken: token,
      };
      this.estado.set(nuevo);
      return nuevo;
    } catch {
      // No hay sesion: no es un error, es el estado normal antes del login.
      this.estado.set(SIN_SESION);
      return SIN_SESION;
    }
  }

  /**
   * Decodifica el payload del JWT para mostrarlo en pantalla.
   *
   * Es un fin PEDAGOGICO: sirve para VER que trae el token (token_use,
   * client_id, scope, exp). No valida nada, y no debe usarse para decidir
   * permisos: un JWT se lee sin la clave, pero solo se puede CONFIAR en el
   * despues de verificar su firma, y eso ocurre en API Gateway y en Spring.
   */
  payloadDelToken(token: string): Record<string, unknown> | null {
    const partes = token.split('.');
    if (partes.length !== 3) {
      return null;
    }
    try {
      const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(base64)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
