---
title: "Time-aware RAG: posiciones validadas globales + chat"
status: done
owner: team
priority: high
last_updated: 2026-03-22
related_architecture:
  - ../../architecture/agentic-rag.md
related_infrastructure: []
---

# Time-aware RAG: posiciones validadas globales + chat

## Problem

El chat agentic prioriza relaciones y chunks RAG, pero **no hay una fuente de verdad** para cargos/posiciones (persona ↔ organización) con validez temporal explícita. Las entrevistas pueden mencionar cargos desactualizados o aproximados; el modelo no distingue de forma fiable entre **dato validado**, **mención contextual** e **incertidumbre**.

## Goals

- Capa **global** de posiciones validadas (`validated_positions`) leída en servidor e integrada en el flujo de chat.
- **Clasificación temporal** del turno del usuario para enrutar prefetch, tool y rerank de evidencia.
- **Jerarquía de evidencia:** posición validada gana frente a texto de entrevistas; sin validado → lenguaje degradado (“se mencionó”, etc.).
- **Evidencia temporal acotada:** menciones y relaciones ordenadas por recencia / proximidad a fecha objetivo cuando aplica; RAG rerankeado por fecha de entrevista según intención.
- Contrato mínimo de **sugerencias de título** (DISTINCT) para quien construya admin más adelante.
- Documentación de arquitectura del chat alineada con el flujo real.

## Non-goals (esta iteración)

- Admin UI, matriz de permisos de administrador, CRUD de posiciones en producto.
- `position_proposals` y detección automática desde pipeline de ingesta.

La población inicial de filas es **manual** (SQL / service role / track futuro), no obligatoria en código en esta fase.

## Approach

Resumen alineado con el plan de producto (referencia histórica: plan Cursor `time-aware_rag_plan_polish` si aún existe localmente).

1. **Modelo de datos:** tabla global sin `project_id`; enums de estado y precisión temporal; RLS de lectura para `authenticated`; escritura fuera del producto en esta iteración.
2. **Consultas y tool:** modos `current` / `as_of` / `timeline`; degradación por precisión; bloque determinista en system prompt cuando aplica.
3. **Clasificador previo al chat:** `temporal_intent`, foco, fecha explícita; fallback seguro si falla el modelo.
4. **Chat route:** clasificación → resolución de entidades → prefetch de posiciones → `hybrid_search` con rerank por recencia temporal; tool `lookupPositions`; prompt y logging de grounding actualizados.
5. **Entity lookup:** menciones y relaciones con señales de recencia y proximidad temporal donde corresponde.
6. **Pruebas:** unitarias sobre helpers temporales; checklist manual de prompts en `/chat`.

## Technical notes

| Área | Ruta |
|------|------|
| Migración | `supabase/migrations/00017_validated_positions.sql` |
| Tipos DB | `src/types/database.ts` (`PositionState`, `DatePrecision`, `validated_positions`, RPC en `Functions`) |
| Lógica temporal pura | `src/lib/positions/as-of-logic.ts` |
| Consultas + formato prompt | `src/lib/positions/query-validated-positions.ts` |
| Clasificador | `src/lib/ai/chat-temporal-classifier.ts` |
| Chat API | `src/app/api/chat/route.ts` |
| Tools / menciones / relaciones | `src/lib/ai/entity-lookup.ts` |
| API títulos (GET autenticado) | `src/app/api/positions/titles/route.ts` → `{ titles }` |
| Arquitectura RAG | `docs/architecture/agentic-rag.md` |
| Ejemplo seed manual | `scripts/seed-validated-position.example.sql` (comentado; requiere UUIDs reales) |
| Tests (Vitest) | `vitest.config.ts`, `src/lib/positions/*.test.ts`; `npm run test` |

**Supabase:** la migración `00017` debe estar aplicada en cada entorno; sin tabla/RPC, el chat y `GET /api/positions/titles` fallan.

---

## Comportamiento operativo (confirmado en código + prompt)

### Prioridad entre varias posiciones `active`

| Origen de la lista | Orden implementado |
|--------------------|--------------------|
| **Persona** (`fetchCurrentPositionsForPerson`, tool `current` / fallback) | `ORDER BY is_main DESC`, luego `validated_at DESC`. En Postgres, `is_main = true` va **primero**. Si **ninguna** fila tiene `is_main`, todas empatan en `false` y el desempate es solo **`validated_at` más reciente primero**. |
| **Persona as-of** (`fetchPositionsForPersonAsOf`, tras filtrar) | Primero `is_main === true`, luego `validated_at` descendente (lexicográfico ISO). |
| **Organización** (`fetchActivePositionsForOrganization`) | Solo `ORDER BY is_main DESC` — **no** hay segundo criterio por `validated_at` en código. |

El system prompt indica explícitamente: entre activas, **preferir la marcada MAIN** si hay varias — coherente con el orden de las filas devueltas.

**Implementación:** `src/lib/positions/query-validated-positions.ts`; reglas de prompt en `src/app/api/chat/route.ts` (GROUNDING RULES).

### Degradación y señales al modelo

| Escenario | Qué hace el código | Comportamiento esperado del chat |
|-----------|-------------------|----------------------------------|
| **Consulta histórica** (`temporal_intent === point_in_time`) **y** precisión `unknown` en **cualquiera** de los dos extremos (`valid_from_precision` o `valid_to_precision`) | `lookupPositions` → `enrichPositionForTool` pone `confidence_degraded: true` y `confidence_note` (“treat historical placement as approximate”). | Tratar la colocación en el tiempo como **aproximada**, no como fecha pin-point. |
| **Solo `approximate`** (sin `unknown` en extremos) | **No** se activa `confidence_degraded` en código; el tool sigue devolviendo `valid_from` / `valid_to` con `precision: "approximate"`. | El modelo debe **matizar** con el lenguaje usando esas precisiones; no hay flag automático. |
| **Fecha extremo desconocida** (`null` + `unknown`) | `as-of-logic` trata el extremo como **abierto** donde aplica; el prefetch muestra `? (unknown)` en la línea de texto. | Respuesta prudente en calendario; puede combinarse con `confidence_degraded` en modo `as_of` si la intención es `point_in_time`. |
| **Organización desconocida** | `organization_entity_id` NULL → join sin nombre; prefetch: `(organization unknown)`; tool: `organization_name: null`. | Cargo validado **sin** empleador resuelto; no inventar empresa. |
| **`freshness_bucket === old`** (`validated_at` con ≥12 meses de antigüedad de calendario) | Siempre se calcula en el tool; **no** cambia el texto del bloque “authoritative” ni rebaja RLS. | Sigue siendo **posición validada** respecto a transcripciones; el modelo puede **advertir** desactualización potencial usando `freshness_bucket` si lo considera útil. |

### Latencia del clasificador temporal (por turno)

- **Una** llamada `generateObject` (GPT-4o-mini) **antes** de embeddings y `hybrid_search` (`classifyChatTemporalIntent` en `src/lib/ai/chat-temporal-classifier.ts`).
- Límites: `timeout: 10_000` ms, `maxRetries: 1`, `maxOutputTokens: 256`.
- **Impacto:** suma latencia de red + inferencia (típicamente sub-segundo a pocos segundos). Si falla o hace timeout → **fallback** `temporal_intent: general_background` (sin prefetch de posiciones por intención temporal; el resto del chat sigue).

### Checklist manual: sin posición validada

**Objetivo:** comprobar que la respuesta usa **evidencia contextual degradada** y **no** presenta entrevistas como verdad validada de org chart.

1. Elegir un **PERSON** que exista en `entities` y tenga **cero** filas en `validated_positions` (o preguntar de forma que el prefetch no cargue filas).
2. Pregunta de **rol / empleador / CEO** que fuerce herramientas o RAG (p. ej. “¿Qué cargo tiene [nombre] ahora?”).
3. **Esperado:** no hay líneas en el bloque “VALIDATED POSITIONS” con datos de esa persona (o `lookupPositions` → `found: false` si el modelo la llama).
4. **Criterio de éxito:** la respuesta atribuye el cargo a **entrevista / mención** (“se mencionó”, “en una entrevista se le refirió como…”) y **no** como registro validado global; si hay chunks, citar [n] sin igualar a “dato de RR.HH. validado”.

**Regla en prompt (referencia):** GROUNDING RULES §2 en `src/app/api/chat/route.ts` — claims sin posición validada.

---

## Dependencies & related docs

- Entidades globales existentes (`entities`); entrevistas con `conducted_at` / `created_at` para recencia.
- [`HANDOVER.md`](../../HANDOVER.md): patrón admin client para mutaciones; OpenAI structured outputs (Zod sin `.optional()` en `generateObject` — usar `.nullable()`); RLS helpers SECURITY DEFINER.

## Risks & open questions

- Muchas entrevistas con `conducted_at` NULL: fallback a `created_at` (documentado en código / arquitectura).
- Cumplimiento del modelo con “gana validado”: mitigado por inyección + instrucciones; revisar trazas en producción.
- Coste/latencia del **clasificador por turno:** vigilar límites y fallback (timeout configurado en código).

## Acceptance / validation (cerrado)

- Migración aplicada y `validated_positions` poblada con UUIDs reales.
- **Validado en producto:** preguntas de **cargo actual** (p. ej. CEO de empresa asociada) responden usando la capa temporal / posiciones validadas como se esperaba.
- `npm run build` y `npm run test` pasan en el repo.

## Implementation log

### Entregado

- **DB:** enums `position_state`, `date_precision`; tabla `validated_positions`; RLS SELECT para `authenticated`; RPC `list_distinct_position_titles(p_limit)`.
- **App:** consultas, prefetch, tool `lookupPositions`, clasificador con timeout, rerank RAG y ajustes en `entity-lookup`; `GET /api/positions/titles`.
- **Tests unitarios** (`as-of-logic`, `query-validated-positions`); **docs** `agentic-rag.md` + esta spec.

### Seguimiento opcional (nueva spec si se prioriza)

- Admin UI + permisos + CRUD de posiciones.
- `position_proposals` y detección desde pipeline.
- Tests de integración con mock de Supabase para `route.ts` / tool.
- Aplicar `00017` en **producción** cuando toque el despliegue.

Plan detallado original (referencia local posible): `~/.cursor/plans/time-aware_rag_plan_polish_86cc0984.plan.md`.
