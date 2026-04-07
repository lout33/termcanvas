const path = require("node:path");

function getExpectedTagName(packageVersion) {
  return `v${packageVersion}`;
}

function assertReleaseTagMatchesVersion({ gitTag, packageVersion }) {
  if (typeof gitTag !== "string" || gitTag.trim().length === 0) {
    throw new Error("A git tag name is required.");
  }

  if (typeof packageVersion !== "string" || packageVersion.trim().length === 0) {
    throw new Error("A package version is required.");
  }

  const expectedTag = getExpectedTagName(packageVersion.trim());
  const actualTag = gitTag.trim();

  if (actualTag !== expectedTag) {
    throw new Error(`Expected git tag ${expectedTag} but received ${actualTag}.`);
  }
}

function readPackageVersion() {
  const packageJsonPath = path.join(__dirname, "..", "package.json");
  return require(packageJsonPath).version;
}

if (require.main === module) {
  try {
    assertReleaseTagMatchesVersion({
      gitTag: process.env.GITHUB_REF_NAME || "",
      packageVersion: readPackageVersion()
    });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  getExpectedTagName,
  assertReleaseTagMatchesVersion,
  readPackageVersion
};
