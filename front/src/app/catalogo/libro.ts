/** Un libro tal como lo devuelve GET /api/libros (ver Libro.java en el backend). */
export interface Libro {
  id: string;
  titulo: string;
  autor: string;
  genero: string;
  anio: number;
  isbn: string;
  ejemplares: number;
  ubicacion: string;
  sinopsis: string;
  /** Campo calculado por el backend: ejemplares > 0 */
  disponible: boolean;
}
