class AltaraProcessLoopbackPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.queuedFrames = 0;
    this.readOffset = 0;
    this.remainder = new Uint8Array(0);
    this.maxQueuedFrames = 24_000;
    this.port.onmessage = (event) => {
      const message = event?.data && typeof event.data === "object" ? event.data : {};
      if (message.type === "reset") {
        this.queue = [];
        this.queuedFrames = 0;
        this.readOffset = 0;
        this.remainder = new Uint8Array(0);
        return;
      }
      if (message.type !== "pcm_s16le" || !(message.pcm instanceof ArrayBuffer)) return;
      this.enqueuePcm(new Uint8Array(message.pcm));
    };
  }

  enqueuePcm(incoming) {
    if (!incoming.byteLength) return;
    let bytes = incoming;
    if (this.remainder.byteLength) {
      bytes = new Uint8Array(this.remainder.byteLength + incoming.byteLength);
      bytes.set(this.remainder, 0);
      bytes.set(incoming, this.remainder.byteLength);
      this.remainder = new Uint8Array(0);
    }
    const usableBytes = bytes.byteLength - (bytes.byteLength % 4);
    if (usableBytes !== bytes.byteLength) this.remainder = bytes.slice(usableBytes);
    const frames = usableBytes / 4;
    if (!frames) return;
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    const view = new DataView(bytes.buffer, bytes.byteOffset, usableBytes);
    for (let frame = 0; frame < frames; frame += 1) {
      left[frame] = view.getInt16(frame * 4, true) / 32768;
      right[frame] = view.getInt16((frame * 4) + 2, true) / 32768;
    }
    this.queue.push({ left, right });
    this.queuedFrames += frames;
    while (this.queuedFrames > this.maxQueuedFrames && this.queue.length > 1) {
      const dropped = this.queue.shift();
      this.queuedFrames -= Math.max(0, dropped.left.length - this.readOffset);
      this.readOffset = 0;
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const leftOutput = output?.[0];
    const rightOutput = output?.[1] || leftOutput;
    if (!leftOutput) return true;
    leftOutput.fill(0);
    if (rightOutput && rightOutput !== leftOutput) rightOutput.fill(0);
    let outputOffset = 0;
    while (outputOffset < leftOutput.length && this.queue.length) {
      const chunk = this.queue[0];
      const available = chunk.left.length - this.readOffset;
      const count = Math.min(available, leftOutput.length - outputOffset);
      leftOutput.set(chunk.left.subarray(this.readOffset, this.readOffset + count), outputOffset);
      rightOutput?.set(chunk.right.subarray(this.readOffset, this.readOffset + count), outputOffset);
      outputOffset += count;
      this.readOffset += count;
      this.queuedFrames = Math.max(0, this.queuedFrames - count);
      if (this.readOffset >= chunk.left.length) {
        this.queue.shift();
        this.readOffset = 0;
      }
    }
    return true;
  }
}

registerProcessor("altara-process-loopback-pcm", AltaraProcessLoopbackPcmProcessor);
