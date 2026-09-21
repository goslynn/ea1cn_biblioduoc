# Biblioteca Duoc · Plataforma interna de prestamos

Aplicacion full stack cloud native en AWS para la asignatura **DSY1107**
(evaluacion EA1). Permite a la comunidad Duoc **buscar en el catalogo** de la
biblioteca y **solicitar uno o varios libros** en prestamo, indicando dias,
motivo y sede de retiro.

```
Angular en S3  ──▶  API Gateway (REST + Cognito)  ──▶  Spring Boot en Lambda
      │                        │                              │
   Amplify Auth          authorizer + scope            2.ª validacion del JWT
   (code + PKCE)          + CORS + stage              catalogo y solicitudes
      │                                                  en memoria
      └──────────────▶  Amazon Cognito  ◀───── JWKS ─────────┘
```

Todo se crea con **CloudFormation** (una plantilla por servicio) desde la **AWS
CLI v2**, sobre una cuenta de **AWS Academy Learner Lab**.

---

## 1. Que hay en cada directorio

| Directorio | Que contiene |
|---|---|
| `back/` | Backend Spring Boot 4.1 (Java 21). El mismo jar corre con `java -jar` y dentro de Lambda |
| `front/` | Frontend Angular 22 con AWS Amplify, publicado como sitio estatico en S3 |
| `aws/` | Las cinco plantillas de CloudFormation, los scripts de bootstrap/teardown y los pipelines. Tiene su propio [README](aws/README.md) |
| `bruno/` | Coleccion de pruebas HTTP versionada, con la matriz de seguridad completa. Tiene su propio [README](bruno/README.md) |
| `context/` | La guia del profesor y el plan de trabajo que se siguio |
| [`ANEXO-EA1.md`](ANEXO-EA1.md) | Los 22 items del checklist de autoevaluacion, con la evidencia de cada uno |

---

## 2. Que hace la aplicacion

**Catalogo.** 20 libros cargados desde un JSON del classpath. Se busca por
titulo, autor o ISBN (sin distinguir mayusculas ni tildes) y se filtra por
genero y disponibilidad. Es **estatico**: no hay base de datos, y el filtrado
lo resuelve el backend en memoria.

**Solicitudes.** Se eligen uno o varios libros en el catalogo y se completa un
formulario con dias de prestamo (1-30), motivo (10-300 caracteres) y sede. El
backend valida, resuelve los titulos contra el catalogo y guarda la solicitud
**en memoria**.

| Metodo | Ruta | Respuestas |
|---|---|---|
| GET | `/api/libros?q=&genero=&soloDisponibles=` | 200 |
| GET | `/api/libros/generos` | 200 |
| GET | `/api/libros/{id}` | 200 · 404 |
| POST | `/api/solicitudes` | 201 · 400 · 404 · 409 |
| GET | `/api/solicitudes?mias=&estado=` | 200 |
| GET | `/api/solicitudes/{id}` | 200 · 404 |
| GET | `/health` | 200, sin autenticacion y sin publicar en API Gateway |

Las mismas rutas existen bajo `/v1/api/...` (ver §6).

### Lo que el cliente no decide

El campo `solicitante` **no viaja en el formulario**: el backend lo lee del JWT
ya validado (claim `sub` de la persona, o `client_id` si es un cliente maquina
a maquina). Si viniera del cuerpo, cualquiera podria pedir libros a nombre de
otro. Es tambien la prueba, dentro del codigo, de que el token llego intacto
hasta Spring.

### Persistencia: no hay, y se declara

Las solicitudes viven en un `ConcurrentHashMap` dentro de la funcion Lambda.
Eso significa que:

* **se pierden en cada arranque en frio**, cuando AWS recicla el entorno de
  ejecucion tras unos minutos sin trafico;
* **no se comparten entre instancias concurrentes**.

Se mitiga con `ReservedConcurrentExecutions: 1`, que fuerza una sola instancia
a la vez. No lo resuelve: la solucion es persistencia (DynamoDB seria la
natural aqui), y esta fuera del alcance pedido. Es una limitacion **declarada**,
no un defecto escondido.

---

## 3. Como levantarlo

```sh
awsacademy start                # arranca el laboratorio y refresca credenciales
./aws/scripts/bootstrap.sh      # crea TODO, en orden, de forma idempotente
```

Al terminar imprime la URL del sitio, la de la API, la cuenta de demostracion y
los comandos para probar. Para desmontarlo:

```sh
./aws/scripts/teardown.sh
```

El detalle de cada stack, cada script y cada parametro esta en
[`aws/README.md`](aws/README.md).

### Como se prueba

* **La API**, con Bruno: `cd bruno && bru run --env aws`
* **La aplicacion**, en el navegador, abriendo la URL del sitio con DevTools en
  la pestana Network.

Ningun script prueba la API por su cuenta: los scripts construyen, y la
verificacion se hace con Bruno y con el navegador.

---

## 4. La seguridad, en dos capas

| Prueba | `Authorization` | Resultado | Quien rechaza |
|---|---|---|---|
| sin cabecera | *(ausente)* | 401 | API Gateway · authorizer |
| token inventado | `Bearer abc` | 401 | API Gateway · firma |
| **id token** | `Bearer <id_token>` | 401 | API Gateway · falta el claim `scope` |
| access token **sin** el scope | `Bearer <access_token>` | 403 | API Gateway · `AuthorizationScopes` |
| access token **con** el scope | `Bearer <access_token>` | 200 | nadie: pasa las dos capas |
| id inexistente, token valido | `Bearer <access_token>` | 404 | **Spring** |
| directo a la Lambda, sin JWT | *(ausente)* | 401 | **Spring Security** |
| directo a la Lambda, con JWT | `Bearer <access_token>` | 200 | nadie |

Las dos ultimas filas son **Defense in Depth**: si alguien descubre la funcion
Lambda y la llama sin pasar por API Gateway, Spring Security vuelve a validar
el mismo token. La demostracion completa, con sus cuatro comandos y su salida,
esta en [`ANEXO-EA1.md`](ANEXO-EA1.md).

### Por que el id token da 401 y no 200

Cuando un metodo declara `AuthorizationScopes`, API Gateway exige que el token
traiga el claim `scope`. **Un id token no lo lleva nunca**, por diseno de OIDC.
Asi que la recomendacion "usa el access token" deja de ser un consejo y pasa a
ser una restriccion tecnica comprobable. Es la prueba del entorno
`aws-id-token` de Bruno.

### Un solo scope, y por que

El resource server define un unico scope, `biblioteca-api/acceso`, que autoriza
tanto la lectura del catalogo como la creacion de solicitudes. Se llama
`acceso` y no `libros-read` precisamente porque cubre tambien el `POST`.

Partirlo en `libros-read` y `solicitudes-write` es la evolucion natural, y
permitiria emitir credenciales que solo consulten el catalogo. No se hizo para
mantener la configuracion en una sola pieza legible: ese literal tiene que
coincidir **caracter por caracter** en cuatro sitios (los dos App Clients,
`AuthorizationScopes` en `aws/api.yaml`, el `hasAuthority` de Spring y la lista
de scopes de Amplify), y duplicarlo duplica tambien las oportunidades de error.

---

## 5. Frontend

Angular 22 standalone con signals y Amplify Auth 6.

| Pieza | Archivo | Que hace |
|---|---|---|
| Configuracion de Amplify | `front/src/main.ts` | Se configura **antes** de arrancar Angular |
| Interceptor | `front/src/app/auth/auth.interceptor.ts` | Anade el `Bearer` a toda peticion de `HttpClient` |
| Guard | `front/src/app/auth/auth.guard.ts` | Impide **navegar** a las rutas privadas sin sesion |
| Servicios | `libros.service.ts`, `solicitudes.service.ts` | Encapsulan URL y llamadas; los componentes no saben de HTTP |
| Configuracion AWS | `aws-config.ts` | **Generada** por el pipeline; no se versiona |

### Guard e interceptor no son lo mismo

Un **Guard** controla la navegacion: que rutas puede abrir el usuario. Un
**interceptor** controla las llamadas HTTP: que cabecera llevan. Y **ninguno de
los dos protege la API**: los dos corren en el navegador del usuario, que puede
saltarselos con la consola abierta. Si el Guard desapareciera, la API seguiria
igual de protegida, porque quien protege son API Gateway y Spring Security.

El Guard esta porque hay rutas privadas de verdad (`/catalogo`, `/solicitud`,
`/mis-solicitudes`, `/sesion`): sin el, alguien sin sesion veria pantallas
vacias llenas de errores 401.

### La vista `/sesion`

No es una pantalla de negocio: existe para ver lo que normalmente esta
escondido. Muestra el access token, su payload decodificado (`token_use`,
`client_id`, `scope`) y hace dos llamadas **manuales con `fetch`**, una con la
cabecera puesta a mano y otra sin ninguna. Es redundante teniendo el
interceptor, y es deliberado: hasta que no ves la cabecera escrita a mano, el
interceptor parece magia.

### Por que las rutas llevan `#`

El sitio se sirve por el **endpoint REST** de S3, que devuelve los objetos que
existen y nada mas: con rutas limpias, recargar en `/catalogo` daria 404. El
*website endpoint* de S3 si sabe redirigir a `index.html`, pero es HTTP puro y
Cognito **rechaza callbacks sin TLS**. Con CloudFront delante se podria volver a
rutas limpias; queda como evolucion.

---

## 6. Versionamiento

Las mismas rutas se exponen bajo `/v1/api/...`, con un recurso proxy
`/v1/{proxy+}` en API Gateway y un segundo prefijo en los `@RequestMapping` de
los controladores.

El punto no es la URL: es poder enrutar `/v1` y `/v2` a integraciones distintas
sin romper a los consumidores existentes.

**Cuando subiria a `/v2`:** un cambio **incompatible** del contrato — quitar o
renombrar un campo, cambiar su tipo, volver obligatorio algo que era opcional,
o cambiar el significado de un codigo de respuesta.

**Cuando no:** anadir un campo opcional a la respuesta, un parametro de
busqueda nuevo, o un endpoint nuevo. Eso son cambios compatibles y caben en la
version que ya existe.

---

## 7. Desviaciones declaradas respecto del canon de la guia

Se declaran aqui en lugar de esconderlas.

| La guia dice | Aqui se hizo | Por que |
|---|---|---|
| Backend en **EC2** (`dnf install corretto`, puerto 8888, SG abierto) | **Lambda + AWS Lambda Web Adapter** | La IP publica cambia en cada reinicio y la instancia muere al cerrar el lab. El **mismo jar** corre con `java -jar` en local y dentro de Lambda, sin tocar codigo ni `pom.xml`. Los logs siguen estando en CloudWatch, y el `execution role` lee el artefacto de S3 sin ninguna Access Key |
| **SG abriendo 8888 a `0.0.0.0/0`** | Nada expuesto | La propia guia avisa de que no es una arquitectura recomendable |
| Bypass directo a `<EC2_IP>:8888` | **Function URL temporal** con `AuthType: NONE`, tras un flag de CloudFormation | Reproducible: se enciende, se demuestra y se apaga. El item 19 pasa de *explicable* a **demostrable** |
| **REST API** | **REST API. Se conserva** | Es la que trae `AuthorizationScopes` por metodo, que es el mecanismo que produce el 403 |
| Consola web de AWS | **AWS CLI v2 + CloudFormation** | Reproducible, versionado e idempotente |
| **Postman** | **Bruno**, versionado en el repositorio | Asserts automaticos, vive en git y corre en terminal |
| `ng serve` en `localhost:4200` | **Sitio publicado en S3** | Se pidio construir solo el acceso publico: no se entrega ningun entorno de desarrollo. `localhost` no esta en las listas blancas de Cognito ni en el CORS |

---

## 8. Herramientas

| Herramienta | Para que | Comprobar |
|---|---|---|
| AWS CLI v2 | toda la infraestructura | `aws --version` |
| Java 21 | compilar el backend | `java -version` |
| Maven Wrapper | build reproducible, sin instalar Maven | `cd back && ./mvnw -v` |
| Node.js + npm | compilar el frontend | `node -v` |
| `zip` | armar el paquete de la Lambda | `zip -v` |
| `python3` | leer JSON en los scripts | `python3 --version` |
| Bruno (`bru`) | pruebas HTTP versionadas | `bru --version` |
| Navegador con DevTools | diagnostico de CORS y del preflight | — |

Las credenciales del Learner Lab caducan cada ~4 horas y son la causa numero
uno de errores raros. `awsacademy start` las refresca.
