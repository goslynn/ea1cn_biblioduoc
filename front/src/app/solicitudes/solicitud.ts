/** Sedes donde se puede retirar el prestamo (enum Sede del backend). */
export const SEDES = ['SAN_JOAQUIN', 'PLAZA_OESTE', 'PUENTE_ALTO', 'VINA_DEL_MAR', 'CONCEPCION'] as const;
export type Sede = (typeof SEDES)[number];

/** Lo que se envia en POST /api/solicitudes (NuevaSolicitud.java). */
export interface NuevaSolicitud {
  items: { libroId: string; cantidad: number }[];
  dias: number;
  motivo: string;
  sede: Sede;
}

/** Una linea ya resuelta por el backend, con el titulo copiado del catalogo. */
export interface LineaSolicitud {
  libroId: string;
  titulo: string;
  autor: string;
  cantidad: number;
}

/** Lo que devuelve la API (Solicitud.java). */
export interface Solicitud {
  id: string;
  /** Sale del JWT (claim sub o client_id), no del formulario. */
  solicitante: string;
  estado: 'RECIBIDA' | 'APROBADA' | 'RECHAZADA';
  lineas: LineaSolicitud[];
  dias: number;
  motivo: string;
  sede: Sede;
  creadaEn: string;
  fechaDevolucion: string;
}

/** Cuerpo de error que devuelve ManejadorDeErrores del backend. */
export interface ErrorApi {
  status: number;
  error: string;
  mensaje: string;
  detalles: Record<string, string>;
}
