import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const STATUS_CONFIG = {
  pending:    { label: "En cola",    color: "#F59E0B", icon: "⏳" },
  processing: { label: "Procesando", color: "#3B82F6", icon: "⚙️" },
  done:       { label: "Completado", color: "#10B981", icon: "✅" },
  error:      { label: "Error",      color: "#EF4444", icon: "❌" },
};

// ── Componente de acceso denegado ──────────────────────────────────────────
const AccessDenied = () => (
  <div style={{ background: "#0A0E1A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#E2E8F0" }}>
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 48 }}>⛔</div>
      <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem" }}>Acceso denegado</h2>
      <p>No tenés permisos de administrador.</p>
    </div>
  </div>
);

// ── Fila individual (componente separado para poder usar useState) ──────────
function SubmissionRow({ s, onUpdateStatus, onUpdateVelocity, updating }) {
  const [velInput, setVelInput] = useState(s.velocity_ms || "");
  const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.pending;
  const mapLink = s.lat && s.lng ? `https://www.google.com/maps?q=${s.lat},${s.lng}` : null;
  const isEmail = s.contact?.includes("@");

  return (
    <div className="card" style={{ padding: "1rem 1.25rem", marginBottom: "0.75rem", display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-start", opacity: updating === s.id ? 0.6 : 1, transition: "opacity 0.2s" }}>

      {/* Info principal */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: "0.82rem", color: "#CBD5E1", fontWeight: 700, marginBottom: 5 }}>{s.file_name}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", marginBottom: 4 }}>
          <span style={{ fontSize: "0.63rem", color: "#475569" }}>📍 {s.department} · {s.locality}</span>
          <span style={{ fontSize: "0.63rem", color: "#475569" }}>📅 {s.event_date} · 🕐 {s.event_time?.slice(0,5)} hs</span>
          <span style={{ fontSize: "0.63rem", color: "#475569" }}>💾 {s.file_size_mb} MB</span>
          {mapLink && <a className="link" href={mapLink} target="_blank" rel="noreferrer">🗺 Mapa ↗</a>}
          {s.file_path && <a className="link" href={s.file_path} target="_blank" rel="noreferrer">▶ Ver video ↗</a>}
        </div>
        <div style={{ fontSize: "0.63rem", marginBottom: 2 }}>
          {isEmail ? "📧" : "📱"} <strong style={{ color: "#94A3B8" }}>{s.contact}</strong>
          {s.user_name && <span style={{ color: "#475569", marginLeft: "0.5rem" }}>· {s.user_name}</span>}
        </div>
        {s.notes && <div style={{ fontSize: "0.62rem", color: "#334155", marginTop: 3, fontStyle: "italic" }}>💬 {s.notes}</div>}
        {s.camera_type && <div style={{ fontSize: "0.62rem", color: "#334155" }}>📷 {s.camera_type} {s.light_condition ? "· " + s.light_condition : ""}</div>}
      </div>

      {/* Controles admin */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", minWidth: 180, alignItems: "flex-end" }}>

        {/* Estado */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.6rem", color: "#64748B", letterSpacing: "0.08em" }}>ESTADO</span>
          <select
            className="status-select"
            value={s.status}
            onChange={e => onUpdateStatus(s.id, e.target.value)}
            style={{ color: cfg.color }}
          >
            {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* Velocidad */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.6rem", color: "#64748B", letterSpacing: "0.08em" }}>VEL. m/s</span>
          <input
            className="vel-input"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={velInput}
            onChange={e => setVelInput(e.target.value)}
          />
          <button className="save-btn" onClick={() => onUpdateVelocity(s.id, velInput)}>
            GUARDAR
          </button>
        </div>

        {/* Fecha recibido */}
        <div style={{ fontSize: "0.6rem", color: "#334155" }}>
          Recibido: {new Date(s.created_at).toLocaleDateString("es-AR")} {new Date(s.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
        </div>

      </div>
    </div>
  );
}

// ── Panel principal ───────────────────────────────────────────────────────
export default function Admin() {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(null);

  // ── Sesión y verificación de administrador ──────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.email === "admin@floodvelo.com") {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.email === "admin@floodvelo.com") {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && isAdmin) loadSubmissions();
  }, [session, isAdmin]);

  // ── Login ───────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setLoginError("Email o contraseña incorrectos.");
    setLoginLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSubmissions([]);
    setSession(null);
    setIsAdmin(false);
  };

  // ── Datos ───────────────────────────────────────────────────────────────
  const loadSubmissions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setSubmissions(data);
    setLoading(false);
  };

  const updateStatus = async (id, status) => {
    setUpdating(id);
    await supabase.from("submissions").update({ status }).eq("id", id);
    await loadSubmissions();
    setUpdating(null);
  };

  const updateVelocity = async (id, vel) => {
    setUpdating(id);
    await supabase.from("submissions").update({ velocity_ms: parseFloat(vel) || null }).eq("id", id);
    await loadSubmissions();
    setUpdating(null);
  };

  // ── LOGIN SCREEN ────────────────────────────────────────────────────────
  if (!session) return (
    <div style={{ fontFamily: "'Courier New', monospace", background: "#0A0E1A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .field-input { width: 100%; background: #0F172A; border: 1px solid #1E3A5F; border-radius: 4px; color: #CBD5E1; font-family: 'Courier New', monospace; font-size: 0.82rem; padding: 0.6rem 0.8rem; outline: none; transition: border-color 0.2s; }
        .field-input:focus { border-color: #38BDF8; }
        .login-btn { width: 100%; background: linear-gradient(135deg, #0369A1, #0EA5E9); border: none; border-radius: 4px; color: #fff; cursor: pointer; font-family: 'Courier New', monospace; font-size: 0.78rem; letter-spacing: 0.1em; padding: 0.75rem; text-transform: uppercase; font-weight: 700; transition: all 0.2s; }
        .login-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(14,165,233,0.3); }
        .login-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>
      <div style={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 10, padding: "2.5rem 2rem", width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontSize: 32, marginBottom: "0.5rem" }}>🌊</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "1.6rem", fontWeight: 900, color: "#F1F5F9", letterSpacing: "0.06em" }}>FLOODVELO</div>
          <div style={{ fontSize: "0.62rem", color: "#38BDF8", letterSpacing: "0.16em", textTransform: "uppercase", marginTop: 2 }}>Panel de Administración</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.62rem", color: "#64748B", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.3rem", display: "block" }}>Email</label>
            <input className="field-input" type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>
          <div>
            <label style={{ fontSize: "0.62rem", color: "#64748B", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.3rem", display: "block" }}>Contraseña</label>
            <input className="field-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>
          {loginError && (
            <div style={{ fontSize: "0.68rem", color: "#EF4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 4, padding: "0.5rem 0.75rem" }}>
              ❌ {loginError}
            </div>
          )}
          <button className="login-btn" disabled={!email || !password || loginLoading} onClick={handleLogin}>
            {loginLoading ? "INGRESANDO..." : "INGRESAR →"}
          </button>
        </div>
      </div>
    </div>
  );

  if (!isAdmin) return <AccessDenied />;

  // ── ADMIN PANEL ─────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Courier New', monospace", background: "#0A0E1A", minHeight: "100vh", color: "#E2E8F0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0A0E1A; } ::-webkit-scrollbar-thumb { background: #1E3A5F; border-radius: 3px; }
        .card { background: #0F172A; border: 1px solid #1E293B; border-radius: 8px; }
        .status-select { background: #0A0E1A; border: 1px solid #1E3A5F; border-radius: 3px; color: #CBD5E1; font-family: 'Courier New', monospace; font-size: 0.65rem; padding: 0.2rem 0.4rem; outline: none; cursor: pointer; }
        .vel-input { background: #0A0E1A; border: 1px solid #1E3A5F; border-radius: 3px; color: #38BDF8; font-family: 'Courier New', monospace; font-size: 0.72rem; padding: 0.2rem 0.4rem; width: 80px; outline: none; text-align: center; }
        .vel-input:focus { border-color: #38BDF8; }
        .save-btn { background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.35); border-radius: 3px; color: #10B981; cursor: pointer; font-family: 'Courier New', monospace; font-size: 0.6rem; padding: 0.2rem 0.5rem; transition: all 0.2s; }
        .save-btn:hover { background: rgba(16,185,129,0.25); }
        .logout-btn { background: none; border: 1px solid #334155; border-radius: 4px; color: #64748B; cursor: pointer; font-family: 'Courier New', monospace; font-size: 0.62rem; padding: 0.35rem 0.8rem; transition: all 0.2s; letter-spacing: 0.08em; }
        .logout-btn:hover { border-color: #EF4444; color: #EF4444; }
        .refresh-btn { background: none; border: 1px solid #1E3A5F; border-radius: 4px; color: #475569; cursor: pointer; font-family: 'Courier New', monospace; font-size: 0.62rem; padding: 0.35rem 0.8rem; transition: all 0.2s; }
        .refresh-btn:hover { color: #94A3B8; border-color: #38BDF8; }
        a.link { color: #38BDF8; text-decoration: none; font-size: 0.62rem; }
        a.link:hover { text-decoration: underline; }
      `}</style>

      {/* Header */}
      <header style={{ borderBottom: "1px solid #1E293B", padding: "0.9rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: 20 }}>🌊</span>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "1.2rem", fontWeight: 900, color: "#F1F5F9", letterSpacing: "0.06em", lineHeight: 1 }}>FLOODVELO</div>
            <div style={{ fontSize: "0.58rem", color: "#38BDF8", letterSpacing: "0.14em" }}>PANEL DE ADMINISTRACIÓN</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontSize: "0.65rem", color: "#475569" }}>👤 {session.user.email}</span>
          <button className="refresh-btn" onClick={loadSubmissions}>↺ Actualizar</button>
          <button className="logout-btn" onClick={handleLogout}>Cerrar sesión</button>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem" }}>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {[
            ["📥", "Total",       submissions.length,                                    "#38BDF8"],
            ["⏳", "En cola",     submissions.filter(s => s.status === "pending").length,    "#F59E0B"],
            ["⚙️", "Procesando",  submissions.filter(s => s.status === "processing").length, "#3B82F6"],
            ["✅", "Completados", submissions.filter(s => s.status === "done").length,        "#10B981"],
            ["❌", "Errores",     submissions.filter(s => s.status === "error").length,       "#EF4444"],
          ].map(([icon, label, count, color]) => (
            <div key={label} className="card" style={{ padding: "1rem", textAlign: "center" }}>
              <div style={{ fontSize: 20, marginBottom: "0.3rem" }}>{icon}</div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "1.8rem", fontWeight: 900, color, lineHeight: 1 }}>{count}</div>
              <div style={{ fontSize: "0.62rem", color: "#475569", letterSpacing: "0.08em", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Lista de envíos */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#334155" }}>⏳ Cargando...</div>
        ) : submissions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#334155" }}>
            <div style={{ fontSize: 32, marginBottom: "0.5rem" }}>📭</div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "1rem", fontWeight: 700 }}>SIN ENVÍOS AÚN</div>
          </div>
        ) : submissions.map(s => (
          <SubmissionRow
            key={s.id}
            s={s}
            updating={updating}
            onUpdateStatus={updateStatus}
            onUpdateVelocity={updateVelocity}
          />
        ))}
      </main>
    </div>
  );
}