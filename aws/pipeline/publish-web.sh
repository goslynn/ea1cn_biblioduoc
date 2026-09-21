#!/usr/bin/env bash
# ==============================================================================
#  biblioteca / publish-web.sh   --   Pipeline del frontend: config, build, sync
# ==============================================================================
#
#  QUE HACE, EN TRES PASOS
#    1. GENERA   front/src/app/aws-config.ts a partir de los Outputs de los
#                stacks (ids de Cognito, dominio de la Hosted UI, URL de la API).
#    2. COMPILA  npm ci + ng build  ->  front/dist/
#    3. PUBLICA  aws s3 sync --delete al bucket del sitio
#
#  POR QUE LA CONFIGURACION SE GENERA Y NO SE VERSIONA
#    Porque son identificadores de UNA cuenta AWS concreta: el id del User
#    Pool, el del App Client y el del API Gateway cambian en cada despliegue y
#    en cada cuenta. Escribirlos a mano en el repositorio es la forma mas
#    rapida de que el proyecto solo funcione en la maquina de quien lo escribio.
#    El archivo esta en .gitignore; su plantilla versionada es
#    front/src/app/aws-config.example.ts.
#
#    Ninguno de esos valores es un secreto: el App Client del SPA se crea SIN
#    client_secret a proposito, porque cualquier cosa incrustada en JavaScript
#    es publica. Lo que protege el flujo es PKCE.
#
#  USO
#    ./aws/pipeline/publish-web.sh
#    SOLO_CONFIG=true ./aws/pipeline/publish-web.sh   # solo genera el config
#
#  Este script NO prueba el sitio: al final imprime la URL para abrirla en el
#  navegador, que es donde se comprueban el login y el CORS.
# ==============================================================================
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)/_comun.sh"

SOLO_CONFIG="${SOLO_CONFIG:-false}"
FRONT="${ROOT}/front"

requiere aws
[ -d "$FRONT" ] || die "no encuentro el directorio front/"

cuenta_aws >/dev/null

log "Leyendo los Outputs de los stacks"
SITE_BUCKET="$(output_obligatorio "$STACK_WEB" SiteBucketName)"
SITE_URL="$(output_obligatorio "$STACK_WEB" SiteUrl)"
API_ENDPOINT="$(output_obligatorio "$STACK_API" ApiEndpoint)"
USER_POOL_ID="$(output_obligatorio "$STACK_COGNITO" UserPoolId)"
SPA_CLIENT_ID="$(output_obligatorio "$STACK_COGNITO" SpaClientId)"
HOSTED_UI="$(output_obligatorio "$STACK_COGNITO" HostedUiDomain)"
SCOPE_COMPLETO="$(output_obligatorio "$STACK_COGNITO" ScopeCompleto)"

# Amplify quiere el dominio SIN el esquema.
HOSTED_UI_DOMINIO="${HOSTED_UI#https://}"

# --- 1. Generar la configuracion ----------------------------------------------
log "Generando front/src/app/aws-config.ts"
cat > "${FRONT}/src/app/aws-config.ts" <<EOF
// ARCHIVO GENERADO por aws/pipeline/publish-web.sh -- NO LO EDITES A MANO.
// Los valores salen de los Outputs de CloudFormation y cambian con cada cuenta
// AWS, por eso no se versiona (ver .gitignore). La plantilla de referencia es
// aws-config.example.ts.
export const awsConfig = {
  userPoolId: '${USER_POOL_ID}',
  userPoolClientId: '${SPA_CLIENT_ID}',
  hostedUiDomain: '${HOSTED_UI_DOMINIO}',
  scope: '${SCOPE_COMPLETO}',
  redirectUrl: '${SITE_URL}',
  apiBaseUrl: '${API_ENDPOINT}',
};
EOF
info "userPool  ${USER_POOL_ID}"
info "cliente   ${SPA_CLIENT_ID}"
info "api       ${API_ENDPOINT}"
info "redirect  ${SITE_URL}"

if [ "$SOLO_CONFIG" = "true" ]; then
  log "SOLO_CONFIG=true: no se compila ni se publica"
  exit 0
fi

# --- 2. Compilar ---------------------------------------------------------------
requiere npm
log "Compilando el frontend"
if [ -d "${FRONT}/node_modules" ]; then
  info "node_modules ya existe; se omite la instalacion"
else
  ( cd "$FRONT" && npm ci --no-audit --no-fund )
fi
( cd "$FRONT" && npm run build )

SALIDA="${FRONT}/dist/biblioteca-front/browser"
[ -d "$SALIDA" ] || die "no encuentro la salida del build en ${SALIDA}"

# --- 3. Publicar ---------------------------------------------------------------
log "Publicando en s3://${SITE_BUCKET}"
# --delete borra del bucket lo que ya no existe en dist/: sin eso se acumulan
# los bundles con hash de despliegues anteriores.
aws s3 sync "$SALIDA" "s3://${SITE_BUCKET}" \
  --delete \
  --region "$AWS_REGION" \
  --only-show-errors

# index.html sin cache: es el que apunta a los bundles nuevos. Los bundles si
# se cachean porque su nombre lleva un hash del contenido.
aws s3 cp "${SALIDA}/index.html" "s3://${SITE_BUCKET}/index.html" \
  --cache-control "no-cache, must-revalidate" \
  --content-type "text/html" \
  --region "$AWS_REGION" \
  --only-show-errors

log "Sitio publicado"
cat <<EOF
    Abrelo en el navegador:
        ${SITE_URL}

    Recorrido de comprobacion (DevTools abierto, pestana Network):
      1. "Iniciar sesion" -> Hosted UI de Cognito -> vuelve al sitio
      2. Catalogo: buscar y filtrar
      3. Solicitar: enviar el formulario -> 201
      4. Mis solicitudes: aparece lo enviado
      5. Sesion: el access token, su payload y la prueba sin interceptor
      6. En Network: ni un solo error de CORS, y el Bearer en cada peticion
EOF
