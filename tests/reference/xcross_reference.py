"""Independent optimal X-cross reference (HTM), written separately from src/analyzer.

X-cross = the 4 cross edges + one F2L pair (corner + edge) solved, in place.
Distances come from exact BFS tables (numpy) and an IDA* search whose heuristic is
max(cross+slot-edge table, cross+slot-corner table) -- both exact for their subsets,
so the search returns true optimal lengths.

Usage:
  python xcross_reference.py "<scramble>" ...          # per-slot optimal X-cross for the D face
  python xcross_reference.py --fixture N SEED OUT.json # random cases for the vitest suite
  python xcross_reference.py --verify IN.json          # check {scramble, face, slot, solution} items
"""
import json
import random
import sys

import numpy as np

# Kociemba numbering.
# Edges: UR UF UL UB DR DF DL DB FR FL BL BR ; Corners: URF UFL ULB UBR DFR DLF DBL DRB
UR, UF, UL, UB, DR, DF, DL, DB, FR, FL, BL, BR = range(12)
URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB = range(8)

EDGE_BASE = {
    "U": ([UB, UR, UF, UL, DR, DF, DL, DB, FR, FL, BL, BR], [0] * 12),
    "R": ([FR, UF, UL, UB, BR, DF, DL, DB, DR, FL, BL, UR], [0] * 12),
    "F": ([UR, FL, UL, UB, DR, FR, DL, DB, UF, DF, BL, BR], [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0]),
    "D": ([UR, UF, UL, UB, DF, DL, DB, DR, FR, FL, BL, BR], [0] * 12),
    "L": ([UR, UF, BL, UB, DR, DF, FL, DB, FR, UL, DL, BR], [0] * 12),
    "B": ([UR, UF, UL, BR, DR, DF, DL, BL, FR, FL, UB, DB], [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1]),
}
CORNER_BASE = {
    "U": ([UBR, URF, UFL, ULB, DFR, DLF, DBL, DRB], [0] * 8),
    "R": ([DFR, UFL, ULB, URF, DRB, DLF, DBL, UBR], [2, 0, 0, 1, 1, 0, 0, 2]),
    "F": ([UFL, DLF, ULB, UBR, URF, DFR, DBL, DRB], [1, 2, 0, 0, 2, 1, 0, 0]),
    "D": ([URF, UFL, ULB, UBR, DLF, DBL, DRB, DFR], [0] * 8),
    "L": ([URF, ULB, DBL, UBR, DFR, UFL, DLF, DRB], [0, 1, 2, 0, 0, 2, 1, 0]),
    "B": ([URF, UFL, UBR, DRB, DFR, DLF, ULB, DBL], [0, 0, 1, 2, 0, 0, 2, 1]),
}


def compose(a, b, mod):
    ap, ao = a
    bp, bo = b
    n = len(ap)
    return ([ap[bp[i]] for i in range(n)], [(ao[bp[i]] + bo[i]) % mod for i in range(n)])


MOVE_NAMES = []
EDGE_MOVES = {}
CORNER_MOVES = {}
for face in "URFDLB":
    e = (list(range(12)), [0] * 12)
    c = (list(range(8)), [0] * 8)
    for suffix in ["", "2", "'"]:
        e = compose(e, EDGE_BASE[face], 2)
        c = compose(c, CORNER_BASE[face], 3)
        name = face + suffix
        MOVE_NAMES.append(name)
        EDGE_MOVES[name] = e
        CORNER_MOVES[name] = c


def piece_maps(moves, n, mod):
    """For each move: code(pos, ori) of one piece -> code after the move."""
    maps = {}
    for name, (perm, ori) in moves.items():
        table = np.zeros(n * mod, dtype=np.int64)
        for i in range(n):
            p = perm[i]  # the piece at position p moves to position i
            for o in range(mod):
                table[p * mod + o] = i * mod + (o + ori[i]) % mod
        maps[name] = table
    return maps


EDGE_MAP = piece_maps(EDGE_MOVES, 12, 2)  # codes 0..23
CORNER_MAP = piece_maps(CORNER_MOVES, 8, 3)  # codes 0..23

CROSS_EDGES = [DR, DF, DL, DB]
SLOTS = {"FR": (DFR, FR), "FL": (DLF, FL), "BL": (DBL, BL), "BR": (DRB, BR)}
BASE = 24


def bfs_table(kinds, solved_digits):
    """Exact distance table over tracked pieces; kinds[k] is 'e' or 'c' per digit."""
    size = BASE ** len(kinds)
    dist = np.full(size, 255, dtype=np.uint8)
    weights = [BASE ** k for k in range(len(kinds))]
    start = sum(d * w for d, w in zip(solved_digits, weights))
    dist[start] = 0
    frontier = np.array([start], dtype=np.int64)
    depth = 0
    while frontier.size:
        depth += 1
        digits = [(frontier // w) % BASE for w in weights]
        nxt = []
        for name in MOVE_NAMES:
            code = np.zeros_like(frontier)
            for k, kind in enumerate(kinds):
                table = EDGE_MAP[name] if kind == "e" else CORNER_MAP[name]
                code += table[digits[k]] * weights[k]
            nxt.append(code)
        cand = np.unique(np.concatenate(nxt))
        cand = cand[dist[cand] == 255]
        dist[cand] = depth
        frontier = cand
    return dist


_TABLES = {}


CACHE_DIR = __import__("os").path.join(__import__("os").path.dirname(__file__), ".cache")


def tables_for(slot):
    import os

    if slot not in _TABLES:
        path = os.path.join(CACHE_DIR, f"xcross-{slot}.npz")
        if os.path.exists(path):
            data = np.load(path)
            _TABLES[slot] = (data["edge"], data["corner"])
        else:
            corner, edge = SLOTS[slot]
            cross = [e * 2 for e in CROSS_EDGES]
            _TABLES[slot] = (
                bfs_table(["e"] * 5, cross + [edge * 2]),
                bfs_table(["e"] * 4 + ["c"], cross + [corner * 3]),
            )
            os.makedirs(CACHE_DIR, exist_ok=True)
            np.savez_compressed(path, edge=_TABLES[slot][0], corner=_TABLES[slot][1])
    return _TABLES[slot]


def encode(digits):
    return sum(d * BASE**k for k, d in enumerate(digits))


MAPS = {  # relabel so that the named face becomes D (rotation; directions preserved)
    "D": {},
    "U": {"U": "D", "D": "U", "F": "B", "B": "F"},
    "F": {"F": "D", "D": "B", "B": "U", "U": "F"},
    "B": {"B": "D", "D": "F", "F": "U", "U": "B"},
    "R": {"R": "D", "D": "L", "L": "U", "U": "R"},
    "L": {"L": "D", "D": "R", "R": "U", "U": "L"},
}


def relabel(moves, face):
    mp = MAPS[face]
    return [mp.get(m[0], m[0]) + m[1:] for m in moves]


def tracked_after(moves, slot):
    """Codes of the 4 cross edges, slot edge and slot corner after applying moves from solved."""
    corner, edge = SLOTS[slot]
    edges = [e * 2 for e in CROSS_EDGES] + [edge * 2]
    c = corner * 3
    for m in moves:
        edges = [int(EDGE_MAP[m][x]) for x in edges]
        c = int(CORNER_MAP[m][c])
    return edges, c


def solve_xcross(moves_in_d_frame, slot, max_depth=14):
    et, ct = tables_for(slot)
    edges, corner = tracked_after(moves_in_d_frame, slot)

    def h(es, c):
        return max(et[encode(es)], ct[encode(es[:4] + [c])])

    path = []

    def dfs(es, c, g, bound, last):
        f = g + h(es, c)
        if f > bound:
            return f
        if h(es, c) == 0:
            return -1
        best = 999
        for m in MOVE_NAMES:
            if last and m[0] == last[0]:
                continue
            if last and {m[0], last[0]} in ({"U", "D"}, {"R", "L"}, {"F", "B"}) and m[0] in "DLB":
                continue  # canonical order for commuting opposite faces
            nes = [int(EDGE_MAP[m][x]) for x in es]
            nc = int(CORNER_MAP[m][c])
            path.append(m)
            t = dfs(nes, nc, g + 1, bound, m)
            if t == -1:
                return -1
            path.pop()
            best = min(best, t)
        return best

    bound = h(edges, corner)
    while bound <= max_depth:
        t = dfs(edges, corner, 0, bound, None)
        if t == -1:
            return len(path), " ".join(path)
        bound = t
    return None, None


def xcross_lengths(scramble):
    """{face: {slot: optimal length}} where slots are named in that face's D frame."""
    out = {}
    for face in MAPS:
        moves = relabel(scramble.split(), face)
        out[face] = {slot: solve_xcross(moves, slot)[0] for slot in SLOTS}
    return out


def random_scramble(rng, length=25):
    out, prev = [], None
    while len(out) < length:
        f = rng.choice("UDRLFB")
        if f == prev:
            continue
        prev = f
        out.append(f + rng.choice(["", "'", "2"]))
    return " ".join(out)


if __name__ == "__main__":
    if sys.argv[1:2] == ["--fixture"]:
        n, seed, path = int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
        rng = random.Random(seed)
        cases = []
        for i in range(n):
            scr = random_scramble(rng)
            d_slots = {slot: solve_xcross(scr.split(), slot)[0] for slot in SLOTS}
            best_by_face = {
                face: min(solve_xcross(relabel(scr.split(), face), slot)[0] for slot in SLOTS)
                for face in MAPS
            }
            cases.append({"scramble": scr, "dSlots": d_slots, "bestByFace": best_by_face})
            print(i, d_slots, best_by_face, flush=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"generator": "tests/reference/xcross_reference.py", "seed": seed,
                       "metric": "HTM", "cases": cases}, fh, indent=1)
    elif sys.argv[1:2] == ["--verify"]:
        items = json.load(open(sys.argv[2], encoding="utf-8"))
        bad = 0
        for it in items:
            moves = relabel((it["scramble"] + " " + it["solution"]).split(), it["face"])
            edges, c = tracked_after(moves, it["slot"])
            et, ct = tables_for(it["slot"])
            if et[encode(edges)] != 0 or ct[encode(edges[:4] + [c])] != 0:
                bad += 1
                print("NOT SOLVED:", it)
        print(f"checked {len(items)} solutions, not solved: {bad}")
        sys.exit(1 if bad else 0)
    else:
        for scr in sys.argv[1:]:
            print(scr)
            for slot in SLOTS:
                print(" ", slot, solve_xcross(scr.split(), slot))
