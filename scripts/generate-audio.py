"""Generate local Mandarin audio assets on macOS; no service or API key required."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
jobs = json.loads((root / 'data/audio-jobs.json').read_text())
cache_dir = root / '.cache/audio'
cache_dir.mkdir(parents=True, exist_ok=True)

def generate(job):
    dest = root / 'public' / job['file']
    if dest.exists() and dest.stat().st_size > 500:
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=cache_dir) as temporary:
        aiff = Path(temporary) / 'voice.aiff'
        mp3 = Path(temporary) / 'voice.mp3'
        subprocess.run(['say', '-v', 'Tingting', '-r', '155', '-o', str(aiff), job['text']], check=True, capture_output=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(aiff), '-codec:a', 'libmp3lame', '-b:a', '40k', str(mp3)], check=True, capture_output=True)
        mp3.replace(dest)
    return True

with ThreadPoolExecutor(max_workers=5) as pool:
    futures = [pool.submit(generate, job) for job in jobs]
    created = 0
    for i, future in enumerate(as_completed(futures), 1):
        created += int(future.result())
        if i % 100 == 0:
            print(f'audio {i}/{len(jobs)}, generated {created}', flush=True)
print(f'Audio complete: {len(jobs)} clips, {created} generated.', flush=True)
