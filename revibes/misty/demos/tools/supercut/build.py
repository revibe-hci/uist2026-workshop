"""Build the supercut: python3 build.py <folder with titles.txt and clips> <cards dir> <out.mp4>"""
import json, os, re, subprocess, sys
src, cards, out = sys.argv[1:4]
titles = sys.argv[4] if len(sys.argv) > 4 else os.path.join(src, 'titles.txt')
tmp = os.path.join(os.path.dirname(out) or '.', 'tmp'); os.makedirs(tmp, exist_ok=True)
BG, XF = '#1e1b2e', 0.4
rows = [[s.strip() for s in l.split('|')] for l in open(titles) if l.strip() and not l.strip().startswith('#')]
clips = [r for r in rows if r[0] != 'OPENING']
run = lambda args: subprocess.run(args, check=True, capture_output=True, text=True)
def dur(f):
    v = run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration', '-of', 'default=nw=1:nk=1', f]).stdout.split()
    v = [x for x in v if re.match(r'^[\d.]+$', x)]
    return float(v[0]) if v else float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]).stdout.strip())
def max_vol(f):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', f, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.search(r'max_volume: (-?[\d.]+) dB', r.stderr); return float(m.group(1)) if m else -999
ENC = ['-c:v', 'libx264', '-crf', '12', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2']
def card(png, d, name):
    f = os.path.join(tmp, name)
    run(['ffmpeg', '-y', '-loop', '1', '-framerate', '30', '-t', str(d), '-i', png, '-f', 'lavfi', '-t', str(d), '-i', 'anullsrc=r=48000:cl=stereo',
         '-vf', 'setsar=1,format=yuv420p', '-shortest', *ENC, f]); return f
def clip(path, name):
    f = os.path.join(tmp, name); d = dur(path); mv = max_vol(path)
    if os.path.exists(f) and os.path.getmtime(f) > os.path.getmtime(path):  # reuse a clip normalized earlier
        return f, mv
    vf = f'scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color={BG},setsar=1,fps=30,format=yuv420p'
    if mv < -80:  # silent track: keep it silent rather than amplify noise
        args = ['-i', path, '-f', 'lavfi', '-t', str(d), '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v:0', '-map', '1:a:0', '-vf', vf]
    else:
        args = ['-i', path, '-map', '0:v:0', '-map', '0:a:0', '-vf', vf, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,apad']
    run(['ffmpeg', '-y', *args, '-t', f'{d:.3f}', *ENC, f]); return f, mv
segs, notes = [card(os.path.join(cards, 'card_open.png'), 3, 's00_open.mp4')], []
for i, c in enumerate(clips, 1):
    segs.append(card(os.path.join(cards, f'card_{i}.png'), 2.5, f's{i:02d}a_card.mp4'))
    f, mv = clip(os.path.join(src, c[0]), f's{i:02d}b_clip.mp4'); segs.append(f)
    notes.append(f'{c[0]}: {dur(f):.1f}s, source max volume {mv:.1f} dB' + (' (silent, kept silent)' if mv < -80 else ''))
segs.append(card(os.path.join(cards, 'card_end.png'), 2, 's99_end.mp4'))
durs = [dur(s) for s in segs]
# Crossfade chain.
inputs = sum([['-i', s] for s in segs], [])
fc, v, a, t = [], '[0:v]', '[0:a]', durs[0]
for k in range(1, len(segs)):
    off = t - XF
    fc.append(f'{v}[{k}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}[v{k}]')
    fc.append(f'{a}[{k}:a]acrossfade=d={XF}:c1=tri:c2=tri[a{k}]')
    v, a, t = f'[v{k}]', f'[a{k}]', t - XF + durs[k]
fc.append(f'{v}fade=t=in:st=0:d=0.5,fade=t=out:st={t - 0.6:.3f}:d=0.6,format=yuv420p[vo]')
fc.append(f'{a}afade=t=in:st=0:d=0.3,afade=t=out:st={t - 0.6:.3f}:d=0.6[ao]')
run(['ffmpeg', '-y', *inputs, '-filter_complex', ';'.join(fc), '-map', '[vo]', '-map', '[ao]',
     '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30',
     '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', out])
print(json.dumps({'segments': [os.path.basename(s) for s in segs], 'durations': [round(d, 2) for d in durs], 'expected_total': round(t, 2), 'notes': notes}, indent=1))
