# Revisión fase 2 · agente-v2

Revisor: Codex · GPT-6 · esfuerzo high (dinero y presupuesto de una API pública)
Fecha: 2026-11-15
Hash revisado: c2bd6be0599023e9a11b0e8a3d56f74dc1b0d801
esfuerzo: high · P0/P1/P2: 0/2/3

## Veredicto

Requiere cambios: los hitos cubren el núcleo, pero falta cerrar el presupuesto monetario y el rechazo de propuestas incompletas, además de completar validaciones explícitas del intent.

## Bloqueantes (P0/P1: escenario que falla → arreglo)

- P1 — El «costo estimado» no define un tope monetario exigible. `plan-candidato.md:9` propone persistencia y mutex, pero no fija moneda, tarifa, reserva antes de enviar ni tratamiento del consumo incierto. Con PIN válido, una llamada puede superar el saldo restante; tras timeout o reinicio puede haberse consumido dinero sin quedar contabilizado. H3 solo comprueba agotamiento y persistencia genéricos (`plan-candidato.md:18`). Esto deja abierto el requisito de presupuesto del servidor, independiente del límite de la key (`intent.md:18`, `sintesis.md:20`). → En H3 definir un máximo conservador por llamada para modelo/ruta fijos y tamaños acotados, reservarlo persistentemente antes de salir a la red y denegar si no cabe. Definir liquidación y conservar el cargo/reserva ante consumo desconocido, sin liberar dinero automáticamente por timeout o reinicio. Validar saldo insuficiente → cero fetch, llamadas simultáneas, fallo/timeout después del envío y reapertura de SQLite. Registrar también moneda, periodo y configuración del límite nativo antes de habilitar el agente.

- P1 — Se pueden perder productos silenciosamente en una propuesta parcial. La «validación estricta» dice que **descarta** ids ajenos y cantidades inválidas (`plan-candidato.md:8`), mientras la UI solo promete un aviso de dudas (`plan-candidato.md:11`). Si el modelo responde un café válido más un id desconocido y `dudas: []`, el filtrado puede producir un ticket cobrable de solo un café. No se establece que la aplicación añada el error ni exija corregirlo; tampoco se define esa compuerta para producto desconocido o cantidad ambigua. Contradice `intent.md:21`. → En H2 rechazar la propuesta completa o devolverla marcada como incompleta por validación local, sin depender de las dudas declaradas por el modelo. En H4 bloquear su aceptación hasta corrección humana. Añadir casos mixtos válido+inválido, producto desconocido y cantidad ambigua, tanto con LLM como con respaldo por reglas; comprobar que no se solicita QR antes de corregir y confirmar.

## Debería (P2)

- P2 — H1/H4 no hacen verificables varias barreras de cobro exigidas. El diseño menciona cantidades editables y token contra respuestas tardías, pero no la edición de productos ni la nueva confirmación al modificar líneas (`plan-candidato.md:11`, `intent.md:14`). MODO_DEMO aparece solo en diseño (`plan-candidato.md:10`). → Añadir a H1 pruebas de ids y cantidades inválidos, precio/total/concepto manipulados ignorados, demo controlada únicamente por servidor y ausencia de degradación a cobro manual si llegan líneas inválidas. Añadir a H4 un guion con edición de producto/cantidad → confirmación invalidada → nueva confirmación → POST solo de ids/cantidades; respuesta tardía y fallo del LLM no deben sobrescribir ni cobrar el ticket. Verificar visualmente nombres, líneas y explicaciones maliciosas como texto: el test de módulo de H2 no acredita el DOM (`intent.md:20`, `plan-candidato.md:17`).

- P2 — Falta el aviso de que el texto se envía al proveedor. «IA: OpenRouter · modelo» (`plan-candidato.md:11`) declara tecnología, pero no informa que OpenRouter recibe el texto, como exige `intent.md:19`. H6 tampoco explicita esa declaración (`plan-candidato.md:21`). → Asignar a H4/H6 un aviso visible junto a la captura y su comprobación manual, además de la declaración de terceros en la entrega. Actualizar los archivos reales `docs/entrega/instrucciones.md:12` y `docs/entrega/descripcion.md:13`, que hoy describen el asistente como «sin IA».

- P2 — La corrida real no incluye todo el corpus exigido ni su criterio de aprobación. H5 exige unas diez frases e inyección, pero omite el nombre de catálogo `<img onerror>` (`plan-candidato.md:20`, frente a `intent.md:23`). Ese caso solo queda con mock en H2. → Incorporarlo expresamente a H5, con catálogo de prueba mínimo, esperados de líneas/cantidades o rechazo/dudas y evidencia por frase. Fijar el modelo antes de la corrida, registrar modelo/configuración, costo y resultado; si se cambia al parseo tolerante de `plan-candidato.md:30`, repetir el corpus y conservar validación local estricta. Concretar la ruta de evidencia como `docs/changes/2026-11-15-agente-v2/corrida-real.md`.

Cobertura contrastada de todos los criterios de terminado (las validaciones del agente son futuras):

| Intent | Paso/hito y validación prevista | Resultado de la revisión |
|---|---|---|
| Texto/dictado, líneas, precio, total y edición (`intent.md:13`) | Diseño UI; H4, navegador | Parcial: precisar edición de productos; dictado del teclado en el guion móvil. |
| Autoridad de catálogo, ids/cantidades, centavos, tope, manual/demo y reconfirmación (`intent.md:14`) | Catálogo/rutas; H1 tests y H4 navegador | Parcial: completar barreras y casos indicados arriba. |
| Sin herramientas de pago/entrega, estado solo del servidor (`intent.md:15`) | Sin tool use; H2 inyección y suite completa | Cubierto en diseño; conservar regresiones de conciliación/entrega. |
| Inyección desde texto/catálogo/concept/metadata (`intent.md:16`) | Datos mínimos; H1 monto y H2 inyección/centinelas | Hacer explícitos esos cuatro orígenes en los casos; verificar estado intacto además del monto. |
| Fallo, demora o salida inválida → respaldo (`intent.md:17`) | H2 fallos/timeout; H4 respaldo | Asignado; verificar en navegador que permite completar un cobro manual. |
| Key, PIN, presupuesto y límites (`intent.md:18`) | H2/H3 tests; H6 barrido; configuración de Diego | Parcial: bloqueante de presupuesto; explicitar tamaño máximo de respuesta, no solo `max_tokens`. |
| Minimización y aviso al cajero (`intent.md:19`) | H2 centinelas; diseño de datos | Centinelas asignados; falta aviso en H4/H6. |
| Renderizado seguro (`intent.md:20`) | `textContent`; H2/H4 | Añadir prueba visual con payload malicioso. |
| Captura incompleta y respuesta tardía (`intent.md:21`) | Dudas y token; H2/H4 | Parcial: bloqueante de captura incompleta y guion de carrera. |
| IA, proveedor/modelo y tercero (`intent.md:22`) | H4 rótulos y H6 docs | Asignado. |
| Suite, corrida real y dictado sin audio (`intent.md:23`) | H1–H6; H5 real | Suite ejecutable; completar corpus real y guion móvil. |

Los cinco huecos de `sintesis.md:19` tienen destino: monto→H1; presupuesto/PIN→H3; inyección/XSS→H2/H4; centinelas→H2; compatibilidad→H5. La síntesis pide 429 para presupuesto y el plan elige 503 (`sintesis.md:20`, `plan-candidato.md:18`): documentar la resolución. 503 es coherente con la UI actual, que interpreta 429 como rechazo del PIN y cierra sesión (`public/caja.html:151`).

Comandos: ejecuté `node --test` en scratch con copia de `src/`, `test/`, `public/` y `package.json`, reutilizando dependencias locales: Node v24.19.0, **27/27 en verde**. `test/server.test.js` existe y permite ampliar los contratos con servidor/pey simulado (`test/server.test.js:7`). `test/catalogo.test.js` y `test/agente.test.js` todavía no existen; son creables en H1/H2 sin infraestructura adicional. `scripts/barrido-secretos.sh` existe. `revision-previa.sh` no está en PATH; el ejecutable global está en `~/.claude/skills/cambio-mediano/revision-previa.sh:4`: concretar su invocación con `--cambio docs/changes/2026-11-15-agente-v2 --esfuerzo high` y la rama destino real. Sus reglas de detección automática de riesgo no incluyen por nombre `src/agente.js` ni `src/server.js` (líneas 42–47).

Reglas consultadas: `CLAUDE.md:4` (verificación), `CLAUDE.md:15` (secretos), `CLAUDE.md:20` (pago), `CLAUDE.md:22` (agente), `CLAUDE.md:25` (cambio mediano); `docs/arranque.md` y `docs/contexto.md`; instrucciones globales AGENTS suministradas; secciones «Revisión cruzada» y «Modelo y esfuerzo» de `~/.claude/reference/forma-de-trabajo-ai-native.md`, y `~/.claude/reference/contenido-no-confiable.md`. No existe AGENTS.md en la raíz ni se encontraron otros dentro del repo. CLAUDE.md no declara `contrato-agentes: v1`; no activa la lectura obligatoria de `docs/agentes.md`. El diseño conserva las reglas centrales de CLAUDE.md; aprobar el candidato no sustituye corregir/resolver hallazgos en `plan.md` antes de código.

## NO VERIFICADO

- Implementación futura de catálogo/agente/presupuesto/UI y todos sus tests nuevos: la suite actual no demuestra esos contratos.
- OpenRouter: compatibilidad del modelo, precios, límite efectivo de la key y corrida real. No se usaron credenciales ni se hicieron llamadas externas; corresponde a H5 con presupuesto aprobado por Diego.
- Barrido de secretos: no ejecutado porque lee `.env` y otros archivos `.env*` restringidos por este perfil (`scripts/barrido-secretos.sh:28`). Su existencia fue comprobada; no se acredita salida limpia ni se reemplaza por un barrido parcial.
- Revisión previa automática: script inspeccionado, no lanzado; esta fase no autoriza escribir su informe adicional ni despachar otra revisión.
- Producción, webhook público y pago real: no tocados. La dependencia externa y el pago de $0.01 siguen pendientes (`plan-candidato.md:24`, `plan-candidato.md:30`).

Integridad de entrada: `git hash-object plan-candidato.md` coincide con el hash del encabezado; `intent.md` dio `71e4458026c5735b72dce7dceed1ae5afa5d5880`, coherente con el prefijo citado en el plan.
