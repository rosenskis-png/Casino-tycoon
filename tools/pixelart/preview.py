# Preview sprites as a PNG (ink outline added, on the carpet color), to look at before exporting.
# Usage (from the repo root): python3 tools/pixelart/preview.py <module> <out.png> [sprite keys...] [--scale N]
#   module: a file in tools/pixelart/sprites (without .py). Keys default to every sprite in it (frames included).
import os, sys, importlib
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "sprites")]
from px import png, load_palette

args = sys.argv[1:]
scale = 4
if "--scale" in args:
    k = args.index("--scale"); scale = int(args[k + 1]); del args[k:k + 2]
mod = importlib.import_module(args[0])
keys = args[2:] or list(mod.S)
pal = load_palette(os.path.join(HERE, "..", "..", "src", "data", "art.ts"))
png(args[1], [mod.S[k] for k in keys], pal, scale=scale)
print("wrote", args[1], keys)
