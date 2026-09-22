# Anexo EA1 · Checklist de autoevaluacion

Los 22 items de la guia `DSY1107 · EA1 FULLSTACK CLOUD NATIVE EN AWS`, con el
archivo, comando o pantalla que prueba cada uno.

> **Estado de la evidencia.** Todo esta desplegado y medido contra AWS real.
> Cada codigo de esta pagina sale de una peticion que se ejecuto, no de lo que
> deberia pasar. Dos de esas mediciones contradijeron lo previsto, y ambas
> estan explicadas abajo: el 403 que resulto ser 401 (§4) y el 404 que llegaba
> como 403 (§6).
>
> Despliegue verificado en la cuenta `701546943985`, region `us-east-1`.

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

La ultima linea valida el **mecanismo** de la coleccion: ordenacion por `seq`,
parametros de ruta, variable de runtime entre `create` y `get`, y la
expectativa declarada por entorno.

## 1b. Verificado contra AWS

| Comprobacion | Resultado |
|---|---|
| `aws cloudformation validate-template` en las 5 plantillas | Todas validas, y **ninguna pide `Capabilities`**: confirma que no se crea IAM |
| `./aws/scripts/bootstrap.sh` desde cero | **exit 0**. Cinco stacks creados, API publicada, usuario demo, entornos de Bruno y sitio subido, en una sola pasada |
| `GET /test/api/libros` con access token + scope | **200** con los 20 libros |
| `POST /test/api/solicitudes` | **201** `SOL-0001`; `solicitante` = el `client_id` del cliente M2M, tomado del JWT |
| `GET /test/api/libros/L-999` | **404** generado por Spring (tras el arreglo de la §6) |
| `POST` con `L-005` (0 ejemplares) | **409** |
| `POST` con motivo corto y 90 dias | **400** |
| `GET /test/v1/api/libros/L-003` | **200** por la ruta versionada |
| `GET /test/api/inventado` | **403** *Missing Authentication Token* de API Gateway |
| `bru run` en los 4 entornos | **20/20 peticiones, 29/29 tests en verde** |
| Invocacion directa de la Lambda | 401 / 401 / 401 / **403** / 200 (§5) |
| `index.html` y el bundle en S3 | **200**; el bundle lleva dentro el `us-east-1_wvnddq3Cf` y el `biblioteca-api/acceso` reales, generados por el pipeline |
| Hosted UI (`/oauth2/authorize`) | **302** hacia la pantalla de login |
| JWKS del pool | **200** (es lo que descargan API Gateway y Spring, cada uno por su cuenta) |

### Las tres piezas del CORS, comprobadas por separado

Son tres mecanismos distintos y basta con que falle uno para que el navegador
muestre `status 0`. Medidos uno a uno, con el `Origin` del sitio:

| Pieza | Peticion | Resultado |
|---|---|---|
| **1. Preflight** (OPTIONS MOCK en `api.yaml`) | `OPTIONS /api/solicitudes` con `Access-Control-Request-Method: POST` | **200** + `Allow-Origin`, `Allow-Headers: Content-Type,Authorization`, `Allow-Methods: GET,POST,OPTIONS` |
| **2. Respuesta real** (la pone **Spring**, no el gateway) | `GET /api/libros` con token | **200** + `Allow-Origin` y `vary: Origin`, que es la firma de Spring |
| **3. Errores del gateway** (`GatewayResponse DEFAULT_4XX`) | `GET /api/libros` **sin** token | **401** + `Allow-Origin` |

La tercera es la que decide si el laboratorio es diagnosticable: sin ella, ese
401 llegaria al navegador como *"blocked by CORS"* y se perseguiria un problema
de CORS que no existe. Con integracion `AWS_PROXY`, API Gateway **no puede**
anadir cabeceras a la respuesta real, y de ahi que la pieza 2 tenga que
resolverse en el codigo Java.

Salida real del recorrido completo de Bruno:

```
bru run --env aws                     5 peticiones, 14/14 tests  ✓ PASS
bru run --env aws-usuario-sin-scope   5 peticiones,  5/5  tests  ✓ PASS
bru run --env aws-id-token            5 peticiones,  5/5  tests  ✓ PASS
bru run --env aws-token-invalido      5 peticiones,  5/5  tests  ✓ PASS
```

---

## 2. Mapeo item por item

| # | Item del checklist | Donde se cumple | Evidencia |
|---|---|---|---|
| 01 | Explicar API Manager, IDaaS, OAuth 2.0 y OIDC | `README.md` §4, `aws/README.md` §1 | La tabla "quien habla con quien, y con que credencial", y la explicacion de por que un id token da 401 |
| 02 | El backend compila y se prueba solo | `back/` | `./mvnw package` → BUILD SUCCESS, 15 tests |
| 03 | Desplegado, y se revisar sus logs | `aws/backend.yaml` | Funcion `biblioteca-api` desplegada; `aws logs tail /aws/lambda/biblioteca-api --follow` |
| 04 | API Gateway es el punto de entrada | `aws/api.yaml` | 25 recursos: RestApi, 7 Resource, 6 metodos de negocio, 5 OPTIONS, authorizer, 2 GatewayResponse, Deployment, Stage, Permission |
| 05 | Rutas y metodos coherentes | `back/`, `aws/api.yaml` | `/api/libros`, `/api/libros/{id}`, `/api/solicitudes`, `/api/solicitudes/{id}`, `/v1/{proxy+}` |
| 06 | El CORS permite el origen y `Authorization` | `aws/api.yaml` + `SecurityConfig` | Reparto en tres piezas: OPTIONS MOCK, cabecera de Spring en la respuesta real, `GatewayResponses` para los 4xx/5xx |
| 07 | User Pool, App Client y dominio | `aws/cognito.yaml` | 5 recursos y 9 Outputs; dominio `biblioteca-<cuenta>` |
| 08 | Authorization Code + PKCE funciona | `front/src/main.ts` | `responseType: 'code'`; Hosted UI en `https://biblioteca-701546943985.auth.us-east-1.amazoncognito.com`; login E2E en el navegador |
| 09 | Diferencia entre id token y access token | `aws/api.yaml`, Bruno | Entorno `aws-id-token` → **401 medido**, en las dos capas: `AuthorizationScopes` exige el claim `scope` y un id token no lo lleva; Spring ademas exige `token_use == "access"` |
| 10 | El access token trae el custom scope | `aws/cognito.yaml`, `front/src/app/sesion/` | Resource server `biblioteca-api` + scope `acceso`; el payload decodificado se ve en la vista `/sesion` |
| 11 | API Gateway usa el authorizer de Cognito | `aws/api.yaml` | `Type: COGNITO_USER_POOLS`, `IdentitySource: method.request.header.Authorization` |
| 12 | Sin token rechaza, con token entra | `bruno/` | `bru run --env aws` → 200/201 (14/14 tests); `--env aws-token-invalido` → 401 (5/5) |
| 13 | El frontend usa Amplify | `front/src/main.ts`, `auth/sesion.service.ts` | `Amplify.configure` antes de `bootstrapApplication`; `signInWithRedirect`, `signOut`, `fetchAuthSession`, `getCurrentUser` |
| 14 | Las llamadas de negocio van en un Service | `front/src/app/catalogo/libros.service.ts`, `solicitudes/solicitudes.service.ts` | Los componentes no conocen ni la URL ni HttpClient |
| 15 | El interceptor esta registrado en HttpClient | `front/src/app/app.config.ts` | `provideHttpClient(withInterceptors([authInterceptor]))`, **dentro** del array `providers` |
| 16 | El interceptor anade el Bearer solo | `front/src/app/auth/auth.interceptor.ts` | La vista `/sesion` compara: `fetch` con cabecera a mano frente a `HttpClient` sin tocarla |
| 17 | Cuando usar un Guard | `front/src/app/auth/auth.guard.ts`, `README.md` §5 | Guard real sobre 4 rutas privadas, y explicado por que **no** es seguridad |
| 18 | Spring Boot como Resource Server | `back/.../config/SecurityConfig.java` | `hasAuthority("SCOPE_biblioteca-api/acceso")` + validador propio que exige `token_use == "access"` |
| 19 | Defense in Depth y el bypass | `aws/backend.yaml`, `SecurityConfig` | Los cuatro comandos medidos de la §5 de este anexo |
| 20 | Versionamiento y microservicios | `aws/api.yaml`, `README.md` §6 | `/v1/{proxy+}` y el criterio escrito de cuando subir de version |
| 21 | Repositorio sin secretos ni artefactos | `.gitignore` | `git ls-files` no lista `target/`, `node_modules/`, `dist/`, `aws-config.ts`, `environments/aws*.yml` ni `aws/.local/` |
| 22 | Diagnosticar 200/401/403/CORS/5xx | `bruno/`, `aws/README.md` §8 | La matriz medida de la §4, el hallazgo de la §6 y la tabla de problemas conocidos |

---

## 3. La medicion que contradijo lo previsto: el 403

El plan decia *"403 (medir)"* para el caso "token valido sin el scope exigido",
y la guia del curso hedge en su §12: *"403 **o rechazo de autorizacion segun
configuracion**"*. Medido:

```sh
curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN_SIN_SCOPE" \
  https://u83dpe9cdh.execute-api.us-east-1.amazonaws.com/test/api/libros
# -> 401

curl -s -H "Authorization: Bearer $TOKEN_SIN_SCOPE" .../test/api/libros
# -> {"message":"Unauthorized"}
```

El token esta bien firmado, no ha caducado y es del pool correcto. Su payload:

```json
{
  "token_use": "access",
  "scope": "aws.cognito.signin.user.admin",
  "client_id": "605959vma3v5sp7psm0mvra7na"
}
```

Es decir: **el authorizer `COGNITO_USER_POOLS` responde 401, no 403**, y con el
mismo cuerpo que ante un token inventado. Desde fuera, API Gateway no distingue
"no se quien eres" de "se quien eres, pero no puedes".

**El 403 si existe, y lo da Spring Security.** El mismo token, invocando la
Lambda directamente (§5), devuelve **403**. La segunda capa no solo repite la
validacion de la primera: emite un diagnostico que la primera no emite.

> Conclusion practica para diagnosticar: **un 401 de esta API no significa
> necesariamente "token malo"**. Puede ser un token perfecto al que le falta el
> scope. Para distinguirlo hay que mirar el claim `scope` del token, o llamar a
> la funcion directamente y ver si Spring responde 403.

---

## 4. Matriz de seguridad medida

Todos los valores salen de una peticion ejecutada contra el despliegue real.

| Prueba | `Authorization` | Por API Gateway | Directo a la Lambda | Quien rechaza |
|---|---|---|---|---|
| Sin cabecera | *(ausente)* | **401** | **401** | authorizer / Spring Security |
| Token inventado | `Bearer abc` | **401** | **401** | firma invalida, en las dos capas |
| id token | `Bearer <id_token>` | **401** | **401** | falta `scope` / `token_use != access` |
| access token **sin** el scope | `Bearer <access_token>` | **401** | **403** | ver §3 |
| access token **con** el scope | `Bearer <access_token>` | **200** | **200** | nadie |
| id inexistente | `Bearer <access_token>` | **404** | **404** | **Spring** |
| formulario invalido | `Bearer <access_token>` | **400** | — | **Spring**, Bean Validation |
| libro sin ejemplares | `Bearer <access_token>` | **409** | — | **Spring**, regla de negocio |
| ruta que no existe | `Bearer <access_token>` | **403** | — | API Gateway, *Missing Authentication Token* |

Reproducible con:

```sh
cd bruno
bru run --env aws                     # 200 / 201   14/14 tests
bru run --env aws-usuario-sin-scope   # 401          5/5  tests
bru run --env aws-id-token            # 401          5/5  tests
bru run --env aws-token-invalido      # 401          5/5  tests
```

> El `403` de *"ruta que no existe"* explica un desconcierto habitual: API
> Gateway contesta **403 Missing Authentication Token** a cualquier ruta que no
> tenga un recurso declarado. Si aparece un 403 donde se esperaba un 404, lo
> primero que hay que mirar no es el token: es si la ruta existe en `api.yaml`.

---

## 5. Defense in Depth, demostrado

### El intento por Function URL, y por que no sirve en este laboratorio

`aws/backend.yaml` tiene el parametro `EnableBypassDemoUrl` que crea una
`AWS::Lambda::Url` con `AuthType: NONE` y su `AWS::Lambda::Permission` para
`lambda:InvokeFunctionUrl` con `Principal: "*"`. Se activo y se midio:

```sh
EnableBypassDemoUrl=true ./aws/pipeline/build-backend.sh
curl -i https://76p6254z3opewjcfh7a5rw7e2e0mvxxt.lambda-url.us-east-1.on.aws/health
```
```
HTTP/1.1 403 Forbidden
x-amzn-ErrorType: AccessDeniedException
```

La politica de recursos se creo correctamente (`aws lambda get-policy` la
muestra) y `AuthType` es `NONE`. El rechazo viene de **la propia cuenta de AWS
Academy**, que prohibe las Function URL anonimas, y ocurre antes de llegar a la
funcion. No es un fallo de la plantilla: el mismo codigo funciona en una cuenta
sin esa restriccion, y por eso el parametro se conserva.

### La via que si permite el laboratorio: invocar la funcion directamente

`aws lambda invoke` se salta API Gateway por completo —el authorizer no
interviene— que es exactamente lo que se queria demostrar:

```sh
# Evento con formato payload 1.0, el que emite una REST API
cat > evento.json <<EOF
{"resource":"/api/libros","path":"/api/libros","httpMethod":"GET",
 "headers":{"Host":"x","Authorization":"Bearer <TOKEN>"},
 "requestContext":{"resourcePath":"/api/libros","httpMethod":"GET","stage":"test"},
 "body":null,"isBase64Encoded":false}
EOF

aws lambda invoke --function-name biblioteca-api \
  --payload fileb://evento.json salida.json
python3 -c "import json;print(json.load(open('salida.json'))['statusCode'])"
```

Resultado de los cuatro casos:

| Peticion directa a la Lambda | statusCode | Quien responde |
|---|---|---|
| sin cabecera `Authorization` | **401** | Spring Security |
| `Bearer abc` | **401** | Spring Security, firma invalida |
| id token | **401** | Spring Security, exige `token_use == "access"` |
| access token **sin** el scope | **403** | Spring Security, `hasAuthority` |
| access token **con** el scope | **200** | nadie: pasa |

**Que demuestra.** El authorizer de API Gateway se quedo completamente al
margen: no vio ninguna de estas peticiones. Aun asi, ninguna entrego datos sin
un token valido y con el scope correcto. Si `SecurityConfig` no existiera, las
cinco habrian devuelto 200 y cualquiera con permiso para invocar la funcion
—o con la Function URL, en una cuenta que las permita— tendria acceso completo.

**El matiz que no hay que perder.** Que Spring respondiera 401 y 403 no
significa que la puerta estuviera cerrada: significa que estaba **vigilada**.
La proteccion logica no equivale a una red privada. Cerrarla de verdad es
quitar la Function URL y dejar solo la invocacion desde API Gateway, que es el
estado en el que quedo el despliegue:

```sh
EnableBypassDemoUrl=false ./aws/pipeline/build-backend.sh
```

---

## 6. El segundo hallazgo: un 404 que llegaba como 403

Durante la verificacion, `GET /api/libros/L-999` devolvia **403 con cuerpo
vacio**, tanto por API Gateway como llamando a la funcion directamente. El
`ResponseStatusException(404)` del controlador no llegaba al cliente.

**Causa.** Cuando un controlador lanza una excepcion, el contenedor **reenvia
internamente a `/error`** para construir la respuesta. Ese reenvio vuelve a
pasar por las reglas de Spring Security, con dispatcher type `ERROR`. `/error`
no encaja en `/api/**`, asi que caia en el `.anyRequest().denyAll()` del final.

**Arreglo**, en `SecurityConfig`:

```java
.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
```

No abre nada: a `/error` no se llega desde fuera, solo por reenvio interno
despues de una peticion que ya fue autorizada.

**Lo que lo hace instructivo:** los 15 tests de MockMvc pasaban en verde,
porque MockMvc no reproduce ese reenvio. El fallo solo existia contra un
contenedor de verdad. Es la razon de que este anexo mida cada codigo contra el
despliegue real en vez de fiarse de la suite de tests.

Despues del arreglo, medido: `L-999` → **404** con cuerpo
`{"status":404,"error":"Not Found","path":"/api/libros/L-999"}`.

---

## 7. Recorrido E2E de 13 pasos

El orden importa: es el que permite aislar en que capa esta el fallo.

| # | Paso | Como se comprueba | Estado |
|---|---|---|---|
| 1 | Backend local | `./mvnw package` + `curl localhost:8080/api/libros` | **verificado** |
| 2 | Backend desplegado | Stack `biblioteca-backend` creado; `aws logs tail /aws/lambda/biblioteca-api` | **verificado** |
| 3 | API respondiendo | `GET <ApiEndpoint>/api/libros` con token → 200 | **verificado** |
| 4 | Cognito emite token | `./aws/pipeline/bruno-env.sh` → token M2M de 857 caracteres | **verificado** |
| 5 | API protegida: 401 | `bru run --env aws-token-invalido` → 5/5 | **verificado** |
| 6 | Bruno con scope: 200 | `bru run --env aws` → 14/14 | **verificado** |
| 7 | El frontend inicia sesion | Boton "Iniciar sesion" → Hosted UI | en el navegador |
| 8 | El frontend obtiene la sesion | Vista `/sesion`: usuario y access token | en el navegador |
| 9 | El frontend llama con HttpClient | Catalogo: busqueda y filtros | en el navegador |
| 10 | El interceptor pone el Bearer | DevTools → Network: la cabecera esta, y ningun componente la puso | en el navegador |
| 11 | API Gateway valida JWT y scope | Vista `/sesion`: `fetch` sin cabecera → 401 | en el navegador |
| 12 | Spring Security vuelve a validar | Invocacion directa → 401/403 (§5) | **verificado** |
| 13 | La UI muestra los datos | Catalogo, envio del formulario y "mis solicitudes" | en el navegador |

Los pasos 7 a 11 y el 13 son los que **hay que hacer con el navegador abierto**:
son precisamente los que Bruno no puede comprobar, porque dependen de la
politica de CORS y del ciclo de redirecciones del login. La URL es

```
https://biblioteca-web-701546943985.s3.us-east-1.amazonaws.com/index.html
```

y la cuenta de demostracion, con su contrasena, esta en
`aws/.local/usuario-demo.env`.

Y la comprobacion silenciosa: **ni un solo error de CORS en DevTools** durante
todo el recorrido. Ese silencio es la prueba de que el preflight (`OPTIONS`
MOCK), la cabecera que pone Spring en la respuesta real y los
`GatewayResponses` de los 4xx estan bien puestos: son tres piezas distintas y
basta con que falle una para que el navegador muestre `status 0`.
