package cl.duoc.biblioteca.web;

import java.time.Instant;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sonda de vida. Es el UNICO endpoint sin autenticacion.
 *
 * POR QUE EXISTE
 *   El AWS Lambda Web Adapter no da por arrancada la aplicacion hasta que una
 *   ruta le responde 2xx (variable AWS_LWA_READINESS_CHECK_PATH en
 *   aws/backend.yaml). Con Spring Security activo, cualquier ruta de /api
 *   responderia 401 a esa sonda y el arranque se consideraria fallido.
 *
 * POR QUE NO ES UN AGUJERO
 *   No se publica en API Gateway: api.yaml no declara ningun recurso /health,
 *   asi que desde internet no existe. Solo es alcanzable desde dentro del
 *   entorno de ejecucion de la Lambda... y por la Function URL de la demo de
 *   Defense in Depth, que se apaga despues de usarla.
 *   Ademas no revela nada: ni versiones, ni configuracion, ni datos.
 */
@RestController
public class SaludController {

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
                "estado", "ok",
                "servicio", "biblioteca-backend",
                "instante", Instant.now().toString());
    }
}
