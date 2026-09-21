# Anexo EA1 · Checklist de autoevaluacion

Los 22 items de la guia `DSY1107 · EA1 FULLSTACK CLOUD NATIVE EN AWS`, con el
archivo, comando o pantalla que prueba cada uno.

> **Estado de la evidencia.** Todo lo que se puede verificar sin AWS esta
> verificado y anotado con su salida real. Lo que necesita el laboratorio
> encendido esta marcado con **(pendiente de despliegue)** y lleva el comando
> exacto que lo produce. Nada se da por bueno sin haberlo visto.

---

## 1. Verificado sin AWS

| Comprobacion | Resultado |
|---|---|
| `cd back && ./mvnw package` | **BUILD SUCCESS** · 15 tests, 0 fallos |
| Backend local: `GET /api/libros` | **200** con los 20 libros |
| Backend local: `GET /api/libros/L-999` | **404**, generado por Spring |
| Backend local: `POST /api/solicitudes` valido | **201** `SOL-0001`, con `fechaDevolucion` calculada |
| Backend local: `POST` con motivo corto y 90 dias | **400** con `detalles.dias` y `detalles.motivo` |
| Backend local: `POST` de `L-005` (0 ejemplares) | **409** |
| Backend local: `GET /v1/api/libros/L-003` | **200** (ruta versionada) |
| Backend local con seguridad: `GET /api/libros` sin token | **401** |
| Backend local con seguridad: `Bearer abc` | **401** |
| Backend local con seguridad: `OPTIONS` preflight | **200** con las tres cabeceras `Access-Control-Allow-*` |
| Backend local con seguridad: `GET /health` | **200** (unica ruta publica) |
| `cd front && npm run build` | Bundle inicial 372 kB; catalogo, formulario, sesion y mis-solicitudes en chunks aparte |
| Las 5 plantillas de `aws/` | Parsean y son coherentes: sin referencias a parametros o recursos inexistentes |
| `bash -n` en los 6 scripts | Sin errores de sintaxis |
| `bru run` contra el backend local con token invalido | **5/5 en verde**: las 5 peticiones dan 401, que es lo que ese entorno declara esperar |

La ultima linea es la que valida el **mecanismo** de la coleccion: ordenacion
por `seq`, parametros de ruta, variable de runtime entre `create` y `get`, y la
expectativa declarada por entorno. Con el laboratorio encendido, los mismos
archivos se ejercitan contra la API real.

---

## 2. Mapeo item por item

| # | Item del checklist | Donde se cumple | Evidencia |
|---|---|---|---|
| 01 | Explicar API Manager, IDaaS, OAuth 2.0 y OIDC | `README.md` §4, `aws/README.md` §1 | La tabla "quien habla con quien, y con que credencial", y la explicacion de por que un id token da 401 |
| 02 | El backend compila y se prueba solo | `back/` | `./mvnw package` → BUILD SUCCESS, 15 tests |
| 03 | Desplegado, y se revisar sus logs | `aws/backend.yaml` | `aws logs tail /aws/lambda/biblioteca-api --follow` **(pendiente de despliegue)** |
| 04 | API Gateway es el punto de entrada | `aws/api.yaml` | 25 recursos: RestApi, 7 Resource, 6 metodos de negocio, 5 OPTIONS, authorizer, 2 GatewayResponse, Deployment, Stage, Permission |
| 05 | Rutas y metodos coherentes | `back/`, `aws/api.yaml` | `/api/libros`, `/api/libros/{id}`, `/api/solicitudes`, `/api/solicitudes/{id}`, `/v1/{proxy+}` |
| 06 | El CORS permite el origen y `Authorization` | `aws/api.yaml` + `SecurityConfig` | Reparto en tres piezas: OPTIONS MOCK, cabecera de Spring en la respuesta real, `GatewayResponses` para los 4xx/5xx |
| 07 | User Pool, App Client y dominio | `aws/cognito.yaml` | 5 recursos y 9 Outputs; dominio `biblioteca-<cuenta>` |
| 08 | Authorization Code + PKCE funciona | `front/src/main.ts` | `responseType: 'code'`; login E2E en el navegador **(pendiente de despliegue)** |
| 09 | Diferencia entre id token y access token | `aws/api.yaml`, Bruno | Entorno `aws-id-token` → **401**: `AuthorizationScopes` exige el claim `scope`, y un id token no lo lleva nunca |
| 10 | El access token trae el custom scope | `aws/cognito.yaml`, `front/src/app/sesion/` | Resource server `biblioteca-api` + scope `acceso`; el payload decodificado se ve en la vista `/sesion` |
| 11 | API Gateway usa el authorizer de Cognito | `aws/api.yaml` | `Type: COGNITO_USER_POOLS`, `IdentitySource: method.request.header.Authorization` |
| 12 | Sin token rechaza, con token entra | `bruno/` | `bru run --env aws` → 200/201; `--env aws-token-invalido` → 401 |
| 13 | El frontend usa Amplify | `front/src/main.ts`, `auth/sesion.service.ts` | `Amplify.configure` antes de `bootstrapApplication`; `signInWithRedirect`, `signOut`, `fetchAuthSession`, `getCurrentUser` |
| 14 | Las llamadas de negocio van en un Service | `front/src/app/catalogo/libros.service.ts`, `solicitudes/solicitudes.service.ts` | Los componentes no conocen ni la URL ni HttpClient |
| 15 | El interceptor esta registrado en HttpClient | `front/src/app/app.config.ts` | `provideHttpClient(withInterceptors([authInterceptor]))`, **dentro** del array `providers` |
| 16 | El interceptor anade el Bearer solo | `front/src/app/auth/auth.interceptor.ts` | La vista `/sesion` compara: `fetch` con cabecera a mano frente a `HttpClient` sin tocarla |
| 17 | Cuando usar un Guard | `front/src/app/auth/auth.guard.ts`, `README.md` §5 | Guard real sobre 4 rutas privadas, y explicado por que **no** es seguridad |
| 18 | Spring Boot como Resource Server | `back/.../config/SecurityConfig.java` | `hasAuthority("SCOPE_biblioteca-api/acceso")` + validador propio que exige `token_use == "access"` |
| 19 | Defense in Depth y el bypass | `aws/backend.yaml` (`EnableBypassDemoUrl`) | Los cuatro pasos de la §3 de este anexo **(pendiente de despliegue)** |
| 20 | Versionamiento y microservicios | `aws/api.yaml`, `README.md` §6 | `/v1/{proxy+}` y el criterio escrito de cuando subir de version |
| 21 | Repositorio sin secretos ni artefactos | `.gitignore` | `git ls-files` no lista `target/`, `node_modules/`, `dist/`, `aws-config.ts`, `environments/aws*.yml` ni `aws/.local/` |
| 22 | Diagnosticar 200/401/403/CORS/5xx | `bruno/`, `aws/README.md` §8 | La matriz de la §4 de este anexo y la tabla de problemas conocidos |

---

## 3. Defense in Depth · guion de la demostracion

**(pendiente de despliegue)** — los cuatro pasos, con la salida real, se pegan
aqui al ejecutarlos.

```sh
# 1. Abrir la puerta trasera: una Function URL SIN autenticacion
EnableBypassDemoUrl=true ./aws/pipeline/build-backend.sh
./aws/pipeline/bruno-env.sh

# 2. Llamar a la Lambda SIN pasar por API Gateway y sin token
cd bruno && bru run --env aws-directo-sin-token
#    -> 401. Lo rechaza SPRING SECURITY, no la infraestructura.
#    Sin la segunda capa, esto habria devuelto 200: el authorizer de API
#    Gateway se quedo a un lado y no se entero de la peticion.

# 3. La misma puerta, con un token valido
bru run --env aws-directo
#    -> 200. Spring valida el JWT por su cuenta, sin ayuda del gateway.

# 4. Y por el camino legitimo, con token valido
bru run --env aws
#    -> 200. Dos controles, uno detras del otro.

# 5. Cerrar la puerta
EnableBypassDemoUrl=false ./aws/pipeline/build-backend.sh
```

**El matiz que no hay que perder.** Que Spring respondiera 401 en el paso 2 no
significa que la puerta estuviera cerrada: significa que estaba **vigilada**.
La proteccion logica no equivale a una red privada. Cerrarla de verdad es el
paso 5, que hace desaparecer la URL.

---

## 4. Matriz de seguridad

**(pendiente de despliegue)** — la columna "medido" se rellena al correr Bruno
contra la API real.

| Prueba | `Authorization` | Esperado | Medido | Quien rechaza |
|---|---|---|---|---|
| Sin cabecera | *(ausente)* | 401 | | API Gateway · authorizer |
| Token inventado | `Bearer no-es-un-jwt-de-verdad` | 401 | | API Gateway · firma |
| id token | `Bearer <id_token>` | 401 | | API Gateway · falta el claim `scope` |
| access token **sin** el scope | `Bearer <access_token>` | 403 | | API Gateway · `AuthorizationScopes` |
| access token **con** el scope | `Bearer <access_token>` | 200 | | nadie: pasa las dos capas |
| id inexistente, token valido | `Bearer <access_token>` | 404 | | **Spring** |
| Directo a la Lambda, sin JWT | *(ausente)* | 401 | | **Spring Security** |
| Directo a la Lambda, con JWT | `Bearer <access_token>` | 200 | | nadie |

> **Sobre la fila del 403.** La guia hedge en su §12: *"403 o rechazo de
> autorizacion segun configuracion"*. No se asume el codigo: **se mide** y se
> anota aqui el real. Esa medicion hecha vale mas que la tabla copiada.

Comandos que la producen:

```sh
cd bruno
bru run --env aws                     # 200 / 201
bru run --env aws-usuario-sin-scope   # 403
bru run --env aws-id-token            # 401
bru run --env aws-token-invalido      # 401
bru run --env aws-directo             # 200 / 201
bru run --env aws-directo-sin-token   # 401
```

---

## 5. Recorrido E2E de 13 pasos

El orden importa: es el que permite aislar en que capa esta el fallo cuando
algo no responde lo que deberia.

| # | Paso | Como se comprueba | Estado |
|---|---|---|---|
| 1 | Backend local | `./mvnw package` + `curl localhost:8080/api/libros` | **verificado** |
| 2 | Backend desplegado | `aws logs tail /aws/lambda/biblioteca-api --follow` | pendiente |
| 3 | API respondiendo | `GET <ApiEndpoint>/api/libros` con token | pendiente |
| 4 | Cognito emite token | `./aws/pipeline/bruno-env.sh` | pendiente |
| 5 | API protegida: 401 | `bru run --env aws-token-invalido` | pendiente |
| 6 | Bruno con scope: 200 | `bru run --env aws` | pendiente |
| 7 | El frontend inicia sesion | Boton "Iniciar sesion" → Hosted UI | pendiente |
| 8 | El frontend obtiene la sesion | Vista `/sesion`: usuario y access token | pendiente |
| 9 | El frontend llama con HttpClient | Catalogo: busqueda y filtros | pendiente |
| 10 | El interceptor pone el Bearer | DevTools → Network: la cabecera esta, y ningun componente la puso | pendiente |
| 11 | API Gateway valida JWT y scope | Vista `/sesion`: `fetch` sin cabecera → 401 | pendiente |
| 12 | Spring Security vuelve a validar | `bru run --env aws-directo-sin-token` → 401 | pendiente |
| 13 | La UI muestra los datos | Catalogo, envio del formulario y "mis solicitudes" | pendiente |

Y la comprobacion silenciosa: **ni un solo error de CORS en DevTools** durante
todo el recorrido. Ese silencio es la prueba de que el preflight, la cabecera de
Spring y los `GatewayResponses` estan bien puestos.
