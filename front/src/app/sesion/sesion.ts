import { Component, OnInit, inject, signal } from '@angular/core';

import { awsConfig } from '../aws-config';
import { SesionService } from '../auth/sesion.service';

/**
 * Vista de diagnostico. No es una pantalla de negocio: existe para VER lo que
 * normalmente esta escondido.
 *
 * Muestra tres cosas, y cada una prueba algo distinto:
 *
 *   1. El access token y su payload decodificado -> se ve el claim "scope" con
 *      el custom scope, el "token_use": "access" y el "client_id". Es la
 *      diferencia entre id token y access token, mirandola de frente.
 *
 *   2. Una llamada MANUAL con fetch, poniendo la cabecera Authorization a
 *      mano. Es redundante teniendo el interceptor, y es deliberado: hasta que
 *      no ves la cabecera escrita a mano, el interceptor parece magia.
 *
 *   3. La misma llamada SIN cabecera: responde 401. Ese 401 lo produce API
 *      Gateway antes de invocar la Lambda.
 */
@Component({
  selector: 'app-sesion',
  templateUrl: './sesion.html',
})
export class Sesion implements OnInit {

  private readonly sesionService = inject(SesionService);

  readonly estado = this.sesionService.estado;
  readonly payload = signal<string>('');
  readonly resultadoManual = signal<string>('');
  readonly resultadoSinToken = signal<string>('');
  readonly config = awsConfig;

  async ngOnInit(): Promise<void> {
    const estado = await this.sesionService.refrescar();
    const payload = this.sesionService.payloadDelToken(estado.accessToken);
    this.payload.set(payload ? JSON.stringify(payload, null, 2) : '');
  }

  /** Consumo manual: la cabecera se escribe aqui, sin interceptor de por medio. */
  async llamarConTokenAMano(): Promise<void> {
    this.resultadoManual.set('llamando…');
    try {
      const respuesta = await fetch(`${awsConfig.apiBaseUrl}/api/libros`, {
        headers: { Authorization: `Bearer ${this.estado().accessToken}` },
      });
      const cuerpo = await respuesta.text();
      this.resultadoManual.set(`HTTP ${respuesta.status}\n${this.recortar(cuerpo)}`);
    } catch (e) {
      this.resultadoManual.set(`Sin respuesta: ${(e as Error).message}\n(mira la pestana Network: suele ser CORS)`);
    }
  }

  /** La misma peticion sin credencial: el 401 lo da API Gateway. */
  async llamarSinToken(): Promise<void> {
    this.resultadoSinToken.set('llamando…');
    try {
      const respuesta = await fetch(`${awsConfig.apiBaseUrl}/api/libros`);
      const cuerpo = await respuesta.text();
      this.resultadoSinToken.set(`HTTP ${respuesta.status}\n${this.recortar(cuerpo)}`);
    } catch (e) {
      this.resultadoSinToken.set(`Sin respuesta: ${(e as Error).message}`);
    }
  }

  private recortar(texto: string): string {
    return texto.length > 400 ? `${texto.slice(0, 400)}…` : texto;
  }
}
