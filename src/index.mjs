// Public API surface for the package.
//
// The CLI is the primary interface, but the pieces are useful on their own: the
// claim extractors, the check registry, the auditor and the two renderers. This
// module is what `exports` in package.json points at, so keep it in step with
// what the README tells people they can import.

export { audit, CHECKS, SEVERITY, claimsFromReadme, claimsFromManifest } from './plumbline.mjs';
export { renderMarkdown, renderJson } from './report.mjs';
export { selfcheck, renderSelfcheck } from './selfcheck.mjs';
