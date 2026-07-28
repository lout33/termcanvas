const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TERMINAL_REGISTRY_ERROR_CODES,
  createTerminalSessionRegistry
} = require("../main_terminal_registry");

function createAttachment(sessionKey, tmuxSessionName = null) {
  return {
    sessionKey,
    tmuxSessionName,
    pty: {}
  };
}

test("terminal registry separates durable session identity from renderer attachment identity", () => {
  const registry = createTerminalSessionRegistry();
  const reservation = registry.reserve({
    terminalId: "attachment-a",
    sessionKey: "session-a",
    tmuxSessionName: "termcanvas-session-a",
    ownerWebContentsId: 7
  });
  const attachment = createAttachment("session-a", "termcanvas-session-a");

  registry.attach(reservation, attachment);

  assert.equal(registry.getAttachment("attachment-a"), attachment);
  assert.deepEqual(registry.getSession("session-a"), {
    sessionKey: "session-a",
    terminalId: "attachment-a",
    tmuxSessionName: "termcanvas-session-a",
    ownerWebContentsId: 7,
    state: "attached"
  });
});

test("terminal registry reserves stable identities before asynchronous creation can duplicate them", () => {
  const registry = createTerminalSessionRegistry();

  registry.reserve({
    terminalId: "attachment-a",
    sessionKey: "session-a",
    tmuxSessionName: "termcanvas-session-a",
    ownerWebContentsId: 7
  });

  assert.throws(
    () => registry.reserve({
      terminalId: "attachment-b",
      sessionKey: "session-a",
      tmuxSessionName: "termcanvas-session-a",
      ownerWebContentsId: 7
    }),
    (error) => error.code === TERMINAL_REGISTRY_ERROR_CODES.SESSION_ATTACHED
  );

  assert.throws(
    () => registry.reserve({
      terminalId: "attachment-c",
      sessionKey: "session-c",
      tmuxSessionName: "termcanvas-session-a",
      ownerWebContentsId: 7
    }),
    (error) => error.code === TERMINAL_REGISTRY_ERROR_CODES.TMUX_ATTACHED
  );
});

test("terminal registry releases identities for a later renderer reattachment", () => {
  const registry = createTerminalSessionRegistry();
  const firstReservation = registry.reserve({
    terminalId: "attachment-a",
    sessionKey: "session-a",
    tmuxSessionName: "termcanvas-session-a",
    ownerWebContentsId: 7
  });
  const firstAttachment = createAttachment("session-a", "termcanvas-session-a");

  registry.attach(firstReservation, firstAttachment);
  assert.equal(registry.releaseAttachment("attachment-a"), firstAttachment);
  assert.equal(registry.getAttachment("attachment-a"), undefined);
  assert.equal(registry.getSession("session-a"), undefined);

  assert.doesNotThrow(() => {
    registry.reserve({
      terminalId: "attachment-b",
      sessionKey: "session-a",
      tmuxSessionName: "termcanvas-session-a",
      ownerWebContentsId: 8
    });
  });
});

test("terminal registry keeps a detached tmux identity owner-bound for reattachment", () => {
  const registry = createTerminalSessionRegistry();
  const firstReservation = registry.reserve({
    terminalId: "attachment-a",
    sessionKey: "session-a",
    tmuxSessionName: "termcanvas-session-a",
    ownerWebContentsId: 7
  });
  const firstAttachment = createAttachment("session-a", "termcanvas-session-a");
  firstAttachment.ownerWebContentsId = 7;

  registry.attach(firstReservation, firstAttachment);
  assert.equal(registry.detachAttachment("attachment-a"), firstAttachment);
  assert.deepEqual(registry.getSession("session-a"), {
    sessionKey: "session-a",
    terminalId: null,
    tmuxSessionName: "termcanvas-session-a",
    ownerWebContentsId: 7,
    state: "detached"
  });

  assert.throws(
    () => registry.reserve({
      terminalId: "attachment-b",
      sessionKey: "session-a",
      tmuxSessionName: "termcanvas-session-a",
      ownerWebContentsId: 8
    }),
    (error) => error.code === TERMINAL_REGISTRY_ERROR_CODES.SESSION_ATTACHED
  );

  const secondReservation = registry.reserve({
    terminalId: "attachment-c",
    sessionKey: "session-a",
    tmuxSessionName: "termcanvas-session-a",
    ownerWebContentsId: 7
  });
  const secondAttachment = createAttachment("session-a", "termcanvas-session-a");
  secondAttachment.ownerWebContentsId = 7;
  registry.attach(secondReservation, secondAttachment);

  assert.equal(registry.getAttachment("attachment-c"), secondAttachment);
  assert.equal(registry.getSession("session-a").state, "attached");
});

test("terminal registry restores detached identity when reattachment is cancelled", () => {
  const registry = createTerminalSessionRegistry();
  const firstReservation = registry.reserve({
    terminalId: "attachment-a",
    sessionKey: "session-a",
    tmuxSessionName: "termcanvas-session-a",
    ownerWebContentsId: 7
  });
  const attachment = createAttachment("session-a", "termcanvas-session-a");
  attachment.ownerWebContentsId = 7;

  registry.attach(firstReservation, attachment);
  registry.detachAttachment("attachment-a");
  const reattachment = registry.reserve({
    terminalId: "attachment-b",
    sessionKey: "session-a",
    tmuxSessionName: "termcanvas-session-a",
    ownerWebContentsId: 7
  });

  assert.equal(registry.cancel(reattachment), true);
  assert.equal(registry.getSession("session-a").state, "detached");
  assert.equal(registry.releaseSession("session-a").state, "detached");
  assert.equal(registry.getSession("session-a"), undefined);
});

test("terminal registry cancels failed creation without leaving a stale identity", () => {
  const registry = createTerminalSessionRegistry();
  const reservation = registry.reserve({
    terminalId: "attachment-a",
    sessionKey: "session-a",
    tmuxSessionName: "termcanvas-session-a",
    ownerWebContentsId: 7
  });

  assert.equal(registry.cancel(reservation), true);
  assert.equal(registry.cancel(reservation), false);
  assert.doesNotThrow(() => {
    registry.reserve({
      terminalId: "attachment-b",
      sessionKey: "session-a",
      tmuxSessionName: "termcanvas-session-a",
      ownerWebContentsId: 7
    });
  });
});
