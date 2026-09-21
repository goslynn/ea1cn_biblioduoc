import { Component, inject } from '@angular/core';

import { SesionService } from './auth/sesion.service';

/** Portada publica: lo unico que se puede ver sin iniciar sesion. */
@Component({
  selector: 'app-inicio',
  templateUrl: './inicio.html',
})
export class Inicio {
  private readonly sesion = inject(SesionService);

  entrar(): void {
    void this.sesion.iniciarSesion();
  }
}
