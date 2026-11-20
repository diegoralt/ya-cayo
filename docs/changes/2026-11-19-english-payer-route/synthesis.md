# Síntesis · ruta del pagador en inglés

Manda `intent.md` (con el criterio ampliado tras la fase 1). Antecedentes: `review-claude.md`, `review-codex.md`.

## Coincidencias
- El alias `/pagar/:token` debe conservarse y probarse (Claude P1; Codex: «conservar enlaces emitidos», pide probar ambas rutas con headers y sin PIN).

## Huecos hallados por Codex y su paso
| Hueco | Paso del plan | Verificación |
|---|---|---|
| `public/caja.html` también está en español, y su ejemplo de enlace (`caja.html:106`) | H1, H3 | prueba de `/` y del mapa de rewrites |
| `scripts/secrets-sweep.sh:70` solo consulta `/pagar/x` | H4 | prueba que exige `/pay/x` y `/pagar/x` en la lista |
| La prueba de headers no incluye el pagador | H2 | prueba nueva con ambas rutas |
| El nombre nuevo de la maqueta debe seguir excluido | H1 | prueba: `/mockup.html` y `/public/mockup.html` dan 404 |

## Desacuerdos con la decisión de Diego
Ninguno. Decisión de diseño propia: el alias se sirve (rewrite, sin redirección) para no añadir un salto ni exponer el token en otra URL.
