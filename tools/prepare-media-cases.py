"""Reproduce the 2.8.0 robustness library. Requires Pillow; FFmpeg is optional.

Only --download accesses the network. Respect media-host throttling; stop on 429.
Original public media and derivatives retain the licenses in the source manifest.
"""
import argparse
import hashlib
import json
from pathlib import Path
import random
import subprocess
import time
import urllib.error
import urllib.request

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

parser = argparse.ArgumentParser()
parser.add_argument('--root', default='node_modules/.stress-assets')
parser.add_argument('--download', action='store_true')
parser.add_argument('--ffmpeg', help='Optional absolute path to an official FFmpeg executable')
args = parser.parse_args()
root = Path(args.root)
root.mkdir(parents=True, exist_ok=True)
manifest = json.loads(Path('docs/MEDIA-LIBRARY-2.8.0.json').read_text())
records = []

for source in manifest['sources']:
    folder = root / 'clips' if source['kind'] == 'clip' else root
    folder.mkdir(exist_ok=True)
    path = folder / source['file']
    if args.download and not path.exists():
        request = urllib.request.Request(source['download'], headers={'User-Agent': 'TENDER-Robustness/2.8'})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                path.write_bytes(response.read())
        except urllib.error.HTTPError as error:
            if error.code == 429:
                print('Media host rate-limited this request. Downloading stopped.')
                break
            print(source['file'], error)
            continue
        time.sleep(3)
    if not path.exists():
        print('Missing:', path)
        continue
    if hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
        raise ValueError(f'Source hash changed: {path}; review the source before testing.')
    if source['kind'] == 'clip':
        if not args.ffmpeg:
            continue
        frames = root / 'clip-frames'
        clips = root / 'clip-variants'
        frames.mkdir(exist_ok=True)
        clips.mkdir(exist_ok=True)
        common = [args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(path)]
        if path.suffix == '.ogv':
            subprocess.run(common + ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus',
                str(folder / (source['id'] + '.converted.webm'))], check=True)
        subprocess.run(common + ['-vf', 'fps=2,scale=800:-2', '-q:v', '3', str(frames / (source['id'] + '__%03d.jpg'))], check=True)
        for name, effect in {'small': 'scale=320:-2', 'dark': 'eq=brightness=-0.3', 'mirror': 'hflip', 'turned': 'transpose=1', 'blur': 'gblur=sigma=8'}.items():
            subprocess.run(common + ['-t', '5', '-vf', effect + ',fps=15', '-an', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', str(clips / (source['id'] + '__' + name + '.webm'))], check=True)
        continue
    im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    im.thumbnail((1200, 1200))
    variants = {'base': im, 'mirror': ImageOps.mirror(im), 'gray': ImageOps.grayscale(im).convert('RGB')}
    for size in [160, 240, 400, 800]:
        image = im.copy()
        image.thumbnail((size, size))
        variants['size' + str(size)] = image
    for brightness in [.1, .3, .6, 1.5, 2.5]:
        variants['light' + str(brightness)] = ImageEnhance.Brightness(im).enhance(brightness)
    for radius in [2, 5, 10, 20]:
        variants['blur' + str(radius)] = im.filter(ImageFilter.GaussianBlur(radius))
    for angle in [-45, -15, 15, 45, 90, 180]:
        variants['rotate' + str(angle)] = im.rotate(angle, expand=True, fillcolor='#7f7f7f')
    w, h = im.size
    for name, box in {'top': (0, 0, w, h // 2), 'bottom': (0, h // 2, w, h), 'left': (0, 0, w // 2, h), 'right': (w // 2, 0, w, h)}.items():
        image = im.copy()
        ImageDraw.Draw(image).rectangle(box, fill='#7f7f7f')
        variants['occlude-' + name] = image
    dest = root / 'expanded'
    dest.mkdir(exist_ok=True)
    for name, image in variants.items():
        filename = source['id'] + '__' + name + '.jpg'
        image.save(dest / filename, quality=90)
        records.append({'name': filename, 'source': source['id'], 'transform': name})
    for quality in [5, 20, 50]:
        filename = source['id'] + '__jpeg' + str(quality) + '.jpg'
        im.save(dest / filename, quality=quality)
        records.append({'name': filename, 'source': source['id'], 'transform': 'jpeg' + str(quality)})

dest = root / 'expanded'
dest.mkdir(exist_ok=True)
for color in ['white', 'black', 'gray']:
    Image.new('RGB', (800, 600), color).save(dest / ('negative-' + color + '.png'))
rng = random.Random(2508)
Image.frombytes('RGB', (400, 400), bytes(rng.randrange(256) for _ in range(400 * 400 * 3))).save(dest / 'negative-noise.png')
(dest / 'negative-corrupt.jpg').write_bytes(b'This is not an image')
if (root / 'evan.jpg').exists():
    (dest / 'negative-truncated.jpg').write_bytes((root / 'evan.jpg').read_bytes()[:512])
for name in ['evan', 'sleeping', 'meek']:
    if not (root / (name + '.jpg')).exists():
        continue
    image = ImageOps.exif_transpose(Image.open(root / (name + '.jpg'))).convert('RGB')
    image.thumbnail((600, 600))
    pair = Image.new('RGB', (image.width * 2, image.height), 'gray')
    pair.paste(image, (0, 0))
    pair.paste(image, (image.width, 0))
    pair.save(dest / (name + '__two-faces.jpg'))
(root / 'variants.json').write_text(json.dumps(records, indent=2))
print('Photo cases:', len(list(dest.iterdir())))
