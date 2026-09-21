import { Injectable, computed, signal } from '@angular/core';

import { Libro } from './libro';

/** Una linea de la seleccion: el libro elegido y cuantas copias. */
export interface LineaSeleccionada {
  libro: Libro;
  cantidad: number;
}

/**
 * La "bolsa" de libros que el usuario va eligiendo en el catalogo y que
 * despues envia en una sola solicitud.
 *
 * Vive SOLO en el navegador y no se guarda en ningun sitio: es un borrador. El
 * backend solo se entera cuando se envia el formulario. Se pierde al recargar,
 * y eso esta bien: no es informacion que valga la pena persistir.
 */
@Injectable({ providedIn: 'root' })
export class SeleccionService {

  private readonly lineas = signal<LineaSeleccionada[]>([]);

  readonly items = this.lineas.asReadonly();
  readonly cantidadTotal = computed(() => this.lineas().reduce((suma, l) => suma + l.cantidad, 0));
  readonly vacia = computed(() => this.lineas().length === 0);

  contiene(id: string): boolean {
    return this.lineas().some((l) => l.libro.id === id);
  }

  /** Anade el libro, o le suma una copia si ya estaba (tope de 3, como el backend). */
  agregar(libro: Libro): void {
    this.lineas.update((actuales) => {
      const existente = actuales.find((l) => l.libro.id === libro.id);
      if (!existente) {
        return [...actuales, { libro, cantidad: 1 }];
      }
      const tope = Math.min(3, libro.ejemplares);
      return actuales.map((l) =>
        l.libro.id === libro.id ? { ...l, cantidad: Math.min(tope, l.cantidad + 1) } : l,
      );
    });
  }

  quitar(id: string): void {
    this.lineas.update((actuales) => actuales.filter((l) => l.libro.id !== id));
  }

  vaciar(): void {
    this.lineas.set([]);
  }
}
