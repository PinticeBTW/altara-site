export const PRIVATE_SCREENSHARE_QUALITY_STATE = Object.freeze({
  STARTING_720: "STARTING_720",
  STABLE_720: "STABLE_720",
  STABLE_720_60: "STABLE_720_60",
  PROMOTING_1080: "PROMOTING_1080",
  STABLE_1080: "STABLE_1080",
  DEMOTING_720: "DEMOTING_720",
});

const DEFAULT_SAMPLE_INTERVAL_MS = 2000;
const DEFAULT_PROMOTION_SAMPLES = 3;
const DEFAULT_DEMOTION_SAMPLES = 2;
const DEFAULT_PROMOTION_HEADROOM = 1.3;
const DEFAULT_PROMOTION_COOLDOWN_MS = 0;
const DEFAULT_DEMOTION_COOLDOWN_MS = 20000;

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function evaluatePrivateScreenShareQualitySample(sample = {}, {
  targetFps = 30,
  preferredBitrate = 5_000_000,
  promotionHeadroom = DEFAULT_PROMOTION_HEADROOM,
} = {}) {
  const fps = finiteNumber(sample?.fps, 0);
  const availableOutgoingBitrate = finiteNumber(sample?.availableOutgoingBitrate, null);
  const qualityLimitationReason = String(sample?.qualityLimitationReason || "").trim().toLowerCase();
  const packetsLost = Math.max(0, finiteNumber(sample?.packetsLost, 0));
  const roundTripTimeMs = finiteNumber(sample?.roundTripTimeMs, null);
  const promotionThresholdBps = Math.round(Math.max(1, preferredBitrate) * Math.max(1, promotionHeadroom));
  const highMotion = targetFps >= 50;
  const healthyFpsFloor = targetFps * (highMotion ? 0.92 : 0.9);
  const constrainedFpsFloor = targetFps * (highMotion ? 0.85 : 0.6);
  const healthy = availableOutgoingBitrate != null
    && availableOutgoingBitrate >= promotionThresholdBps
    && fps >= healthyFpsFloor
    && qualityLimitationReason !== "bandwidth"
    && packetsLost <= 1
    && (roundTripTimeMs == null || roundTripTimeMs <= 250);
  const constrained = (highMotion && fps < constrainedFpsFloor) || (
    qualityLimitationReason === "bandwidth"
    && (
      fps < targetFps * 0.8
      || (availableOutgoingBitrate != null && availableOutgoingBitrate < preferredBitrate * 0.9)
    )
  ) || (!highMotion && fps < constrainedFpsFloor) || packetsLost > 3;
  return Object.freeze({
    healthy,
    constrained,
    promotionThresholdBps,
    healthyFpsFloor,
    constrainedFpsFloor,
    fps,
    availableOutgoingBitrate,
    qualityLimitationReason: qualityLimitationReason || null,
    packetsLost,
    roundTripTimeMs,
  });
}

export function createPrivateScreenShareQualityController({
  preferredTier = "1080",
  targetFps = 30,
  preferredBitrate = 5_000_000,
  getSample = async () => null,
  applyTier = async () => ({ applied: false }),
  onStateChange = () => {},
  now = () => Date.now(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timer) => clearTimeout(timer),
  sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  promotionSamples = DEFAULT_PROMOTION_SAMPLES,
  demotionSamples = DEFAULT_DEMOTION_SAMPLES,
  promotionCooldownMs = DEFAULT_PROMOTION_COOLDOWN_MS,
  demotionCooldownMs = DEFAULT_DEMOTION_COOLDOWN_MS,
} = {}) {
  const wants1080 = String(preferredTier || "").trim() === "1080";
  const normalizedTargetFps = Math.max(1, finiteNumber(targetFps, 30));
  const observesHighMotion720 = !wants1080 && normalizedTargetFps >= 50;
  const shouldSample = wants1080 || observesHighMotion720;
  let running = false;
  let timer = null;
  let sampleInFlight = false;
  let state = wants1080
    ? PRIVATE_SCREENSHARE_QUALITY_STATE.STARTING_720
    : (observesHighMotion720
      ? PRIVATE_SCREENSHARE_QUALITY_STATE.STABLE_720_60
      : PRIVATE_SCREENSHARE_QUALITY_STATE.STABLE_720);
  let effectiveTier = "720";
  let healthySamples = 0;
  let constrainedSamples = 0;
  let cooldownUntil = 0;
  let lastSample = null;
  let lastEvaluation = null;
  let lastError = null;
  const observationSamples = [];
  const transitions = [];

  const transition = (nextState, reason, evidence = null) => {
    if (state === nextState) return false;
    state = nextState;
    const entry = Object.freeze({
      state,
      reason: String(reason || "state_change").slice(0, 100),
      at: new Date(now()).toISOString(),
      evidence: evidence ? { ...evidence } : null,
    });
    transitions.push(entry);
    if (transitions.length > 20) transitions.shift();
    try { onStateChange(entry); } catch (_) {}
    return true;
  };

  const schedule = () => {
    if (!running || !shouldSample || timer) return;
    timer = setTimer(() => {
      timer = null;
      void sample();
    }, Math.max(1000, Number(sampleIntervalMs) || DEFAULT_SAMPLE_INTERVAL_MS));
  };

  const apply = async (tier, transitionState, stableState, reason, cooldownMs) => {
    transition(transitionState, reason, lastEvaluation);
    try {
      const result = await applyTier(tier);
      if (!result || result.applied !== true) throw new Error(result?.reason || "sender_tier_not_applied");
      effectiveTier = tier;
      healthySamples = 0;
      constrainedSamples = 0;
      cooldownUntil = now() + Math.max(0, Number(cooldownMs) || 0);
      lastError = null;
      transition(stableState, `${reason}_applied`, result);
      return true;
    } catch (error) {
      healthySamples = 0;
      constrainedSamples = 0;
      cooldownUntil = now() + Math.max(1000, Number(sampleIntervalMs) || DEFAULT_SAMPLE_INTERVAL_MS);
      lastError = {
        name: String(error?.name || "Error").slice(0, 100),
        message: String(error?.message || error || "quality_transition_failed").slice(0, 220),
      };
      transition(
        effectiveTier === "1080"
          ? PRIVATE_SCREENSHARE_QUALITY_STATE.STABLE_1080
          : PRIVATE_SCREENSHARE_QUALITY_STATE.STABLE_720,
        `${reason}_failed`,
        lastError,
      );
      return false;
    }
  };

  const sample = async () => {
    if (!running || !shouldSample || sampleInFlight) return;
    sampleInFlight = true;
    try {
      const nextSample = await getSample();
      if (!running || !nextSample) return;
      lastSample = { ...nextSample };
      lastEvaluation = evaluatePrivateScreenShareQualitySample(nextSample, {
        targetFps: normalizedTargetFps,
        preferredBitrate,
      });
      observationSamples.push({
        ...lastSample,
        healthy: lastEvaluation.healthy,
        constrained: lastEvaluation.constrained,
      });
      // At the normal two-second cadence this is a bounded ~20 second view.
      if (observationSamples.length > 10) observationSamples.shift();
      if (observesHighMotion720) {
        // C1.16.2: observe the 720p60 sender without manually changing its
        // spatial scale. The former escalation kept stepping 1 -> 4 while the
        // temporal rate stayed around 30fps, destroying useful resolution and
        // obscuring the actual LiveKit/WebRTC ceiling.
        healthySamples = lastEvaluation.healthy ? healthySamples + 1 : 0;
        constrainedSamples = lastEvaluation.constrained
          ? Math.min(1000, constrainedSamples + 1)
          : 0;
        return;
      }
      if (state === PRIVATE_SCREENSHARE_QUALITY_STATE.STARTING_720) {
        transition(PRIVATE_SCREENSHARE_QUALITY_STATE.STABLE_720, "first_sender_sample", lastEvaluation);
      }
      if (now() < cooldownUntil) return;
      if (effectiveTier === "720") {
        healthySamples = lastEvaluation.healthy ? healthySamples + 1 : 0;
        constrainedSamples = 0;
        if (healthySamples >= Math.max(2, Number(promotionSamples) || DEFAULT_PROMOTION_SAMPLES)) {
          await apply(
            "1080",
            PRIVATE_SCREENSHARE_QUALITY_STATE.PROMOTING_1080,
            PRIVATE_SCREENSHARE_QUALITY_STATE.STABLE_1080,
            "sustained_capacity",
            promotionCooldownMs,
          );
        }
      } else {
        constrainedSamples = lastEvaluation.constrained ? constrainedSamples + 1 : 0;
        healthySamples = 0;
        if (constrainedSamples >= Math.max(2, Number(demotionSamples) || DEFAULT_DEMOTION_SAMPLES)) {
          await apply(
            "720",
            PRIVATE_SCREENSHARE_QUALITY_STATE.DEMOTING_720,
            PRIVATE_SCREENSHARE_QUALITY_STATE.STABLE_720,
            "sustained_constraint",
            demotionCooldownMs,
          );
        }
      }
    } catch (error) {
      lastError = {
        name: String(error?.name || "Error").slice(0, 100),
        message: String(error?.message || error || "quality_sample_failed").slice(0, 220),
      };
    } finally {
      sampleInFlight = false;
      schedule();
    }
  };

  return Object.freeze({
    start() {
      if (running) return false;
      running = true;
      if (shouldSample) schedule();
      return true;
    },
    stop() {
      running = false;
      if (timer) clearTimer(timer);
      timer = null;
      return true;
    },
    sampleNow: sample,
    getSnapshot() {
      return {
        enabled: true,
        running,
        preferredTier: wants1080 ? "1080" : "720",
        effectiveTier,
        targetFps: normalizedTargetFps,
        observationMode: observesHighMotion720
          ? "high_motion_720p60_observation_only"
          : (wants1080 ? "adaptive_1080p30" : "fixed_720p30"),
        controllerAction: observesHighMotion720 ? "observe_only" : "adaptive_tier",
        manualSpatialAdaptation: false,
        state,
        healthySamples,
        constrainedSamples,
        cooldownRemainingMs: Math.max(0, cooldownUntil - now()),
        sampleIntervalMs: Math.max(1000, Number(sampleIntervalMs) || DEFAULT_SAMPLE_INTERVAL_MS),
        promotionSamplesRequired: Math.max(2, Number(promotionSamples) || DEFAULT_PROMOTION_SAMPLES),
        demotionSamplesRequired: Math.max(2, Number(demotionSamples) || DEFAULT_DEMOTION_SAMPLES),
        promotionThresholdBps: Math.round(preferredBitrate * DEFAULT_PROMOTION_HEADROOM),
        lastSample: lastSample ? { ...lastSample } : null,
        lastEvaluation: lastEvaluation ? { ...lastEvaluation } : null,
        lastError: lastError ? { ...lastError } : null,
        observationWindowSamples: observationSamples.map((entry) => ({ ...entry })),
        // Retained as explicit compatibility diagnostics: C1.16.2 guarantees
        // that these remain zero/null rather than applying spatial steps.
        motionProtectionApplications: 0,
        lastMotionProtection: null,
        transitions: transitions.map((entry) => ({
          ...entry,
          evidence: entry.evidence ? { ...entry.evidence } : null,
        })),
      };
    },
  });
}
