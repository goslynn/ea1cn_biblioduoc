# Infraestructura · Biblioteca Duoc

Toda la infraestructura del proyecto, en **CloudFormation**: una plantilla YAML
por servicio, un stack por plantilla, desplegadas con **AWS CLI v2** sobre una
cuenta de **AWS Academy Learner Lab**.

Aqui no hay clics de consola ni comandos imperativos que creen recursos: si
algo existe en AWS, esta declarado en un `.yaml` de este directorio.

---

## 1. Que se construye

```
                       ┌──────────────────────────────┐
  Navegador ──────────▶│  S3  biblioteca-web-<cuenta> │   web.yaml
                       │  Angular compilado (HTTPS)   │
                       └──────────────┬───────────────┘
                                      │  ① login  (code + PKCE)
                                      ▼
                       ┌──────────────────────────────┐
                       │  Cognito                     │   cognito.yaml
                       │   User Pool                  │
                       │   Resource Server            │
                       │     biblioteca-api/acceso    │
                       │   App Client SPA  (publico)  │
                       │   App Client M2M  (secreto)  │
                       │   Hosted UI / dominio        │
                       └──────────────┬───────────────┘
                                      │ ② access_token
  ③ GET /test/api/libros              ▼
     Authorization: Bearer   ┌──────────────────────────────┐
  ──────────────────────────▶│  API Gateway · REST · test   │  api.yaml
                             │   authorizer COGNITO_USER_.. │
                             │   AuthorizationScopes        │
                             │   OPTIONS MOCK + Gateway-    │
                             │     Responses (CORS)         │
                             └──────────────┬───────────────┘
                                            │ ④ AWS_PROXY (payload 1.0)
                                            ▼
                             ┌──────────────────────────────┐
                             │  Lambda java21               │  backend.yaml
                             │   Lambda Web Adapter         │
                             │   Spring Boot (valida otra   │
                             │     vez el mismo token)      │
                             │   [Function URL de la demo]  │
                             └──────────────┬───────────────┘
                                            │ ⑤ lee su codigo al desplegar
                                            ▼
                             ┌──────────────────────────────┐
                             │  S3 biblioteca-artifacts-…   │  artifacts.yaml
                             │  privado · versionado · 7 d  │
                             └──────────────────────────────┘
```

### Quien habla con quien, y con que credencial

| Origen | Destino | Como | Credencial |
|---|---|---|---|
| Navegador | Hosted UI | redireccion HTTP | ninguna (cliente publico + PKCE) |
| Navegador | `/oauth2/token` | POST form-urlencoded | `code` + `code_verifier`, **sin secreto** |
| Navegador | API Gateway | `Authorization: Bearer` | `access_token` |
| API Gateway | Cognito | descarga el JWKS | ninguna (endpoint publico) |
| API Gateway | Lambda | `AWS_PROXY` | `AWS::Lambda::Permission` |
| Lambda | S3 artefactos | lee el codigo al desplegar | **execution role**, sin claves estaticas |
| Spring Boot | Cognito | descarga el JWKS | ninguna |
| `bruno-env.sh` | `/oauth2/token` | `client_credentials` | App Client M2M + secreto |
| Scripts | todo lo demas | AWS CLI | credenciales temporales del lab |

En ningun punto del sistema hay una Access Key estatica.

---

## 2. Mapa de archivos

### Plantillas

| Archivo | Stack | Crea | Depende de |
|---|---|---|---|
| `artifacts.yaml` | `biblioteca-artifacts` | Bucket privado, versionado, con ciclo de vida de 7 dias | — |
| `web.yaml` | `biblioteca-web` | Bucket publico del sitio (endpoint REST, HTTPS) | — |
| `cognito.yaml` | `biblioteca-cognito` | User Pool, Resource Server + scope, App Client SPA, App Client M2M, dominio | — |
| `backend.yaml` | `biblioteca-backend` | Lambda java21 + LogGroup (+ Function URL condicional) | `artifacts`, `cognito`, `web`, y el ZIP ya subido |
| `api.yaml` | `biblioteca-api` | REST API completa: recursos, metodos, authorizer, scopes, CORS, stage, permiso | `cognito`, `backend`, `web` |

### Scripts

| Archivo | Que hace |
|---|---|
| `scripts/bootstrap.sh` | Levanta todo en orden de dependencia. Idempotente. Es el unico que necesitas a diario |
| `scripts/teardown.sh` | Borra todo en orden inverso, vaciando los buckets primero. Pide confirmacion |
| `scripts/_comun.sh` | No se ejecuta solo: funciones compartidas (mensajes, requisitos, lectura de Outputs) |
| `pipeline/build-backend.sh` | `mvnw package` → ZIP → S3 → despliegue del stack del backend |
| `pipeline/api-deploy.sh` | `create-deployment` al stage. **Imprescindible tras cada cambio de la API** |
| `pipeline/publish-web.sh` | Genera la config del frontend → `ng build` → `s3 sync` |
| `pipeline/bruno-env.sh` | Obtiene los tokens de cada caso y escribe los entornos de Bruno |

Ningun script prueba la API. Eso es trabajo de Bruno y del navegador.

---

## 3. Contrato de cada stack

Los stacks **no se acoplan** con `Export`/`Fn::ImportValue`: se encadenan con
parametros explicitos que pasa `bootstrap.sh`. Es mas verboso, pero se ve el
flujo de datos y se puede recrear cualquier stack sin tocar los demas.

```
artifacts.yaml
  entra : ProjectName, RetencionVersionesDias
  sale  : ArtifactsBucketName ───────────────▶ build-backend.sh, backend.yaml

web.yaml
  entra : ProjectName
  sale  : SiteBucketName ────────────────────▶ publish-web.sh
          SiteOrigin ────────────────────────▶ api.yaml (CORS), backend.yaml
          SiteUrl ───────────────────────────▶ cognito.yaml (callbacks), navegador

cognito.yaml
  entra : ProjectName, CallbackUrls, LogoutUrls, ResourceServerId, ScopeName
  sale  : UserPoolArn ───────────────────────▶ api.yaml (authorizer)
          UserPoolId ────────────────────────▶ bruno-env.sh, usuario demo
          SpaClientId ───────────────────────▶ frontend, bruno-env.sh
          M2mClientId ───────────────────────▶ bruno-env.sh
          IssuerUrl ─────────────────────────▶ backend.yaml
          ScopeCompleto ─────────────────────▶ api.yaml, backend.yaml, frontend
          HostedUiDomain, TokenUrl, LoginUrl ▶ frontend, bruno-env.sh

backend.yaml
  entra : ProjectName, LabRoleArn, ArtifactsBucketName, ArtifactsObjectKey,
          ArtifactsObjectVersion, IssuerUrl, RequiredScope, WebOrigin,
          LambdaMemoryMb, ReservedConcurrency, EnableBypassDemoUrl
  sale  : FunctionArn, FunctionName ─────────▶ api.yaml
          LogGroupName ──────────────────────▶ aws logs tail
          BypassUrl (condicional) ───────────▶ demo de Defense in Depth

api.yaml
  entra : ProjectName, UserPoolArn, LambdaFunctionArn, LambdaFunctionName,
          RequiredScope, AllowOrigin, StageName
  sale  : ApiEndpoint ───────────────────────▶ frontend, Bruno
          ApiId ─────────────────────────────▶ api-deploy.sh
```

### El ciclo aparente, y como se rompe

Cognito necesita la URL del frontend (lista blanca de callbacks) y el frontend
necesita los datos de Cognito. Parece un huevo y una gallina.

Se rompe **calculando el nombre del bucket antes de crearlo**: `web.yaml` lo
llama siempre `biblioteca-web-<AccountId>`, asi que `bootstrap.sh` deduce la URL
con un solo `sts get-caller-identity` y se la pasa a `cognito.yaml` en el mismo
despliegue. Cero despliegues dobles.

---

## 4. Desplegar

```sh
awsacademy start                # credenciales frescas (caducan cada ~4 h)
./aws/scripts/bootstrap.sh
```

Orden que sigue, y por que:

1. `artifacts`, `web` y `cognito` **en paralelo**: no dependen de nadie.
2. `build-backend.sh`: necesita el bucket (1), el issuer y el scope (Cognito) y
   el origen del sitio (web).
3. `api`: necesita el ARN del pool y el de la funcion.
4. `api-deploy.sh`: publica al stage.
5. Usuario de demostracion, con contrasena aleatoria.
6. `bruno-env.sh`: entornos de prueba con tokens reales.
7. `publish-web.sh`: configura, compila y sube el frontend.

### Variables que acepta

| Variable | Por defecto | Para que |
|---|---|---|
| `PROJECT_NAME` | `biblioteca` | Prefijo de stacks, buckets y funcion |
| `AWS_REGION` | `us-east-1` | Unica region utilizable en el lab |
| `STAGE_NAME` | `test` | Stage de API Gateway |
| `DEMO_USER` | `alumno@duoc.cl` | Cuenta de demostracion |
| `SKIP_WEB` | `false` | No compilar ni subir el frontend |
| `LAB_ROLE_ARN` | se deduce | Rol de ejecucion de la Lambda |

### Solo una parte

```sh
./aws/pipeline/build-backend.sh    # cambiaste codigo Java
./aws/pipeline/publish-web.sh      # cambiaste el frontend
./aws/pipeline/api-deploy.sh       # cambiaste rutas, metodos o scopes
./aws/pipeline/bruno-env.sh        # los tokens caducaron (60 min)
```

### Desmontar

```sh
./aws/scripts/teardown.sh          # pide escribir BORRAR
./aws/scripts/teardown.sh --yes    # sin preguntar
```

Vacia los buckets **antes** de borrar los stacks, incluidas todas las versiones
y los delete markers del bucket versionado: sin eso, CloudFormation deja el
stack en `DELETE_FAILED`.

---

## 5. La demo de Defense in Depth

### Lo que se intento primero, y por que no sirve aqui

`backend.yaml` tiene el parametro `EnableBypassDemoUrl`, que crea una
`AWS::Lambda::Url` con `AuthType: NONE` mas su `AWS::Lambda::Permission` para
`lambda:InvokeFunctionUrl` con `Principal: "*"`. Se activo y se midio:

```
HTTP/1.1 403 Forbidden
x-amzn-ErrorType: AccessDeniedException
```

El permiso se creo bien (`aws lambda get-policy` lo confirma) y `AuthType` es
`NONE`. Quien rechaza es **la cuenta de AWS Academy**, que prohibe las Function
URL anonimas, y lo hace antes de llegar a la funcion. La plantilla conserva el
parametro porque el codigo es correcto y funciona en una cuenta sin esa
restriccion.

### La via que si permite el laboratorio

`aws lambda invoke` tambien se salta API Gateway por completo, que es lo que la
demostracion necesita:

```sh
TOKEN=$(python3 -c "import re;print(re.search(r'name: ACCESS_TOKEN\n    value: \"([^\"]*)\"',open('bruno/environments/aws.yml').read()).group(1))")

cat > /tmp/evento.json <<EOF
{"resource":"/api/libros","path":"/api/libros","httpMethod":"GET",
 "headers":{"Host":"x","Authorization":"Bearer ${TOKEN}"},
 "requestContext":{"resourcePath":"/api/libros","httpMethod":"GET","stage":"test"},
 "body":null,"isBase64Encoded":false}
EOF

aws lambda invoke --function-name biblioteca-api \
  --payload fileb:///tmp/evento.json /tmp/salida.json
python3 -c "import json;print(json.load(open('/tmp/salida.json'))['statusCode'])"
```

Quitando la cabecera `Authorization`, cambiandola por `Bearer abc` o usando un
token sin el scope, se obtienen los cuatro casos. Medido: **401 · 401 · 403 ·
200**. El authorizer no vio ninguna de esas peticiones, y aun asi ninguna
entrego datos sin un token valido con el scope correcto.

El detalle completo, con la tabla y el matiz de que "vigilada" no es lo mismo
que "cerrada", esta en `ANEXO-EA1.md` §5.

---

## 6. Como ver que pasa

```sh
# Logs de la aplicacion (arranque de Spring, excepciones, peticiones)
aws logs tail /aws/lambda/biblioteca-api --follow --region us-east-1

# Outputs de un stack
aws cloudformation describe-stacks --stack-name biblioteca-api \
  --query 'Stacks[0].Outputs' --output table

# Por que fallo un despliegue
aws cloudformation describe-stack-events --stack-name biblioteca-api \
  --query "StackEvents[?contains(ResourceStatus,'FAILED')].[LogicalResourceId,ResourceStatusReason]" \
  --output table

# Validar una plantilla sin desplegarla
aws cloudformation validate-template --template-body file://aws/api.yaml
```

Los 401 y 403 del authorizer **no aparecen en los logs de la Lambda**: API
Gateway rechaza antes de invocarla. Si buscas un 401 en CloudWatch y no esta,
es por eso, y es la respuesta correcta.

---

## 7. Restricciones de AWS Academy que condicionan todo

1. **No se pueden crear roles ni politicas IAM.** Ninguna plantilla declara
   `AWS::IAM::*`: `backend.yaml` recibe el ARN del rol preexistente `LabRole`
   como parametro.
2. **Region `us-east-1`**, casi todo lo demas esta bloqueado.
3. **Las credenciales caducan cada ~4 horas.** Es la causa numero uno de fallos
   inexplicables. `awsacademy start`.
4. **Los nombres globales llevan `${AWS::AccountId}`**: los buckets y el dominio
   de Cognito son unicos en todo AWS, no solo en tu cuenta.

---

## 8. Problemas conocidos y como se resuelven

| Sintoma | Causa | Solucion |
|---|---|---|
| Cambias un metodo y el stage sigue sirviendo lo viejo | `AWS::ApiGateway::Deployment` es inmutable y CloudFormation no lo recrea | `./aws/pipeline/api-deploy.sh` |
| `Allow-Origin` sale con comillas literales, o no sale | Faltan las comillas simples dentro de las dobles en `ResponseParameters` | `"'https://…'"` |
| Un 401 se ve en el navegador como `status 0` / *blocked by CORS* | Faltan los `GatewayResponse` `DEFAULT_4XX`/`5XX` | Estan en `api.yaml`; comprueba que el origen coincida |
| El 200 llega a Bruno pero el navegador lo bloquea | Con `AWS_PROXY`, API Gateway **no puede** anadir cabeceras a la respuesta real: la pone Spring | Revisa `BIBLIOTECA_ORIGEN` en la Lambda y `ConfiguracionCors` |
| `500 Internal Server Error` en todas las rutas | Falta `AWS::Lambda::Permission` | Redespliega `api.yaml` |
| El preflight `OPTIONS` devuelve 401 | Se le puso authorizer | `AuthorizationType: NONE` en OPTIONS, siempre |
| `scope does not exist` al crear Cognito | Los App Clients se crearon antes que el Resource Server | `DependsOn: ResourceServer` (ya esta en la plantilla) |
| 403 con un token recien pedido | Vino de `admin-initiate-auth`, que **no emite custom scopes** | Usa el cliente M2M: `./aws/pipeline/bruno-env.sh` |
| 401 con un token que parece bueno | Caducado (60 min), de otro pool, o copiado a medias | `./aws/pipeline/bruno-env.sh` |
| `Task timed out after 30.00 seconds` en la primera llamada | Arranque en frio de la JVM | Sube `LambdaMemoryMb` (mas memoria = mas CPU) |
| `CREATE_FAILED: log group already exists` | La Lambda se adelanto a crear su log group | El `LogGroup` esta declarado en la plantilla; borra el huerfano y reintenta |
| `ExpiredToken` en cualquier `aws` | Credenciales del lab vencidas | `awsacademy start` |
| `DELETE_FAILED` en un stack con bucket | El bucket tiene objetos o versiones | `teardown.sh` los vacia primero |
| Un 404 de Spring llega al cliente como **403 con cuerpo vacio** | El reenvio interno a `/error` vuelve a pasar por Spring Security y cae en el `denyAll()`. **Los tests de MockMvc no lo detectan** | `.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()` en `SecurityConfig` (ya esta) |
| Un token valido sin el scope devuelve **401 y no 403** | No es un fallo: el authorizer `COGNITO_USER_POOLS` responde asi. **Medido** | Es el comportamiento real; el 403 por autorizacion lo da Spring. Ver `ANEXO-EA1.md` §3 |
| Un 403 donde esperabas un 404 | API Gateway contesta **403 Missing Authentication Token** a cualquier ruta sin recurso declarado | Antes de mirar el token, comprueba que la ruta exista en `api.yaml` |
| La Function URL responde `403 AccessDeniedException` | AWS Academy prohibe las Function URL anonimas, sin importar el permiso | Usa `aws lambda invoke` para la demo (§5) |
| El sitio en S3 responde 403 | Los cuatro flags de `PublicAccessBlock` bloquean la bucket policy | En `web.yaml` estan los cuatro en `false` a proposito |
| Cognito rechaza el callback | Solo acepta `https://`, con la unica excepcion de `http://localhost` | Usa el endpoint REST de S3, no el *website endpoint* |
| `ReservedConcurrentExecutions` falla al desplegar | La cuenta del lab no permite reservar concurrencia | Despliega con `ReservedConcurrency=-1` (desactiva la reserva) |
