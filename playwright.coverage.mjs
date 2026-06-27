// Coverage-only Playwright config.
//
// Runs the existing e2e suite on Chromium alone with V8 coverage collection on
// (see tests/support/fixtures.js) and renders a monocart heatmap to coverage/e2e/.
// This is an occasional "where is script.js exercised?" measurement, not part of
// the normal test:* runs, so it does not touch playwright.config.mjs.
//
// Use: npm run coverage:e2e
import base from "./playwright.config.mjs";

process.env.COVERAGE = "1";

// Both engines are Chromium-based, so both expose CDP (page.coverage.*) and
// can contribute V8 coverage. mobile-chrome runs the touch specs that desktop
// chromium skips, so merging the two gives the fullest picture of script.js.
const coverageProjects = base.projects.filter((p) =>
  ["chromium", "mobile-chrome"].includes(p.name)
);

const includeTarget = (path) =>
  /(^|\/)script\.js(\?|$)/.test(path) || /(^|\/)src\//.test(path);

// The same physical file is loaded as an http URL (with a ?v= cache-buster) by
// most tests and as an on-disk path by the one file:// test. Normalize both to
// the repo-relative path so their coverage merges into a single entry.
const normalizeSourcePath = (sourcePath) =>
  sourcePath
    .replace(/^https?:\/\/[^/]+\//, "") // strip http host
    .replace(/^.*?((^|\/)(script\.js|src\/))/, "$1") // strip any abs prefix
    .replace(/[?&]v=[^&]*$/, "") // strip ?v= buster (raw)
    .replace(/-v=[^/]*$/, ""); // strip -v= buster (sanitized)

export default {
  ...base,
  // Single worker keeps the cross-worker coverage merge simple and deterministic;
  // one engine of ~49 tests still finishes in a couple of minutes.
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    [
      "monocart-reporter",
      {
        name: "Rain Math — e2e coverage",
        outputFile: "./coverage/e2e/test-report.html",
        coverage: {
          outputDir: "./coverage/e2e",
          // entryFilter: keep our http-served scripts. The single file:// test
          // ("loads directly from index.html") is excluded: its coverage is a
          // near-subset of the http run, and because it resolves to a different
          // URL than the cache-busted http one, including it would split each
          // file into two un-merged entries rather than add signal.
          entryFilter: (entry) =>
            entry.url.startsWith("http") && includeTarget(entry.url),
          // sourceFilter: which resolved source files to keep in the report.
          sourceFilter: (sourcePath) => includeTarget(sourcePath),
          // sourcePath: merge the http-served and file:// copies of each file.
          sourcePath: normalizeSourcePath,
          reports: [["v8"], ["console-summary"], ["lcovonly"]],
        },
      },
    ],
  ],
  projects: coverageProjects,
};
