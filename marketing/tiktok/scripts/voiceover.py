# Generate French ad-style voiceover with Kokoro (sherpa-onnx), aligned to scene timings.
import sherpa_onnx, soundfile as sf, numpy as np, os, subprocess, json

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(HERE, "kokoro-multi-lang-v1_0")
OUT = os.path.join(HERE, "vo")
os.makedirs(OUT, exist_ok=True)

config = sherpa_onnx.OfflineTtsConfig(
    model=sherpa_onnx.OfflineTtsModelConfig(
        kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
            model=os.path.join(M, "model.onnx"),
            voices=os.path.join(M, "voices.bin"),
            tokens=os.path.join(M, "tokens.txt"),
            data_dir=os.path.join(M, "espeak-ng-data"),
            dict_dir=os.path.join(M, "dict"),
            lexicon=",".join([os.path.join(M, "lexicon-us-en.txt"), os.path.join(M, "lexicon-zh.txt")]),
        ),
        num_threads=4,
    ),
    max_num_sentences=1,
)
tts = sherpa_onnx.OfflineTts(config)
SID = 31  # ff_siwis (French)

# (start_time, max_end, speed, text)
LINES = [
    (0.20, 3.45, 1.04, "La carte papier ? Perdue, froissée, oubliée."),
    (3.65, 7.25, 1.04, "Voici Kivli. La carte de fidélité digitale."),
    (7.45, 10.3, 1.02, "Affichez votre QR code."),
    (10.70, 13.9, 1.03, "Le client crée sa carte en un instant."),
    (14.15, 17.8, 1.03, "Un scan, et le passage est compté."),
    (18.15, 21.6, 1.02, "Huit passages, récompense débloquée !"),
    (21.95, 25.3, 1.03, "Zéro euro, une minute, sans application."),
    (25.35, 28.0, 1.03, "Kivli point F R. C'est gratuit."),
]

def trim_silence(samples, sr, thresh_db=-42.0):
    x = np.asarray(samples, dtype=np.float32)
    amp = 10 ** (thresh_db / 20)
    idx = np.where(np.abs(x) > amp)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(0.02 * sr))
    b = min(len(x), idx[-1] + int(0.06 * sr))
    return x[a:b]

MAX_SPEED = 1.12
segs = []
for i, (t0, tmax, speed, text) in enumerate(LINES):
    slot = tmax - t0
    sp = speed
    for attempt in range(6):
        audio = tts.generate(text, sid=SID, speed=sp)
        x = trim_silence(audio.samples, audio.sample_rate)
        dur = len(x) / audio.sample_rate
        if dur <= slot or sp >= MAX_SPEED:
            break
        sp = min(MAX_SPEED, sp * (dur / slot) * 1.01)
    if dur > slot:
        print(f"  !! seg{i} still overruns: {dur:.2f}s > {slot:.2f}s")
    path = os.path.join(OUT, f"seg{i}.wav")
    sf.write(path, x, audio.sample_rate)
    segs.append((t0, dur, sp, path))
    print(f"seg{i}: start={t0:.2f}s dur={dur:.2f}s (slot {slot:.2f}s) speed={sp:.2f} :: {text}")

# Assemble on a 28 s timeline: adelay each segment, mix, gentle loudness normalize.
FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
inputs, delays, labels = [], [], []
for i, (t0, dur, sp, path) in enumerate(segs):
    inputs += ["-i", path]
    delays.append(f"[{i}:a]adelay={int(t0*1000)}|{int(t0*1000)}[d{i}]")
    labels.append(f"[d{i}]")
fc = ";".join(delays) + ";" + "".join(labels) + f"amix=inputs={len(segs)}:normalize=0,loudnorm=I=-15:TP=-1.2:LRA=9,atrim=0:28,asetpts=PTS-STARTPTS[a]"
cmd = [FF, "-y", *inputs, "-filter_complex", fc, "-map", "[a]", "-ar", "48000", "-ac", "2", os.path.join(OUT, "voiceover.wav")]
subprocess.run(cmd, check=True, capture_output=True)
print("voiceover.wav assembled")

# Mux with the video (keep video stream untouched).
video = os.path.join(HERE, "kivli-tiktok.mp4")
out = os.path.join(HERE, "kivli-tiktok-voix.mp4")
subprocess.run([FF, "-y", "-i", video, "-i", os.path.join(OUT, "voiceover.wav"),
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
                "-movflags", "+faststart", out], check=True, capture_output=True)
print("DONE:", out)
