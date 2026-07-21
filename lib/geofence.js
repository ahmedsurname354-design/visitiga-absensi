export function calculateDistance(lat1, lon1, lat2, lon2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const R = 6371e3;
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = toRadians(lat2 - lat1);
  const Δλ = toRadians(lon2 - lon1);
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isWithinOfficeRadius(userLat, userLon) {
  const officeLat = -6.9147;
  const officeLon = 107.6558;
  const distance = calculateDistance(userLat, userLon, officeLat, officeLon);
  return {
    distance,
    isInside: distance <= 200,
  };
}
