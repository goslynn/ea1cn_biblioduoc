# Plan EA1 · Proyecto AWS Cloud Native

**Traducción operativa de la guía `DSY1107 · EA1 FULLSTACK CLOUD NATIVE EN AWS` (Prof. Aldo Pizarro)
al flujo de trabajo de este equipo: CloudFormation por servicio, AWS CLI v2, Bruno y README obligatorio.**

Este documento es agnóstico del dominio de negocio: no habla de pedidos, de panchos ni de nada.
Todo lo variable son placeholders que se fijan una vez, en la §3.

Cubre los **22 ítems del checklist de autoevaluación EA1** y los **19 pasos del recorrido
recomendado** de la guía. Construye de cero: no audita proyectos existentes.

---

## 0. Cómo invocar este plan en una sesión fresca

Pega esto, rellenando el bloque de valores:

```
Lee ./PLAN-EA1-CLOUD-NATIVE.md y ejecútalo de principio a fin para un proyecto nuevo.

Valores del proyecto:
  PROYECTO   = <slug en minúsculas, p.ej. inventario>
  RECURSO    = <recurso REST en plural, p.ej. articulos>
  GRUPO      = <groupId Maven, p.ej. cl.duoc>
  PAQUETE    = <paquete Java, p.ej. cl.duoc.inventario>
  REGION     = us-east-1

Instrucciones extra:
  <aquí lo que quieras cambiar: otro frontend, omitir fases, endpoints
   adicionales, reglas de negocio, etc.>
```

**Antes del primer comando `aws`, invoca el skill `aws-academy-cloudformation`.** Este plan asume
sus reglas y no las repite: una plantilla YAML comentada por servicio, un stack por plantilla,
scripts de shell solo para bootstrap/teardown/pipeline, integraciones probadas con Bruno o
navegador, y README obligatorio.

**Regla de oro de la guía, que gobierna todo el documento:** no diagnostiques dos capas a la vez.
Cada fase termina en un checkpoint. **Si un checkpoint falla, detente ahí.** No avances a la fase
siguiente para "ver si se arregla solo": no se arregla, y habrás perdido la capacidad de aislar el
error.

---

## 1. Desviación declarada respecto del canon del profesor

La guía prescribe un sustrato concreto. Nosotros conservamos una pieza y sustituimos otra, de
forma consciente y documentada. **Esto se declara en el README del proyecto, no se esconde.**

| Pieza del canon | Qué hacemos | Por qué | Cómo se conserva el objetivo de aprendizaje |
|---|---|---|---|
| **EC2** (§4): AMI, key pair, `dnf install corretto`, `server.port=8888`, SG abierto | **Lambda + AWS Lambda Web Adapter** | La IP pública cambia en cada reinicio y la instancia muere al cerrar el lab: dos fuentes de fallo que la guía misma lista en §27. El **mismo JAR** corre con `java -jar` en local y dentro de Lambda, sin tocar código ni `pom.xml` | Ítem 03 (*"desplegado y sé revisar sus logs"*) → CloudWatch Logs. Checkpoint §4.2 (*"lee el artefacto de S3 mediante su IAM Role, sin Access Key"*) → el **execution role** de la Lambda hace exactamente eso al desplegar |
| **SG abriendo 8888 a `0.0.0.0/0`** (§4.1) | Nada expuesto | La propia guía avisa en §4.1 que *"NO representa una arquitectura final recomendada"* | — |
| **Bypass directo a `<EC2_IP>:8888`** (§22) | **Lambda Function URL temporal** con `AuthType: NONE`, tras un flag de CloudFormation | Reproducible, se enciende y se apaga, no deja un puerto abierto olvidado | Ítem 19 (*"puedo explicar Defense in Depth y el bypass directo"*) pasa de *explicable* a **demostrable**. Ver Fase 13 |
| **REST API** (§5.1) | **REST API. Se conserva.** | Es la pieza que el canon nombra explícitamente y la que trae `AuthorizationScopes` por método, el mecanismo que produce el 403 | Ítems 04 y 11 al pie de la letra |
| **Consola web** | **AWS CLI v2 + CloudFormation** | Reproducible, versionado, idempotente. La guía nunca pone la consola como objetivo: sus 22 ítems son todos conceptuales o demostrativos | Todos. La evidencia son corridas de Bruno con asserts + el recorrido en navegador + README, mapeados en la §8 |
| **Postman** (§10) | **Bruno**, colección versionada en el repo | Asserts automáticos, vive en git, corre en terminal y en app | Ítem 22 (*diagnosticar 200/401/403/CORS/5xx*) con la matriz completa |
| **`ng serve` en `localhost:4200`** (§13) | Igual. Publicar en S3 es una fase opcional | Es el callback que la guía configura en Cognito. Simplifica la Fase 10 | Ítems 13–16 |

### Consecuencia importante de conservar REST API

REST API v1 no tiene CORS declarativo ni authorizer JWT genérico. A cambio de más YAML obtienes
exactamente lo que el canon quiere enseñar:

- Authorizer `COGNITO_USER_POOLS` (§11.1), no un JWT genérico.
- `AuthorizationScopes` por método (§11.2), que es lo que genera el **403**.
- Métodos `OPTIONS` escritos a mano y `GatewayResponses` `DEFAULT_4XX`/`DEFAULT_5XX` (§6), que es
  lo que hace **visible** un 401 en el navegador en vez de un opaco `status 0`.
- El paso explícito de **Deploy al stage** (§11 ATENCIÓN), que en HTTP API no existe.

---

## 2. Arquitectura objetivo

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  Navegador                                                              │
  │                                                                         │
  │   Angular (localhost:4200)                                              │
  │     ├── Amplify Auth ──① signInWithRedirect() ─────────┐                │
  │     ├── auth.interceptor  (añade el Bearer)            │                │
  │     └── <RECURSO>.service (HttpClient)                 │                │
  └───────────────────────────────────┬────────────────────┼────────────────┘
                                      │                    │
           ④ GET /test/api/<RECURSO>  │                    │  ② Hosted UI
              Authorization:          │                    ▼     login
              Bearer <access_token>   │      ┌──────────────────────────────┐
                                      │      │  Amazon Cognito              │
                                      │      │   · User Pool               │
                                      │      │   · Resource Server ────────┤ define
                                      │      │       <RS_ID>/<SCOPE>       │ el scope
                                      │      │   · App Client SPA (público)│
                                      │      │   · App Client M2M (secreto)│
                                      │      │   · Hosted UI / dominio     │
                                      │      └───────────┬──────────────────┘
                                      │                  │ ③ ?code= → /oauth2/token
                                      │                  │    (PKCE) → access_token
                                      │◀─────────────────┘
                                      ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  API Gateway · REST API · stage "test"                                   │
  │                                                                         │
  │   /api/<RECURSO>        GET  ─┐        OPTIONS (MOCK) ── preflight CORS  │
  │   /api/<RECURSO>/{id}   GET  ─┤                                         │
  │                               │                                         │
  │                    ┌──────────▼───────────────────────┐                 │
  │                    │ Authorizer COGNITO_USER_POOLS    │                 │
  │                    │  ProviderARNs = User Pool ARN    │                 │
  │                    │  IdentitySource = Authorization  │                 │
  │                    └──────────┬───────────────────────┘                 │
  │                               │                                         │
  │                    AuthorizationScopes = [<RS_ID>/<SCOPE>]              │
  │                               │                                         │
  │      sin token / firma mala ──┼──▶ 401   ─┐                             │
  │      id_token (sin claim      │            │  GatewayResponses          │
  │        "scope")           ────┼──▶ 401     ├─ DEFAULT_4XX / 5XX añaden  │
  │      access_token sin el      │            │  Allow-Origin para que el  │
  │        scope exigido      ────┼──▶ 403   ──┘  navegador MUESTRE el error│
  │                               │                                         │
  │                               ▼ AWS_PROXY (payload 1.0)                 │
  └───────────────────────────────┼─────────────────────────────────────────┘
                                  │
  ┌───────────────────────────────▼─────────────────────────────────────────┐
  │  Lambda · runtime java21 · execution role = LabRole                     │
  │                                                                         │
  │   ┌─────────────────────────────────────────────┐                       │
  │   │ AWS Lambda Web Adapter (layer público)      │                       │
  │   │   evento Lambda  ⇄  HTTP contra :8080       │                       │
  │   └────────────────────┬────────────────────────┘                       │
  │   Handler: run.sh  →  exec java -jar /var/task/app.jar                  │
  │                                                                         │
  │   Spring Boot                                                           │
  │     ├── SecurityConfig  · OAuth2 Resource Server                        │
  │     │     issuer-uri = https://cognito-idp.<REGION>...<POOL_ID>         │
  │     │     .hasAuthority("SCOPE_<RS_ID>/<SCOPE>")   ◀── 2.ª validación   │
  │     └── <RECURSO>Controller  → JSON                                     │
  │                                                                         │
  │   [Function URL AuthType:NONE]  ◀── solo para la demo de Fase 13        │
  └─────────────────────────────────────────────────────────────────────────┘
            ▲
            │ el código viene de aquí al desplegar, vía execution role
  ┌─────────┴───────────────┐
  │  S3 · bucket artefactos │  (privado, versionado, lifecycle 7 días)
  └─────────────────────────┘
```

### Quién habla con quién, y con qué credencial

| Origen | Destino | Cómo | Credencial |
|---|---|---|---|
| Navegador | Cognito Hosted UI | redirect HTTP | ninguna (cliente público + PKCE) |
| Navegador | Cognito `/oauth2/token` | POST form-urlencoded | `code` + `code_verifier`, **sin secreto** |
| Navegador | API Gateway | GET + `Authorization: Bearer` | `access_token` |
| API Gateway | Cognito | descarga JWKS | ninguna (endpoint público) |
| API Gateway | Lambda | `AWS_PROXY` | `AWS::Lambda::Permission` |
| Lambda | S3 artefactos | lectura del código al desplegar | **execution role**, sin claves estáticas |
| Spring Boot | Cognito | descarga JWKS | ninguna |
| Pipeline (Bruno) | Cognito `/oauth2/token` | `client_credentials` | App Client M2M + secreto |
| Pipeline | todo lo demás | AWS CLI | credenciales temporales del Learner Lab |

---

## 3. Parámetros del proyecto

Fija estos valores una vez. Todo el resto del documento los referencia.

| Placeholder | Qué es | Ejemplo | Restricciones |
|---|---|---|---|
| `<PROYECTO>` | slug del proyecto; prefijo de stacks y del dominio Cognito | `inventario` | `[a-z0-9-]+`, globalmente único en la región por el dominio |
| `<RECURSO>` | recurso REST en plural | `articulos` | minúsculas, sin `/` |
| `<GRUPO>` | `groupId` Maven | `cl.duoc` | — |
| `<ARTEFACTO>` | `artifactId` Maven | `inventario-backend` | — |
| `<PAQUETE>` | paquete Java raíz | `cl.duoc.inventario` | — |
| `<REGION>` | región AWS | `us-east-1` | en Learner Lab, casi obligatoriamente `us-east-1` |
| `<RS_ID>` | identifier del Resource Server | `<PROYECTO>-api` | libre, pero **no** una URL si quieres legibilidad |
| `<SCOPE>` | nombre del custom scope | `<RECURSO>-read` | — |
| `<SCOPE_COMPLETO>` | derivado | `<RS_ID>/<SCOPE>` | **este** es el valor que va en todos lados |
| `<STAGE>` | stage de API Gateway | `test` | el canon usa `test` (§5.2) |

Nombres derivados, sin decisiones adicionales:

```
stacks    <PROYECTO>-artifacts   <PROYECTO>-cognito   <PROYECTO>-backend
          <PROYECTO>-api         <PROYECTO>-web  (opcional)
buckets   <PROYECTO>-artifacts-<ACCOUNT_ID>        <PROYECTO>-web-<ACCOUNT_ID>
lambda    <PROYECTO>-api
logs      /aws/lambda/<PROYECTO>-api
dominio   https://<PROYECTO>-<ACCOUNT_ID>.auth.<REGION>.amazoncognito.com
url api   https://<API_ID>.execute-api.<REGION>.amazonaws.com/<STAGE>/api/<RECURSO>
```

**No copies identificadores de otro equipo** (§2 de la guía). El `ACCOUNT_ID` sale de
`aws sts get-caller-identity` y hace único todo lo demás sin pedirte nada.

---

## 4. Herramientas

| Herramienta | Para qué | Verificar |
|---|---|---|
| AWS CLI **v2** | toda la infraestructura | `aws --version` |
| Java 21 (o 17) | compilar el backend | `java -version` |
| Maven Wrapper | build reproducible; **no** hace falta Maven instalado | `./mvnw -v` |
| Node.js + Angular CLI | el frontend | `node -v && ng version` |
| `zip` | armar el paquete de la Lambda | `zip -v` |
| `python3` | leer JSON en los scripts | `python3 --version` |
| **Bruno** (`bru`) | pruebas HTTP versionadas | `bru --version` |
| Navegador con DevTools | §28, diagnóstico de CORS y preflight | — |

Sustituciones respecto de la guía: **Bruno en vez de Postman** (asserts y versionado) y
**CloudFormation en vez de consola**. Postman sigue sirviendo para el §10 si te lo piden: añade
`https://oauth.pstmn.io/v1/callback` a los `CallbackURLs` del client SPA y queda disponible.

### Credenciales del Learner Lab

Caducan cada ~4 horas y son la causa nº1 de errores raros. `AWS Details → AWS CLI → Show`, y pega
el bloque completo en `~/.aws/credentials` reemplazando lo anterior. Fija la región en
`~/.aws/config`. Verifica con `aws sts get-caller-identity`.

**Dos restricciones de AWS Academy que condicionan todas las plantillas:**

1. **No se pueden crear roles ni políticas IAM.** Ninguna plantilla crea IAM. `backend.yaml` recibe
   el ARN del rol preexistente **`LabRole`** como parámetro.
2. Región `us-east-1`; casi todo lo demás está bloqueado.

---

## 5. Los stacks

Una plantilla por servicio, un stack por plantilla. Se encadenan con **parámetros explícitos**, no
con `Fn::ImportValue`: es más verboso, pero se ve el flujo de datos y puedes recrear stacks en
cualquier orden.

| # | Archivo | Stack | Crea | Depende de |
|---|---|---|---|---|
| 1 | `aws/artifacts.yaml` | `<PROYECTO>-artifacts` | Bucket S3 privado + versionado + lifecycle | — |
| 2 | `aws/cognito.yaml` | `<PROYECTO>-cognito` | User Pool, Resource Server, 2 App Clients, dominio | — |
| 3 | `aws/backend.yaml` | `<PROYECTO>-backend` | Lambda + LogGroup (+ Function URL condicional) | 1, y el ZIP ya subido |
| 4 | `aws/api.yaml` | `<PROYECTO>-api` | REST API completa + authorizer + CORS + stage | 2 y 3 |
| 5 | `aws/web.yaml` | `<PROYECTO>-web` | *(opcional)* Bucket S3 del sitio | — |

### Contrato de cada stack

```
artifacts.yaml
  in  : ProjectName
  out : BucketName ──────────────────────────────────▶ backend.yaml, pipeline

cognito.yaml
  in  : ProjectName, CallbackUrls, LogoutUrls
  out : UserPoolArn ─────────────────────────────────▶ api.yaml  (authorizer)
        UserPoolId ──────────────────────────────────▶ backend (issuer-uri), pipeline
        SpaClientId ─────────────────────────────────▶ frontend
        M2mClientId ─────────────────────────────────▶ pipeline (Bruno)
        HostedUiDomain, IssuerUrl, ScopeCompleto ────▶ frontend, api.yaml, backend

backend.yaml
  in  : ProjectName, ArtifactsBucket, ArtifactKey, LabRoleArn,
        IssuerUrl, RequiredScope, EnableBypassDemoUrl
  out : FunctionArn, FunctionName ───────────────────▶ api.yaml
        BypassUrl  (condicional) ───────────────────▶ demo de Fase 13

api.yaml
  in  : ProjectName, UserPoolArn, LambdaFunctionArn, LambdaFunctionName,
        RequiredScope, AllowOrigins, StageName, ResourcePath
  out : ApiEndpoint, ApiId ──────────────────────────▶ frontend, Bruno

web.yaml  (opcional)
  in  : ProjectName
  out : WebOrigin, WebCallbackUrl ───────────────────▶ cognito.yaml, api.yaml
```

### El ciclo aparente, y cómo se rompe

Cognito necesita la URL del frontend (lista blanca de callbacks) y la API necesita su origen
(CORS)… pero el frontend todavía no existe. Con `ng serve` no hay ciclo: la URL es
`http://localhost:4200`, conocida de antemano. Si además publicas en S3 (fase opcional), el ciclo
se rompe **calculando el nombre del bucket antes de crearlo**: `web.yaml` lo nombra
`<PROYECTO>-web-<ACCOUNT_ID>`, así que la URL es predecible con un solo `sts get-caller-identity`.
Deja `localhost:4200` en ambas listas blancas para poder seguir desarrollando en local.

### Scripts del pipeline

| Script | Qué hace |
|---|---|
| `aws/scripts/bootstrap.sh` | Todo en orden, idempotente. Es el único que necesitas en el día a día |
| `aws/scripts/teardown.sh` | Borra en orden inverso, vaciando buckets (y versiones) primero |
| `aws/scripts/_comun.sh` | No se ejecuta solo: mensajes, requisitos y lectura de Outputs compartidos |
| `aws/pipeline/build-backend.sh` | `mvnw package` → ZIP → S3 → `cloudformation deploy` del stack del backend |
| `aws/pipeline/api-deploy.sh` | `aws apigateway create-deployment` al stage. **Ver la trampa de la §9** |
| `aws/pipeline/bruno-env.sh` | Lee Outputs, pide un token por credencial y escribe `bruno/environments/aws*.yml` |
| `aws/pipeline/publish-web.sh` | Genera la config del front, `ng build` y sync a S3 |

> **Correccion.** Los nombres y la ubicación siguen al skill
> `aws-academy-cloudformation`: `scripts/` para levantar y desmontar,
> `pipeline/` para construir y publicar artefactos. Y el backend se publica con
> `cloudformation deploy` en vez de `lambda update-function-code`, para que la
> plantilla siga siendo la única fuente de la verdad sobre qué código corre.

---

## 6. El procedimiento, fase por fase

Las fases siguen el **recorrido recomendado del §31** de la guía. Cada una termina en un checkpoint
verificable.

---

### Fase 0 · Preflight

Sin esto, todo lo demás falla de formas confusas.

1. `aws sts get-caller-identity` responde. Guarda el `Account`.
2. `java -version`, `node -v`, `ng version`, `zip -v`, `python3 --version`.
3. Crea el árbol del repo:

```
<PROYECTO>/
├── aws/
│   ├── artifacts.yaml  cognito.yaml  backend.yaml  api.yaml  [web.yaml]
│   ├── scripts/{bootstrap,teardown}.sh    ◀── levantar y desmontar
│   ├── pipeline/*.sh                      ◀── build y publicacion de artefactos
│   └── README.md                          ◀── obligatorio
├── bruno/
│   ├── opencollection.yml
│   ├── environments/            ◀── uno por CREDENCIAL, generados (ver Fase 9)
│   └── <recurso>/{folder.yml, list.yml, get.yml, create.yml}
├── front/                 ◀── proyecto Angular
├── back/                  ◀── backend Spring Boot (src/, pom.xml, mvnw)
└── .gitignore
```

> **Correccion respecto de versiones anteriores de este plan.** El backend vive
> en `back/`, no en la raiz, para que los cuatro componentes del proyecto se
> vean al mismo nivel. Los scripts se reparten entre `aws/scripts/` (levantar y
> desmontar) y `aws/pipeline/` (construir y publicar), que es la division que
> pide el skill `aws-academy-cloudformation`. Y la coleccion de Bruno se
> organiza **por recurso**, no con prefijos numericos: el motivo esta en la
> Fase 9.

4. `.gitignore` desde el primer commit: `target/`, `node_modules/`, `.angular/`, `dist/`,
   `bruno/environments/aws.yml` (lleva tokens), y la config generada del frontend.

> **Checkpoint 0.** El repo existe, las herramientas responden, y `git status` no muestra ni un
> artefacto de build. *(Ítem 21)*

---

### Fase 1 · Backend local (§3)

Spring Initializr → Maven → Java, **solo Spring Web**. `groupId` `<GRUPO>`, `artifactId`
`<ARTEFACTO>`.

Estructura mínima que la guía pide en §3.1:

```
src/main/java/<PAQUETE>/
    Application.java
    controller/<RECURSO>Controller.java
src/main/resources/application.properties
```

El controlador expone **dos** endpoints. La guía solo pide el primero; el segundo es el que después
demuestra que la petición llegó de verdad hasta Spring:

- `GET /api/<RECURSO>` → lista.
- `GET /api/<RECURSO>/{id}` → un elemento, y **`404` vía `ResponseStatusException`** cuando no
  existe. Ese 404 no lo puede producir la infraestructura: es la firma de Spring.

Datos en memoria, sin base de datos. La persistencia es la extensión de la §10.

> **Checkpoint 1.** `./mvnw spring-boot:run` y `GET http://localhost:8080/api/<RECURSO>` responde
> `200` con JSON. Un id inexistente responde `404`.
> **Si falla aquí, no sigas a Lambda ni a API Gateway.** *(Ítem 02)*

---

### Fase 2 · El artefacto en S3 (§4.2)

`artifacts.yaml`: bucket privado, `BlockPublicAccess` en los cuatro flags, versionado activado, y
una regla de lifecycle que borre versiones antiguas a los 7 días (cada JAR de Spring Boot pesa
~20 MB).

`build-and-deploy-backend.sh` hace: `./mvnw clean package` → arma el ZIP con `app.jar` y `run.sh`
→ `chmod +x run.sh` **dentro del ZIP** → `aws s3 cp`.

El `run.sh` es todo el pegamento del Web Adapter:

```sh
#!/bin/sh
exec java -jar /var/task/app.jar
```

> **Checkpoint 2.** `aws s3 ls s3://<PROYECTO>-artifacts-<ACCOUNT_ID>/` lista el ZIP. Ninguna
> credencial estática ha tocado el proceso: solo las temporales del lab.
> *(Equivalente al checkpoint §4.2 del canon)*

---

### Fase 3 · Backend desplegado (§4 sustituido)

`backend.yaml` crea la Lambda. Las cuatro propiedades que la hacen funcionar:

```yaml
Runtime: java21
Handler: run.sh                       # un script, no una clase Java
Layers:
  # La cuenta 753240598075 es de AWS. Fija la versión del layer explícitamente
  # y verifícala: la más reciente cambia con el tiempo.
  - !Sub "arn:aws:lambda:${AWS::Region}:753240598075:layer:LambdaAdapterLayerX86:28"
Environment:
  Variables:
    AWS_LAMBDA_EXEC_WRAPPER: /opt/bootstrap   # el layer toma el control del arranque
Role: !Ref LabRoleArn                 # AWS Academy: NO se crea IAM, se recibe
MemorySize: 1024                      # más memoria = más CPU = arranque en frío más corto
Timeout: 30
```

Declara también el `AWS::Logs::LogGroup` con `RetentionInDays`, **explícitamente**: si dejas que lo
cree la Lambda, un redespliegue posterior choca con `log group already exists`.

> **Checkpoint 3.** `aws lambda invoke` con un evento de prueba devuelve el JSON del controlador, y
> `aws logs tail /aws/lambda/<PROYECTO>-api --follow` muestra el arranque de Spring.
> **Verifica y anota que el Web Adapter traduce correctamente el payload 1.0 de REST API**, que es
> el único formato que REST API emite. *(Ítem 03)*

---

### Fase 4 · REST API sin seguridad (§5)

Primero que funcione, después se protege. Esa es la lógica de toda la guía.

`api.yaml`, en este orden:

```yaml
RestApi          : AWS::ApiGateway::RestApi          # EndpointConfiguration REGIONAL
ResourceApi      : AWS::ApiGateway::Resource         # PathPart "api",  ParentId = RootResourceId
ResourceColeccion: AWS::ApiGateway::Resource         # PathPart "<RECURSO>", ParentId = ResourceApi
ResourceItem     : AWS::ApiGateway::Resource         # PathPart "{id}",      ParentId = ResourceColeccion
MethodLista      : AWS::ApiGateway::Method           # GET, AuthorizationType NONE  (por ahora)
MethodItem       : AWS::ApiGateway::Method           # GET, AuthorizationType NONE  (por ahora)
Deployment       : AWS::ApiGateway::Deployment       # DependsOn TODOS los Method
Stage            : AWS::ApiGateway::Stage            # StageName <STAGE>
InvokePermission : AWS::Lambda::Permission
```

La integración con Lambda, en cada `Method`:

```yaml
Integration:
  Type: AWS_PROXY
  IntegrationHttpMethod: POST        # SIEMPRE POST: es cómo se invoca a Lambda
  Uri: !Sub "arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${LambdaFunctionArn}/invocations"
```

Y el permiso, sin el cual **todas** las llamadas mueren con un `500` poco descriptivo:

```yaml
InvokePermission:
  Type: AWS::Lambda::Permission
  Properties:
    FunctionName: !Ref LambdaFunctionName
    Action: lambda:InvokeFunction
    Principal: apigateway.amazonaws.com
    SourceArn: !Sub "arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${RestApi}/*"
```

> **Checkpoint 4.** `GET https://<API_ID>.execute-api.<REGION>.amazonaws.com/<STAGE>/api/<RECURSO>`
> responde `200` con **el mismo JSON** que la Fase 1. Todavía sin token: eso es correcto en este
> punto. *(Ítems 04, 05)*

---

### Fase 5 · CORS (§6)

Postman no aplica la política CORS del navegador; Angular sí. Por eso una API puede funcionar en
Bruno y fallar en Chrome. En REST API el CORS se escribe a mano, en dos piezas.

**Pieza 1 — un método `OPTIONS` con integración `MOCK` por cada recurso:**

```yaml
MethodOptionsColeccion:
  Type: AWS::ApiGateway::Method
  Properties:
    HttpMethod: OPTIONS
    AuthorizationType: NONE          # el preflight NUNCA lleva Authorization
    Integration:
      Type: MOCK
      RequestTemplates:
        application/json: '{"statusCode": 200}'
      IntegrationResponses:
        - StatusCode: "200"
          ResponseParameters:
            method.response.header.Access-Control-Allow-Origin:  "'http://localhost:4200'"
            method.response.header.Access-Control-Allow-Headers: "'Content-Type,Authorization'"
            method.response.header.Access-Control-Allow-Methods: "'GET,OPTIONS'"
    MethodResponses:
      - StatusCode: "200"
        ResponseParameters:
          method.response.header.Access-Control-Allow-Origin: true
          method.response.header.Access-Control-Allow-Headers: true
          method.response.header.Access-Control-Allow-Methods: true
```

Fíjate en las **comillas simples dentro de las dobles**: API Gateway espera una expresión, y una
cadena literal se escribe así. Es el error tipográfico más común de esta plantilla.

**Pieza 2 — `GatewayResponses`, que es lo que el §6 marca en ATENCIÓN:**

```yaml
GatewayResponse4xx:
  Type: AWS::ApiGateway::GatewayResponse
  Properties:
    RestApiId: !Ref RestApi
    ResponseType: DEFAULT_4XX
    ResponseParameters:
      gatewayresponse.header.Access-Control-Allow-Origin: "'http://localhost:4200'"
# … e idéntico para DEFAULT_5XX
```

Sin esto, cuando el authorizer rechace con `401`, el navegador verá `status 0` / *"blocked by CORS"*
y no el error real. **Esta pieza es la que hace diagnosticable el resto del laboratorio.**

> **Checkpoint 5.** En DevTools → Network, `OPTIONS` responde `200` con las tres cabeceras
> `Access-Control-Allow-*`, y el `GET` no se bloquea. *(Ítem 06)*

---

### Fase 6 · Cognito: User Pool, clientes y dominio (§7)

`cognito.yaml`. Cinco recursos, y el orden de dependencia importa.

**User Pool.** `UsernameAttributes: [email]`, `AutoVerifiedAttributes: [email]`, `MfaConfiguration: OFF`,
política de contraseña explícita, `AccountRecoverySetting` por email verificado.

**App Client SPA** — el que usa Angular:

```yaml
GenerateSecret: false                 # obligatorio en un browser: todo secreto ahí es público
AllowedOAuthFlowsUserPoolClient: true
AllowedOAuthFlows: [code]             # Authorization Code, no implicit
AllowedOAuthScopes: [openid, email, profile, <SCOPE_COMPLETO>]
SupportedIdentityProviders: [COGNITO]
CallbackURLs: [http://localhost:4200]
LogoutURLs:   [http://localhost:4200]
PreventUserExistenceErrors: ENABLED
```

**App Client M2M** — el que usa el pipeline de pruebas, y que explico en la Fase 9:

```yaml
GenerateSecret: true
AllowedOAuthFlowsUserPoolClient: true
AllowedOAuthFlows: [client_credentials]
AllowedOAuthScopes: [<SCOPE_COMPLETO>]     # client_credentials NO admite openid/email/profile
```

**Dominio.** `Domain: !Sub "${ProjectName}-${AWS::AccountId}"`. El `AccountId` evita la colisión con
otro alumno que haya elegido el mismo prefijo.

> **Checkpoint 6.** Tienes `UserPoolId`, los dos `ClientId`, el dominio, y `AllowedOAuthFlows`
> incluye `code`. Abre `<HostedUiDomain>/oauth2/authorize?...` en el navegador: aparece la pantalla
> de login. *(Ítem 07)*

---

### Fase 7 · Resource Server y custom scope (§9)

**Esta es la fase que más se omite y la que más cuesta omitir.** Sin custom scope no existe el
`403`, y sin el `403` no puedes demostrar la diferencia entre *autenticación* y *autorización* —que
son los ítems 10 y 22, y la mitad de la §27.

```yaml
ResourceServer:
  Type: AWS::Cognito::UserPoolResourceServer
  Properties:
    UserPoolId: !Ref UserPool
    Identifier: <RS_ID>
    Name: <RS_ID>
    Scopes:
      - ScopeName: <SCOPE>
        ScopeDescription: Lectura de <RECURSO>
```

El scope completo es `<RS_ID>/<SCOPE>` y **ese** es el literal que va en: `AllowedOAuthScopes` de
los dos clientes, `AuthorizationScopes` del método, el `scopes` de Amplify y el `hasAuthority` de
Spring. Un carácter distinto en cualquiera de los cuatro y falla.

> **Trampa de CloudFormation.** Los dos `UserPoolClient` necesitan `DependsOn: ResourceServer`. Sin
> eso, CloudFormation los crea en paralelo y fallan con *"scope does not exist"*.

> **Checkpoint 7.** Ambos App Clients tienen el custom scope habilitado. La guía lo subraya: *"No
> basta con crear el scope: debe estar habilitado en el cliente."* *(Ítem 10)*

---

### Fase 8 · Authorizer y scope en el método (§11)

**Authorizer** — de tipo Cognito, como el canon pide:

```yaml
Authorizer:
  Type: AWS::ApiGateway::Authorizer
  Properties:
    RestApiId: !Ref RestApi
    Name: !Sub "${ProjectName}-cognito"
    Type: COGNITO_USER_POOLS
    IdentitySource: method.request.header.Authorization
    ProviderARNs: [!Ref UserPoolArn]
    # Token validation regex: vacío, salvo necesidad explícita (§11.1)
```

**Y ahora se cambian los dos métodos** de la Fase 4:

```yaml
AuthorizationType: COGNITO_USER_POOLS
AuthorizerId: !Ref Authorizer
AuthorizationScopes: [<SCOPE_COMPLETO>]
```

Aquí ocurre lo importante, y merece entenderse bien:

> **Por qué `AuthorizationScopes` obliga a usar el `access_token`.**
> Cuando un método declara `AuthorizationScopes`, API Gateway exige que el token traiga un claim
> `scope`. Un **`id_token` no tiene claim `scope`** — nunca lo tiene, por diseño de OIDC. Así que
> el `id_token` deja de pasar, sin que tengas que hacer nada más.
>
> Esto convierte el consejo del §8 (*"Para autorizar la API usa Access Token"*) de **advertencia
> verbal** en **restricción técnica comprobable**. Es, con diferencia, la mejor forma de demostrar
> el ítem 09.

> **Checkpoint 8.** Redespliega al stage (§11 ATENCIÓN: *"en REST API los cambios no llegan al
> stage hasta volver a desplegar"*). Una llamada sin token ya no devuelve `200`. *(Ítems 11, 12)*

---

### Fase 9 · La matriz de pruebas de seguridad (§10, §12)

Aquí se sustituye Postman por Bruno, y aquí está el hallazgo técnico que reordena la fase.

#### Por qué hacen falta dos fuentes de token

`admin-initiate-auth` es la vía headless obvia para automatizar… **pero no emite custom scopes.**
Los tokens de `InitiateAuth` llevan `scope: "aws.cognito.signin.user.admin"` y nada más: los custom
scopes solo se emiten por los endpoints OAuth2 (`/oauth2/authorize`, `/oauth2/token`). Y el flujo
del frontend, Authorization Code + PKCE, **exige un navegador** por definición: hay una pantalla de
login de por medio.

La salida es el **App Client M2M** de la Fase 6, con `client_credentials`: usuario ninguno, secreto
sí, y el custom scope emitido en una sola llamada sin navegador.

Lo elegante es que las dos fuentes, juntas, te dan las cuatro filas de la matriz **gratis**:

| Fuente | Cómo se obtiene | Qué trae | Para qué fila sirve |
|---|---|---|---|
| Client M2M | `POST /oauth2/token`, `grant_type=client_credentials`, Basic auth | `access_token` **con** `<SCOPE_COMPLETO>` | el `200` |
| `admin-initiate-auth` | AWS CLI, usuario+contraseña | `access_token` **sin** el scope, y un `id_token` | el `403` y un `401` |
| ninguna | — | — | el `401` sin cabecera |

#### La colección: una request por endpoint, la matriz en los ENTORNOS

> **Correccion importante respecto de versiones anteriores de este plan.** Aquí se decía "ocho
> peticiones numeradas", una por caso de error. El skill `bruno-collections` lo prohíbe
> explícitamente —*una request por endpoint, y los 401/403/404 se documentan, no se duplican*— y
> **tiene razón**: `04-sin-token-401` y `01-listar` no son dos endpoints, son **el mismo endpoint
> con otra credencial**. Y una credencial es exactamente lo que define un entorno.

La colección queda así:

```
bruno/
├── opencollection.yml            auth bearer {{ACCESS_TOKEN}} declarada UNA vez
├── environments/                 uno por CREDENCIAL, generados y en .gitignore
└── <recurso>/{folder.yml, list.yml, get.yml, create.yml}
```

Cada entorno declara, además del token, **el código que esa credencial debe obtener**
(`ESPERADO_LECTURA` y `ESPERADO_CREACION`), y los tests lo leen:

```js
const esperado = Number(bru.getEnvVar("ESPERADO_LECTURA"));
test("responde lo que corresponde a esta credencial", function () {
  expect(res.getStatus()).to.equal(esperado);
});
```

Así la matriz sigue siendo **automática y verificable** —`bru run` pasa en verde en todos los
casos— pero sin una sola petición duplicada:

| Entorno | Credencial | Lecturas | Crear | Qué demuestra |
|---|---|---|---|---|
| `aws` | cliente M2M **con** el custom scope | `200` | `201` | el camino completo |
| `aws-usuario-sin-scope` | `admin-initiate-auth` | `403` *(medir)* | `403` | **autenticado pero no autorizado** |
| `aws-id-token` | el `id_token` del mismo usuario | `401` | `401` | no tiene claim `scope` → §8 comprobado, no recitado |
| `aws-token-invalido` | una cadena inventada | `401` | `401` | valida la firma de verdad |
| `aws-directo` | Function URL + token válido | `200` | `201` | saltándose el gateway, **Spring** valida igual |
| `aws-directo-sin-token` | Function URL sin token | `401` | `401` | Defense in Depth (tras la Fase 12) |

Lo que sí se duplicaba con razón —el `404` por id inexistente, el `400` por formulario inválido—
tampoco necesita petición propia: son **valores distintos del mismo endpoint**, y viven en los
`params` y en las `variants` del body, documentados en la tabla de respuestas de cada request y
con su cuerpo real guardado en `examples`.

El caso "sin cabecera `Authorization`" tampoco tiene entorno: con el token vacío Bruno manda
igualmente `Authorization: Bearer` y el authorizer responde el mismo `401`. La ausencia total de
cabecera se reproduce poniendo la pestaña *Auth* en *No Auth*, y así está documentado en cada
request.

`bruno-env.sh` escribe todos esos archivos en `bruno/environments/`, que van en `.gitignore`
porque llevan tokens reales dentro.

> **Sobre la fila del `403`.** La guía misma hedge en §12: *"403 **o rechazo de autorización según
> configuración**"*. No asumas el código: **mide el real y anótalo en el README.** Esa medición,
> hecha y documentada, vale más que la tabla copiada.

> **Checkpoint 9.** `cd bruno && bru run --env aws` pasa en verde, y también cada uno de los otros
> entornos (los dos `aws-directo*`, tras las Fases 12 y 13). Sin token falla; con `access_token`
> válido y scope correcto responde `200`. *(Ítems 12, 22)*

---

### Fase 10 · Angular (§13, §14, §15)

```sh
npm install -g @angular/cli
ng new front
cd front && npm install aws-amplify
npm start                      # http://localhost:4200 ANTES de integrar Cognito
```

`src/main.ts`, **antes** de `bootstrapApplication`:

```ts
Amplify.configure({
  Auth: { Cognito: {
    userPoolId: '<USER_POOL_ID>',
    userPoolClientId: '<SPA_CLIENT_ID>',
    loginWith: { oauth: {
      domain: '<HOSTED_UI_DOMAIN sin https://>',
      scopes: ['email', 'openid', 'profile', '<SCOPE_COMPLETO>'],
      redirectSignIn:  ['http://localhost:4200'],
      redirectSignOut: ['http://localhost:4200'],
      responseType: 'code'
    }}
  }}
});
```

Componente principal con `signInWithRedirect`, `signOut`, `fetchAuthSession`, `getCurrentUser` y
botones para iniciar sesión, ver sesión y cerrar sesión. Mostrar el token en pantalla es
pedagógico, no una recomendación de UX.

**El primer consumo de la API se hace a mano** (§16), con `fetch` y el header puesto
explícitamente. Suena redundante teniendo el interceptor dos fases después, pero es deliberado: si
el Bearer lo pone la magia desde el principio, nadie entiende qué hace el interceptor cuando
aparece.

> **Checkpoint 10.** Login redirige a la Hosted UI y vuelve a `localhost:4200`. "Ver sesión"
> obtiene un `access_token`, y su payload contiene `token_use: "access"`, `client_id` y el custom
> scope. *(Ítems 08, 09, 13)*

---

### Fase 11 · Service e interceptor (§17, §18)

```sh
ng generate service <RECURSO>
```

El service encapsula la URL y la llamada; la vista deja de conocer ambas. El interceptor añade el
Bearer a **toda** petición HTTP:

```ts
export const authInterceptor: HttpInterceptorFn = (req, next) =>
  from(fetchAuthSession()).pipe(switchMap(session => {
    const token = session.tokens?.accessToken?.toString();
    if (!token) return next(req);
    return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  }));
```

> **El error que la guía marca dos veces.** `provideHttpClient(withInterceptors([authInterceptor]))`
> debe quedar **DENTRO** del array `providers` de `appConfig`. Si queda después de cerrar el objeto,
> el archivo se ve correcto y el interceptor **no está registrado**. Está en §18.2 y otra vez en la
> tabla del §27.

Sobre **Guards** (§19): un Guard controla *navegación*, el interceptor controla *llamadas HTTP*. Son
responsabilidades distintas, y ocultar una ruta en Angular **no** protege la API. La guía es
explícita: si tu app no tiene rutas privadas, comprende el patrón y **no fabriques estructura
artificial solo para "tener un Guard"**. Documenta la decisión en el README y el ítem 17 queda
cubierto.

> **Checkpoint 11.** DevTools → Network → el `GET` lleva `Authorization: Bearer eyJ...` **sin que
> ningún componente lo haya añadido**. Quita el header manual de la Fase 10 y sigue funcionando.
> *(Ítems 14, 15, 16, 17)*

---

### Fase 12 · Spring Security como Resource Server (§20, §21)

Hasta aquí API Gateway es el **único** control: si algo alcanza la Lambda, el controlador responde
sin mirar nada. Esta fase añade la segunda validación.

```xml
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
</dependency>
```

```properties
spring.security.oauth2.resourceserver.jwt.issuer-uri=https://cognito-idp.<REGION>.amazonaws.com/<USER_POOL_ID>
```

`SecurityConfig` con la regla estricta del §21, no solo `.authenticated()`:

```java
.authorizeHttpRequests(auth -> auth
    .requestMatchers("/api/<RECURSO>/**").hasAuthority("SCOPE_<SCOPE_COMPLETO>")
    .anyRequest().permitAll())
.oauth2ResourceServer(o -> o.jwt(jwt -> {}))
.csrf(csrf -> csrf.disable())
```

Spring convierte el claim `scope` del JWT en authorities con prefijo `SCOPE_`, así que
`<RS_ID>/<SCOPE>` se vuelve `SCOPE_<RS_ID>/<SCOPE>`. La barra dentro del nombre es legal.

> **Endurecimiento opcional, el matiz del §21.** El validador por defecto comprueba firma,
> expiración e issuer, pero **no** audiencia — porque un `access_token` de Cognito no lleva `aud`,
> lleva `client_id`. Si quieres la validación estricta, añade un `OAuth2TokenValidator` propio que
> exija `token_use == "access"` y que `client_id` sea uno de los tuyos. Vale la pena si te preguntan
> por el ítem 18 en profundidad.

> **Checkpoint 12.** Una llamada directa al backend **sin** JWT responde `401`. Con un
> `access_token` válido y el scope correcto, responde `200` — tanto directa como a través de API
> Gateway. *(Ítem 18)*

---

### Fase 13 · Defense in Depth, demostrado (§22)

El canon demuestra esto atacando `http://<EC2_IP>:8888` y saltándose el authorizer. En serverless
no hay IP pública que atacar, así que se fabrica el bypass **a propósito, y se apaga después**.

En `backend.yaml`:

```yaml
Parameters:
  EnableBypassDemoUrl:
    Type: String
    Default: "false"
    AllowedValues: ["true", "false"]
    Description: >-
      Expone la Lambda con una Function URL SIN autenticación, para demostrar
      el bypass del §22. Enciéndela para la demo y APÁGALA después.

Conditions:
  ConBypass: !Equals [!Ref EnableBypassDemoUrl, "true"]

Resources:
  BypassUrl:
    Type: AWS::Lambda::Url
    Condition: ConBypass
    Properties:
      TargetFunctionArn: !GetAtt Function.Arn
      AuthType: NONE
```

**El guion de la demostración, en cuatro actos:**

1. Con `EnableBypassDemoUrl=true` y **antes** de la Fase 12: `curl <BypassUrl>/api/<RECURSO>` →
   `200`. La puerta trasera está abierta: el authorizer de API Gateway se ha quedado a un lado.
2. Aplica la Fase 12.
3. Mismo `curl` → `401`. Lo rechaza **Spring Security**, no la infraestructura.
4. La misma petición vía API Gateway con token válido → `200`. Dos controles, uno detrás del otro.
5. `EnableBypassDemoUrl=false` y redespliega. La puerta se cierra.

Registra los cuatro `curl` con su salida: es la evidencia del ítem 19.

> **El matiz que la guía subraya, y que aquí también aplica.** La protección lógica con Spring
> Security **no equivale a una red privada**. Cerrar el acceso a nivel de red exige evolucionar la
> arquitectura (VPC Link en el canon; en serverless, quitar la Function URL y dejar solo la
> invocación por API Gateway, que es lo que hace el paso 5).

> **Checkpoint 13.** Puedes explicar, señalando dos comandos con su salida, por qué existen dos
> controles y qué pasa cuando falta uno. *(Ítem 19)*

---

### Fase 14 · Versionamiento (§23)

Añade `/v1` como primer segmento, delante de `/api`, y expón las mismas dos rutas ahí. En REST API
es un `AWS::ApiGateway::Resource` más con los métodos colgando.

El punto no es renombrar la URL: es poder enrutar `/v1` y `/v2` a integraciones distintas sin
romper a los consumidores existentes. Documenta en el README **cuándo** subirías de versión (un
cambio incompatible del contrato) y cuándo no (añadir un campo opcional).

> **Checkpoint 14.** `/v1/api/<RECURSO>` responde igual, y el README justifica la estrategia.
> *(Ítem 20)*

---

### Fase 15 · Evidencia y README

Sin esta fase, la mitad del trabajo no se ve. Son tres documentos.

**`aws/README.md`** — qué se construye, el diagrama, los stacks con su contrato, cómo desplegar de
cero, cómo destruir, y una tabla de troubleshooting con los síntomas reales que encontraste.

**`bruno/README.md`** — cómo se genera el entorno, por qué hacen falten dos fuentes de token, y qué
demuestra cada una de las ocho peticiones.

**`ANEXO-EA1.md`** — la tabla del §8 de este plan, rellenada: cada ítem del checklist con el
archivo, comando o captura que lo prueba. Es lo que se lee primero al evaluar.

Recorrido final E2E, en el orden del §29 —que es ese orden **precisamente** para poder aislar
errores:

```
 1 backend local          8 Angular obtiene sesión
 2 backend desplegado     9 Angular llama con HttpClient
 3 API sin seguridad     10 interceptor añade el Bearer
 4 Cognito emite token   11 API Gateway valida JWT y scope
 5 API protegida: 401    12 Spring Security vuelve a validar
 6 Bruno con scope: 200  13 la UI muestra los datos
 7 Angular inicia sesión
```

> **Checkpoint 15.** Los tres documentos existen, `bru run --env aws` pasa en verde, y el recorrido
> de 13 pasos se completa sin un solo error de CORS en DevTools. Ese silencio es la prueba de que
> la Fase 5 quedó bien. *(Ítem 21, y cierre de todos)*

---

## 7. Matriz de pruebas de seguridad

La tabla del §12 de la guía, con las dos filas que añade este plan:

| Prueba | `Authorization` | Esperado | Quién rechaza |
|---|---|---|---|
| Sin token | *(ausente)* | `401` | API Gateway · authorizer |
| Token inventado | `Bearer abc` | `401` | API Gateway · firma |
| `id_token` | `Bearer <id_token>` | `401` | API Gateway · falta el claim `scope` |
| `access_token` sin el scope | `Bearer <access_token>` | `403` *(medir)* | API Gateway · `AuthorizationScopes` |
| `access_token` con el scope | `Bearer <access_token>` | `200` + JSON | nadie: pasa las dos capas |
| id inexistente, token válido | `Bearer <access_token>` | `404` | **Spring** |
| Directo al backend, sin JWT | *(ausente)* | `401` | **Spring Security** |
| Directo al backend, token válido | `Bearer <access_token>` | `200` | nadie |

Las dos últimas filas son el ítem 19. Las filas 3 y 4 son el ítem 09 y el 10. La fila 6 es la que
prueba que la petición llega de verdad al backend.

> **Medición real, y corrige la tabla.** Ejecutado contra un despliegue de este plan
> (proyecto `biblioteca`, `us-east-1`): un `access_token` válido **sin** el scope exigido recibe
> **`401`**, no `403`, y con el mismo cuerpo `{"message":"Unauthorized"}` que un token inventado.
> El authorizer `COGNITO_USER_POOLS` **no distingue** hacia fuera la autenticación de la
> autorización.
>
> El `403` por falta de autorización sí aparece, pero lo emite **Spring Security** al invocar la
> Lambda sin pasar por API Gateway. Es decir: la fila del `403` pertenece a la **segunda** capa,
> no a la primera. Eso hace la Fase 12 más valiosa de lo que parecía, porque es la única que
> distingue los dos casos.
>
> Dos avisos más de la misma corrida:
> * **`403 Missing Authentication Token`** es lo que devuelve API Gateway ante cualquier ruta sin
>   recurso declarado. Un `403` inesperado suele ser una ruta que falta, no un problema de token.
> * En AWS Academy, una **Function URL con `AuthType: NONE` está bloqueada por la cuenta**
>   (`403 AccessDeniedException`) aunque el `AWS::Lambda::Permission` sea correcto. La demo de la
>   Fase 13 se hace con `aws lambda invoke`, que también se salta el authorizer.

---

## 8. Mapeo checklist EA1 → dónde se cumple

| # | Ítem del checklist | Fase | Evidencia |
|---|---|---|---|
| 01 | Explicar API Manager, IDaaS, OAuth 2.0, OIDC | 15 | `aws/README.md` §1 |
| 02 | Backend compila y se prueba solo | 1 | `./mvnw`, entorno Bruno `local` |
| 03 | Desplegado y sé revisar logs | 3 | `aws logs tail` |
| 04 | API Gateway es el punto de entrada | 4 | `api.yaml` |
| 05 | Rutas y métodos coherentes | 1, 4 | `/api/<RECURSO>`, `/api/<RECURSO>/{id}` |
| 06 | CORS permite el origen y `Authorization` | 5 | `OPTIONS` MOCK + `GatewayResponses` |
| 07 | User Pool, App Client, dominio | 6 | Outputs de `cognito.yaml` |
| 08 | Authorization Code + PKCE funciona | 10 | login E2E en el navegador |
| 09 | Diferencia ID vs Access Token | 8, 9 | entorno Bruno `aws-id-token` (el `id_token` da `401`) |
| 10 | El Access Token trae el custom scope | 7, 10 | payload decodificado en la UI |
| 11 | API Gateway usa Cognito Authorizer | 8 | `Type: COGNITO_USER_POOLS` |
| 12 | Sin token rechaza, con token entra | 9 | Bruno: `--env aws` frente a `--env aws-token-invalido` |
| 13 | Angular usa Amplify | 10 | `main.ts`, botones de sesión |
| 14 | Llamadas de negocio en un Service | 11 | `<RECURSO>.service.ts` |
| 15 | Interceptor registrado en HttpClient | 11 | `app.config.ts` |
| 16 | El interceptor añade el Bearer solo | 11 | DevTools, sin header manual |
| 17 | Cuándo usar un Guard | 11 | decisión documentada en README |
| 18 | Spring Boot como Resource Server | 12 | `SecurityConfig`, Bruno `--env aws-directo-sin-token` |
| 19 | Defense in Depth y el bypass | 13 | los cuatro `curl` del guion |
| 20 | Versionamiento y microservicios | 14 | `/v1`, justificación en README |
| 21 | Repo sin secretos ni artefactos | 0 | `.gitignore`, `git ls-files` |
| 22 | Diagnosticar 200/401/403/CORS/5xx | 9 | la matriz de la §7, todos los entornos en verde |

---

## 9. Trampas conocidas

Las que cuestan horas. Las primeras cinco son específicas de conservar REST API.

| Síntoma | Causa | Arreglo |
|---|---|---|
| Cambias un método y el stage sigue sirviendo lo viejo | `AWS::ApiGateway::Deployment` es inmutable: CloudFormation no lo recrea al cambiar métodos | Que el pipeline ejecute `aws apigateway create-deployment --stage-name <STAGE>` tras cada update. **Es además la lección del §11 ATENCIÓN** |
| `Allow-Origin` aparece literalmente con comillas, o no aparece | Faltan las comillas simples dentro de las dobles en `ResponseParameters` | `"'http://localhost:4200'"` |
| `401` visible como `status 0` / *"blocked by CORS"* | Faltan los `GatewayResponse` `DEFAULT_4XX`/`5XX` | Fase 5, pieza 2 |
| `500 Internal Server Error` en todas las rutas | Falta `AWS::Lambda::Permission` | Redespliega `api.yaml` |
| El preflight `OPTIONS` devuelve `401` | Le pusiste el authorizer | `AuthorizationType: NONE` en `OPTIONS`, siempre |
| `scope does not exist` al crear el stack de Cognito | Los clients se crearon antes del Resource Server | `DependsOn: ResourceServer` en ambos |
| Bruno da `403` con un token recién pedido | Vino de `admin-initiate-auth`, que **no emite custom scopes** | Usa el client M2M con `client_credentials`. Ver Fase 9 |
| `401` con un token que parece bueno | Caducado (60 min), de otro pool, o copiado a medias | Regenera: `bruno-env.sh` |
| El interceptor no añade nada | `provideHttpClient` quedó **fuera** de `providers` | §18.2 de la guía; Fase 11 |
| `redirect_mismatch` en la Hosted UI | El `redirect_uri` no coincide carácter por carácter con `CallbackURLs` | Revisa la barra final y el `/index.html` |
| Cognito rechaza el callback | Solo acepta `https://`, **única excepción `http://localhost`** | En local usa `localhost:4200`; en S3, el endpoint REST, no el *website endpoint* |
| `Task timed out after 30.00 seconds` en la 1.ª llamada | Arranque en frío de la JVM | Sube `MemorySize` (más memoria = más CPU) |
| `CREATE_FAILED: log group already exists` | La Lambda se adelantó a crear su log group | Declara el `LogGroup` en la plantilla; borra el huérfano y reintenta |
| `ExpiredToken` en cualquier `aws` | Credenciales del lab vencidas (~4 h) | Recopia el bloque de **AWS Details** |
| `DELETE_FAILED` en un stack con bucket | El bucket tiene objetos (y versiones) | `destroy-all.sh` los vacía primero |
| El dominio de Cognito no se crea | Otro alumno usa ese prefijo | El `AccountId` en el nombre ya lo evita |

Para ver por qué falló un stack:

```sh
aws cloudformation describe-stack-events --stack-name <stack> \
  --query "StackEvents[?ResourceStatus=='CREATE_FAILED'].[LogicalResourceId,ResourceStatusReason]" \
  --output table
```

---

## 10. Extensiones opcionales

Fuera del checklist EA1, pero la guía las nombra y son la continuación natural.

**Publicar el frontend en S3.** `web.yaml` con bucket de lectura pública y `deploy-web.sh` que haga
`ng build` + `aws s3 sync`. Usa el **endpoint REST** (`https://<bucket>.s3.<REGION>.amazonaws.com/index.html`),
no el *website endpoint*, que es HTTP puro y Cognito rechaza como callback. Añade esa URL a
`CallbackURLs`, `LogoutURLs` y `AllowOrigins`, dejando `localhost:4200` en las tres.

**Persistencia (§25).** `Controller → Service → Repository → BD`, un stack por motor. El frontend
nunca se conecta a la base, y las credenciales no van en Angular ni en git.

**Varios microservicios (§24).** Una API Gateway concentrando rutas hacia backends distintos. No
conviertas el gateway en lógica de negocio, ni hagas que el frontend conozca direcciones internas.

---

## 11. Orden de ejecución resumido

```
 0  preflight, repo, .gitignore
 1  backend local            → 200 en :8080          ◀ NO SIGAS SI FALLA
 2  artefacto a S3           → aws s3 ls
 3  Lambda                   → aws lambda invoke + logs
 4  REST API sin seguridad   → 200 vía /<STAGE>      ◀ NO SIGAS SI FALLA
 5  CORS                     → OPTIONS 200 en DevTools
 6  Cognito pool + clientes  → Hosted UI carga
 7  Resource Server + scope  → scope habilitado en ambos clientes
 8  authorizer + scope       → sin token ya no da 200
 9  Bruno: un entorno por     → la matriz completa
    credencial
10  Angular + Amplify        → login E2E, consumo manual
11  Service + interceptor    → Bearer automático
12  Spring Security          → backend rechaza sin JWT
13  bypass on/off            → Defense in Depth demostrado
14  /v1                      → versionamiento
15  README + ANEXO + E2E     → evidencia
```

Las fases 1 y 4 son las dos puertas duras: son los checkpoints donde la guía dice explícitamente
*"si falla aquí, todavía NO avances"*. Todo lo demás se puede reordenar con cuidado; esas dos, no.
