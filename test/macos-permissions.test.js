const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");

test("mac packaging declares terminal-host privacy access", () => {
  const builderConfig = fs.readFileSync(path.join(repoRoot, "electron-builder.yml"), "utf8");

  assert.match(builderConfig, /entitlements: build\/entitlements\.mac\.plist/u);
  assert.match(builderConfig, /entitlementsInherit: build\/entitlements\.mac\.inherit\.plist/u);
  assert.match(builderConfig, /NSDesktopFolderUsageDescription:/u);
  assert.match(builderConfig, /NSAppleMusicUsageDescription:/u);
  assert.match(builderConfig, /NSAppleEventsUsageDescription:/u);
  assert.match(builderConfig, /NSSystemAdministrationUsageDescription:/u);
});

test("mac entitlements allow Electron and terminal child automation", () => {
  ["entitlements.mac.plist", "entitlements.mac.inherit.plist"].forEach((fileName) => {
    const entitlements = fs.readFileSync(path.join(repoRoot, "build", fileName), "utf8");

    assert.match(entitlements, /<key>com\.apple\.security\.automation\.apple-events<\/key>\s*<true\/>/u);
    assert.match(entitlements, /<key>com\.apple\.security\.cs\.allow-jit<\/key>\s*<true\/>/u);
    assert.match(entitlements, /<key>com\.apple\.security\.cs\.allow-unsigned-executable-memory<\/key>\s*<true\/>/u);
  });
});

test("mac app menu links to Full Disk Access settings", () => {
  const mainSource = fs.readFileSync(path.join(repoRoot, "main.js"), "utf8");

  assert.match(mainSource, /Open Full Disk Access Settings\.\.\./u);
  assert.match(mainSource, /x-apple\.systempreferences:com\.apple\.preference\.security\?Privacy_AllFiles/u);
});
