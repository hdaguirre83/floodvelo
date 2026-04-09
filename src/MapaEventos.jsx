import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from "react-leaflet";
import { supabase } from "./supabaseClient";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix icono por defecto de Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const STATUS_COLORS = {
  pending:    "#F59E0B",
  processing: "#3B82F6",
  done:       "#10B981",
  error:      "#EF4444",
};

const STATUS_LABELS = {
  pending:    "En cola",
  processing: "Procesando",
  done:       "Completado",
  error:      "Error",
};

const TUCUMAN_CENTER = [-26.8241, -65.2226];

export default function MapaEventos() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  
  // --- Nuevos estados para autenticación ---
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // --- Verificar sesión y rol de administrador ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsAdmin(session?.user?.email === "hdaguirre@herrera.unt.edu.ar"); // ← tu email
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setIsAdmin(session?.user?.email === "hdaguirre@herrera.unt.edu.ar");
    });
    return () => subscription.unsubscribe();
  }, []);

  // --- Cargar datos solo si es admin ---
  useEffect(() => {
    if (isAdmin) {
      loadSubmissions();
    } else {
      setLoading(false); // No cargar datos si no es admin
    }
  }, [isAdmin]);

  const loadSubmissions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("submissions")
      .select("id, file_name, department, locality, event_date, event_time, status, velocity_ms, lat, lng")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .order("created_at", { ascending: false });
    if (!error && data) setSubmissions(data);
    setLoading(false);
  };

  const withCoords = submissions.filter(s => s.lat && s.lng);
  const withoutCoords = submissions.filter(s => !s.lat || !s.lng);

  // --- Pantalla de carga inicial (verificando sesión) ---
  if (authLoading) {
    return <div style={{ background: "#0A0E1A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>Cargando...</div>;
  }

  // --- No hay sesión ---
  if (!session) {
    return (
      <div style={{ background: "#0A0E1A", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "white", textAlign: "center" }}>
        <h2>Acceso restringido</h2>
        <p>Debes iniciar sesión como administrador para ver el mapa.</p>
        <a href="/admin" style={{ color: "#38BDF8" }}>Ir al panel de administración</a>
      </div>
    );
  }

  // --- Sesión pero no es admin ---
  if (!isAdmin) {
    return (
      <div style={{ background: "#0A0E1A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>⛔</div>
          <h2>Acceso denegado</h2>
          <p>No tienes permisos para ver el mapa.</p>
        </div>
      </div>
    );
  }

  // --- Renderizado del mapa (solo admin) ---
  return (
    <div style={{ fontFamily: "'Courier New', monospace", background: "#0A0E1A", minHeight: "100vh", color: "#E2E8F0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .leaflet-container { background: #E2E8F0; }
        .custom-popup .leaflet-popup-content-wrapper { background: #0F172A; border: 1px solid #1E293B; border-radius: 8px; color: #E2E8F0; font-family: 'Courier New', monospace; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
        .custom-popup .leaflet-popup-tip { background: #0F172A; }
        .custom-popup .leaflet-popup-close-button { color: #475569; }
        .stat-card { background: #0F172A; border: 1px solid #1E293B; border-radius: 8px; padding: 0.9rem 1.1rem; text-align: center; }
        .refresh-btn { background: none; border: 1px solid #1E3A5F; border-radius: 4px; color: #475569; cursor: pointer; font-family: 'Courier New', monospace; font-size: 0.62rem; padding: 0.35rem 0.8rem; transition: all 0.2s; }
        .refresh-btn:hover { color: #94A3B8; border-color: #38BDF8; }
      `}</style>

      {/* Header */}
      <header style={{ borderBottom: "1px solid #1E293B", padding: "0.9rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: 20 }}>🌊</span>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "1.2rem", fontWeight: 900, color: "#F1F5F9", letterSpacing: "0.06em", lineHeight: 1 }}>FLOODVELO</div>
            <div style={{ fontSize: "0.58rem", color: "#38BDF8", letterSpacing: "0.14em" }}>MAPA DE EVENTOS · TUCUMÁN</div>
          </div>
        </div>
        <button className="refresh-btn" onClick={loadSubmissions}>↺ Actualizar</button>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem" }}>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {[
            ["📥", "Total",          submissions.length,                                      "#38BDF8"],
            ["📍", "Geolocalizados", withCoords.length,                                       "#10B981"],
            ["⏳", "En cola",        submissions.filter(s=>s.status==="pending").length,       "#F59E0B"],
            ["✅", "Completados",    submissions.filter(s=>s.status==="done").length,          "#10B981"],
          ].map(([icon, label, count, color]) => (
            <div key={label} className="stat-card">
              <div style={{ fontSize: 18, marginBottom: "0.25rem" }}>{icon}</div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "1.8rem", fontWeight: 900, color, lineHeight: 1 }}>{count}</div>
              <div style={{ fontSize: "0.6rem", color: "#475569", letterSpacing: "0.08em", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Leyenda */}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {Object.entries(STATUS_COLORS).map(([key, color]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
              <span style={{ fontSize: "0.62rem", color: "#64748B" }}>{STATUS_LABELS[key]}</span>
            </div>
          ))}
        </div>

        {/* Mapa */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#334155" }}>⏳ Cargando mapa...</div>
        ) : (
          <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #1E293B", height: 500 }}>
            <MapContainer
              center={TUCUMAN_CENTER}
              zoom={9}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              />
              {withCoords.map(s => (
                <CircleMarker
                  key={s.id}
                  center={[s.lat, s.lng]}
                  radius={10}
                  pathOptions={{
                    color: STATUS_COLORS[s.status] || "#38BDF8",
                    fillColor: STATUS_COLORS[s.status] || "#38BDF8",
                    fillOpacity: 0.8,
                    weight: 2
                  }}
                  eventHandlers={{ click: () => setSelected(s) }}
                >
                  <Popup className="custom-popup">
                    <div style={{ minWidth: 200, padding: "0.25rem" }}>
                      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "1rem", color: "#F1F5F9", marginBottom: 6 }}>
                        🎬 {s.file_name}
                      </div>
                      <div style={{ fontSize: "0.65rem", color: "#64748B", marginBottom: 3 }}>📍 {s.department} · {s.locality}</div>
                      <div style={{ fontSize: "0.65rem", color: "#64748B", marginBottom: 3 }}>📅 {s.event_date} · 🕐 {s.event_time?.slice(0,5)} hs</div>
                      {s.velocity_ms && (
                        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "1.2rem", fontWeight: 700, color: "#38BDF8", marginTop: 6 }}>
                          {s.velocity_ms} m/s
                        </div>
                      )}
                      <div style={{ marginTop: 6 }}>
                        <span style={{ fontSize: "0.6rem", color: STATUS_COLORS[s.status], background: `${STATUS_COLORS[s.status]}20`, padding: "0.15rem 0.4rem", borderRadius: 3 }}>
                          {STATUS_LABELS[s.status]}
                        </span>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        )}

        {/* Videos sin coordenadas */}
        {withoutCoords.length > 0 && (
          <div style={{ marginTop: "1.5rem" }}>
            <div style={{ fontSize: "0.72rem", color: "#475569", marginBottom: "0.75rem", letterSpacing: "0.08em" }}>
              📭 {withoutCoords.length} VIDEO{withoutCoords.length > 1 ? "S" : ""} SIN COORDENADAS GPS
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {withoutCoords.map(s => (
                <div key={s.id} style={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 6, padding: "0.7rem 1rem", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "#CBD5E1", fontWeight: 700 }}>{s.file_name}</div>
                    <div style={{ fontSize: "0.62rem", color: "#475569" }}>📍 {s.department} · {s.locality} · 📅 {s.event_date}</div>
                  </div>
                  <span style={{ fontSize: "0.6rem", color: STATUS_COLORS[s.status], background: `${STATUS_COLORS[s.status]}20`, padding: "0.15rem 0.4rem", borderRadius: 3, alignSelf: "center" }}>
                    {STATUS_LABELS[s.status]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}