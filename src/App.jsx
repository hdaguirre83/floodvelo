import React, { useState, useRef, useCallback } from "react";
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

const EMPTY_FORM = { name: "", dept: "Capital", locality: "", date: "", time: "", condition: "", camera: "", notes: "", contact: "", lat: "", lng: "" };

// ══════════════════════════════════════════════════════════════════
// ILUSTRACIONES SVG
// ══════════════════════════════════════════════════════════════════

const IlluCamaraFija = () => (
  <svg viewBox="0 0 220 160" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"auto"}}>
    {/* Fondo */}
    <rect width="220" height="160" fill="#0A0E1A" rx="8"/>
    {/* Cielo */}
    <rect x="0" y="0" width="220" height="80" fill="#0F172A" rx="8"/>
    {/* Agua */}
    <rect x="0" y="80" width="220" height="80" fill="#0C2340" rx="0"/>
    <text x="110" y="120" textAnchor="middle" fill="#38BDF8" fontSize="10" opacity="0.5">superficie del agua</text>
    {/* Puente */}
    <rect x="0" y="72" width="220" height="12" fill="#1E3A5F"/>
    <rect x="30" y="40" width="8" height="44" fill="#1E3A5F"/>
    <rect x="180" y="40" width="8" height="44" fill="#1E3A5F"/>
    {/* Trípode */}
    <line x1="110" y1="30" x2="95" y2="55" stroke="#475569" strokeWidth="2"/>
    <line x1="110" y1="30" x2="110" y2="55" stroke="#475569" strokeWidth="2"/>
    <line x1="110" y1="30" x2="125" y2="55" stroke="#475569" strokeWidth="2"/>
    {/* Cámara */}
    <rect x="100" y="18" width="22" height="14" rx="3" fill="#38BDF8"/>
    <circle cx="111" cy="25" r="4" fill="#0A0E1A"/>
    <circle cx="111" cy="25" r="2" fill="#38BDF8" opacity="0.5"/>
    {/* Puntos de control */}
    <circle cx="30" cy="76" r="4" fill="#F59E0B" stroke="#fff" strokeWidth="1"/>
    <text x="30" y="68" textAnchor="middle" fill="#F59E0B" fontSize="8">GCP1</text>
    <circle cx="188" cy="76" r="4" fill="#F59E0B" stroke="#fff" strokeWidth="1"/>
    <text x="188" y="68" textAnchor="middle" fill="#F59E0B" fontSize="8">GCP2</text>
    <circle cx="50" cy="84" r="4" fill="#F59E0B" stroke="#fff" strokeWidth="1"/>
    <text x="50" y="95" textAnchor="middle" fill="#F59E0B" fontSize="8">GCP3</text>
    <circle cx="168" cy="84" r="4" fill="#F59E0B" stroke="#fff" strokeWidth="1"/>
    <text x="168" y="95" textAnchor="middle" fill="#F59E0B" fontSize="8">GCP4</text>
    {/* Check */}
    <circle cx="200" cy="20" r="12" fill="rgba(16,185,129,0.2)" stroke="#10B981" strokeWidth="1.5"/>
    <text x="200" y="25" textAnchor="middle" fill="#10B981" fontSize="14">✓</text>
  </svg>
);

const IlluHorizontal = () => (
  <svg viewBox="0 0 220 160" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"auto"}}>
    <rect width="220" height="160" fill="#0A0E1A" rx="8"/>
    {/* Teléfono horizontal - correcto */}
    <rect x="30" y="55" width="100" height="60" rx="6" fill="#1E3A5F" stroke="#10B981" strokeWidth="2"/>
    <rect x="36" y="61" width="88" height="48" rx="3" fill="#0C2340"/>
    {/* Agua en pantalla */}
    <rect x="36" y="85" width="88" height="24" rx="0" fill="#0F3460" opacity="0.8"/>
    <text x="80" y="100" textAnchor="middle" fill="#38BDF8" fontSize="7">vista completa del río</text>
    {/* Botón */}
    <circle cx="136" cy="85" r="3" fill="#38BDF8"/>
    <text x="80" y="145" textAnchor="middle" fill="#10B981" fontSize="9">✅ HORIZONTAL — CORRECTO</text>

    {/* Teléfono vertical - incorrecto */}
    <rect x="155" y="40" width="42" height="75" rx="6" fill="#1E3A5F" stroke="#EF4444" strokeWidth="2"/>
    <rect x="160" y="46" width="32" height="60" rx="3" fill="#0C2340"/>
    <rect x="160" y="76" width="32" height="30" rx="0" fill="#0F3460" opacity="0.8"/>
    <text x="176" y="93" textAnchor="middle" fill="#EF4444" fontSize="6">vista</text>
    <text x="176" y="101" textAnchor="middle" fill="#EF4444" fontSize="6">recortada</text>
    <circle cx="176" cy="123" r="3" fill="#38BDF8"/>
    <text x="176" y="137" textAnchor="middle" fill="#EF4444" fontSize="8">❌ VERTICAL</text>
  </svg>
);

const IlluSinZoom = () => (
  <svg viewBox="0 0 220 160" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"auto"}}>
    <rect width="220" height="160" fill="#0A0E1A" rx="8"/>
    {/* Vista sin zoom - correcto */}
    <rect x="10" y="20" width="90" height="70" rx="4" fill="#0F172A" stroke="#10B981" strokeWidth="2"/>
    <rect x="10" y="55" width="90" height="35" fill="#0C2340"/>
    <text x="55" y="78" textAnchor="middle" fill="#38BDF8" fontSize="7">río completo visible</text>
    {/* Orillas */}
    <rect x="10" y="50" width="90" height="8" fill="#1E3A5F"/>
    <rect x="10" y="86" width="90" height="4" fill="#1E3A5F"/>
    {/* Referencias visibles */}
    <rect x="15" y="38" width="4" height="20" fill="#475569"/>
    <rect x="90" y="38" width="4" height="20" fill="#475569"/>
    <text x="55" y="110" textAnchor="middle" fill="#10B981" fontSize="8">✅ SIN ZOOM — referencias visibles</text>

    {/* Vista con zoom - incorrecto */}
    <rect x="118" y="20" width="90" height="70" rx="4" fill="#0F172A" stroke="#EF4444" strokeWidth="2"/>
    <rect x="118" y="20" width="90" height="70" fill="#0C2340"/>
    <text x="163" y="58" textAnchor="middle" fill="#EF4444" fontSize="7">solo agua, sin</text>
    <text x="163" y="68" textAnchor="middle" fill="#EF4444" fontSize="7">referencias fijas</text>
    {/* Símbolo zoom */}
    <circle cx="188" cy="28" r="8" fill="none" stroke="#EF4444" strokeWidth="1.5"/>
    <line x1="194" y1="34" x2="200" y2="40" stroke="#EF4444" strokeWidth="2"/>
    <text x="185" y="31" textAnchor="middle" fill="#EF4444" fontSize="8">🔍</text>
    <text x="163" y="110" textAnchor="middle" fill="#EF4444" fontSize="8">❌ CON ZOOM — no procesable</text>
  </svg>
);

const IlluSinPaneo = () => (
  <svg viewBox="0 0 220 160" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"auto"}}>
    <rect width="220" height="160" fill="#0A0E1A" rx="8"/>
    {/* Cámara fija */}
    <rect x="20" y="20" width="80" height="55" rx="4" fill="#0F172A" stroke="#10B981" strokeWidth="2"/>
    <rect x="20" y="45" width="80" height="30" fill="#0C2340"/>
    <text x="60" y="64" textAnchor="middle" fill="#38BDF8" fontSize="7">imagen estática</text>
    {/* Flecha estática */}
    <line x1="60" y1="85" x2="60" y2="95" stroke="#10B981" strokeWidth="2"/>
    <text x="60" y="107" textAnchor="middle" fill="#10B981" fontSize="8">✅ CÁMARA FIJA</text>
    <text x="60" y="118" textAnchor="middle" fill="#64748B" fontSize="7">sin movimiento</text>

    {/* Cámara con paneo */}
    <rect x="118" y="20" width="80" height="55" rx="4" fill="#0F172A" stroke="#EF4444" strokeWidth="2"/>
    <rect x="118" y="45" width="80" height="30" fill="#0C2340"/>
    {/* Flechas de paneo */}
    <line x1="128" y1="60" x2="118" y2="60" stroke="#EF4444" strokeWidth="2" markerEnd="url(#arr)"/>
    <line x1="188" y1="60" x2="198" y2="60" stroke="#EF4444" strokeWidth="2"/>
    <path d="M 118 55 Q 158 45 198 55" stroke="#EF4444" strokeWidth="1.5" fill="none" strokeDasharray="3,2"/>
    <text x="158" y="38" textAnchor="middle" fill="#EF4444" fontSize="7">movimiento</text>
    <text x="158" y="107" textAnchor="middle" fill="#EF4444" fontSize="8">❌ PANEO — inutilizable</text>
    <text x="158" y="118" textAnchor="middle" fill="#64748B" fontSize="7">los algoritmos no pueden</text>
    <text x="158" y="127" textAnchor="middle" fill="#64748B" fontSize="7">rastrear partículas</text>
  </svg>
);

const IlluAngulo = () => (
  <svg viewBox="0 0 220 160" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"auto"}}>
    <rect width="220" height="160" fill="#0A0E1A" rx="8"/>
    {/* Vista desde arriba - correcto */}
    <rect x="10" y="15" width="90" height="65" rx="4" fill="#0F172A" stroke="#10B981" strokeWidth="2"/>
    {/* Río desde arriba */}
    <rect x="15" y="35" width="80" height="30" fill="#0C2340"/>
    <rect x="15" y="28" width="80" height="10" fill="#1E3A5F"/>
    <rect x="15" y="62" width="80" height="8" fill="#1E3A5F"/>
    {/* Flecha indicando ángulo */}
    <line x1="55" y1="10" x2="55" y2="18" stroke="#10B981" strokeWidth="2"/>
    <text x="55" y="8" textAnchor="middle" fill="#10B981" fontSize="7">90°</text>
    <text x="55" y="95" textAnchor="middle" fill="#10B981" fontSize="8">✅ VISTA CENITAL</text>
    <text x="55" y="106" textAnchor="middle" fill="#64748B" fontSize="7">máxima superficie visible</text>

    {/* Vista lateral - no recomendado */}
    <rect x="118" y="15" width="90" height="65" rx="4" fill="#0F172A" stroke="#F59E0B" strokeWidth="2"/>
    {/* Perspectiva */}
    <path d="M 118 70 L 208 70 L 190 45 L 136 45 Z" fill="#0C2340"/>
    <path d="M 118 70 L 136 45 L 136 30 L 118 30 Z" fill="#1E3A5F"/>
    <path d="M 190 45 L 208 45 L 208 30 L 190 30 Z" fill="#1E3A5F"/>
    <text x="163" y="62" textAnchor="middle" fill="#F59E0B" fontSize="7">perspectiva</text>
    <line x1="163" y1="10" x2="178" y2="28" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="3,2"/>
    <text x="163" y="95" textAnchor="middle" fill="#F59E0B" fontSize="8">⚠️ VISTA LATERAL</text>
    <text x="163" y="106" textAnchor="middle" fill="#64748B" fontSize="7">requiere ortorectificación</text>
  </svg>
);

const IlluPuntosControl = () => (
  <svg viewBox="0 0 220 160" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"auto"}}>
    <rect width="220" height="160" fill="#0A0E1A" rx="8"/>
    {/* Vista desde puente */}
    <rect x="10" y="10" width="200" height="110" rx="4" fill="#0F172A" stroke="#38BDF8" strokeWidth="1.5"/>
    {/* Agua */}
    <rect x="10" y="55" width="200" height="65" fill="#0C2340" rx="0"/>
    {/* Orillas */}
    <rect x="10" y="48" width="200" height="10" fill="#1E3A5F"/>
    <rect x="10" y="112" width="200" height="8" fill="#1E3A5F"/>
    {/* Pilares puente */}
    <rect x="50" y="10" width="10" height="48" fill="#334155"/>
    <rect x="160" y="10" width="10" height="48" fill="#334155"/>
    {/* Puntos de control con coordenadas */}
    <circle cx="50" cy="52" r="6" fill="#F59E0B" stroke="#fff" strokeWidth="1.5"/>
    <text x="50" y="55" textAnchor="middle" fill="#0A0E1A" fontSize="7" fontWeight="bold">1</text>
    <text x="50" y="42" textAnchor="middle" fill="#F59E0B" fontSize="6">-26.824°</text>

    <circle cx="170" cy="52" r="6" fill="#F59E0B" stroke="#fff" strokeWidth="1.5"/>
    <text x="170" y="55" textAnchor="middle" fill="#0A0E1A" fontSize="7" fontWeight="bold">2</text>
    <text x="170" y="42" textAnchor="middle" fill="#F59E0B" fontSize="6">-26.824°</text>

    <circle cx="40" cy="115" r="6" fill="#F59E0B" stroke="#fff" strokeWidth="1.5"/>
    <text x="40" y="118" textAnchor="middle" fill="#0A0E1A" fontSize="7" fontWeight="bold">3</text>
    <text x="40" y="130" textAnchor="middle" fill="#F59E0B" fontSize="6">-26.826°</text>

    <circle cx="180" cy="115" r="6" fill="#F59E0B" stroke="#fff" strokeWidth="1.5"/>
    <text x="180" y="118" textAnchor="middle" fill="#0A0E1A" fontSize="7" fontWeight="bold">4</text>
    <text x="180" y="130" textAnchor="middle" fill="#F59E0B" fontSize="6">-26.826°</text>

    {/* Líneas conectando puntos */}
    <polygon points="50,52 170,52 180,115 40,115" fill="none" stroke="#F59E0B" strokeWidth="1" strokeDasharray="4,3" opacity="0.6"/>

    <text x="110" y="148" textAnchor="middle" fill="#F59E0B" fontSize="8">4 puntos de control (GCPs) para ortorectificación</text>
  </svg>
);

const IlluDuracion = () => (
  <svg viewBox="0 0 220 160" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"auto"}}>
    <rect width="220" height="160" fill="#0A0E1A" rx="8"/>
    {/* Línea de tiempo */}
    <line x1="20" y1="80" x2="200" y2="80" stroke="#1E293B" strokeWidth="3"/>
    {/* Segmento rechazado */}
    <line x1="20" y1="80" x2="70" y2="80" stroke="#EF4444" strokeWidth="4"/>
    <text x="45" y="70" textAnchor="middle" fill="#EF4444" fontSize="9">❌ &lt;10 seg</text>
    {/* Segmento mínimo */}
    <line x1="70" y1="80" x2="110" y2="80" stroke="#F59E0B" strokeWidth="4"/>
    <text x="90" y="70" textAnchor="middle" fill="#F59E0B" fontSize="9">⚠ 10-20 seg</text>
    {/* Segmento ideal */}
    <line x1="110" y1="80" x2="200" y2="80" stroke="#10B981" strokeWidth="4"/>
    <text x="155" y="70" textAnchor="middle" fill="#10B981" fontSize="9">✅ 30-60 seg ideal</text>
    {/* Marcadores */}
    <line x1="70" y1="73" x2="70" y2="87" stroke="#F59E0B" strokeWidth="2"/>
    <text x="70" y="97" textAnchor="middle" fill="#F59E0B" fontSize="8">10s</text>
    <line x1="110" y1="73" x2="110" y2="87" stroke="#10B981" strokeWidth="2"/>
    <text x="110" y="97" textAnchor="middle" fill="#10B981" fontSize="8">30s</text>
    <line x1="200" y1="73" x2="200" y2="87" stroke="#64748B" strokeWidth="2"/>
    <text x="200" y="97" textAnchor="middle" fill="#64748B" fontSize="8">60s</text>
    {/* Explicación */}
    <text x="110" y="120" textAnchor="middle" fill="#94A3B8" fontSize="8">Mayor duración = mejor promedio de velocidad</text>
    <text x="110" y="132" textAnchor="middle" fill="#64748B" fontSize="7">Se analizan múltiples pares de fotogramas</text>
    {/* Reloj */}
    <circle cx="110" cy="40" r="18" fill="#0F172A" stroke="#38BDF8" strokeWidth="1.5"/>
    <line x1="110" y1="40" x2="110" y2="28" stroke="#38BDF8" strokeWidth="2"/>
    <line x1="110" y1="40" x2="120" y2="44" stroke="#38BDF8" strokeWidth="2"/>
    <text x="110" y="44" textAnchor="middle" fill="#38BDF8" fontSize="8">⏱</text>
  </svg>
);

// ══════════════════════════════════════════════════════════════════
// APP PRINCIPAL
// ══════════════════════════════════════════════════════════════════
export default function App() {
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
  const [contactType, setContactType] = useState("email");
  const [qcResult, setQcResult] = useState(null);
  const [qcLoading, setQcLoading] = useState(false);
  const [metodoTab, setMetodoTab] = useState("guia"); // guia | proceso | river
  const fileRef = useRef();
  const xhrRef = useRef(null);

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
      (pos) => { setF("lat", pos.coords.latitude.toFixed(6)); setF("lng", pos.coords.longitude.toFixed(6)); setGeoLoading(false); },
      () => { setGeoError("No se pudo obtener la ubicación. Podés ingresarla manualmente."); setGeoLoading(false); }
    );
  };

  const formValid = selectedFile && form.date && form.time && form.locality && form.contact && qcResult?.passed;

  const handleUpload = () => {
    if (!formValid) return;
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
        const { error: dbError } = await supabase.from("submissions").insert({
          file_name: selectedFile.name, file_path: cloudData.secure_url,
          file_size_mb: parseFloat((selectedFile.size / 1e6).toFixed(2)),
          event_date: form.date, event_time: form.time, department: form.dept, locality: form.locality,
          lat: form.lat ? parseFloat(form.lat) : null, lng: form.lng ? parseFloat(form.lng) : null,
          light_condition: form.condition || null, camera_type: form.camera || null,
          notes: form.notes || null, user_name: form.name || null,
          contact: form.contact, contact_type: contactType, status: "pending",
        });
        if (dbError) { setError("Video subido pero error al guardar datos: " + dbError.message); setUploading(false); return; }
        setUploadProgress(100);
        setTimeout(() => {
          setUploading(false); setUploadProgress(0); setUploadStage("");
          setSelectedFile(null); setPreview(null); setForm(EMPTY_FORM);
          setSuccess(true); setGeoError(""); setQcResult(null);
        }, 500);
      } else {
        let msg = "Error al subir el video.";
        try { msg = JSON.parse(xhr.responseText)?.error?.message || msg; } catch {}
        setError(msg); setUploading(false);
      }
    };
    xhr.onerror = () => { setError("Error de red. Verificá tu conexión e intentá de nuevo."); setUploading(false); };
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
        <span style={{ fontSize: 18 }}>🔍</span>
        <div style={{ fontSize: "0.72rem", color: "#64748B", letterSpacing: "0.08em" }}>ANALIZANDO CALIDAD DEL VIDEO...</div>
      </div>
    );
    if (!qcResult) return null;
    const { duration, width, height, durationOk, resolutionOk, passed } = qcResult;
    return (
      <div style={{ background: passed ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${passed ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: 8, padding: "1rem 1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.85rem" }}>
          <span style={{ fontSize: 18 }}>{passed ? "✅" : "❌"}</span>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.95rem", color: passed ? "#10B981" : "#EF4444", letterSpacing: "0.05em" }}>
              {passed ? "VIDEO APROBADO — CUMPLE LOS REQUISITOS MÍNIMOS" : "VIDEO RECHAZADO — NO CUMPLE LOS REQUISITOS MÍNIMOS"}
            </div>
            {!passed && <div style={{ fontSize: "0.67rem", color: "#94A3B8", marginTop: 2 }}>Por favor corregí los puntos marcados con ❌ e intentá de nuevo.</div>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "#0A0E1A", borderRadius: 6, padding: "0.6rem 0.85rem" }}>
            <span style={{ fontSize: 16 }}>{durationOk ? "✅" : "❌"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.65rem", color: "#64748B", letterSpacing: "0.08em" }}>DURACIÓN</div>
              <div style={{ fontSize: "0.78rem", color: durationOk ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                {formatDuration(duration)}
                <span style={{ fontSize: "0.62rem", color: "#475569", fontWeight: 400, marginLeft: "0.5rem" }}>(mínimo {formatDuration(MIN_DURATION_SEC)})</span>
              </div>
              {!durationOk && <div style={{ fontSize: "0.65rem", color: "#94A3B8", marginTop: 2 }}>El video es demasiado corto. Grabá al menos {MIN_DURATION_SEC} segundos para poder aplicar los algoritmos de velocimetría.</div>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "#0A0E1A", borderRadius: 6, padding: "0.6rem 0.85rem" }}>
            <span style={{ fontSize: 16 }}>{resolutionOk ? "✅" : "❌"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.65rem", color: "#64748B", letterSpacing: "0.08em" }}>RESOLUCIÓN</div>
              <div style={{ fontSize: "0.78rem", color: resolutionOk ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                {width}x{height}px
                <span style={{ fontSize: "0.62rem", color: "#475569", fontWeight: 400, marginLeft: "0.5rem" }}>(mínimo {MIN_WIDTH}x{MIN_HEIGHT}px — 720p)</span>
              </div>
              {!resolutionOk && <div style={{ fontSize: "0.65rem", color: "#94A3B8", marginTop: 2 }}>La resolución es demasiado baja. Usá una cámara con resolución mínima de 720p (1280x720).</div>}
            </div>
          </div>
        </div>
        {passed && <div style={{ marginTop: "0.75rem", fontSize: "0.63rem", color: "#475569", background: "#0A0E1A", borderRadius: 4, padding: "0.5rem 0.75rem" }}>ℹ️ El análisis de estabilidad de cámara se realizará durante el procesamiento con RIVeR.</div>}
      </div>
    );
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
        .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; }
        @media (max-width: 580px) { .grid2,.grid3 { grid-template-columns: 1fr; } }
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
        .contact-toggle { display: inline-flex; border: 1px solid #1E3A5F; border-radius: 4px; overflow: hidden; }
        .contact-toggle button { background: none; border: none; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 0.65rem; padding: 0.38rem 0.9rem; transition: all 0.2s; }
        .contact-toggle button.active { background: #0EA5E9; color: #fff; }
        .contact-toggle button:not(.active) { color: #475569; }
        .coords-chip { display: inline-flex; align-items: center; gap: 0.35rem; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 3px; padding: 0.15rem 0.5rem; font-size: 0.62rem; color: #10B981; }
        .about-card { background: #0F172A; border: 1px solid #1E293B; border-radius: 8px; padding: 1.4rem; }
        .method-step { display: flex; gap: 1rem; padding: 0.9rem 0; border-bottom: 1px solid #1E293B; align-items: flex-start; }
        .step-num { font-family: 'Barlow Condensed', sans-serif; font-size: 2.4rem; font-weight: 900; color: #1E3A5F; line-height: 1; min-width: 2.4rem; }
        textarea.field-input { resize: vertical; min-height: 68px; }
        .req { color: #EF4444; margin-left: 2px; }
        .section-title { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: 0.1em; font-size: 0.82rem; color: #64748B; margin-bottom: 1.1rem; border-bottom: 1px solid #1E293B; padding-bottom: 0.6rem; }
        a.map-link { color: #38BDF8; text-decoration: none; font-size: 0.63rem; }
        a.map-link:hover { text-decoration: underline; }
        .guide-card { background: #0F172A; border: 1px solid #1E293B; border-radius: 8px; padding: 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
        .guide-card.ok { border-color: rgba(16,185,129,0.25); }
        .guide-card.bad { border-color: rgba(239,68,68,0.25); }
        .guide-card.warn { border-color: rgba(245,158,11,0.25); }
        .guide-title { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 0.88rem; letter-spacing: 0.06em; }
        .guide-desc { font-size: 0.68rem; color: #64748B; line-height: 1.6; }
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

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "1.75rem 1.5rem" }}>

        {/* ══ TAB: UPLOAD ══ */}
        {tab === "upload" && (
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
                    ¿Primera vez? Consultá la <button onClick={()=>{setTab("about");setMetodoTab("guia");}} style={{ background:"none", border:"none", cursor:"pointer", color:"#38BDF8", fontSize:"0.65rem", padding:0, textDecoration:"underline" }}>Guía de Filmación</button> antes de grabar.
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
                <span style={{ fontSize: "0.68rem", color: "#94A3B8" }}>⏱ Duración: <strong style={{ color: "#CBD5E1" }}>mín. 10 seg</strong></span>
                <span style={{ fontSize: "0.68rem", color: "#94A3B8" }}>📐 Resolución: <strong style={{ color: "#CBD5E1" }}>mín. 720p</strong></span>
                <span style={{ fontSize: "0.68rem", color: "#94A3B8" }}>🔒 Cámara: <strong style={{ color: "#CBD5E1" }}>sin zoom ni paneo</strong></span>
                <span style={{ fontSize: "0.68rem", color: "#94A3B8" }}>📍 GCPs: <strong style={{ color: "#CBD5E1" }}>4 puntos fijos visibles</strong></span>
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

            {/* CONTACTO */}
            <div className="card" style={{ padding: "1.35rem" }}>
              <div className="section-title">👤 TUS DATOS DE CONTACTO</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ fontSize: "0.67rem", color: "#475569", lineHeight: 1.7, background: "#0A0E1A", border: "1px solid #1E293B", borderRadius: 6, padding: "0.65rem 0.9rem" }}>
                  🔒 Tus datos son <strong style={{ color: "#94A3B8" }}>confidenciales</strong>. Solo los usaremos para contactarte si necesitamos más información sobre tu video.
                </div>
                <div><label className="field-label">Tu nombre (opcional)</label><input className="field-input" placeholder="ej: María García" value={form.name} onChange={e=>setF("name",e.target.value)} disabled={uploading} /></div>
                <div>
                  <label className="field-label">Contacto <span className="req">*</span></label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                    <div className="contact-toggle">
                      <button className={contactType==="email"?"active":""} onClick={()=>{setContactType("email");setF("contact","");}} disabled={uploading}>📧 Email</button>
                      <button className={contactType==="phone"?"active":""} onClick={()=>{setContactType("phone");setF("contact","");}} disabled={uploading}>📱 Celular</button>
                    </div>
                    <input className="field-input" type={contactType==="email"?"email":"tel"} placeholder={contactType==="email" ? "nombre@ejemplo.com" : "+54 381 555-0000"} value={form.contact} onChange={e=>setF("contact",e.target.value)} disabled={uploading} />
                  </div>
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
                <div style={{ fontSize: "0.62rem", color: "#334155", marginTop: "0.5rem", textAlign: "center" }}>No cierres esta pestaña mientras se sube el video</div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                <div style={{ fontSize: "0.64rem", color: "#334155" }}><span className="req">*</span> Obligatorio: video aprobado · fecha · hora · localidad · contacto</div>
                <button className="upload-btn" disabled={!formValid} onClick={handleUpload}>ENVIAR PARA ANÁLISIS →</button>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: METODOLOGÍA ══ */}
        {tab === "about" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.3rem" }}>

            {/* Sub-tabs */}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {[["guia","🎥  Guía de Filmación"],["proceso","⚙️  Flujo de Procesamiento"],["river","🔬  RIVeR & LSPIV"]].map(([id,label])=>(
                <button key={id} className={`sub-tab ${metodoTab===id?"active":""}`} onClick={()=>setMetodoTab(id)}>{label}</button>
              ))}
            </div>

            {/* ── GUÍA DE FILMACIÓN ── */}
            {metodoTab === "guia" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

                <div className="about-card" style={{ background: "rgba(56,189,248,0.04)", borderColor: "rgba(56,189,248,0.2)" }}>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "1.4rem", color: "#38BDF8", marginBottom: "0.5rem" }}>GUÍA DE FILMACIÓN</div>
                  <p style={{ fontSize: "0.75rem", color: "#94A3B8", lineHeight: 1.7 }}>
                    La calidad del video determina directamente la precisión de los resultados de velocimetría. Seguí estas pautas para obtener videos procesables con RIVeR. Un video mal filmado no puede ser analizado, incluso si tiene buena resolución.
                  </p>
                </div>

                {/* Grid de guías */}
                <div className="grid2">

                  {/* Cámara fija */}
                  <div className="guide-card ok">
                    <IlluCamaraFija />
                    <div className="guide-title" style={{ color: "#10B981" }}>✅ CÁMARA FIJA CON TRÍPODE</div>
                    <div className="guide-desc">
                      Apoyá el teléfono en un trípode, parapeto de puente, o cualquier superficie estable. La cámara debe permanecer completamente inmóvil durante toda la grabación. Incluí 4 puntos de referencia fijos y visibles (GCPs) para la ortorectificación.
                    </div>
                  </div>

                  {/* Modo horizontal */}
                  <div className="guide-card ok">
                    <IlluHorizontal />
                    <div className="guide-title" style={{ color: "#10B981" }}>✅ MODO HORIZONTAL (PAISAJE)</div>
                    <div className="guide-desc">
                      Girá el teléfono horizontalmente antes de grabar. El modo horizontal captura una superficie de agua mucho mayor, lo que mejora significativamente la estimación de velocidades. El modo vertical recorta la imagen y reduce la utilidad del video.
                    </div>
                  </div>

                  {/* Sin zoom */}
                  <div className="guide-card bad">
                    <IlluSinZoom />
                    <div className="guide-title" style={{ color: "#EF4444" }}>❌ NO USAR ZOOM DIGITAL</div>
                    <div className="guide-desc">
                      El zoom digital degrada la calidad de imagen y elimina las referencias fijas necesarias para la ortorectificación. Si necesitás acercarte, hacelo físicamente. El video debe mostrar las dos orillas del río y puntos de control claramente visibles.
                    </div>
                  </div>

                  {/* Sin paneo */}
                  <div className="guide-card bad">
                    <IlluSinPaneo />
                    <div className="guide-title" style={{ color: "#EF4444" }}>❌ NO HACER PANEO</div>
                    <div className="guide-desc">
                      El paneo (mover la cámara de lado a lado) hace imposible rastrear las partículas en la superficie del agua. Los algoritmos LSPIV necesitan que los mismos puntos de referencia aparezcan en todos los fotogramas. Un video con paneo no puede ser procesado.
                    </div>
                  </div>

                  {/* Ángulo */}
                  <div className="guide-card warn">
                    <IlluAngulo />
                    <div className="guide-title" style={{ color: "#F59E0B" }}>⚠️ ÁNGULO DE FILMACIÓN</div>
                    <div className="guide-desc">
                      La vista cenital (desde arriba) es la ideal — maximiza la superficie de agua visible y simplifica el procesamiento. Si filmás desde una orilla con perspectiva lateral, RIVeR puede corregirlo mediante ortorectificación, pero necesitás marcar los 4 puntos de control (GCPs) con coordenadas reales.
                    </div>
                  </div>

                  {/* Puntos de control */}
                  <div className="guide-card warn">
                    <IlluPuntosControl />
                    <div className="guide-title" style={{ color: "#F59E0B" }}>📍 4 PUNTOS DE CONTROL (GCPs)</div>
                    <div className="guide-desc">
                      Para la ortorectificación se necesitan 4 puntos fijos y visibles en el video cuyas coordenadas GPS reales se conocen. Pueden ser esquinas de puentes, postes, rocas grandes o marcas en el pavimento. El equipo técnico los marcará en el panel de administración antes del procesamiento con RIVeR.
                    </div>
                  </div>

                </div>

                {/* Duración recomendada */}
                <div className="about-card">
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.1em", color: "#64748B", marginBottom: "0.85rem" }}>⏱ DURACIÓN RECOMENDADA</div>
                  <IlluDuracion />
                  <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                      <span style={{ fontSize: "0.75rem", color: "#EF4444", minWidth: 80 }}>❌ &lt; 10 seg</span>
                      <span style={{ fontSize: "0.7rem", color: "#64748B" }}>Insuficiente — el video será rechazado automáticamente</span>
                    </div>
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                      <span style={{ fontSize: "0.75rem", color: "#F59E0B", minWidth: 80 }}>⚠ 10-30 seg</span>
                      <span style={{ fontSize: "0.7rem", color: "#64748B" }}>Aceptable — resultados básicos posibles</span>
                    </div>
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                      <span style={{ fontSize: "0.75rem", color: "#10B981", minWidth: 80 }}>✅ 30-60 seg</span>
                      <span style={{ fontSize: "0.7rem", color: "#64748B" }}>Ideal — permite promediar múltiples estimaciones de velocidad</span>
                    </div>
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                      <span style={{ fontSize: "0.75rem", color: "#38BDF8", minWidth: 80 }}>⭐ &gt; 60 seg</span>
                      <span style={{ fontSize: "0.7rem", color: "#64748B" }}>Excelente — máxima precisión estadística</span>
                    </div>
                  </div>
                </div>

                {/* Resumen rápido */}
                <div className="about-card">
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.1em", color: "#64748B", marginBottom: "0.85rem" }}>CHECKLIST ANTES DE GRABAR</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    {[
                      ["✅","Teléfono en modo horizontal"],
                      ["✅","Cámara apoyada o con trípode"],
                      ["✅","Zoom desactivado"],
                      ["✅","Al menos 4 puntos fijos visibles"],
                      ["✅","Buena iluminación natural"],
                      ["✅","30 segundos o más de grabación"],
                      ["❌","No mover la cámara durante la grabación"],
                      ["❌","No hacer paneo ni seguimiento"],
                    ].map(([icon, text]) => (
                      <div key={text} style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.7rem", color: "#94A3B8" }}>
                        <span style={{ fontSize: "0.9rem" }}>{icon}</span>{text}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* ── FLUJO DE PROCESAMIENTO ── */}
            {metodoTab === "proceso" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div className="about-card">
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.1em", color: "#64748B", marginBottom: "0.85rem" }}>FLUJO COMPLETO DE PROCESAMIENTO</div>
                  {[
                    ["01","Control de calidad automático","Al seleccionar el video se verifica duración mínima (10 seg) y resolución mínima (720p) antes de permitir el envío. El botón de envío queda bloqueado si el video no cumple."],
                    ["02","Ingesta y almacenamiento","El video se sube a Cloudinary y los metadatos (fecha, hora, coordenadas GPS, contacto) se guardan en la base de datos. Se envía una notificación automática al equipo técnico."],
                    ["03","Revisión manual","El equipo técnico revisa el video en el panel de administración. Verifica estabilidad de cámara, visibilidad de GCPs y condiciones de filmación. Aprueba o rechaza el video."],
                    ["04","Marcado de puntos de control (GCPs)","El técnico identifica y marca los 4 puntos de control en el video, registrando sus coordenadas GPS reales para la ortorectificación."],
                    ["05","Procesamiento con RIVeR 2.5","El video se descarga y procesa localmente con RIVeR 2.5. Se aplica Unshake para corrección de movimiento residual, ortorectificación con los GCPs y análisis LSPIV para calcular los vectores de velocidad superficial."],
                    ["06","Reporte de resultados","El técnico carga la velocidad estimada (m/s) en el panel admin. El resultado queda disponible en el mapa de eventos y se notifica al ciudadano que lo filmó."],
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
              </div>
            )}

            {/* ── RIVER & LSPIV ── */}
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
                    ["🔧","Unshake","Herramienta exclusiva de RIVeR 2.5 que corrige el movimiento residual de cámara antes del análisis, mejorando significativamente los resultados en videos tomados sin trípode."],
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
      </main>
    </div>
  );
}
