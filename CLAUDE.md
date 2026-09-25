# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Todo el repositorio (codigo, comentarios, documentacion, nombres de clases y de
variables) esta en **castellano y sin tildes**. Mantenlo asi en cualquier
archivo que toques.

---

## Skills obligatorios

* **Antes del primer comando `aws` o de tocar cualquier `.yaml` de `aws/`**,
  invoca el skill `aws-academy-cloudformation`.
* **Antes de tocar `bruno/`**, invoca el skill `bruno-collections`.

Si un skill contradice a un README, **gana el skill** y hay que corregir el
documento.

---

## Comandos

### Infraestructura (AWS Academy Learner Lab)

```sh
awsacademy start                   # credenciales frescas; caducan cada ~4 h
./aws/scripts/bootstrap.sh         # crea TODO en orden; idempotente
./aws/scripts/teardown.sh          # borra todo (pide escribir BORRAR; --yes lo salta)
```

Pipelines parciales, cuando ya hay stacks desplegados:

```sh
./aws/pipeline/build-backend.sh    # cambiaste codigo Java (mvnw package -> ZIP -> S3 -> stack)
./aws/pipeline/api-deploy.sh       # cambiaste rutas, metodos o scopes en api.yaml
./aws/pipeline/publish-web.sh      # cambiaste el frontend (config + ng build + s3 sync)
./aws/pipeline/bruno-env.sh        # los tokens caducaron (60 min)

SKIP_TESTS=true ./aws/pipeline/build-backend.sh
SOLO_CONFIG=true ./aws/pipeline/publish-web.sh   # solo genera los archivos del frontend
DEBUG=true       ./aws/pipeline/publish-web.sh   # + la vista /diagnostico (no entregable)
SKIP_WEB=true    ./aws/scripts/bootstrap.sh
```

Variables comunes a todos los scripts: `PROJECT_NAME` (biblioteca),
`AWS_REGION` (us-east-1), `STAGE_NAME` (test), `DEMO_USER`, `LAB_ROLE_ARN`.

**Un cambio en `api.yaml` no llega al stage solo**: `AWS::ApiGateway::Deployment`
es inmutable, asi que siempre hay que correr `api-deploy.sh` despues.

### Backend

```sh
cd back
./mvnw package                                          # compila y corre los 15 tests
./mvnw test
./mvnw test -Dtest=LibroControllerTest                  # una clase
./mvnw test -Dtest=LibroControllerTest#nombreDelMetodo  # un test
```

### Frontend

```sh
cd front
npm ci && npm run build            # deja dist/biblioteca-front/browser/

# para compilar sin desplegar: los dos archivos que genera el pipeline
cp src/app/aws-config.example.ts        src/app/aws-config.ts
cp src/app/diagnostico/rutas.example.ts src/app/diagnostico/rutas.ts
```

No hay target de test en `angular.json`: `npm test` no funciona. La
verificacion del frontend es el recorrido en navegador del `front/README.md` §4.

### Pruebas de la API

```sh
cd bruno && bru run --env aws                   # caso bueno: 200/201
bru run --env aws-usuario-sin-scope             # 401
bru run --env aws-id-token                      # 401
bru run --env aws-token-invalido                # 401
SSL_CERT_DIR=/etc/ssl/certs bru run --env aws   # NixOS, si OpenSSL se queja
```

Los entornos **se generan** con `bruno-env.sh` y llevan tokens reales: estan en
`.gitignore`. **Ningun script prueba la API**: los scripts construyen; la
verificacion es Bruno y el navegador.

### Diagnostico

```sh
aws logs tail /aws/lambda/biblioteca-api --follow --region us-east-1
aws cloudformation describe-stacks --stack-name biblioteca-api --query 'Stacks[0].Outputs' --output table
aws cloudformation validate-template --template-body file://aws/api.yaml
```

Los 401/403 del authorizer **no aparecen en los logs de la Lambda**: API
Gateway rechaza antes de invocarla.

---

## Arquitectura

```
Angular (S3, endpoint REST)  ──▶  API Gateway REST (authorizer Cognito + scope)
                                          │ AWS_PROXY, payload 1.0
                                          ▼
                              Lambda java21 + Lambda Web Adapter
                              Spring Boot revalida el MISMO token
```

Cinco stacks, uno por plantilla, sin `Export`/`Fn::ImportValue`: se encadenan
con **parametros explicitos que pasa `bootstrap.sh`** leyendo Outputs.

| Plantilla | Stack | Depende de |
|---|---|---|
| `aws/artifacts.yaml` | `biblioteca-artifacts` | — |
| `aws/web.yaml` | `biblioteca-web` | — |
| `aws/cognito.yaml` | `biblioteca-cognito` | — (recibe la URL del sitio *calculada*) |
| `aws/backend.yaml` | `biblioteca-backend` | artifacts, cognito, web + ZIP subido |
| `aws/api.yaml` | `biblioteca-api` | cognito, backend, web |

El ciclo aparente (Cognito necesita la URL del frontend; el frontend necesita
Cognito) se rompe **calculando** `https://<proyecto>-web-<AccountId>.s3.<region>.amazonaws.com`
con un `sts get-caller-identity` antes de que el bucket exista.

`aws/README.md` §3 tiene el contrato completo de entradas y salidas de cada
stack: **leelo antes de cambiar un parametro**, porque cada Output alimenta a
otro stack o a un script.

### Seguridad en dos capas, y donde vive cada literal

El scope `biblioteca-api/acceso` tiene que coincidir **caracter por caracter**
en cuatro sitios: los dos App Clients y el Resource Server de `cognito.yaml`,
`AuthorizationScopes` en `api.yaml`, el `hasAuthority("SCOPE_" + …)` de
`SecurityConfig.java`, y la lista de scopes de Amplify en el frontend. Se
propaga por parametros desde el Output `ScopeCompleto`.

Codigos **medidos** contra el despliegue real (no supuestos):

* Token valido **sin** el scope → API Gateway responde **401**, no 403. El 403
  por autorizacion lo da **Spring**, y solo se ve invocando la Lambda
  directamente (`aws lambda invoke`, ver `aws/README.md` §5).
* Un **id token** siempre da 401: no lleva claim `scope`, y `SecurityConfig`
  ademas exige `token_use == "access"`.
* Una ruta inexistente da **403 Missing Authentication Token**, no 404.

### CORS: tres piezas, tres responsables

Con integracion `AWS_PROXY`, API Gateway **no puede** anadir cabeceras a la
respuesta real. El reparto es fijo:

1. preflight `OPTIONS` → API Gateway, integracion MOCK, `AuthorizationType: NONE`;
2. cabecera del 200 → **Spring** (`corsConfigurationSource`, origen exacto desde `BIBLIOTECA_ORIGEN`);
3. errores del propio gateway (401/403) → `GatewayResponse` `DEFAULT_4XX`/`5XX` en `api.yaml`.

Si falta la tercera, un 401 se ve en el navegador como *blocked by CORS*.

---

## Convenciones que no se pueden romper

* **Nada de `localhost` ni entornos de desarrollo.** Solo se entrega el acceso
  publico: `localhost` no esta en las listas blancas de Cognito ni en el CORS.
  No propongas `ng serve` como via de verificacion.
* **Cero identificadores de AWS escritos a mano.** Todo sale de Outputs de
  CloudFormation. Archivos generados y no versionados:
  `front/src/app/aws-config.ts` (plantilla: `aws-config.example.ts`),
  `front/src/app/diagnostico/rutas.ts` (plantillas: `rutas.example.ts` y
  `rutas.example-debug.ts`), `bruno/environments/aws*.yml`, `aws/.local/`.
* **La vista de diagnostico es opt-in y no se entrega.** Ensena el access token
  en claro. Solo aparece con `DEBUG=true`, y lo que esa variable genera es la
  RUTA, no un `if`: apagada, el componente no lo importa nadie y Angular no lo
  compila, asi que no llega a `dist/` ni como codigo muerto. El token tampoco
  vive en `EstadoSesion`: lo piden a Amplify el interceptor y esa vista, nadie
  mas.
* **Cero recursos `AWS::IAM::*`**: el Learner Lab no permite crear roles.
  `backend.yaml` recibe el ARN de `LabRole` como parametro. Tampoco hay ninguna
  Access Key estatica en el sistema.
* **El `solicitante` nunca viaja en el cuerpo**: sale de `Principal.getName()`
  (claim `sub`, o `client_id` en M2M).
* **Dos prefijos por controlador**: `@RequestMapping({"/api/x", "/v1/api/x"})`.
  En API Gateway `/v1/{proxy+}` es un unico recurso y el enrutado fino lo hace
  Spring. Un `/v2` seria otra clase y convivirian.
* **Toda desviacion se declara**, no se esconde: README §7 (canon de la guia) y
  las limitaciones del alcance (solicitudes en un `ConcurrentHashMap`, que se
  pierden en cada arranque en frio).
* Si cambias comportamiento medido, **vuelve a medirlo** y actualiza la tabla
  del `README.md` §4 y el `ESPERADO_*` de los entornos de Bruno.

---

## Trampas ya pagadas (no volver a tropezar)

* **`.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()` en
  `SecurityConfig` es imprescindible.** Sin eso, el reenvio interno a `/error`
  vuelve a pasar por las reglas, cae en el `denyAll()` final, y **todo 404 y 409
  sale como 403 con cuerpo vacio**. MockMvc no reproduce ese reenvio: los tests
  pasaban en verde.
* **`/health` es la unica ruta publica** y no se publica en API Gateway: el
  Lambda Web Adapter no da por arrancada la aplicacion hasta recibir un 2xx.
* **`provideHttpClient(withInterceptors([...]))` va DENTRO del array
  `providers`** de `app.config.ts`. Fuera, compila, arranca y el interceptor no
  se registra: todo responde 401.
* **Rutas con `#` (`withHashLocation`)**: el endpoint REST de S3 no redirige a
  `index.html`, y el *website endpoint* es HTTP puro, que Cognito rechaza como
  callback.
* **`admin-initiate-auth` no emite custom scopes.** El token bueno solo sale del
  App Client M2M (`client_credentials`) o del flujo del navegador. Esa
  limitacion es justo lo que da gratis los casos 401/403 de la matriz.
* **`ReservedConcurrentExecutions: 1`** mitiga (no resuelve) la perdida de
  estado en memoria. Si la cuenta no permite reservar, desplegar con
  `ReservedConcurrency=-1`.

La tabla completa de sintomas y causas esta en `aws/README.md` §8.

---

## Donde esta cada cosa

| Documento | Para que |
|---|---|
| `README.md` | Vision general, arquitectura, matriz de seguridad, desviaciones declaradas |
| `aws/README.md` | Contrato de cada stack, orden de despliegue, restricciones del Learner Lab, tabla de problemas |
| `back/README.md` | Decisiones del backend y quien produce cada codigo de respuesta |
| `front/README.md` | Estructura Angular y recorrido de comprobacion en navegador |
| `bruno/README.md` | Por que la matriz vive en los entornos y no en peticiones duplicadas |
