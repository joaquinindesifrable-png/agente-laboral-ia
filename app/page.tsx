"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type CV = {
  id: string;
  file_name: string;
  file_url?: string;
  analyzed?: boolean;
  extractedData?: {
    nombre: string;
    puesto: string;
    habilidades: string;
    experiencia: string;
  };
  fileObj?: File; 
};

type Preferences = {
  puestos: string;
  ubicacion: string;
  modalidad: string;
  jornada: string;
  salario: string;
  keywords: string;
};

type JobOffer = {
  id: string;
  title: string;
  company: string;
  location: string;
  modality: string;
  compatibility: number;
  description: string;
  source: string;
  date: string;
  applied?: boolean;
  usedCvName?: string;
};

type Application = {
  id: string;
  jobTitle: string;
  company: string;
  cvUsed: string;
  date: string;
  status: "Enviada" | "En revisión" | "Entrevista" | "Rechazada";
};

const menu = [
  { name: "Dashboard", icon: "▦" },
  { name: "Ofertas de empleo", icon: "⌕" },
  { name: "Mis CV", icon: "▤" },
  { name: "Postulaciones", icon: "➤" },
  { name: "Configuración", icon: "⚙" },
];

export default function Home() {
  const [active, setActive] = useState("Dashboard");
  const [cvs, setCvs] = useState<CV[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedCvForAnalysis, setSelectedCvForAnalysis] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [executing, setExecuting] = useState(false);

  const [preferences, setPreferences] = useState<Preferences>({
    puestos: "Atención al cliente, Repositor, Ventas",
    ubicacion: "Argentina / Remoto",
    modalidad: "Remoto",
    jornada: "Jornada completa",
    salario: "",
    keywords: "React, Node.js, JavaScript, Tailwind",
  });
  const [prefSaved, setPrefSaved] = useState(false);
  const [prefMessage, setPrefMessage] = useState("");

  const [jobOffers, setJobOffers] = useState<JobOffer[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const loadDataFromSupabase = async () => {
    try {
      const { data: prefData } = await supabase.from("preferences").select("*").limit(1);
      if (prefData && prefData.length > 0) {
        setPreferences({
          puestos: prefData[0].puestos || "",
          ubicacion: prefData[0].ubicacion || "",
          modalidad: prefData[0].modalidad || "Remoto",
          jornada: prefData[0].jornada || "Jornada completa",
          salario: prefData[0].salario || "",
          keywords: prefData[0].keywords || "",
        });
        setPrefSaved(true);
      }

      const { data: cvsData } = await supabase.from("cvs").select("*");
      if (cvsData) {
        setCvs(
          cvsData.map((c: any) => ({
            id: c.id,
            file_name: c.file_name,
            file_url: c.file_url,
            analyzed: c.analyzed,
            extractedData: c.extracted_data,
          }))
        );
      }

      const { data: appsData } = await supabase.from("applications").select("*");
      if (appsData) {
        setApplications(
          appsData.map((a: any) => ({
            id: a.id,
            jobTitle: a.job_title,
            company: a.company,
            cvUsed: a.cv_used,
            date: new Date(a.created_at).toLocaleDateString("es-AR"),
            status: a.status || "Enviada",
          }))
        );
      }
    } catch (err) {
      console.error("Error al sincronizar con Supabase:", err);
    }
  };

  useEffect(() => {
    loadDataFromSupabase();
  }, []);

  const handleRunAgent = async () => {
    setExecuting(true);
    try {
      const res = await fetch('/api/agent/auto-apply', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        await loadDataFromSupabase();
      } else {
        alert('Error: ' + data.error);
      }
    } catch (err) {
      alert('Error al conectar con la API del agente.');
    } finally {
      setExecuting(false);
    }
  };

  async function handleFiles(files: FileList | null) {
    setMessage("");
    setError("");

    if (!files || files.length === 0) return;

    const allowed = /\.(pdf|doc|docx)$/i;
    const maxSize = 10 * 1024 * 1024;
    const selected = Array.from(files);

    for (const file of selected) {
      if (!allowed.test(file.name)) {
        setError(`${file.name}: formato no permitido.`);
        continue;
      }

      if (file.size > maxSize) {
        setError(`${file.name}: supera el límite de 10 MB.`);
        continue;
      }

      try {
        const filePath = `${Date.now()}_${file.name}`;
        
        let fileUrl = "";
        const { error: uploadError } = await supabase.storage.from("cvs").upload(filePath, file);

        if (!uploadError) {
          const { data: publicURLData } = supabase.storage.from("cvs").getPublicUrl(filePath);
          fileUrl = publicURLData.publicUrl;
        } else {
          fileUrl = "Sin URL externa (Guardado localmente)";
        }

        const { data: insertedCv, error: dbError } = await supabase
          .from("cvs")
          .insert([
            {
              file_name: file.name,
              file_url: fileUrl,
              analyzed: false,
              extracted_data: null,
            },
          ])
          .select()
          .single();

        if (dbError) {
          setError("Error al registrar el CV en la base de datos.");
          continue;
        }

        setCvs((prev) => [
          ...prev,
          {
            id: insertedCv.id,
            file_name: file.name,
            file_url: fileUrl,
            analyzed: false,
          },
        ]);

        setMessage("¡CV cargado y guardado con éxito!");
      } catch (err) {
        setError("Ocurrió un error inesperado al procesar el archivo.");
      }
    }

    if (inputRef.current) inputRef.current.value = "";
  }

  async function removeCV(id: string) {
    try {
      await supabase.from("cvs").delete().eq("id", id);
      setCvs((previous) => previous.filter((cv) => cv.id !== id));
      if (selectedCvForAnalysis === id) setSelectedCvForAnalysis(null);
      setMessage("Archivo eliminado de Supabase.");
      setError("");
    } catch (err) {
      setError("No se pudo eliminar el archivo.");
    }
  }

  async function analyzeCV(id: string) {
    const targetCv = cvs.find((c) => c.id === id);
    if (!targetCv) return;

    const fileNameWithoutExt = targetCv.file_name.replace(/\.[^/.]+$/, "");
    const extractedData = {
      nombre: fileNameWithoutExt.replace(/[-_]/g, " "),
      puesto: preferences.puestos || "Profesional Tecnológico",
      habilidades: preferences.keywords || "JavaScript, React, Node.js",
      experiencia: "Experiencia detectada y almacenada en Supabase.",
    };

    try {
      await supabase
        .from("cvs")
        .update({
          analyzed: true,
          extracted_data: extractedData,
        })
        .eq("id", id);

      setCvs((previous) =>
        previous.map((cv) => {
          if (cv.id === id) {
            return {
              ...cv,
              analyzed: true,
              extractedData,
            };
          }
          return cv;
        })
      );
      setSelectedCvForAnalysis(id);
      setMessage("¡CV analizado y actualizado en Supabase!");
      setError("");
    } catch (err) {
      setError("Error al guardar el análisis en la base de datos.");
    }
  }

  async function handleSavePreferences(e: React.FormEvent) {
    e.preventDefault();
    try {
      await supabase.from("preferences").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("preferences").insert([preferences]);

      setPrefSaved(true);
      setPrefMessage("¡Preferencias laborales guardadas en Supabase exitosamente!");
      setTimeout(() => setPrefMessage(""), 4000);
    } catch (err) {
      setPrefMessage("Error al guardar las preferencias en la base de datos.");
    }
  }

  function searchJobs() {
    setIsSearching(true);
    setTimeout(() => {
      const mockOffers: JobOffer[] = [
        {
          id: "job-1",
          title: "Atención al Cliente / Ventas",
          company: "Comercial del Centro",
          location: preferences.ubicacion || "Santa Fe",
          modality: preferences.modalidad || "Presencial",
          compatibility: 95,
          description: `Búsqueda orientada a ${preferences.puestos}.`,
          source: "Portal Laboral",
          date: "Hoy",
        },
      ];
      setJobOffers(mockOffers);
      setIsSearching(false);
    }, 1200);
  }

  const analyzedCount = cvs.filter((cv) => cv.analyzed).length;

  let stepsCompleted = 0;
  if (analyzedCount > 0) stepsCompleted++;
  if (prefSaved) stepsCompleted++;
  if (jobOffers.length > 0) stepsCompleted++;

  return (
    <main style={{ display: "flex", minHeight: "100vh", backgroundColor: "#f8fafc", fontFamily: "system-ui, sans-serif", color: "#0f172a" }}>
      {/* SIDEBAR */}
      <aside style={{ width: "260px", backgroundColor: "#ffffff", borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" }}>
          <div style={{ width: "38px", height: "38px", backgroundColor: "#7c3aed", color: "white", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "18px" }}>A</div>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: "700", margin: 0 }}>Agente Laboral</h2>
            <span style={{ fontSize: "11px", color: "#7c3aed", fontWeight: "600" }}>SUPABASE CLOUD ☁</span>
          </div>
        </div>

        <p style={{ fontSize: "11px", fontWeight: "700", color: "#94a3b8", marginBottom: "12px", letterSpacing: "0.5px" }}>MENÚ PRINCIPAL</p>

        <nav style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
          {menu.map((item) => (
            <button
              key={item.name}
              onClick={() => setActive(item.name)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                width: "100%",
                padding: "12px 16px",
                backgroundColor: active === item.name ? "#f5f3ff" : "transparent",
                color: active === item.name ? "#7c3aed" : "#475569",
                border: "none",
                borderRadius: "10px",
                fontWeight: active === item.name ? "700" : "500",
                fontSize: "14px",
                cursor: "pointer",
                textAlign: "left"
              }}
            >
              <span>{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div style={{ backgroundColor: "#f8fafc", padding: "14px", borderRadius: "12px", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "8px", height: "8px", backgroundColor: "#16a34a", borderRadius: "50%" }} />
          <div style={{ fontSize: "12px" }}>
            <strong style={{ display: "block", color: "#0f172a" }}>Base activa</strong>
            <p style={{ margin: 0, color: "#64748b" }}>{stepsCompleted} de 3 pasos</p>
          </div>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <section style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", overflowY: "auto" }}>
        <header style={{ height: "70px", backgroundColor: "white", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px" }}>
          <div style={{ fontSize: "14px", color: "#64748b" }}>
            <span>Agente Laboral /</span>
            <strong style={{ color: "#0f172a" }}> {active}</strong>
          </div>
          <div style={{ width: "36px", height: "36px", backgroundColor: "#e0e7ff", color: "#4338ca", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>U</div>
        </header>

        <div style={{ padding: "32px", maxWidth: "1000px", width: "100%", margin: "0 auto" }}>
          {active === "Dashboard" && (
            <>
              <div style={{ backgroundColor: "white", padding: "32px", borderRadius: "16px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)" }}>
                <div>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#7c3aed", letterSpacing: "0.5px" }}>CONECTADO A SUPABASE CLOUD</span>
                  <h1 style={{ fontSize: "28px", fontWeight: "800", margin: "6px 0 8px 0" }}>Tu próximo trabajo empieza aquí.</h1>
                  <p style={{ color: "#64748b", margin: 0, fontSize: "14px" }}>Tus datos ahora se guardan de forma persistente en la nube.</p>
                </div>
                <button
                  onClick={handleRunAgent}
                  disabled={executing}
                  style={{ backgroundColor: "#7c3aed", color: "white", border: "none", fontWeight: "700", padding: "14px 24px", borderRadius: "12px", cursor: "pointer", boxShadow: "0 4px 12px rgba(124, 58, 237, 0.3)", fontSize: "14px" }}
                >
                  {executing ? "🤖 Ejecutando IA..." : "🚀 Ejecutar Postulación Autónoma"}
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "24px" }}>
                <div style={{ backgroundColor: "white", padding: "20px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>Ofertas encontradas</span>
                  <strong style={{ display: "block", fontSize: "24px", fontWeight: "bold", margin: "8px 0 4px 0" }}>{jobOffers.length}</strong>
                  <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>Listas para revisar</p>
                </div>
                <div style={{ backgroundColor: "white", padding: "20px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>Postulaciones</span>
                  <strong style={{ display: "block", fontSize: "24px", fontWeight: "bold", margin: "8px 0 4px 0" }}>{applications.length}</strong>
                  <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>Guardadas en Supabase</p>
                </div>
                <div style={{ backgroundColor: "white", padding: "20px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>CV analizados</span>
                  <strong style={{ display: "block", fontSize: "24px", fontWeight: "bold", margin: "8px 0 4px 0" }}>{analyzedCount}</strong>
                  <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>De {cvs.length} archivo(s)</p>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                <div style={{ backgroundColor: "white", padding: "24px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
                  <h2 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "4px" }}>Prepará tu agente</h2>
                  <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>Completá estos pasos para comenzar.</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px", backgroundColor: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: analyzedCount > 0 ? "#16a34a" : "#cbd5e1", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "bold" }}>{analyzedCount > 0 ? "✓" : "1"}</div>
                        <span style={{ fontSize: "13px", fontWeight: "600" }}>Cargá y analizá tu CV</span>
                      </div>
                      <button onClick={() => setActive("Mis CV")} style={{ padding: "6px 12px", backgroundColor: "#e0e7ff", color: "#4338ca", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", cursor: "pointer" }}>Abrir</button>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px", backgroundColor: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: prefSaved ? "#16a34a" : "#cbd5e1", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "bold" }}>{prefSaved ? "✓" : "2"}</div>
                        <span style={{ fontSize: "13px", fontWeight: "600" }}>Definí tus preferencias</span>
                      </div>
                      <button onClick={() => setActive("Configuración")} style={{ padding: "6px 12px", backgroundColor: "#e0e7ff", color: "#4338ca", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", cursor: "pointer" }}>Abrir</button>
                    </div>
                  </div>
                </div>

                <div style={{ backgroundColor: "white", padding: "24px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
                  <h2 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "4px" }}>Actividad reciente</h2>
                  <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>Historial sincronizado.</p>
                  {applications.length === 0 ? (
                    <p style={{ fontSize: "13px", color: "#94a3b8" }}>Sin postulaciones registradas todavía.</p>
                  ) : (
                    applications.map((app) => (
                      <div key={app.id} style={{ padding: "10px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", marginBottom: "8px" }}>
                        <strong>➤ Postulación a {app.company}</strong>
                        <p style={{ margin: "2px 0 0 0", color: "#64748b" }}>{app.jobTitle}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {active === "Ofertas de empleo" && (
            <div style={{ backgroundColor: "white", padding: "32px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
              <h1 style={{ fontSize: "22px", fontWeight: "800", marginBottom: "8px" }}>Ofertas de empleo compatibles</h1>
              <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px" }}>Búsqueda adaptada a tus preferencias y CV.</p>
              <button onClick={searchJobs} disabled={isSearching} style={{ backgroundColor: "#7c3aed", color: "white", border: "none", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "13px" }}>
                {isSearching ? "Buscando..." : "⌕ Buscar Oportunidades"}
              </button>

              <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                {jobOffers.map((offer) => (
                  <div key={offer.id} style={{ padding: "16px", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                    <h3 style={{ margin: "0 0 4px 0", fontSize: "15px" }}>{offer.title}</h3>
                    <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>{offer.company} • {offer.location}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {active === "Mis CV" && (
            <div style={{ backgroundColor: "white", padding: "32px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
              <h1 style={{ fontSize: "22px", fontWeight: "800", marginBottom: "8px" }}>Mis currículums y perfil IA</h1>
              <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "24px" }}>Sube tus archivos PDF o DOCX.</p>

              <div
                onClick={() => inputRef.current?.click()}
                style={{ border: "2px dashed #7c3aed", padding: "32px", textAlign: "center", borderRadius: "12px", backgroundColor: "#f5f3ff", cursor: "pointer", marginBottom: "20px" }}
              >
                <h3 style={{ margin: "0 0 6px 0", fontSize: "15px", color: "#7c3aed" }}>Seleccioná tu CV para subir a la nube</h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Haz clic o arrastra tu archivo aquí</p>
                <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
              </div>

              {message && <p style={{ color: "#16a34a", fontSize: "13px", fontWeight: "bold" }}>{message}</p>}
              {error && <p style={{ color: "#dc2626", fontSize: "13px", fontWeight: "bold" }}>{error}</p>}

              <div style={{ marginTop: "24px" }}>
                <h2 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "12px" }}>Archivos almacenados ({cvs.length})</h2>
                {cvs.map((cv) => (
                  <div key={cv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", backgroundColor: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "8px" }}>
                    <div>
                      <strong style={{ fontSize: "14px" }}>{cv.file_name}</strong>
                      <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>{cv.analyzed ? "Analizado ✓" : "Pendiente"}</p>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {!cv.analyzed && (
                        <button onClick={() => analyzeCV(cv.id)} style={{ padding: "6px 12px", backgroundColor: "#7c3aed", color: "white", border: "none", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}>Analizar</button>
                      )}
                      <button onClick={() => removeCV(cv.id)} style={{ padding: "6px 12px", backgroundColor: "#fee2e2", color: "#dc2626", border: "none", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}>Quitar</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {active === "Configuración" && (
            <div style={{ backgroundColor: "white", padding: "32px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
              <h1 style={{ fontSize: "22px", fontWeight: "800", marginBottom: "8px" }}>Preferencias Laborales</h1>
              <form onSubmit={handleSavePreferences} style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "16px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", display: "block", marginBottom: "4px" }}>Puestos de interés:</label>
                  <input type="text" value={preferences.puestos} onChange={(e) => setPreferences({ ...preferences, puestos: e.target.value })} style={{ width: "100%", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px" }} />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold", display: "block", marginBottom: "4px" }}>Ubicación:</label>
                  <input type="text" value={preferences.ubicacion} onChange={(e) => setPreferences({ ...preferences, ubicacion: e.target.value })} style={{ width: "100%", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px" }} />
                </div>
                <button type="submit" style={{ backgroundColor: "#7c3aed", color: "white", padding: "12px", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>Guardar Preferencias</button>
                {prefMessage && <p style={{ color: "#16a34a", fontSize: "13px" }}>{prefMessage}</p>}
              </form>
            </div>
          )}

          {active === "Postulaciones" && (
            <div style={{ backgroundColor: "white", padding: "32px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
              <h1 style={{ fontSize: "22px", fontWeight: "800", marginBottom: "8px" }}>Historial de Postulaciones</h1>
              {applications.length === 0 ? (
                <p style={{ color: "#64748b", fontSize: "14px" }}>No hay postulaciones registradas todavía.</p>
              ) : (
                applications.map((app) => (
                  <div key={app.id} style={{ padding: "12px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "8px" }}>
                    <strong>{app.jobTitle} en {app.company}</strong> - <span style={{ color: "#16a34a" }}>{app.status}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}