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
