import "./globals.css";

export const metadata = {
  title: "Visitiga Absensi",
  description: "Sistem absensi PT Visitiga Media dengan geofence dan selfie.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
