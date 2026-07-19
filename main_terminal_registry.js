const TERMINAL_REGISTRY_ERROR_CODES = Object.freeze({
  ATTACHMENT_EXISTS: "TERMINAL_ATTACHMENT_EXISTS",
  SESSION_ATTACHED: "TERMINAL_SESSION_ALREADY_ATTACHED",
  TMUX_ATTACHED: "TERMINAL_TMUX_ALREADY_ATTACHED",
  INVALID_RESERVATION: "TERMINAL_INVALID_RESERVATION"
});

function createRegistryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createTerminalSessionRegistry() {
  const attachmentsById = new Map();
  const sessionsByKey = new Map();
  const sessionKeyByTmuxName = new Map();
  const reservationsByAttachmentId = new Map();

  function assertCurrentReservation(reservation) {
    if (
      reservation == null
      || reservationsByAttachmentId.get(reservation.terminalId) !== reservation
      || sessionsByKey.get(reservation.sessionKey) !== reservation
    ) {
      throw createRegistryError(
        TERMINAL_REGISTRY_ERROR_CODES.INVALID_RESERVATION,
        "Terminal session reservation is no longer active."
      );
    }
  }

  function reserve({ terminalId, sessionKey, tmuxSessionName = null, ownerWebContentsId }) {
    if (attachmentsById.has(terminalId) || reservationsByAttachmentId.has(terminalId)) {
      throw createRegistryError(
        TERMINAL_REGISTRY_ERROR_CODES.ATTACHMENT_EXISTS,
        `Terminal attachment '${terminalId}' already exists.`
      );
    }

    const existingSession = sessionsByKey.get(sessionKey);

    if (existingSession !== undefined) {
      throw createRegistryError(
        TERMINAL_REGISTRY_ERROR_CODES.SESSION_ATTACHED,
        `Terminal session '${sessionKey}' is already attached as '${existingSession.terminalId}'.`
      );
    }

    if (tmuxSessionName !== null) {
      const existingTmuxSessionKey = sessionKeyByTmuxName.get(tmuxSessionName);

      if (existingTmuxSessionKey !== undefined) {
        throw createRegistryError(
          TERMINAL_REGISTRY_ERROR_CODES.TMUX_ATTACHED,
          `tmux session '${tmuxSessionName}' is already attached as terminal session '${existingTmuxSessionKey}'.`
        );
      }
    }

    const reservation = {
      terminalId,
      sessionKey,
      tmuxSessionName,
      ownerWebContentsId,
      state: "creating"
    };

    reservationsByAttachmentId.set(terminalId, reservation);
    sessionsByKey.set(sessionKey, reservation);

    if (tmuxSessionName !== null) {
      sessionKeyByTmuxName.set(tmuxSessionName, sessionKey);
    }

    return reservation;
  }

  function attach(reservation, attachment) {
    assertCurrentReservation(reservation);

    const actualTmuxSessionName = typeof attachment?.tmuxSessionName === "string"
      && attachment.tmuxSessionName.length > 0
      ? attachment.tmuxSessionName
      : null;

    if (actualTmuxSessionName !== reservation.tmuxSessionName) {
      if (reservation.tmuxSessionName !== null) {
        sessionKeyByTmuxName.delete(reservation.tmuxSessionName);
      }

      if (actualTmuxSessionName !== null) {
        const existingTmuxSessionKey = sessionKeyByTmuxName.get(actualTmuxSessionName);

        if (existingTmuxSessionKey !== undefined && existingTmuxSessionKey !== reservation.sessionKey) {
          throw createRegistryError(
            TERMINAL_REGISTRY_ERROR_CODES.TMUX_ATTACHED,
            `tmux session '${actualTmuxSessionName}' is already attached as terminal session '${existingTmuxSessionKey}'.`
          );
        }

        sessionKeyByTmuxName.set(actualTmuxSessionName, reservation.sessionKey);
      }
    }

    const sessionRecord = {
      sessionKey: reservation.sessionKey,
      terminalId: reservation.terminalId,
      tmuxSessionName: actualTmuxSessionName,
      ownerWebContentsId: reservation.ownerWebContentsId,
      state: "attached"
    };

    reservationsByAttachmentId.delete(reservation.terminalId);
    sessionsByKey.set(reservation.sessionKey, sessionRecord);
    attachmentsById.set(reservation.terminalId, attachment);
    return sessionRecord;
  }

  function cancel(reservation) {
    if (reservation == null || sessionsByKey.get(reservation.sessionKey) !== reservation) {
      return false;
    }

    reservationsByAttachmentId.delete(reservation.terminalId);
    sessionsByKey.delete(reservation.sessionKey);

    if (reservation.tmuxSessionName !== null) {
      sessionKeyByTmuxName.delete(reservation.tmuxSessionName);
    }

    return true;
  }

  function getAttachment(terminalId) {
    return attachmentsById.get(terminalId);
  }

  function getSession(sessionKey) {
    return sessionsByKey.get(sessionKey);
  }

  function releaseAttachment(terminalId) {
    const attachment = attachmentsById.get(terminalId);

    if (attachment === undefined) {
      return undefined;
    }

    attachmentsById.delete(terminalId);
    const sessionKey = attachment.sessionKey;
    const sessionRecord = sessionsByKey.get(sessionKey);

    if (sessionRecord?.terminalId === terminalId) {
      sessionsByKey.delete(sessionKey);

      if (sessionRecord.tmuxSessionName !== null) {
        sessionKeyByTmuxName.delete(sessionRecord.tmuxSessionName);
      }
    }

    return attachment;
  }

  function forEachAttachment(callback) {
    attachmentsById.forEach(callback);
  }

  return Object.freeze({
    reserve,
    attach,
    cancel,
    getAttachment,
    getSession,
    releaseAttachment,
    forEachAttachment
  });
}

module.exports = {
  TERMINAL_REGISTRY_ERROR_CODES,
  createTerminalSessionRegistry
};
