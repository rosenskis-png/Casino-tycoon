# Pixel-art drawing kit (Batch D): a canvas of palette letters with shape tools, and a PNG previewer.
# Sprites are drawn in Python with these tools, previewed as PNGs, then exported as text rows into src/data
# (art is data: the game only ever sees the rows). See tools/pixelart/README.md.
import math, re, struct, zlib

class C:
    def __init__(s, w, h):
        s.w, s.h = w, h
        s.g = [['.'] * w for _ in range(h)]
    def set(s, x, y, ch):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < s.w and 0 <= y < s.h and ch:
            s.g[y][x] = ch
    def get(s, x, y):
        return s.g[y][x] if 0 <= x < s.w and 0 <= y < s.h else '.'
    def rect(s, x0, y0, x1, y1, ch):
        x0, y0, x1, y1 = (int(round(v)) for v in (x0, y0, x1, y1))
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                s.set(x, y, ch(x, y) if callable(ch) else ch)
    def ell(s, cx, cy, rx, ry, ch, only=None):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 if rx > 0 and ry > 0 else 9
                if d <= 1 and (only is None or only(x, y)):
                    s.set(x, y, ch(x, y, d) if callable(ch) else ch)
    def poly(s, pts, ch):
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            xs = []
            n = len(pts)
            for i in range(n):
                (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
                if (y0 <= y + 0.5 < y1) or (y1 <= y + 0.5 < y0):
                    xs.append(x0 + (y + 0.5 - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for a, b in zip(xs[::2], xs[1::2]):
                for x in range(int(math.ceil(a - 0.5)), int(math.floor(b - 0.5)) + 1):
                    s.set(x, y, ch(x, y) if callable(ch) else ch)
    def line(s, x0, y0, x1, y1, ch, t=1):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            y = y0 + (y1 - y0) * i / n
            for dx in range(t):
                s.set(x + dx, y, ch)
    def text(s, x, y, rows, pal=None):
        for j, r in enumerate(rows):
            for i, c in enumerate(r):
                if c != ' ' and c != '.':
                    s.set(x + i, y + j, c)
    def rows(s):
        # trim fully empty rows at the top only (bottom anchors to the footprint)
        r = [''.join(row) for row in s.g]
        while r and set(r[0]) == {'.'}:
            r.pop(0)
        return r

def ramp(ch_list, x, x0, x1):
    """Pick from a light→dark list by horizontal position (light from the left)."""
    if x1 <= x0: return ch_list[0]
    t = (x - x0) / (x1 - x0)
    return ch_list[min(len(ch_list) - 1, max(0, int(t * len(ch_list))))]

def cyl(c, x0, x1, y0, y1, lst):
    """Fill a box shaded left to right (light from the left): columns, drums, walls."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            c.set(x, y, ramp(lst, x, x0, x1 + 1))

def load_palette(path):
    src = open(path).read()
    m = re.search(r"export const PALETTE[^{]*\{(.*?)\n\};", src, re.S)
    pal = {}
    for k, v in re.findall(r"""(?:^|[\s,])['"]?([A-Za-z0-9])['"]?:\s*"(#[0-9a-fA-F]+)\"""", m.group(1)):
        pal[k] = v
    return pal

def png(path, sprites, pal, scale=3, bg=(0x43, 0x11, 0x1f)):
    """sprites: list of (rows, localpal). Laid out left to right with the ink outline."""
    pad = 4
    W = sum(len(r[0]) + 2 + pad for r, _ in sprites) + pad
    H = max(len(r) + 2 for r, _ in sprites) + 2 * pad
    img = [[bg] * W for _ in range(H)]
    ox = pad
    for rows, lp in sprites:
        p = dict(pal); p.update(lp or {})
        h, w = len(rows), len(rows[0])
        oy = H - pad - h - 1
        filled = lambda x, y: 0 <= y < h and 0 <= x < w and rows[y][x] != '.'
        for y in range(-1, h + 1):
            for x in range(-1, w + 1):
                if filled(x, y):
                    c = p.get(rows[y][x], '#ff00ff')
                    img[oy + y][ox + x] = tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))
                elif any(filled(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    img[oy + y][ox + x] = (0x1b, 0x0e, 0x14)
        ox += w + 2 + pad
    raw = b''
    for row in img:
        line = b''.join(bytes(px) * scale for px in row)
        raw += (b'\x00' + line) * scale
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W * scale, H * scale, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)
