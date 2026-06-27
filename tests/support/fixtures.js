// Shared Playwright fixtures.
//
// The only thing this adds today is opt-in V8 code-coverage collection for the
// browser-side bundle (script.js, plus the src/ modules that also load in the
// page). It is a no-op unless COVERAGE=1 is set, so the normal six-engine test
// run imports `test`/`expect` from here without any behavioral change.
//
// Coverage is gathered through Chromium's CDP (page.coverage.*), which the
// other engines do not expose, so collection is gated to chromium. Raw V8 data
// is handed to monocart-reporter, which aggregates across parallel workers and
// renders the heatmap report at the end of the run.
import { test as base, expect } from "@playwright/test";
import { addCoverageReport } from "monocart-reporter";

const COLLECT = process.env.COVERAGE === "1";

export const test = base.extend({
  coverageAuto: [
    async ({ page, browserName }, use) => {
      const collecting = COLLECT && browserName === "chromium" && page.coverage;
      if (collecting) {
        // resetOnNavigation:false keeps coverage across the goto() inside openApp().
        await page.coverage.startJSCoverage({ resetOnNavigation: false });
      }

      await use();

      if (collecting) {
        // Skipped tests (e.g. touch specs on a desktop engine) produce no
        // usable V8 data; only forward a real, non-empty coverage array.
        const coverage = await page.coverage.stopJSCoverage().catch(() => null);
        if (Array.isArray(coverage) && coverage.length > 0) {
          await addCoverageReport(coverage, test.info());
        }
      }
    },
    { scope: "test", auto: true },
  ],
});

export { expect };
