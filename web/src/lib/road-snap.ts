/**
 * Road-snapping utility using the Mapbox Map Matching API.
 *
 * Takes an ordered list of stop coordinates and returns a road-snapped
 * LineString geometry ([lng, lat][] ) that follows the actual road network
 * between those points.
 *
 * The Map Matching API supports at most 100 waypoints per request, so routes
 * with more stops are split into overlapping chunks and rejoined.
 */

const MAX_WAYPOINTS = 100;
const SNAP_RADIUS_M  = 50; // metres — how far from a stop coord to search for the nearest road

type Coord = [number, number]; // [lng, lat]

interface MapMatchingResponse {
  code: string;
  message?: string;
  matchings?: Array<{
    geometry: { coordinates: Coord[]; type: string };
    confidence: number;
  }>;
}

async function matchChunk(coords: Coord[], token: string, profile: string): Promise<Coord[]> {
  const coordStr   = coords.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const radiusStr  = coords.map(() => SNAP_RADIUS_M).join(";");
  const url =
    `https://api.mapbox.com/matching/v5/mapbox/${profile}/${coordStr}` +
    `?geometries=geojson&overview=full&radiuses=${radiusStr}&access_token=${token}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Map Matching API returned HTTP ${res.status}`);
  }

  const data = (await res.json()) as MapMatchingResponse;

  if (data.code !== "Ok") {
    const reason =
      data.code === "NoMatch"           ? "No road found near one or more stops." :
      data.code === "TooManyCoordinates" ? "Too many stops in this segment." :
      data.code === "InvalidInput"       ? "Invalid stop coordinates." :
      (data.message ?? data.code);
    throw new Error(`Map Matching failed: ${reason}`);
  }

  const geometry = data.matchings?.[0]?.geometry;
  if (!geometry) {
    throw new Error("Map Matching returned no geometry for this segment.");
  }

  return geometry.coordinates;
}

/**
 * Snap an ordered list of stop coordinates to the road network.
 *
 * @param stops  Array of stops with [lng, lat] coords.
 * @param token  Mapbox public access token.
 * @returns      Road-snapped LineString coordinates suitable for `route.shape`.
 * @throws       Error with a human-readable message on API failure.
 */
export async function snapToRoads(
  stops: { coords: Coord }[],
  token: string,
  onProgress?: (pct: number) => void,
  profile = "driving",
): Promise<Coord[]> {
  if (stops.length < 2) {
    throw new Error("Need at least 2 stops to snap to roads.");
  }

  const coords = stops.map((s) => s.coords);
  onProgress?.(0);

  // Single request for short routes
  if (coords.length <= MAX_WAYPOINTS) {
    const result = await matchChunk(coords, token, profile);
    onProgress?.(100);
    return result;
  }

  // Chunk with 1-stop overlap so consecutive segments connect
  const totalChunks = Math.ceil((coords.length - 1) / (MAX_WAYPOINTS - 1));
  let chunkIdx = 0;
  const result: Coord[] = [];
  for (let i = 0; i < coords.length; i += MAX_WAYPOINTS - 1) {
    const chunk     = coords.slice(i, i + MAX_WAYPOINTS);
    const snapped   = await matchChunk(chunk, token, profile);
    chunkIdx++;
    onProgress?.(Math.round((chunkIdx / totalChunks) * 100));
    if (result.length === 0) {
      result.push(...snapped);
    } else {
      // Drop the first point of subsequent chunks — it duplicates the last
      // point of the previous chunk (the overlap stop).
      result.push(...snapped.slice(1));
    }
  }
  return result;
}
