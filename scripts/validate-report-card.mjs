/**
 * Validates the real `LLM_REPORT_CARD.md` against the parser the site is built with.
 *
 * This is deliberately NOT a unit test: the document is content the owner edits daily, so a
 * content change must only ever be able to fail *validation*, and only for a genuine schema
 * violation (bad table shape, unknown aspect, duplicate model, ...).
 *
 * Run with `npm run validate -w report-card`.
 *
 * The parser is TypeScript with extensionless imports, which Node cannot load on its own, and
 * `tsx` is not a dependency. Vite is (it builds the site), and its `runnerImport` runs a module
 * through Vite's own transform pipeline — so this needs no new dependency and no build step.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const REPORT_CARD_PATH = fileURLToPath(new URL('../LLM_REPORT_CARD.md', import.meta.url));
const PARSER_PATH = fileURLToPath(new URL('../src/data/parseReportCard.ts', import.meta.url));

/** ReportCardParseError crosses a module-runner boundary, so check the shape, not the identity. */
function isParseError(error) {
  return error instanceof Error && error.name === 'ReportCardParseError';
}

const { module: parser } = await runnerImport(PARSER_PATH, {
  configFile: false,
  logLevel: 'silent',
});

let card;
try {
  card = parser.parseReportCard(readFileSync(REPORT_CARD_PATH, 'utf8'));
} catch (error) {
  // ReportCardParseError already prefixes its message with `LLM_REPORT_CARD.md:<line>: `.
  console.error(isParseError(error) ? error.message : `LLM_REPORT_CARD.md: ${error}`);
  process.exitCode = 1;
  process.exit();
}

const pros = card.models.reduce((total, model) => total + model.prosCount, 0);
const cons = card.models.reduce((total, model) => total + model.consCount, 0);
const covered = new Set(card.models.flatMap((model) => model.coveredAspects));
const orderedCovered = card.aspects.filter((aspect) => covered.has(aspect));
const verdictCount = card.models.filter((model) => model.verdict).length;

console.log(`LLM_REPORT_CARD.md is valid — "${card.title}"`);
console.log(`  providers:       ${card.providers.length} (${card.providers.map((p) => p.name).join(', ')})`);
console.log(`  models:          ${card.models.length}`);
console.log(`  harnesses:       ${card.harnesses.length} (${card.harnesses.map((h) => h.name).join(', ')})`);
console.log(`  aspects:         ${orderedCovered.length} of ${card.aspects.length} with observations`);
console.log(`  notes:           ${pros} pros, ${cons} cons`);
console.log(`  verdicts:        ${verdictCount} of ${card.models.length} models`);
console.log(`  recommendations: ${card.recommendations.length}`);
console.log(
  `  task verdicts:   ${card.taskVerdicts.length} across ${new Set(card.taskVerdicts.map((v) => v.task)).size} tasks`,
);

// Optional, non-blocking: flag a recommended setup whose model has no Task Verdicts row for
// that task — the recommended model would then be missing from the Decide list entirely.
for (const recommendation of card.recommendations) {
  const covered = card.taskVerdicts.some(
    (verdict) => verdict.task === recommendation.task && verdict.model === recommendation.model,
  );
  if (!covered) {
    console.warn(
      `warning: recommendation for "${recommendation.task}" points at "${recommendation.model}", which has no Task Verdicts row for that task; the Decide list will not show it`,
    );
  }
}

// Optional, non-blocking: flag a model whose newest dated note is later than its verdict date,
// which usually means the verdict line was left stale after a newer observation was added.
const DATED_NOTE_PATTERN = /^\((\d{4}-\d{2}-\d{2})\)/;
for (const model of card.models) {
  if (!model.verdict) continue;
  const noteDates = model.aspects
    .flatMap((entry) => [...entry.pros, ...entry.cons])
    .map((note) => DATED_NOTE_PATTERN.exec(note.trim())?.[1])
    .filter((date) => Boolean(date));
  if (noteDates.length === 0) continue;
  const newestNoteDate = noteDates.reduce((latest, date) => (date > latest ? date : latest));
  if (newestNoteDate > model.verdict.date) {
    console.warn(
      `warning: model "${model.name}" has a dated note from ${newestNoteDate}, after its verdict date ${model.verdict.date}; consider updating the Verdict line`,
    );
  }
}
