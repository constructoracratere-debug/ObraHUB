import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ObraHub — El Construction OS colombiano",
  description:
    "BIM, costos APU, cronograma, bitácora diaria y control de obra con Curva S, alertas e informes de asamblea. Sin implantación, sin tarjeta de crédito.",
};

/**
 * Public marketing landing (/landing) — shareable pre-sale page.
 * Static server component: no auth, no client state, zero risk to the app.
 */
export default function LandingPage() {
  const features = [
    ["🧊", "BIM nativo 3D · 4D · 5D", "Sube tu IFC/Revit (hasta 300 MB), orbítalo en el navegador, extrae cantidades y genera el presupuesto desde el modelo."],
    ["💰", "APU con IA — nivel licitación", "Precios con fuente, rendimientos, desperdicio y desglose de equipos y herramientas. AIU e IVA colombianos."],
    ["📊", "Cronograma Gantt + 4D", "Vincula elementos del modelo a tareas y reproduce la construcción en el tiempo."],
    ["📔", "Bitácora diaria legal", "Clima, lluvia (horas), personal por oficio, equipo y avance por tarea — registro defendible en asamblea."],
    ["📈", "Curva S y Valor Ganado", "SPI/CPI, fin proyectado, semáforo de tareas y alertas con evidencia y recomendación."],
    ["🗂️", "Informe de asamblea en 1 clic", "PPTX ejecutivo con portada, KPIs, curva, alertas y bitácora de la semana. Exportación total en ZIP."],
  ];
  const plans = [
    { name: "Fundador Beta", price: "Gratis", per: "durante la beta", perks: ["Proyectos ilimitados", "Las 6 herramientas completas", "Colaboración con roles", "Exportaciones PPTX + ZIP"], cta: "Empezar ahora", hot: false },
    { name: "Profesional", price: "$149.000", per: "COP / mes", perks: ["Todo lo de Fundador", "Sello de agua removido en reportes", "Notificaciones por correo", "Soporte prioritario"], cta: "Unirse a la lista", hot: true },
    { name: "Empresa", price: "A medida", per: "constructoras", perks: ["Onboarding de tu equipo", "Obra Go — contrataciones", "Integraciones contables", "SLA y soporte dedicado"], cta: "Hablemos", hot: false },
  ];

  return (
    <div className="min-h-dvh bg-[#050b14] text-slate-200 antialiased">
      {/* Nav */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-obrahub.svg" alt="ObraHub" className="h-10 w-auto" />
        <div className="flex items-center gap-4 text-sm">
          <a href="#features" className="hidden text-slate-400 hover:text-white sm:block">Funciones</a>
          <a href="#pricing" className="hidden text-slate-400 hover:text-white sm:block">Precios</a>
          <a href="/login" className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-500">Entrar</a>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(37,99,235,0.25),transparent_60%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(56,189,248,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.04)_1px,transparent_1px)] bg-[size:56px_56px]" />
        <div className="relative mx-auto max-w-4xl px-6 pb-20 pt-16 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-4 py-1.5 text-xs font-medium text-blue-300">
            🇨🇴 Hecho en Colombia · diseñado para la construcción en LATAM
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl">
            IA para ingeniería y construcción
            <span className="block bg-gradient-to-r from-sky-400 to-blue-600 bg-clip-text text-transparent">en Latinoamérica.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
            Toda tu obra en un solo lugar: BIM, presupuestos APU con IA, cronograma, bitácora diaria y control con Curva S — del modelo 3D al informe de asamblea del viernes. Normativa local por país (NSR-10 hoy, más por venir). Sin implantación, sin tarjeta de crédito.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <a href="/login" className="rounded-xl bg-blue-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:bg-blue-500">
              Crear mi cuenta gratis
            </a>
            <a href="#features" className="rounded-xl border border-white/[0.12] px-7 py-3.5 text-base font-medium text-slate-200 transition hover:bg-white/[0.05]">
              Ver funciones
            </a>
          </div>
          <p className="mt-5 text-xs text-slate-600">Entra con tu correo y un código — nunca contraseñas.</p>
        </div>
      </header>

      {/* Problema → solución */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[["📉", "Excel y WhatsApp no son control", "Cada día de obra genera datos que se pierden en chats y carpetas."],
            ["💸", "Procore: USD 300–500/usuario/mes", "Clase mundial, inalcanzable para la PYME constructora."],
            ["🏗️", "ObraHub: el circuito completo", "BIM → APU → Gantt → Bitácora → Curva S → Informe. A precio PYME."]].map(([ic, t, d]) => (
            <div key={t} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
              <div className="text-2xl">{ic}</div>
              <h3 className="mt-3 text-base font-semibold text-white">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">Seis herramientas, un flujo de obra</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-slate-400">Ordenadas como se construye: insumos → dinero → tiempo → realidad → decisión.</p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(([ic, t, d]) => (
            <div key={t} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition hover:border-blue-500/25 hover:bg-blue-500/[0.04]">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-xl ring-1 ring-blue-500/20">{ic}</div>
              <h3 className="mt-4 text-base font-semibold text-white">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">Precios de PYME, alma de enterprise</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-slate-400">Únete como Fundador y congelamos tu plan al lanzar.</p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <div key={p.name} className={`rounded-2xl border p-7 ${p.hot ? "border-blue-500/40 bg-blue-500/[0.07] shadow-xl shadow-blue-950/40" : "border-white/[0.07] bg-white/[0.02]"}`}>
              {p.hot && <span className="mb-3 inline-block rounded-full bg-blue-500 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Recomendado</span>}
              <h3 className="text-lg font-semibold text-white">{p.name}</h3>
              <p className="mt-2"><span className="text-3xl font-extrabold text-white">{p.price}</span> <span className="text-sm text-slate-500">{p.per}</span></p>
              <ul className="mt-5 space-y-2.5 text-sm text-slate-300">
                {p.perks.map((k) => <li key={k} className="flex gap-2"><span className="text-emerald-400">✓</span>{k}</li>)}
              </ul>
              <a href="/login" className={`mt-7 block rounded-xl px-4 py-3 text-center text-sm font-semibold transition ${p.hot ? "bg-blue-600 text-white hover:bg-blue-500" : "border border-white/[0.12] text-slate-200 hover:bg-white/[0.05]"}`}>{p.cta}</a>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-white sm:text-4xl">La obra ya generó los datos.<br />Nosotros los convertimos en decisiones.</h2>
        <a href="/login" className="mt-8 inline-block rounded-xl bg-blue-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:bg-blue-500">
          Empezar gratis hoy
        </a>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
          <span>© 2026 <strong className="text-slate-400">Powered by Cratere S.A.S.</strong> — ObraHub y ObraGo son productos de la familia Cratere</span>
          <span>Diego Orlando Pineda Escobar — Tec. Constr. Arq. (UGC) · Ing. Constructor (ITC Méx.) · Constructor y Gestor en Arquitectura (UNICOLMAYOR)</span>
          <span>constructoracratere@gmail.com</span>
        </div>
      </footer>
    </div>
  );
}
