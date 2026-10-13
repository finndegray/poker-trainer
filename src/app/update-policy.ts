export type UpdatePolicyDeps = {
  /** Writes pending progress before the page may reload. */
  flush: () => Promise<void>;
  reload: () => void;
  /** Lets the waiting service worker take control (skip waiting). */
  activate: () => Promise<void>;
  isHidden: () => boolean;
  /** Shows „Eine neue Version ist verfügbar.“ */
  showNotice: () => void;
};

export type UpdatePolicy = {
  /** A new version is installed and waiting. */
  onNeedRefresh(): void;
  /** The new version took control; the page should reload. */
  onNeedReload(): Promise<void>;
  /** The page became hidden. */
  onHidden(): Promise<void>;
  /** The player asked to update now. */
  applyNow(): Promise<void>;
};

/** Decides when an update may reload the page: never a visible tab, unless the player asked for it. */
export function createUpdatePolicy(deps: UpdatePolicyDeps): UpdatePolicy {
  let waiting = false;
  let reloadPending = false;
  let requested = false;

  return {
    onNeedRefresh() {
      waiting = true;
      deps.showNotice();
    },
    async onNeedReload() {
      await deps.flush();
      if (requested || deps.isHidden()) {
        deps.reload();
        return;
      }
      reloadPending = true;
      deps.showNotice();
    },
    async onHidden() {
      if (reloadPending) {
        await deps.flush();
        if (deps.isHidden() || requested) deps.reload();
      } else if (waiting) {
        await deps.flush();
        await deps.activate();
      }
    },
    async applyNow() {
      requested = true;
      await deps.flush();
      if (reloadPending) deps.reload();
      else await deps.activate();
    },
  };
}
