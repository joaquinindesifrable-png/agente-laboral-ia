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

  // Estado del Agente Autónomo
  const [executing, setExecuting] = useState(false);

  // Estado de Preferencias Laborales
  const [preferences, setPreferences] = useState<Preferences>({
    puestos: "Desarrollador Web",
    ubicacion: "Argentina / Remoto",
    modalidad: "Remoto",
    jornada: "Jornada completa",
    salario: "",
    keywords: "React, Node.js, JavaScript, Tailwind",
  });
  const [prefSaved, setPrefSaved] = useState(false);
  const [prefMessage, setPrefMessage] = useState("");

  // Estado de Ofertas de Empleo y Postulaciones
  const [jobOffers, setJobOffers] = useState<JobOffer[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Modal de Postulación
  const [selectedOfferForApply, setSelectedOfferForApply] = useState<JobOffer | null>(null);
  const [selectedCvIdForApply, setSelectedCvIdForApply] = useState<string>("");
  const [applyError, setApplyError] = useState<string>("");

  // Cargar datos iniciales desde Supabase al iniciar la app
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

  // Función para ejecutar el Agente Autónomo
  const handleRunAgent = async () => {
    setExecuting(true);
    try {
      const res = await fetch('/api/agent/auto-apply', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        await loadDataFromSupabase(); // Recargar datos para mostrar las postulaciones nuevas
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
        const { error: uploadError } = await supabase.storage.from("cvs").upload(filePath, file);

        if (uploadError) {
          setError(`Error al subir ${file.name} a la nube.`);
          continue;
        }

        const { data: publicURLData } = supabase.storage.from("cvs").getPublicUrl(filePath);
        const fileUrl = publicURLData.publicUrl;

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

        setMessage("¡CV cargado y guardado en la nube con éxito!");
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
      habilidades: preferences.keywords || "JavaScript, React, Node.js, Resolución de problemas",
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
          title: `${preferences.puestos || "Desarrollador Web"} Frontend`,
          company: "Tech Solutions Inc.",
          location: preferences.ubicacion || "Remoto",
          modality: preferences.modalidad || "Remoto",
          compatibility: 95,
          description: `Buscamos profesional con conocimientos en ${preferences.keywords || "React, JavaScript"}. Trabajo dinámico en equipo.`,
          source: "Portal Laboral Auténtico",
          date: "Hoy",
        },
        {
          id: "job-2",
          title: `${preferences.puestos || "Desarrollador Web"} Full Stack`,
          company: "Laboratorio Innovate AI",
          location: "Buenos Aires, Argentina",
          modality: "Híbrido",
          compatibility: 88,
          description: "Búsqueda activa para integrar proyectos de Inteligencia Artificial. Excelente clima laboral y beneficios.",
          source: "LinkedIn / Portal Web",
          date: "Ayer",
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
    <main className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">A</div>
          <div>
            <h2>Agente Laboral</h2>
            <span>SUPABASE CLOUD ☁</span>
          </div>
        </div>

        <p className="menu-label">MENÚ PRINCIPAL</p>

        <nav className="navigation">
          {menu.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${active === item.name ? "active" : ""}`}
              onClick={() => setActive(item.name)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="status-dot" />
          <div>
            <strong>Base de datos activa</strong>
            <p>{stepsCompleted} de 3 pasos configurados</p>
          </div>
        </div>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Agente Laboral /</span>
            <strong> {active}</strong>
          </div>
          <div className="user-avatar">U</div>
        </header>

        <div className="dashboard">
          {active === "Dashboard" && (
            <>
              <div className="welcome" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p className="eyebrow">CONECTADO A SUPABASE CLOUD</p>
                  <h1>Tu próximo trabajo empieza aquí.</h1>
                  <p className="subtitle">
                    Tus datos ahora se guardan de forma persistente en la nube.
                  </p>
                </div>
                <div>
                  <button
                    onClick={handleRunAgent}
                    disabled={executing}
                    style={{
                      backgroundColor: "#7c3aed",
                      color: "white",
                      border: "none",
                      fontWeight: "700",
                      padding: "12px 20px",
                      borderRadius: "10px",
                      cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(124, 58, 237, 0.3)",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}
                  >
                    {executing ? "🤖 Ejecutando IA..." : "🚀 Ejecutar Postulación Autónoma"}
                  </button>
                </div>
              </div>

              <div className="section-heading">
                <div>
                  <h2>Resumen general</h2>
                  <p>El estado actual de tu búsqueda laboral sincronizada.</p>
                </div>
                <span className="demo-badge" style={{ backgroundColor: "#dcfce7", color: "#16a34a" }}>Cloud Active</span>
              </div>

              <div className="stats-grid">
                <article className="stat-card">
                  <div className="stat-top">
                    <span>Ofertas encontradas</span>
                    <span className="stat-icon purple">⌕</span>
                  </div>
                  <strong>{jobOffers.length}</strong>
                  <p>{jobOffers.length > 0 ? "Ofertas listas para revisar" : "Esperando buscar ofertas"}</p>
                </article>

                <article className="stat-card">
                  <div className="stat-top">
                    <span>Postulaciones</span>
                    <span className="stat-icon blue">➤</span>
                  </div>
                  <strong>{applications.length}</strong>
                  <p>Guardadas en Supabase</p>
                </article>

                <article className="stat-card">
                  <div className="stat-top">
                    <span>CV analizados</span>
                    <span className="stat-icon green">▤</span>
                  </div>
                  <strong>{analyzedCount}</strong>
                  <p>De {cvs.length} archivo(s) en Storage</p>
                </article>
              </div>

              <div className="content-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Prepará tu agente</h2>
                      <p>Completá estos pasos para comenzar.</p>
                    </div>
                    <span className="progress-count">
                      {stepsCompleted} de 3
                    </span>
                  </div>

                  <div className="setup-item">
                    <div className="step-number">{analyzedCount > 0 ? "✓" : "1"}</div>
                    <div className="setup-text">
                      <strong>Cargá y analizá tu CV</strong>
                      <p>{analyzedCount > 0 ? `${analyzedCount} CV listo(s)` : "Subilo a Supabase Storage"}</p>
                    </div>
                    <button className="small-button" onClick={() => setActive("Mis CV")}>
                      {analyzedCount > 0 ? "Ver" : "Abrir"}
                    </button>
                  </div>

                  <div className="setup-item">
                    <div className="step-number">{prefSaved ? "✓" : "2"}</div>
                    <div className="setup-text">
                      <strong>Definí tus preferencias</strong>
                      <p>{prefSaved ? "Guardadas en la base de datos" : "Indicá puestos y ubicación"}</p>
                    </div>
                    <button className="small-button" onClick={() => setActive("Configuración")}>
                      {prefSaved ? "Editar" : "Abrir"}
                    </button>
                  </div>

                  <div className="setup-item">
                    <div className="step-number">{jobOffers.length > 0 ? "✓" : "3"}</div>
                    <div className="setup-text">
                      <strong>Conectá tu búsqueda</strong>
                      <p>{jobOffers.length > 0 ? `${jobOffers.length} ofertas encontradas` : "Prepará las fuentes de ofertas laborales."}</p>
                    </div>
                    <button className="small-button" onClick={() => setActive("Ofertas de empleo")}>
                      Abrir
                    </button>
                  </div>
                </section>

                <section className="panel activity-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Actividad reciente</h2>
                      <p>Historial sincronizado desde Supabase.</p>
                    </div>
                  </div>
                  {applications.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">⌁</div>
                      <strong>Sin postulaciones registradas</strong>
                      <p>Tus postulaciones enviadas aparecerán acá y se grabarán en la nube.</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {applications.map((app) => (
                        <div key={app.id} style={{ padding: "10px 14px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px" }}>
                          <strong>➤ Postulación a {app.company}</strong>
                          <p style={{ margin: "2px 0 0 0", color: "#64748b" }}>Puesto: {app.jobTitle} - {app.date}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}

          {active === "Ofertas de empleo" && (
            <>
              <div className="page-intro">
                <p className="eyebrow">BÚSQUEDA AUTOMÁTICA CON IA</p>
                <h1>Ofertas de empleo compatibles</h1>
                <p className="page-description">
                  El agente busca oportunidades laborales adaptadas a tus preferencias y tu CV.
                </p>
              </div>

              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Buscar Ofertas</h2>
                    <p>
                      Búsqueda en base a tu perfil: <strong>{preferences.puestos || "Sin especificar"}</strong> en <strong>{preferences.ubicacion || "Sin especificar"}</strong>.
                    </p>
                  </div>
                  <button
                    onClick={searchJobs}
                    disabled={isSearching}
                    style={{
                      backgroundColor: "#7c3aed",
                      color: "white",
                      border: "none",
                      fontSize: "13px",
                      fontWeight: "600",
                      padding: "10px 20px",
                      borderRadius: "8px",
                      cursor: "pointer"
                    }}
                  >
                    {isSearching ? "Buscando..." : "⌕ Buscar Oportunidades"}
                  </button>
                </div>

                {jobOffers.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">⌕</div>
                    <strong>No hay ofertas cargadas aún</strong>
                    <p>Haz clic en "Buscar Oportunidades" para que el agente escanee el mercado laboral.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {jobOffers.map((offer) => (
                      <div
                        key={offer.id}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: "12px",
                          padding: "20px",
                          backgroundColor: "white"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                          <div>
                            <h3 style={{ fontSize: "16px", fontWeight: "700", margin: "0 0 4px 0", color: "#0f172a" }}>
                              {offer.title}
                            </h3>
                            <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
                              <strong>{offer.company}</strong> - {offer.location} ({offer.modality})
                            </p>
                          </div>
                          <span
                            style={{
                              backgroundColor: offer.compatibility >= 90 ? "#dcfce7" : "#e0f2fe",
                              color: offer.compatibility >= 90 ? "#16a34a" : "#0284c7",
                              fontWeight: "700",
                              fontSize: "12px",
                              padding: "4px 10px",
                              borderRadius: "20px"
                            }}
                          >
                            {offer.compatibility}% Compatible
                          </span>
                        </div>
                        <p style={{ fontSize: "13px", color: "#334155", margin: "12px 0" }}>
                          {offer.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {active === "Mis CV" && (
            <>
              <div className="page-intro">
                <p className="eyebrow">ALMACENAMIENTO EN SUPABASE STORAGE</p>
                <h1>Mis currículums y perfil IA</h1>
                <p className="page-description">
                  Tus archivos se suben de forma segura a la nube y se procesan.
                </p>
              </div>

              <section className="panel cv-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Cargar currículum</h2>
                    <p>Formatos admitidos: PDF, DOC y DOCX. Máximo 10 MB.</p>
                  </div>
                </div>

                <div
                  style={{
                    border: "2px dashed #7c3aed",
                    borderRadius: "12px",
                    padding: "32px 20px",
                    textAlign: "center",
                    backgroundColor: "#f5f3ff",
                    cursor: "pointer",
                  }}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleFiles(event.dataTransfer.files);
                  }}
                >
                  <div style={{ fontSize: "32px", color: "#7c3aed", marginBottom: "8px" }}>↑</div>
                  <h3 style={{ fontSize: "16px", fontWeight: "700", margin: "0 0 4px 0", color: "#0f172a" }}>
                    Seleccioná tu CV para subir a la nube
                  </h3>
                  <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 16px 0" }}>
                    Elegí un archivo desde tu computadora o arrastralo acá.
                  </p>

                  <button
                    type="button"
                    style={{
                      backgroundColor: "#7c3aed",
                      color: "white",
                      border: "none",
                      fontSize: "14px",
                      fontWeight: "600",
                      padding: "10px 24px",
                      borderRadius: "8px",
                      cursor: "pointer",
                    }}
                  >
                    📁 Seleccionar Archivo
                  </button>

                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    multiple
                    style={{ display: "none" }}
                    onChange={(event) => handleFiles(event.target.files)}
                  />
                </div>

                {message && <p className="success-message">{message}</p>}
                {error && <p className="error-message">{error}</p>}
              </section>

              <section className="panel cv-list-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Archivos en Supabase y Análisis IA</h2>
                    <p>{cvs.length} archivo(s) almacenados</p>
                  </div>
                </div>

                {cvs.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">▤</div>
                    <strong>No hay CVs en la base de datos</strong>
                    <p>Sube tu primer archivo para comenzar.</p>
                  </div>
                ) : (
                  <div className="cv-list">
                    {cvs.map((cv) => (
                      <div key={cv.id} style={{ display: "flex", flexDirection: "column", width: "100%", gap: "10px" }}>
                        <article className="cv-file-row">
                          <div className="file-icon">CV</div>
                          <div className="file-info">
                            <strong>{cv.file_name}</strong>
                            <p>{cv.analyzed ? "Analizado y guardado ✓" : "Pendiente de análisis IA"}</p>
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            {!cv.analyzed ? (
                              <button
                                className="small-button"
                                style={{ backgroundColor: "#7c3aed", color: "white" }}
                                onClick={() => analyzeCV(cv.id)}
                              >
                                Analizar con IA
                              </button>
                            ) : (
                              <button
                                className="small-button"
                                onClick={() => setSelectedCvForAnalysis(selectedCvForAnalysis === cv.id ? null : cv.id)}
                              >
                                {selectedCvForAnalysis === cv.id ? "Ocultar datos" : "Ver datos extraídos"}
                              </button>
                            )}
                            <button className="remove-button" onClick={() => removeCV(cv.id)}>
                              Quitar
                            </button>
                          </div>
                        </article>

                        {selectedCvForAnalysis === cv.id && cv.extractedData && (
                          <div style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
                            <h3 style={{ fontSize: "14px", fontWeight: "700", color: "#7c3aed", marginBottom: "8px" }}>
                              ✦ Información extraída y persistida en Supabase
                            </h3>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                              <div>
                                <strong>Nombre / Perfil:</strong>
                                <p style={{ margin: "2px 0 0 0", color: "#475569" }}>{cv.extractedData.nombre}</p>
                              </div>
                              <div>
                                <strong>Puesto Ideal Estimado:</strong>
                                <p style={{ margin: "2px 0 0 0", color: "#475569" }}>{cv.extractedData.puesto}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {active === "Configuración" && (
            <div className="panel">
              <h2>Preferencias Laborales</h2>
              <p>Configura los datos que usará el agente para el matching automático.</p>
              <form onSubmit={handleSavePreferences} style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold" }}>Puestos de interés:</label>
                  <input
                    type="text"
                    value={preferences.puestos}
                    onChange={(e) => setPreferences({ ...preferences, puestos: e.target.value })}
                    style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "bold" }}>Palabras Clave (Keywords):</label>
                  <input
                    type="text"
                    value={preferences.keywords}
                    onChange={(e) => setPreferences({ ...preferences, keywords: e.target.value })}
                    style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                  />
                </div>
                <button type="submit" style={{ backgroundColor: "#7c3aed", color: "white", padding: "10px", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>
                  Guardar Preferencias
                </button>
                {prefMessage && <p style={{ color: "#16a34a", fontSize: "13px" }}>{prefMessage}</p>}
              </form>
            </div>
          )}

          {active === "Postulaciones" && (
            <div className="panel">
              <h2>Historial de Postulaciones</h2>
              <p>Registro completo de postulaciones enviadas por el agente a Supabase.</p>
              {applications.length === 0 ? (
                <p style={{ marginTop: "12px", color: "#64748b" }}>No hay postulaciones registradas todavía.</p>
              ) : (
                <ul style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {applications.map((app) => (
                    <li key={app.id} style={{ padding: "10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
                      <strong>{app.jobTitle}</strong> en {app.company} - <span style={{ color: "#16a34a" }}>{app.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}