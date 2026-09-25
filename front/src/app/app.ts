import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

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
  private readonly router = inject(Router);
  readonly seleccion = inject(SeleccionService);
  readonly estado = this.sesionService.estado;

  /**
   * Al arrancar se pregunta por la sesion. Es tambien el momento en el que
   * Amplify detecta el "?code=" con el que Cognito devuelve al usuario tras el
   * login y lo canjea por los tokens.
   *
   * Si la sesion ya viene autenticada y seguimos en la portada (recien
   * vueltos del Hosted UI), se salta directo al catalogo: la portada solo
   * tiene sentido para quien todavia no ha entrado.
   */
  async ngOnInit(): Promise<void> {
    const sesion = await this.sesionService.refrescar();
    if (sesion.autenticado && this.router.url.startsWith('/inicio')) {
      void this.router.navigateByUrl('/catalogo');
    }
  }

  entrar(): void {
    void this.sesionService.iniciarSesion();
  }

  registrarse(): void {
    void this.sesionService.registrarse();
  }

  salir(): void {
    this.seleccion.vaciar();
    void this.sesionService.cerrarSesion();
  }
}
