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
