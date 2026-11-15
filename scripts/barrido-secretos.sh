#!/bin/sh
# Barrido de secretos antes de publicar. Sale ≠0 ante hallazgo O ante error de lectura/ejecución.
# Nunca imprime valores: solo qué clave o patrón y dónde. Uso: sh scripts/barrido-secretos.sh [URL_PUBLICA]
# Escanea: árbol (versionado + sin versionar no ignorado), `git log -p --all`, public/, docs/ (evidencias),
# y, si se pasa la URL, las respuestas de éxito y de error de la app pública.
# ponytail: un valor de .env muy corto (p. ej. un PIN de 4 dígitos) puede dar falsos positivos; revisar el archivo señalado.
set -u
cd "$(dirname "$0")/.." || { echo "ERROR: no pude entrar al repo"; exit 2; }
HALLAZGOS=0
ERRORES=0
TMP=$(mktemp -d) || { echo "ERROR: mktemp"; exit 2; }
trap 'rm -rf "$TMP"' EXIT

hallazgo() { echo "HALLAZGO: $1"; HALLAZGOS=$((HALLAZGOS + 1)); }
error() { echo "ERROR: $1"; ERRORES=$((ERRORES + 1)); }

PATRON='whsec_[A-Za-z0-9+/=]{8,}|Bearer [A-Za-z0-9._~+/=-]{16,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|TunnelSecret|-----BEGIN [A-Z ]*PRIVATE KEY-----|(api[_-]?key|secret|token|passw(or)?d)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9+/_=-]{12,}["'"'"']|^\+?[A-Z_]*(KEY|SECRET|TOKEN|PIN)[A-Z_]*=[^[:space:]]{6,}'
# Claves de .env cuyo VALOR es sensible (PORT, DB_PATH, TITULAR, COMISION_TARJETA no lo son).
CLAVES_SECRETAS='KEY|SECRET|TOKEN|PIN|PASS|CREDENTIAL'

# 1) Lista de archivos: versionados + sin versionar que no estén ignorados.
git ls-files -co --exclude-standard > "$TMP/archivos" 2>/dev/null || error "git ls-files falló"
[ -s "$TMP/archivos" ] || error "no hay archivos que escanear"
# 2) Historial completo (no imprime el contenido).
git log -p --all > "$TMP/historial" 2>/dev/null || error "git log -p falló"

# 3) Valores reales de .env (no se imprimen).
[ -r .env ] || error ".env ilegible o ausente: no puedo comparar los valores reales"
if [ -r .env ]; then
  grep -v '^[[:space:]]*#' .env | grep '=' > "$TMP/env" 2>/dev/null
  while IFS= read -r linea; do
    clave=${linea%%=*}
    valor=${linea#*=}
    valor=$(printf '%s' "$valor" | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//')
    printf '%s' "$clave" | grep -qE "$CLAVES_SECRETAS" || continue
    [ ${#valor} -ge 4 ] || continue
    # DEMO_PIN es público por decisión de Diego (2026-11-15): se permite solo en README.md e instrucciones.md y en el historial.
    # Cualquier otra clave, y el PIN en cualquier otro archivo o en las respuestas de la URL pública, sigue siendo hallazgo.
    while IFS= read -r f; do
      [ -f "$f" ] || continue
      [ "$clave" = DEMO_PIN ] && case "$f" in README.md|docs/entrega/instrucciones.md) continue ;; esac
      grep -qF -e "$valor" "$f" 2>/dev/null && hallazgo "valor de $clave aparece en $f"
    done < "$TMP/archivos"
    [ "$clave" = DEMO_PIN ] || { grep -qF -e "$valor" "$TMP/historial" && hallazgo "valor de $clave aparece en el historial de git"; }
  done < "$TMP/env"
fi

# 4) Patrones de key/secreto/token en el árbol y en el historial.
while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in package-lock.json|scripts/barrido-secretos.sh) continue ;; esac
  grep -IqE "$PATRON" "$f" 2>/dev/null && hallazgo "patrón de secreto en $f"
done < "$TMP/archivos"
# En el historial solo se cuentan líneas añadidas, sin la propia regla del barrido.
grep -E '^\+' "$TMP/historial" | grep -vE 'PATRON=|CLAVES_SECRETAS=|barrido-secretos' | grep -qE "$PATRON" && hallazgo "patrón de secreto en el historial de git"

# 5) Archivos que no deben estar versionados.
for p in .env 'ya-cayo.sqlite*' '*.pem' 'cert.pem' '*credentials*.json'; do
  git ls-files "$p" | grep -q . && hallazgo "archivo sensible versionado: $p"
done

# 6) Respuestas de la URL pública (éxito y error), si se pasó.
if [ "${1:-}" != "" ]; then
  URL=${1%/}
  for ruta in / /health /pagar/x /api/pago/x /api/ordenes /api/metricas /webhook /.env /package.json /ya-cayo.sqlite /nada; do
    codigo=$(curl -sS -m 15 -o "$TMP/resp" -w '%{http_code}' "$URL$ruta" 2>/dev/null) || { error "no pude consultar $URL$ruta"; continue; }
    grep -IqE "$PATRON" "$TMP/resp" 2>/dev/null && hallazgo "patrón de secreto en la respuesta de $ruta ($codigo)"
    while IFS= read -r linea; do
      clave=${linea%%=*}; valor=${linea#*=}
      valor=$(printf '%s' "$valor" | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//')
      printf '%s' "$clave" | grep -qE "$CLAVES_SECRETAS" || continue
      [ ${#valor} -ge 6 ] || continue
      grep -qF -e "$valor" "$TMP/resp" && hallazgo "valor de $clave en la respuesta de $ruta ($codigo)"
    done < "$TMP/env"
    case "$ruta:$codigo" in /.env:200|/package.json:200|/ya-cayo.sqlite:200) hallazgo "$ruta se sirve públicamente ($codigo)" ;; esac
  done
fi

if [ "$ERRORES" -gt 0 ]; then echo "FALLO: $ERRORES error(es) de lectura/ejecución, $HALLAZGOS hallazgo(s)"; exit 2; fi
if [ "$HALLAZGOS" -gt 0 ]; then echo "FALLO: $HALLAZGOS hallazgo(s). Detener publicación, sanear y rotar key y secreto."; exit 1; fi
echo "OK: sin hallazgos (árbol, historial${1:+, URL pública})"
