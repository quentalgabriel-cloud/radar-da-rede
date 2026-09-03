export const REQUIRED_CONSOLIDATION_VARIABLES = Object.freeze([
  "RADAR_SUPABASE_URL",
  "RADAR_NETWORK_ID",
  "RADAR_PROCESSING_SECRET"
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MINIMUM_SECRET_LENGTH = 32;

const OPERATOR_INSTRUCTION = [
  "Consolidation is not configured, so no Radar window can be processed.",
  "Configure the repository secrets RADAR_SUPABASE_URL, RADAR_NETWORK_ID and RADAR_PROCESSING_SECRET",
  "(Settings -> Secrets and variables -> Actions). RADAR_PROCESSING_SECRET must be an active row in",
  "public.processing_credentials for RADAR_NETWORK_ID. See docs/DEPLOYMENTS.md."
].join(" ");

export function describeConsolidationConfig(env = {}) {
  const problems = [];
  for (const name of REQUIRED_CONSOLIDATION_VARIABLES) {
    const value = typeof env[name] === "string" ? env[name].trim() : "";
    if (!value) {
      problems.push(`${name}: missing`);
      continue;
    }
    if (name === "RADAR_SUPABASE_URL" && !/^https:\/\/[^\s/]+$/.test(value)) {
      problems.push(`${name}: must be the https origin of the Supabase project, without path`);
    }
    if (name === "RADAR_NETWORK_ID" && !UUID_PATTERN.test(value)) {
      problems.push(`${name}: must be a UUID`);
    }
    if (name === "RADAR_PROCESSING_SECRET" && value.length < MINIMUM_SECRET_LENGTH) {
      problems.push(`${name}: must have at least ${MINIMUM_SECRET_LENGTH} characters`);
    }
  }
  const configured = problems.length === 0;
  return {
    configured,
    problems,
    operatorInstruction: OPERATOR_INSTRUCTION,
    lines: configured
      ? ["Consolidation configuration present for the three required secrets."]
      : ["Consolidation configuration is incomplete:", ...problems.map((problem) => `- ${problem}`)]
  };
}
