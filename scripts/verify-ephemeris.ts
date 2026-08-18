/**
 * Checks the orbit propagator against JPL Horizons state vectors.
 *
 * Three epochs are covered so both element sets get exercised: one inside the
 * Table 1 window (1800–2050) and two far outside it, where the propagator
 * switches to JPL's wide-range Table 2a elements.
 *
 * Truth values are heliocentric ecliptic J2000 positions in au, pulled from
 * https://ssd.jpl.nasa.gov/api/horizons.api (planet barycenters, CENTER=500@10).
 *
 * Run with: npm run verify
 */
import { Vector3 } from 'three';
import { PLANETS, SMALL_BODIES } from '../src/data/solarSystem';
import { planetPosition, smallBodyPosition } from '../src/astro/kepler';
import { formatJD } from '../src/astro/time';

type Vec = [number, number, number];

interface Epoch {
  jd: number;
  /** Tolerance as a fraction of heliocentric distance. */
  tolerance: number;
  truth: Record<string, Vec>;
}

const EPOCHS: Epoch[] = [
  {
    // Inside the Table 1 window. JPL quotes its worst errors here for Jupiter
    // and Saturn, whose mutual perturbations the linear rates cannot capture.
    jd: 2461000.5,
    tolerance: 0.002,
    truth: {
      mercury: [1.464216804627782e-1, 2.724735587466777e-1, 8.837455252109664e-3],
      venus: [-6.138802093830288e-1, -3.797361881788587e-1, 3.020379452651512e-2],
      earth: [5.152731579527589e-1, 8.429997761217524e-1, -5.01875153324075e-5],
      mars: [-2.505207358986107e-1, -1.455052021293521e0, -2.434850530672322e-2],
      jupiter: [-1.394735965185506e0, 5.006305948632727e0, 1.0409092229994e-2],
      saturn: [9.523592151094132e0, 2.952606170121896e-2, -3.796069576666521e-1],
      uranus: [1.002046197776583e1, 1.67252144075036e1, -6.781473595881531e-2],
      neptune: [2.987519951261669e1, 3.894844998927692e-1, -6.964713180262483e-1],
      pluto: [1.911653358147217e1, -2.969359208459163e1, -2.350828904314857e0],
    },
  },
  {
    // 1000 AD — eight centuries before Table 1 starts.
    jd: 2086308.5,
    tolerance: 0.01,
    truth: {
      mercury: [0.1281872128039321, -0.4288702654074649, -0.04655669720393635],
      venus: [0.6576858440975004, 0.3025440224130178, -0.03512196655631051],
      earth: [-0.5029499905451746, 0.8456916495966592, 0.001882354863070985],
      mars: [-0.9345553548214414, 1.354225041144427, 0.05274919690572603],
      jupiter: [1.016239783012397, -5.095488170850702, -0.005287268343233862],
      saturn: [3.576457614959792, 8.272674204003351, -0.2948577321692734],
      uranus: [19.6960251407326, -3.762413432281226, -0.2752600061389334],
      neptune: [4.802879710216144, -29.84083814122479, 0.5039228244517212],
    },
  },
  {
    // 2900 AD — eight and a half centuries after it ends.
    jd: 2780270.5,
    tolerance: 0.01,
    truth: {
      mercury: [-0.374416176345009, -0.2037696932241751, 0.01660983019165133],
      venus: [-0.6885942042506906, 0.2039649472095044, 0.0424655153102567],
      earth: [-8.51641879933959e-2, 9.802595204107529e-1, -1.959492519504564e-3],
      mars: [-1.655037738258913, 0.1349438537262591, 0.04026796963088886],
      jupiter: [4.82519777041688, -1.22913431677864, -0.1003254319971782],
      saturn: [-3.145142484703002, -9.449035956270706, 0.2784371853919002],
      uranus: [-15.30943356994916, -10.30057160396517, 0.1597320287272861],
      neptune: [-1.102531677560651e1, 2.784473981787169e1, -3.19000158497585e-1],
    },
  },
];

/** The scene frame is (x, z, -y) relative to the ecliptic; undo it to compare. */
const sceneToEcliptic = (v: Vector3) => new Vector3(v.x, -v.z, v.y);

const AU_KM = 149_597_870.7;
let failures = 0;

for (const epoch of EPOCHS) {
  console.log(`\n${formatJD(epoch.jd)}   (JD ${epoch.jd})   tolerance ${(epoch.tolerance * 100).toFixed(1)}%`);
  console.log('  '.padEnd(12) + 'error (km)'.padStart(12) + 'of radius'.padStart(12));

  for (const [id, vec] of Object.entries(epoch.truth)) {
    const planet = PLANETS.find((p) => p.id === id);
    const small = SMALL_BODIES.find((b) => b.id === id);
    const got = sceneToEcliptic(
      planet ? planetPosition(planet, epoch.jd) : smallBodyPosition(small!.orbit, epoch.jd),
    );
    const want = new Vector3(...vec);
    const relative = got.distanceTo(want) / want.length();
    const ok = relative <= epoch.tolerance;
    if (!ok) failures++;
    console.log(
      `  ${(planet?.name ?? small!.name).padEnd(10)}` +
      `${(got.distanceTo(want) * AU_KM).toFixed(0).padStart(12)}` +
      `${(relative * 100).toFixed(4).padStart(11)}%  ${ok ? 'ok' : 'FAIL'}`,
    );
  }
}

console.log(failures === 0 ? '\nAll positions within tolerance.' : `\n${failures} position(s) out of tolerance.`);
process.exit(failures === 0 ? 0 : 1);
