/**
 * The guided tour: a scripted flight from the Sun out through the solar system
 * and on to the nearest stars, with a line of narration at each stop.
 */

export interface TourStop {
  /** Which view the stop takes place in. */
  system: 'sol' | 'exo' | 'galaxy';
  /** Body to focus, when in a system view. */
  node?: string;
  /** Star to select, when in the galaxy view or when entering an exo system. */
  star?: string;
  caption: string;
  seconds: number;
  /** Multiplier on the default framing distance, or an absolute distance in the galaxy view. */
  distanceScale?: number;
  rateIndex?: number;
  schematic?: boolean;
  habitable?: boolean;
}

export const TOUR: TourStop[] = [
  {
    system: 'sol', node: 'sun', seconds: 9, distanceScale: 2.4, rateIndex: 8, schematic: true,
    caption: 'The Sun. Everything else here orbits it, and together all of it amounts to about a tenth of one percent of the system’s mass.',
  },
  {
    system: 'sol', node: 'mercury', seconds: 8, distanceScale: 3, rateIndex: 6,
    caption: 'Mercury completes an orbit in 88 days, but turns on its axis only three times in every two of them.',
  },
  {
    system: 'sol', node: 'venus', seconds: 8, distanceScale: 3,
    caption: 'Venus, wrapped in sulfuric acid cloud at ninety atmospheres and 464 °C. It rotates backwards, and slower than it orbits.',
  },
  {
    system: 'sol', node: 'earth', seconds: 10, distanceScale: 2.6, rateIndex: 5, habitable: true,
    caption: 'Earth, in the narrow band of orbits where water stays liquid — shown here in green.',
  },
  {
    system: 'sol', node: 'earth/moon', seconds: 8, distanceScale: 3.5, habitable: false,
    caption: 'The Moon is a quarter of Earth’s diameter, large enough that the two are almost a double planet.',
  },
  {
    system: 'sol', node: 'mars', seconds: 8, distanceScale: 3, rateIndex: 7,
    caption: 'Mars: a cold desert with the tallest volcano and the deepest canyon in the solar system.',
  },
  {
    system: 'sol', node: 'ceres', seconds: 8, distanceScale: 60, rateIndex: 8,
    caption: 'Between Mars and Jupiter, a belt of rubble — swept into gaps at every orbit that resonates with Jupiter.',
  },
  {
    system: 'sol', node: 'jupiter', seconds: 10, distanceScale: 3.2,
    caption: 'Jupiter holds two and a half times the mass of every other planet combined. The Great Red Spot is a storm wider than Earth.',
  },
  {
    system: 'sol', node: 'jupiter/io', seconds: 8, distanceScale: 4,
    caption: 'Io is squeezed by Jupiter’s tides until it melts — the most volcanically active world we know of.',
  },
  {
    system: 'sol', node: 'saturn', seconds: 11, distanceScale: 3.4,
    caption: 'Saturn’s rings span 280,000 km and average about ten metres thick. Watch their shadow fall across the planet.',
  },
  {
    system: 'sol', node: 'uranus', seconds: 8, distanceScale: 3.5, rateIndex: 9,
    caption: 'Uranus was knocked onto its side. Each pole spends 42 years in daylight, then 42 in dark.',
  },
  {
    system: 'sol', node: 'neptune', seconds: 8, distanceScale: 3.5,
    caption: 'Neptune was found by mathematics before it was seen. It drives 2,100 km/h winds on 1/900th of Earth’s sunlight.',
  },
  {
    system: 'sol', node: 'pluto', seconds: 8, distanceScale: 4,
    caption: 'Pluto, on a 248-year orbit tilted out of the plane, with nitrogen glaciers and 3 km mountains of water ice.',
  },
  {
    system: 'sol', node: 'sedna', seconds: 9, distanceScale: 1.5, rateIndex: 12,
    caption: 'Sedna reaches 937 au from the Sun on an 11,400-year orbit. Nothing we know of could have put it there.',
  },
  {
    system: 'galaxy', star: 'sol', seconds: 10, distanceScale: 30,
    caption: 'Pulling back: every star within 27 light years, at its real position. The plane of the Milky Way is the grid.',
  },
  {
    system: 'galaxy', star: 'Proxima Centauri', seconds: 9, distanceScale: 3,
    caption: 'Proxima Centauri, 4.25 light years away — the nearest star to the Sun, and far too faint to see with the naked eye.',
  },
  {
    system: 'exo', star: 'Proxima Centauri', node: 'p0', seconds: 11, habitable: true, rateIndex: 4,
    caption: 'Proxima b orbits every 11 days, inside the habitable zone of a star that would take a telescope to find.',
  },
  {
    system: 'galaxy', star: "Barnard's star", seconds: 9, distanceScale: 3, habitable: false,
    caption: 'Barnard’s Star, six light years out, crossing our sky faster than any other star. Four planets were confirmed there in 2024 and 2025.',
  },
  {
    system: 'galaxy', star: 'sol', seconds: 9, distanceScale: 24,
    caption: 'Sixty-one systems with known planets lie within this bubble — and those are only the ones we have managed to detect.',
  },
];
