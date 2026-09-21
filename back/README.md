# Backend · biblioteca-backend

API de la Biblioteca Duoc. **Spring Boot 4.1 sobre Java 21**, compilada con el
Maven Wrapper (no hace falta tener Maven instalado).

El artefacto es un **fat jar**, y es exactamente el mismo en los dos entornos:

```sh
java -jar target/biblioteca-backend-0.0.1-SNAPSHOT.jar   # en tu maquina
# y dentro de Lambda, el AWS Lambda Web Adapter arranca ese mismo jar
```

No hay codigo especifico de AWS en ninguna clase: si manana el backend se
mudara a EC2 o a un contenedor, no habria que cambiar nada.

---

## 1. Estructura

```
src/main/java/cl/duoc/biblioteca/
├── BibliotecaApplication.java
├── catalogo/
│   ├── Libro.java                  record inmutable; "disponible" es calculado
│   ├── CatalogoLibros.java         carga libros.json UNA vez; busqueda sin tildes
│   └── LibroController.java        GET /api/libros, /generos, /{id}
├── solicitudes/
│   ├── Sede.java  EstadoSolicitud.java
│   ├── ItemSolicitado.java  NuevaSolicitud.java    DTO de ENTRADA, con validaciones
│   ├── LineaSolicitud.java  Solicitud.java         DTO de SALIDA
│   ├── SolicitudesEnMemoria.java   ConcurrentHashMap + AtomicLong
│   └── SolicitudController.java    POST y GET de solicitudes
├── web/
│   ├── SaludController.java        GET /health, la sonda del Web Adapter
│   └── ManejadorDeErrores.java     convierte los fallos de validacion en 400 utiles
└── config/
    └── SecurityConfig.java         segunda validacion del JWT + CORS
src/main/resources/
├── application.properties
└── libros.json                     los 20 libros del catalogo
```

---

## 2. Compilar y probar

```sh
cd back
./mvnw package          # compila y pasa los 15 tests
./mvnw test
```

Los tests usan `MockMvc` y **simulan** la autenticacion con el post-processor
`jwt()` de `spring-security-test`: se inyecta un token ya validado con las
authorities que interesen. No hay red, no hay Cognito, y lo que se prueba son
las **reglas** de `SecurityConfig` (401 sin token, 403 con token sin scope, 200
con scope), no la criptografia, que es responsabilidad de la libreria.

### Arrancar en local

Con la seguridad activa hacen falta tres variables, que en AWS inyecta
`aws/backend.yaml` desde los Outputs de CloudFormation:

```sh
SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI=https://cognito-idp.us-east-1.amazonaws.com/<POOL_ID> \
BIBLIOTECA_SCOPE=biblioteca-api/acceso \
BIBLIOTECA_ORIGEN=https://biblioteca-web-<CUENTA>.s3.us-east-1.amazonaws.com \
java -jar target/biblioteca-backend-0.0.1-SNAPSHOT.jar
```

Con eso, `GET /health` responde 200 y todo `/api/**` responde 401 sin un token
valido de ese pool. En el repositorio **no hay ni un identificador de AWS
escrito a mano**: por eso hay que darlos aqui.

---

## 3. Decisiones que conviene entender

**El catalogo es estatico.** Se carga una vez desde `libros.json` y la lista
queda inmutable. Sin base de datos: busqueda inmediata, cero infraestructura y
un arranque en frio mas corto.

**Las solicitudes estan en memoria, y se dice.** `ConcurrentHashMap` dentro de
la funcion: **se pierden en cada arranque en frio** y no se comparten entre
instancias concurrentes. Se mitiga con `ReservedConcurrentExecutions: 1`. Es una
limitacion declarada del alcance pedido, no un defecto escondido.

**El solicitante sale del token.** `Principal.getName()`, que con Spring
Security es el claim `sub` (una persona) o el `client_id` (un cliente M2M).
Nunca del formulario: si viniera del cuerpo, cualquiera podria pedir libros a
nombre de otro.

**Dos prefijos por controlador.** `@RequestMapping({"/api/libros",
"/v1/api/libros"})`: en API Gateway `/v1` es un unico recurso proxy, asi que el
enrutado fino lo hace Spring. Cuando exista un `/v2` incompatible, sera otra
clase y las dos convivieran.

**`/health` es la unica ruta publica.** El Lambda Web Adapter no da por
arrancada la aplicacion hasta que una ruta le responde 2xx; con Spring Security
activo, cualquier ruta de `/api` le devolveria 401 y el arranque se daria por
fallido. No se publica en API Gateway, asi que desde internet no existe, y no
revela nada.

**El JwtDecoder apunta al JWKS, no al issuer.** `withIssuerLocation()` descarga
el documento de descubrimiento OIDC **al arrancar el contexto**: una llamada de
red en el arranque en frio, y la aplicacion no levanta si Cognito tarda. Con
`withJwkSetUri()` la descarga es perezosa y se cachea.

**El CORS lo pone Spring en las respuestas reales.** Con integracion
`AWS_PROXY`, API Gateway devuelve lo que diga la Lambda y no puede anadir
cabeceras. Asi que el reparto es: el preflight `OPTIONS` lo responde API
Gateway (integracion MOCK), la cabecera del 200 la pone Spring, y los errores
del propio gateway los cubren los `GatewayResponses`.

---

## 4. Codigos de respuesta, y quien los produce

| Codigo | Cuando | Quien |
|---|---|---|
| 200 / 201 | todo correcto | el controlador |
| 400 | el formulario no valida, o el JSON no se puede leer | Bean Validation → `ManejadorDeErrores` |
| 401 | sin token, token invalido, caducado, o un id token | API Gateway **y** Spring Security |
| 403 | token valido sin el scope exigido | API Gateway **y** Spring Security |
| 404 | el id no existe | **Spring** (`ResponseStatusException`) |
| 409 | el libro existe pero no tiene ejemplares | el controlador |

El 404 es util como diagnostico: API Gateway no puede producirlo (una ruta
desconocida la contesta con 403), asi que recibirlo demuestra que la peticion
atraveso el authorizer, arranco Spring y llego al controlador.
