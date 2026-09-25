#!/usr/bin/env bash
# ==============================================================================
#  biblioteca / bruno-env.sh   --   Genera los entornos de la coleccion Bruno
# ==============================================================================
#
#  QUE HACE
#    Lee los Outputs de los stacks, consigue un token por cada CREDENCIAL que
#    interesa probar y escribe un archivo en bruno/environments/ por cada una.
#    No ejecuta ninguna prueba: solo deja la coleccion lista para que la corras
#    tu, con "bru run" o desde la aplicacion de Bruno.
#
#  >>> POR QUE HAY QUE FABRICAR LOS TOKENS DE TRES MANERAS DISTINTAS <<<
#
#    1) Cliente M2M, grant_type=client_credentials
#         Emite un access_token CON el custom scope, en una sola llamada HTTP,
#         sin usuario y sin navegador. Es el unico camino automatizable para
#         obtener el caso "todo correcto".
#
#    2) admin-initiate-auth (usuario + contrasena, por AWS CLI)
#         Emite un access_token SIN custom scopes —solo lleva
#         "aws.cognito.signin.user.admin"— y ademas un id_token. Parece una
#         limitacion y es justo lo que hace falta: con el primero se reproduce
#         el 403 (autenticado pero no autorizado) y con el segundo el 401 (un
#         id_token no tiene claim "scope", que es lo que exige el metodo).
#
#    3) Ninguna, o una cadena inventada
#         El 401 mas simple: no hay credencial que validar.
#
#    El flujo del navegador (code + PKCE) tambien emite el token bueno, pero
#    EXIGE una pantalla de login: por eso no sirve para automatizar nada.
#
#  CADA ENTORNO DECLARA LO QUE ESPERA
#    Ademas del token, cada archivo lleva ESPERADO_LECTURA y ESPERADO_CREACION.
#    Asi la coleccion tiene UNA request por endpoint (sin duplicar peticiones
#    para cada codigo de error) y aun asi "bru run --env <caso>" pasa en verde
#    en los seis casos: la matriz de seguridad completa, automatizada.
#
#  USO
#    ./aws/pipeline/bruno-env.sh
#
#  Los archivos generados LLEVAN TOKENS REALES y estan en .gitignore.
#  Los tokens caducan en 60 minutos: vuelve a ejecutar el script cuando
#  empieces a ver 401 donde antes habia 200.
# ==============================================================================
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)/_comun.sh"

requiere aws curl python3
cuenta_aws >/dev/null

DESTINO="${ROOT}/bruno/environments"
mkdir -p "$DESTINO"

log "Leyendo los Outputs de los stacks"
API_ENDPOINT="$(output_obligatorio "$STACK_API" ApiEndpoint)"
USER_POOL_ID="$(output_obligatorio "$STACK_COGNITO" UserPoolId)"
SPA_CLIENT_ID="$(output_obligatorio "$STACK_COGNITO" SpaClientId)"
M2M_CLIENT_ID="$(output_obligatorio "$STACK_COGNITO" M2mClientId)"
TOKEN_URL="$(output_obligatorio "$STACK_COGNITO" TokenUrl)"
SCOPE_COMPLETO="$(output_obligatorio "$STACK_COGNITO" ScopeCompleto)"
BYPASS_URL="$(output_de "$STACK_BACKEND" BypassUrl)"
info "api    ${API_ENDPOINT}"
info "scope  ${SCOPE_COMPLETO}"

# El secreto del cliente M2M NO se publica como Output del stack (cualquiera
# con permiso de describe-stacks lo veria). Se lee aqui, en el momento.
M2M_SECRET="$(aws cognito-idp describe-user-pool-client \
  --user-pool-id "$USER_POOL_ID" \
  --client-id "$M2M_CLIENT_ID" \
  --region "$AWS_REGION" \
  --query 'UserPoolClient.ClientSecret' --output text)"
[ -n "$M2M_SECRET" ] && [ "$M2M_SECRET" != "None" ] || die "el cliente M2M no tiene secreto"

# --- 1) Token del cliente M2M: CON el custom scope ----------------------------
log "Pidiendo el access_token del cliente M2M (client_credentials)"
RESPUESTA_M2M="$(curl -s -X POST "$TOKEN_URL" \
  --user "${M2M_CLIENT_ID}:${M2M_SECRET}" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=client_credentials' \
  --data-urlencode "scope=${SCOPE_COMPLETO}")"

TOKEN_M2M="$(printf '%s' "$RESPUESTA_M2M" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("access_token", ""))
except Exception:
    print("")
')"
[ -n "$TOKEN_M2M" ] || die "Cognito no devolvio access_token. Respuesta: ${RESPUESTA_M2M}"
info "token M2M obtenido (${#TOKEN_M2M} caracteres)"

# --- 2) Tokens del usuario: SIN custom scope ----------------------------------
TOKEN_USUARIO=""
TOKEN_ID=""
USUARIO_ENV="${LOCAL_DIR}/usuario-demo.env"

if [ -f "$USUARIO_ENV" ]; then
  # shellcheck disable=SC1090
  source "$USUARIO_ENV"
  log "Pidiendo los tokens del usuario de demostracion (admin-initiate-auth)"
  RESULTADO="$(aws cognito-idp admin-initiate-auth \
    --user-pool-id "$USER_POOL_ID" \
    --client-id "$SPA_CLIENT_ID" \
    --auth-flow ADMIN_USER_PASSWORD_AUTH \
    --auth-parameters "USERNAME=${DEMO_USER},PASSWORD=${DEMO_PASSWORD}" \
    --region "$AWS_REGION" \
    --query 'AuthenticationResult.[AccessToken,IdToken]' --output text 2>/dev/null)" || true

  if [ -n "$RESULTADO" ]; then
    TOKEN_USUARIO="$(printf '%s' "$RESULTADO" | awk '{print $1}')"
    TOKEN_ID="$(printf '%s' "$RESULTADO" | awk '{print $2}')"
    info "tokens del usuario ${DEMO_USER} obtenidos"
  else
    warn "no se pudieron obtener los tokens del usuario; los entornos 403 y 401-por-id-token quedaran sin token"
  fi
else
  warn "no existe ${USUARIO_ENV}; ejecuta ./aws/scripts/bootstrap.sh para crear el usuario de demostracion"
fi

# --- Escritura de los entornos ------------------------------------------------
# $1 archivo  $2 nombre  $3 descripcion  $4 base url  $5 token
# $6 status esperado en las lecturas  $7 status esperado al crear
escribe_entorno() {
  local archivo="$1" nombre="$2" descripcion="$3" base="$4" token="$5" lectura="$6" creacion="$7"
  cat > "${DESTINO}/${archivo}" <<EOF
# ARCHIVO GENERADO por aws/pipeline/bruno-env.sh -- NO LO EDITES A MANO.
# Contiene tokens reales y esta en .gitignore. Caducan en 60 minutos:
# vuelve a ejecutar el script cuando veas 401 donde esperabas otra cosa.
name: ${nombre}
description: >-
  ${descripcion}
variables:
  - name: BASE_URL
    value: "${base}"
    description: Raiz de la API para este caso.
  - name: ACCESS_TOKEN
    value: "${token}"
    description: Credencial de este caso. Vacia significa que no hay token que presentar.
  - name: ESPERADO_LECTURA
    value: "${lectura}"
    description: Codigo HTTP que esta credencial debe obtener en los GET.
  - name: ESPERADO_CREACION
    value: "${creacion}"
    description: Codigo HTTP que esta credencial debe obtener en el POST de solicitudes.
EOF
  info "escrito environments/${archivo}"
}

log "Escribiendo los entornos en bruno/environments/"

escribe_entorno aws.yml aws \
  "Cliente M2M con el custom scope. Es el unico caso que debe funcionar de punta a punta: pasa el authorizer de API Gateway y tambien Spring Security." \
  "$API_ENDPOINT" "$TOKEN_M2M" 200 201

# MEDIDO, no supuesto: la guia dice "403 o rechazo de autorizacion segun
# configuracion". El authorizer COGNITO_USER_POOLS de API Gateway responde
# 401 {"message":"Unauthorized"} cuando el token es valido pero sus scopes no
# incluyen el exigido. El 403 por falta de autorizacion SI aparece, pero lo da
# SPRING SECURITY cuando se llama a la Lambda directamente.
escribe_entorno aws-usuario-sin-scope.yml aws-usuario-sin-scope \
  "Access token de un USUARIO real obtenido con admin-initiate-auth. Esta bien firmado y no ha caducado, pero ese flujo no emite custom scopes. API Gateway lo rechaza con 401 (medido): no distingue este caso del de un token invalido. Quien si distingue autenticacion de autorizacion es Spring, con un 403, cuando se llama a la Lambda sin pasar por el gateway." \
  "$API_ENDPOINT" "$TOKEN_USUARIO" 401 401

escribe_entorno aws-id-token.yml aws-id-token \
  "ID TOKEN del mismo usuario. Sirve para saber QUIEN es, no para autorizar: no lleva claim scope, y el metodo exige uno. Es la diferencia entre id_token y access_token, comprobada en vez de recitada." \
  "$API_ENDPOINT" "$TOKEN_ID" 401 401

escribe_entorno aws-token-invalido.yml aws-token-invalido \
  "Una cadena inventada como token. Demuestra que el authorizer valida la FIRMA de verdad y no se limita a mirar si la cabecera existe." \
  "$API_ENDPOINT" "no-es-un-jwt-de-verdad" 401 401

# --- Defense in Depth: por que aqui NO se genera ningun entorno -----------------
#
#  La idea original era exponer la Lambda con una Function URL sin autenticacion
#  (EnableBypassDemoUrl=true) y apuntar Bruno contra ella. MEDIDO en este
#  laboratorio: AWS responde 403 AccessDeniedException a cualquier peticion a
#  esa URL, incluso con el AWS::Lambda::Permission correcto para
#  lambda:InvokeFunctionUrl con Principal "*". La cuenta de AWS Academy prohibe
#  las Function URL anonimas, y eso se decide ANTES de llegar a la funcion.
#
#  La plantilla conserva el parametro porque el codigo es correcto y funciona en
#  una cuenta sin esa restriccion. Pero la demostracion de Defense in Depth se
#  hace por la via que el laboratorio si permite: invocar la funcion
#  directamente con "aws lambda invoke", que tambien se salta por completo el
#  authorizer de API Gateway. Bruno no habla ese protocolo, asi que esa parte
#  se ejecuta a mano.
if [ -n "$BYPASS_URL" ]; then
  warn "hay una Function URL activa (${BYPASS_URL})."
  warn "en AWS Academy responde 403 AccessDenied: apagala con"
  warn "  EnableBypassDemoUrl=false ./aws/pipeline/build-backend.sh"
fi
rm -f "${DESTINO}/aws-directo.yml" "${DESTINO}/aws-directo-sin-token.yml"

log "Entornos listos"
cat <<EOF
    La matriz de seguridad, un entorno por credencial:

        cd bruno
        bru run --env aws                     # 200 / 201  todo correcto
        bru run --env aws-usuario-sin-scope   # 401        token valido, scope insuficiente
        bru run --env aws-id-token            # 401        un id_token no autoriza
        bru run --env aws-token-invalido      # 401        firma invalida

    Los cuatro deben pasar en VERDE: cada entorno declara el codigo que espera.

    La segunda capa (Spring Security validando por su cuenta) no se prueba con
    Bruno, porque exige invocar la Lambda sin pasar por API Gateway; se hace a
    mano con "aws lambda invoke".
EOF
