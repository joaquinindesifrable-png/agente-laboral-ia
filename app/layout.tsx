import './globals.css'

export const metadata = {
  title: 'Agente Laboral',
  description: 'Dashboard de búsqueda de empleo con Supabase',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}