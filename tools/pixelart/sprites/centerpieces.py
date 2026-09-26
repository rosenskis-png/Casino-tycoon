# Centerpiece sprites (Batch D): 4×4 (64 wide) and 5×5 (80 wide). Frames: key, key~1, key~2. Exported to src/data/artLarge.ts.
import math
from px import C, ramp, cyl

S = {}
LAVA = {"A": "#ff7a2a", "D": "#b8321e", "W": "#ffe08a"}

# ---- Tiki: a volcano (5×5), glowing crater and lava runs; frames shift the glow.
def volcano(f):
    c = C(80, 96)
    # water ring at the foot
    c.ell(40, 86, 39, 9, lambda x, y, d: "v" if d > 0.85 and y < 86 else ("U" if (x + y + f) % 7 else "V"))
    # the cone
    c.poly([(4, 88), (24, 40), (33, 20), (47, 20), (56, 40), (76, 88)], lambda x, y: ramp(["S", "S", "s", "s", "1"], x, 4, 77))
    for k in range(90):
        x = (k * 37) % 70 + 5; y = 24 + (k * 23) % 62
        if c.get(x, y) in "Ss1": c.set(x, y, "t" if k % 4 == 0 else ("S" if x < 40 else "s"))
    # crater and lava runs
    c.ell(40, 21, 8, 2.5, lambda x, y, d: "W" if d < 0.3 else ("q" if d < 0.6 else "A"))
    runs = [(36, 22, 26, 58), (43, 22, 50, 70), (40, 23, 38, 80)]
    for i, (x0, y0, x1, y1) in enumerate(runs):
        n = y1 - y0
        for j in range(n):
            t = j / n
            x = x0 + (x1 - x0) * t + math.sin(j / 4 + i) * 2
            glow = ((j + f * 3) // 3) % 4
            c.set(x, y0 + j, "W" if glow == 0 else ("A" if glow < 3 else "D"))
            if j % 2: c.set(x + 1, y0 + j, "D")
    # smoke puffs above the crater
    for k, (sx, sy, r) in enumerate([(38, 14, 3), (44, 9, 4), (36, 4, 3)]):
        c.ell(sx + (f % 2) * (1 if k % 2 else -1), sy - f, r, r * 0.8, lambda x, y, d: "t" if x < sx else "S")
    # palms and ferns at the base
    for bx in (8, 66):
        c.rect(bx, 70, bx + 1, 86, "3")
        for a in range(-3, 4):
            c.line(bx, 70, bx + a * 3, 66 + abs(a), "L" if a < 0 else "l")
        c.rect(bx - 4, 67, bx + 5, 68, "L")
    for fx in range(14, 68, 9):
        c.ell(fx, 84, 3, 2, lambda x, y, d: "j" if x < fx else "L")
    # carved tiki at the front
    cyl(c, 37, 43, 76, 90, ["5", "4", "3"])
    c.rect(38, 79, 39, 80, "p"); c.rect(41, 79, 42, 80, "p"); c.rect(38, 84, 42, 85, "R")
    return c

S["cp_volcano"] = (volcano(0).rows(), LAVA)
S["cp_volcano~1"] = (volcano(1).rows(), LAVA)
S["cp_volcano~2"] = (volcano(2).rows(), LAVA)

# ---- Riviera: dancing fountains (5×5), a stone-rimmed pool with jets; frames change the dance.
def fountains(f):
    c = C(80, 100)
    # rim and pool
    c.ell(40, 72, 39, 27, lambda x, y, d: "T" if d > 0.9 and y < 72 else ("t" if d > 0.9 else ("u" if d > 0.83 else "U")))
    for k in range(40):
        x = (k * 31) % 66 + 7; y = 52 + (k * 13) % 38
        if c.get(x, y) == "U": c.set(x, y, "v")
    cyl(c, 1, 78, 94, 99, ["t", "S", "s"])
    c.rect(1, 93, 78, 93, "T")
    c.ell(40, 98, 38, 3, lambda x, y, d: None)
    # jets in three rings; heights follow the frame's dance
    rings = [(40, 72, 0, 1), (40, 72, 14, 6), (40, 72, 28, 10)]
    for ri, (cx, cy, r, n) in enumerate(rings):
        for k in range(n):
            a = 2 * math.pi * k / n + ri
            x, y = cx + r * math.cos(a), cy + r * 0.62 * math.sin(a)
            h = [52, 30, 18][ri] * (0.55 + 0.45 * math.sin(f * 2.1 + k * 1.3 + ri))
            if ri == 0: h = 62 - 10 * f
            for j in range(int(h)):
                c.set(x, y - j, "Q" if j > h - 3 else ("V" if j % 3 else "Q"))
                if ri == 0: c.set(x + 1, y - j, "V"); c.set(x - 1, y - j, "v" if j < h - 4 else "Q")
            c.ell(x, y, 2.5, 1, "V")
            if ri == 0:
                for s in range(-4, 5, 2): c.set(x + s * 1.5, y - h + abs(s), "Q")
    # lamps on the rim
    for lx in (6, 74):
        c.rect(lx, 76, lx, 90, "7"); c.ell(lx, 75, 1.5, 1.5, "q")
    return c

for i in range(3):
    S["cp_fountains" + ("" if i == 0 else f"~{i}")] = (fountains(i).rows(), {})

# ---- Egypt: the great sphinx (4×4), seen head on.
SAND = {"A": "#e0c088", "B": "#c49a5c", "D": "#8e6a3a", "W": "#f2dcae"}
PALS = {"LAVA": LAVA, "SAND": SAND}
def sphinx():
    c = C(64, 76)
    # base
    c.rect(2, 64, 61, 65, "W"); cyl(c, 2, 61, 66, 75, ["A", "B", "B", "D"])
    for x in range(6, 60, 8): c.rect(x, 68, x + 3, 72, "D")
    # body behind the head
    c.ell(32, 46, 26, 14, lambda x, y, d: ramp(["A", "A", "B", "B", "D"], x, 6, 59))
    # paws forward
    for px_ in (10, 44):
        c.rect(px_, 50, px_ + 9, 63, lambda x, y: ramp(["W", "A", "B"], x, px_, px_ + 10))
        for t in range(3): c.set(px_ + 2 + t * 3, 63, "D")
    # headdress (nemes): gold and blue stripes
    c.poly([(16, 14), (48, 14), (54, 46), (42, 46), (32, 40), (22, 46), (10, 46)], lambda x, y: ("9" if (y // 3) % 2 else "U") if x < 32 else ("8" if (y // 3) % 2 else "u"))
    c.ell(32, 12, 14, 7, lambda x, y, d: ("9" if (y // 3) % 2 else "U") if x < 32 else ("8" if (y // 3) % 2 else "u"))
    # face
    c.rect(23, 14, 41, 34, lambda x, y: ramp(["W", "A", "A", "B"], x, 23, 42))
    c.ell(32, 34, 9, 5, lambda x, y, d: ramp(["W", "A", "B"], x, 23, 42), only=lambda x, y: y >= 34)
    c.rect(25, 20, 29, 21, "K"); c.rect(35, 20, 39, 21, "K"); c.set(26, 20, "p"); c.set(36, 20, "p")
    c.rect(24, 18, 30, 18, "D"); c.rect(34, 18, 40, 18, "D")
    c.rect(31, 22, 33, 28, "B"); c.rect(30, 28, 34, 28, "D")
    c.rect(28, 32, 36, 32, "D")
    c.rect(30, 38, 34, 44, lambda x, y: "9" if (y % 2) else "7")          # beard
    c.poly([(29, 4), (35, 4), (33, 10), (31, 10)], "9"); c.ell(32, 4, 2, 2, "O")   # cobra
    c.rect(22, 14, 42, 14, "9")
    return c
S["cp_sphinx"] = (sphinx().rows(), SAND)

# ---- Pirate: a galleon (4×4), bow first, sails furled, flag up.
def ship():
    c = C(64, 92)
    c.ell(32, 86, 31, 6, lambda x, y, d: "v" if d > 0.8 else ("U" if (x * 3 + y) % 9 else "V"))
    c.poly([(3, 52), (61, 52), (54, 78), (40, 88), (24, 88), (10, 78)], lambda x, y: ramp(["5", "4", "4", "3", "2"], x, 3, 62))
    for y in range(58, 86, 5):
        for x in range(64):
            if c.get(x, y) in "2345": c.set(x, y, "3" if x < 32 else "2")
    c.rect(3, 50, 61, 52, "8"); c.rect(4, 53, 60, 53, "7"); c.rect(6, 64, 58, 65, "8")
    for x in (10, 20, 40, 50): c.rect(x, 57, x + 3, 60, "K"); c.rect(x + 1, 58, x + 2, 59, "m")
    c.poly([(30, 54), (34, 54), (35, 76), (29, 76)], lambda x, y: "9" if x < 32 else "8")
    c.ell(32, 53, 3, 3, "9")
    # masts, yards and furled sails
    for mx, top in ((31, 4), (13, 20), (50, 20)):
        c.rect(mx, top, mx + 1, 51, lambda x, y: "4" if x == mx else "3")
        for yy, half in ((top + 8, 13 if mx == 31 else 9), (top + 20, 15 if mx == 31 else 10), (top + 32, 12 if mx == 31 else 8)):
            if yy > 48: continue
            c.rect(mx - half, yy, mx + 1 + half, yy, "3")
            c.ell(mx + 0.5, yy + 2, half, 2, lambda x, y, d: "p" if x < mx else "P")
    c.rect(28, 6, 35, 8, "3")                                                # crow's nest
    c.rect(32, 0, 43, 5, "y"); c.rect(36, 1, 38, 3, "p"); c.set(37, 4, "p")  # flag
    c.line(3, 52, 31, 6, "2"); c.line(61, 52, 32, 6, "2")
    return c
S["cp_ship"] = (ship().rows(), {})

# ---- Lucky Dragon: a golden dragon (4×4) coiled round a pearl, on a red lacquer drum.
def dragon():
    c = C(64, 80)
    c.ell(32, 62, 29, 7, lambda x, y, d: "9" if d > 0.85 and y < 62 else ("R" if x < 32 else "r"))
    cyl(c, 3, 60, 62, 76, ["R", "R", "r", "r"])
    c.ell(32, 76, 29, 3, lambda x, y, d: "r" if x < 32 else "r", only=lambda x, y: y >= 76)
    c.rect(3, 66, 60, 66, "9"); c.rect(3, 72, 60, 72, "8")
    for x in range(8, 58, 10): c.rect(x, 68, x + 3, 70, "q")
    # coiled body: a thick path of circles
    pts = []
    for i in range(140):
        t = i / 139
        a = t * 3.2 * math.pi
        x = 32 + math.sin(a) * (22 - 8 * t)
        y = 58 - t * 44 + math.cos(a) * 3
        pts.append((x, y, 5 - 2 * t))
    for x, y, r in pts:
        c.ell(x, y, r, r * 0.9, lambda xx, yy, d: ("0" if d < 0.15 else "9") if xx < x else ("8" if d < 0.6 else "7"))
    for i, (x, y, r) in enumerate(pts):
        if i % 6 == 0: c.set(x, y - r + 1, "R")        # spines
        if i % 9 == 0: c.set(x + 1, y + 1, "6")        # scales
    # head
    hx, hy = 32, 12
    c.ell(hx, hy, 8, 6, lambda x, y, d: "9" if x < hx else "8")
    c.rect(hx - 4, hy + 2, hx + 4, hy + 6, lambda x, y: "9" if x < hx else "8")
    c.rect(hx - 3, hy + 6, hx + 3, hy + 6, "R")
    c.set(hx - 4, hy - 1, "q"); c.set(hx + 4, hy - 1, "q"); c.set(hx - 4, hy, "K"); c.set(hx + 4, hy, "K")
    c.poly([(hx - 7, hy - 4), (hx - 11, hy - 10), (hx - 4, hy - 5)], "R"); c.poly([(hx + 7, hy - 4), (hx + 11, hy - 10), (hx + 4, hy - 5)], "r")
    c.line(hx - 3, hy - 6, hx - 6, hy - 11, "7"); c.line(hx + 3, hy - 6, hx + 6, hy - 11, "7")
    c.line(hx - 5, hy + 4, hx - 12, hy + 7, "8"); c.line(hx + 5, hy + 4, hx + 12, hy + 7, "8")
    # the pearl
    c.ell(32, 30, 4, 4, lambda x, y, d: "w" if d < 0.3 else ("p" if x < 33 else "P"))
    # incense smoke
    for k in range(6): c.set(20 + k % 2, 4 - k // 2 + 6, "t"); c.set(44 - k % 2, 8 - k // 2, "t")
    return c
S["cp_dragon"] = (dragon().rows(), {})

# ---- Monte Carlo: a grand carousel (4×4); frames turn the horses.
def carousel(f):
    c = C(64, 80)
    # platform
    c.ell(32, 64, 30, 8, lambda x, y, d: "5" if y < 64 else "4")
    cyl(c, 2, 61, 64, 71, ["9", "8", "8", "7"])
    c.ell(32, 72, 30, 3, "7", only=lambda x, y: y >= 71)
    for x in range(6, 60, 6): c.set(x, 67, "q")
    # centre column of mirrors
    cyl(c, 26, 37, 22, 62, ["N", "n", "M"])
    for y in range(26, 60, 6): c.rect(26, y, 37, y, "9")
    # horses on gilt poles, around the front
    for k in range(5):
        a = math.pi * (0.1 + 0.8 * k / 4) + f * 0.25
        x = 32 + 24 * math.cos(a); y = 60 + 5 * math.sin(a)
        up = 3 if (k + f) % 2 else 0
        c.line(x, 22, x, y, "9")
        hy = y - 12 - up
        c.rect(x - 4, hy, x + 3, hy + 3, lambda xx, yy: "p" if xx < x else "P")
        c.rect(x - 5, hy - 3, x - 3, hy + 1, "p"); c.set(x - 5, hy - 2, "K")
        c.rect(x - 3, hy + 4, x - 3, hy + 7, "P"); c.rect(x + 2, hy + 4, x + 2, hy + 7, "P")
        c.rect(x - 1, hy - 1, x + 1, hy - 1, "R")
    # canopy
    c.ell(32, 20, 31, 6, lambda x, y, d: ("R" if ((x + 1) // 4) % 2 else "p"))
    c.poly([(2, 20), (32, 4), (62, 20)], lambda x, y: ("R" if ((x - 32) * 8 // max(1, (y - 3))) % 2 else "p"))
    for x in range(2, 62, 4): c.ell(x + 2, 26, 2, 1.5, "9", only=lambda xx, yy: yy >= 26)
    c.rect(1, 24, 62, 25, "9")
    c.rect(31, 0, 32, 4, "9"); c.set(31, 0, "0")
    return c
S["cp_carousel"] = (carousel(0).rows(), {})
S["cp_carousel~1"] = (carousel(1).rows(), {})
