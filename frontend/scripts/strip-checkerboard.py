"""Skida lažni „checkerboard“ (JPG nema alfa kanal) i pravi PNG sa providnom pozadinom.

Pozadina = neutralni svetli pikseli (belo/sivo kockice) koji su povezani sa ivicom
slike. Svetle površine unutar ilustracije (kremasti blob, bela kesa) imaju zelen
ton ili su zatvorene obojenom ivicom, pa ih flood-fill ne dohvata.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.int16)

lum = a.mean(axis=2)
spread = a.max(axis=2) - a.min(axis=2)
candidate = (lum >= 170) & (spread <= 8)

labels, n = ndimage.label(candidate)
border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
border = border[border != 0]
bg = np.isin(labels, border)

# Zatvori sitne rupe od JPEG šuma u pozadini, pa omekšaj ivicu za 1 px.
bg = ndimage.binary_closing(bg, iterations=2)
# Generator ostavlja tanku liniju uz samu ivicu — ona nikad nije sadržaj.
bg[:8, :] = bg[-8:, :] = True
bg[:, :8] = bg[:, -8:] = True
alpha = (~bg).astype(np.float32)
alpha = ndimage.gaussian_filter(alpha, sigma=0.8)
alpha = np.clip((alpha - 0.35) / 0.3, 0, 1)

rgba = np.dstack([a.astype(np.uint8), (alpha * 255).astype(np.uint8)])
out = Image.fromarray(rgba, 'RGBA')

# Iseci na sadržaj sa marginom, pa vrati u kvadrat da se slika ne izduži.
ys, xs = np.where(alpha > 0.05)
pad = 24
y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, a.shape[0])
x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, a.shape[1])
crop = out.crop((x0, y0, x1, y1))
side = max(crop.size)
square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
square.paste(crop, ((side - crop.size[0]) // 2, (side - crop.size[1]) // 2))
square = square.resize((512, 512), Image.LANCZOS)
square.save(dst, optimize=True)
print(dst, 'bg px:', int(bg.sum()), 'crop', (x1 - x0, y1 - y0))
