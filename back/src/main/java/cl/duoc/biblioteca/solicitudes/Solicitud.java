package cl.duoc.biblioteca.solicitudes;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Una solicitud de prestamo ya creada. Es lo que devuelve la API.
 *
 * @param id               correlativo generado por el servidor, formato "SOL-0001"
 * @param solicitante      sacado del JWT (claim "sub" o "client_id"), NO del formulario
 * @param estado           ver {@link EstadoSolicitud}
 * @param lineas           libros pedidos, con su titulo resuelto desde el catalogo
 * @param dias             dias de prestamo solicitados
 * @param motivo           texto libre del formulario
 * @param sede             donde se retira
 * @param creadaEn         instante de creacion, en UTC
 * @param fechaDevolucion  creadaEn + dias; se calcula aqui para que el frontend no repita la regla
 */
public record Solicitud(
        String id,
        String solicitante,
        EstadoSolicitud estado,
        List<LineaSolicitud> lineas,
        int dias,
        String motivo,
        Sede sede,
        Instant creadaEn,
        LocalDate fechaDevolucion) {
}
