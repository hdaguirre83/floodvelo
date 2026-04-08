import React, { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "./supabaseClient";

// ── Cloudinary config ──────────────────────────────────────────────────────
const CLOUDINARY_CLOUD = "dasxovn1b";
const CLOUDINARY_PRESET = "floodvelo_videos";
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`;

// ── Constantes ─────────────────────────────────────────────────────────────
const VIDEO_CONDITIONS = ["Diurno - cielo despejado","Diurno - nublado","Diurno - lluvia activa","Nocturno - iluminado","Nocturno - sin iluminación"];
const CAMERA_TYPES = ["Smartphone (frontal)","Smartphone (trasera)","Drone / UAV","Cámara fija instalada","Cámara de acción (GoPro, etc.)","Otro"];
const TUCUMAN_DEPTS = ["Capital","Burruyacú","Cruz Alta","Chicligasta","Famaillá","Graneros","Juan B. Alberdi","La Cocha","Leales","Lules","Monteros","Río Chico","Simoca","Tafí del Valle","Tafí Viejo","Trancas","Yerba Buena"];

// ── Control de calidad ─────────────────────────────────────────────────────
const MIN_DURATION_SEC = 15;   // ✅ Corregido: unificado en 15 segundos
const MIN_WIDTH = 1280;
const MIN_HEIGHT = 720;

const formatDuration = (secs) => {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const analyzeVideo = (file) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;
      URL.revokeObjectURL(url);
      resolve({
        duration, width, height,
        durationOk: duration >= MIN_DURATION_SEC,
        resolutionOk: width >= MIN_WIDTH && height >= MIN_HEIGHT,
        passed: duration >= MIN_DURATION_SEC && width >= MIN_WIDTH && height >= MIN_HEIGHT,
      });
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    video.src = url;
  });

// Formulario simplificado (sin contacto obligatorio)
const EMPTY_FORM = { dept: "Capital", locality: "", date: "", time: "", condition: "", camera: "", notes: "", lat: "", lng: "", alt_contact: "" };

// ── Funciones de autenticación ─────────────────────────────────────────────
const handleGoogleLogin = async () => {
  const redirectUrl = import.meta.env.PROD 
    ? 'https://floodvelo.vercel.app' 
    : window.location.origin;
    
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl,
      queryParams: { access_type: 'offline', prompt: 'consent' }
    }
  });
  if (error) console.error("Error en login:", error);
};

// Pantalla de login
const LoginScreen = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    background: '#0A0E1A',
    color: '#E2E8F0',
    padding: '2rem',
    textAlign: 'center'
  }}>
    <div style={{ marginBottom: '2rem' }}>
      <div style={{ fontSize: '4rem' }}>🌊</div>
      <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '2rem' }}>FloodVelo</h1>
      <p style={{ color: '#94A3B8' }}>Iniciá sesión para contribuir con videos</p>
    </div>
    <button
      onClick={handleGoogleLogin}
      style={{
        background: '#0EA5E9',
        border: 'none',
        borderRadius: '8px',
        color: 'white',
        fontFamily: "'Space Mono', monospace",
        fontSize: '1rem',
        padding: '0.75rem 1.5rem',
        cursor: 'pointer'
      }}
    >
      🔑 Iniciar sesión con Google
    </button>
  </div>
);

export default function App() {
  const [tab, setTab] = useState("upload");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [qcResult, setQcResult] = useState(null);
  const [qcLoading, setQcLoading] = useState(false);
  const [metodoTab, setMetodoTab] = useState("guia");
  const [userSubmissions, setUserSubmissions] = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [subsError, setSubsError] = useState("");
  const fileRef = useRef();
  const xhrRef = useRef(null);

  // --- Autenticación ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener?.subscription.unsubscribe();
  }, []);

  // --- Liberar URL de preview al desmontar ---
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);
  
  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) acceptFile(file);
  }, []);

  const acceptFile = async (file) => {
    if (preview) URL.revokeObjectURL(preview);  // ✅ liberar anterior
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
    setSuccess(false); setError(""); setQcResult(null); setQcLoading(true);
    const result = await analyzeVideo(file);
    setQcResult(result); setQcLoading(false);
  };

  const setF = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const getGeolocation = () => {
    if (!navigator.geolocation) { setGeoError("Tu navegador no soporta geolocalización."); return; }
    setGeoLoading(true); setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setF("lat", pos.coords.latitude.toFixed(6)); setF("lng", pos.coords.longitude.toFixed(6)); setGeoLoading(false); },
      () => { setGeoError("No se pudo obtener la ubicación. Podés ingresarla manualmente."); setGeoLoading(false); }
    );
  };

  // Validación del formulario
  const formValid = () => {
    if (!selectedFile || !qcResult?.passed) return false;
    if (!form.date || !form.time || !form.locality) return false;
    // Validar coordenadas si se ingresaron
    if (form.lat && isNaN(parseFloat(form.lat))) return false;
    if (form.lng && isNaN(parseFloat(form.lng))) return false;
    return true;
  };

  const handleUpload = async () => {
    if (!formValid()) return;
    if (!user) { setError("Debes iniciar sesión para subir videos."); return; }

    setUploading(true); setUploadProgress(0); setUploadStage("Subiendo video a Cloudinary..."); setError("");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("upload_preset", CLOUDINARY_PRESET);
    formData.append("folder", "floodvelo");
    formData.append("resource_type", "video");

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 85));
    };
    xhr.onload = async () => {
      if (xhr.status === 200) {
        const cloudData = JSON.parse(xhr.responseText);
        setUploadProgress(90); setUploadStage("Guardando datos en la base de datos...");

        // Validar coordenadas numéricas
        const latNum = form.lat ? parseFloat(form.lat) : null;
        const lngNum = form.lng ? parseFloat(form.lng) : null;
        if ((form.lat && isNaN(latNum)) || (form.lng && isNaN(lngNum))) {
          setError("Las coordenadas deben ser números válidos (ej. -26.8241)");
          setUploading(false);
          return;
        }

        const { error: dbError } = await supabase.from("submissions").insert({
          user_id: user.id,
          user_email: user.email,
          user_name: user.user_metadata?.full_name || null,
          file_name: selectedFile.name,
          file_path: cloudData.secure_url,
          file_size_mb: parseFloat((selectedFile.size / 1e6).toFixed(2)),
          event_date: form.date,
          event_time: form.time,
          department: form.dept,
          locality: form.locality,
          lat: latNum,
          lng: lngNum,
          light_condition: form.condition || null,
          camera_type: form.camera || null,
          notes: form.notes || null,
          alt_contact: form.alt_contact || null,
          status: "pending",
        });

        if (dbError) {
          setError("Video subido pero error al guardar datos: " + dbError.message);
          setUploading(false);
          return;
        }

        setUploadProgress(100);
        setTimeout(() => {
          setUploading(false); setUploadProgress(0); setUploadStage("");
          setSelectedFile(null);
          if (preview) URL.revokeObjectURL(preview);
          setPreview(null);
          setForm(EMPTY_FORM);
          setSuccess(true);
          setGeoError("");
          setQcResult(null);
        }, 500);
      } else {
        let msg = "Error al subir el video.";
        try { msg = JSON.parse(xhr.responseText)?.error?.message || msg; } catch {}
        setError(msg);
        setUploading(false);
      }
    };
    xhr.onerror = () => { setError("Error de red. Verificá tu conexión."); setUploading(false); };
    xhr.open("POST", CLOUDINARY_URL);
    xhr.send(formData);
  };

  const cancelUpload = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    setUploading(false);
    setUploadProgress(0);
    setUploadStage("");
    setError("Subida cancelada.");
  };
  
  // Cargar los videos del usuario logueado
const loadUserSubmissions = useCallback(async () => {
  if (!user) return;
  setLoadingSubs(true);
  setSubsError("");
  try {
    const { data, error } = await supabase
      .from("submissions")
      .select("id, event_date, locality, status, velocity_ms, file_path, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    setUserSubmissions(data || []);
  } catch (err) {
    console.error(err);
    setSubsError("No se pudieron cargar tus aportes. Intentalo más tarde.");
  } finally {
    setLoadingSubs(false);
  }
}, [user]);

useEffect(() => {
  if (tab === "misvideos" && user) {
    loadUserSubmissions();
  }
}, [tab, user, loadUserSubmissions]);

  const QCPanel = () => {
    if (qcLoading) return (
      <div style={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, padding: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span>🔍</span>
        <div style={{ fontSize: "0.72rem", color: "#64748B" }}>ANALIZANDO CALIDAD DEL VIDEO...</div>
      </div>
    );
    if (!qcResult) return (
      <div style={{ background: "#0F172A", border: "1px solid #EF4444", borderRadius: 8, padding: "1rem" }}>
        <div style={{ fontSize: "0.72rem", color: "#EF4444" }}>❌ No se pudo analizar el video. Probá con otro formato (MP4, MOV).</div>
      </div>
    );
    const { duration, width, height, durationOk, resolutionOk, passed } = qcResult;
    return (
      <div style={{ background: passed ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${passed ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: 8, padding: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.85rem" }}>
          <span>{passed ? "✅" : "❌"}</span>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.95rem", color: passed ? "#10B981" : "#EF4444" }}>
              {passed ? "VIDEO APROBADO — CUMPLE LOS REQUISITOS MÍNIMOS" : "VIDEO RECHAZADO — NO CUMPLE LOS REQUISITOS MÍNIMOS"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "#0A0E1A", borderRadius: 6, padding: "0.6rem 0.85rem" }}>
            <span>{durationOk ? "✅" : "❌"}</span>
            <div>
              <div style={{ fontSize: "0.65rem", color: "#64748B" }}>DURACIÓN</div>
              <div style={{ fontSize: "0.78rem", color: durationOk ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                {formatDuration(duration)} <span style={{ fontSize: "0.62rem", color: "#475569", fontWeight: 400 }}>(mínimo {formatDuration(MIN_DURATION_SEC)})</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "#0A0E1A", borderRadius: 6, padding: "0.6rem 0.85rem" }}>
            <span>{resolutionOk ? "✅" : "❌"}</span>
            <div>
              <div style={{ fontSize: "0.65rem", color: "#64748B" }}>RESOLUCIÓN</div>
              <div style={{ fontSize: "0.78rem", color: resolutionOk ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                {width}x{height}px <span style={{ fontSize: "0.62rem", color: "#475569" }}>(mínimo {MIN_WIDTH}x{MIN_HEIGHT}px — 720p)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const GuideItem = ({ icon, title, items, color = "#38BDF8" }) => (
    <div style={{ background: "#0F172A", border: `1px solid ${color}25`, borderRadius: 8, padding: "1.1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "1rem", color, letterSpacing: "0.05em" }}>{title}</div>
      </div>
      <ul style={{ paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontSize: "0.72rem", color: "#94A3B8", lineHeight: 1.6 }}>{item}</li>
        ))}
      </ul>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Courier New', monospace", background: "#0A0E1A", minHeight: "100vh", color: "#E2E8F0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Barlow+Condensed:wght@300;500;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0A0E1A; } ::-webkit-scrollbar-thumb { background: #1E3A5F; border-radius: 3px; }
        .tab-btn { background: none; border: none; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 0.72rem; letter-spacing: 0.12em; padding: 0.5rem 1rem; transition: all 0.2s; white-space: nowrap; }
        .tab-btn.active { color: #38BDF8; border-bottom: 2px solid #38BDF8; }
        .tab-btn:not(.active) { color: #475569; border-bottom: 2px solid transparent; }
        .tab-btn:not(.active):hover { color: #94A3B8; }
        .sub-tab { background: none; border: none; cursor: pointer; font-family: 'Barlow Condensed', sans-serif; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.1em; padding: 0.4rem 1rem; transition: all 0.2s; border-radius: 4px; text-transform: uppercase; }
        .sub-tab.active { background: rgba(56,189,248,0.1); color: #38BDF8; border: 1px solid rgba(56,189,248,0.3); }
        .sub-tab:not(.active) { color: #475569; border: 1px solid transparent; }
        .sub-tab:not(.active):hover { color: #94A3B8; }
        .field-label { font-size: 0.63rem; letter-spacing: 0.12em; color: #64748B; text-transform: uppercase; margin-bottom: 0.3rem; display: block; }
        .field-input { width: 100%; background: #0F172A; border: 1px solid #1E3A5F; border-radius: 4px; color: #CBD5E1; font-family: 'Space Mono', monospace; font-size: 0.78rem; padding: 0.52rem 0.7rem; outline: none; transition: border-color 0.2s; }
        .field-input:focus { border-color: #38BDF8; }
        .field-input::placeholder { color: #334155; }
        select.field-input option { background: #0F172A; }
        .upload-btn { background: linear-gradient(135deg, #0369A1, #0EA5E9); border: none; border-radius: 4px; color: #fff; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 0.72rem; letter-spacing: 0.1em; padding: 0.75rem 1.75rem; text-transform: uppercase; transition: all 0.25s; font-weight: 700; }
        .upload-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(14,165,233,0.35); }
        .upload-btn:disabled { opacity: 0.38; cursor: not-allowed; }
        .cancel-btn { background: none; border: 1px solid #EF4444; border-radius: 4px; color: #EF4444; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 0.65rem; padding: 0.5rem 1rem; transition: all 0.2s; }
        .cancel-btn:hover { background: rgba(239,68,68,0.1); }
        .geo-btn { background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.35); border-radius: 4px; color: #38BDF8; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 0.65rem; padding: 0.52rem 0.8rem; transition: all 0.2s; white-space: nowrap; }
        .geo-btn:hover:not(:disabled) { background: rgba(56,189,248,0.18); }
        .geo-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        @media (max-width: 600px) { .grid2 { grid-template-columns: 1fr; } }
        .scan-line { position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #38BDF8, transparent); animation: scan 3s linear infinite; }
        @keyframes scan { 0%{top:0%} 100%{top:100%} }
        .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: #10B981; animation: pulse 1.5s ease-in-out infinite; display: inline-block; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
        .card { background: #0F172A; border: 1px solid #1E293B; border-radius: 8px; }
        .drop-zone { border: 2px dashed #1E3A5F; border-radius: 8px; transition: all 0.3s; cursor: pointer; }
        .drop-zone.over { border-color: #38BDF8; background: rgba(56,189,248,0.04); }
        .tech-tag { background: rgba(56,189,248,0.08); border: 1px solid rgba(56,189,248,0.2); color: #38BDF8; font-size: 0.58rem; letter-spacing: 0.12em; padding: 0.12rem 0.45rem; border-radius: 2px; text-transform: uppercase; }
        .progress-bar-outer { background: #1E293B; border-radius: 2px; overflow: hidden; height: 8px; }
        .progress-bar-inner { height: 100%; background: linear-gradient(90deg, #0369A1, #38BDF8, #7DD3FC); border-radius: 2px; transition: width 0.4s; }
        .coords-chip { display: inline-flex; align-items: center; gap: 0.35rem; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 3px; padding: 0.15rem 0.5rem; font-size: 0.62rem; color: #10B981; }
        .about-card { background: #0F172A; border: 1px solid #1E293B; border-radius: 8px; padding: 1.4rem; }
        .method-step { display: flex; gap: 1rem; padding: 0.9rem 0; border-bottom: 1px solid #1E293B; align-items: flex-start; }
        .step-num { font-family: 'Barlow Condensed', sans-serif; font-size: 2.4rem; font-weight: 900; color: #1E3A5F; line-height: 1; min-width: 2.4rem; }
        textarea.field-input { resize: vertical; min-height: 68px; }
        .req { color: #EF4444; margin-left: 2px; }
        .section-title { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: 0.1em; font-size: 0.82rem; color: #64748B; margin-bottom: 1.1rem; border-bottom: 1px solid #1E293B; padding-bottom: 0.6rem; }
        a.map-link { color: #38BDF8; text-decoration: none; font-size: 0.63rem; }
        a.map-link:hover { text-decoration: underline; }
        .photo-caption { font-size: 0.63rem; color: #475569; text-align: center; margin-top: 0.4rem; font-style: italic; }
      `}</style>

      {/* HEADER */}
      <header style={{ borderBottom: "1px solid #1E293B", padding: "0.9rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ borderBottom: "1px solid #1E293B", padding: "0 1.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
  <button className={`tab-btn ${tab === "upload" ? "active" : ""}`} onClick={() => setTab("upload")}>📤 Subir Video</button>
  <button className={`tab-btn ${tab === "about" ? "active" : ""}`} onClick={() => setTab("about")}>🔬 Metodología</button>
  {user && (
    <button className={`tab-btn ${tab === "misvideos" ? "active" : ""}`} onClick={() => setTab("misvideos")}>📁 Mis Videos</button>
  )}
</div>
      </header>

      {/* TABS */}
      <div style={{ borderBottom: "1px solid #1E293B", padding: "0 1.5rem", display: "flex" }}>
        <button className={`tab-btn ${tab === "upload" ? "active" : ""}`} onClick={() => setTab("upload")}>📤 Subir Video</button>
        <button className={`tab-btn ${tab === "about" ? "active" : ""}`} onClick={() => setTab("about")}>🔬 Metodología</button>
      </div>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "1.75rem 1.5rem" }}>
        {tab === "upload" && (
          !user ? <LoginScreen /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.3rem" }}>
              {success && (
                <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, padding: "0.9rem 1.2rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <span style={{ fontSize: 20 }}>✅</span>
                  <div>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, color: "#10B981" }}>VIDEO ENVIADO Y GUARDADO CORRECTAMENTE</div>
                    <div style={{ fontSize: "0.67rem", color: "#64748B", marginTop: 2 }}>Tu video quedó registrado. Te contactaremos si necesitamos más información.</div>
                  </div>
                </div>
              )}
              {error && (
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "0.9rem 1.2rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <span style={{ fontSize: 20 }}>❌</span>
                  <div>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, color: "#EF4444" }}>ERROR</div>
                    <div style={{ fontSize: "0.67rem", color: "#94A3B8", marginTop: 2 }}>{error}</div>
                  </div>
                </div>
              )}

              {/* Hero */}
              <div className="card" style={{ padding: "1.2rem", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, right: 0, width: 180, height: "100%", background: "radial-gradient(ellipse at right, rgba(14,165,233,0.06), transparent)", pointerEvents: "none" }} />
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "1.3rem", color: "#F1F5F9", lineHeight: 1.15, marginBottom: "0.4rem" }}>
                      CONTRIBUÍ A LA <span style={{ color: "#38BDF8" }}>CIENCIA HÍDRICA</span>
                    </div>
                    <div style={{ fontSize: "0.69rem", color: "#64748B", lineHeight: 1.6 }}>
                      Subí un video de inundación en Tucumán. Los algoritmos LSPIV de RIVeR estimarán la velocidad superficial del flujo.
                    </div>
                    <div style={{ marginTop: "0.5rem", fontSize: "0.65rem", color: "#334155" }}>
                      ¿Primera vez? Consultá la{" "}
                      <button onClick={()=>{setTab("about");setMetodoTab("guia");}} style={{ background:"none", border:"none", cursor:"pointer", color:"#38BDF8", fontSize:"0.65rem", padding:0, textDecoration:"underline" }}>
                        Guía de Filmación
                      </button>{" "}antes de grabar.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {["LSPIV","RIVeR","Unshake","GCPs"].map(t => <span key={t} className="tech-tag">{t}</span>)}
                  </div>
                </div>
              </div>

              {/* Requisitos */}
              <div style={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, padding: "0.85rem 1.1rem" }}>
                <div style={{ fontSize: "0.63rem", color: "#64748B", letterSpacing: "0.1em", marginBottom: "0.5rem", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700 }}>REQUISITOS MÍNIMOS DEL VIDEO</div>
                <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.68rem", color: "#94A3B8" }}>⏱ Duración: <strong style={{ color: "#CBD5E1" }}>mín. 15-20 seg</strong></span>
                  <span style={{ fontSize: "0.68rem", color: "#94A3B8" }}>📐 Resolución: <strong style={{ color: "#CBD5E1" }}>mín. 720p</strong></span>
                  <span style={{ fontSize: "0.68rem", color: "#94A3B8" }}>🔒 Sin zoom ni paneo</span>
                  <span style={{ fontSize: "0.68rem", color: "#94A3B8" }}>📍 4 puntos fijos visibles</span>
                </div>
              </div>

              {/* Drop zone */}
              <div className={`drop-zone${dragOver?" over":""}`} style={{ padding: "2rem 1.5rem", textAlign: "center" }}
                onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop}
                onClick={()=>!uploading && fileRef.current.click()}>
                <input ref={fileRef} type="file" accept="video/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&acceptFile(e.target.files[0])} />
                {preview ? (
                  <div onClick={e=>e.stopPropagation()}>
                    <video src={preview} style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 6, border: "1px solid #1E3A5F" }} controls />
                    <div style={{ marginTop: "0.6rem", fontSize: "0.7rem", color: "#38BDF8" }}>📹 {selectedFile?.name} · {(selectedFile?.size/1e6).toFixed(1)} MB</div>
                    {!uploading && <button style={{ marginTop: "0.4rem", background: "none", border: "none", color: "#475569", fontSize: "0.62rem", cursor: "pointer" }} onClick={e=>{e.stopPropagation();setSelectedFile(null);setPreview(null);setQcResult(null);}}>✕ CAMBIAR VIDEO</button>}
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 32, marginBottom: "0.6rem" }}>🎥</div>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "1rem", color: "#CBD5E1" }}>ARRASTRÁ O HACÉ CLICK PARA SELECCIONAR</div>
                    <div style={{ fontSize: "0.67rem", color: "#475569", marginTop: "0.35rem" }}>MP4, MOV, AVI, MKV</div>
                  </>
                )}
              </div>

              <QCPanel />

              {/* CUÁNDO Y DÓNDE */}
              <div className="card" style={{ padding: "1.35rem" }}>
                <div className="section-title">📅 CUÁNDO Y DÓNDE OCURRIÓ</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div className="grid2">
                    <div><label className="field-label">Fecha del evento <span className="req">*</span></label><input type="date" className="field-input" value={form.date} onChange={e=>setF("date",e.target.value)} disabled={uploading} /></div>
                    <div><label className="field-label">Hora de la captura <span className="req">*</span></label><input type="time" className="field-input" value={form.time} onChange={e=>setF("time",e.target.value)} disabled={uploading} /></div>
                  </div>
                  <div className="grid2">
                    <div><label className="field-label">Departamento <span className="req">*</span></label>
                      <select className="field-input" value={form.dept} onChange={e=>setF("dept",e.target.value)} disabled={uploading}>
                        {TUCUMAN_DEPTS.map(d=><option key={d}>{d}</option>)}
                      </select>
                    </div>
                    <div><label className="field-label">Localidad / Barrio <span className="req">*</span></label><input className="field-input" placeholder="ej: Villa Urquiza..." value={form.locality} onChange={e=>setF("locality",e.target.value)} disabled={uploading} /></div>
                  </div>
                  <div>
                    <label className="field-label">Coordenadas GPS <span style={{ color: "#334155", textTransform: "none", fontSize: "0.6rem", letterSpacing: 0, marginLeft: 6 }}>— opcional</span></label>
                    <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                      <input className="field-input" style={{ flex: 1, minWidth: 110 }} placeholder="Latitud  ej: -26.8241" value={form.lat} onChange={e=>setF("lat",e.target.value)} disabled={uploading} />
                      <input className="field-input" style={{ flex: 1, minWidth: 110 }} placeholder="Longitud  ej: -65.2226" value={form.lng} onChange={e=>setF("lng",e.target.value)} disabled={uploading} />
                      <button className="geo-btn" disabled={geoLoading || uploading} onClick={getGeolocation}>{geoLoading ? "⏳ Detectando..." : "📍 Usar mi ubicación"}</button>
                    </div>
                    {geoError && <div style={{ fontSize: "0.64rem", color: "#F59E0B", marginTop: "0.4rem" }}>⚠ {geoError}</div>}
                    {form.lat && form.lng && !geoError && (
                      <div style={{ marginTop: "0.45rem", display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <span className="coords-chip">✔ {form.lat}, {form.lng}</span>
                        <a className="map-link" href={`https://www.google.com/maps?q=${form.lat},${form.lng}`} target="_blank" rel="noreferrer">Ver en mapa ↗</a>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* DATOS DEL VIDEO */}
              <div className="card" style={{ padding: "1.35rem" }}>
                <div className="section-title">🎬 DATOS DEL VIDEO</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div className="grid2">
                    <div><label className="field-label">Condiciones de luz</label>
                      <select className="field-input" value={form.condition} onChange={e=>setF("condition",e.target.value)} disabled={uploading}>
                        <option value="">— seleccionar —</option>
                        {VIDEO_CONDITIONS.map(c=><option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div><label className="field-label">Tipo de cámara</label>
                      <select className="field-input" value={form.camera} onChange={e=>setF("camera",e.target.value)} disabled={uploading}>
                        <option value="">— seleccionar —</option>
                        {CAMERA_TYPES.map(c=><option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div><label className="field-label">Observaciones</label>
                    <textarea className="field-input" placeholder="Nombre del río, estimación visual de velocidad, descripción del evento..." value={form.notes} onChange={e=>setF("notes",e.target.value)} disabled={uploading} />
                  </div>
                </div>
              </div>

              {/* CONTACTO ALTERNATIVO (OPCIONAL) */}
              <div className="card" style={{ padding: "1.35rem" }}>
                <div className="section-title">📞 CONTACTO ALTERNATIVO (OPCIONAL)</div>
                <div style={{ fontSize: "0.67rem", color: "#475569", marginBottom: "0.75rem" }}>
                  Ya tenemos tu email desde Google (<strong>{user.email}</strong>). Podés dejarnos un teléfono o email alternativo por si necesitamos consultarte algo urgente.
                </div>
                <input
                  className="field-input"
                  placeholder="Ej: +54 381 555-1234 / otro@email.com"
                  value={form.alt_contact}
                  onChange={e => setF("alt_contact", e.target.value)}
                  disabled={uploading}
                />
              </div>

              {/* Acción */}
              {uploading ? (
                <div className="card" style={{ padding: "1.35rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.7rem" }}>
                    <div style={{ fontSize: "0.68rem", color: "#38BDF8", letterSpacing: "0.1em" }}>{uploadStage} {uploadProgress}%</div>
                    <button className="cancel-btn" onClick={cancelUpload}>✕ CANCELAR</button>
                  </div>
                  <div className="progress-bar-outer"><div className="progress-bar-inner" style={{ width: `${uploadProgress}%` }} /></div>
                  <div style={{ fontSize: "0.62rem", color: "#334155", marginTop: "0.5rem", textAlign: "center" }}>No cierres esta pestaña mientras se sube el video</div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div style={{ fontSize: "0.64rem", color: "#334155" }}><span className="req">*</span> Obligatorio: video aprobado · fecha · hora · localidad</div>
                  <button className="upload-btn" disabled={!formValid()} onClick={handleUpload}>ENVIAR PARA ANÁLISIS →</button>
                </div>
              )}
            </div>
          )
        )}

        {tab === "about" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.3rem" }}>
            {/* Sub-tabs */}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {[["guia","🎥  Cómo Filmar"],["proceso","⚙️  Procesamiento"],["river","🔬  RIVeR & LSPIV"]].map(([id,label])=>(
                <button key={id} className={`sub-tab ${metodoTab===id?"active":""}`} onClick={()=>setMetodoTab(id)}>{label}</button>
              ))}
            </div>

            {metodoTab === "guia" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div className="about-card" style={{ borderColor: "rgba(56,189,248,0.2)" }}>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "1.35rem", color: "#38BDF8", marginBottom: "0.5rem" }}>
                    CÓMO FILMAR PARA QUE TU VIDEO SEA ÚTIL
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "#94A3B8", lineHeight: 1.8 }}>
                    Para que podamos medir la velocidad del agua con tecnología LSPIV, seguí estas recomendaciones. La calidad del video determina directamente la precisión de los resultados.
                  </p>
                  <div style={{ marginTop: "0.75rem", background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.15)", borderRadius: 6, padding: "0.6rem 0.9rem", fontSize: "0.7rem", color: "#38BDF8" }}>
                    📌 <strong>Cuanto mejor sea el video, más precisa será la medición</strong>
                  </div>
                </div>

                <div className="about-card">
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.1em", color: "#64748B", marginBottom: "0.85rem" }}>
                    EJEMPLOS DE ENCUADRES CORRECTOS E INCORRECTOS
                  </div>
                  <img
                    src="/guia_ejemplos.png"
                    alt="Ejemplos de videos correctos e incorrectos para velocimetría"
                    style={{ width: "100%", borderRadius: 6, border: "1px solid #1E293B" }}
                  />
                  <p className="photo-caption">
                    ✅ Correctos: vista desde puente con orillas visibles y referencias fijas · ❌ Incorrectos: zoom excesivo sin referencias y plano lateral bajo sin visibilidad del flujo. (Imágenes: A. Patalano)
                  </p>
                </div>

                <div className="grid2">
                  <GuideItem
                    icon="📍"
                    title="1. POSICIÓN DE LA CÁMARA"
                    color="#38BDF8"
                    items={[
                      "Filmá desde una posición elevada (puente, puente peatonal, orilla alta)",
                      "Apuntá en ángulo oblicuo al flujo",
                      "Ideal: cámara fija (apoyada o con pulso firme)",
                      "Incluí la mayor superficie de agua posible (que se vean los extremos del flujo)",
                    ]}
                  />
                  <GuideItem
                    icon="🏗️"
                    title="2. REFERENCIAS FIJAS EN EL CUADRO"
                    color="#38BDF8"
                    items={[
                      "Asegurate que se vean objetos fijos en las orillas (árboles, postes, rocas, estructuras)",
                      "Estos puntos nos permiten convertir píxeles a metros reales",
                      "Identificá 4 puntos fijos no alineados que sean visibles durante todo el video",
                    ]}
                  />
                  <GuideItem
                    icon="⏱️"
                    title="3. DURACIÓN Y ESTABILIDAD"
                    color="#10B981"
                    items={[
                      "Filmá al menos 15-20 segundos de flujo continuo",
                      "Mové la cámara lo menos posible",
                      "Evitá paneos o zoom durante la filmación",
                      "Más duración = mejor promedio de velocidad estimada",
                    ]}
                  />
                  <GuideItem
                    icon="💡"
                    title="4. CONDICIONES IDEALES"
                    color="#10B981"
                    items={[
                      "Superficie del agua con partículas visibles (espuma, hojas, sedimentos en suspensión)",
                      "Evitá reflejos intensos del sol o contraluz directo",
                      "Preferí luz natural diurna o con buena iluminación artificial",
                      "Procurá buena iluminación (diurna o con luz artificial si existiese)",
                    ]}
                  />
                </div>

                <div className="about-card">
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.1em", color: "#64748B", marginBottom: "0.85rem" }}>
                    PUNTOS DE CONTROL (GCPs) PARA ORTORECTIFICACIÓN
                  </div>
                  <img
                    src="/guia_puntos_control.png"
                    alt="Ejemplo de puntos de control en video de inundación urbana"
                    style={{ width: "100%", borderRadius: 6, border: "1px solid #1E293B" }}
                  />
                  <p className="photo-caption">
                    Los puntos rojos y celeste indican referencias fijas sobre la superficie del agua no alineadas entre sí — esquinas de veredas, bases de postes, desagües. El equipo técnico los marcará antes del procesamiento con RIVeR. (Imagen: H. Aguirre)
                  </p>
                </div>

                <GuideItem
                  icon="🚫"
                  title="5. QUÉ NO HACER"
                  color="#EF4444"
                  items={[
                    "❌ No hacer paneo (mover la cámara de lado a lado)",
                    "❌ No grabar en movimiento (caminando o desde un vehículo)",
                    "❌ No enfocar solo el agua sin referencias fijas visibles",
                    "❌ No usar zoom digital",
                    "❌ No grabar con el sol de frente generando reflejos intensos",
                    "❌ No cortar el video antes de los 15 segundos",
                  ]}
                />

                <div className="about-card">
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.1em", color: "#64748B", marginBottom: "0.85rem" }}>
                    ✅ CHECKLIST ANTES DE GRABAR
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    {[
                      "Posición elevada con vista del flujo",
                      "Cámara apoyada o muy firme",
                      "Zoom desactivado",
                      "Al menos 4 puntos fijos visibles en el encuadre",
                      "Buena iluminación natural",
                      "Mínimo 15-20 segundos de grabación",
                      "Modo horizontal (paisaje)",
                      "Partículas visibles en el agua (espuma, hojas)",
                    ].map((text) => (
                      <div key={text} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", fontSize: "0.7rem", color: "#94A3B8", lineHeight: 1.5 }}>
                        <span style={{ color: "#10B981", flexShrink: 0 }}>☐</span>{text}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {metodoTab === "proceso" && (
              <div className="about-card">
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.1em", color: "#ffffff", marginBottom: "0.85rem" }}>FLUJO COMPLETO DE PROCESAMIENTO</div>
                {[
                  ["01","Control de calidad automático","Al seleccionar el video se verifica duración mínima y resolución mínima (720p) antes de permitir el envío. El botón queda bloqueado si el video no cumple los requisitos."],
                  ["02","Carga y almacenamiento","El video se sube a la nube y los metadatos (fecha, hora, coordenadas GPS, contacto) se guardan en la base de datos. Se envía una notificación automática al equipo técnico."],
                  ["03","Revisión","El equipo técnico revisa el video en el panel de administración. Verifica estabilidad de cámara, visibilidad de GCPs y condiciones de filmación. Aprueba o rechaza el video."],
                  ["04","Puntos de control (GCPs)","El equipo técnico identifica y marca los 4 puntos de control en el video, registrando sus coordenadas GPS reales para la ortorectificación."],
                  ["05","Procesamiento con RIVeR","El video se procesa localmente con RIVeR. Se aplica Unshake para corrección de movimiento residual, ortorectificación con los GCPs y análisis LSPIV para calcular los vectores de velocidad superficial."],
                  ["06","Reporte de resultados","El técnico carga la velocidad estimada (m/s) en el panel admin. El resultado queda disponible en el mapa de eventos y se puede notificar al ciudadano que filmó el video."],
                ].map(([n,title,desc])=>(
                  <div key={n} className="method-step">
                    <span className="step-num">{n}</span>
                    <div>
                      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.92rem", color: "#CBD5E1", marginBottom: 3 }}>{title}</div>
                      <div style={{ fontSize: "0.7rem", color: "#64748B", lineHeight: 1.7 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {metodoTab === "river" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div className="about-card">
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "1.3rem", color: "#38BDF8", marginBottom: "0.7rem" }}>¿QUÉ ES RIVeR?</div>
                  <p style={{ fontSize: "0.75rem", color: "#94A3B8", lineHeight: 1.8 }}>
                    <strong style={{color:"#CBD5E1"}}>RIVeR (Rapid Image Velocimetry and Ranging)</strong> es un software especializado en velocimetría por imágenes de gran escala (LSPIV) para ríos y canales. Desarrollado por Antoine Patalano y colaboradores, permite estimar la velocidad superficial del flujo a partir de videos sin necesidad de instrumentación en contacto con el agua.
                  </p>
                </div>
                <div className="about-card">
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.1em", color: "#64748B", marginBottom: "0.85rem" }}>CARACTERÍSTICAS PRINCIPALES</div>
                  {[
                    ["🎯","LSPIV (Large Scale PIV)","Implementa correlación cruzada entre ventanas de interrogación para rastrear patrones naturales en la superficie del agua (espuma, sedimentos, turbulencias)."],
                    ["🔧","Unshake","Herramienta exclusiva de RIVeR 2.5 que corrige el movimiento residual de cámara antes del análisis, mejorando los resultados en videos tomados sin trípode."],
                    ["📐","Ortorectificación","Corrige la perspectiva del video usando los 4 puntos de control (GCPs) con coordenadas reales, transformando la imagen oblicua en una vista cenital métrica."],
                    ["📊","Análisis estadístico","Genera campos vectoriales de velocidad, histogramas, perfiles transversales y estadísticas de velocidad media y máxima."],
                  ].map(([icon,title,desc])=>(
                    <div key={title} className="method-step">
                      <div style={{ fontSize: 22, minWidth: 28, paddingTop: 2 }}>{icon}</div>
                      <div>
                        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.92rem", color: "#CBD5E1", marginBottom: 3 }}>{title}</div>
                        <div style={{ fontSize: "0.7rem", color: "#64748B", lineHeight: 1.7 }}>{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ textAlign: "center", padding: "0.7rem 0", borderTop: "1px solid #1E293B" }}>
              <div style={{ fontSize: "0.6rem", color: "#334155", letterSpacing: "0.12em" }}>FLOODVELO · UNT · TUCUMÁN · CIENCIA CIUDADANA ABIERTA</div>
            </div>
          </div>
        )}
        {tab === "misvideos" && (
  <div style={{ display: "flex", flexDirection: "column", gap: "1.3rem" }}>
    <div className="card" style={{ padding: "1.35rem" }}>
      <div className="section-title">📹 TUS APORTES</div>
      {loadingSubs && <div style={{ textAlign: "center", padding: "2rem" }}>⏳ Cargando tus videos...</div>}
      {subsError && <div style={{ color: "#EF4444", fontSize: "0.75rem" }}>{subsError}</div>}
      {!loadingSubs && !subsError && userSubmissions.length === 0 && (
        <div style={{ textAlign: "center", padding: "2rem", color: "#64748B" }}>
          Aún no subiste ningún video. 🌊 ¡Animate a contribuir!
        </div>
      )}
      {userSubmissions.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1E293B", color: "#64748B", textAlign: "left" }}>
                <th style={{ padding: "0.5rem 0.2rem" }}>Fecha evento</th>
                <th style={{ padding: "0.5rem 0.2rem" }}>Localidad</th>
                <th style={{ padding: "0.5rem 0.2rem" }}>Estado</th>
                <th style={{ padding: "0.5rem 0.2rem" }}>Velocidad (m/s)</th>
                <th style={{ padding: "0.5rem 0.2rem" }}>Video</th>
              </tr>
            </thead>
            <tbody>
              {userSubmissions.map(sub => (
                <tr key={sub.id} style={{ borderBottom: "1px solid #1E293B" }}>
                  <td style={{ padding: "0.6rem 0.2rem" }}>{sub.event_date || "—"}</td>
                  <td style={{ padding: "0.6rem 0.2rem" }}>{sub.locality || "—"}</td>
                  <td style={{ padding: "0.6rem 0.2rem" }}>
                    <span style={{
                      background: sub.status === "approved" ? "rgba(16,185,129,0.2)" : sub.status === "rejected" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)",
                      color: sub.status === "approved" ? "#10B981" : sub.status === "rejected" ? "#EF4444" : "#F59E0B",
                      padding: "0.1rem 0.4rem",
                      borderRadius: "3px",
                      fontSize: "0.6rem",
                      textTransform: "uppercase"
                    }}>
                      {sub.status === "approved" ? "Aprobado" : sub.status === "rejected" ? "Rechazado" : "Pendiente"}
                    </span>
                  </td>
                  <td style={{ padding: "0.6rem 0.2rem" }}>
                    {sub.velocity_ms ? `${sub.velocity_ms} m/s` : "—"}
                  </td>
                  <td style={{ padding: "0.6rem 0.2rem" }}>
                    {sub.file_path && (
                      <a href={sub.file_path} target="_blank" rel="noopener noreferrer" style={{ color: "#38BDF8", textDecoration: "none" }}>
                        Ver ▶
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </div>
)}
      </main>
    </div>
  );
}