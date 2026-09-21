import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { SeleccionService } from './catalogo/seleccion.service';
import { SesionService } from './auth/sesion.service';

/** Marco de la aplicacion: cabecera, navegacion y estado de la sesion. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App implements OnInit {

  private readonly sesionService = inject(SesionService);
  readonly seleccion = inject(SeleccionService);
  readonly estado = this.sesionService.estado;

  /**
   * Al arrancar se pregunta por la sesion. Es tambien el momento en el que
   * Amplify detecta el "?code=" con el que Cognito devuelve al usuario tras el
   * login y lo canjea por los tokens.
   */
  ngOnInit(): void {
    void this.sesionService.refrescar();
  }

  entrar(): void {
    void this.sesionService.iniciarSesion();
  }

  salir(): void {
    this.seleccion.vaciar();
    void this.sesionService.cerrarSesion();
  }
}
