import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const metadata = JSON.parse(readFileSync("package/package.json", "utf8"))
assert.equal(metadata.name, "@desk-rules/cli")
assert.equal(metadata.version, "0.2.1")
assert.equal(metadata.license, "Apache-2.0")
assert.equal(metadata.repository.url, "git+https://github.com/ga6es/desk-rules-cli.git")
assert.equal(metadata.repository.directory, "package")
assert.deepEqual(metadata.dependencies, { "smol-toml": "1.7.1" })
assert.equal(metadata.scripts.postinstall, undefined)
assert.deepEqual(metadata.files, [
  "dist",
  "LICENSE",
  "NOTICE",
  "README.md",
  "package.json",
  "skills/desk-rules-mcp",
])

const license = readFileSync("package/LICENSE", "utf8")
const notice = readFileSync("package/NOTICE", "utf8")
assert.match(license, /Apache License/)
assert.match(license, /Copyright 2026 Desk Rules contributors/)
assert.match(notice, /Desk Rules contributors/)

process.stdout.write("Desk Rules CLI package contract passed.\n")
