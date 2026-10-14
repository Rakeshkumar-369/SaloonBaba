// Leaflet map, loaded only when the customer opens the Map view.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { navigate } from '../../lib/router.jsx';

export default function MapView({ salons, center }) {
  const el = useRef(null);
  useEffect(() => {
    const first = center || [salons[0].lat, salons[0].lng];
    const map = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(first, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
    const bounds = [];
    for (const s of salons) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:hsl(${s.hue} 65% 45%);color:#fff;padding:4px 8px;border-radius:12px;font:600 12px system-ui;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3)">${s.open_now && s.wait_min !== null ? `${s.wait_min}m · ` : ''}★${Number(s.rating).toFixed(1)}</div>`,
      });
      L.marker([s.lat, s.lng], { icon }).addTo(map).bindTooltip(s.name).on('click', () => navigate(`/app/s/${s.slug}`));
      bounds.push([s.lat, s.lng]);
    }
    if (center) {
      L.circleMarker(center, { radius: 7, color: '#2563eb', fillOpacity: 0.8 }).addTo(map);
      bounds.push(center);
    }
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30] });
    return () => map.remove();
  }, [salons, center]);
  return <div ref={el} style={{ height: 420, width: '100%' }} />;
}
