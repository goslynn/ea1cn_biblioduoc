# Frontend · biblioteca-front

Aplicacion Angular 22 (standalone, signals) con **AWS Amplify Auth 6**,
publicada como sitio estatico en S3.

---

## 1. Compilar y publicar

El pipeline lo hace todo:

```sh
./aws/pipeline/publish-web.sh      # genera la config, compila y sube a S3
```

A mano:

```sh
cd front
npm ci
npm run build       # deja dist/biblioteca-front/browser/
```

### Antes de compilar hace falta `aws-config.ts`

Ese archivo lo **genera** el pipeline desde los Outputs de CloudFormation y
**no se versiona**: sus valores son de una cuenta AWS concreta. Para trabajar
sin desplegar nada:

```sh
cp src/app/aws-config.example.ts src/app/aws-config.ts
```

Para generarlo de verdad sin compilar ni subir:

```sh
SOLO_CONFIG=true ./aws/pipeline/publish-web.sh
```

Ninguno de esos valores es secreto: el App Client del SPA se crea **sin**
`client_secret` a proposito, porque todo lo que va en un bundle de JavaScript es
publico. Lo que protege el flujo es PKCE.

---

## 2. Estructura

```
src/
├── main.ts                     Amplify.configure() ANTES de bootstrapApplication
├── index.html  styles.css
└── app/
    ├── app.config.ts           provideHttpClient(withInterceptors([...])) + withHashLocation()
    ├── app.routes.ts           /inicio publica; el resto tras authGuard, con lazy loading
    ├── app.ts / app.html       marco: cabecera, navegacion, estado de sesion
    ├── inicio.ts / .html       portada publica: botones de login y de registro
    ├── auth/
    │   ├── sesion.service.ts   unico punto que habla con Amplify (+ /signup)
    │   ├── auth.interceptor.ts anade el Bearer a toda peticion de HttpClient
    │   └── auth.guard.ts       bloquea la NAVEGACION a rutas privadas
    ├── catalogo/               buscador, filtros y seleccion de libros
    ├── solicitudes/            formulario de prestamo y "mis solicitudes"
    ├── sesion/                 vista de diagnostico: token, payload y fetch manual
    └── aws-config.ts           GENERADO (aws-config.example.ts es la plantilla)
```

---

## 3. Cuatro cosas que hay que mirar dos veces

**`provideHttpClient(withInterceptors([...]))` va DENTRO del array
`providers`.** Si se cierra el objeto antes, el archivo compila, la aplicacion
arranca y el interceptor **no queda registrado**: las peticiones salen sin
`Bearer` y todo responde 401. Es el error que la guia del curso marca dos veces.

**Se manda el ACCESS token, no el id token.** El id token dice quien eres; el
access token dice a que tienes derecho, y es el unico que lleva el claim
`scope`. Con un id token, API Gateway responde 401.

**El Guard no protege la API.** Controla la navegacion, y corre en el navegador
del usuario. Quien protege son API Gateway y Spring Security. El Guard esta
porque hay rutas privadas de verdad y sin el se verian pantallas vacias llenas
de 401.

**El registro no lo hace Amplify.** No existe un `signUpWithRedirect`:
`signInWithRedirect()` siempre aterriza en `/login`. Pero `/signup` es un
endpoint mas de la Hosted UI y acepta los mismos parametros que
`/oauth2/authorize`, asi que `sesion.service.ts` arma esa URL con los valores de
`aws-config.ts`. **Tiene que pedir los mismos scopes que el login**, custom
scope incluido: si se olvida, el usuario se registra bien y la API le responde
401 a la primera peticion.

**Las rutas llevan `#` (`withHashLocation`).** El sitio se sirve por el endpoint
REST de S3, que devuelve los objetos que existen y nada mas: con rutas limpias,
recargar en `/catalogo` daria 404. El *website endpoint* si redirige a
`index.html`, pero es HTTP puro y Cognito rechaza callbacks sin TLS.

---

## 4. Recorrido de comprobacion en el navegador

Con DevTools abierto en la pestana **Network**:

1. **Iniciar sesion** → Hosted UI de Cognito → vuelve al sitio ya autenticado.
   (O **Crear cuenta** → `/signup` → codigo de 6 digitos al correo → vuelve ya
   autenticado, sin pasar por la pantalla de login.)
2. **Catalogo**: buscar y filtrar. Cada busqueda es una peticion real.
3. **Agregar** libros y **Completar la solicitud** → 201.
4. **Mis solicitudes**: aparece lo enviado.
5. **Sesion**: el access token, su payload (`token_use`, `client_id`, `scope`) y
   las dos llamadas manuales con `fetch` (con cabecera a mano → 200, sin
   cabecera → 401).
6. En Network: **ni un solo error de CORS**, y el `Authorization: Bearer` en
   cada peticion **sin que ningun componente lo haya puesto**.

Ese ultimo punto es la evidencia de que el interceptor funciona, y el silencio
en CORS es la evidencia de que el preflight y los `GatewayResponses` estan bien.
