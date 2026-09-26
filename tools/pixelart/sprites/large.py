# Large decor sprites (Batch D): 2×2 (32 wide) and 3×3 (48 wide). Exported to src/data/artLarge.ts.
import math
from px import C, ramp, cyl
PALS = {}

def plinth(c, x0, x1, y0, y1, top="T", face=("t", "S", "s")):
    c.rect(x0, y0, x1, y0 + 1, top)
    cyl(c, x0, x1, y0 + 2, y1, list(face))

S = {}

# ---- Egypt: Anubis, a black jackal sitting on a gilded chest.
def anubis():
    c = C(32, 44)
    # chest
    c.rect(4, 30, 27, 31, "9")
    cyl(c, 4, 27, 32, 43, ["8", "7", "7", "6"])
    c.rect(4, 35, 27, 35, "U"); c.rect(4, 39, 27, 39, "U")
    for x in range(6, 27, 4): c.set(x, 37, "9"); c.set(x + 1, 41, "q")
    # body: haunches and chest of a sitting jackal
    c.ell(16, 25, 9, 6, lambda x, y, d: ramp(["Y", "y", "y"], x, 7, 26))
    c.poly([(11, 12), (21, 12), (22, 28), (10, 28)], lambda x, y: ramp(["Y", "y", "y", "y"], x, 10, 23))
    # front legs
    c.rect(12, 20, 13, 29, "Y"); c.rect(19, 20, 20, 29, "y")
    c.rect(11, 29, 14, 29, "Y"); c.rect(18, 29, 21, 29, "y")
    # collar
    c.rect(11, 13, 21, 14, "9"); c.rect(12, 15, 20, 15, "8")
    for x in (12, 15, 18): c.set(x, 16, "U"); c.set(x + 1, 16, "9")
    # head, snout forward (down), tall ears
    c.ell(16, 8, 5, 4, lambda x, y, d: ramp(["Y", "y", "y"], x, 11, 22))
    c.rect(14, 9, 18, 13, lambda x, y: "Y" if x < 16 else "y")
    c.rect(15, 13, 17, 13, "K")
    c.poly([(11, 6), (13, 0), (15, 5)], "Y"); c.poly([(17, 5), (19, 0), (21, 6)], "y")
    c.set(12, 3, "9"); c.set(20, 3, "8")
    c.set(14, 7, "q"); c.set(18, 7, "q")
    return c

# ---- Rock: a giant drum kit.
def drums():
    c = C(32, 38)
    # cymbal stands and cymbals
    for sx, lit in ((4, True), (27, False)):
        c.line(sx, 12, sx, 36, "M" if lit else "m")
        c.ell(sx, 11, 5, 1.5, lambda x, y, d: "9" if y < 11 else "8")
    c.ell(6, 20, 4, 1.2, lambda x, y, d: "9" if y < 20 else "8"); c.line(6, 21, 6, 36, "M")
    # rack toms
    for tx, pal in ((11, ["O", "R", "r"]), (21, ["R", "r", "r"])):
        c.rect(tx - 4, 14, tx + 4, 15, "p")
        cyl(c, tx - 4, tx + 4, 16, 21, pal)
        c.rect(tx - 4, 18, tx + 4, 18, "8")
    # bass drum
    c.ell(16, 28, 10, 9, lambda x, y, d: "r" if d > 0.8 else ("p" if x < 17 else "P"))
    c.ell(16, 28, 6, 5, lambda x, y, d: "R")
    c.text(12, 27, ["pwwwp", "..p.."])
    c.rect(11, 36, 21, 37, "m")
    # floor tom
    cyl(c, 24, 30, 25, 33, ["R", "r", "r"]); c.rect(24, 24, 30, 24, "p")
    return c

# ---- Deco: a stepped skyscraper spire.
def spire():
    c = C(32, 46)
    tiers = [(4, 27, 34, 45), (7, 24, 22, 33), (10, 21, 12, 21), (13, 18, 5, 11)]
    for x0, x1, y0, y1 in tiers:
        c.rect(x0, y0, x1, y0, "9")
        cyl(c, x0, x1, y0 + 1, y1, ["Y", "y", "y", "y"])
        c.rect(x0, y0 + 1, x0, y1, "8")
        for x in range(x0 + 2, x1 - 1, 3):
            for y in range(y0 + 3, y1 - 1, 3):
                c.set(x, y, "q" if (x + y) % 2 else "7")
    c.line(15, 0, 15, 5, "0"); c.line(16, 0, 16, 5, "9")
    # sunburst on the base
    for k in range(-3, 4):
        c.line(16, 44, 16 + k * 3, 38, "8")
    c.rect(2, 45, 29, 45, "8")
    return c

# ---- Luxe: a mirror cube.
def cube():
    c = C(32, 36)
    c.rect(5, 6, 26, 11, lambda x, y: "N" if x < 18 else "n")   # top face
    cyl(c, 5, 26, 12, 31, ["N", "n", "n", "M", "M"])
    for k in range(10):
        c.set(9 + k, 29 - 2 * k, "w"); c.set(10 + k, 29 - 2 * k, "N")
    c.rect(5, 12, 26, 12, "w")
    c.rect(3, 32, 28, 33, "y"); c.rect(3, 34, 28, 35, "Y")
    return c

# ---- Rat Pack: a giant neon martini sign.
def martini():
    c = C(32, 44)
    # pole and base
    c.rect(15, 26, 16, 38, "M"); c.set(15, 30, "n")
    c.rect(9, 39, 22, 40, "8"); cyl(c, 9, 22, 41, 43, ["4", "3", "2"])
    # glass: neon outline of a V, with liquid
    c.poly([(3, 6), (28, 6), (16, 24)], "y")
    c.poly([(6, 9), (25, 9), (16, 21)], "Y")
    c.line(3, 6, 28, 6, "Z"); c.line(3, 5, 28, 5, "z")
    c.line(3, 6, 16, 25, "z"); c.line(28, 6, 16, 25, "z")
    c.line(16, 25, 16, 26, "z")
    c.rect(11, 27, 20, 27, "z")
    # olive on a pick
    c.line(20, 1, 13, 15, "p")
    c.ell(15, 12, 2.5, 2.5, lambda x, y, d: "L" if d > 0.4 else "R")
    c.set(14, 11, "j")
    return c

# ---- Tiki: three carved totems.
def totems():
    c = C(32, 44)
    def totem(x0, x1, top, face):
        cyl(c, x0, x1, top, 41, ["5", "4", "3", "3"])
        for fy in range(top + 4, 38, face):
            c.rect(x0 + 1, fy, x0 + 2, fy + 1, "p"); c.rect(x1 - 2, fy, x1 - 1, fy + 1, "p")
            c.set(x0 + 2, fy + 1, "K"); c.set(x1 - 1, fy + 1, "K")
            c.rect(x0 + 2, fy + 4, x1 - 2, fy + 5, "R"); c.rect(x0 + 3, fy + 5, x1 - 3, fy + 5, "p")
            c.rect(x0, fy + face - 1, x1, fy + face - 1, "2")
        # feathers
        for k, ch in enumerate(["L", "j", "O", "j", "L"]):
            fx = x0 + k * (x1 - x0) // 4
            c.line(fx, top - 1, fx + (k - 2), top - 5, ch)
    totem(2, 9, 16, 11)
    totem(22, 29, 16, 11)
    totem(11, 20, 6, 11)
    c.rect(1, 42, 30, 43, "3")
    return c

# ---- Lucky Dragon: a pagoda shrine.
def pagoda():
    c = C(32, 44)
    def roof(y, x0, x1):
        c.poly([(x0 - 2, y + 3), (x0 + 3, y), (x1 - 3, y), (x1 + 2, y + 3), (x1 - 1, y + 4), (x0 + 1, y + 4)], lambda x, yy: "R" if x < 16 else "r")
        c.rect(x0, y + 4, x1, y + 4, "9")
        c.set(x0 - 2, y + 2, "9"); c.set(x1 + 2, y + 2, "9")
        c.set(x0 - 1, y + 5, "q"); c.set(x1 + 1, y + 5, "q")
    def wall(y0, y1, x0, x1, door=False):
        cyl(c, x0, x1, y0, y1, ["R", "r", "r"])
        c.rect(x0, y0, x0, y1, "8"); c.rect(x1, y0, x1, y1, "7")
        if door: c.rect(14, y0 + 3, 17, y1, "K"); c.rect(14, y0 + 2, 17, y0 + 2, "9")
        else: c.rect(13, y0 + 2, 18, y1 - 1, "9"); c.rect(14, y0 + 3, 17, y1 - 2, "8")
    wall(34, 41, 6, 25, door=True); roof(29, 5, 26)
    wall(23, 28, 9, 22); roof(18, 7, 24)
    wall(13, 17, 11, 20); roof(8, 9, 22)
    c.line(15, 1, 15, 7, "9"); c.line(16, 1, 16, 7, "8"); c.ell(15.5, 3, 1.5, 1.5, "q")
    c.rect(3, 42, 28, 43, "s"); c.rect(3, 42, 28, 42, "S")
    return c

# ---- Monte Carlo: a gilded clock on a marble column.
def clock():
    c = C(32, 46)
    c.rect(7, 38, 24, 39, "T"); cyl(c, 7, 24, 40, 45, ["t", "S", "s"])
    cyl(c, 11, 20, 20, 37, ["T", "T", "t", "S"])
    for x in (13, 16, 19): c.line(x, 21, x, 36, "S")
    c.rect(9, 18, 22, 19, "9"); c.rect(9, 36, 22, 37, "8")
    # clock face
    c.ell(15.5, 9.5, 8, 8, lambda x, y, d: "9" if d > 0.72 else ("8" if d > 0.62 else "p"))
    for a in range(12):
        t = a * math.pi / 6
        c.set(15.5 + 5.3 * math.sin(t), 9.5 - 5.3 * math.cos(t), "K")
    c.line(15.5, 9.5, 15.5, 5.5, "K"); c.line(15.5, 9.5, 18.5, 10.5, "K")
    c.set(15, 0, "9"); c.set(16, 0, "9"); c.rect(14, 1, 17, 1, "9")
    c.poly([(6, 14), (9, 12), (9, 18)], "8"); c.poly([(25, 14), (22, 12), (22, 18)], "7")
    return c

for f in (anubis, drums, spire, cube, martini, totems, pagoda, clock):
    S["big_" + f.__name__] = (f().rows(), {})

# ---- Rome: a triumphal arch.
def arch():
    c = C(48, 56)
    c.rect(3, 8, 44, 10, "T")                                   # top face
    cyl(c, 3, 44, 11, 51, ["T", "T", "t", "t", "S"])
    c.rect(3, 13, 44, 16, "t"); c.rect(6, 14, 41, 15, "9")       # attic with a gold inscription
    for x in range(8, 40, 3): c.set(x, 14, "7")
    c.rect(2, 19, 45, 20, "T"); c.rect(2, 21, 45, 21, "S")       # cornice
    for x0 in (6, 12, 34, 40):                                  # columns
        cyl(c, x0, x0 + 2, 22, 49, ["T", "t", "S"]); c.rect(x0 - 1, 22, x0 + 3, 22, "9")
    # the arch
    for y in range(26, 52):
        for x in range(17, 31):
            dy = y - 34
            if y >= 34 or (x - 23.5) ** 2 + (dy * 1.0) ** 2 <= 7.5 ** 2:
                c.set(x, y, "K" if x < 29 else "k")
    c.ell(23.5, 34, 8.5, 8.5, lambda x, y, d: "9" if d > 0.8 and y < 34 else None, only=lambda x, y: c.get(x, y) not in "Kk")
    c.rect(1, 52, 46, 52, "T"); cyl(c, 1, 46, 53, 55, ["t", "S", "s"])
    # gold chariot group on top
    c.rect(18, 4, 29, 7, "8"); c.rect(18, 4, 29, 4, "9")
    c.poly([(19, 4), (21, 0), (23, 4)], "9"); c.poly([(25, 4), (27, 0), (29, 4)], "8")
    c.ell(23.5, 2, 1.5, 2, "9")
    return c

# ---- Medieval: a castle turret.
def turret():
    c = C(48, 58)
    c.ell(24, 14, 17, 4, "t")                                     # top
    cyl(c, 7, 41, 14, 55, ["T", "t", "t", "S", "S", "s"])
    for y in range(18, 55, 4):
        off = 0 if (y // 4) % 2 else 3
        for x in range(8 + off, 41, 6): c.set(x, y, "s")
        for x in range(7, 42): 
            if c.get(x, y + 3) != ".": c.set(x, y + 3, c.get(x, y + 3))
    for x in range(7, 42, 5):                                    # crenellations
        c.rect(x, 8, x + 2, 13, lambda xx, yy: ramp(["T", "t", "S"], xx, 7, 42))
    c.rect(22, 24, 25, 32, "K"); c.rect(23, 23, 24, 23, "K")      # arrow slit
    c.rect(19, 42, 28, 55, lambda x, y: "4" if x < 24 else "3")    # door
    c.ell(23.5, 42, 4.5, 3, lambda x, y, d: "4" if x < 24 else "3")
    for y in (45, 50): c.rect(19, y, 28, y, "m")
    c.set(26, 48, "8")
    # pennant
    c.line(24, 0, 24, 9, "M")
    c.poly([(25, 0), (33, 2), (25, 5)], lambda x, y: "R" if y < 3 else "r")
    c.rect(5, 56, 43, 57, "s")
    return c

# ---- Riviera: a vine pergola with a café table.
def pergola():
    c = C(48, 52)
    # back posts (shorter, behind)
    for x in (8, 38): cyl(c, x, x + 2, 12, 34, ["P", "P", "t"])
    # beams on top
    c.rect(3, 8, 44, 10, "p"); c.rect(3, 11, 44, 11, "P")
    for x in range(5, 44, 4): c.rect(x, 5, x + 1, 13, "p")
    # vines over the top and hanging down
    for k in range(60):
        x = (k * 37) % 42 + 3; y = 4 + (k * 11) % 9
        c.set(x, y, "L" if k % 3 else "j"); c.set(x + 1, y, "l")
    for x0, n in ((4, 12), (12, 8), (20, 5), (30, 9), (40, 13)):
        for y in range(12, 12 + n): c.set(x0 + (y % 2), y, "L" if y % 3 else "l")
    for g in ((10, 14), (37, 16), (18, 12)):
        c.set(g[0], g[1], "x"); c.set(g[0] + 1, g[1], "r"); c.set(g[0], g[1] + 1, "r")
    # café table and two chairs
    c.ell(24, 36, 6, 2, lambda x, y, d: "p" if y < 36 else "P")
    c.line(24, 38, 24, 45, "M"); c.rect(21, 46, 27, 46, "m")
    for cx in (13, 34):
        c.rect(cx - 2, 38, cx + 2, 39, "U"); c.rect(cx - 2, 33, cx - 2, 45, "M"); c.rect(cx + 2, 40, cx + 2, 45, "m")
        c.rect(cx - 2, 33, cx + 2, 34, "v")
    c.ell(24, 34.5, 1.5, 1, "V")                                  # a carafe
    # front posts
    for x in (3, 42): cyl(c, x, x + 2, 12, 48, ["p", "p", "P"])
    # terracotta pots with lemon trees at the front corners
    for px_ in (1, 41):
        c.rect(px_, 47, px_ + 6, 51, lambda x, y: "C" if x < px_ + 4 else "c")
    return c

# ---- Atomic: a flying saucer on three legs.
def saucer():
    c = C(48, 48)
    for lx, ch in ((10, "M"), (24, "n"), (37, "m")):
        c.line(lx, 30, lx + (0 if lx == 24 else (-3 if lx < 24 else 3)), 45, ch)
        c.rect(lx - 2 + (0 if lx == 24 else (-3 if lx < 24 else 3)), 46, lx + 2 + (0 if lx == 24 else (-3 if lx < 24 else 3)), 46, "m")
    c.ell(24, 26, 22, 6, lambda x, y, d: ramp(["N", "n", "n", "M", "m"], x, 2, 47) if y >= 26 else ramp(["N", "N", "n", "M"], x, 2, 47))
    c.rect(3, 26, 45, 26, "w")
    for i, x in enumerate(range(6, 44, 5)):
        c.set(x, 28, "x" if i % 2 else "z"); c.set(x + 1, 28, "X" if i % 2 else "Z")
    c.ell(24, 21, 10, 7, lambda x, y, d: ("V" if x < 21 and y < 18 else "v") if y < 22 else "U", only=lambda x, y: y <= 22)
    c.ell(20, 16, 1.5, 1.2, "Q")
    c.line(24, 8, 24, 13, "m"); c.set(24, 7, "x")
    c.rect(14, 31, 34, 31, "z")
    return c

# ---- Gold Rush: a mine entrance in a rocky mound, with a cart of gold.
def mine():
    c = C(48, 50)
    c.poly([(0, 49), (4, 20), (14, 8), (26, 4), (38, 10), (46, 24), (47, 49)], lambda x, y: ramp(["t", "S", "S", "s", "s"], x, 0, 48))
    for k in range(30):
        x = (k * 29) % 44 + 2; y = 10 + (k * 17) % 36
        if c.get(x, y) != ".": c.set(x, y, "T" if k % 3 == 0 else "s")
    # timbered opening
    c.rect(13, 20, 34, 49, "K")
    c.rect(12, 18, 35, 20, "4"); c.rect(12, 21, 35, 21, "3")
    c.rect(12, 21, 14, 49, lambda x, y: "5" if x == 12 else "4"); c.rect(33, 21, 35, 49, lambda x, y: "4" if x == 33 else "3")
    c.set(16, 24, "q"); c.set(16, 25, "7")
    # rails
    for y in range(34, 50, 3): c.rect(16 + (49 - y) // 6, y, 31 - (49 - y) // 6, y, "3")
    c.line(18, 34, 15, 49, "n"); c.line(29, 34, 32, 49, "n")
    # cart
    c.poly([(16, 36), (31, 36), (29, 45), (18, 45)], lambda x, y: ramp(["n", "M", "m"], x, 16, 32))
    c.rect(16, 36, 31, 36, "N")
    c.ell(23.5, 35, 7, 3, lambda x, y, d: "9" if (x + y) % 3 else "0", only=lambda x, y: y <= 36)
    c.rect(18, 46, 20, 47, "m"); c.rect(27, 46, 29, 47, "m")
    c.poly([(38, 49), (40, 46), (44, 46), (46, 49)], "4"); c.set(41, 45, "9")
    return c

# ---- Pirate: the bow of a wrecked galleon.
def wreck():
    c = C(48, 54)
    c.ell(24, 50, 23, 4, lambda x, y, d: "P" if (x + y) % 5 else "p")          # sand
    # hull: a bow seen head on, wider at the rail
    c.poly([(4, 20), (44, 20), (38, 44), (28, 51), (20, 51), (10, 44)], lambda x, y: ramp(["5", "4", "4", "3", "2"], x, 4, 45))
    for y in range(24, 50, 4):
        for x in range(0, 48):
            if c.get(x, y) in "2345": c.set(x, y, "3" if x < 24 else "2")
    c.rect(4, 19, 44, 20, "8"); c.rect(5, 21, 43, 21, "7")
    for x in (10, 20, 28, 37): c.rect(x, 27, x + 2, 29, "K"); c.set(x + 1, 28, "m")
    # figurehead
    c.poly([(22, 22), (26, 22), (27, 40), (21, 40)], lambda x, y: "9" if x < 24 else "8")
    c.ell(24, 21, 2.5, 2.5, "9")
    # broken mast and torn sail
    c.rect(22, 0, 25, 19, lambda x, y: "4" if x < 24 else "3")
    c.poly([(26, 2), (40, 4), (38, 14), (33, 12), (30, 16), (26, 14)], lambda x, y: "p" if x < 34 else "P")
    c.rect(14, 5, 34, 6, "3")
    c.line(4, 20, 22, 2, "2"); c.line(44, 20, 26, 2, "2")
    c.set(35, 9, "K"); c.set(31, 7, "K")
    return c

for f in (arch, turret, pergola, saucer, mine, wreck):
    S["big_" + f.__name__] = (f().rows(), {})
