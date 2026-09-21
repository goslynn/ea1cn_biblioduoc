package cl.duoc.biblioteca.solicitudes;

/**
 * Una linea YA RESUELTA de la solicitud: al crearla, el servidor busca cada
 * libroId en el catalogo y copia el titulo y el autor.
 *
 * Se guarda una copia en vez de una referencia para que la solicitud siga
 * siendo legible aunque el catalogo cambie en un despliegue posterior: la
 * solicitud es un documento historico de lo que se pidio ese dia.
 */
public record LineaSolicitud(
        String libroId,
        String titulo,
        String autor,
        int cantidad) {
}
