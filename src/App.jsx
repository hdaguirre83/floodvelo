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
const MIN_DURATION_SEC = 15;   // ✅ unificado en 15 segundos
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

// Formulario inicial (sin datos de contacto obligatorios)
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

// Pantalla de login (se muestra si no hay usuario)
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
  const fileRef = useRef();
  const xhrRef = useRef(null);

  // --- Efecto de autenticación ---
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

  // Validación: video aprobado + fecha + hora + localidad + coordenadas numéricas si se ingresaron
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

        const latNum = form.lat ? parseFloat(form.lat) : null;
        const lngNum = form.lng ? parseFloat(form.lng) : null;

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
          alt_contact: form.alt_contact || null,   // campo opcional
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
      xhrRef.current = null;   // ✅ limpiar referencia
    }
    setUploading(false);
    setUploadProgress(0);
    setUploadStage("");
    setError("Subida cancelada.");
  };

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
        {/* ... mismo contenido que tenías, pero con textos actualizados a 15 segundos ... */}
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

  // Componente GuideItem (sin cambios, solo lo copio por completitud)
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

  // --- Render principal ---
  return (
    <div style={{ fontFamily: "'Courier New', monospace", background: "#0A0E1A", minHeight: "100vh", color: "#E2E8F0" }}>
      <style>{`... (tus estilos) ...`}</style>

      {/* Header (igual, pero muestra email de Google) */}
      <header style={{ borderBottom: "1px solid #1E293B", padding: "0.9rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
          <div style={{ position: "relative", width: 40, height: 40, borderRadius: 6, background: "linear-gradient(135deg,#0369A1,#075985)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, overflow: "hidden" }}>
            🌊<div className="scan-line" />
          </div>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "1.35rem", fontWeight: 900 }}>FLOODVELO</div>
            <div style={{ fontSize: "0.58rem", letterSpacing: "0.16em", color: "#38BDF8" }}>Velocimetría por imágenes · Tucumán</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {!authLoading && (
            user ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "0.65rem", color: "#38BDF8" }}>👤 {user.email}</span>
                <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: "1px solid #475569", borderRadius: "4px", color: "#94A3B8", fontSize: "0.6rem", padding: "0.2rem 0.6rem", cursor: "pointer" }}>Salir</button>
              </div>
            ) : (
              <button onClick={handleGoogleLogin} style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.3)", borderRadius: "4px", color: "#38BDF8", fontSize: "0.65rem", padding: "0.3rem 0.8rem", cursor: "pointer" }}>🔑 Login con Google</button>
            )
          )}
          <span className="pulse-dot" />
          <span style={{ fontSize: "0.62rem", color: "#64748B" }}>SISTEMA ACTIVO</span>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid #1E293B", padding: "0 1.5rem", display: "flex" }}>
        <button className={`tab-btn ${tab==="upload"?"active":""}`} onClick={()=>setTab("upload")}>📤 Subir Video</button>
        <button className={`tab-btn ${tab==="about"?"active":""}`} onClick={()=>setTab("about")}>🔬 Metodología</button>
      </div>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "1.75rem 1.5rem" }}>
        {tab === "upload" && (
          !user ? <LoginScreen /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.3rem" }}>
              {/* Aquí va todo el contenido de upload que ya tenías, pero con el campo de contacto simplificado */}
              {/* ... (mantenés todo igual, solo cambiás la sección de contacto) ... */}

              {/* Nueva sección de contacto (opcional) */}
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

              {/* El resto del formulario (fecha, lugar, coordenadas, etc.) sigue igual */}
              {/* ... (repetí el código de upload que ya funcionaba, solo reemplazá la sección de contacto) ... */}

              {/* Botón de envío */}
              {uploading ? (
                <div className="card" style={{ padding: "1.35rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.7rem" }}>
                    <div style={{ fontSize: "0.68rem", color: "#38BDF8" }}>{uploadStage} {uploadProgress}%</div>
                    <button className="cancel-btn" onClick={cancelUpload}>✕ CANCELAR</button>
                  </div>
                  <div className="progress-bar-outer"><div className="progress-bar-inner" style={{ width: `${uploadProgress}%` }} /></div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="upload-btn" disabled={!formValid()} onClick={handleUpload}>ENVIAR PARA ANÁLISIS →</button>
                </div>
              )}
            </div>
          )
        )}

        {tab === "about" && (
          // ... tu contenido de metodología sin cambios ...
          <div>Metodología (sin cambios)</div>
        )}
      </main>
    </div>
  );
}