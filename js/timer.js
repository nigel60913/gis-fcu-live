export class SessionTimer {
  constructor({ onTick, onDone } = {}) {
    this.onTick = onTick;
    this.onDone = onDone;
    this.seconds = 0;
    this.total = 0;
  }
  start(seconds) {
    this.stop();
    this.total = seconds;
    this.seconds = seconds;
    this.onTick?.(this.seconds, this.total);
    this.id = setInterval(() => {
      this.seconds -= 1;
      this.onTick?.(this.seconds, this.total);
      if (this.seconds <= 0) {
        this.stop(false);
        this.onDone?.();
      }
    }, 1000);
  }
  stop(reset = true) {
    clearInterval(this.id);
    this.id = null;
    if (reset) {
      this.seconds = 0;
      this.onTick?.(0, this.total);
    }
  }
}
