package cl.duoc.biblioteca.solicitudes;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

/**
 * Una linea del formulario: que libro y cuantas copias.
 *
 * Es la parte que hace que una solicitud pueda pedir VARIOS libros de una vez,
 * que es el requisito del caso.
 *
 * @param libroId id del catalogo, formato "L-001"; debe existir
 * @param cantidad copias pedidas de ese titulo, entre 1 y 3
 */
public record ItemSolicitado(
        @NotBlank(message = "cada item debe indicar el libroId")
        String libroId,

        @Min(value = 1, message = "la cantidad minima por titulo es 1")
        @Max(value = 3, message = "no se prestan mas de 3 copias del mismo titulo")
        int cantidad) {
}
