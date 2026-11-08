# MR-I Ready — Tibia + Fibula

An embeddable, single-file teaching simulator for the Rad-Lad website, built on the same engine and layout as the
MR-I Ready shoulder and MRCP simulators. Every diagnostic image is reformatted from **one real 3D MRI of a healthy
volunteer's right leg** (public-domain research data, see `CREDITS.md`), cropped to **above the patella → past the
ankle**, and shown with its true geometry. **It's a demonstration only.**

Marker: **Tibia the Best** — axial square to the tibia from above the patella to past the ankle, coronal parallel to
the posterior condyles, sagittal perpendicular to it, every plane knee joint to ankle joint, with the leg straight
and the foot supported in neutral.

## Flow

1. **Patient set-up.** Supine, **feet first** (only the legs go in the bore), two flexible arrays wrapped round the
   right lower leg from just above the knee to the ankle, skin marker over the tender point. Choose how the leg lies
   (the 3-D room changes pose):
   - leg straight, foot neutral, pads + sandbags — correct;
   - foot rolled outward, unsupported — motion and oblique anatomy;
   - knee bent over a wedge — the tibia tilts out of the bore axis and the arrays can't wrap the shin.
2. **Localiser.** A 3-plane localiser (500 mm FOV) is "acquired" line by line from its own k-space with an inverse
   FFT. It is **synthesised** from the volunteer's 3D T1 (the study's own localiser wasn't stored).
3. **Axial first.** Cover suprapatellar pouch → talus (~500 mm), FOV just wider than the leg; tilt it on the sagittal
   to stay square to the tibia (the shaft leans 5.5°).
4. **Coronal + sagittal** unlock once the axial is scanned. Drag (or tap) the axial from the tray onto the **AXIAL**
   panel to unlock the rotate handle — it opens at the femoral condyles. Coronal parallel to the posterior condylar
   line (reference −11.3°, the leg lies slightly rolled out, so straight fails), sagittal perpendicular (78.7°),
   graded ±10°. Both must hold tibia + fibula, both malleoli and both joints in a long FOV (~450–500 mm).
5. **Scan → images.** T1 and T2 FS in each plane; each scan shows the reconstructed slices inside your stack,
   cropped to your FOV.
6. **Debrief.** Coverage and angle per plan, position, hero images (the axial shows your coronal and sagittal against
   the condylar reference), a sequences-to-consider table and the marker.

CLI: `straight | rotated | flexed`, `load`, `loc`, `plan ax|cor|sag`, `auto`, `slices`, `thick`, `gap`, `fov`,
`angle`, `use <series>`, `restore <sag|cor|ax>`, `scan`, `back`, `finish`, `help`.

## Files

- `tibfib.embed.html` is the self-contained deliverable (~2.9 MB, every image inlined). `index.html` is an
  identical copy for one-drop hosting.
- `tibfib.html` + `app.js` + `room3d.js` + `assets/` are the editable sources. After editing, rebuild with
  `python inline.py`.
- `tools/gen_assets.py` rebuilds `assets/` (crop, seam fix, reconstructions, synthetic localiser, landmarks) from
  the unzipped `DICOM/` folder of the source study:
  `python -I tools/gen_assets.py "<folder holding DICOM/>"`.
- The 3-D room loads three.js 0.160 from jsDelivr; without it the set-up step falls back to a flat drawing.

Educational simulation — not a medical device, not for clinical use.
