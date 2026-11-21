"""Independent optimal-cross reference (HTM), written separately from src/analyzer.

Usage:
  python cross_reference.py "<scramble>" ...          # print optimal cross length per face
  python cross_reference.py --fixture N SEED OUT.json # write N random cases for the vitest suite
  python cross_reference.py --verify IN.json          # check {scramble, face, solution} items solve the cross
"""
import sys
from collections import deque

# Kociemba edge numbering: UR UF UL UB DR DF DL DB FR FL BL BR
UR, UF, UL, UB, DR, DF, DL, DB, FR, FL, BL, BR = range(12)
BASE = {
    "U": ([UB, UR, UF, UL, DR, DF, DL, DB, FR, FL, BL, BR], [0] * 12),
    "R": ([FR, UF, UL, UB, BR, DF, DL, DB, DR, FL, BL, UR], [0] * 12),
    "F": ([UR, FL, UL, UB, DR, FR, DL, DB, UF, DF, BL, BR], [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0]),
    "D": ([UR, UF, UL, UB, DF, DL, DB, DR, FR, FL, BL, BR], [0] * 12),
    "L": ([UR, UF, BL, UB, DR, DF, FL, DB, FR, UL, DL, BR], [0] * 12),
    "B": ([UR, UF, UL, BR, DR, DF, DL, BL, FR, FL, UB, DB], [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1]),
}


def compose(a, b):
    aep, aeo = a
    bep, beo = b
    return ([aep[bep[i]] for i in range(12)], [(aeo[bep[i]] + beo[i]) % 2 for i in range(12)])


MOVES = {}
for f, m in BASE.items():
    s = ([*range(12)], [0] * 12)
    for k, suf in enumerate(["", "2", "'"]):
        s = compose(s, m)
        MOVES[f + suf] = s

TRACK = (DR, DF, DL, DB)


def project(state):
    ep, eo = state
    pos = {}
    for p in range(12):
        if ep[p] in TRACK:
            pos[ep[p]] = (p, eo[p])
    return tuple(pos[t] for t in TRACK)


def apply_proj(key, move):
    # rebuild a partial full state from projection
    ep = [-1] * 12
    eo = [0] * 12
    for t, (p, o) in zip(TRACK, key):
        ep[p] = t
        eo[p] = o
    mep, meo = MOVES[move]
    nep = [ep[mep[i]] for i in range(12)]
    neo = [(eo[mep[i]] + meo[i]) % 2 for i in range(12)]
    out = {}
    for p in range(12):
        if nep[p] in TRACK:
            out[nep[p]] = (p, neo[p])
    return tuple(out[t] for t in TRACK)


INV = {m: (m[0] + ("'" if len(m) == 1 else ("2" if m[1] == "2" else ""))) for m in MOVES}

solved = tuple((t, 0) for t in TRACK)
dist = {solved: 0}
q = deque([solved])
while q:
    k = q.popleft()
    for m in MOVES:
        n = apply_proj(k, m)
        if n not in dist:
            dist[n] = dist[k] + 1
            q.append(n)

MAPS = {  # relabel so that the named face becomes D
    "D": {},
    "U": {"U": "D", "D": "U", "F": "B", "B": "F"},
    "F": {"F": "D", "D": "B", "B": "U", "U": "F"},
    "B": {"B": "D", "D": "F", "F": "U", "U": "B"},
    "R": {"R": "D", "D": "L", "L": "U", "U": "R"},
    "L": {"L": "D", "D": "R", "R": "U", "U": "L"},
}


def solve(key):
    sol = []
    while dist[key]:
        for m in MOVES:
            n = apply_proj(key, m)
            if dist[n] == dist[key] - 1:
                sol.append(m)
                key = n
                break
    return sol


def cross_lengths(scr):
    res = {}
    for face, mp in MAPS.items():
        key = solved
        for mv in scr.split():
            mv = mp.get(mv[0], mv[0]) + mv[1:]
            key = apply_proj(key, mv)
        res[face] = (dist[key], " ".join(solve(key)))
    return res


def random_scramble(rng, length=25):
    faces = "UDRLFB"
    out, prev = [], None
    while len(out) < length:
        f = rng.choice(faces)
        if f == prev:
            continue
        prev = f
        out.append(f + rng.choice(["", "'", "2"]))
    return " ".join(out)


if __name__ == "__main__":
    import json
    import random

    if sys.argv[1:2] == ["--fixture"]:
        n, seed, out = int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
        rng = random.Random(seed)
        cases = []
        for _ in range(n):
            scr = random_scramble(rng)
            cases.append({"scramble": scr, "optimal": {f: d for f, (d, _) in cross_lengths(scr).items()}})
        with open(out, "w", encoding="utf-8") as fh:
            json.dump({"generator": "tests/reference/cross_reference.py", "seed": seed, "cases": cases}, fh, indent=1)
        print(f"wrote {n} cases to {out}")
    elif sys.argv[1:2] == ["--verify"]:
        items = json.load(open(sys.argv[2], encoding="utf-8"))
        bad = 0
        for it in items:
            d = cross_lengths(it["scramble"] + " " + it["solution"])[it["face"]][0]
            if d != 0:
                bad += 1
                print("NOT SOLVED:", it)
        print(f"checked {len(items)} solutions, not solved: {bad}")
        sys.exit(1 if bad else 0)
    else:
        for scr in sys.argv[1:]:
            print(scr)
            for face, (d, s_) in cross_lengths(scr).items():
                print(f"  {face}-cross: {d}  ({s_}  [in relabeled frame])")
