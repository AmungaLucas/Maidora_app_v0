// Device location capture: foreground permission -> GPS fix -> reverse geocode.
import * as Location from 'expo-location';

export async function captureCurrentLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    const err = new Error('Location permission was denied. You can still type your location manually.');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const { latitude, longitude } = position.coords;

  let locationName = '';
  let locationCounty = null;
  let locationArea = null;
  try {
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (places && places.length > 0) {
      const p = places[0];
      // Display string, e.g. "Nairobi, Utawala" — unchanged.
      const parts = [p.district || p.subregion, p.city || p.region].filter(Boolean);
      const unique = [...new Set(parts)];
      locationName = unique.join(', ');
      if (!locationName && p.name) locationName = p.name;
      if (!locationName && p.country) locationName = p.country;

      // Structured pair (§4.1) — the users.location_county / location_area
      // columns used to stay NULL because nothing filled them (owner report
      // 2026-10-31). Best-effort GPS derivation: county ≈ city/region,
      // area ≈ district/subregion/neighborhood name. The guided county+area
      // picker (advice sent to the owner, awaiting go-ahead) remains the
      // authoritative source; this only pre-seeds the columns so GPS users
      // get structured location for free.
      const county = [p.city, p.region].find((v) => v && String(v).trim()) || null;
      const area = [p.district, p.subregion, p.name].find((v) => v && String(v).trim()) || null;
      locationCounty = county ? String(county).trim().slice(0, 120) : null;
      locationArea =
        area && (!county || String(area).trim().toLowerCase() !== String(county).toLowerCase())
          ? String(area).trim().slice(0, 120)
          : null;
    }
  } catch {
    // Reverse geocoding can fail (no Play Services, offline). The field stays editable.
  }

  return { latitude, longitude, locationName, locationCounty, locationArea };
}

// Silent auto-fill: returns a fix ONLY when permission is ALREADY granted.
// Never prompts, never throws — an un-granted/offline state simply returns
// null and the field stays manual. The explicit "Refresh my location"
// button remains the only thing that may trigger the OS permission dialog
// (owner request 2026-10-31: auto-fill without asking, permission is
// typically already granted from the login capture).
export async function fetchLocationIfPermitted() {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    return await captureCurrentLocation(); // permission granted → no prompt
  } catch {
    return null;
  }
}

// Signup auto-fill (owner request 2026-11-01 — "can it be automatic without
// necessarily pressing refresh my location?"): the ONE contextual place we
// ask for the permission ourselves. Already granted → silent capture (same
// as above). NEVER asked before (status 'undetermined' — fresh install /
// cleared storage) → show the OS dialog once, on a screen where the
// location field is visible so the ask has a reason to exist. DENIED →
// never re-prompt (the explicit button stays the manual re-ask); the field
// simply stays manual. Deliberately NOT an install-time permission wall —
// users deny blind multi-permission screens, and the store reviewers
// expect asks to be tied to the feature that needs them.
export async function autofillLocationAskingOnce() {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'granted') return await captureCurrentLocation();
    if (status === 'undetermined') {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status === 'granted') return await captureCurrentLocation();
    }
    return null; // denied / restricted — stay manual, no nagging
  } catch {
    return null;
  }
}
