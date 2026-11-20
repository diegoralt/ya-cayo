# Revisión de fase 2 · Plan

Revisor: Codex (GPT-6, esfuerzo medium)
Fecha: 2026-11-19
Hash revisado: e37a3dd77650b2bab560ec088c6079577f938f31
esfuerzo: medium · P0/P1/P2: 0/0/2

## Veredicto

Apto con dos observaciones P2 de verificación; sin bloqueantes y con cobertura prevista de todos los criterios de `intent.md:11-19`.

## Bloqueantes

Ninguno. El plan conserva el alias sin redirección, contempla ambas rutas sin PIN y sus headers, renombra los tres archivos, mantiene la exclusión de la maqueta y no autoriza despliegues (`candidate-plan.md:4-13`, `synthesis.md:14-17`).

## Debería

- P2 — H5 no tiene una comprobación que falle ante su incumplimiento y su búsqueda contradice los textos permitidos. En `candidate-plan.md:20`, el `grep` solo lista coincidencias: ejecutado sobre el estado actual devuelve 0 aunque siguen las cuatro excepciones. Además, seguirá encontrando «Vas a pagar» y «maqueta» después de renombrar los archivos (`public/pagar.html:54`, `public/maqueta.html:84`), textos que deben conservarse según `intent.md:26`. Ninguna prueba actual consulta los cuatro documentos y el plan no propone esa aserción; `node --test` no garantiza H5. Arreglo: sustituir la búsqueda general por una comprobación de referencias técnicas y de retirada de las cuatro excepciones, con salida distinta de cero si quedan referencias prohibidas; permitir expresamente el alias y los textos visibles. Incluirla en el comando de H5 y comprobar que falla al reintroducir una excepción.

- P2 — Explicitar las aserciones del enlace emitido y de `.vercelignore` en H2/H3. Los comandos de `candidate-plan.md:17-18` apuntan a `test/server.test.js`, pero las ampliaciones enumeradas en `candidate-plan.md:8` solo precisan rutas, rewrites, headers y 404. La prueba de caja actual comprueba campos de la propuesta, no el enlace (`test/server.test.js:292-296`); la de Vercel lee rewrites y CSP, no `.vercelignore` (`test/server.test.js:196-199`). Así, comprobar ambas rutas y un 404 local no detecta que la caja siga emitiendo `/pagar/` (`public/caja.html:217`), ni que se olvide cambiar la exclusión de `public/maqueta.html` (`.vercelignore:1`), porque el servidor local solo sirve dos rutas explícitas (`src/server.js:123-130`). Arreglo: añadir al plan pruebas explícitas del `href` y texto del enlace generado con un token, y de la exclusión efectiva de `public/mockup.html`; verificar que el comando falla al restaurar respectivamente el prefijo antiguo y la exclusión antigua.

## NO VERIFICADO

- No se ejecutaron `node --test`, Postgres ni el barrido de secretos completo: se revisa un plan, todavía sin las pruebas y renombres propuestos. No se comprobó el comportamiento de Vercel desplegado ni se tocó producción.
- H1 y H4 describen aserciones concretas capaces de detectar incumplimientos cuando se implementen (`candidate-plan.md:8-9,16,19`; para las dos rutas de la maqueta, `synthesis.md:14`). H2 especifica las comprobaciones de headers y ausencia de PIN; H3, el mapa de rewrites. La eficacia ejecutable de esas pruebas futuras queda pendiente; los huecos adicionales se detallan arriba.
- Se leyeron `AGENTS.md`, `CLAUDE.md`, `REVIEW.md` y `docs/agentes.md` desde la raíz, las secciones «Revisión cruzada» y «Modelo y esfuerzo» de `~/.claude/reference/ai-native-workflow.md`, y las tres entradas indicadas. Solo se ampliaron dependencias para contrastar las verificaciones señaladas. `git hash-object candidate-plan.md` coincide con el hash recibido. La comprobación ejecutada fue el `grep` de H5, cuyo resultado fue 0 con referencias todavía pendientes.
