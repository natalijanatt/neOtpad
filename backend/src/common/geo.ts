import { sql } from 'kysely';

/** A WGS84 point as the CSV sources write it. */
export interface Tacka {
  lat: number;
  lon: number;
}

/**
 * A `geography(Point,4326)` literal for an insert.
 *
 * Longitude first: `st_makepoint` takes x before y, and the whole dataset sits
 * within one degree of itself, so a swap produces plausible-looking points a few
 * hundred kilometres away in Bulgaria.
 */
export function toPoint(tacka: Tacka | null) {
  if (tacka === null) {
    return null;
  }

  return sql<string>`extensions.st_setsrid(extensions.st_makepoint(${tacka.lon}, ${tacka.lat}), 4326)::extensions.geography`;
}

/**
 * The inverse for a select: a `geography` column back to a lat/lon pair.
 *
 * `geography` has no accessor of its own, hence the cast; the SRID is 4326
 * throughout, so x/y are longitude/latitude and nothing is reprojected. Use as
 * `.select([...latLon('sm.lokacija')])`.
 */
export function latLon(column: string) {
  return [
    sql<number>`extensions.st_y(${sql.ref(column)}::extensions.geometry)`.as('lat'),
    sql<number>`extensions.st_x(${sql.ref(column)}::extensions.geometry)`.as('lon'),
  ] as const;
}

/** Point in EWKB; the low two bytes of the type word carry the geometry type. */
const EWKB_POINT = 1;
/** High bit of the type word: an SRID follows the type instead of the coordinates. */
const EWKB_SRID_FLAG = 0x20000000;

/**
 * The read side of `toPoint`: a `geography(Point,4326)` selected as-is comes back
 * as an EWKB hex string, which is what `kysely-codegen` types as `string`.
 *
 * Decoded here rather than pushed into every query as `ST_X`/`ST_Y`, because a
 * repository that forgets the pair returns an opaque hex blob that type-checks
 * perfectly and renders as a broken map. Reading the bytes is ~20 lines and makes
 * `SELECT tacka` mean what it looks like it means.
 */
export function fromPoint(value: string | null | undefined): Tacka | null {
  if (value === null || value === undefined || value.length === 0) {
    return null;
  }

  const bytes = Buffer.from(value, 'hex');
  // 1 byte order + 4 type + 2 * 8 coordinate = 21 without an SRID.
  if (bytes.length < 21) {
    throw new Error(`not an EWKB point: ${value.slice(0, 32)}`);
  }

  const littleEndian = bytes.readUInt8(0) === 1;
  const type = littleEndian ? bytes.readUInt32LE(1) : bytes.readUInt32BE(1);

  if ((type & 0xffff) !== EWKB_POINT) {
    throw new Error(`expected an EWKB point, got geometry type ${type & 0xffff}`);
  }

  // PostGIS writes the SRID for geography; the geometry cast may drop it, so the
  // offset is read from the flag rather than assumed.
  const offset = (type & EWKB_SRID_FLAG) === EWKB_SRID_FLAG ? 9 : 5;
  const lon = littleEndian ? bytes.readDoubleLE(offset) : bytes.readDoubleBE(offset);
  const lat = littleEndian ? bytes.readDoubleLE(offset + 8) : bytes.readDoubleBE(offset + 8);

  return { lat, lon };
}
