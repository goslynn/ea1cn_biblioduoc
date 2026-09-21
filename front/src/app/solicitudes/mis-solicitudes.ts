import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Solicitud } from './solicitud';
import { SolicitudesService } from './solicitudes.service';

/**
 * Las solicitudes del usuario que tiene la sesion abierta.
 *
 * El filtro "mias" lo aplica el BACKEND comparando con el sujeto del token: el
 * frontend no manda ningun identificador de usuario, porque un identificador
 * enviado por el cliente es un identificador que el cliente puede cambiar.
 */
@Component({
  selector: 'app-mis-solicitudes',
  imports: [RouterLink],
  templateUrl: './mis-solicitudes.html',
})
export class MisSolicitudes implements OnInit {

  private readonly solicitudes = inject(SolicitudesService);

  readonly lista = signal<Solicitud[]>([]);
  readonly cargando = signal(false);
  readonly error = signal('');

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set('');
    this.solicitudes.mias().subscribe({
      next: (solicitudes) => {
        this.lista.set(solicitudes);
        this.cargando.set(false);
      },
      error: (fallo) => {
        this.error.set(`HTTP ${fallo.status}: no se pudieron cargar las solicitudes.`);
        this.cargando.set(false);
      },
    });
  }
}
