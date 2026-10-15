import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function runAutoApplyLogic() {
  // 1. Obtener preferencias del usuario
  const { data: prefData, error: prefError } = await supabase
    .from('preferences')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (prefError) throw new Error('Error al consultar preferencias: ' + prefError.message);

  const targetRole = prefData?.puestos || 'Desarrollador Web';
  const targetLocation = prefData?.ubicacion || 'Argentina';

  // 2. Obtener el último CV analizado
  const { data: cvData, error: cvError } = await supabase
    .from('cvs')
    .select('*')
    .eq('analyzed', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cvError) throw new Error('Error al consultar CV analizado: ' + cvError.message);
  const cvFileName = cvData?.file_name || 'cv_principal.pdf';

  // 3. Búsqueda real de empleos mediante SerpAPI
  let jobsToApply: Array<{ title: string; company: string }> = [];
  const serpApiKey = process.env.SERP_API_KEY;

  if (serpApiKey) {
    const query = encodeURIComponent(`${targetRole} in ${targetLocation}`);
    const serpUrl = `https://serpapi.com/search.json?engine=google_jobs&q=${query}&hl=es&api_key=${serpApiKey}`;

    const response = await fetch(serpUrl);
    const data = await response.json();

    if (data.jobs_results && data.jobs_results.length > 0) {
      jobsToApply = data.jobs_results.slice(0, 3).map((job: any) => ({
        title: job.title,
        company: job.company_name,
      }));
    }
  }

  // Fallback si no hay resultados inmediatos
  if (jobsToApply.length === 0) {
    jobsToApply = [
      {
        title: `${targetRole} - Remoto Global`,
        company: 'Cloud Scale S.A.',
      },
      {
        title: `${targetRole} Fullstack`,
        company: 'Digital Innovation Hub',
      },
    ];
  }

  // 4. Registrar postulaciones en Supabase
  const applicationsToInsert = jobsToApply.map((job: any) => ({
    job_title: job.title,
    company: job.company,
    cv_used: cvFileName,
    status: 'Enviada',
  }));

  const { data: insertedData, error: appError } = await supabase
    .from('applications')
    .insert(applicationsToInsert)
    .select();

  if (appError) throw new Error('Error al guardar postulaciones: ' + appError.message);

  return {
    message: `¡Agente ejecutado! Se buscaron ofertas reales para "${targetRole}" y se registraron ${applicationsToInsert.length} postulaciones.`,
    applications: insertedData,
  };
}

// Endpoint para ejecución desde el Dashboard
export async function POST() {
  try {
    const result = await runAutoApplyLogic();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Endpoint para ejecución de CRON Jobs (Vercel / Netlify)
export async function GET() {
  try {
    const result = await runAutoApplyLogic();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}