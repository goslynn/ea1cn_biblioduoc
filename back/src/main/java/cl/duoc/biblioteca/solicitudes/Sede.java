package cl.duoc.biblioteca.solicitudes;

/**
 * Sedes donde se puede retirar el prestamo.
 *
 * Es un enum a proposito: si el cliente manda una sede que no existe, Jackson
 * falla al deserializar y ManejadorDeErrores lo convierte en un 400 con el
 * detalle, en vez de aceptar basura. Validar en el borde sale mas barato que
 * limpiarla despues.
 */
public enum Sede {
    SAN_JOAQUIN,
    PLAZA_OESTE,
    PUENTE_ALTO,
    VINA_DEL_MAR,
    CONCEPCION
}
