# Desk Rules CLI

This public repository contains the exact reviewed source used to publish
[`@desk-rules/cli`](https://www.npmjs.com/package/@desk-rules/cli).

The CLI helps users configure, diagnose, and update their connection to the
hosted Desk Rules MCP service. Feature development remains canonical in the
private Desk Rules monorepo; releases are exported here through a strict file
allowlist without private Git history.

## Development

```sh
npm ci
npm run check:export
npm run build
npm test
npm run check:package
npm run check:package-contents
npm audit --omit=dev
```

The publishable npm package lives in [`package/`](package/). Root development
dependencies are private workspace tooling and do not become npm package
metadata.

## Release integrity

`SOURCE_EXPORT.json` records the private canonical commit and SHA-256 digest of
every exported file. CI rejects missing, modified, or unexpected release files.
Publication runs only from the approval-gated `npm` environment through npm
trusted publishing and GitHub OIDC. No npm token is stored in this repository.

## License boundary

The files in this repository and the bundled CLI package are licensed under
the Apache License 2.0. The hosted Desk Rules service and private Desk Rules
monorepo remain proprietary. The license does not grant trademark rights.
