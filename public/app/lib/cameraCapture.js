// Request native camera modes. Layout/mirroring never modify the outgoing track.
// https://www.w3.org/TR/mediacapture-streams/#dom-mediatrackconstraintset-resizemode
export function buildCameraCaptureAttempts({
  qualityPreset = "auto", deviceId = "", supportedConstraints = {}, videoConstraints = null,
} = {}) {
  const nativeMode = supportedConstraints.resizeMode ? { resizeMode: { exact: "none" } } : {};
  const sizes = qualityPreset === "720p" ? [[1280, 720]] : [[1920, 1080], [1280, 720]];
  const modes = sizes.map(([width, height]) => ({
    width: { ideal: width, max: width }, height: { ideal: height, max: height },
    frameRate: { ideal: 30, max: 30 }, ...nativeMode,
  }));
  if (videoConstraints) modes.unshift({ ...videoConstraints, ...nativeMode });
  // Some cameras only expose native 4:3 modes outside the preferred bounds.
  // Relax resolution before considering a different device; never request crop.
  modes.push({ frameRate: { ideal: 30, max: 30 }, ...nativeMode });
  return modes.map((video, index) => ({
    label: `native_camera_${index}`,
    constraints: { video: { ...video, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) }, audio: false },
  }));
}

export function isCameraConstraintFailure(error) {
  // A missing selected device cannot be recovered by retrying smaller resolutions.
  // Keep the selection and let the UI ask the user to choose an available camera.
  if (String(error?.constraint || error?.constraintName || "").toLowerCase() === "deviceid") return false;
  return ["OverconstrainedError", "ConstraintNotSatisfiedError"].includes(error?.name);
}

export async function captureCameraStream(mediaDevices, options = {}) {
  const attempts = buildCameraCaptureAttempts({
    ...options, supportedConstraints: mediaDevices?.getSupportedConstraints?.() || {},
  });
  let lastError;
  for (const { constraints } of attempts) {
    try { return await mediaDevices.getUserMedia(constraints); }
    catch (error) { lastError = error; if (!isCameraConstraintFailure(error)) throw error; }
  }
  throw lastError;
}

export function applyCameraPresentation(video, { isCamera = true, isLocal = false, mirror = isLocal } = {}) {
  if (!video) return;
  video.setAttribute("data-camera-self", String(isCamera && isLocal));
  video.setAttribute("data-camera-mirrored", String(isCamera && mirror));
}
