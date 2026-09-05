// Every canonical module that also has to run inside a Supabase Edge Function.
// The copy is generated, never edited, and the CI check fails when it drifts.
export const EDGE_GENERATED_MODULES = Object.freeze([
  { canonical: "packages/contracts/src/index.js", edge: "supabase/functions/_shared/contracts.js" },
  { canonical: "packages/intelligence/src/index.js", edge: "supabase/functions/_shared/intelligence.js" },
  { canonical: "packages/capture-health/src/index.js", edge: "supabase/functions/_shared/capture-health.js" },
  { canonical: "packages/group-analytics/src/index.js", edge: "supabase/functions/_shared/group-analytics.js" },
  { canonical: "packages/supabase-core/src/consolidation-schedule.js", edge: "supabase/functions/_shared/consolidation-schedule.js" },
  { canonical: "packages/supabase-core/src/operational-health.js", edge: "supabase/functions/_shared/operational-health.js" }
]);

export const generatedBanner = (canonical) => `// GENERATED from ${canonical} — do not edit manually.\n`;
