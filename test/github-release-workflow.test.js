const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readWorkflow() {
  const workflowPath = path.join(__dirname, "..", ".github", "workflows", "release.yml");
  return fs.readFileSync(workflowPath, "utf8");
}

test("release workflow runs on v* tag pushes", () => {
  const workflow = readWorkflow();
  assert.match(workflow, /tags:\n\s+- 'v\*'/);
});

test("release workflow writes GitHub release contents", () => {
  const workflow = readWorkflow();
  assert.match(workflow, /permissions:\n\s+contents: write/);
  assert.match(workflow, /uses: softprops\/action-gh-release@v2/);
});

test("release workflow verifies tag version and builds the mac artifacts", () => {
  const workflow = readWorkflow();
  assert.match(workflow, /node scripts\/verify-release-tag\.js/);
  assert.match(workflow, /npm run dist:mac/);
});

test("release workflow uploads only the dmg and zip release artifacts", () => {
  const workflow = readWorkflow();
  assert.match(workflow, /release\/TermCanvas-\$\{\{ steps\.package_version\.outputs\.value \}\}-arm64\.dmg/);
  assert.match(workflow, /release\/TermCanvas-\$\{\{ steps\.package_version\.outputs\.value \}\}-arm64-mac\.zip/);
  assert.doesNotMatch(workflow, /blockmap/);
});

test("README documents the version tag release flow", () => {
  const readmePath = path.join(__dirname, "..", "README.md");
  const readme = fs.readFileSync(readmePath, "utf8");

  assert.match(readme, /## GitHub Releases/);
  assert.match(readme, /npm version patch --no-git-tag-version/);
  assert.match(readme, /git tag v0\.1\.1/);
  assert.match(readme, /git push origin v0\.1\.1/);
  assert.match(readme, /GitHub Release/);
});
