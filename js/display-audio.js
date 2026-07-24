const MODE_LABELS = {
  lobby: "大廳音樂",
  waiting: "等待開始",
  countdown: "答題倒數",
  locked: "等待公布",
  results: "結果音效",
  lottery: "抽獎音效",
};

const NOTES = {
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196,
  A3: 220,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392,
  A4: 440,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880,
};

export function createDisplayAudio() {
  const VOLUME_KEY = "gisDisplayAudioVolume";
  const MAX_OUTPUT_GAIN = 5.2;
  const SOURCE_GAIN = 1.35;
  const savedVolume = Number.parseInt(localStorage.getItem(VOLUME_KEY), 10);
  let context;
  let master;
  let limiter;
  let enabled = false;
  let volume = Number.isFinite(savedVolume)
    ? Math.min(100, Math.max(0, savedVolume))
    : 52;
  let mode = "lobby";
  let session = {};
  let loopTimer;
  let beat = 0;
  let lastRevealMode = "";
  const { button, slider, valueLabel } = makeControls();

  function makeControls() {
    const controls = document.createElement("div");
    controls.className = "display-audio-controls";

    const control = document.createElement("button");
    control.type = "button";
    control.className = "display-audio-control";
    control.setAttribute("aria-pressed", "false");
    control.innerHTML =
      '<span class="audio-icon" aria-hidden="true">♪</span><span class="audio-label">開啟音效</span>';
    control.onclick = toggle;

    const volumeControl = document.createElement("label");
    volumeControl.className = "display-volume-control";
    volumeControl.innerHTML = `<span class="volume-icon" aria-hidden="true">🔊</span><span class="sr-only">Display 音量</span><input class="display-volume-slider" type="range" min="0" max="100" step="1" value="${volume}" aria-label="Display 音量"><output class="display-volume-value">${volume}%</output>`;
    const volumeSlider = volumeControl.querySelector(".display-volume-slider");
    const volumeValue = volumeControl.querySelector(".display-volume-value");
    volumeSlider.addEventListener("input", setVolume);

    controls.append(control, volumeControl);
    document.body.append(controls);
    return { button: control, slider: volumeSlider, valueLabel: volumeValue };
  }

  async function toggle() {
    if (!context) setup();
    if (context.state === "suspended") await context.resume();
    enabled = !enabled;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(
      enabled ? outputGain(volume) : 0,
      context.currentTime,
      0.08,
    );
    button.classList.toggle("is-on", enabled);
    button.setAttribute("aria-pressed", String(enabled));
    updateButton();
    if (enabled) {
      beat = 0;
      startLoop();
      playWelcome();
    } else {
      stopLoop();
    }
  }

  function setVolume(event) {
    volume = Number(event.target.value);
    valueLabel.textContent = `${volume}%`;
    slider.style.setProperty("--volume-level", `${volume}%`);
    localStorage.setItem(VOLUME_KEY, String(volume));
    if (master && context) {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(
        enabled ? outputGain(volume) : 0,
        context.currentTime,
        0.05,
      );
    }
    updateButton();
  }

  function setup() {
    context = new (window.AudioContext || window.webkitAudioContext)();
    master = context.createGain();
    limiter = context.createDynamicsCompressor();
    master.gain.value = 0;
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 10;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    master.connect(limiter);
    limiter.connect(context.destination);
  }

  function outputGain(percent) {
    if (percent <= 0) return 0;
    return MAX_OUTPUT_GAIN * Math.pow(percent / 100, 1.75);
  }

  function sync(nextSession = {}) {
    session = nextSession;
    const nextMode = getMode(nextSession);
    if (nextMode === mode) {
      updateButton();
      return;
    }
    const previousMode = mode;
    mode = nextMode;
    if (mode !== "results") lastRevealMode = "";
    beat = 0;
    updateButton();
    if (!enabled || !context) return;
    if (mode === "results" && previousMode !== "results") playReveal();
    if (mode === "lottery" && previousMode !== "lottery") playLottery();
    startLoop();
  }

  function getMode(value) {
    if (!value.activeQuestionId || value.state === "lobby") return "lobby";
    if (value.state === "live") return "countdown";
    if (value.state === "locked") return "locked";
    if (value.state === "closed") return "results";
    if (value.state === "lottery") return "lottery";
    return "waiting";
  }

  function updateButton() {
    const label = button.querySelector(".audio-label");
    label.textContent = enabled
      ? `${MODE_LABELS[mode] || "活動音效"}・${volume}%`
      : "開啟音效";
    button.title = enabled ? "點擊靜音" : "瀏覽器需要點擊後才能播放音效";
    const icon = document.querySelector(".display-volume-control .volume-icon");
    if (icon) icon.textContent = volume === 0 ? "🔇" : volume < 45 ? "🔉" : "🔊";
  }

  function startLoop() {
    stopLoop();
    scheduleBeat();
  }

  function stopLoop() {
    clearTimeout(loopTimer);
  }

  function scheduleBeat() {
    if (!enabled || !context) return;
    const settings = modeSettings();
    playBeat(settings);
    beat += 1;
    loopTimer = setTimeout(scheduleBeat, settings.interval);
  }

  function modeSettings() {
    const remaining = Math.max(
      0,
      Math.ceil((Number(session.timerEndsAt) - Date.now()) / 1000),
    );
    if (mode === "countdown") {
      if (remaining <= 0)
        return { interval: 1200, pattern: "expired", remaining };
      if (remaining <= 10) return { interval: 430, pattern: "urgent", remaining };
      return { interval: 600, pattern: "countdown", remaining };
    }
    if (mode === "waiting")
      return { interval: 780, pattern: "waiting", remaining };
    if (mode === "locked")
      return { interval: 900, pattern: "locked", remaining };
    if (mode === "lottery")
      return { interval: 350, pattern: "lottery", remaining };
    if (mode === "results")
      return { interval: 520, pattern: "results", remaining };
    return { interval: 830, pattern: "lobby", remaining };
  }

  function playBeat({ pattern, remaining }) {
    const now = context.currentTime + 0.02;
    if (pattern === "lobby") {
      const melody = ["C4", "E4", "G4", "B4", "A4", "G4", "E4", "D4"];
      tone(NOTES[melody[beat % melody.length]], now, 0.62, 0.055, "sine");
      if (beat % 4 === 0) {
        const roots = ["C3", "F3", "A3", "G3"];
        tone(NOTES[roots[(beat / 4) % roots.length]], now, 2.8, 0.035, "triangle");
      }
    } else if (pattern === "waiting") {
      const melody = ["D4", "A4", "F4", "A4", "E4", "A4", "G4", "A4"];
      tone(NOTES[melody[beat % melody.length]], now, 0.42, 0.045, "triangle");
      if (beat % 4 === 0) tone(NOTES.D3, now, 1.8, 0.025, "sine");
    } else if (pattern === "countdown") {
      const melody = ["C4", "G4", "E4", "G4", "D4", "A4", "F4", "A4"];
      tone(NOTES[melody[beat % melody.length]], now, 0.25, 0.06, "triangle");
      tone(NOTES.C3, now, 0.12, 0.025, "sine");
    } else if (pattern === "urgent") {
      tone(remaining % 2 ? NOTES.C5 : NOTES.G5, now, 0.1, 0.09, "square");
      tone(NOTES.C3, now, 0.09, 0.035, "sine");
    } else if (pattern === "locked") {
      const melody = ["D4", "F4", "A4", "C5"];
      tone(NOTES[melody[beat % melody.length]], now, 0.5, 0.035, "sine");
      if (beat % 4 === 0) tone(NOTES.D3, now, 2.2, 0.02, "triangle");
    } else if (pattern === "lottery") {
      const melody = ["C4", "E4", "G4", "C5", "G4", "E5"];
      tone(NOTES[melody[beat % melody.length]], now, 0.18, 0.055, "triangle");
    } else if (pattern === "results") {
      const melody = [
        "E4",
        "G4",
        "C5",
        "G4",
        "F4",
        "A4",
        "C5",
        "A4",
        "G4",
        "B4",
        "D5",
        "B4",
        "F4",
        "G4",
        "E4",
        "D4",
      ];
      const roots = ["C3", "F3", "G3", "C3"];
      const melodyNote = NOTES[melody[beat % melody.length]];
      tone(melodyNote, now, 0.38, 0.07, "triangle");
      tone(melodyNote / 2, now, 0.26, 0.025, "sine");
      if (beat % 2 === 0) {
        tone(NOTES[roots[Math.floor(beat / 4) % roots.length]], now, 0.42, 0.055, "triangle");
        tone(NOTES.C5, now + 0.11, 0.08, 0.024, "square");
      }
      if (beat % 4 === 2) {
        tone(NOTES.G4, now + 0.05, 0.12, 0.032, "sine");
      }
    }
  }

  function tone(frequency, start, duration, volume, type = "sine") {
    if (!enabled || !context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.min(0.22, volume * SOURCE_GAIN),
      start + 0.025,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.04);
  }

  function playWelcome() {
    const now = context.currentTime + 0.04;
    [NOTES.C4, NOTES.E4, NOTES.G4].forEach((note, index) =>
      tone(note, now + index * 0.09, 0.55, 0.05, "sine"),
    );
  }

  function playReveal() {
    const key = `${session.activeQuestionId || ""}:${session.state}`;
    if (key === lastRevealMode) return;
    lastRevealMode = key;
    const now = context.currentTime + 0.04;
    [NOTES.C4, NOTES.E4, NOTES.G4, NOTES.C5].forEach((note, index) =>
      tone(note, now + index * 0.11, 0.72, 0.075, "triangle"),
    );
  }

  function playLottery() {
    const now = context.currentTime + 0.03;
    [NOTES.C4, NOTES.E4, NOTES.G4, NOTES.C5, NOTES.E5].forEach((note, index) =>
      tone(note, now + index * 0.07, 0.36, 0.06, "triangle"),
    );
  }

  slider.style.setProperty("--volume-level", `${volume}%`);
  return { sync };
}
