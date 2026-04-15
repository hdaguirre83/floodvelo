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

const MIN_DURATION_SEC = 15;
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

const EMPTY_FORM = { dept: "Capital", locality: "", date: "", time: "", condition: "", camera: "", notes: "", lat: "", lng: "", alt_contact: "" };

const handleGoogleLogin = async () => {
  const redirectUrl = import.meta.env.PROD 
    ? 'https://floodvelo.vercel.app' 
    : window.location.origin;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectUrl, queryParams: { access_type: 'offline', prompt: 'consent' } }
  });
  if (error) console.error("Error en login:", error);
};

const handleLogout = async () => {
  await supabase.auth.signOut();
  window.location.reload();
};

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
  const [cameraActive, setCameraActive] = useState(false);
  const [mediaStream, setMediaStream] = useState(null);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recording, setRecording] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const fileRef = useRef();
  const videoRef = useRef(null);
  const xhrRef = useRef(null);

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

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  // --- Validación del formulario con mensajes
  const getFormValidationError = () => {
    if (!selectedFile) return "📹 Seleccioná un video primero.";
    if (!qcResult) return "⏳ Analizando calidad del video...";
    if (!qcResult.passed) return "❌ El video no cumple los requisitos mínimos (duración ≥15s, resolución ≥720p).";
    if (!form.date) return "📅 Completá la fecha del evento.";
    if (!form.time) return "⏰ Completá la hora de la captura.";
    if (!form.locality) return "📍 Completá la localidad / barrio.";
    if (form.lat && isNaN(parseFloat(form.lat))) return "🌐 La latitud debe ser un número válido (ej. -26.8241).";
    if (form.lng && isNaN(parseFloat(form.lng))) return "🌐 La longitud debe ser un número válido (ej. -65.2226).";
    return null;
  };

  const formValid = () => getFormValidationError() === null;

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) acceptFile(file);
  }, []);

  const acceptFile = async (file) => {
    if (preview) URL.revokeObjectURL(preview);
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
    setSuccess(false); setError(""); setQcResult(null); setQcLoading(true);
    const result = await analyzeVideo(file);
    setQcResult(result); setQcLoading(false);
  };
// --- Funciones para grabar video con cámara ---
const startCamera = async () => {
  setCameraError("");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setMediaStream(stream);
    setCameraActive(true);
  } catch (err) {
    console.error(err);
    setCameraError("No se pudo acceder a la cámara o micrófono. Verificá los permisos.");
  }
};

const stopCamera = () => {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    setMediaStream(null);
  }
  setCameraActive(false);
  setRecording(false);
  setMediaRecorder(null);
};

const startRecording = () => {
  if (!mediaStream) return;
  const chunks = [];
  const recorder = new MediaRecorder(mediaStream);
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: "video/mp4" });
    const file = new File([blob], `grabacion_${Date.now()}.mp4`, { type: "video/mp4" });
    acceptFile(file);
    stopCamera();
  };
  recorder.start();
  setMediaRecorder(recorder);
  setRecording(true);
};

const stopRecording = () => {
  if (mediaRecorder && recording) {
    mediaRecorder.stop();
    setRecording(false);
  }
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
    if (tab === "misvideos" && user) loadUserSubmissions();
  }, [tab, user]);

  useEffect(() => {
  if (videoRef.current && mediaStream) {
    videoRef.current.srcObject = mediaStream;
  }
}, [mediaStream]);

  const QCPanel = () => {
    if (qcLoading) return (
      <div style={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, padding: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span>🔍</span>
        <div style={{ fontSize: "0.72rem", color: "#64748B" }}>ANALIZANDO CALIDAD DEL VIDEO...</div>
      </div>
    );
    if (!qcResult) return null;
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

  if (authLoading) return <div style={{ background: "#0A0E1A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>Cargando...</div>;

  return (
    <div style={{ fontFamily: "'Courier New', monospace", background: "#0A0E1A", minHeight: "100vh", color: "#E2E8F0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Barlow+Condensed:wght@300;500;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0A0E1A; } ::-webkit-scrollbar-thumb { background: #1E3A5F; border-radius: 3px; }
        .nav-btn { background: transparent; border: none; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 1rem; font-weight: bold; letter-spacing: 0.05em; padding: 0.6rem 1.2rem; transition: all 0.2s; color: white; border-bottom: 2px solid transparent; }
        .nav-btn.active { color: #38BDF8; border-bottom-color: #38BDF8; }
        .nav-btn:hover:not(.active) { color: #94A3B8; background: rgba(255,255,255,0.05); border-radius: 4px; }
        .user-email { font-size: 0.8rem; color: #94A3B8; margin-right: 1rem; }
        .logout-btn { background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.5); border-radius: 4px; color: #EF4444; font-family: 'Space Mono', monospace; font-size: 0.7rem; padding: 0.3rem 0.7rem; cursor: pointer; transition: all 0.2s; }
        .logout-btn:hover { background: rgba(239,68,68,0.4); }
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
        a { color: #38BDF8; text-decoration: none; }
        a:hover { text-decoration: underline; }
      `}</style>

      <header style={{ borderBottom: "1px solid #1E293B", padding: "0.8rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {!user ? (
            <>
              <button className="nav-btn" onClick={() => setTab("about")}>📖 Metodología</button>
              <button className="nav-btn" onClick={handleGoogleLogin}>🔑 Iniciar sesión con Google</button>
            </>
          ) : (
            <>
              <button className={`nav-btn ${tab === "upload" ? "active" : ""}`} onClick={() => setTab("upload")}>📹 Capturar o subir video</button>
              <button className={`nav-btn ${tab === "about" ? "active" : ""}`} onClick={() => setTab("about")}>📖 Metodología</button>
              <button className={`nav-btn ${tab === "misvideos" ? "active" : ""}`} onClick={() => setTab("misvideos")}>📁 Mis videos</button>
            </>
          )}
          <button className={`nav-btn ${tab === "contacto" ? "active" : ""}`} onClick={() => setTab("contacto")}>📞 Contacto</button>
        </div>
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span className="user-email">{user.email}</span>
            <button className="logout-btn" onClick={handleLogout}>Salir</button>
          </div>
        )}
      </header>

      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "1.75rem 1.5rem" }}>
        {tab === "upload" && user && (
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
                    </button> antes de grabar.
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {["LSPIV","RIVeR","Unshake","GCPs"].map(t => <span key={t} className="tech-tag">{t}</span>)}
                </div>
              </div>
            </div>
            <div style={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, padding: "0.85rem 1.1rem" }}>
              <div style={{ fontSize: "0.63rem", color: "#64748B", letterSpacing: "0.1em", marginBottom: "0.5rem", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700 }}>REQUISITOS MÍNIMOS DEL VIDEO</div>
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.68rem", color: "#94A3B8" }}>⏱ Duración: <strong style={{ color: "#CBD5E1" }}>mín. 15-20 seg</strong></span>
                <span style={{ fontSize: "0.68rem", color: "#94A3B8" }}>📐 Resolución: <strong style={{ color: "#CBD5E1" }}>mín. 720p</strong></span>
                <span style={{ fontSize: "0.68rem", color: "#94A3B8" }}>🔒 Sin zoom ni paneo</span>
                <span style={{ fontSize: "0.68rem", color: "#94A3B8" }}>📍 4 puntos fijos visibles</span>
              </div>
            </div>
<div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
  <button 
    onClick={startCamera}
    style={{ background: "#0EA5E9", border: "none", borderRadius: "4px", color: "white", fontFamily: "'Space Mono', monospace", fontSize: "0.72rem", padding: "0.5rem 1rem", cursor: "pointer" }}
  >
    🎥 Grabar video ahora
  </button>
  <span style={{ fontSize: "0.65rem", color: "#64748B" }}>📱 Funciona mejor en celular</span>
</div>
{cameraActive && (
  <div className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", maxHeight: "400px", borderRadius: "8px", background: "#000" }}
      />
      <div>
        {!recording ? (
          <button onClick={startRecording} style={{ background: "#EF4444", border: "none", borderRadius: "4px", color: "white", padding: "0.5rem 1rem", cursor: "pointer" }}>🔴 Comenzar grabación</button>
        ) : (
          <button onClick={stopRecording} style={{ background: "#10B981", border: "none", borderRadius: "4px", color: "white", padding: "0.5rem 1rem", cursor: "pointer" }}>⏹️ Detener grabación</button>
        )}
        <button onClick={stopCamera} style={{ marginLeft: "0.5rem", background: "#475569", border: "none", borderRadius: "4px", color: "white", padding: "0.5rem 1rem", cursor: "pointer" }}>✕ Cerrar cámara</button>
      </div>
    </div>
    {cameraError && <div style={{ color: "#EF4444", fontSize: "0.7rem", marginTop: "0.5rem" }}>{cameraError}</div>}
  </div>
)}    
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
            {selectedFile && <QCPanel />}
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
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div style={{ fontSize: "0.64rem", color: "#334155" }}><span className="req">*</span> Obligatorio: video aprobado · fecha · hora · localidad</div>
                  <button className="upload-btn" disabled={!formValid()} onClick={handleUpload}>ENVIAR PARA ANÁLISIS →</button>
                </div>
                {getFormValidationError() && (
                  <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "0.5rem", fontSize: "0.7rem", color: "#EF4444", textAlign: "center" }}>
                    {getFormValidationError()}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === "about" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.3rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {[["guia","🎥  Cómo Filmar"],["proceso","⚙️  Procesamiento"],["cazadores","🌊 Proyecto Cazadores de Crecidas"]].map(([id,label])=>(
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
                  <img src="/guia_ejemplos.png" alt="Ejemplos de videos correctos e incorrectos" style={{ width: "100%", borderRadius: 6, border: "1px solid #1E293B" }} />
                  <p className="photo-caption">✅ Correctos: vista desde puente con orillas visibles · ❌ Incorrectos: zoom excesivo sin referencias.</p>
                </div>
                <div className="grid2">
                  <GuideItem icon="📍" title="1. POSICIÓN DE LA CÁMARA" color="#38BDF8" items={["Filmá desde posición elevada (puente, orilla alta)","Apuntá en ángulo oblicuo al flujo","Ideal: cámara fija","Incluí la mayor superficie de agua posible"]} />
                  <GuideItem icon="🏗️" title="2. REFERENCIAS FIJAS" color="#38BDF8" items={["Asegurate que se vean objetos fijos en orillas","Permiten convertir píxeles a metros","4 puntos no alineados visibles"]} />
                  <GuideItem icon="⏱️" title="3. DURACIÓN Y ESTABILIDAD" color="#10B981" items={["Filmá al menos 15-20 segundos","Mové la cámara lo menos posible","Evitá paneos o zoom"]} />
                  <GuideItem icon="💡" title="4. CONDICIONES IDEALES" color="#10B981" items={["Superficie con partículas visibles","Evitá reflejos intensos","Luz natural diurna"]} />
                </div>
                <GuideItem icon="🚫" title="5. QUÉ NO HACER" color="#EF4444" items={["❌ No hacer paneo","❌ No grabar en movimiento","❌ Sin referencias fijas","❌ Zoom digital","❌ Menos de 15 segundos"]} />
              </div>
            )}
            {metodoTab === "proceso" && (
              <div className="about-card">
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.1em", color: "#ffffff", marginBottom: "0.85rem" }}>FLUJO COMPLETO DE PROCESAMIENTO</div>
                {[
                  ["01","Control de calidad automático","Se verifica duración y resolución mínimas."],
                  ["02","Carga y almacenamiento","Subida a la nube y guardado de metadatos."],
                  ["03","Revisión técnica","Equipo revisa estabilidad y GCPs."],
                  ["04","Puntos de control (GCPs)","Marcado de 4 puntos con coordenadas reales."],
                  ["05","Procesamiento con RIVeR","Unshake, ortorectificación y LSPIV."],
                  ["06","Reporte de resultados","Velocidad estimada cargada en el sistema."],
                ].map(([n,title,desc])=>(
                  <div key={n} className="method-step">
                    <span className="step-num">{n}</span>
                    <div><div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.92rem", color: "#CBD5E1" }}>{title}</div><div style={{ fontSize: "0.7rem", color: "#64748B" }}>{desc}</div></div>
                  </div>
                ))}
              </div>
            )}
            {metodoTab === "cazadores" && (
              <div className="about-card">
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "1.5rem", color: "#38BDF8", marginBottom: "1rem" }}>
                  🌊 Proyecto Cazadores de Crecidas
                </div>
                <div style={{ fontSize: "0.85rem", lineHeight: 1.7, color: "#CBD5E1", marginBottom: "1.5rem" }}>
                  <p><strong>¿Qué es Cazadores de Crecidas?</strong></p>
                  <p>El proyecto Cazadores de Crecidas es una iniciativa de ciencia ciudadana que busca generar conciencia sobre la importancia de monitorear y preservar los recursos hídricos. Su objetivo principal es obtener datos técnicos precisos durante eventos de crecidas extremas en cursos de agua, lo cual es fundamental para la estimación de caudales en momentos donde los métodos de medición convencionales suelen ser difíciles de aplicar.</p>
                  <p>La participación de la ciudadanía es un pilar fundamental para el éxito de este proyecto, ya que se requiere de vecinos, personal de defensa civil, bomberos y policía para realizar grabaciones de videos de las crecidas en ríos y cuencas urbanas. El aporte de estos registros visuales permite al equipo científico procesar la información y convertir las imágenes en datos valiosos para la gestión hídrica.</p>
                  <p>Esta iniciativa surgió originalmente en la Universidad Nacional de Córdoba (UNC) y actualmente cuenta con el respaldo y la colaboración de universidades nacionales, el CONICET y organismos públicos de la provincia de Córdoba, como el Ministerio de Servicios Públicos y la Administración Provincial de Recursos Hídricos. El propósito de recolectar esta información es transferirla directamente a los organismos encargados del monitoreo de los recursos hídricos, quienes utilizan estos datos para mejorar la gestión y respuesta durante condiciones climáticas extremas.</p>
                  <p>Recientemente, Tucumán, a través de la Universidad Nacional de Tucumán (UNT), se ha sumado a esta red, ampliando el alcance de la iniciativa para fortalecer el monitoreo de las cuencas en el norte del país.</p>
                </div>
                <div style={{ background: "#0A0E1A", padding: "1rem", borderRadius: 8, marginTop: "1rem" }}>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "1rem", color: "#38BDF8" }}>📘 ¿Qué es RIVeR?</div>
                  <p style={{ fontSize: "0.75rem", color: "#94A3B8", marginTop: "0.5rem" }}>
                    RIVeR (Rapid Image Velocimetry and Ranging) es el software especializado que utilizamos para procesar los videos. Podés conocer más en su sitio oficial: <a href="https://riverdischarge.blogspot.com/" target="_blank" rel="noopener noreferrer">https://riverdischarge.blogspot.com/</a>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "misvideos" && user && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.3rem" }}>
            <div className="card" style={{ padding: "1.35rem" }}>
              <div className="section-title">📹 TUS APORTES</div>
              {loadingSubs && <div style={{ textAlign: "center", padding: "2rem" }}>⏳ Cargando tus videos...</div>}
              {subsError && <div style={{ color: "#EF4444", fontSize: "0.75rem" }}>{subsError}</div>}
              {!loadingSubs && !subsError && userSubmissions.length === 0 && (
                <div style={{ textAlign: "center", padding: "2rem", color: "#64748B" }}>Aún no subiste ningún video. 🌊 ¡Animate a contribuir!</div>
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
                            <span style={{ background: sub.status === "approved" ? "rgba(16,185,129,0.2)" : sub.status === "rejected" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)", color: sub.status === "approved" ? "#10B981" : sub.status === "rejected" ? "#EF4444" : "#F59E0B", padding: "0.1rem 0.4rem", borderRadius: "3px", fontSize: "0.6rem", textTransform: "uppercase" }}>
                              {sub.status === "approved" ? "Aprobado" : sub.status === "rejected" ? "Rechazado" : "Pendiente"}
                            </span>
                          </td>
                          <td style={{ padding: "0.6rem 0.2rem" }}>{sub.velocity_ms ? `${sub.velocity_ms} m/s` : "—"}</td>
                          <td style={{ padding: "0.6rem 0.2rem" }}>{sub.file_path && <a href={sub.file_path} target="_blank" rel="noopener noreferrer" style={{ color: "#38BDF8" }}>Ver ▶</a>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "contacto" && (
          <div className="card" style={{ padding: "1.5rem", textAlign: "center" }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "1.8rem", color: "#38BDF8", marginBottom: "1rem" }}>📬 Contacto</div>
            <div style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>✉️ <a href="mailto:CazadoresdeCrecidas@gmail.com">CazadoresdeCrecidas@gmail.com</a></div>
            <div style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>📞 WhatsApp / Teléfono: <strong>+54 381 000-0000</strong> (próximamente línea oficial)</div>
            <div style={{ fontSize: "0.75rem", color: "#64748B", marginTop: "1rem" }}>Podés escribirnos para consultas, sugerencias o para sumarte como voluntario.</div>
          </div>
        )}
      </main>
    </div>
  );
}