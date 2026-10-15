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

  // Estado de Preferencias Laborales (Multipuesto por comas)
  const [preferences, setPreferences] = useState<Preferences>({
    puestos: "Atención al cliente, Repositor, Ventas, Desarrollador Web",
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
          title: "Atención al Cliente / Ventas",
          company: "Comercial del Centro",
          location: preferences.ubicacion || "Santa Fe",
          modality: preferences.modalidad || "Presencial",
          compatibility: 95,
          description: `Búsqueda orientada a: ${preferences.puestos}. Buena presencia y trato cordial.`,
          source: "Portal Laboral",
          date: "Hoy",
        },
        {
          id: "job-2",
          title: "Repositor y Control de Stock",
          company: "Supermercados Líder",
          location: "Santa Fe",
          modality: "Presencial",
          compatibility: 88,
          description: "Se busca personal para reposición de góndolas y atención en sucursal.",
          source: "Bolsa de Empleo",
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
    <main className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* MENU LATERAL SLATE / PURPLE */}
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col justify-between p-6 shrink-0 hidden md:flex">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 bg-purple-600 text-white rounded-xl flex items-center justify-center font-bold text-lg shadow-md shadow-purple-900/50">
              A
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-none">Agente Laboral</h2>
              <span className="text-[10px] text-purple-400 font-bold tracking-wider">SUPABASE CLOUD ☁</span>
            </div>
          </div>

          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Menú Principal</p>

          <nav className="flex flex-col gap-1">
            {menu.map((item) => (
              <button
                key={item.name}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
                  active === item.name
                    ? "bg-slate-800 text-purple-400 border-l-2 border-purple-500"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                }`}
                onClick={() => setActive(item.name)}
              >
                <span className="text-sm">{item.icon}</span>
                {item.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="border-t border-slate-800 pt-4">
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Base de datos activa
          </div>
          <p className="text-[11px] text-slate-500 mt-1">{stepsCompleted} de 3 pasos configurados</p>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <section className="flex-1 flex flex-col min-w-0">
        {/* BARRA SUPERIOR */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8">
          <div className="text-xs">
            <span className="text-slate-400">Agente Laboral / </span>
            <strong className="text-slate-800">{active}</strong>
          </div>
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
            U
          </div>
        </header>

        {/* NAVEGACION MOVIL */}
        <div className="bg-slate-900 p-2 md:hidden flex gap-1 overflow-x-auto">
          {menu.map((item) => (
            <button
              key={item.name}
              onClick={() => setActive(item.name)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${
                active === item.name ? "bg-purple-600 text-white" : "text-slate-400"
              }`}
            >
              {item.name}
            </button>
          ))}
        </div>

        {/* PANEL DE VISTAS */}
        <div className="p-6 md:p-10 max-w-5xl w-full mx-auto space-y-6">
          {active === "Dashboard" && (
            <>
              <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <span className="text-[10px] font-bold text-purple-600 tracking-wider uppercase">CONECTADO A SUPABASE CLOUD</span>
                  <h1 className="text-2xl font-bold text-slate-900 mt-1">Tu próximo trabajo empieza aquí.</h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Tus datos ahora se guardan de forma persistente en la nube.
                  </p>
                </div>
                <button
                  onClick={handleRunAgent}
                  disabled={executing}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-purple-200 disabled:opacity-50"
                >
                  {executing ? "🤖 Ejecutando IA..." : "🚀 Ejecutar Postulación Autónoma"}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-xs text-slate-500 font-medium">Ofertas encontradas</span>
                  <strong className="block text-2xl font-bold text-slate-900 mt-2">{jobOffers.length}</strong>
                  <p className="text-[11px] text-slate-400 mt-1">{jobOffers.length > 0 ? "Ofertas listas para revisar" : "Esperando buscar ofertas"}</p>
                </article>

                <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-xs text-slate-500 font-medium">Postulaciones</span>
                  <strong className="block text-2xl font-bold text-slate-900 mt-2">{applications.length}</strong>
                  <p className="text-[11px] text-slate-400 mt-1">Guardadas en Supabase</p>
                </article>

                <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-xs text-slate-500 font-medium">CV analizados</span>
                  <strong className="block text-2xl font-bold text-slate-900 mt-2">{analyzedCount}</strong>
                  <p className="text-[11px] text-slate-400 mt-1">De {cvs.length} archivo(s) en Storage</p>
                </article>
              </div>
            </>
          )}

          {active === "Configuración" && (
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Preferencias Laborales</h2>
                <p className="text-xs text-slate-500 mt-1">Configura los datos que usará el agente para el matching automático.</p>
              </div>

              <form onSubmit={handleSavePreferences} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Puestos de interés (puedes poner varios separados por comas):
                  </label>
                  <input
                    type="text"
                    value={preferences.puestos}
                    onChange={(e) => setPreferences({ ...preferences, puestos: e.target.value })}
                    placeholder="Ej: Atención al cliente, Repositor, Ventas, Desarrollador Web"
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Palabras Clave (Keywords):
                  </label>
                  <input
                    type="text"
                    value={preferences.keywords}
                    onChange={(e) => setPreferences({ ...preferences, keywords: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition shadow-md shadow-purple-100"
                >
                  Guardar Preferencias
                </button>

                {prefMessage && (
                  <p className="text-xs text-emerald-600 font-semibold text-center mt-2">{prefMessage}</p>
                )}
              </form>
            </div>
          )}

          {active === "Ofertas de empleo" && (
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-900">Ofertas de Empleo</h2>
                <button
                  onClick={searchJobs}
                  disabled={isSearching}
                  className="px-4 py-2 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-700 transition"
                >
                  {isSearching ? "Buscando..." : "Buscar Oportunidades"}
                </button>
              </div>
              {jobOffers.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No hay ofertas cargadas aún.</p>
              ) : (
                <div className="space-y-3">
                  {jobOffers.map((o) => (
                    <div key={o.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                      <p className="font-bold text-slate-800">{o.title} - {o.company}</p>
                      <p className="text-slate-500">{o.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {active === "Mis CV" && (
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-xl font-bold text-slate-900">Gestión de CVs</h2>
              <div
                onClick={() => inputRef.current?.click()}
                className="p-8 bg-purple-50 border border-dashed border-purple-300 rounded-2xl text-center cursor-pointer"
              >
                <p className="text-xs font-bold text-purple-700">Subir CV a Supabase Storage</p>
                <input ref={inputRef} type="file" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              </div>
            </div>
          )}

          {active === "Postulaciones" && (
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-xl font-bold text-slate-900">Historial de Postulaciones</h2>
              <p className="text-xs text-slate-500">Postulaciones registradas en la nube.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}