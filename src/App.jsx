import React, { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "./supabaseClient";

const VIDEO_CONDITIONS = ["Diurno - cielo despejado","Diurno - nublado","Diurno - lluvia activa","Nocturno - iluminado","Nocturno - sin iluminación"];
const CAMERA_TYPES = ["Smartphone (frontal)","Smartphone (trasera)","Drone / UAV","Cámara fija instalada","Cámara de acción (GoPro, etc.)","Otro"];
const TUCUMAN_DEPTS = ["Capital","Burruyacú","Cruz Alta","Chicligasta","Famaillá","Graneros","Juan B. Alberdi","La Cocha","Leales","Lules","Monteros","Río Chico","Simoca","Tafí del Valle","Tafí Viejo","Trancas","Yerba Buena"];

const STATUS_CONFIG = {
  pending:    { label: "En cola",    color: "#F59E0B", icon: "⏳" },
  processing: { label: "Procesando", color: "#3B82F6", icon: "⚙️" },
  done:       { label: "Completado", color: "#10B981", icon: "✅" },
  error:      { label: "Error",      color: "#EF4444", icon: "❌" },
};

const EMPTY_FORM = { name: "", dept: "Capital", locality: "", date: "", time: "", condition: "", camera: "", notes: "", contact: "", lat: "", lng: "" };

export default function App() {
  const [tab, setTab] = useState("upload");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [contactType, setContactType] = useState("email");
  const fileRef = useRef();

  // ── Cargar envíos desde Supabase ──────────────────────────────────────────
  const loadSubmissions = async () => {
    setLoadingSubmissions(true);
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setSubmissions(data);
    setLoadingSubmissions(false);
  };

  useEffect(() => {
    if (tab === "gallery") loadSubmissions();
  }, [tab]);

  // ── Archivo ───────────────────────────────────────────────────────────────
  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) acceptFile(file);
  }, []);

  const acceptFile = (file) => {
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
    setSuccess(false);
    setError("");
  };

  const setF = (key, val) => setForm(f => ({ ...f, [key]: val }));

  // ── Geolocalización ───────────────────────────────────────────────────────
  const getGeolocation = () => {
    if (!navigator.geolocation) { setGeoError("Tu navegador no soporta geolocalización."); return; }
    setGeoLoading(true); setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setF("lat", pos.coords.latitude.toFixed(6)); setF("lng", pos.coords.longitude.toFixed(6)); setGeoLoading(false); },
      () => { setGeoError("No se pudo obtener la ubicación. Podés ingresarla manualmente."); setGeoLoading(false); }
    );
  };

  const formValid = selectedFile && form.date && form.time && form.locality && form.contact;

  // ── Upload real a Supabase ────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!formValid) return;
    setUploading(true);
    setUploadProgress(10);
    setError("");

    try {
      // 1. Subir el archivo al storage
      const ext = selectedFile.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const filePath = `videos/${fileName}`;

      setUploadProgress(30);

      const { error: storageError } = await supabase.storage
        .from("videos")
        .upload(filePath, selectedFile, { cacheControl: "3600", upsert: false });

      if (storageError) throw new Error("Error al subir el video: " + storageError.message);

      setUploadProgress(70);

      // 2. Guardar los metadatos en la base de datos
      const { error: dbError } = await supabase.from("submissions").insert({
        file_name:       selectedFile.name,
        file_path:       filePath,
        file_size_mb:    parseFloat((selectedFile.size / 1e6).toFixed(2)),
        event_date:      form.date,
        event_time:      form.time,
        department:      form.dept,
        locality:        form.locality,
        lat:             form.lat ? parseFloat(form.lat) : null,
        lng:             form.lng ? parseFloat(form.lng) : null,
        light_condition: form.condition || null,
        camera_type:     form.camera || null,
        notes:           form.notes || null,
        user_name:       form.name || null,
        contact:         form.contact,
        contact_type:    contactType,
        status:          "pending",
      });

      if (dbError) throw new Error("Error al guardar los datos: " + dbError.message);

      setUploadProgress(100);
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        setSelectedFile(null);
        setPreview(null);
        setForm(EMPTY_FORM);
        setSuccess(true);
        setGeoError("");
      }, 500);

    } catch (err) {
      setError(err.message);
      setUploading(false);
      setUploadProgress(0);
    }
  };

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
        .field-label { font-size: 0.63rem; letter-spacing: 0.12em; color: #64748B; text-transform: uppercase; margin-bottom: 0.3rem; display: block; }
        .field-input { width: 100%; background: #0F172A; border: 1px solid #1E3A5F; border-radius: 4px; color: #CBD5E1; font-family: 'Space Mono', monospace; font-size: 0.78rem; padding: 0.52rem 0.7rem; outline: none; transition: border-color 0.2s; }
        .field-input:focus { border-color: #38BDF8; }
        .field-input::placeholder { color: #334155; }
        select.field-input option { background: #0F172A; }
        .upload-btn { background: linear-gradient(135deg, #0369A1, #0EA5E9); border: none; border-radius: 4px; color: #fff; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 0.72rem; letter-spacing: 0.1em; padding: 0.75rem 1.75rem; text-transform: uppercase; transition: all 0.25s; font-weight: 700; }
        .upload-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(14,165,233,0.35); }
        .upload-btn:disabled { opacity: 0.38; cursor: not-allowed; }
        .geo-btn { background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.35); border-radius: 4px; color: #38BDF8; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 0.65rem; letter-spacing: 0.06em; padding: 0.52rem 0.8rem; transition: all 0.2s; white-space: nowrap; }
        .geo-btn:hover:not(:disabled) { background: rgba(56,189,248,0.18); }
        .geo-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        @media (max-width: 580px) { .grid2 { grid-template-columns: 1fr; } }
        .status-badge { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.62rem; letter-spacing: 0.07em; padding: 0.18rem 0.55rem; border-radius: 3px; font-weight: 700; }
        .scan-line { position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #38BDF8, transparent); animation: scan 3s linear infinite; }
        @keyframes scan { 0%{top:0%} 100%{top:100%} }
        .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: #10B981; animation: pulse 1.5s ease-in-out infinite; display: inline-block; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
        .card { background: #0F172A; border: 1px solid #1E293B; border-radius: 8px; }
        .hover-row:hover { background: #162032 !important; }
        .drop-zone { border: 2px dashed #1E3A5F; border-radius: 8px; transition: all 0.3s; cursor: pointer; }
        .drop-zone.over { border-color: #38BDF8; background: rgba(56,189,248,0.04); }
        .tech-tag { background: rgba(56,189,248,0.08); border: 1px solid rgba(56,189,248,0.2); color: #38BDF8; font-size: 0.58rem; letter-spacing: 0.12em; padding: 0.12rem 0.45rem; border-radius: 2px; text-transform: uppercase; }
        .progress-bar-outer { background: #1E293B; border-radius: 2px; overflow: hidden; height: 6px; }
        .progress-bar-inner { height: 100%; background: linear-gradient(90deg, #0369A1, #38BDF8, #7DD3FC); border-radius: 2px; transition: width 0.5s; }
        .contact-toggle { display: inline-flex; border: 1px solid #1E3A5F; border-radius: 4px; overflow: hidden; }
        .contact-toggle button { background: none; border: none; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 0.65rem; padding: 0.38rem 0.9rem; transition: all 0.2s; letter-spacing: 0.06em; }
        .contact-toggle button.active { background: #0EA5E9; color: #fff; }
        .contact-toggle button:not(.active) { color: #475569; }
        .contact-toggle button:not(.active):hover { color: #94A3B8; }
        .coords-chip { display: inline-flex; align-items: center; gap: 0.35rem; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 3px; padding: 0.15rem 0.5rem; font-size: 0.62rem; color: #10B981; }
        .about-card { background: #0F172A; border: 1px solid #1E293B; border-radius: 8px; padding: 1.4rem; }
        .method-step { display: flex; gap: 1rem; padding: 0.9rem 0; border-bottom: 1px solid #1E293B; align-items: flex-start; }
        .step-num { font-family: 'Barlow Condensed', sans-serif; font-size: 2.4rem; font-weight: 900; color: #1E3A5F; line-height: 1; min-width: 2.4rem; }
        .velocity-badge { font-family: 'Barlow Condensed', sans-serif; font-size: 1.3rem; font-weight: 700; color: #38BDF8; }
        textarea.field-input { resize: vertical; min-height: 68px; }
        .req { color: #EF4444; margin-left: 2px; }
        .section-title { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: 0.1em; font-size: 0.82rem; color: #64748B; margin-bottom: 1.1rem; border-bottom: 1px solid #1E293B; padding-bottom: 0.6rem; }
        a.map-link { color: #38BDF8; text-decoration: none; font-size: 0.63rem; }
        a.map-link:hover { text-decoration: underline; }
      `}</style>

      {/* HEADER */}
      <header style={{ borderBottom: "1px solid #1E293B", padding: "0.9rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
          <div style={{ position: "relative", width: 40, height: 40, borderRadius: 6, background: "linear-gradient(135deg,#0369A1,#075985)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, overflow: "hidden" }}>
            🌊<div className="scan-line" />
          </div>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "1.35rem", fontWeight: 900, letterSpacing: "0.06em", color: "#F1F5F9", lineHeight: 1 }}>FLOODVELO</div>
            <div style={{ fontSize: "0.58rem", letterSpacing: "0.16em", color: "#38BDF8", textTransform: "uppercase" }}>Velocimetría por imágenes · Tucumán, Argentina</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className="pulse-dot" />
          <span style={{ fontSize: "0.62rem", color: "#64748B", letterSpacing: "0.1em" }}>SISTEMA ACTIVO</span>
        </div>
      </header>

      {/* TABS */}
      <div style={{ borderBottom: "1px solid #1E293B", padding: "0 1.5rem", display: "flex" }}>
        {[["upload","📤  Subir Video"],["about","🔬  Metodología"]].map(([id, label]) => (
          <button key={id} className={`tab-btn ${tab===id?"active":""}`} onClick={()=>setTab(id)}>{label}</button>
        ))}
      </div>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "1.75rem 1.5rem" }}>

        {/* ══ TAB: UPLOAD ══ */}
        {tab === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.3rem" }}>

            {success && (
              <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, padding: "0.9rem 1.2rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, color: "#10B981", letterSpacing: "0.05em" }}>VIDEO ENVIADO Y GUARDADO CORRECTAMENTE</div>
                  <div style={{ fontSize: "0.67rem", color: "#64748B", marginTop: 2 }}>Tu video quedó registrado en nuestra base de datos. Te contactaremos si necesitamos más información.</div>
                </div>
              </div>
            )}

            {error && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "0.9rem 1.2rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <span style={{ fontSize: 20 }}>❌</span>
                <div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, color: "#EF4444", letterSpacing: "0.05em" }}>ERROR AL ENVIAR</div>
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
                    Subí un video de inundación en Tucumán. Los algoritmos PIV/LSPIV estimarán la velocidad superficial del flujo.
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {["LSPIV","PIV","SSIV","Optical Flow"].map(t => <span key={t} className="tech-tag">{t}</span>)}
                </div>
              </div>
            </div>

            {/* Drop zone */}
            <div
              className={`drop-zone${dragOver?" over":""}`}
              style={{ padding: "2rem 1.5rem", textAlign: "center" }}
              onDragOver={e=>{e.preventDefault();setDragOver(true)}}
              onDragLeave={()=>setDragOver(false)}
              onDrop={handleDrop}
              onClick={()=>fileRef.current.click()}
            >
              <input ref={fileRef} type="file" accept="video/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&acceptFile(e.target.files[0])} />
              {preview ? (
                <div onClick={e=>e.stopPropagation()}>
                  <video src={preview} style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 6, border: "1px solid #1E3A5F" }} controls />
                  <div style={{ marginTop: "0.6rem", fontSize: "0.7rem", color: "#38BDF8" }}>📹 {selectedFile?.name} · {(selectedFile?.size/1e6).toFixed(1)} MB</div>
                  <button style={{ marginTop: "0.4rem", background: "none", border: "none", color: "#475569", fontSize: "0.62rem", cursor: "pointer" }} onClick={e=>{e.stopPropagation();setSelectedFile(null);setPreview(null);}}>✕ CAMBIAR VIDEO</button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 32, marginBottom: "0.6rem" }}>🎥</div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "1rem", color: "#CBD5E1" }}>ARRASTRÁ O HACÉ CLICK PARA SELECCIONAR</div>
                  <div style={{ fontSize: "0.67rem", color: "#475569", marginTop: "0.35rem" }}>MP4, MOV, AVI, MKV — máx. 2 GB</div>
                  <div style={{ marginTop: "0.9rem", display: "flex", justifyContent: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                    {["📐 Vista cenital","⏱ Mín. 10 seg","💡 Buena luz"].map(h=>(
                      <span key={h} style={{ fontSize: "0.62rem", color: "#334155", background: "#162032", padding: "0.18rem 0.55rem", borderRadius: 3 }}>{h}</span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* CUÁNDO Y DÓNDE */}
            <div className="card" style={{ padding: "1.35rem" }}>
              <div className="section-title">📅 CUÁNDO Y DÓNDE OCURRIÓ</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div className="grid2">
                  <div>
                    <label className="field-label">Fecha del evento <span className="req">*</span></label>
                    <input type="date" className="field-input" value={form.date} onChange={e=>setF("date",e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Hora de la captura <span className="req">*</span></label>
                    <input type="time" className="field-input" value={form.time} onChange={e=>setF("time",e.target.value)} />
                  </div>
                </div>
                <div className="grid2">
                  <div>
                    <label className="field-label">Departamento <span className="req">*</span></label>
                    <select className="field-input" value={form.dept} onChange={e=>setF("dept",e.target.value)}>
                      {TUCUMAN_DEPTS.map(d=><option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Localidad / Barrio <span className="req">*</span></label>
                    <input className="field-input" placeholder="ej: Villa Urquiza, Los Pocitos..." value={form.locality} onChange={e=>setF("locality",e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="field-label">Coordenadas GPS <span style={{ color: "#334155", textTransform: "none", fontSize: "0.6rem", letterSpacing: 0, marginLeft: 6 }}>— opcional</span></label>
                  <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                    <input className="field-input" style={{ flex: 1, minWidth: 110 }} placeholder="Latitud  ej: -26.8241" value={form.lat} onChange={e=>setF("lat",e.target.value)} />
                    <input className="field-input" style={{ flex: 1, minWidth: 110 }} placeholder="Longitud  ej: -65.2226" value={form.lng} onChange={e=>setF("lng",e.target.value)} />
                    <button className="geo-btn" disabled={geoLoading} onClick={getGeolocation}>
                      {geoLoading ? "⏳ Detectando..." : "📍 Usar mi ubicación"}
                    </button>
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
                  <div>
                    <label className="field-label">Condiciones de luz</label>
                    <select className="field-input" value={form.condition} onChange={e=>setF("condition",e.target.value)}>
                      <option value="">— seleccionar —</option>
                      {VIDEO_CONDITIONS.map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Tipo de cámara</label>
                    <select className="field-input" value={form.camera} onChange={e=>setF("camera",e.target.value)}>
                      <option value="">— seleccionar —</option>
                      {CAMERA_TYPES.map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="field-label">Observaciones</label>
                  <textarea className="field-input" placeholder="Nombre del río, estimación visual de velocidad, descripción del evento..." value={form.notes} onChange={e=>setF("notes",e.target.value)} />
                </div>
              </div>
            </div>

            {/* CONTACTO */}
            <div className="card" style={{ padding: "1.35rem" }}>
              <div className="section-title">👤 TUS DATOS DE CONTACTO</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ fontSize: "0.67rem", color: "#475569", lineHeight: 1.7, background: "#0A0E1A", border: "1px solid #1E293B", borderRadius: 6, padding: "0.65rem 0.9rem" }}>
                  🔒 Tus datos son <strong style={{ color: "#94A3B8" }}>confidenciales</strong>. Solo los usaremos para contactarte si necesitamos más información sobre tu video.
                </div>
                <div>
                  <label className="field-label">Tu nombre (opcional)</label>
                  <input className="field-input" placeholder="ej: María García" value={form.name} onChange={e=>setF("name",e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Contacto <span className="req">*</span></label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                    <div className="contact-toggle">
                      <button className={contactType==="email"?"active":""} onClick={()=>{setContactType("email");setF("contact","");}}>📧 Email</button>
                      <button className={contactType==="phone"?"active":""} onClick={()=>{setContactType("phone");setF("contact","");}}>📱 Celular</button>
                    </div>
                    <input
                      className="field-input"
                      type={contactType==="email"?"email":"tel"}
                      placeholder={contactType==="email" ? "nombre@ejemplo.com" : "+54 381 555-0000"}
                      value={form.contact}
                      onChange={e=>setF("contact",e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Acción */}
            {uploading ? (
              <div className="card" style={{ padding: "1.35rem", textAlign: "center" }}>
                <div style={{ fontSize: "0.68rem", color: "#38BDF8", letterSpacing: "0.14em", marginBottom: "0.7rem" }}>
                  {uploadProgress < 70 ? "SUBIENDO VIDEO..." : "GUARDANDO DATOS..."} {Math.round(uploadProgress)}%
                </div>
                <div className="progress-bar-outer"><div className="progress-bar-inner" style={{ width: `${uploadProgress}%` }} /></div>
                <div style={{ fontSize: "0.62rem", color: "#334155", marginTop: "0.45rem" }}>No cierres esta pestaña</div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                <div style={{ fontSize: "0.64rem", color: "#334155" }}>
                  <span className="req">*</span> Obligatorio: video · fecha · hora · localidad · contacto
                </div>
                <button className="upload-btn" disabled={!formValid} onClick={handleUpload}>
                  ENVIAR PARA ANÁLISIS →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: ENVÍOS ══ */}
        {tab === "gallery" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "1.1rem", letterSpacing: "0.06em", color: "#F1F5F9" }}>
                VIDEOS ENVIADOS <span style={{ color: "#38BDF8" }}>{submissions.length}</span>
              </div>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {Object.entries(STATUS_CONFIG).map(([key,{label,color,icon}])=>(
                  <span key={key} style={{ fontSize: "0.58rem", color, background: `${color}18`, border: `1px solid ${color}40`, padding: "0.12rem 0.45rem", borderRadius: 3 }}>
                    {icon} {label}: {submissions.filter(s=>s.status===key).length}
                  </span>
                ))}
              </div>
            </div>

            {loadingSubmissions && (
              <div style={{ textAlign: "center", padding: "2rem", color: "#334155", fontSize: "0.75rem" }}>⏳ Cargando envíos...</div>
            )}

            {!loadingSubmissions && submissions.map(s => {
              const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.pending;
              const mapLink = s.lat && s.lng ? `https://www.google.com/maps?q=${s.lat},${s.lng}` : null;
              const isEmail = s.contact?.includes("@");
              return (
                <div key={s.id} className="card hover-row" style={{ padding: "1rem 1.2rem", display: "flex", alignItems: "flex-start", gap: "0.9rem", flexWrap: "wrap", transition: "background 0.2s" }}>
                  <div style={{ fontSize: 20, paddingTop: 2 }}>🎬</div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: "0.8rem", color: "#CBD5E1", fontWeight: 700, marginBottom: 5 }}>{s.file_name}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", marginBottom: 4 }}>
                      <span style={{ fontSize: "0.63rem", color: "#475569" }}>📍 {s.department}, Tucumán</span>
                      <span style={{ fontSize: "0.63rem", color: "#475569" }}>🏘 {s.locality}</span>
                      <span style={{ fontSize: "0.63rem", color: "#475569" }}>📅 {s.event_date}</span>
                      <span style={{ fontSize: "0.63rem", color: "#475569" }}>🕐 {s.event_time?.slice(0,5)} hs</span>
                      {mapLink && <a className="map-link" href={mapLink} target="_blank" rel="noreferrer">🗺 Ver ubicación ↗</a>}
                    </div>
                    <div style={{ fontSize: "0.63rem", color: "#334155" }}>
                      {isEmail ? "📧" : "📱"} {s.contact}
                      {s.user_name && <span style={{ marginLeft: "0.6rem", color: "#475569" }}>· {s.user_name}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", flexShrink: 0, marginTop: 2 }}>
                    {s.status === "done" && s.velocity_ms && (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "0.57rem", color: "#64748B", letterSpacing: "0.08em", marginBottom: 1 }}>VEL. MEDIA</div>
                        <span className="velocity-badge">{s.velocity_ms} m/s</span>
                      </div>
                    )}
                    <div className="status-badge" style={{ background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}40` }}>
                      {cfg.icon} {cfg.label}
                    </div>
                  </div>
                </div>
              );
            })}

            {!loadingSubmissions && submissions.length === 0 && (
              <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#334155" }}>
                <div style={{ fontSize: 34, marginBottom: "0.6rem" }}>📭</div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "1rem" }}>SIN ENVÍOS AÚN</div>
                <div style={{ fontSize: "0.68rem", marginTop: "0.35rem" }}>Sé el primero en contribuir con un video</div>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: METODOLOGÍA ══ */}
        {tab === "about" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.3rem" }}>
            <div className="about-card">
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "1.4rem", color: "#38BDF8", marginBottom: "0.7rem" }}>¿QUÉ ES LA VELOCIMETRÍA POR IMÁGENES?</div>
              <p style={{ fontSize: "0.75rem", color: "#94A3B8", lineHeight: 1.8 }}>
                La <strong style={{color:"#CBD5E1"}}>velocimetría por imágenes</strong> es una familia de técnicas no intrusivas que permiten medir la velocidad del flujo de agua a partir de secuencias de video. Al rastrear patrones naturales en la superficie, los algoritmos calculan los vectores de velocidad sin necesidad de instrumentos en contacto con el agua.
              </p>
            </div>
            <div className="about-card">
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.1em", color: "#64748B", marginBottom: "0.85rem" }}>FLUJO DE PROCESAMIENTO</div>
              {[
                ["01","Ingesta y georreferenciación","El video se descomprime en fotogramas. Con la hora y coordenadas GPS se realiza la corrección de perspectiva."],
                ["02","Algoritmo de velocimetría","Se aplica PIV, LSPIV u Optical Flow para calcular vectores 2D de velocidad superficial."],
                ["03","Post-proceso y validación","Se filtran vectores espurios y se calcula la velocidad media y máxima del flujo."],
                ["04","Reporte de resultados","Mapa de vectores y velocidad superficial estimada (m/s) publicados en la plataforma."],
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
            <div style={{ textAlign: "center", padding: "0.7rem 0", borderTop: "1px solid #1E293B" }}>
              <div style={{ fontSize: "0.6rem", color: "#334155", letterSpacing: "0.12em" }}>FLOODVELO · UNT · TUCUMÁN · CIENCIA CIUDADANA ABIERTA</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}