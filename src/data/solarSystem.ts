/**
 * The Solar System.
 *
 * Orbits for the eight planets are JPL's approximate Keplerian elements. Two
 * element sets are carried: Table 1, valid 1800–2050, and Table 2a with its
 * extra outer-planet terms, valid 3000 BC – 3000 AD. The propagator picks
 * whichever covers the date being shown.
 *   https://ssd.jpl.nasa.gov/planets/approx_pos.html
 *
 * Orbits for dwarf planets, asteroids and comets are osculating elements from
 * the JPL Small-Body Database, each carried with its own epoch:
 *   https://ssd-api.jpl.nasa.gov/doc/sbdb.html
 *
 * Physical parameters follow the NASA/NSSDC planetary fact sheets. Moon
 * elements are mean values from the JPL planetary satellite tables.
 */
import type { Body, Moon, SmallBody, WideElements } from './types';

/** Astronomical unit, km. */
export const AU_KM = 149_597_870.7;
/** Julian date of the J2000.0 epoch. */
export const J2000 = 2451545.0;

export const SUN = {
  id: 'sun',
  name: 'Sun',
  radius: 695_700,
  mass: 1_988_500,
  rotation: 609.12,
  tilt: 7.25,
  /** Photospheric effective temperature, K. */
  temp: 5772,
  blurb:
    'A G2V main-sequence star holding 99.86% of the mass of the solar system. ' +
    'Fusion in its core converts 600 million tonnes of hydrogen every second, ' +
    'and the light you are looking at left the photosphere 8 minutes and 20 seconds ago.',
  facts: [
    ['Spectral type', 'G2V'],
    ['Surface temperature', '5,772 K'],
    ['Core temperature', '15.7 million K'],
    ['Luminosity', '3.828 × 10²⁶ W'],
    ['Age', '4.6 billion years'],
    ['Rotation (equator)', '25.4 days'],
  ] as [string, string][],
};

const moon = (
  name: string, radius: number, a: number, period: number, inclination: number,
  color: number, style: Moon['style'], note: string, ecc = 0,
): Moon => ({ name, radius, a, period, inclination, ecc, color, style, note });

export const PLANETS: Body[] = [
  {
    id: 'mercury',
    name: 'Mercury',
    kind: 'planet',
    radius: 2439.7,
    mass: 0.33,
    rotation: 1407.6,
    tilt: 0.034,
    temp: 167,
    moonCount: 0,
    style: 'cratered',
    color: 0x8c8378,
    elements: { a: 0.38709927, e: 0.20563593, i: 7.00497902, L: 252.2503235, peri: 77.45779628, node: 48.33076593 },
    rates: { a: 0.00000037, e: 0.00001906, i: -0.00594749, L: 149472.67411175, peri: 0.16047689, node: -0.12534081 },
    blurb:
      'The smallest planet and the fastest, sprinting around the Sun in 88 days. ' +
      'Locked in a 3:2 spin–orbit resonance, it turns exactly three times on its axis ' +
      'for every two orbits, so a single solar day lasts two Mercurian years.',
    facts: [
      ['Solar day', '176 Earth days'],
      ['Day / night range', '430 °C to −180 °C'],
      ['Surface gravity', '3.7 m/s²'],
      ['Atmosphere', 'Trace exosphere'],
      ['Core', '~85% of its radius'],
    ],
  },
  {
    id: 'venus',
    name: 'Venus',
    kind: 'planet',
    radius: 6051.8,
    mass: 4.87,
    rotation: -5832.5,
    tilt: 177.36,
    temp: 464,
    moonCount: 0,
    style: 'clouded',
    color: 0xd8c39a,
    atmosphere: 0xffe0a8,
    atmosphereDensity: 1.0,
    elements: { a: 0.72333566, e: 0.00677672, i: 3.39467605, L: 181.9790995, peri: 131.60246718, node: 76.67984255 },
    rates: { a: 0.0000039, e: -0.00004107, i: -0.0007889, L: 58517.81538729, peri: 0.00268329, node: -0.27769418 },
    blurb:
      'Earth’s twin in size and its opposite in every other way. A runaway greenhouse ' +
      'of carbon dioxide holds the surface at 464 °C — hot enough to melt lead — under ' +
      'ninety atmospheres of pressure. It rotates backwards, and so slowly that its day ' +
      'is longer than its year.',
    facts: [
      ['Surface pressure', '92 bar'],
      ['Rotation', 'Retrograde, 243 days'],
      ['Cloud composition', 'Sulfuric acid'],
      ['Surface age', '~500 million years'],
      ['Brightest object', 'After the Sun and Moon'],
    ],
  },
  {
    id: 'earth',
    name: 'Earth',
    kind: 'planet',
    radius: 6371.0,
    mass: 5.97,
    rotation: 23.9345,
    tilt: 23.44,
    temp: 15,
    moonCount: 1,
    style: 'terrestrial',
    color: 0x2b6cb0,
    atmosphere: 0x6ab8ff,
    atmosphereDensity: 0.85,
    elements: { a: 1.00000261, e: 0.01671123, i: -0.00001531, L: 100.46457166, peri: 102.93768193, node: 0.0 },
    rates: { a: 0.00000562, e: -0.00004392, i: -0.01294668, L: 35999.37244981, peri: 0.32327364, node: 0.0 },
    moons: [
      moon('Moon', 1737.4, 384_400, 27.3217, 5.145, 0xbfbfbf, 'cratered',
        'Large enough relative to Earth that the pair is nearly a double planet. It stabilises Earth’s axial tilt and is receding 3.8 cm per year.', 0.0549),
    ],
    blurb:
      'The only place in this catalog — or any other — known to carry life. Liquid water ' +
      'covers 71% of the surface, an oxygen atmosphere scatters blue light across the sky, ' +
      'and plate tectonics keeps recycling the crust.',
    facts: [
      ['Atmosphere', '78% N₂, 21% O₂'],
      ['Ocean coverage', '71% of surface'],
      ['Magnetic field', '~25–65 μT'],
      ['Age', '4.54 billion years'],
      ['Known life forms', 'All of them'],
    ],
  },
  {
    id: 'mars',
    name: 'Mars',
    kind: 'planet',
    radius: 3389.5,
    mass: 0.642,
    rotation: 24.6229,
    tilt: 25.19,
    temp: -65,
    moonCount: 2,
    style: 'desert',
    color: 0xc1502e,
    atmosphere: 0xd98b5f,
    atmosphereDensity: 0.25,
    elements: { a: 1.52371034, e: 0.0933941, i: 1.84969142, L: -4.55343205, peri: -23.94362959, node: 49.55953891 },
    rates: { a: 0.00001847, e: 0.00007882, i: -0.00813131, L: 19140.30268499, peri: 0.44441088, node: -0.29257343 },
    moons: [
      moon('Phobos', 11.267, 9376, 0.31891, 1.093, 0x8a7a6d, 'cratered',
        'Orbits below synchronous altitude and is spiralling in; in ~50 million years it will break up into a ring.', 0.0151),
      moon('Deimos', 6.2, 23_463, 1.26244, 0.93, 0x9a8b7c, 'cratered',
        'The smaller, outer moon. From the Martian surface it takes 2.7 days to cross the sky.', 0.0002),
    ],
    blurb:
      'A cold desert world of iron oxide dust, carrying the largest volcano in the solar ' +
      'system (Olympus Mons, 21.9 km high) and a canyon that would span the continental ' +
      'United States. Ancient river deltas record water that flowed billions of years ago.',
    facts: [
      ['Surface pressure', '0.006 bar'],
      ['Atmosphere', '95% CO₂'],
      ['Olympus Mons', '21.9 km tall'],
      ['Valles Marineris', '4,000 km long'],
      ['Active missions', 'Perseverance, Curiosity'],
    ],
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    kind: 'planet',
    radius: 69_911,
    mass: 1898,
    rotation: 9.925,
    tilt: 3.13,
    temp: -110,
    moonCount: 95,
    style: 'gasGiant',
    color: 0xd8b48c,
    atmosphere: 0xe8c9a0,
    atmosphereDensity: 0.6,
    elements: { a: 5.202887, e: 0.04838624, i: 1.30439695, L: 34.39644051, peri: 14.72847983, node: 100.47390909 },
    rates: { a: -0.00011607, e: -0.00013253, i: -0.00183714, L: 3034.74612775, peri: 0.21252668, node: 0.20469106 },
    rings: { inner: 1.4, outer: 1.81 },
    moons: [
      moon('Io', 1821.6, 421_800, 1.769, 0.04, 0xd9c86a, 'volcanic',
        'The most volcanically active body known. Tidal flexing from Jupiter drives 400 active volcanoes and plumes 300 km high.'),
      moon('Europa', 1560.8, 671_100, 3.551, 0.47, 0xc9b8a0, 'ice',
        'A cracked ice shell over a salty ocean holding twice the water of all Earth’s oceans. A prime target in the search for life.'),
      moon('Ganymede', 2634.1, 1_070_400, 7.155, 0.2, 0x9b9186, 'ice',
        'The largest moon in the solar system — bigger than Mercury — and the only one with its own magnetic field.'),
      moon('Callisto', 2410.3, 1_882_700, 16.689, 0.19, 0x6e6459, 'cratered',
        'The most heavily cratered object known; its surface has gone essentially unchanged for four billion years.'),
    ],
    blurb:
      'A failed star of a planet: 318 Earth masses, mostly hydrogen and helium, with no ' +
      'solid surface to land on. The Great Red Spot is a storm wider than Earth that has ' +
      'been turning for at least 190 years. Its gravity shepherds the asteroid belt.',
    facts: [
      ['Mass', '318 Earths, 2.5× all others'],
      ['Day length', '9 h 56 m — fastest planet'],
      ['Great Red Spot', '~1.3× Earth’s diameter'],
      ['Magnetosphere', '20,000× Earth’s strength'],
      ['Known moons', '95 confirmed'],
    ],
  },
  {
    id: 'saturn',
    name: 'Saturn',
    kind: 'planet',
    radius: 58_232,
    mass: 568,
    rotation: 10.656,
    tilt: 26.73,
    temp: -140,
    moonCount: 274,
    style: 'gasGiant',
    color: 0xe0c9a0,
    atmosphere: 0xf0dcb4,
    atmosphereDensity: 0.5,
    elements: { a: 9.53667594, e: 0.05386179, i: 2.48599187, L: 49.95424423, peri: 92.59887831, node: 113.66242448 },
    rates: { a: -0.0012506, e: -0.00050991, i: 0.00193609, L: 1222.49362201, peri: -0.41897216, node: -0.28867794 },
    rings: { inner: 1.24, outer: 2.27 },
    moons: [
      moon('Mimas', 198.2, 185_540, 0.942, 1.57, 0xa8a49e, 'cratered',
        'Herschel crater spans a third of its diameter, giving it an unmistakable resemblance to a certain battle station.', 0.0196),
      moon('Enceladus', 252.1, 238_040, 1.37, 0.009, 0xf0f4f7, 'ice',
        'Vents water plumes from a subsurface ocean through south-polar fractures — and those plumes feed Saturn’s E ring.'),
      moon('Tethys', 531.1, 294_670, 1.888, 1.12, 0xd6d2cb, 'ice', 'Almost pure water ice, scarred by the 2,000 km Ithaca Chasma.'),
      moon('Dione', 561.4, 377_420, 2.737, 0.019, 0xc8c4bd, 'ice', 'Bright ice cliffs — once mistaken for wispy clouds — streak its trailing hemisphere.'),
      moon('Rhea', 763.8, 527_070, 4.518, 0.345, 0xbdb9b2, 'ice', 'Saturn’s second largest moon, and possibly the only moon with a ring system of its own.'),
      moon('Titan', 2574.7, 1_221_870, 15.945, 0.33, 0xd9a441, 'clouded',
        'The only moon with a substantial atmosphere, and the only world besides Earth with liquid on its surface — lakes of methane and ethane.', 0.0288),
      moon('Iapetus', 734.5, 3_560_840, 79.33, 15.47, 0x8f8577, 'ice',
        'One hemisphere is as dark as coal, the other as bright as snow, with an equatorial ridge 13 km high running between them.', 0.0283),
    ],
    blurb:
      'The ring system spans 280,000 km yet averages only about 10 metres thick — ' +
      'billions of ice particles from grains to house-sized boulders. Saturn is less ' +
      'dense than water, and its hexagonal north-polar jet stream has no known analogue.',
    facts: [
      ['Ring span', '~280,000 km'],
      ['Ring thickness', '~10 m average'],
      ['Density', '0.687 g/cm³ — floats on water'],
      ['North pole', 'Persistent hexagonal jet'],
      ['Known moons', '274 confirmed (2025)'],
    ],
  },
  {
    id: 'uranus',
    name: 'Uranus',
    kind: 'planet',
    radius: 25_362,
    mass: 86.8,
    rotation: -17.24,
    tilt: 97.77,
    temp: -195,
    moonCount: 28,
    style: 'iceGiant',
    color: 0x9fd8e0,
    atmosphere: 0xb8ecf2,
    atmosphereDensity: 0.55,
    elements: { a: 19.18916464, e: 0.04725744, i: 0.77263783, L: 313.23810451, peri: 170.9542763, node: 74.01692503 },
    rates: { a: -0.00196176, e: -0.00004397, i: -0.00242939, L: 428.48202785, peri: 0.40805281, node: 0.04240589 },
    rings: { inner: 1.64, outer: 2.0, tilt: 0 },
    moons: [
      moon('Miranda', 235.8, 129_900, 1.413, 4.34, 0xb4b0aa, 'ice',
        'A patchwork world with a 20 km cliff, Verona Rupes — the tallest known in the solar system.'),
      moon('Ariel', 578.9, 190_900, 2.52, 0.26, 0xc6c2bb, 'ice', 'The brightest of the Uranian moons, resurfaced by past geological activity.'),
      moon('Umbriel', 584.7, 266_000, 4.144, 0.13, 0x6f6b66, 'cratered', 'The darkest, marked by the mysteriously bright ring of Wunda crater.'),
      moon('Titania', 788.9, 436_300, 8.706, 0.34, 0xa9a49d, 'ice', 'The largest Uranian moon, cut by canyon systems over 1,600 km long.'),
      moon('Oberon', 761.4, 583_500, 13.46, 0.06, 0x968f88, 'cratered', 'The outermost major moon, its craters floored with unexplained dark material.'),
    ],
    blurb:
      'Knocked onto its side by an ancient collision, Uranus rolls around its orbit at a ' +
      '98° tilt — each pole spends 42 years in continuous sunlight, then 42 in darkness. ' +
      'Methane in the upper atmosphere absorbs red light, leaving the pale cyan.',
    facts: [
      ['Axial tilt', '97.8° — rotates on its side'],
      ['Season length', '21 Earth years'],
      ['Coldest temperature', '−224 °C, coldest measured'],
      ['Rings', '13 known, discovered 1977'],
      ['Visits', 'Voyager 2, 1986 — once'],
    ],
  },
  {
    id: 'neptune',
    name: 'Neptune',
    kind: 'planet',
    radius: 24_622,
    mass: 102,
    rotation: 16.11,
    tilt: 28.32,
    temp: -200,
    moonCount: 16,
    style: 'iceGiant',
    color: 0x3b62c4,
    atmosphere: 0x5f8bff,
    atmosphereDensity: 0.6,
    elements: { a: 30.06992276, e: 0.00859048, i: 1.77004347, L: -55.12002969, peri: 44.96476227, node: 131.78422574 },
    rates: { a: 0.00026291, e: 0.00005105, i: 0.00035372, L: 218.45945325, peri: -0.32241464, node: -0.00508664 },
    rings: { inner: 1.7, outer: 2.54 },
    moons: [
      moon('Triton', 1353.4, 354_759, -5.877, 156.885, 0xc4c9c8, 'ice',
        'Orbits backwards, which means it was captured from the Kuiper Belt. Nitrogen geysers erupt from a surface at −235 °C.'),
      moon('Proteus', 210, 117_647, 1.122, 0.075, 0x76716b, 'cratered', 'About as large as a body can be while staying irregular rather than spherical.'),
      moon('Nereid', 170, 5_513_400, 360.13, 7.23, 0x8a857e, 'cratered',
        'One of the most eccentric orbits of any moon — from 1.4 to 9.6 million km out.', 0.7507),
    ],
    blurb:
      'Found in 1846 by mathematics before anyone looked: irregularities in Uranus’s ' +
      'orbit predicted exactly where to point the telescope. Despite receiving 1/900th of ' +
      'Earth’s sunlight it drives the fastest winds in the solar system, past 2,000 km/h.',
    facts: [
      ['Discovery', 'Predicted, then observed, 1846'],
      ['Wind speeds', 'Up to 2,100 km/h'],
      ['Orbital period', '164.8 years'],
      ['Internal heat', '2.6× the energy it receives'],
      ['Visits', 'Voyager 2, 1989 — once'],
    ],
  },
];

/** Dwarf planets, major asteroids and two well-known comets. */
export const SMALL_BODIES: SmallBody[] = [
  {
    id: 'ceres', name: 'Ceres', kind: 'dwarf', radius: 469.7, rotation: 9.07417,
    color: 0x8c8880, style: 'cratered',
    orbit: { epoch: 2461200.5, a: 2.765552595, e: 0.079692295, i: 10.588027802, node: 80.24862682, argPeri: 73.29421453, M0: 274.419346376, period: 1679.85312 },
    blurb: 'The largest object in the asteroid belt and the only dwarf planet inside Neptune’s orbit. A quarter of its mass may be water ice, and bright salt deposits in Occator crater come from briny water reaching the surface.',
    facts: [['Diameter', '939 km'], ['Share of belt mass', '~25%'], ['Discovered', '1801, as a planet'], ['Visited by', 'Dawn, 2015–2018']],
  },
  {
    id: 'pallas', name: 'Pallas', kind: 'asteroid', radius: 256.5, rotation: 7.8132,
    color: 0x807a70, style: 'rock',
    orbit: { epoch: 2461200.5, a: 2.769559011, e: 0.2307001, i: 34.932793219, node: 172.88661934, argPeri: 310.96991617, M0: 254.249652174, period: 1683.50481 },
    blurb: 'The third largest asteroid, on an orbit tilted a steep 35° out of the ecliptic — which is why no spacecraft has ever visited it.',
    facts: [['Diameter', '513 km'], ['Inclination', '34.9°'], ['Discovered', '1802']],
  },
  {
    id: 'vesta', name: 'Vesta', kind: 'asteroid', radius: 261.4, rotation: 5.342128,
    color: 0xa39b8c, style: 'rock',
    orbit: { epoch: 2461200.5, a: 2.361365965, e: 0.090203744, i: 7.143925545, node: 103.70129327, argPeri: 151.46864782, M0: 81.190156077, period: 1325.38904 },
    blurb: 'Bright enough to be seen with the naked eye, and the source of about 5% of all meteorites that fall on Earth — chipped off by a giant impact at its south pole.',
    facts: [['Diameter', '523 km'], ['Albedo', '0.42 — unusually bright'], ['Rheasilvia crater', '505 km across'], ['Visited by', 'Dawn, 2011–2012']],
  },
  {
    id: 'hygiea', name: 'Hygiea', kind: 'asteroid', radius: 203.6, rotation: 13.828,
    color: 0x5f5a54, style: 'rock',
    orbit: { epoch: 2461200.5, a: 3.150974034, e: 0.106709274, i: 3.829529946, node: 283.11989275, argPeri: 312.42423873, M0: 252.034424236, period: 2042.98728 },
    blurb: 'The fourth largest asteroid, and round enough that it may qualify as a dwarf planet — which would make it the smallest one known.',
    facts: [['Diameter', '407 km'], ['Type', 'Dark carbonaceous'], ['Discovered', '1849']],
  },
  {
    id: 'pluto', name: 'Pluto', kind: 'dwarf', radius: 1188.3, rotation: -153.2935,
    color: 0xc4a68a, style: 'ice',
    orbit: { epoch: 2457588.5, a: 39.588629385, e: 0.251837878, i: 17.14771141, node: 110.29238405, argPeri: 113.70900152, M0: 38.683663473, period: 90981.71648 },
    moons: [
      moon('Charon', 606, 19_591, 6.3872, 0.08, 0xa8a096, 'ice',
        'Half Pluto’s diameter. The two are mutually tidally locked, each permanently facing the other across 19,591 km.'),
    ],
    blurb: 'Reclassified in 2006, then revealed in 2015 as one of the most geologically alive worlds out there: nitrogen glaciers flowing across Sputnik Planitia, water-ice mountains 3 km high, and a layered blue haze in the sky.',
    facts: [['Diameter', '2,377 km'], ['Orbital period', '248 years'], ['Surface', 'Nitrogen, methane, CO ice'], ['Moons', '5'], ['Visited by', 'New Horizons, 2015']],
  },
  {
    id: 'haumea', name: 'Haumea', kind: 'dwarf', radius: 780, rotation: 3.9154,
    color: 0xd8d4cc, style: 'ice',
    orbit: { epoch: 2461200.5, a: 43.060290237, e: 0.194443015, i: 28.20847393, node: 121.78605613, argPeri: 240.69054725, M0: 223.210411881, period: 103208.11734 },
    blurb: 'Spinning once every four hours, fast enough to have stretched itself into an ellipsoid roughly twice as long as it is wide. It has two moons and a ring.',
    facts: [['Shape', 'Ellipsoid, ~2,100 × 1,000 km'], ['Rotation', '3.9 hours'], ['Rings', '1, found in 2017'], ['Moons', 'Hiʻiaka and Namaka']],
  },
  {
    id: 'makemake', name: 'Makemake', kind: 'dwarf', radius: 715, rotation: 22.8266,
    color: 0xbf8f78, style: 'ice',
    orbit: { epoch: 2461200.5, a: 45.570933173, e: 0.158888995, i: 29.027856037, node: 79.29483382, argPeri: 297.09227334, M0: 169.937996205, period: 112364.80688 },
    blurb: 'A methane-ice world in the Kuiper Belt, reddened by sunlight-processed organics. Its discovery, along with Eris, forced the 2006 debate over what counts as a planet.',
    facts: [['Diameter', '1,430 km'], ['Surface', 'Methane and ethane ice'], ['Orbital period', '306 years'], ['Moons', '1, found in 2016']],
  },
  {
    id: 'eris', name: 'Eris', kind: 'dwarf', radius: 1163, rotation: 25.9,
    color: 0xd0cfc9, style: 'ice',
    orbit: { epoch: 2461200.5, a: 67.933946879, e: 0.438238535, i: 43.925827947, node: 36.00477044, argPeri: 150.79492358, M0: 211.774434275, period: 204516.66294 },
    blurb: 'Marginally smaller than Pluto but 27% more massive. Finding it is what got Pluto demoted. At aphelion it is 97 au out, where its nitrogen atmosphere freezes onto the ground as snow.',
    facts: [['Diameter', '2,326 km'], ['Orbital period', '560 years'], ['Distance range', '38–97 au'], ['Moon', 'Dysnomia']],
  },
  {
    id: 'sedna', name: 'Sedna', kind: 'dwarf', radius: 500, rotation: 10.273,
    color: 0xa8503c, style: 'ice',
    orbit: { epoch: 2461200.5, a: 543.719528910, e: 0.859882459, i: 11.925275828, node: 144.50616627, argPeri: 311.09877259, M0: 358.595694401, period: 4630851.18359 },
    blurb: 'One of the most distant known objects, on an 11,400-year orbit reaching 937 au. Nothing in the known solar system could have put it there — its orbit is evidence of something else, past or present.',
    facts: [['Orbital period', '~11,400 years'], ['Aphelion', '937 au'], ['Perihelion', '76 au'], ['Colour', 'Among the reddest known']],
  },
  {
    id: 'halley', name: '1P/Halley', kind: 'comet', radius: 5.5, rotation: 52.8,
    color: 0x4a4640, style: 'rock',
    orbit: { epoch: 2439875.5, a: 17.928635049, e: 0.967935996, i: 162.190530044, node: 59.09894721, argPeri: 112.24143146, M0: 274.382337137, period: 27728.04609 },
    blurb: 'The first comet recognised as periodic, returning every 75 years or so. Records of it go back to 240 BC. It last passed perihelion in 1986 and will return in 2061.',
    facts: [['Period', '~75 years'], ['Next perihelion', '2061'], ['Orbit', 'Retrograde, 162° inclination'], ['Nucleus', '15 × 8 km']],
  },
  {
    id: 'churyumov', name: '67P/Churyumov–Gerasimenko', kind: 'comet', radius: 1.7, rotation: 12.76129,
    color: 0x55504a, style: 'rock',
    orbit: { epoch: 2457305.5, a: 3.46224949, e: 0.640908131, i: 7.040294907, node: 50.1355738, argPeri: 12.79824973, M0: 8.859927419, period: 2353.07607 },
    blurb: 'The rubber-duck-shaped comet that Rosetta orbited for two years, and where the Philae lander touched down in 2014 — the first landing on a comet nucleus.',
    facts: [['Period', '6.44 years'], ['Shape', 'Two lobes, contact binary'], ['Density', '0.53 g/cm³ — mostly void'], ['Mission', 'Rosetta, 2014–2016']],
  },
];

/**
 * JPL Table 2a — elements valid 3000 BC – 3000 AD — with the Table 2b terms
 * that correct the outer planets' mean anomaly over that span. These are less
 * accurate than Table 1 near the present day, so the propagator only reaches
 * for them outside 1800–2050.
 */
export const WIDE_ELEMENTS: Record<string, WideElements> = {
  mercury: {
    elements: { a: 0.38709843, e: 0.20563661, i: 7.00559432, L: 252.25166724, peri: 77.45771895, node: 48.33961819 },
    rates: { a: 0.0, e: 0.00002123, i: -0.00590158, L: 149472.67486623, peri: 0.15940013, node: -0.12214182 },
  },
  venus: {
    elements: { a: 0.72332102, e: 0.00676399, i: 3.39777545, L: 181.9797085, peri: 131.76755713, node: 76.67261496 },
    rates: { a: -0.00000026, e: -0.00005107, i: 0.00043494, L: 58517.8156026, peri: 0.05679648, node: -0.27274174 },
  },
  earth: {
    elements: { a: 1.00000018, e: 0.01673163, i: -0.00054346, L: 100.46691572, peri: 102.93005885, node: -5.11260389 },
    rates: { a: -0.00000003, e: -0.00003661, i: -0.01337178, L: 35999.37306329, peri: 0.3179526, node: -0.24123856 },
  },
  mars: {
    elements: { a: 1.52371243, e: 0.09336511, i: 1.85181869, L: -4.56813164, peri: -23.91744784, node: 49.71320984 },
    rates: { a: 0.00000097, e: 0.00009149, i: -0.00724757, L: 19140.29934243, peri: 0.45223625, node: -0.26852431 },
  },
  jupiter: {
    elements: { a: 5.20248019, e: 0.0485359, i: 1.29861416, L: 34.33479152, peri: 14.27495244, node: 100.29282654 },
    rates: { a: -0.00002864, e: 0.00018026, i: -0.00322699, L: 3034.90371757, peri: 0.18199196, node: 0.13024619 },
    outer: { b: -0.00012452, c: 0.0606406, s: -0.35635438, f: 38.35125 },
  },
  saturn: {
    elements: { a: 9.54149883, e: 0.05550825, i: 2.49424102, L: 50.07571329, peri: 92.86136063, node: 113.63998702 },
    rates: { a: -0.00003065, e: -0.00032044, i: 0.00451969, L: 1222.11494724, peri: 0.54179478, node: -0.25015002 },
    outer: { b: 0.00025899, c: -0.13434469, s: 0.87320147, f: 38.35125 },
  },
  uranus: {
    elements: { a: 19.18797948, e: 0.0468574, i: 0.77298127, L: 314.20276625, peri: 172.43404441, node: 73.96250215 },
    rates: { a: -0.00020455, e: -0.0000155, i: -0.00180155, L: 428.49512595, peri: 0.09266985, node: 0.05739699 },
    outer: { b: 0.00058331, c: -0.97731848, s: 0.17689245, f: 7.67025 },
  },
  neptune: {
    elements: { a: 30.06952752, e: 0.00895439, i: 1.7700552, L: 304.22289287, peri: 46.68158724, node: 131.78635853 },
    rates: { a: 0.00006447, e: 0.00000818, i: 0.000224, L: 218.46515314, peri: 0.01009938, node: -0.00606302 },
    outer: { b: -0.00041348, c: 0.68346318, s: -0.10162547, f: 7.67025 },
  },
};

/** Julian dates bounding the validity of the Table 1 elements (1800 and 2050). */
export const TABLE1_RANGE: [number, number] = [2378497.0, 2469808.0];
