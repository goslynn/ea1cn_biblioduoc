package cl.duoc.biblioteca.solicitudes;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * El cuerpo del formulario de solicitud: lo que manda el frontend en el POST.
 *
 * Es un DTO de ENTRADA distinto de {@link Solicitud} a proposito. El cliente
 * decide que pide; el servidor decide el id, el estado, la fecha de devolucion
 * y —sobre todo— QUIEN solicita (eso sale del JWT, nunca del formulario: si
 * viniera en el cuerpo, cualquiera podria pedir libros a nombre de otro).
 *
 * Todas las anotaciones de validacion producen un 400 con el detalle del campo
 * que fallo. Ver ManejadorDeErrores.
 *
 * @param items   libros pedidos; al menos uno
 * @param dias    dias de prestamo, entre 1 y 30
 * @param motivo  para que se necesitan; minimo 10 caracteres para que sea util
 * @param sede    donde se retiran
 */
public record NuevaSolicitud(

        @NotEmpty(message = "hay que pedir al menos un libro")
        @Size(max = 5, message = "no se pueden pedir mas de 5 titulos en una misma solicitud")
        List<@Valid ItemSolicitado> items,

        @Min(value = 1, message = "el prestamo minimo es de 1 dia")
        @Max(value = 30, message = "el prestamo maximo es de 30 dias")
        int dias,

        @NotNull(message = "el motivo es obligatorio")
        @Size(min = 10, max = 300, message = "el motivo debe tener entre 10 y 300 caracteres")
        String motivo,

        @NotNull(message = "hay que indicar la sede de retiro")
        Sede sede) {
}
