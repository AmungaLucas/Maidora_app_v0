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
  try {
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (places && places.length > 0) {
      const p = places[0];
      // Compose e.g. "Nairobi, Utawala" from whatever the geocoder gives us.
      const parts = [p.district || p.subregion, p.city || p.region].filter(Boolean);
      const unique = [...new Set(parts)];
      locationName = unique.join(', ');
      if (!locationName && p.name) locationName = p.name;
      if (!locationName && p.country) locationName = p.country;
    }
  } catch {
    // Reverse geocoding can fail (no Play Services, offline). The field stays editable.
  }

  return { latitude, longitude, locationName };
}

// Silent auto-fill: returns a fix ONLY when permission is ALREADY granted.
// Never prompts, never throws — an un-granted/offline state simply returns
// null and the field stays manual. The explicit "Use my current location"
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
