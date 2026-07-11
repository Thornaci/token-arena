# Contributing to Token Arena

Thanks for helping developers see what the model sees. The project is built so that the most valuable contributions — lessons and translations — need little or no code.

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
  engine/                 pure TS: tokenizer, context, billing, sampling, scoring, sim steps
  stores/                 nanostores: progress (persistent), inspector bridge, byok key custody
  pages/[locale]/         Astro routes (map, lessons, summary)
messages/{en,tr}.json     flat i18n catalogs (every UI string)
tests/                    unit tests + data-reality locks for lesson numbers
scripts/                  i18n parity check, L6.2 recording script
```

## Add a lesson (no code)

1. **Copy a lesson JSON** from the same mechanic you want (e.g. `src/content/lessons/07-ecosystem/l7-1.json` for a quiz) into the right module folder, with a new `id` (`L<module>.<order>`) and `order`.
2. **Write your keys**: every `*Key` string in the JSON must exist in `messages/en.json` — and in **every** other catalog (`tr.json`). The build fails on a missing key, `npm run i18n:check` fails on locale drift.
3. **Align the pass**: the schema enforces mechanic-specific rules (e.g. `choiceRounds` length must match the rounds, budgets must be solvable-but-not-free). Run `npm test` — `tests/schema.test.ts` and `tests/lessons.test.ts` tell you exactly what's misaligned.
4. **Lock your numbers**: if your lesson makes a factual claim the player can check (token counts, budget math, sampling answers), add a data test in `tests/lessons.test.ts` that recomputes it with the real engine. Every existing lesson has one — copy the nearest.
5. The world map, unlock order, and XP totals update automatically from the data.

## Add a mechanic (some code)

1. **Schema**: add a params schema and a `variant('your-mechanic', yourParams)` entry in `src/content/schema.ts`.
   ⚠️ Never compose the union with `.and()` / intersections — the bundled zod v4 silently swallows nested strict-object violations. Merge base + variant flat, exactly like every existing entry.
   Add a `superRefine` rule tying your mechanic to its pass type (see the existing ones — they're all short).
2. **Component**: create `src/components/mechanics/YourMechanic.tsx` implementing `MechanicComponentProps` (`lesson`, `locale`, `onPass`). Call `onPass()` exactly once, after `evaluate(lesson.pass, evidence)` passes. Use `lessonText(key, locale, params)` for all copy.
3. **Register** it in `src/components/sim/registry.ts` (lazy import — each mechanic ships as its own chunk).
4. **Inspector**: if your mechanic shows the payload, push `ContextState` via `showInspector`/`updateInspectorState` and use authored `fixedTokens` (the determinism rule: localized prose must never change pass/fail).
5. **Tests**: a rejection case per superRefine rule in `tests/schema.test.ts`; engine logic goes in `src/engine/` with its own test file.

**Proposing a new mechanic?** Open a "lesson proposal" issue first with the player interaction, the pass criterion, and the misconception it kills — mechanics are approved on pedagogy, then built.

## Translate Token Arena

1. Copy `messages/en.json` to `messages/<locale>.json` and translate the values (keys stay identical; `{param}` placeholders must survive).
2. Register the locale in `project.inlang/settings.json`, `astro.config.mjs` (`i18n.locales` + a `urlPatterns` entry), and `src/lib/locales.ts`.
3. `npm run i18n:check` must pass — it fails on any missing or extra key.
4. Lesson **prompts that feed the tokenizer or the model stay in their original language** (they're literal data, not UI copy); everything else localizes.

## Reference: mechanics and pass checks

| Mechanic | Pass check | Lesson example |
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
| `compaction-sim` | `choiceRounds` | L9.1 |
| `byok-chat` | `completeAll` (count 1, inspector required) | L10.1 |

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
