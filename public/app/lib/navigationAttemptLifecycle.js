export async function runNavigationAttemptLifecycle(work, {
  rollback = null,
  onError = null,
  onFinally = null,
} = {}) {
  let committed = false;
  let failure = null;
  const control = Object.freeze({
    commit() {
      committed = true;
    },
    isCommitted() {
      return committed;
    },
  });

  try {
    return await work(control);
  } catch (error) {
    failure = error;
    try { onError?.(error, { committed }); } catch (_) {}
    return false;
  } finally {
    if (failure && !committed) {
      try { await rollback?.(failure); } catch (_) {}
    }
    try { onFinally?.({ committed, error: failure }); } catch (_) {}
  }
}
