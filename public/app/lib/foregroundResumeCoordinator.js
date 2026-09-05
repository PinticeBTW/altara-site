const DEFAULT_MAX_TASKS = 80;
const DEFAULT_HISTORY_LIMIT = 8;
const PRIORITY_ORDER = Object.freeze({ critical: 0, active: 1, optional: 2 });

function safeName(value, fallback = "task") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "_");
  return (normalized || fallback).slice(0, 100);
}

function finiteMs(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function copyTask(entry = {}) {
  return {
    name: String(entry.name || "task"),
    priority: String(entry.priority || "optional"),
    startedAt: entry.startedAt || null,
    finishedAt: entry.finishedAt || null,
    durationMs: entry.durationMs == null ? null : finiteMs(entry.durationMs),
    outcome: String(entry.outcome || "pending"),
  };
}

export function createForegroundResumeCoordinator({
  windowImpl = globalThis.window,
  documentImpl = globalThis.document,
  now = () => Date.now(),
  scheduleFrame = (callback) => windowImpl.requestAnimationFrame(callback),
  cancelFrame = (handle) => windowImpl.cancelAnimationFrame?.(handle),
  scheduleTask = (callback, delayMs) => windowImpl.setTimeout(callback, delayMs),
  cancelTask = (handle) => windowImpl.clearTimeout(handle),
  taskStartSpacingMs = 8,
  maxConcurrentTasks = 3,
  metricsWindowMs = 5000,
  getWindowMetrics = null,
  onEvent = null,
} = {}) {
  const tasks = new Map();
  const tasksInFlight = new Map();
  const history = [];
  let started = false;
  let destroyed = false;
  let backgrounded = String(documentImpl?.visibilityState || "visible") === "hidden";
  let backgroundedAt = backgrounded ? finiteMs(now()) : 0;
  let hiddenAt = backgroundedAt;
  let visibleAt = backgrounded ? 0 : finiteMs(now());
  let focusAt = 0;
  let resumeGeneration = 0;
  let resumeFrame = null;
  let taskPumpTimer = null;
  let metricsTimer = null;
  let queuedTasks = [];
  let current = null;

  function emit(event, details = {}) {
    try {
      onEvent?.({
        at: finiteMs(now()),
        event: safeName(event, "event"),
        ...(details && typeof details === "object" ? details : {}),
      });
    } catch (_) {}
  }

  function getPriority(value) {
    const normalized = String(value || "optional").trim().toLowerCase();
    return Object.hasOwn(PRIORITY_ORDER, normalized) ? normalized : "optional";
  }

  function registerTask(name, run, options = {}) {
    const key = safeName(name);
    if (typeof run !== "function") throw new TypeError("foreground resume task must be a function");
    tasks.set(key, {
      name: key,
      run,
      priority: getPriority(options.priority),
      network: options.network === true,
      render: options.render === true,
      signal: safeName(options.signal || "", ""),
    });
    return () => tasks.delete(key);
  }

  function markTaskFinished(resume, taskEntry, outcome, { wasInFlight = true } = {}) {
    const finished = finiteMs(now());
    taskEntry.finishedAt = new Date(finished).toISOString();
    taskEntry.durationMs = Math.max(0, finished - Number(taskEntry.startedAtMs || finished));
    taskEntry.outcome = safeName(outcome, "completed");
    delete taskEntry.startedAtMs;
    resume.tasksCompleted += 1;
    if (wasInFlight) resume.tasksInFlight = Math.max(0, resume.tasksInFlight - 1);
    emit("task_finished", { name: taskEntry.name, durationMs: taskEntry.durationMs, outcome: taskEntry.outcome });
  }

  function startOneTask(task, resume) {
    if (!task || !resume || resume !== current) return;
    const startedAtMs = finiteMs(now());
    const taskEntry = {
      name: task.name,
      priority: task.priority,
      startedAt: new Date(startedAtMs).toISOString(),
      startedAtMs,
      finishedAt: null,
      durationMs: null,
      outcome: "in_flight",
    };
    resume.taskList.push(taskEntry);
    if (resume.taskList.length > DEFAULT_MAX_TASKS) resume.taskList.splice(0, resume.taskList.length - DEFAULT_MAX_TASKS);
    resume.tasksStarted += 1;
    if (task.network) resume.networkOperationsStarted += 1;
    if (task.render) resume.renderCount += 1;
    if (task.signal === "realtime_recovery") resume.realtimeRecoveryTriggered = true;
    if (task.signal === "auth_refresh") resume.authRefreshTriggered = true;
    if (task.signal === "presence_recovery") resume.presenceRecoveryTriggered = true;
    const existing = tasksInFlight.get(task.name);
    if (existing) {
      taskEntry.outcome = "coalesced_in_flight";
      markTaskFinished(resume, taskEntry, "coalesced_in_flight", { wasInFlight: false });
      return;
    }
    resume.tasksInFlight += 1;
    emit("task_started", { name: task.name, priority: task.priority });
    let result;
    try {
      result = task.run({ generation: resume.generation, reason: resume.reason });
    } catch (_) {
      markTaskFinished(resume, taskEntry, "failed_sync");
      return;
    }
    const operation = Promise.resolve(result)
      .then(() => markTaskFinished(resume, taskEntry, "completed"))
      .catch(() => markTaskFinished(resume, taskEntry, "failed"))
      .finally(() => {
        if (tasksInFlight.get(task.name) === operation) tasksInFlight.delete(task.name);
        if (resume === current && queuedTasks.length && taskPumpTimer == null) {
          taskPumpTimer = scheduleTask(() => pumpTasks(resume), Math.max(0, Number(taskStartSpacingMs) || 0));
        }
      });
    tasksInFlight.set(task.name, operation);
  }

  function pumpTasks(resume) {
    taskPumpTimer = null;
    if (!resume || resume !== current || destroyed) return;
    if (resume.tasksInFlight >= Math.max(1, Number(maxConcurrentTasks) || 1)) return;
    const next = queuedTasks.shift();
    if (!next) return;
    startOneTask(next, resume);
    if (queuedTasks.length && resume.tasksInFlight < Math.max(1, Number(maxConcurrentTasks) || 1)) {
      taskPumpTimer = scheduleTask(() => pumpTasks(resume), Math.max(0, Number(taskStartSpacingMs) || 0));
    }
  }

  function scheduleResumeTasks(resume) {
    queuedTasks = Array.from(tasks.values()).sort((a, b) => {
      const priorityDelta = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      return priorityDelta || a.name.localeCompare(b.name);
    });
    taskPumpTimer = scheduleTask(() => pumpTasks(resume), 0);
  }

  function finalizeMetrics(resume) {
    metricsTimer = null;
    if (!resume || resume !== current || typeof getWindowMetrics !== "function") return;
    try {
      const metrics = getWindowMetrics({
        sinceAt: resume.handlerStartedAtMs,
        untilAt: resume.handlerStartedAtMs + metricsWindowMs,
      }) || {};
      resume.eventLoopMaxLagFirst5s = finiteMs(metrics.eventLoopMaxLagMs, 0);
      resume.longTasksFirst5s = Math.max(0, Number(metrics.longTaskCount || 0) || 0);
    } catch (_) {}
  }

  function requestResume(reason = "foreground") {
    if (destroyed || String(documentImpl?.visibilityState || "visible") === "hidden") return resumeGeneration;
    if (!backgrounded && (resumeFrame != null || current?.tasksInFlight > 0 || queuedTasks.length > 0)) return resumeGeneration;
    if (!backgrounded && current && finiteMs(now()) - current.handlerStartedAtMs < 500) return resumeGeneration;
    if (resumeFrame != null) cancelFrame(resumeFrame);
    if (taskPumpTimer != null) cancelTask(taskPumpTimer);
    if (metricsTimer != null) cancelTask(metricsTimer);
    resumeFrame = null;
    taskPumpTimer = null;
    metricsTimer = null;
    queuedTasks = [];
    const startedAtMs = finiteMs(now());
    backgrounded = false;
    resumeGeneration += 1;
    current = {
      generation: resumeGeneration,
      reason: safeName(reason, "foreground"),
      hiddenAt: hiddenAt ? new Date(hiddenAt).toISOString() : null,
      visibleAt: visibleAt ? new Date(visibleAt).toISOString() : null,
      hiddenDurationMs: backgroundedAt ? Math.max(0, startedAtMs - backgroundedAt) : 0,
      focusAt: focusAt ? new Date(focusAt).toISOString() : null,
      handlerStartedAt: new Date(startedAtMs).toISOString(),
      handlerStartedAtMs: startedAtMs,
      firstInteractiveFrameAt: null,
      resumeToFirstFrameMs: null,
      firstClickHandlerAt: null,
      resumeToFirstClickHandlerMs: null,
      eventLoopMaxLagFirst5s: 0,
      longTasksFirst5s: 0,
      tasksStarted: 0,
      tasksCompleted: 0,
      tasksInFlight: 0,
      networkOperationsStarted: 0,
      renderCount: 0,
      realtimeRecoveryTriggered: false,
      authRefreshTriggered: false,
      presenceRecoveryTriggered: false,
      taskList: [],
    };
    backgroundedAt = 0;
    history.push(current);
    if (history.length > DEFAULT_HISTORY_LIMIT) history.splice(0, history.length - DEFAULT_HISTORY_LIMIT);
    emit("resume_requested", { generation: resumeGeneration, reason: current.reason, hiddenDurationMs: current.hiddenDurationMs });
    const resume = current;
    resumeFrame = scheduleFrame(() => {
      resumeFrame = null;
      if (resume !== current || destroyed) return;
      const frameAt = finiteMs(now());
      resume.firstInteractiveFrameAt = new Date(frameAt).toISOString();
      resume.resumeToFirstFrameMs = Math.max(0, frameAt - startedAtMs);
      emit("first_interactive_frame", { generation: resume.generation, durationMs: resume.resumeToFirstFrameMs });
      scheduleResumeTasks(resume);
      metricsTimer = scheduleTask(() => finalizeMetrics(resume), metricsWindowMs);
    });
    return resumeGeneration;
  }

  function markSignal(signal = "") {
    if (!current || finiteMs(now()) - current.handlerStartedAtMs > metricsWindowMs) return false;
    const key = safeName(signal, "");
    if (key === "realtime_recovery") current.realtimeRecoveryTriggered = true;
    if (key === "auth_refresh") current.authRefreshTriggered = true;
    if (key === "presence_recovery") current.presenceRecoveryTriggered = true;
    return Boolean(key);
  }

  function markNetworkOperation(count = 1) {
    if (!current || finiteMs(now()) - current.handlerStartedAtMs > metricsWindowMs) return false;
    current.networkOperationsStarted += Math.max(0, Number(count || 0) || 0);
    return true;
  }

  function markRender(count = 1) {
    if (!current || finiteMs(now()) - current.handlerStartedAtMs > metricsWindowMs) return false;
    current.renderCount += Math.max(0, Number(count || 0) || 0);
    return true;
  }

  function handleVisibilityChange() {
    const at = finiteMs(now());
    if (String(documentImpl?.visibilityState || "visible") === "hidden") {
      hiddenAt = at;
      if (!backgrounded) backgroundedAt = at;
      backgrounded = true;
      emit("hidden");
      return;
    }
    visibleAt = at;
    requestResume("visibility_visible");
  }

  function handleBlur() {
    const at = finiteMs(now());
    if (!backgrounded) backgroundedAt = at;
    backgrounded = true;
    emit("blurred");
  }

  function handleFocus() {
    focusAt = finiteMs(now());
    requestResume("window_focus");
  }

  function handlePageShow(event = {}) {
    if (event?.persisted === true) {
      visibleAt = finiteMs(now());
      if (!backgrounded) backgroundedAt = visibleAt;
      backgrounded = true;
      requestResume("pageshow_restored");
    }
  }

  function handleClick() {
    if (!current || current.firstClickHandlerAt) return;
    const at = finiteMs(now());
    current.firstClickHandlerAt = new Date(at).toISOString();
    current.resumeToFirstClickHandlerMs = Math.max(0, at - current.handlerStartedAtMs);
    emit("first_click_handler", { generation: current.generation, durationMs: current.resumeToFirstClickHandlerMs });
  }

  function start() {
    if (started || destroyed) return api;
    started = true;
    documentImpl?.addEventListener?.("visibilitychange", handleVisibilityChange);
    windowImpl?.addEventListener?.("blur", handleBlur);
    windowImpl?.addEventListener?.("focus", handleFocus);
    windowImpl?.addEventListener?.("pageshow", handlePageShow);
    windowImpl?.addEventListener?.("click", handleClick, true);
    return api;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    documentImpl?.removeEventListener?.("visibilitychange", handleVisibilityChange);
    windowImpl?.removeEventListener?.("blur", handleBlur);
    windowImpl?.removeEventListener?.("focus", handleFocus);
    windowImpl?.removeEventListener?.("pageshow", handlePageShow);
    windowImpl?.removeEventListener?.("click", handleClick, true);
    if (resumeFrame != null) cancelFrame(resumeFrame);
    if (taskPumpTimer != null) cancelTask(taskPumpTimer);
    if (metricsTimer != null) cancelTask(metricsTimer);
    queuedTasks = [];
  }

  function getSnapshot() {
    const serializeResume = (resume) => resume ? {
      hiddenAt: resume.hiddenAt,
      visibleAt: resume.visibleAt,
      hiddenDurationMs: resume.hiddenDurationMs,
      focusAt: resume.focusAt,
      resumeGeneration: resume.generation,
      handlerStartedAt: resume.handlerStartedAt,
      firstInteractiveFrameAt: resume.firstInteractiveFrameAt,
      resumeToFirstFrameMs: resume.resumeToFirstFrameMs,
      firstClickHandlerAt: resume.firstClickHandlerAt,
      resumeToFirstClickHandlerMs: resume.resumeToFirstClickHandlerMs,
      eventLoopMaxLagFirst5s: resume.eventLoopMaxLagFirst5s,
      longTasksFirst5s: resume.longTasksFirst5s,
      tasksStarted: resume.tasksStarted,
      tasksCompleted: resume.tasksCompleted,
      tasksInFlight: resume.tasksInFlight,
      networkOperationsStarted: resume.networkOperationsStarted,
      renderCount: resume.renderCount,
      realtimeRecoveryTriggered: resume.realtimeRecoveryTriggered,
      authRefreshTriggered: resume.authRefreshTriggered,
      presenceRecoveryTriggered: resume.presenceRecoveryTriggered,
      reason: resume.reason,
      tasks: resume.taskList.map(copyTask),
    } : null;
    return {
      registeredTaskCount: tasks.size,
      taskNames: Array.from(tasks.keys()),
      activeTaskNames: Array.from(tasksInFlight.keys()),
      backgrounded,
      current: serializeResume(current),
      history: history.map(serializeResume),
    };
  }

  const api = { destroy, getSnapshot, markNetworkOperation, markRender, markSignal, registerTask, requestResume, start };
  return api;
}
