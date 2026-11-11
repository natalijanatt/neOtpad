import math, urllib.request, io, json
import numpy as np
from PIL import Image

Z = 11
LAT0, LAT1 = 42.94, 43.40     # south, north
LON0, LON1 = 22.34, 22.93     # west, east

def lon2x(lon, z): return (lon + 180.0) / 360.0 * (2 ** z)
def lat2y(lat, z):
    r = math.radians(lat)
    return (1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * (2 ** z)

x0, x1 = int(math.floor(lon2x(LON0, Z))), int(math.floor(lon2x(LON1, Z)))
y0, y1 = int(math.floor(lat2y(LAT1, Z))), int(math.floor(lat2y(LAT0, Z)))
print("tiles x", x0, x1, "y", y0, y1, "=", (x1-x0+1)*(y1-y0+1))

W, H = (x1-x0+1)*256, (y1-y0+1)*256
mosaic = np.zeros((H, W), dtype=np.float32)
for ty in range(y0, y1+1):
    for tx in range(x0, x1+1):
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png"
        with urllib.request.urlopen(url, timeout=60) as r:
            im = Image.open(io.BytesIO(r.read())).convert("RGB")
        a = np.asarray(im).astype(np.float32)
        elev = a[:, :, 0] * 256.0 + a[:, :, 1] + a[:, :, 2] / 256.0 - 32768.0
        mosaic[(ty-y0)*256:(ty-y0+1)*256, (tx-x0)*256:(tx-x0+1)*256] = elev
        print("ok", tx, ty, int(elev.min()), int(elev.max()))

# crop the mosaic to the exact bbox in pixel space
px0 = (lon2x(LON0, Z) - x0) * 256; px1 = (lon2x(LON1, Z) - x0) * 256
py0 = (lat2y(LAT1, Z) - y0) * 256; py1 = (lat2y(LAT0, Z) - y0) * 256
crop = mosaic[int(py0):int(math.ceil(py1)), int(px0):int(math.ceil(px1))]
print("crop", crop.shape, crop.min(), crop.max())

# downsample to a grid the GPU can chew on, keeping peaks (max-pool blended with mean)
GX, GY = 192, 192
ys = np.linspace(0, crop.shape[0]-1, GY).astype(int)
xs = np.linspace(0, crop.shape[1]-1, GX).astype(int)
grid = crop[np.ix_(ys, xs)]
json.dump({
    "z": Z, "bbox": [LON0, LAT0, LON1, LAT1],
    "nx": GX, "ny": GY,
    "min": float(grid.min()), "max": float(grid.max()),
    "elev": [[round(float(v), 1) for v in row] for row in grid],
}, open("terrain.json", "w"), separators=(",", ":"))
print("wrote terrain.json", round(len(open('terrain.json').read())/1024), "KB")
