/**
 * Memperhitungkan jarak antara dua titik koordinat (Haversine Formula) dalam satuan meter.
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  // Parsing ke number untuk mencegah error jika input berupa String
  const pLat1 = parseFloat(lat1);
  const pLon1 = parseFloat(lon1);
  const pLat2 = parseFloat(lat2);
  const pLon2 = parseFloat(lon2);

  if (isNaN(pLat1) || isNaN(pLon1) || isNaN(pLat2) || isNaN(pLon2)) {
    return Infinity;
  }

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const R = 6371e3; // Radius bumi dalam meter

  const φ1 = toRadians(pLat1);
  const φ2 = toRadians(pLat2);
  const Δφ = toRadians(pLat2 - pLat1);
  const Δλ = toRadians(pLon2 - pLon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c); // Hasil jarak dibulatkan dalam meter
}

/**
 * Memeriksa apakah user berada dalam radius 130 meter dari Kantor PT Visitiga Media.
 */
export function isWithinOfficeRadius(userLat, userLon) {
  if (userLat == null || userLon == null) {
    return {
      distance: null,
      isInside: false,
    };
  }

  // 📍 KOORDINAT KANTOR PT VISITIGA MEDIA (diberikan oleh user)
  const officeLat = -6.9110502;
  const officeLon = 107.6588105;
  const MAX_RADIUS_METERS = 130; // Maksimal jarak 130 meter

  const distance = calculateDistance(userLat, userLon, officeLat, officeLon);

  return {
    distance: distance,
    isInside: distance <= MAX_RADIUS_METERS,
  };
}