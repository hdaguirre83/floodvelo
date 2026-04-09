import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

// ... (mantén los estilos y componentes auxiliares igual: STATUS_CONFIG, AccessDenied, SubmissionRow)

export default function Admin() {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(null);

  // Email del administrador (cámbialo si es necesario)
  const ADMIN_EMAIL = "hdaguirre@herrera.unt.edu.ar";

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(session);
        const userEmail = session?.user?.email?.toLowerCase();
        setIsAdmin(userEmail === ADMIN_EMAIL.toLowerCase());
      } catch (err) {
        console.error("Error al obtener sesión:", err);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      const userEmail = session?.user?.email?.toLowerCase();
      setIsAdmin(userEmail === ADMIN_EMAIL.toLowerCase());
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session && isAdmin) loadSubmissions();
  }, [session, isAdmin]);

  const loadSubmissions = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("submissions").select("*").order("created_at", { ascending: false });
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

  const handleGoogleLogin = async () => {
    const redirectUrl = import.meta.env.PROD ? 'https://floodvelo.vercel.app' : window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectUrl, queryParams: { access_type: 'offline', prompt: 'consent' } }
    });
    if (error) console.error("Error en login:", error);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSubmissions([]);
    setSession(null);
    setIsAdmin(false);
  };

  if (authLoading) return <div style={{ background: "#0A0E1A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>Cargando...</div>;
  if (!session) {
    return (
      <div style={{ fontFamily: "'Courier New', monospace", background: "#0A0E1A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "2rem" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>🌊</div>
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2rem" }}>FloodVelo - Admin</h1>
          <p style={{ color: "#94A3B8" }}>Iniciá sesión con Google para acceder al panel</p>
        </div>
        <button onClick={handleGoogleLogin} style={{ background: "#0EA5E9", border: "none", borderRadius: "8px", color: "white", fontFamily: "'Space Mono', monospace", fontSize: "1rem", padding: "0.75rem 1.5rem", cursor: "pointer" }}>🔑 Iniciar sesión con Google</button>
      </div>
    );
  }
  if (!isAdmin) return <AccessDenied />;

  // Renderizado del panel (igual que antes)
  return (
    // ... (el mismo código del panel que ya tenías, con los estilos y la lista de submissions)
  );
}