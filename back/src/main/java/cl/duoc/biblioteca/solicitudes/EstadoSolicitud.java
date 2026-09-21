package cl.duoc.biblioteca.solicitudes;

/** Ciclo de vida de una solicitud de prestamo. */
public enum EstadoSolicitud {
    /** Recien creada; el equipo de biblioteca todavia no la revisa. */
    RECIBIDA,
    /** Aprobada: los libros quedan reservados para el solicitante. */
    APROBADA,
    /** Rechazada por el equipo de biblioteca. */
    RECHAZADA
}
