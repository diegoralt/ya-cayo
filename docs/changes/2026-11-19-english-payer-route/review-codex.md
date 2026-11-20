# Revisión fase 1 · intent a ciegas

Revisor: Codex (GPT-6) · esfuerzo high  
Fecha: 2026-11-19  
Hash revisado: 97cea215ee6bece853d9ba74f07837bd4499306c  
esfuerzo: high · P0/P1/P2: 0/0/2

Hash comprobado con `git hash-object intent.md`: coincide con la entrada recibida.

## Veredicto

Sin bloqueantes; completar dos omisiones de alcance y verificación antes del plan.

## Bloqueantes

Ninguno. El intent exige conservar los enlaces emitidos, reflejar los renombrados en Vercel y mantener privada la maqueta (`intent.md:13`, `intent.md:14`, `intent.md:20`).

## Debería

- P2 · Explicitar el renombrado de `public/caja.html` y sus dependencias. El criterio «ninguna otra ruta o archivo público queda en español» (`intent.md:15`) también incluye este archivo, pero la lista de renombrados solo menciona pagador y maqueta (`intent.md:14`). Renombrar únicamente esos dos deja incumplido el criterio; renombrar caja sin actualizar sus consumidores rompe la portada o el test que abre el archivo. Evidencia: `vercel.json:4`, `src/server.js:128`, `test/server.test.js:198`, `test/server.test.js:293`. Arreglo: incluir explícitamente caja, su destino en inglés y la actualización de esos consumidores, conservando `/` como entrada. Incluir también el ejemplo de enlace de `public/caja.html:106`, además del enlace generado en `public/caja.html:217`; la exclusión de textos visibles (`intent.md:24`) no debería dejar un ejemplo de ruta antigua.

- P2 · Incluir `/pay` en el barrido de respuestas públicas. `scripts/secrets-sweep.sh:70` consulta `/pagar/x`, pero el intent no contempla este consumidor al cambiar la ruta canónica (`intent.md:12`). Si se deja igual, el barrido seguirá comprobando solo el alias y no inspeccionará la respuesta de la ruta nueva. Arreglo: exigir que el script compruebe `/pay/x` y conserve `/pagar/x`; cubrir esa lista de consultas con una prueba local. El test actual ejecuta el barrido sin argumento de URL (`test/secrets-sweep.test.js:19`) y solo prueba filtraciones en archivos (`test/secrets-sweep.test.js:22`), por lo que no detecta la omisión.

Inventario comprobado para la pregunta clave:

| Lugar | Evidencia y cobertura del intent |
|---|---|
| Vercel | Rewrite del pagador en `vercel.json:5` y exclusión de maqueta en `.vercelignore:1`: contemplados en `intent.md:14`. |
| Servidor local | `src/server.js:129` sirve exclusivamente `/pagar` y abre `pagar.html`. Ambas rutas deben actualizarse aquí además de Vercel; lo exigen los resultados de `intent.md:12` y `intent.md:13`, aunque no se nombre el archivo. |
| Caja | Ejemplo y enlace generado en `public/caja.html:106` y `public/caja.html:217`; emisión contemplada en `intent.md:12`. Renombrado del archivo: primer hallazgo. |
| Pagador | Extrae el último segmento, sin depender del prefijo (`public/pagar.html:74`); es compatible con ambos prefijos si se conserva el token. |
| Tests | Ruta antigua en `test/server.test.js:107`, mapa exacto de rewrites en `test/server.test.js:198`: contemplados en `intent.md:16`. La prueba de headers no incluye hoy ninguna ruta del pagador (`test/server.test.js:114`); al implementar, ejercitar ambas sin PIN, igualdad de página y headers, según `intent.md:20`. |
| Maqueta | La exclusión actual depende del nombre exacto (`.vercelignore:1`). Comprobar que el nuevo nombre queda excluido y que el servidor local tampoco lo sirve; el intent ya exige conservar esa privacidad (`intent.md:20`). |
| Scripts | Referencia activa en `scripts/secrets-sweep.sh:70`: segundo hallazgo. |
| Docs públicos | El rastreo de `README.md` y `docs/`, excluyendo `docs/changes/`, no encontró enlaces a `/pagar`, `pagar.html` o `maqueta.html` fuera de las reglas de idioma ya enumeradas en el intent. |

Reglas leídas: `CLAUDE.md`, `AGENTS.md`, `REVIEW.md`, `docs/agentes.md` desde la raíz; fuentes del proyecto `docs/arranque.md` y `docs/contexto.md`; secciones «Revisión cruzada» y «Modelo y esfuerzo» de `~/.claude/reference/ai-native-workflow.md`. No se leyeron planes ni otras revisiones.

## NO VERIFICADO

- No se ejecutaron `node --test` ni pruebas de Postgres: se revisó el intent y la cobertura existente por lectura, sin una implementación candidata.
- No se comprobó el empaquetado ni el comportamiento efectivo de Vercel. La revisión de rewrites, headers y exclusiones es estática; no se consultó ni modificó producción.
- No se verificó la vigencia de tokens emitidos ni pagos reales; el cambio debe conservar su comportamiento sin alterar la API de pagos.
