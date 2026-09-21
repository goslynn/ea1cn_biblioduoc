package cl.duoc.biblioteca.config;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * LA SEGUNDA CAPA DE SEGURIDAD (Defense in Depth).
 *
 * API Gateway ya valida el token antes de invocar la Lambda. ¿Por que volver a
 * validarlo aqui? Porque API Gateway no es el unico camino posible hacia la
 * aplicacion:
 *
 *   * la Function URL de la demo (aws/backend.yaml, EnableBypassDemoUrl),
 *   * manana, otro servicio de la cuenta invocando la Lambda directamente,
 *   * o la misma aplicacion desplegada en otro sitio.
 *
 * Con esta clase, ninguna de esas vias entrega datos sin un JWT valido. Sin
 * ella, cualquiera que descubra la URL directa se salta el authorizer entero.
 *
 * QUE VALIDA, EN ORDEN
 *   1. Firma, emisor y expiracion   -> JwtDecoder, contra el JWKS de Cognito
 *      (que descarga solo, sin credenciales, del issuer-uri).
 *   2. token_use == "access"        -> validador propio de aqui abajo.
 *   3. El scope exigido             -> hasAuthority("SCOPE_<scope>").
 *
 * Spring convierte cada valor del claim "scope" en una authority con prefijo
 * "SCOPE_". Por eso "biblioteca-api/acceso" se comprueba como
 * "SCOPE_biblioteca-api/acceso": la barra dentro del nombre es legal.
 */
@Configuration
public class SecurityConfig {

    /** Inyectado por la variable de entorno BIBLIOTECA_SCOPE (aws/backend.yaml). */
    @Value("${biblioteca.scope}")
    private String scopeRequerido;

    /** Inyectado por BIBLIOTECA_ORIGEN: el origen del frontend en S3. */
    @Value("${biblioteca.origen}")
    private String origenWeb;

    /** Emisor de los tokens; el mismo que usa el JwtDecoder. */
    @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri}")
    private String issuerUri;

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .authorizeHttpRequests(auth -> auth
                        // Sonda del Lambda Web Adapter. No se publica en API
                        // Gateway y no revela nada. Ver SaludController.
                        .requestMatchers("/health").permitAll()

                        // El preflight del navegador viaja SIN Authorization:
                        // si se le exigiera token, el navegador cancelaria la
                        // peticion real y el error se veria como un problema
                        // de CORS en vez de como lo que es.
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                        // La regla estricta: no basta con estar autenticado,
                        // hay que traer el scope. Es lo que separa el 401 del
                        // 403 tambien dentro de la aplicacion.
                        .requestMatchers("/api/**", "/v1/api/**")
                        .hasAuthority("SCOPE_" + scopeRequerido)

                        .anyRequest().denyAll())

                // Se valida el JWT en cada peticion; no se crea sesion.
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                // CSRF protege formularios con sesion y cookies. Aqui no hay
                // ni sesion ni cookies: la credencial es un Bearer que el
                // navegador no adjunta solo, asi que no hay nada que falsear.
                .csrf(csrf -> csrf.disable())

                .cors(cors -> cors.configurationSource(corsConfigurationSource()));

        return http.build();
    }

    /**
     * CORS de las respuestas REALES.
     *
     * Con integracion AWS_PROXY, API Gateway devuelve exactamente lo que
     * responde la Lambda: no puede anadir cabeceras. Asi que el preflight lo
     * responde el gateway (metodos OPTIONS con MOCK, en api.yaml) y la
     * cabecera de la respuesta 200 la pone Spring, aqui.
     */
    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        // Origen exacto, no "*": con "*" el navegador no permite enviar
        // credenciales y ademas se pierde el control de quien consume la API.
        config.setAllowedOrigins(List.of(origenWeb));
        config.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        config.setMaxAge(600L);

        UrlBasedCorsConfigurationSource fuente = new UrlBasedCorsConfigurationSource();
        fuente.registerCorsConfiguration("/**", config);
        return fuente;
    }

    /**
     * Decodificador con validacion ENDURECIDA.
     *
     * El validador por defecto comprueba firma, expiracion y emisor, pero no
     * el tipo de token: un ID TOKEN del mismo pool esta igual de bien firmado.
     * Aqui se exige ademas token_use == "access".
     *
     * ¿No sobra, si API Gateway ya rechaza el id_token por no traer "scope"?
     * Delante de API Gateway, si. Pero esta clase existe precisamente para los
     * caminos que NO pasan por API Gateway, y ahi nadie mas lo comprueba.
     * (Un access token de Cognito no lleva claim "aud" sino "client_id", por
     * eso la validacion de audiencia estandar no aplica.)
     */
    @Bean
    JwtDecoder jwtDecoder() {
        // Se apunta al JWKS directamente en vez de usar withIssuerLocation():
        // esa variante descarga el documento de descubrimiento OIDC AL ARRANCAR
        // el contexto, lo que anade una llamada de red al arranque en frio de
        // la Lambda y hace que la aplicacion no levante si Cognito tarda. Con
        // el JWKS explicito la descarga es perezosa: ocurre en la primera
        // peticion con token, y se cachea. La ruta es fija en Cognito.
        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withJwkSetUri(issuerUri + "/.well-known/jwks.json")
                .build();

        OAuth2TokenValidator<Jwt> porDefecto = JwtValidators.createDefaultWithIssuer(issuerUri);
        OAuth2TokenValidator<Jwt> soloAccessToken = jwt -> {
            if ("access".equals(jwt.getClaimAsString("token_use"))) {
                return OAuth2TokenValidatorResult.success();
            }
            return OAuth2TokenValidatorResult.failure(new OAuth2Error(
                    "invalid_token",
                    "Se requiere un access token (token_use=access); un id_token no sirve para llamar a esta API",
                    null));
        };

        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(porDefecto, soloAccessToken));
        return decoder;
    }
}
