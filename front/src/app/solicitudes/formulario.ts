import { KeyValuePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { SeleccionService } from '../catalogo/seleccion.service';
import { ErrorApi, SEDES, Sede, Solicitud } from './solicitud';
import { SolicitudesService } from './solicitudes.service';

/**
 * El formulario de solicitud: los libros elegidos en el catalogo, mas los
 * datos del prestamo.
 *
 * Las validaciones de aqui son las MISMAS que las del backend, y esta bien que
 * esten duplicadas: la del navegador es comodidad (avisa antes de gastar una
 * peticion) y la del servidor es la que manda. Si solo estuviera la del
 * navegador, bastaria con un curl para saltarsela.
 */
@Component({
  selector: 'app-formulario-solicitud',
  imports: [FormsModule, RouterLink, KeyValuePipe],
  templateUrl: './formulario.html',
})
export class FormularioSolicitud {

  readonly seleccion = inject(SeleccionService);
  private readonly solicitudes = inject(SolicitudesService);

  readonly sedes = SEDES;

  dias = 14;
  motivo = '';
  sede: Sede = 'SAN_JOAQUIN';

  readonly enviando = signal(false);
  readonly creada = signal<Solicitud | null>(null);
  readonly error = signal('');
  readonly detalles = signal<Record<string, string>>({});

  get motivoValido(): boolean {
    return this.motivo.trim().length >= 10 && this.motivo.trim().length <= 300;
  }

  get diasValidos(): boolean {
    return this.dias >= 1 && this.dias <= 30;
  }

  get puedeEnviar(): boolean {
    return !this.seleccion.vacia() && this.motivoValido && this.diasValidos && !this.enviando();
  }

  enviar(): void {
    this.enviando.set(true);
    this.error.set('');
    this.detalles.set({});

    this.solicitudes.crear({
      items: this.seleccion.items().map((l) => ({ libroId: l.libro.id, cantidad: l.cantidad })),
      dias: this.dias,
      motivo: this.motivo.trim(),
      sede: this.sede,
    }).subscribe({
      next: (solicitud) => {
        this.creada.set(solicitud);
        this.seleccion.vaciar();
        this.motivo = '';
        this.enviando.set(false);
      },
      error: (fallo) => {
        const cuerpo = fallo.error as ErrorApi | undefined;
        this.error.set(this.describir(fallo.status, cuerpo?.mensaje));
        this.detalles.set(cuerpo?.detalles ?? {});
        this.enviando.set(false);
      },
    });
  }

  otraSolicitud(): void {
    this.creada.set(null);
  }

  /** Cada codigo tiene una causa distinta y se diagnostica distinto. */
  private describir(status: number, mensaje?: string): string {
    switch (status) {
      case 0:   return 'No hubo respuesta (error de red o de CORS). Mira la pestana Network.';
      case 400: return `HTTP 400: el formulario no paso la validacion del servidor. ${mensaje ?? ''}`;
      case 401: return 'HTTP 401: el token falta, no es valido, o no trae el scope que exige la API. Vuelve a iniciar sesion.';
      case 403: return 'HTTP 403: el gateway no reconoce esa ruta. Si la ruta es correcta, revisa el scope del token.';
      case 404: return `HTTP 404: ${mensaje ?? 'alguno de los libros ya no esta en el catalogo.'}`;
      case 409: return `HTTP 409: ${mensaje ?? 'no quedan ejemplares suficientes.'}`;
      default:  return `HTTP ${status}: no se pudo enviar la solicitud.`;
    }
  }
}
