package cl.duoc.biblioteca.solicitudes;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.stereotype.Component;

/**
 * El "almacen" de solicitudes: un mapa en memoria. No hay base de datos.
 *
 * >>> LIMITACION REAL, DECLARADA <<<
 *   Este estado vive dentro del proceso. En AWS Lambda eso significa que:
 *
 *     * se PIERDE en cada arranque en frio (cuando AWS recicla el entorno de
 *       ejecucion, cosa que pasa sola tras unos minutos sin trafico);
 *     * NO se comparte entre instancias concurrentes: si AWS levanta una
 *       segunda copia de la funcion, esa copia arranca con el mapa vacio.
 *
 *   Se mitiga —no se resuelve— con ReservedConcurrentExecutions: 1 en
 *   aws/backend.yaml, que obliga a que exista una sola instancia a la vez.
 *   La solucion de verdad es persistencia (DynamoDB o RDS), y esta descrita
 *   como extension en el README. Para el alcance de esta evaluacion el
 *   requisito es explicito: gestion en memoria.
 *
 * ConcurrentHashMap y AtomicLong porque Tomcat atiende varias peticiones en
 * paralelo: aunque haya una sola instancia de Lambda, puede haber mas de un
 * hilo dentro.
 */
@Component
public class SolicitudesEnMemoria {

    private final Map<String, Solicitud> porId = new ConcurrentHashMap<>();
    private final AtomicLong correlativo = new AtomicLong(0);

    /**
     * Crea y guarda la solicitud. El id, el estado, la fecha de creacion y la
     * de devolucion los pone el servidor; el cliente no los puede falsear.
     */
    public Solicitud crear(String solicitante, NuevaSolicitud formulario, List<LineaSolicitud> lineas) {
        Instant ahora = Instant.now();
        String id = String.format("SOL-%04d", correlativo.incrementAndGet());

        Solicitud solicitud = new Solicitud(
                id,
                solicitante,
                EstadoSolicitud.RECIBIDA,
                lineas,
                formulario.dias(),
                formulario.motivo(),
                formulario.sede(),
                ahora,
                LocalDate.ofInstant(ahora, ZoneOffset.UTC).plusDays(formulario.dias()));

        porId.put(id, solicitud);
        return solicitud;
    }

    /** Todas las solicitudes, de la mas reciente a la mas antigua. */
    public List<Solicitud> todas() {
        return porId.values().stream()
                .sorted(Comparator.comparing(Solicitud::creadaEn).reversed())
                .toList();
    }

    /** Las de un estado concreto, mismo orden. */
    public List<Solicitud> porEstado(EstadoSolicitud estado) {
        return todas().stream().filter(s -> s.estado() == estado).toList();
    }

    /** Las de un solicitante concreto: es lo que alimenta la vista "mis solicitudes". */
    public List<Solicitud> deSolicitante(String solicitante) {
        return todas().stream().filter(s -> s.solicitante().equals(solicitante)).toList();
    }

    public Optional<Solicitud> buscar(String id) {
        return Optional.ofNullable(porId.get(id));
    }

    /** Cuantas hay guardadas ahora mismo. Lo usa la vista de sesion del frontend. */
    public int cantidad() {
        return porId.size();
    }
}
