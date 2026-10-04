"""Prepare local robustness inputs; requires Pillow. Sources are in the stress report.

Place the two originals in an ignored directory and pass that directory as argv[1].
No images or clinical labels are included in the repository.
"""
import sys
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

root = Path(sys.argv[1])
for source in ['crying-newborn', 'sleeping']:
    original = Image.open(root / (source + '.jpg'))
    image = original.convert('RGB')
    image.thumbnail((1200, 1200))
    upright = ImageOps.exif_transpose(original).convert('RGB')
    upright.thumbnail((1200, 1200))
    variants = {
        'original': image,  # As-encoded raster, deliberately without EXIF rotation.
        'small': image.resize((round(image.width / 4), round(image.height / 4))),
        'dark': ImageEnhance.Brightness(image).enhance(.12),
        'blur': image.filter(ImageFilter.GaussianBlur(10)),
        'turned': image.rotate(45, expand=True),
        'mirror': ImageOps.mirror(image),
        'upright': upright,
    }
    for name, variant in variants.items():
        variant.save(root / (source + '-' + name + '.jpg'))
Image.new('RGB', (800, 600), 'white').save(root / 'blank.jpg')
