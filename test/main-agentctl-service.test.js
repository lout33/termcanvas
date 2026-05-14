const test = require("node:test");
const assert = require("node:assert/strict");

const { deriveCanvasProjectTag } = require("../main_agentctl_service.js");

test("deriveCanvasProjectTag keeps canvas projects stable and scoped", () => {
  assert.equal(
    deriveCanvasProjectTag("/tmp/My Project", "canvas-Alpha_123"),
    "my-project-canvas-alp"
  );
});
