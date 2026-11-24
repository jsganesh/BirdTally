/** Minimal voice-note recorder (MediaRecorder). Works offline; the audio stays on the device. */
export class VoiceRecorder {
  private rec?: MediaRecorder;
  private chunks: Blob[] = [];
  private started = 0;
  private stream?: MediaStream;

  static supported() {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported?.(m));
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start();
    this.started = Date.now();
  }

  stop(): Promise<{ blob: Blob; seconds: number }> {
    return new Promise((resolve) => {
      const rec = this.rec!;
      rec.onstop = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        resolve({ blob: new Blob(this.chunks, { type: rec.mimeType || 'audio/mp4' }), seconds: Math.round((Date.now() - this.started) / 1000) });
      };
      rec.stop();
    });
  }
}

export interface Recorder {
  start(): Promise<void>;
  stop(): Promise<{ blob: Blob; seconds: number }>;
}

/**
 * One voice note at a time. finish() saves a note still running when its screen closes, so leaving
 * mid-recording keeps what was said and releases the microphone instead of dropping both.
 */
export class VoiceNotes {
  private active?: Recorder;
  private busy = false;

  constructor(
    private save: (blob: Blob, seconds: number) => Promise<void>,
    private make: () => Recorder = () => new VoiceRecorder()
  ) {}

  get recording() {
    return !!this.active;
  }

  /** Start a note, or stop and save the running one. A failed start (no microphone) throws. */
  async toggle() {
    if (this.busy) return; // a second tap while the microphone is still opening
    if (this.active) return this.finish();
    this.busy = true;
    try {
      const r = this.make();
      await r.start();
      this.active = r;
    } finally {
      this.busy = false;
    }
  }

  async finish() {
    const r = this.active;
    if (!r) return;
    this.active = undefined;
    const { blob, seconds } = await r.stop();
    await this.save(blob, seconds);
  }
}
