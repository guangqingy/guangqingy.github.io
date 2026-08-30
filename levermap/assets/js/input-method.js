export function isImeCompositionEvent(event, compositionActive = false) {
  const inputType = String(event?.inputType || "");
  return compositionActive
    || Boolean(event?.isComposing)
    || Number(event?.keyCode) === 229
    || event?.key === "Process"
    || inputType === "insertCompositionText"
    || inputType === "deleteCompositionText";
}

export function createImeGuard({ schedule = setTimeout, cancel = clearTimeout } = {}) {
  let compositionActive = false;
  let suppressSubmit = false;
  let releaseTimer = null;

  function clearReleaseTimer() {
    if (releaseTimer == null) return;
    cancel(releaseTimer);
    releaseTimer = null;
  }

  function suppressNextSubmit() {
    clearReleaseTimer();
    suppressSubmit = true;
    releaseTimer = schedule(() => {
      suppressSubmit = false;
      releaseTimer = null;
    }, 0);
  }

  return {
    start() {
      clearReleaseTimer();
      compositionActive = true;
      suppressSubmit = false;
    },
    end() {
      compositionActive = false;
      suppressNextSubmit();
    },
    isComposing(event) {
      return isImeCompositionEvent(event, compositionActive);
    },
    shouldBlockSubmit(event) {
      return suppressSubmit || isImeCompositionEvent(event, compositionActive);
    },
    shouldBlockKeydown(event) {
      if (isImeCompositionEvent(event, compositionActive)) {
        suppressNextSubmit();
        return true;
      }
      return suppressSubmit;
    },
  };
}
