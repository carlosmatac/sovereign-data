## Developer Ideas

This file contains raw product and technical ideas that came up during development.

It is intentionally unstructured. Nothing in this list should be implemented directly.  
The goal is to convert each idea into a proper feature spec before implementation.

Some ideas may overlap or need to be merged into a single spec.

---

## Backlog Ideas

### 1. Entity relationship extraction is not good enough

Entity relationships are currently not being created reliably.

Examples:
- If the user uploads a source and manually tags a participant and their organization/company, the system should create a relationship between them when enough information is available.
- Some sources produce no relationships at all, even when the transcript clearly contains relationship signals.
- The LLM seems to be missing many obvious relationships or lacks strong enough instructions to extract them consistently.

This needs a dedicated spec to improve relationship extraction behavior.

Questions to define:
- Should a project itself be represented as an entity?
- Should the system automatically create a relationship between extracted entities and the project entity?
- Should a source itself be modeled as an entity, or should `source_entities` remain the source-to-entity association layer?
- What relationship types should be created automatically from upload anchors?
- What relationship types should the LLM be explicitly encouraged to extract?
- How do we prevent noisy, duplicate, or weak relationships?

This is important because the graph, retrieval, Copilot and relationship-based context all depend on high-quality relationship extraction.

---

### 2. Knowledge Library needs better organization

The Knowledge page currently behaves like a flat dump of all sources.

This does not scale. As more interviews, documents, notes, reports, emails and future source types are added, the page will become cluttered and hard to use.

The Knowledge page should become a proper knowledge library, organized by:
- source type;
- project;
- status;
- topic;
- entity;
- date;
- source importance or relevance.

The source list should not grow infinitely down the page. It needs contained cards, filters, search, pagination or internal scrolling.

Goal:
Turn Knowledge from a flat source list into a user-friendly cross-project library.

---

### 3. User-created entities and relationships

It may be useful to let users manually create entities or relationships directly from the UI.

This is only an early idea, but it could be important for:
- correcting missed LLM extraction;
- adding known relationships not explicitly stated in the transcript;
- preparing sources before ingestion;
- improving the graph manually.

This should probably become a governance/review feature rather than a quick UI action.

Open questions:
- Who is allowed to create relationships?
- Do manually created relationships require evidence?
- Should they be marked as `manual` origin?
- Can users link a manual relationship to a source or chunk?
- Should manual relationships bypass the LLM or feed future extraction?

---

### 4. Copilot answers are too short / not using enough context

The Copilot retrieval flow seems to produce answers that are too short.

It may not be using all the available context properly:
- entity descriptions;
- entity metadata;
- source_entities.context;
- source summaries;
- chunks;
- relationships;
- project context;
- chat evidence.

This needs investigation.

Goal:
Improve retrieval and answer generation so the Copilot gives richer, more useful answers while staying grounded in internal knowledge.

Possible areas to inspect:
- retrieval ranking;
- context window construction;
- prompt instructions;
- evidence pack formatting;
- whether entity and source context are actually passed to the LLM;
- whether the model is instructed to synthesize or just summarize briefly.

---

### 5. Sales War Room mock data should be removed or made editable

The Sales War Room currently contains mock data such as cash, revenue, pipeline value or similar commercial metrics.

This was originally intended to represent data coming from a customer CRM. However, right now it is static mock data and appears the same across projects.

This creates confusion.

Options:
- remove these metrics for now;
- clearly mark them as demo/mock data;
- make them editable per project;
- replace them with source-grounded project intelligence;
- only show CRM-like metrics once real CRM integration exists.

This needs a product decision before implementation.

---

### 6. Entity autocomplete label is wrong

In the Add Source form, the autocomplete suggestion label always shows `Project`.

This does not seem useful and may be misleading.

Expected behavior:
- show the real entity type, e.g. `Person`, `Company`, `Government`, `Country`;
- optionally show whether the entity is project-scoped or global;
- avoid confusing scope labels with entity type labels.

This is likely a small UX bug.

---

### 7. Relationship extraction needs stronger instructions and validation

This overlaps with idea #1 but is important enough to call out.

The LLM is not reliably creating entity relationships. It may need:
- stronger extraction prompts;
- clearer relationship type taxonomy;
- examples;
- negative examples;
- validation rules;
- confidence thresholds;
- source/chunk grounding requirements.

The goal is not just “more relationships”, but better relationships:
- meaningful;
- directional;
- typed;
- evidence-backed;
- not duplicated;
- useful for graph and retrieval.

This should probably be merged with the broader relationship extraction spec.

---

### 8. Chat scope selection

The Copilot should allow users to limit the scope of retrieval.

For example, the user could choose:
- one project;
- multiple projects;
- one source;
- several sources;
- a saved collection;
- a source type;
- entity(ies)
- maybe a “semantic view” equivalent.

This is similar to how some data platforms let users choose which semantic view or knowledge base to query.

Goal:
Let users control what knowledge the Copilot is allowed to use before asking a question.

This would improve:
- precision;
- user trust;
- explainability;
- project-specific workflows;
- meeting preparation.

---

### 9. Fire-and-forget pipeline risk

Some long-running processes may be launched and then continue independently on the server.

This needs investigation.

Potential issue:
A user uploads a long interview, the pipeline starts, something fails midway, and the system does not have a robust retry/resume/job tracking mechanism.

Questions:
- Are we currently running long jobs in a fragile request lifecycle?
- What happens if the server restarts?
- What happens if AssemblyAI completes but our pipeline fails?
- Do we retry?
- Can the job resume from the last completed phase?
- Does the user see a useful error?
- Are partial writes cleaned up or preserved?

This should start as an investigation spec, not direct implementation.

---

### 10. Pipeline partial-write consistency

Related to the fire-and-forget concern.

If a source fails halfway through processing, some derived data may already have been written:
- entities;
- mentions;
- relationships;
- chunks;
- source_entities;
- summaries;
- metadata.

We need to decide how to handle partial processing states.

Options:
- all-or-nothing transactional writes;
- phase-level commits with retry/resume;
- mark incomplete derived data as stale;
- delete and replace derived data on retry;
- use job state checkpoints;
- allow user-triggered reprocess to repair the source.

This requires a clear architecture decision.

Goal:
Avoid inconsistent database states where a source appears processed but key derived data is missing.