const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getExpectedTagName,
  assertReleaseTagMatchesVersion
} = require("../scripts/verify-release-tag");

test("getExpectedTagName prefixes the package version with v", () => {
  assert.equal(getExpectedTagName("0.1.1"), "v0.1.1");
});

test("assertReleaseTagMatchesVersion accepts a matching tag", () => {
  assert.doesNotThrow(() => {
    assertReleaseTagMatchesVersion({
      gitTag: "v0.1.1",
      packageVersion: "0.1.1"
    });
  });
});

test("assertReleaseTagMatchesVersion rejects a mismatched tag", () => {
  assert.throws(() => {
    assertReleaseTagMatchesVersion({
      gitTag: "v0.1.2",
      packageVersion: "0.1.1"
    });
  }, /Expected git tag v0.1.1 but received v0.1.2\./);
});

test("assertReleaseTagMatchesVersion rejects a missing tag", () => {
  assert.throws(() => {
    assertReleaseTagMatchesVersion({
      gitTag: "",
      packageVersion: "0.1.1"
    });
  }, /A git tag name is required\./);
});
