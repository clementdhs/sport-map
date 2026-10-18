"""Draws the sign-in page background (#110): the relief and contour lines of the Écrins massif.

Source: IGN RGE ALTI terrain model (Géoplateforme WMS-R, raw float32 elevations), Licence Ouverte 2.0, credited
on the page. Both files are masks that login.vue tints with the accent color:
  public/img/login-relief.webp   hillshade, luminance mask (white = shadow), lossy WebP
  public/img/login-contours.svg  contour lines every 100 m, thicker every 500 m (line art is far lighter as SVG)

Run once, outside the app: python -m venv .venv && .venv/Scripts/pip install numpy matplotlib pillow, then
.venv/Scripts/python scripts/login-background.py
"""
import math
import urllib.request

import matplotlib
import numpy as np

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
from PIL import Image  # noqa: E402

LON, LAT, WIDTH_KM = 6.30, 44.95, 30  # around La Meije and the Barre des Écrins
SW, SH = 1920, 1280  # elevation grid, 3:2 like both outputs
RELIEF_WIDTH = 1600


def fetch_elevations():
    def merc(lon, lat):
        return lon * 20037508.34 / 180, math.log(math.tan((90 + lat) * math.pi / 360)) * 20037508.34 / math.pi
    cx, cy = merc(LON, LAT)
    hw = WIDTH_KM * 500 / math.cos(math.radians(LAT))
    hh = hw * SH / SW
    url = ('https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap'
           '&LAYERS=ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES&STYLES=&CRS=EPSG:3857'
           f'&BBOX={cx - hw},{cy - hh},{cx + hw},{cy + hh}&WIDTH={SW}&HEIGHT={SH}&FORMAT=image/x-bil;bits=32')
    z = np.frombuffer(urllib.request.urlopen(url).read(), dtype='<f4').reshape(SH, SW)
    assert z.min() > 0, 'no data in part of the area'
    return z


def blur(a, r):
    n = int(3 * r)
    k = np.exp(-np.arange(-n, n + 1) ** 2 / (2 * r * r))
    k /= k.sum()
    a = np.apply_along_axis(lambda v: np.convolve(np.pad(v, n, mode='edge'), k, 'valid'), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(np.pad(v, n, mode='edge'), k, 'valid'), 1, a)


def relief(z):
    # Smoothed first: the grid has faint horizontal stripes.
    gy, gx = np.gradient(blur(z, 4), WIDTH_KM * 1000 / SW)
    slope, aspect = np.arctan(np.hypot(gx, gy)), np.arctan2(-gx, gy)
    az, alt = np.radians(315), np.radians(45)
    shade = np.clip(np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect), 0, 1)
    shadow = np.clip((0.75 - shade) / 0.75, 0, 1) ** 0.9 * 0.6
    img = Image.fromarray((shadow * 255).astype(np.uint8)).resize((RELIEF_WIDTH, RELIEF_WIDTH * SH // SW), Image.LANCZOS)
    img.convert('RGB').save('public/img/login-relief.webp', 'WEBP', quality=55, method=6)


def simplify(p, eps):
    # Ramer-Douglas-Peucker, in pixels.
    if len(p) < 3:
        return p
    a, ab = p[0], p[-1] - p[0]
    norm = np.hypot(*ab)
    d = np.abs(ab[0] * (p[:, 1] - a[1]) - ab[1] * (p[:, 0] - a[0])) / norm if norm else np.hypot(*(p - a).T)
    i = int(np.argmax(d))
    if d[i] <= eps:
        return p[[0, -1]]
    return np.vstack([simplify(p[:i + 1], eps)[:-1], simplify(p[i:], eps)])


def contours(z):
    cs = plt.contour(blur(z, 8), levels=np.arange(1000, 4200, 100))
    paths = {False: [], True: []}
    for level, segments in zip(cs.levels, cs.allsegs):
        for s in segments:
            if len(s) < 4:
                continue
            q = np.round(simplify(s, 0.6)).astype(int)
            paths[int(level) % 500 == 0].append(f'M{q[0][0]} {q[0][1]}l' + ' '.join(f'{x} {y}' for x, y in np.diff(q, axis=0)))
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SW} {SH}" fill="none" stroke="#000" stroke-linejoin="round">'
           f'<path stroke-width="0.8" d="{"".join(paths[False])}"/><path stroke-width="1.6" d="{"".join(paths[True])}"/></svg>\n')
    with open('public/img/login-contours.svg', 'w') as f:
        f.write(svg)


if __name__ == '__main__':
    import os
    import sys
    sys.setrecursionlimit(100000)
    os.makedirs('public/img', exist_ok=True)
    elevations = fetch_elevations()
    relief(elevations)
    contours(elevations)
