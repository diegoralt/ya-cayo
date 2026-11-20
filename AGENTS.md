# AGENTS.md · Ya Cayó

Instrucciones para Codex. Comandos y convenciones: `CLAUDE.md`. Contrato completo para agentes: `docs/agentes.md`. Qué se construye y por qué: `docs/arranque.md` y `docs/contexto.md`.

## Code Review Rules

Codex es el único revisor de los PRs de este repo; Claude escribe los cambios y responde cada hallazgo (skill `address-review`). Revisa como un ingeniero senior del tema que toca el cambio (pagos y reconciliación idempotente, Postgres/RLS, Node sin dependencias extra).

- Lee `REVIEW.md` y aplícalo completo: contra qué se revisa, invariantes y qué no reportar.
- Si el cuerpo del PR enlaza `docs/changes/<carpeta>/`, revisa el diff contra su `intent.md` ("Qué cuenta como terminado") y su `plan.md`, aunque esos archivos no cambien en el diff.
- Un cambio mediano (BD/migraciones, auth/permisos, dinero, despliegue) sin carpeta `docs/changes/` enlazada es un hallazgo.
- El veredicto de las pruebas lo da `node --test`: revisa si existe la prueba que ejercita lo nuevo, no si pasa.
- P0/P1 = lo que `REVIEW.md` marca como **bloquea**. Un P0/P1 explica el escenario concreto que falla (entrada → resultado incorrecto) y el arreglo.
- Un PR cuyo único propósito sea actualizar `.claude/STATE.md` después de un merge, tag o deploy es un hallazgo (**bloquea**). Un `STATE.md` que copie hechos de merge, tag, versión o deploy es un hallazgo (**debería**). Regla: bloque «Continuidad de estado» del `CLAUDE.md`.
- Nombres técnicos en inglés (esquema de BD, migraciones, código, comentarios, tests, rutas y campos de API, códigos de error, env vars, ramas, commits): un nombre técnico nuevo en español es un hallazgo (**debería**). Los textos que ve la persona usuaria y los docs van en español.
- El repo es **público**: cualquier credencial, URL de conexión o PIN nuevo en el diff es un hallazgo (**bloquea**).
- Escribe en español. No reportes estilo ni refactors fuera del alcance del PR.
