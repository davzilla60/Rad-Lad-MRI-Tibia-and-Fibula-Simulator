"""Build ../assets from the tibia + fibula MRI (Prometheus "MRI/Tibia and fibula/Patient 2", DICOM.zip).

    python -I tools/gen_assets.py "<folder holding the unzipped DICOM/ folder>"

Source: a whole right lower limb (hip to toes) acquired as multi-station 3D SAGITTAL volumes (T1 VIBE Dixon and
T2 SPACE ± fat sat, ~1.1 mm isotropic), exported by 3D Slicer (scanner tags stripped).
What this script does:
  * CROP: keeps only the slab from ~40 mm above the top of the patella to ~60 mm below the ankle joint (through
    the talus and the upper calcaneus). The crop faces are perpendicular to the tibial shaft, 505 mm apart.
  * STATION SEAM: the scanner joined two table stations at mid-shin with a ~1.4x brightness step; this is
    flattened with a smooth per-level gain (documented in the credits).
  * RECONSTRUCTIONS: AXIAL, CORONAL and SAGITTAL stacks are reformatted (trilinear, slab-averaged) from the 3D
    volumes, in the orientation a radiographer would plan: axial perpendicular to the tibia, coronal parallel to the
    posterior condylar line of the knee, sagittal perpendicular to that; coronal + sagittal follow the tibial shaft.
  * LOCALISER: a straight 3-plane localiser is SYNTHESISED (8 mm slab, 256 matrix, 500 mm FOV, coil shading,
    noise, reduced phase FOV) - the study's own localiser wasn't stored.
Writes loc_*.png, <series>_NN.jpg and calib.json / calib.js. All coordinates are DICOM patient (LPS) millimetres.
"""
import sys, os, glob, json
import numpy as np, pydicom, cv2
from scipy.ndimage import map_coordinates, gaussian_filter1d, median_filter

ROOT = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")
QA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "qa")
os.makedirs(OUT, exist_ok=True); os.makedirs(QA, exist_ok=True)
rng = np.random.default_rng(11)
NAMES = {"t1": "RT T1 VIBE SAG DIXON_IN", "t2fs": "RT T2 FS SPC SAG L-LIMB"}
ZLO, ZHI = -775.0, -220.0                       # native rows kept in memory (crop margin)

def unit(a): a = np.asarray(a, float); return a / np.linalg.norm(a)

# ------------------------------------------------------------------ native 3D sagittal volumes
def load_native(key):
    fs = sorted(glob.glob(os.path.join(ROOT, "DICOM", NAMES[key], "*")))
    hs = [pydicom.dcmread(f) for f in fs]
    hs.sort(key=lambda h: float(h.ImagePositionPatient[0]))
    assert [round(float(v), 4) for v in hs[0].ImageOrientationPatient] == [0, 1, 0, 0, 0, -1]
    xs = np.array([float(h.ImagePositionPatient[0]) for h in hs]); assert np.all(np.diff(xs) > 0)
    y0, z0, ps = float(hs[0].ImagePositionPatient[1]), float(hs[0].ImagePositionPatient[2]), float(hs[0].PixelSpacing[0])
    for h in hs: assert abs(float(h.ImagePositionPatient[1]) - y0) < 1e-3 and abs(float(h.ImagePositionPatient[2]) - z0) < 1e-3
    r0, r1 = int((z0 - ZHI) / ps), int((z0 - ZLO) / ps) + 1
    v = np.stack([h.pixel_array[r0:r1] for h in hs]).astype(np.float32)        # [x slice, row (-z), col (+y)]
    nat = dict(v=v, xs=xs, y0=y0, z0=z0 - r0 * ps, ps=ps)
    seam_fix(nat, key)
    return nat

def seam_fix(nat, key):
    """Two table stations meet at mid-shin; the lower one is ~1.4x brighter. Flatten the step with a per-level gain:
    1 above the blend zone, the measured ratio below it, and level-matched inside it."""
    v, ps, z0 = nat["v"], nat["ps"], nat["z0"]
    zr = z0 - np.arange(v.shape[1]) * ps
    thr = 0.3 * np.percentile(v, 99.5)
    m = np.array([np.median(v[:, r][v[:, r] > thr]) if np.any(v[:, r] > thr) else np.nan for r in range(v.shape[1])])
    m = median_filter(np.nan_to_num(m), size=13)
    za, zb = -462.0, -528.0
    hi = np.median(m[(zr < -440) & (zr > za)]); lo = np.median(m[(zr < zb) & (zr > -560)])
    ratio = hi / lo
    f = np.ones_like(zr); f[zr <= zb] = ratio
    mid = (zr < za) & (zr > zb); f[mid] = hi / np.maximum(m[mid], 1e-3)
    f = gaussian_filter1d(f, 3)
    v *= f[None, :, None]
    print(key, "seam gain below %.0f mm: x%.3f" % (zb, ratio))

def sample(nat, P):
    fi = np.interp(P[..., 0], nat["xs"], np.arange(len(nat["xs"])), left=-10, right=len(nat["xs"]) + 10)
    fr = (nat["z0"] - P[..., 2]) / nat["ps"]; fc = (P[..., 1] - nat["y0"]) / nat["ps"]
    return map_coordinates(nat["v"], [fi, fr, fc], order=1, mode="constant", cval=0.0)

NAT = {k: load_native(k) for k in NAMES}

# ------------------------------------------------------------------ anatomy (picked on 1 mm axial / sagittal reformats of the T1)
# tibial centres along the shaft -> the long axis
TIB = np.array([[-61.0, 22.5, -400], [-63.0, 32.5, -500], [-62.5, 45.0, -600], [-61.0, 45.0, -650]])
c0 = TIB.mean(0); _, _, vt = np.linalg.svd(TIB - c0); LUP = unit(vt[0] * np.sign(vt[0][2]))      # superior along the tibia
A0 = c0 + LUP * ((-497.5 - c0[2]) / LUP[2])                                                    # axis point at mid-crop
S_HALF = 252.5                                                                                  # crop: ±252.5 mm along the axis
COND = -11.3        # posterior condylar line at the knee (deg from +x toward +y on the axial): the coronal reference
def keep(P):        # inside the crop slab (1 mm soft edge)
    s = (P - A0) @ LUP
    return np.clip((S_HALF - np.abs(s)) + 0.5, 0, 1)

def planes_frame(t_deg):
    t = np.radians(t_deg)
    u = unit(np.array([np.cos(t), np.sin(t), 0]) - LUP * (np.array([np.cos(t), np.sin(t), 0]) @ LUP))
    v = unit(-(LUP - u * (LUP @ u)))
    return u, v, np.cross(u, v)
UC, VC, NC = planes_frame(COND)                 # coronal: u right (patient left), v down the tibia, n posterior
US, VS, NS = NC, VC, np.cross(NC, VC)           # sagittal: u posterior, v down the tibia, n lateral (patient right)
UA = unit(np.array([1.0, 0, 0]) - LUP * LUP[0]); VA = np.cross(LUP, UA); NA = LUP   # axial: perpendicular to the tibia
print("tibial axis (superior):", LUP.round(4), "tilt from z %.1f deg" % np.degrees(np.arccos(LUP[2])), "A0", A0.round(1))

def to8(a, hi): return np.clip(a / hi * 255, 0, 255).astype(np.uint8)
HI = {}
for k, nat in NAT.items():
    HI[k] = float(np.percentile(nat["v"][nat["v"] > 0], 99.6 if k == "t1" else 99.2))

# ------------------------------------------------------------------ reconstructions
def recon(key, ctr, u, v, n, N, fov, thk, sp, count):
    ps = fov / N
    I, J = np.meshgrid(np.arange(N) - (N - 1) / 2, np.arange(N) - (N - 1) / 2)     # I along u (columns), J along v (rows)
    ipps, imgs = [], []
    first = ctr - n * sp * (count - 1) / 2
    for k in range(count):
        c = first + n * sp * k
        base = c + I[..., None] * ps * u + J[..., None] * ps * v
        acc = np.zeros((N, N), np.float32)
        offs = np.linspace(-thk / 2 + thk / 10, thk / 2 - thk / 10, 5)
        for t in offs:
            P = base + n * t
            acc += sample(NAT[key], P) * keep(P)
        imgs.append(acc / len(offs))
        ipps.append(c - u * ps * (N - 1) / 2 - v * ps * (N - 1) / 2)
    return imgs, ipps, ps

calib = {"ser": {}}
LEGC = A0 + np.array([6.0, 14.0, 0.0])          # middle of the leg cross-section (posterior + medial of the tibia)
STACKS = [  # id, src, task/plane, label, params, centre along n (from LEGC), u, v, n, N, FOV, thk, spacing, count, s/slice
    ("cor_t1",   "t1",   "cor", "T1",    "3D T1 VIBE (in-phase) · reformatted 3 mm",        UC, VC, NC, 416, 520, 3.0, 3.6, 48, 3.2),
    ("cor_t2fs", "t2fs", "cor", "T2 FS", "3D T2 SPACE fat sat · reformatted 3 mm",          UC, VC, NC, 416, 520, 3.0, 3.6, 48, 4.4),
    ("sag_t2fs", "t2fs", "sag", "T2 FS", "3D T2 SPACE fat sat · reformatted 3 mm",          US, VS, NS, 416, 520, 3.0, 3.6, 38, 4.4),
    ("sag_t1",   "t1",   "sag", "T1",    "3D T1 VIBE (in-phase) · reformatted 3 mm",        US, VS, NS, 416, 520, 3.0, 3.6, 38, 3.2),
    ("ax_t2fs",  "t2fs", "ax",  "T2 FS", "3D T2 SPACE fat sat · reformatted 5 mm / 6 mm",   UA, VA, NA, 320, 220, 5.0, 6.0, 84, 2.6),
    ("ax_t1",    "t1",   "ax",  "T1",    "3D T1 VIBE (in-phase) · reformatted 5 mm / 6 mm", UA, VA, NA, 320, 220, 5.0, 6.0, 84, 1.9),
]
for sid, src, plane, label, params, u, v, n, N, fov, thk, sp, cnt, spl in STACKS:
    ctr = LEGC.copy()
    if plane == "ax": ctr = A0 + UA * 4 + VA * 14
    if plane == "sag": ctr = LEGC + n * 4
    imgs, ipps, ps = recon(src, ctr, u, v, n, N, fov, thk, sp, cnt)
    for k, a in enumerate(imgs):
        cv2.imwrite(os.path.join(OUT, "%s_%02d.jpg" % (sid, k)), to8(a, HI[src]), [cv2.IMWRITE_JPEG_QUALITY, 82])
    calib["ser"][sid] = {"task": plane, "plane": plane, "seq": label, "params": params, "n": cnt,
                         "ipp": [[round(float(x), 2) for x in p] for p in ipps], "row": [round(float(x), 5) for x in u],
                         "col": [round(float(x), 5) for x in v], "ps": round(ps, 6), "cols": N, "rows": N,
                         "nrm": [round(float(x), 5) for x in n], "sp": sp, "thk": thk, "spl": spl, "pad": 2}
    print(sid, cnt, "slices")

# ------------------------------------------------------------------ synthetic 3-plane localiser (straight, at isocentre)
LOC_FOV, LN = 500.0, 256
LPS = LOC_FOV / LN
LOC_C = np.array([-58.0, 30.0, -497.5])
LOC = {   # plane: row dir, col dir, slice offset, phase axis (array axis), phase FOV
    "sag": (np.array([0, 1.0, 0]), np.array([0, 0, -1.0]), np.array([0, 0, 0.0]), 1, 0.62),
    "cor": (np.array([1.0, 0, 0]), np.array([0, 0, -1.0]), np.array([0, 5.0, 0]), 1, 0.62),
    "ax":  (np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, 17.5]), 0, 1.0),
}
calib["loc"] = {"n": LN, "fov": LOC_FOV}
for p, (r, c, off, phase, pf) in LOC.items():
    n = np.cross(r, c); ctr = LOC_C + off
    SS = 2; N2 = LN * SS
    I, J = np.meshgrid((np.arange(N2) + 0.5) / SS - LN / 2, (np.arange(N2) + 0.5) / SS - LN / 2)
    base = ctr + I[..., None] * r * LPS + J[..., None] * c * LPS
    img = np.mean([sample(NAT["t1"], base + n * t) * keep(base + n * t) for t in np.linspace(-3.5, 3.5, 6)], axis=0)
    img = cv2.resize(img.astype(np.float32), (LN, LN), interpolation=cv2.INTER_AREA)
    Pc = ctr + ((np.arange(LN) + 0.5) - LN / 2)[None, :, None] * r * LPS + ((np.arange(LN) + 0.5) - LN / 2)[:, None, None] * c * LPS
    # flexible arrays wrapped round the lower leg: brighter near the skin, fading beyond the coil ends
    dxy = np.hypot(Pc[..., 0] + 55, Pc[..., 1] - 45)
    coil = 0.72 + 0.28 * np.clip(dxy / 70, 0, 1) ** 1.5
    coil *= 0.55 + 0.45 * np.exp(-((Pc[..., 2] + 505) / 260) ** 4)
    img = img * coil
    img = gaussian_filter1d(img, 0.8, axis=phase)
    sig = 0.02 * np.percentile(img, 99.5)
    img = np.hypot(img + rng.normal(0, sig, img.shape), rng.normal(0, sig, img.shape))
    if pf < 1:
        band = np.abs(np.arange(LN) + 0.5 - LN / 2) <= LN * pf / 2
        img = img * (band[None, :] if phase == 1 else band[:, None])
    hi = np.percentile(img[img > 0], 99.6)
    cv2.imwrite(os.path.join(OUT, "loc_" + p + ".png"), np.clip((img / hi) ** 0.9 * 255, 0, 255).astype(np.uint8))
    ipp = ctr - r * LPS * LN / 2 - c * LPS * LN / 2 + (r + c) * LPS / 2
    calib["loc"][p] = {"ipp": [round(float(x), 2) for x in ipp], "row": r.tolist(), "col": c.tolist(), "ps": round(LPS, 6), "cols": LN, "rows": LN}

# ------------------------------------------------------------------ landmarks (±5 mm, picked on the T1 reformats)
calib["lm"] = {
    "conf": [round(float(x), 1) for x in LEGC],   # reference centre (mid-shin, mid-leg) used for "mm from centre" readouts
    "pat":  [-60.0, -25.0, -290.0],   # top (superior pole) of the patella
    "spp":  [-60.0, 5.0, -268.0],     # suprapatellar pouch / distal femur
    "kj":   [-55.0, 35.0, -355.0],    # knee joint (tibial plateau)
    "fh":   [-101.0, 57.0, -368.0],   # fibular head
    "tt":   [-57.0, -6.0, -392.0],    # tibial tuberosity (front)
    "tmid": [-63.0, 32.5, -500.0],    # mid tibial shaft
    "fmid": [-78.5, 67.5, -500.0],    # mid fibular shaft
    "calf": [-55.0, 102.0, -450.0],   # back of the calf (gastrocnemius)
    "aj":   [-58.0, 50.0, -690.0],    # ankle joint (tibial plafond)
    "mm":   [-36.0, 42.0, -700.0],    # medial malleolus
    "lm":   [-77.0, 68.0, -708.0],    # lateral malleolus tip
    "tal":  [-58.0, 56.0, -712.0],    # talar body
}
calib["real"] = {"cor": COND, "sag": round(COND + 90, 1), "lup": [round(float(x), 5) for x in LUP],
                 "tilt": round(float(np.degrees(np.arccos(LUP[2]))), 1), "a0": [round(float(x), 1) for x in A0], "half": S_HALF}
json.dump(calib, open(os.path.join(OUT, "calib.json"), "w"), indent=1)
open(os.path.join(OUT, "calib.js"), "w").write("window.MRS_CALIB=" + json.dumps(calib, separators=(",", ":")) + ";\n")

# ------------------------------------------------------------------ QA: landmarks drawn on the nearest reformat slices
def qa(sid, keys):
    s = calib["ser"][sid]; ipp = np.array(s["ipp"]); r = np.array(s["row"]); c = np.array(s["col"]); nrm = np.array(s["nrm"])
    tiles = []
    for key in keys:
        P = np.array(calib["lm"][key]); k = int(np.argmin(np.abs((P - ipp) @ nrm)))
        im = cv2.cvtColor(cv2.imread(os.path.join(OUT, "%s_%02d.jpg" % (sid, k)), 0), cv2.COLOR_GRAY2BGR)
        x, y = (P - ipp[k]) @ r / s["ps"], (P - ipp[k]) @ c / s["ps"]
        cv2.circle(im, (int(x), int(y)), 6, (0, 0, 255), 1); cv2.putText(im, key, (int(x) + 8, int(y)), 0, 0.45, (0, 255, 255), 1)
        tiles.append(im)
    cv2.imwrite(os.path.join(QA, "qa_" + sid + ".png"), np.hstack(tiles))
qa("sag_t1", ["pat", "kj", "tmid", "aj", "tal", "calf"])
qa("cor_t1", ["kj", "fh", "tmid", "fmid", "mm", "lm"])
qa("ax_t1", ["pat", "kj", "fh", "tmid", "aj", "tal"])
print("ok")
