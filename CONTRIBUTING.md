# Contributing to Token Arena

Thanks for helping people see what the model sees. The project is built so that the most valuable contributions — lessons and translations — need little or no code.

## Local setup

```sh
git clone https://github.com/Thornaci/token-arena
cd token-arena
npm ci
npm run dev
```

`npm run dev` compiles the i18n catalogs and starts Astro on `http://localhost:4321/token-arena/`. Node ≥ 22 required.

Before pushing, run the same gate CI runs:

```sh
npm run i18n:compile && npm run i18n:check && npm run check && npm test && npm run build
```

## Project tour

```
src/
  content/lessons/**      lesson JSON, one file per lesson (the content)
  content/schema.ts       the lesson schema — validates params, pass rules, i18n keys
  components/mechanics/   one React component per mechanic (the renderers)
  components/sim/registry.ts  mechanic name → component map
  content/modules.ts      module order (array position = map position) and the developer section
  engine/                 pure TS: tokenizer, context, billing, sampling, scoring, sim steps,
                          replay, embedding map, image tokens
  stores/                 nanostores: progress (persistent), inspector bridge, byok key custody
  pages/[locale]/         Astro routes (map, lessons, glossary)
  lib/curriculum.ts       unlock order and the displayed lesson numbers
public/prerecorded/       recorded model runs the replay lessons play back
messages/{en,tr,es,fr,zh}.json     flat i18n catalogs (every UI string)
tests/                    unit tests + data-reality locks for lesson numbers
scripts/                  i18n parity check, record.mjs (model recordings)
```

## Lesson ids vs. the numbers players see

A lesson's `id` (`L12.1`), folder (`12-inside-model/`) and i18n prefix (`l12_1_`) are **stable internal keys**: progress, URLs and translations hang off them, so they never change. The number on the map ("2.1") is derived from the module's position in `MODULES` (`src/content/modules.ts`) and the lesson's `order`, so modules can move without a migration. Two consequences:

- A new module gets the next free id number, not its map position (the "Inside the Model" lessons are `L12.x` but show as 2.x).
- Prose never cites a lesson by id or number — `tests/glossary.test.ts` fails on `L2.2`-style references. Say "the next lesson" (and lock that with a `nextLesson` test) or name the topic.

## Add a lesson (no code)

1. **Copy a lesson JSON** from the same mechanic you want (e.g. `src/content/lessons/07-ecosystem/l7-1.json` for a quiz) into the right module folder, with a new `id` (`L<id number>.<order>`) and `order`.
2. **Write your keys**: every `*Key` string in the JSON must exist in `messages/en.json` — and in **every** other catalog (`tr`, `es`, `fr`, `zh`). The build fails on a missing key, `npm run i18n:check` fails on locale drift.
3. **Align the pass**: the schema enforces mechanic-specific rules (e.g. `choiceRounds` length must match the rounds, budgets must be solvable-but-not-free). Run `npm test` — `tests/schema.test.ts` and `tests/lessons.test.ts` tell you exactly what's misaligned.
4. **Lock your numbers**: if your lesson makes a factual claim the player can check (token counts, budget math, sampling answers), add a data test in `tests/lessons.test.ts` that recomputes it with the real engine. For numbers in prose, `expectAllLocalesSay(key, …values)` checks that every locale states the computed value (whole numbers, so `800` never matches inside `8,000`). Copy the nearest existing test.
5. **Register the id**: add it to the expected-id list at the top of `tests/lessons.test.ts` (the test fails otherwise, so nothing ships by accident).
6. The world map and unlock order update automatically from the data.

**A new module** also needs its id in `MODULE_IDS` (`src/content/schema.ts`), an entry in `MODULES` at the position it should appear (add `section: 'developers'` for the optional developer section), and a `module_<id>_title` key (dashes become underscores) in every catalog.

## Record a model-backed lesson

`model-replay`, `meaning-map` and `model-indecision` lessons play back real model runs. The lesson JSON holds every input (model repo, prompts, steps, seeds); the script only runs them:

```sh
node scripts/record.mjs L12.1          # one lesson (ids, not displayed numbers)
node scripts/record.mjs all            # every recordable lesson
```

- Needs Node ≥ 23 (it imports the TypeScript engines directly). Models download once into `node_modules/.cache/huggingface` — several GB for all lessons.
- Output goes to the lesson's `recordingPath` under `public/`. Tests fail if a recording no longer matches its lesson, so change inputs → re-record → commit both.
- Grade model output by its final answer (last number / last yes-no), never by "contains the expected value anywhere" — models restate the question. Read every reply you quote.

## Add a mechanic (some code)

1. **Schema**: add a params schema and a `variant('your-mechanic', yourParams)` entry in `src/content/schema.ts`.
   ⚠️ Never compose the union with `.and()` / intersections — the bundled zod v4 silently swallows nested strict-object violations. Merge base + variant flat, exactly like every existing entry.
   Add a `superRefine` rule tying your mechanic to its pass type (see the existing ones — they're all short).
   If it is round-based (`choiceRounds`), add it to the `roundsOf` switch so answers are range-checked.
2. **Component**: create `src/components/mechanics/YourMechanic.tsx` implementing `MechanicComponentProps` (`lesson`, `locale`, `onPass`). Call `onPass()` exactly once, after `evaluate(lesson.pass, evidence)` passes. Use `lessonText(key, locale, params)` for all copy.
3. **Register** it in `src/components/sim/registry.ts` (lazy import — each mechanic ships as its own chunk). The map is total: `npm run check` fails until every schema mechanic has a renderer.
4. **Inspector**: if your mechanic shows the payload, push `ContextState` via `showInspector`/`updateInspectorState` and use authored `fixedTokens` (the determinism rule: localized prose must never change pass/fail).
5. **Tests**: a rejection case per superRefine rule in `tests/schema.test.ts`; engine logic goes in `src/engine/` with its own test file.

**Proposing a new mechanic?** Open a "lesson proposal" issue first with the player interaction, the pass criterion, and the misconception it kills — mechanics are approved on pedagogy, then built.

## Translate Token Arena

1. Copy `messages/en.json` to `messages/<locale>.json` and translate the values (keys stay identical; `{param}` placeholders must survive).
2. Register the locale in `project.inlang/settings.json`, `astro.config.mjs` (`i18n.locales` + a `urlPatterns` entry), and `src/lib/locales.ts`.
3. `npm run i18n:check` must pass — it fails on any missing or extra key.
4. Lesson **prompts that feed the tokenizer or the model stay in their original language** (they're literal data, not UI copy); everything else localizes.

## Reference: mechanics and pass checks

| Mechanic | Pass check | Lesson example (id) |
| --- | --- | --- |
| `intro-tour` | `none` | M0 |
| `tokenizer-playground` | `completeAll` | L1.1 |
| `token-compare` | `choiceRounds` | L1.2 |
| `stateless-chat` | `choice` | L2.1 |
| `history-bill` | `choice` | L2.2 |
| `window-fit` | `budgetFit` | L3.1 |
| `output-reserve` | `budgetFit` | L3.2 |
| `hierarchy-predict` | `choiceRounds` | L4.1 |
| `injection-defense` | `completeAll` | L4.2 |
| `needle-lab` | `choiceOneOf` / `choice` | L5.1 / L5.2 |
| `tradeoff` | `tradeoff` | L5.3 |
| `sampling-lab` | `choiceRounds` | L6.1 |
| `model-indecision` | `completeAll` (count 1) | L6.2 |
| `quiz` | `choiceRounds` | L7.1 |
| `config-inject` | `choiceRounds` | L7.2 |
| `rules-trim` | `budgetFit` | L7.3 |
| `tool-loop` | `ordering` | L8.1 |
| `compaction-sim` | `choiceRounds` | L9.1 / L10.6 |
| `session-sim` | `choiceRounds` (compaction-sim's renderer under a self-documenting name) | L10.1 |
| `subagent-sim` | `choiceRounds` (main script + isolated `params.sub` script) | L10.3 |
| `byok-chat` | `completeAll` (count 1, inspector required) | L11.1 |
| `model-replay` | `choiceRounds` (scenes: trace, next, continue, occlusion, answers, thinking) | L12.1 / L12.3 / L13.1 / L13.2 / L14.1 |
| `meaning-map` | `choiceRounds` | L12.2 |
| `image-tokens` | `choiceRounds` | L14.2 |

Pass check shapes live in `src/engine/scoring.ts`; the schema's per-mechanic alignment rules live at the bottom of `src/content/schema.ts`.

## PR checklist

- [ ] `npm run i18n:compile && npm run i18n:check` — catalogs compile, locales in sync
- [ ] `npm run check` — zero TypeScript/Astro errors
- [ ] `npm test` — including a data-reality test for any new lesson numbers
- [ ] `npm run build` — static build succeeds
- [ ] New lesson: keys added to **every** locale; pass criteria enforced by schema
- [ ] No new dependencies without discussion in the PR description

## Ground rules

- Accuracy beats flash: every claim a lesson makes must be true (and, where possible, machine-checked).
- Scripted lessons stay deterministic — no runtime randomness, no live tokenization of localized text.
- Be kind; see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
