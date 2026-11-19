Implementó: claude · Revisó: codex · gpt-6/high
Fecha: 2026-11-19
Hash revisado: c09772f6c832844dccfd6d0b92d462a20cb1ef7a
Base: 2d2d9e0550078ab3191b3a8124140e8c1492549f
Destino: main
esfuerzo: high · P0/P1/P2: 0/0/2

## Veredicto
Sin bloqueantes P0/P1 identificados; dos P2 reproducidos que conviene corregir antes de publicar.

## Bloqueantes
Ninguno identificado dentro del modelo de amenaza de `docs/changes/2026-11-15-hosting-vercel/intent.md:24`.

Comprobaciones: `node --test`, exigido por `CLAUDE.md:4`, pasó **87/87**, sin omisiones, con Node 24.19.0 y un Postgres 16 desechable exclusivo en localhost:54339. Incluye concurrencia, límites de PIN/cupo, firmas, reintentos, entrega única, importación y denegación a roles públicos. También apliqué las migraciones nuevas sobre el esquema anterior poblado: se conservaron estados, clasificaciones, tokens, intentos, entrega y las siete políticas RLS. `git diff --check` pasó; HEAD y la base ancestral coinciden con el encargo. Contenedor y volumen exclusivos eliminados al terminar.

Fuentes leídas: instrucciones globales aportadas; secciones «Revisión cruzada» y «Modelo y esfuerzo» de `~/.claude/reference/ai-native-workflow.md`; `CLAUDE.md`, `docs/arranque.md`, `docs/contexto.md`, intent y plan del cambio, diff y código necesario para comprobarlo. No existe `AGENTS.md` en el repo; `CLAUDE.md` no declara `agents-contract: v1`. Revisión a ciegas, sin consultar informes de otros revisores.

Hashes de las entradas documentales leídas (`git hash-object`): intent `43aafe52114d44779489cc6514a6fcf62925c2f4`; plan `e5bb7de125e0fe840c9590c8cdd1654875bd9c32`.

## Debería

- P2 — **Completar el cambio de nombres en el botón «Proponer cobro».** `propose()` devuelve `qty` y `notUnderstood` (`public/caja.html:271`), pero el manejador todavía consulta `p.noEntendido` y asigna `qty = p.cant` (`public/caja.html:286`). Con «dos cafés y un pan», el ejemplo de `README.md:14`, deja `qty` en `undefined` y `paintAgent()` falla en `public/caja.html:274` con `TypeError: Cannot read properties of undefined (reading 'cafe')`. El formulario conserva el ticket anterior y el menú también falla después; el texto no reconocido tampoco muestra su aviso. Reproducido ejecutando el script real en `node:vm` con un DOM mínimo. **Arreglo:** consumir `p.notUnderstood` y `p.qty`; comprobar propuesta válida, texto no reconocido y uso posterior del menú. La captura manual sigue disponible, por lo que queda como P2.

- P2 — **Permitir el pooler de sesión en la conexión de aplicación del importador.** Con `DATABASE_URL_APP` configurada al puerto **5432**, como la aplicación actual, `main()` exige `checkTarget(appUrl, 6543)` y aborta antes de importar/verificar (`scripts/migrar-sqlite-a-pg.js:206`). La decisión de usar sesión está documentada en `docs/changes/2026-11-15-hosting-vercel/despliegue.md:53` y `README.md:36`; el propio driver advierte sobre los cuelgues del modo transaccional (`src/core.js:12`). Reproducido sin conexión remota pasando una URL sintética del proyecto con puerto 5432 al mismo guard: devuelve «target is not the production pooler … :6543». **Condición:** se utiliza la opción `DATABASE_URL_APP` para verificar con el rol de aplicación; sin ella verifica como administrador. **Arreglo:** validar el puerto 5432 para esa opción y comprobar este caso con la configuración elegida para producción.

## NO VERIFICADO

- Despliegue de este SHA, DNS/TLS efectivos, variables de Vercel, webhook y pago reales, apagado del Mac y prueba desde otra red. Son evidencia documental de `docs/changes/2026-11-15-hosting-vercel/despliegue.md:55`, no comprobaciones propias; no accedí a producción. Las salvedades están declaradas en `despliegue.md:65`.
- Barrido integral por valores reales y revisión de `.env.example`: las reglas de acceso bloquean `.env*`. No ejecuté el barrido que los lee ni certifiqué ausencia de secretos por comparación con credenciales.
- Interfaz en navegador real y comportamiento del pooler remoto. La reproducción de la captura fue programática; las pruebas de BD usaron Postgres local.
- Variante exacta del modelo: la sesión identifica la familia GPT-6, sin exponer un identificador más específico; el encabezado refleja esa familia.

Evidencia local de ejecución: `/private/tmp/ya-cayo-review-c097-qiq3cd1s/test-output.txt`, `reproduce-review.mjs` y `reproduce-upgrade.mjs` en el mismo scratch. El único archivo escrito en el repo es este informe.
