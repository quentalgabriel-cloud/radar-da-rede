import { describeConsolidationConfig } from "../src/consolidation-config.js";

const report = describeConsolidationConfig(process.env);
for (const line of report.lines) console.log(line);
if (!report.configured) {
  console.error(report.operatorInstruction);
  process.exit(1);
}
