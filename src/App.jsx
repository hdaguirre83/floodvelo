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
const MIN_DURATION_SEC = 10;
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

const EMPTY_FORM = { dept: "Capital", locality: "", date: "", time: "", condition: "", camera: "", notes: "" };

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  const [tab, setTab] = useState("upload");
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
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const fileRef = useRef();
  const xhrRef = useRef(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      else setLoadingAuth(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      else { setLoadingAuth(false); setProfile(null); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (data) {
      setProfile(data);
      setShowProfileForm(false);
    } else {
      // Primera vez — mostrar formulario de perfil
      setShowProfileForm(true);
    }
    setLoadingAuth(false);
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  const saveProfile = async () => {
    if (!profileForm.full_name.trim()) return;
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").upsert({
      id: session.user.id,
      email: session.user.email,
      full_name: profileForm.full_name,
      phone: profileForm.phone || null,
    });
    if (!error) {
      setProfile({ id: session.user.id, email: session.user.email, ...profileForm });
      setShowProfileForm(false);
    }
    setSavingProfile(false);
  };

  // ── Archivo ───────────────────────────────────────────────────────────────
  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) acceptFile(file);
  }, []);

  const acceptFile = async (file) => {
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
      (pos) => { setLat(pos.coords.latitude.toFixed(6)); setLng(pos.coords.longitude.toFixed(6)); setGeoLoading(false); },
      () => { setGeoError("No se pudo obtener la ubicación. Podés ingresarla manualmente."); setGeoLoading(false); }
    );
  };

  const formValid = selectedFile && form.date && form.time && form.locality && qcResult?.passed;

  const handleUpload = () => {
    if (!formValid) return;
    setUploading(true); setUploadProgress(0); setUploadStage("Subiendo video..."); setError("");
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
        setUploadProgress(90); setUploadStage("Guardando datos...");
        const { error: dbError } = await supabase.from("submissions").insert({
          file_name: selectedFile.name, file_path: cloudData.secure_url,
          file_size_mb: parseFloat((selectedFile.size / 1e6).toFixed(2)),
          event_date: form.date, event_time: form.time, department: form.dept, locality: form.locality,
          lat: lat ? parseFloat(lat) : null, lng: lng ? parseFloat(lng) : null,
          light_condition: form.condition || null, camera_type: form.camera || null,
          notes: form.notes || null,
          user_name: profile?.full_name || null,
          contact: profile?.email || null,
          contact_type: "email",
          status: "pending",
        });
        if (dbError) { setError("Error al guardar datos: " + dbError.message); setUploading(false); return; }
        setUploadProgress(100);
        setTimeout(() => {
          setUploading(false); setUploadProgress(0); setUploadStage("");
          setSelectedFile(null); setPreview(null); setForm(EMPTY_FORM);
          setLat(""); setLng("");
          setSuccess(true); setGeoError(""); setQcResult(null);
        }, 500);
      } else {
        let msg = "Error al subir el video.";
        try { msg = JSON.parse(xhr.responseText)?.error?.message || msg; } catch {}
        setError(msg); setUploading(false);
      }
    };
    xhr.onerror = () => { setError("Error de red."); setUploading(false); };
    xhr.open("POST", CLOUDINARY_URL);
    xhr.send(formData);
  };

  const cancelUpload = () => {
    if (xhrRef.current) xhrRef.current.abort();
    setUploading(false); setUploadProgress(0); setUploadStage(""); setError("Subida cancelada.");
  };

  const QCPanel = () => {
    if (qcLoading) return (
      <div style={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span>🔍</span><div style={{ fontSize: "0.72rem", color: "#64748B" }}>ANALIZANDO CALIDAD DEL VIDEO...</div>
      </div>
    );
    if (!qcResult) return null;
    const { duration, width, height, durationOk, resolutionOk, passed } = qcResult;
    return (
      <div style={{ background: passed ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${passed ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: 8, padding: "1rem 1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
          <span>{passed ? "✅" : "❌"}</span>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.95rem", color: passed ? "#10B981" : "#EF4444" }}>
            {passed ? "VIDEO APROBADO" : "VIDEO RECHAZADO — NO CUMPLE LOS REQUISITOS"}
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
              {!durationOk && <div style={{ fontSize: "0.65rem", color: "#94A3B8", marginTop: 2 }}>Grabá al menos {MIN_DURATION_SEC} segundos de flujo continuo.</div>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "#0A0E1A", borderRadius: 6, padding: "0.6rem 0.85rem" }}>
            <span>{resolutionOk ? "✅" : "❌"}</span>
            <div>
              <div style={{ fontSize: "0.65rem", color: "#64748B" }}>RESOLUCIÓN</div>
              <div style={{ fontSize: "0.78rem", color: resolutionOk ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                {width}x{height}px <span style={{ fontSize: "0.62rem", color: "#475569", fontWeight: 400 }}>(mínimo 720p)</span>
              </div>
              {!resolutionOk && <div style={{ fontSize: "0.65rem", color: "#94A3B8", marginTop: 2 }}>Usá una cámara con resolución mínima de 720p.</div>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (loadingAuth) return (
    <div style={{ background: "#0A0E1A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: "0.75rem", color: "#38BDF8", letterSpacing: "0.15em", fontFamily: "monospace" }}>CARGANDO...</div>
    </div>
  );

  // ── LOGIN SCREEN ───────────────────────────────────────────────────────────
  if (!session) return (
    <div style={{ fontFamily: "'Courier New', monospace", background: "#0A0E1A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .google-btn { display: flex; align-items: center; justify-content: center; gap: 0.75rem; background: #fff; border: none; border-radius: 6px; color: #1F2937; cursor: pointer; font-family: 'Arial', sans-serif; font-size: 0.9rem; font-weight: 600; padding: 0.85rem 2rem; width: 100%; transition: all 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
        .google-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.4); }
      `}</style>
      <div style={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 12, padding: "2.5rem 2rem", width: "100%", maxWidth: 380, textAlign: "center" }}>
        {/* Logo */}
        <img src="/cazacrecidas-192.png" alt="Logo" style={{ width: 80, height: 80, borderRadius: 16, marginBottom: "1.25rem" }} />
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "1.8rem", fontWeight: 900, color: "#F1F5F9", letterSpacing: "0.06em", lineHeight: 1 }}>
          CAZADORES DE CRECIDAS
        </div>
        <div style={{ fontSize: "0.62rem", color: "#38BDF8", letterSpacing: "0.16em", textTransform: "uppercase", marginTop: "0.3rem", marginBottom: "2rem" }}>
          Tucumán · Velocimetría por imágenes
        </div>

        <p style={{ fontSize: "0.75rem", color: "#64748B", lineHeight: 1.7, marginBottom: "1.75rem" }}>
          Para contribuir con videos de inundaciones necesitás identificarte con tu cuenta de Google. Tus datos son confidenciales y solo se usarán para contactarte si necesitamos más información.
        </p>

        <button className="google-btn" onClick={handleGoogleLogin}>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continuar con Google
        </button>

        <div style={{ marginTop: "1.5rem", fontSize: "0.6rem", color: "#334155", lineHeight: 1.6 }}>
          🔒 No compartimos tus datos con terceros.<br />
          Solo se usan para identificar tus contribuciones.
        </div>
      </div>
    </div>
  );

  // ── PROFILE COMPLETION SCREEN ──────────────────────────────────────────────
  if (showProfileForm) return (
    <div style={{ fontFamily: "'Courier New', monospace", background: "#0A0E1A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .field-input { width: 100%; background: #0A0E1A; border: 1px solid #1E3A5F; border-radius: 4px; color: #CBD5E1; font-family: 'Courier New', monospace; font-size: 0.82rem; padding: 0.6rem 0.8rem; outline: none; transition: border-color 0.2s; }
        .field-input:focus { border-color: #38BDF8; }
        .field-label { font-size: 0.63rem; letter-spacing: 0.12em; color: #64748B; text-transform: uppercase; margin-bottom: 0.3rem; display: block; }
        .save-btn { width: 100%; background: linear-gradient(135deg, #0369A1, #0EA5E9); border: none; border-radius: 4px; color: #fff; cursor: pointer; font-family: 'Courier New', monospace; font-size: 0.78rem; letter-spacing: 0.1em; padding: 0.75rem; text-transform: uppercase; font-weight: 700; transition: all 0.2s; margin-top: 0.5rem; }
        .save-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(14,165,233,0.3); }
        .save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>
      <div style={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 12, padding: "2.5rem 2rem", width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          {session.user.user_metadata?.avatar_url && (
            <img src={session.user.user_metadata.avatar_url} alt="avatar" style={{ width: 60, height: 60, borderRadius: "50%", marginBottom: "0.75rem", border: "2px solid #1E3A5F" }} />
          )}
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "1.3rem", fontWeight: 900, color: "#F1F5F9" }}>¡BIENVENIDO/A!</div>
          <div style={{ fontSize: "0.68rem", color: "#64748B", marginTop: "0.25rem" }}>Completá tu perfil para continuar</div>
          <div style={{ fontSize: "0.7rem", color: "#38BDF8", marginTop: "0.25rem" }}>{session.user.email}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="field-label">Nombre completo *</label>
            <input className="field-input" placeholder="ej: María García" value={profileForm.full_name} onChange={e=>setProfileForm(f=>({...f,full_name:e.target.value}))} />
          </div>
          <div>
            <label className="field-label">Teléfono / Celular (opcional)</label>
            <input className="field-input" type="tel" placeholder="+54 381 555-0000" value={profileForm.phone} onChange={e=>setProfileForm(f=>({...f,phone:e.target.value}))} />
          </div>
          <button className="save-btn" disabled={!profileForm.full_name.trim() || savingProfile} onClick={saveProfile}>
            {savingProfile ? "GUARDANDO..." : "GUARDAR Y CONTINUAR →"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── MAIN APP ───────────────────────────────────────────────────────────────
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
        @media (max-width: 580px) { .grid2 { grid-template-columns: 1fr; } }
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
        .logout-btn { background: none; border: 1px solid #334155; border-radius: 4px; color: #64748B; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 0.58rem; padding: 0.3rem 0.7rem; transition: all 0.2s; }
        .logout-btn:hover { border-color: #EF4444; color: #EF4444; }
        .photo-caption { font-size: 0.63rem; color: #475569; text-align: center; margin-top: 0.4rem; font-style: italic; }
      `}</style>

      {/* HEADER */}
      <header style={{ borderBottom: "1px solid #1E293B", padding: "0.9rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
          <div style={{ position: "relative", width: 40, height: 40, borderRadius: 6, overflow: "hidden" }}>
            <img src="/cazacrecidas-192.png" alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div className="scan-line" />
          </div>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "1.35rem", fontWeight: 900, letterSpacing: "0.06em", color: "#F1F5F9", lineHeight: 1 }}>CAZADORES DE CRECIDAS</div>
            <div style={{ fontSize: "0.58rem", letterSpacing: "0.16em", color: "#38BDF8", textTransform: "uppercase" }}>Velocimetría por imágenes · Tucumán</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {session.user.user_metadata?.avatar_url && (
            <img src={session.user.user_metadata.avatar_url} alt="avatar" style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid #1E3A5F" }} />
          )}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.68rem", color: "#CBD5E1" }}>{profile?.full_name || session.user.email}</div>
            <button className="logout-btn" onClick={handleLogout}>Cerrar sesión</button>
          </div>
        </div>
      </header>

      {/* TABS */}
      <div style={{ borderBottom: "1px solid #1E293B", padding: "0 1.5rem", display: "flex" }}>
        {[["upload","📤  Subir Video"],["about","🔬  Metodología"]].map(([id, label]) => (
          <button key={id} className={`tab-btn ${tab===id?"active":""}`} onClick={()=>setTab(id)}>{label}</button>
        ))}
      </div>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "1.75rem 1.5rem" }}>

        {/* ══ TAB: UPLOAD ══ */}
        {tab === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.3rem" }}>

            {success && (
              <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, padding: "0.9rem 1.2rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, color: "#10B981" }}>VIDEO ENVIADO CORRECTAMENTE</div>
                  <div style={{ fontSize: "0.67rem", color: "#64748B", marginTop: 2 }}>Gracias {profile?.full_name}! Tu video quedó registrado y será procesado por el equipo técnico.</div>
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
                    ¿Primera vez?{" "}
                    <button onClick={()=>{setTab("about");setMetodoTab("guia");}} style={{ background:"none", border:"none", cursor:"pointer", color:"#38BDF8", fontSize:"0.65rem", padding:0, textDecoration:"underline" }}>
                      Consultá la Guía de Filmación
                    </button>
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
                    <input className="field-input" style={{ flex: 1, minWidth: 110 }} placeholder="Latitud  ej: -26.8241" value={lat} onChange={e=>setLat(e.target.value)} disabled={uploading} />
                    <input className="field-input" style={{ flex: 1, minWidth: 110 }} placeholder="Longitud  ej: -65.2226" value={lng} onChange={e=>setLng(e.target.value)} disabled={uploading} />
                    <button className="geo-btn" disabled={geoLoading || uploading} onClick={getGeolocation}>{geoLoading ? "⏳ Detectando..." : "📍 Usar mi ubicación"}</button>
                  </div>
                  {geoError && <div style={{ fontSize: "0.64rem", color: "#F59E0B", marginTop: "0.4rem" }}>⚠ {geoError}</div>}
                  {lat && lng && !geoError && (
                    <div style={{ marginTop: "0.45rem", display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span className="coords-chip">✔ {lat}, {lng}</span>
                      <a className="map-link" href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer">Ver en mapa ↗</a>
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

            {/* Acción */}
            {uploading ? (
              <div className="card" style={{ padding: "1.35rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.7rem" }}>
                  <div style={{ fontSize: "0.68rem", color: "#38BDF8", letterSpacing: "0.1em" }}>{uploadStage} {uploadProgress}%</div>
                  <button className="cancel-btn" onClick={cancelUpload}>✕ CANCELAR</button>
                </div>
                <div className="progress-bar-outer"><div className="progress-bar-inner" style={{ width: `${uploadProgress}%` }} /></div>
                <div style={{ fontSize: "0.62rem", color: "#334155", marginTop: "0.5rem", textAlign: "center" }}>No cierres esta pestaña</div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                <div style={{ fontSize: "0.64rem", color: "#334155" }}><span className="req">*</span> Obligatorio: video aprobado · fecha · hora · localidad</div>
                <button className="upload-btn" disabled={!formValid} onClick={handleUpload}>ENVIAR PARA ANÁLISIS →</button>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: METODOLOGÍA ══ */}
        {tab === "about" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.3rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {[["guia","🎥  Cómo Filmar"],["proceso","⚙️  Procesamiento"],["river","🔬  RIVeR & LSPIV"]].map(([id,label])=>(
                <button key={id} className={`sub-tab ${metodoTab===id?"active":""}`} onClick={()=>setMetodoTab(id)}>{label}</button>
              ))}
            </div>

            {metodoTab === "guia" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div className="about-card" style={{ borderColor: "rgba(56,189,248,0.2)" }}>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "1.35rem", color: "#38BDF8", marginBottom: "0.5rem" }}>CÓMO FILMAR PARA QUE TU VIDEO SEA ÚTIL</div>
                  <p style={{ fontSize: "0.75rem", color: "#94A3B8", lineHeight: 1.8 }}>Para que podamos medir la velocidad del agua con tecnología LSPIV, seguí estas recomendaciones.</p>
                  <div style={{ marginTop: "0.75rem", background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.15)", borderRadius: 6, padding: "0.6rem 0.9rem", fontSize: "0.7rem", color: "#38BDF8" }}>
                    📌 <strong>Cuanto mejor sea el video, más precisa será la medición</strong>
                  </div>
                </div>
                <div className="about-card">
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.1em", color: "#64748B", marginBottom: "0.85rem" }}>EJEMPLOS CORRECTOS E INCORRECTOS</div>
                  <img src="/guia_ejemplos.png" alt="Ejemplos" style={{ width: "100%", borderRadius: 6, border: "1px solid #1E293B" }} />
                  <p className="photo-caption">✅ Vista desde puente con orillas visibles · ❌ Zoom excesivo sin referencias. (Imágenes: A. Patalano)</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  {[
                    ["📍","#38BDF8","1. POSICIÓN DE LA CÁMARA",["Filmá desde posición elevada (puente, orilla alta)","Apuntá en ángulo oblicuo al flujo","Cámara fija (apoyada o con pulso firme)","Incluí la mayor superficie de agua posible"]],
                    ["🏗️","#38BDF8","2. REFERENCIAS FIJAS",["Asegurate que se vean objetos fijos en las orillas","Árboles, postes, rocas, estructuras","Identificá 4 puntos fijos no alineados","Visibles durante todo el video"]],
                    ["⏱️","#10B981","3. DURACIÓN Y ESTABILIDAD",["Mínimo 15-20 segundos de flujo continuo","Mové la cámara lo menos posible","Evitá paneos o zoom","Más duración = mejor estimación"]],
                    ["💡","#10B981","4. CONDICIONES IDEALES",["Superficie con partículas visibles (espuma, hojas)","Evitá reflejos intensos o contraluz","Preferí luz natural diurna","Buena iluminación artificial si es nocturno"]],
                    ["🚫","#EF4444","5. QUÉ NO HACER",["❌ No hacer paneo","❌ No grabar en movimiento","❌ No enfocar solo el agua sin referencias","❌ No usar zoom digital","❌ No grabar con el sol de frente","❌ No cortar antes de 15 segundos"]],
                  ].map(([icon, color, title, items]) => (
                    <div key={title} style={{ background: "#0F172A", border: `1px solid ${color}25`, borderRadius: 8, padding: "1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem" }}>
                        <span style={{ fontSize: 18 }}>{icon}</span>
                        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.88rem", color, letterSpacing: "0.05em" }}>{title}</div>
                      </div>
                      <ul style={{ paddingLeft: "1rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                        {items.map((item, i) => <li key={i} style={{ fontSize: "0.7rem", color: "#94A3B8", lineHeight: 1.6 }}>{item}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="about-card">
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.1em", color: "#64748B", marginBottom: "0.85rem" }}>PUNTOS DE CONTROL (GCPs)</div>
                  <img src="/guia_puntos_control.png" alt="Puntos de control" style={{ width: "100%", borderRadius: 6, border: "1px solid #1E293B" }} />
                  <p className="photo-caption">Referencias fijas no alineadas sobre la superficie del agua para la ortorectificación. (Imagen: H. Aguirre)</p>
                </div>
              </div>
            )}

            {metodoTab === "proceso" && (
              <div className="about-card">
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.1em", color: "#64748B", marginBottom: "0.85rem" }}>FLUJO DE PROCESAMIENTO</div>
                {[
                  ["01","Control de calidad automático","Al seleccionar el video se verifica duración mínima y resolución 720p antes de permitir el envío."],
                  ["02","Ingesta y almacenamiento","El video se sube a la nube y los metadatos se guardan en la base de datos. Se notifica al equipo técnico."],
                  ["03","Revisión manual","El equipo revisa el video, verifica estabilidad y visibilidad de GCPs. Aprueba o rechaza."],
                  ["04","Marcado de GCPs","El técnico marca los 4 puntos de control con sus coordenadas GPS reales."],
                  ["05","Procesamiento con RIVeR 2.5","Se aplica Unshake, ortorectificación y LSPIV para calcular vectores de velocidad superficial."],
                  ["06","Reporte de resultados","La velocidad estimada (m/s) queda disponible en el mapa de eventos."],
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
                    <strong style={{color:"#CBD5E1"}}>RIVeR (Rapid Image Velocimetry and Ranging)</strong> es un software especializado en LSPIV para ríos y canales. Desarrollado por Antoine Patalano y colaboradores, estima la velocidad superficial del flujo a partir de videos sin instrumentación en contacto con el agua.
                  </p>
                </div>
                <div className="about-card">
                  {[["🎯","LSPIV","Correlación cruzada entre ventanas para rastrear patrones naturales en la superficie del agua."],["🔧","Unshake","Corrige el movimiento residual de cámara antes del análisis."],["📐","Ortorectificación","Corrige la perspectiva usando los 4 GCPs con coordenadas reales."],["📊","Análisis estadístico","Genera campos vectoriales, histogramas y velocidad media y máxima."]].map(([icon,title,desc])=>(
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
              <div style={{ fontSize: "0.6rem", color: "#334155", letterSpacing: "0.12em" }}>CAZADORES DE CRECIDAS · UNT · TUCUMÁN · CIENCIA CIUDADANA</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
