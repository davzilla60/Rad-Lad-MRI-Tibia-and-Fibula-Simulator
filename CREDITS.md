# Credits

## MRI imaging

**Adapted from:** Vivekanandan, J. N., & Usman, J. B. (2026). *A Three-Dimensional Lower Extremity Musculoskeletal
Geometry Model of An Asian Male* [Dataset]. Universiti Malaya Research Data Repository.
<https://doi.org/10.22452/RD/5T6TZ7> — released under **CC0 1.0 Universal (public domain)**; credited here for the
record.

One healthy adult male volunteer, right lower limb from hip to foot, acquired as multi-station **3D sagittal**
volumes and shared as DICOM exported from 3D Slicer (scanner model and field strength not recorded in the files).
Series used:

- `RT T1 VIBE SAG DIXON_IN` — 3D T1 VIBE Dixon, in-phase (1.15 × 1.15 × 1.2 mm) → the **T1** images
- `RT T2 FS SPC SAG L-LIMB` — 3D T2 SPACE with fat saturation (1.07 × 1.07 × 1.1 mm) → the **T2 FS** images

The volunteer had no injury. The clinical request in the simulator (a runner with shin pain) is fictional.

### Changes made

1. **Cropped** to the slab from about 40 mm above the top of the patella to about 60 mm below the ankle joint
   (through the talus and upper calcaneus): 505 mm, with the crop faces perpendicular to the tibial shaft. Nothing
   above or below that slab is used anywhere in the simulator.
2. **Station seam flattened.** The scanner joined two table stations at mid-shin, leaving the lower station about
   1.4–1.7× brighter. A smooth per-level gain (measured from the soft-tissue level above and below the join) evens
   it out.
3. **Reconstructions.** The axial, coronal and sagittal series are **reformatted** from the 3D volumes (trilinear,
   slab-averaged), in the orientation a radiographer would plan them: axial perpendicular to the tibia (the shaft
   leans 5.5° — the ankle lies further back than the knee), coronal parallel to the posterior femoral condyles
   (−11.3° on the axial: the leg lies slightly rolled out), sagittal perpendicular to that, with coronal and sagittal
   following the tibia. Coronal + sagittal: 3 mm every 3.6 mm, 520 mm FOV at 416 px. Axial: 5 mm every 6 mm
   (84 slices), 220 mm FOV at 320 px.
4. **The 3-plane localiser is synthesised.** The study's own localiser wasn't stored. Three straight localiser images
   (sagittal, coronal, axial) were rebuilt from the 3D T1: 8 mm slab average, 500 mm FOV, 256 matrix, 62 %
   rectangular phase FOV on the sagittal and coronal, coil shading and Rician noise.
5. Pixel values were windowed to 8-bit and saved as JPEG (series) and PNG (localisers).
6. The geometry of every image (position, orientation, pixel size) is kept in `assets/calib.json` and drives the
   planning overlays. Thirteen landmarks (patella, suprapatellar pouch, knee joint, fibular head, tibial tuberosity,
   mid tibia and fibula, back of the calf, ankle joint, both malleoli, talus) were picked by hand (±5 mm).
7. In the browser: the localiser k-space animation is a real Fourier transform of the localiser images; each scan
   shows the reconstructed slices that fall inside your stack, cropped to your FOV. Your exact angle doesn't
   re-slice the volume — the reference-orientation slices are shown, and your angle is graded against the reference
   (±10°). The leg position doesn't change the images.
8. The 3-D room shows a generic closed-bore magnet, not the real system.
9. Sequences other than T1 and T2 FS are listed for teaching only. There are no images for them.

Educational simulation. It isn't a medical device and isn't for clinical use.
