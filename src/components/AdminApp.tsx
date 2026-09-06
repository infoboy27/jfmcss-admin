"use client";

import { useMemo, useState } from "react";

type ModuleKey =
  | "dashboard"
  | "clients"
  | "sales"
  | "projects"
  | "billing"
  | "payments"
  | "support"
  | "renewals"
  | "notifications"
  | "automations"
  | "reports"
  | "settings";

type IconName =
  | "grid" | "users" | "trend" | "folder" | "file" | "wallet" | "life" | "server"
  | "bell" | "bolt" | "chart" | "settings" | "search" | "plus" | "chev" | "more"
  | "arrow" | "check" | "clock" | "mail" | "phone" | "shield" | "spark" | "calendar"
  | "external" | "filter" | "download" | "receipt" | "activity" | "heart" | "building";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const p: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    trend: <><path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/></>,
    folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></>,
    wallet: <><path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v11H5a3 3 0 0 1-3-3V6"/><path d="M16 14h.01"/></>,
    life: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="m5.6 5.6 4.3 4.3M14.1 14.1l4.3 4.3M18.4 5.6l-4.3 4.3M9.9 14.1l-4.3 4.3"/></>,
    server: <><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7Z"/>,
    chart: <><path d="M3 3v18h18"/><path d="m7 16 4-5 4 3 5-7"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 9 19.35a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.07 14H3v-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1-1.56V3h4v.09A1.7 1.7 0 0 0 15 4.65a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9c.14.62.68 1.05 1.32 1.05H21v4h-.31c-.64 0-1.18.43-1.29 1Z"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    chev: <path d="m9 18 6-6-6-6"/>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z"/>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></>,
    spark: <><path d="m12 3-1.2 3.6L7 8l3.8 1.4L12 13l1.2-3.6L17 8l-3.8-1.4Z"/><path d="m18 14-.7 2.1L15 17l2.3.9L18 20l.7-2.1L21 17l-2.3-.9Z"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    external: <><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></>,
    filter: <path d="M4 5h16l-6 7v5l-4 2v-7Z"/>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    receipt: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
    activity: <path d="M3 12h4l2-7 4 14 2-7h6"/>,
    heart: <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></>,
    building: <><path d="M4 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M16 8h3a1 1 0 0 1 1 1v12M8 7h4M8 11h4M8 15h4M9 21v-3h2v3M2 21h20"/></>,
  };
  return <svg {...common}>{p[name]}</svg>;
}

const navGroups: { label: string; items: { key: ModuleKey; label: string; icon: IconName; badge?: string }[] }[] = [
  { label: "Workspace", items: [
    { key: "dashboard", label: "Centro de control", icon: "grid" },
    { key: "clients", label: "Clientes", icon: "users", badge: "38" },
    { key: "sales", label: "Ventas", icon: "trend", badge: "7" },
    { key: "projects", label: "Proyectos", icon: "folder", badge: "14" },
  ]},
  { label: "Operaciones", items: [
    { key: "billing", label: "Facturación", icon: "file" },
    { key: "payments", label: "Cobros", icon: "wallet" },
    { key: "support", label: "Soporte", icon: "life", badge: "8" },
    { key: "renewals", label: "Servicios & activos", icon: "server", badge: "3" },
  ]},
  { label: "Inteligencia", items: [
    { key: "notifications", label: "Comunicaciones", icon: "bell" },
    { key: "automations", label: "Automatizaciones", icon: "bolt" },
    { key: "reports", label: "Reportes", icon: "chart" },
  ]},
];

const clients = [
  { initials: "RB", name: "Reset Bariatric Surgery", type: "Empresa", projects: 2, mr: "RD$42,000", balance: "RD$0", health: 96, status: "Activo", color: "blue" },
  { initials: "AD", name: "Adsemble SRL", type: "Empresa", projects: 1, mr: "RD$18,500", balance: "RD$35,400", health: 89, status: "Activo", color: "cyan" },
  { initials: "NF", name: "NodeFleet", type: "Empresa", projects: 3, mr: "US$2,800", balance: "US$0", health: 98, status: "VIP", color: "purple" },
  { initials: "WN", name: "Weavers Nodes", type: "Empresa", projects: 4, mr: "US$1,400", balance: "US$700", health: 92, status: "Activo", color: "blue" },
  { initials: "MC", name: "MCSD Advertising", type: "Empresa", projects: 1, mr: "RD$12,000", balance: "RD$12,000", health: 74, status: "Atención", color: "amber" },
];

const invoices = [
  { number: "FAC-2026-0128", client: "Adsemble SRL", ncf: "E310000001284", issue: "05 sep", due: "05 oct", amount: "RD$35,400.00", status: "Pendiente" },
  { number: "FAC-2026-0127", client: "Reset Bariatric Surgery", ncf: "E310000001283", issue: "02 sep", due: "02 oct", amount: "RD$90,000.00", status: "Pagada" },
  { number: "FAC-2026-0126", client: "MCSD Advertising", ncf: "E310000001282", issue: "28 ago", due: "27 sep", amount: "RD$12,000.00", status: "Vence pronto" },
  { number: "FAC-2026-0125", client: "Weavers Nodes", ncf: "E310000001281", issue: "15 ago", due: "15 sep", amount: "US$700.00", status: "Parcial" },
  { number: "FAC-2026-0124", client: "Liquid Digital Agency", ncf: "E320000000824", issue: "10 ago", due: "10 sep", amount: "RD$28,320.00", status: "Vencida" },
];

const tickets = [
  { id: "SUP-124", title: "Error al generar reporte clínico", client: "Reset Bariatric", priority: "Urgente", owner: "JM", age: "18 min", sla: "1h 42m", status: "En progreso" },
  { id: "SUP-123", title: "Usuario no puede acceder al portal", client: "Adsemble", priority: "Alta", owner: "JM", age: "1h", sla: "3h 18m", status: "Nuevo" },
  { id: "SUP-121", title: "Actualizar certificado SSL", client: "MCSD Advertising", priority: "Media", owner: "AC", age: "3h", sla: "9h 10m", status: "Esperando cliente" },
  { id: "SUP-119", title: "Ajuste en sincronización BC", client: "Adsemble", priority: "Media", owner: "JM", age: "1d", sla: "6h 30m", status: "En progreso" },
];

const projects = [
  { name: "Medisoft · Gestión Clínica", client: "Reset Bariatric Surgery", status: "Producción", progress: 92, revenue: "RD$260k", margin: "71%", owner: "Jonatan", next: "Go-live asistido" },
  { name: "Portal de Proveedores", client: "Adsemble SRL", status: "Piloto", progress: 96, revenue: "RD$180k", margin: "64%", owner: "Jonatan", next: "1ra factura real" },
  { name: "Canoliq", client: "Producto interno", status: "Launch", progress: 88, revenue: "—", margin: "—", owner: "JFMCSS", next: "Mainnet Day 1" },
  { name: "NodeFleet Infra Ops", client: "NodeFleet", status: "Retainer", progress: 100, revenue: "US$2.8k/mo", margin: "83%", owner: "Jonatan", next: "SLA review" },
];

const renewals = [
  { asset: "medisoft.app", client: "Reset Bariatric", type: "Dominio", date: "18 sep 2026", days: 13, cost: "US$18", owner: "JFMCSS" },
  { asset: "Azure · Portal Proveedores", client: "Adsemble", type: "Cloud VM", date: "01 oct 2026", days: 26, cost: "US$72/mo", owner: "Cliente" },
  { asset: "SSL · automation.jfmcss.com", client: "JFMCSS", type: "Certificado", date: "09 oct 2026", days: 34, cost: "Auto", owner: "JFMCSS" },
  { asset: "Nodefleet EU cluster", client: "NodeFleet", type: "Infraestructura", date: "01 nov 2026", days: 57, cost: "US$640/mo", owner: "JFMCSS" },
];

function Status({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "green" | "amber" | "red" | "blue" | "purple" | "neutral" }) {
  return <span className={`status status-${tone}`}><span className="status-dot" />{children}</span>;
}

function Avatar({ initials, color = "blue", small = false }: { initials: string; color?: string; small?: boolean }) {
  return <span className={`avatar avatar-${color} ${small ? "avatar-small" : ""}`}>{initials}</span>;
}

function PageHeader({ eyebrow, title, description, action, onAction }: { eyebrow: string; title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="page-header">
    <div>
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {action && <button className="primary-btn" onClick={onAction}><Icon name="plus" size={16}/>{action}</button>}
  </div>;
}

function Dashboard({ navigate }: { navigate: (m: ModuleKey) => void }) {
  return <>
    <div className="welcome-row">
      <div>
        <div className="eyebrow">SÁBADO · 05 SEP 2026</div>
        <h1>Buenas noches, Jonatan.</h1>
        <p>Esto es lo que requiere tu atención hoy.</p>
      </div>
      <button className="primary-btn"><Icon name="plus" size={16}/>Crear</button>
    </div>

    <div className="attention-strip">
      <div className="ai-orb"><Icon name="spark" size={18}/></div>
      <div className="attention-copy">
        <strong>JFMCSS Pulse</strong>
        <span>Detecté <b>5 acciones</b> que pueden proteger RD$75,720 en ingresos y evitar 2 incumplimientos de SLA.</span>
      </div>
      <button className="text-btn">Revisar prioridades <Icon name="arrow" size={15}/></button>
    </div>

    <div className="kpi-grid">
      <div className="metric-card featured">
        <div className="metric-top"><span>Ingresos · septiembre</span><span className="metric-icon"><Icon name="trend"/></span></div>
        <div className="metric-value">RD$428,500</div>
        <div className="metric-foot"><span className="up">↗ 18.4%</span><span>vs. agosto</span></div>
        <div className="spark-bars">{[28,43,35,58,48,70,62,84,75,92,86,100].map((h,i)=><i key={i} style={{height:`${h}%`}} />)}</div>
      </div>
      <div className="metric-card">
        <div className="metric-top"><span>Por cobrar</span><span className="metric-icon"><Icon name="wallet"/></span></div>
        <div className="metric-value">RD$97,500</div>
        <div className="metric-foot"><span className="warn">2 vencidas</span><span>RD$28,320</span></div>
      </div>
      <div className="metric-card">
        <div className="metric-top"><span>MRR</span><span className="metric-icon"><Icon name="activity"/></span></div>
        <div className="metric-value">RD$184,200</div>
        <div className="metric-foot"><span className="up">↗ 6.2%</span><span>12 servicios activos</span></div>
      </div>
      <div className="metric-card">
        <div className="metric-top"><span>Soporte</span><span className="metric-icon"><Icon name="life"/></span></div>
        <div className="metric-value">8 <small>abiertos</small></div>
        <div className="metric-foot"><span className="danger">2 en riesgo</span><span>SLA 96.8%</span></div>
      </div>
    </div>

    <div className="dashboard-grid">
      <section className="panel revenue-panel">
        <div className="panel-head">
          <div><span className="panel-kicker">REVENUE</span><h2>Ingresos & cobros</h2></div>
          <select defaultValue="6m"><option value="6m">Últimos 6 meses</option><option>Este año</option></select>
        </div>
        <div className="chart-legend"><span><i className="legend-line solid"/>Facturado</span><span><i className="legend-line faint"/>Cobrado</span></div>
        <div className="line-chart">
          <div className="y-labels"><span>500k</span><span>375k</span><span>250k</span><span>125k</span><span>0</span></div>
          <div className="chart-area">
            <div className="grid-line l1"/><div className="grid-line l2"/><div className="grid-line l3"/><div className="grid-line l4"/>
            <svg viewBox="0 0 700 220" preserveAspectRatio="none" aria-label="Gráfico de ingresos">
              <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#00cafe" stopOpacity=".25"/><stop offset="1" stopColor="#00cafe" stopOpacity="0"/></linearGradient></defs>
              <path className="chart-area-fill" d="M0 174 C70 158 90 150 140 151 S230 115 280 128 S370 93 420 107 S510 66 560 82 S645 40 700 48 L700 220 L0 220 Z"/>
              <path className="chart-line-main" d="M0 174 C70 158 90 150 140 151 S230 115 280 128 S370 93 420 107 S510 66 560 82 S645 40 700 48"/>
              <path className="chart-line-alt" d="M0 190 C65 182 105 166 140 170 S225 142 280 148 S360 119 420 124 S505 98 560 108 S650 78 700 83"/>
            </svg>
            <div className="x-labels"><span>Abr</span><span>May</span><span>Jun</span><span>Jul</span><span>Ago</span><span>Sep</span></div>
          </div>
        </div>
      </section>

      <section className="panel actions-panel">
        <div className="panel-head"><div><span className="panel-kicker">PRIORIDADES</span><h2>Siguiente mejor acción</h2></div><span className="counter">5</span></div>
        <div className="action-list">
          <div className="action-item critical"><span className="action-mark">!</span><div><b>Factura vencida · Liquid Digital</b><p>RD$28,320 · 5 días vencida</p></div><button onClick={()=>navigate("payments")}><Icon name="chev"/></button></div>
          <div className="action-item urgent"><span className="action-mark"><Icon name="clock" size={14}/></span><div><b>SLA en riesgo · SUP-124</b><p>1h 42m restantes · Reset Bariatric</p></div><button onClick={()=>navigate("support")}><Icon name="chev"/></button></div>
          <div className="action-item"><span className="action-mark"><Icon name="server" size={14}/></span><div><b>Renovación en 13 días</b><p>medisoft.app · dominio</p></div><button onClick={()=>navigate("renewals")}><Icon name="chev"/></button></div>
          <div className="action-item"><span className="action-mark"><Icon name="file" size={14}/></span><div><b>NCF por debajo del 20%</b><p>Crédito Fiscal · 184 secuencias</p></div><button onClick={()=>navigate("billing")}><Icon name="chev"/></button></div>
        </div>
        <button className="panel-link">Ver todas las acciones <Icon name="arrow" size={14}/></button>
      </section>
    </div>

    <div className="dashboard-grid lower-grid">
      <section className="panel">
        <div className="panel-head"><div><span className="panel-kicker">CLIENT SUCCESS</span><h2>Salud de clientes</h2></div><button className="icon-btn" onClick={()=>navigate("clients")}><Icon name="arrow"/></button></div>
        <div className="client-health-list">
          {clients.slice(0,4).map(c=><div className="health-row" key={c.name}><div className="health-client"><Avatar initials={c.initials} color={c.color} small/><div><b>{c.name}</b><span>{c.projects} proyectos · {c.mr}</span></div></div><div className="health-score"><div className="health-track"><i style={{width:`${c.health}%`}}/></div><strong className={c.health<80?"score-warn":""}>{c.health}</strong></div></div>)}
        </div>
      </section>

      <section className="panel activity-panel">
        <div className="panel-head"><div><span className="panel-kicker">LIVE</span><h2>Actividad reciente</h2></div><span className="live-dot"/></div>
        <div className="timeline">
          <div className="timeline-item"><span className="timeline-icon paid"><Icon name="check" size={14}/></span><div><b>Pago recibido · RD$90,000</b><p>Reset Bariatric · FAC-2026-0127</p><span>Hace 22 min</span></div></div>
          <div className="timeline-item"><span className="timeline-icon"><Icon name="life" size={14}/></span><div><b>Nuevo ticket SUP-124</b><p>Error al generar reporte clínico</p><span>Hace 38 min</span></div></div>
          <div className="timeline-item"><span className="timeline-icon"><Icon name="file" size={14}/></span><div><b>Factura enviada a Adsemble</b><p>FAC-2026-0128 · RD$35,400</p><span>Hace 2 h</span></div></div>
          <div className="timeline-item"><span className="timeline-icon"><Icon name="folder" size={14}/></span><div><b>Portal de Proveedores → 96%</b><p>Hito “Piloto producción” completado</p><span>Hace 4 h</span></div></div>
        </div>
      </section>
    </div>
  </>;
}

function Clients({ onSelect }: { onSelect: (name: string) => void }) {
  return <>
    <PageHeader eyebrow="CRM · 38 CLIENTES" title="Clientes" description="Una sola vista para relaciones, proyectos, facturación, soporte y activos." action="Nuevo cliente" />
    <div className="summary-cards compact">
      <div><span>Clientes activos</span><strong>32</strong><small>+3 este trimestre</small></div>
      <div><span>MRR gestionado</span><strong>RD$184.2k</strong><small>↗ 6.2% vs. agosto</small></div>
      <div><span>Health score promedio</span><strong>91</strong><small>Excelente</small></div>
      <div><span>En atención</span><strong>3</strong><small>Requieren seguimiento</small></div>
    </div>
    <section className="panel table-panel">
      <div className="table-toolbar"><div className="table-search"><Icon name="search" size={16}/><input placeholder="Buscar por cliente, RNC, contacto..." /></div><button className="secondary-btn"><Icon name="filter" size={15}/>Filtros</button><button className="secondary-btn"><Icon name="download" size={15}/>Exportar</button></div>
      <div className="data-table client-table">
        <div className="table-row table-head"><span>Cliente</span><span>Relación</span><span>Proyectos</span><span>MRR</span><span>Balance</span><span>Salud</span><span>Estado</span><span/></div>
        {clients.map(c=><button className="table-row" key={c.name} onClick={()=>onSelect(c.name)}><span className="client-cell"><Avatar initials={c.initials} color={c.color}/><span><b>{c.name}</b><small>{c.type} · RNC verificado</small></span></span><span>2a 4m</span><span>{c.projects}</span><span>{c.mr}</span><span className={c.balance!=="RD$0"&&c.balance!=="US$0"?"money-due":""}>{c.balance}</span><span className="score-cell"><i style={{width:`${c.health}%`}}/><b>{c.health}</b></span><span><Status tone={c.status==="Atención"?"amber":c.status==="VIP"?"purple":"green"}>{c.status}</Status></span><span><Icon name="chev" size={16}/></span></button>)}
      </div>
    </section>
  </>;
}

function ClientDrawer({ client, onClose }: { client: string; onClose: () => void }) {
  const c = clients.find(x=>x.name===client) ?? clients[0];
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="client-drawer" onMouseDown={e=>e.stopPropagation()}>
    <div className="drawer-head"><button className="drawer-close" onClick={onClose}>×</button><button className="secondary-btn"><Icon name="more"/></button></div>
    <div className="client-hero"><Avatar initials={c.initials} color={c.color}/><div><div className="client-name-line"><h2>{c.name}</h2><Status tone="green">Activo</Status></div><p>Cliente desde mayo 2024 · Santo Domingo, DO</p></div></div>
    <div className="client-quick"><button><Icon name="mail"/><span>Email</span></button><button><Icon name="phone"/><span>WhatsApp</span></button><button><Icon name="file"/><span>Facturar</span></button><button><Icon name="life"/><span>Ticket</span></button></div>
    <div className="client-pulse"><div><span>HEALTH SCORE</span><strong>{c.health}<small>/100</small></strong></div><div className="pulse-bars"><i/><i/><i/><i/><i className="faint"/></div><p>Relación saludable. Último pago a tiempo y SLA de soporte al 98%.</p></div>
    <div className="drawer-tabs"><button className="active">Resumen</button><button>Finanzas</button><button>Soporte</button><button>Activos</button></div>
    <div className="drawer-section"><h3>Resumen comercial</h3><div className="detail-grid"><div><span>RNC</span><b>1-32-88421-7</b></div><div><span>Condición de pago</span><b>30 días</b></div><div><span>MRR</span><b>{c.mr}</b></div><div><span>Balance</span><b>{c.balance}</b></div></div></div>
    <div className="drawer-section"><div className="section-title-row"><h3>Proyectos activos</h3><button>Ver todos</button></div><div className="mini-project"><div className="mini-icon"><Icon name="folder"/></div><div><b>Portal / Plataforma principal</b><span>Producción · 96% completado</span><div className="mini-progress"><i style={{width:"96%"}}/></div></div><Icon name="chev" size={16}/></div></div>
    <div className="drawer-section"><div className="section-title-row"><h3>Actividad</h3><button>+ Nota</button></div><div className="mini-timeline"><div><i/><span><b>Pago confirmado</b><small>Hoy · 20:42</small></span></div><div><i/><span><b>Factura enviada por email</b><small>02 sep · 09:14</small></span></div><div><i/><span><b>Ticket SUP-119 actualizado</b><small>29 ago · 15:08</small></span></div></div></div>
  </aside></div>;
}

function Sales() {
  const cols = [
    { title: "Prospecto", sum: "RD$380k", cards: [{n:"Clínica Nova",v:"RD$160k",p:"25%",t:"Sistema clínico"},{n:"Grupo Atlas",v:"RD$220k",p:"20%",t:"Portal B2B"}] },
    { title: "Calificado", sum: "RD$505k", cards: [{n:"Constructora LMC",v:"RD$325k",p:"45%",t:"ERP ligero"},{n:"Blue Health",v:"RD$180k",p:"40%",t:"Automatización"}] },
    { title: "Propuesta", sum: "RD$420k", cards: [{n:"Grupo Élite",v:"RD$240k",p:"65%",t:"CRM custom"},{n:"Farma Uno",v:"RD$180k",p:"70%",t:"Integración BC"}] },
    { title: "Negociación", sum: "RD$275k", cards: [{n:"Inversiones RG",v:"RD$275k",p:"85%",t:"Plataforma SaaS"}] },
  ];
  return <><PageHeader eyebrow="SALES CRM · PIPELINE" title="Ventas" description="Del primer contacto al contrato, con forecast y siguiente acción en cada oportunidad." action="Nueva oportunidad"/>
    <div className="sales-top"><div className="forecast"><span>Pipeline abierto</span><b>RD$1.58M</b><small>Forecast ponderado RD$823k</small></div><div className="conversion"><span>Conversión</span><b>34.8%</b><small>↗ 4.1 pts este trimestre</small></div><div className="conversion"><span>Ciclo promedio</span><b>21 días</b><small>−3 días vs. Q2</small></div></div>
    <div className="kanban">{cols.map((col,i)=><div className="kanban-col" key={col.title}><div className="kanban-head"><span><i className={`stage-dot s${i}`}/>{col.title}<em>{col.cards.length}</em></span><b>{col.sum}</b></div>{col.cards.map(card=><div className="deal-card" key={card.n}><div className="deal-title"><Avatar initials={card.n.slice(0,2).toUpperCase()} small color={i>1?"cyan":"blue"}/><div><b>{card.n}</b><span>{card.t}</span></div></div><div className="deal-value"><strong>{card.v}</strong><span>{card.p} prob.</span></div><div className="deal-foot"><span><Icon name="calendar" size={13}/> Próx. acción 08 sep</span><Avatar initials="JM" small/></div></div>)}</div>)}</div>
  </>;
}

function Projects() {
  return <><PageHeader eyebrow="DELIVERY · 14 ACTIVOS" title="Proyectos" description="Controla ejecución, margen, hitos, repositorios, infraestructura y soporte desde el mismo lugar." action="Nuevo proyecto"/>
    <div className="project-overview"><div className="project-big-card"><span>Valor activo</span><strong>RD$1.42M</strong><small>14 proyectos · 4 recurrentes</small></div><div className="project-health-ring"><div className="ring"><span>92<small>%</small></span></div><div><span>Entrega saludable</span><b>11 de 14 en verde</b><small>2 requieren atención · 1 bloqueado</small></div></div><div className="project-profit"><span>Margen promedio</span><strong>72.4%</strong><small>+5.8 pts vs. Q2</small></div></div>
    <section className="panel table-panel"><div className="table-toolbar"><div className="table-search"><Icon name="search" size={16}/><input placeholder="Buscar proyectos..."/></div><button className="secondary-btn"><Icon name="filter" size={15}/>Estado</button><button className="secondary-btn">Vista: Lista</button></div>
      <div className="data-table project-table"><div className="table-row table-head"><span>Proyecto</span><span>Estado</span><span>Progreso</span><span>Valor</span><span>Margen</span><span>Responsable</span><span>Próximo hito</span></div>{projects.map(p=><div className="table-row" key={p.name}><span><b>{p.name}</b><small>{p.client}</small></span><span><Status tone={p.status==="Launch"?"purple":p.status==="Piloto"?"amber":"green"}>{p.status}</Status></span><span className="project-progress"><div><i style={{width:`${p.progress}%`}}/></div><b>{p.progress}%</b></span><span>{p.revenue}</span><span className="margin-good">{p.margin}</span><span className="owner-cell"><Avatar initials="JM" small/><span>{p.owner}</span></span><span>{p.next}</span></div>)}</div>
    </section>
  </>;
}

function Billing({ onPreview }: { onPreview: () => void }) {
  return <><PageHeader eyebrow="FINANZAS · FISCAL" title="Facturación" description="Facturas, NCF/e-CF, recurrencias, notas de crédito y trazabilidad fiscal en un solo flujo." action="Nueva factura" onAction={onPreview}/>
    <div className="fiscal-banner"><div className="fiscal-icon"><Icon name="shield"/></div><div><span>CENTRO FISCAL</span><b>Secuencias y e-CF saludables</b><p>Última validación: hoy 21:48 · Sin inconsistencias detectadas</p></div><div className="fiscal-stats"><span><b>184</b> E31 disponibles</span><span><b>92%</b> integridad fiscal</span><button>Ver centro fiscal <Icon name="arrow" size={14}/></button></div></div>
    <div className="summary-cards compact billing-summary"><div><span>Facturado · septiembre</span><strong>RD$428.5k</strong><small>12 documentos</small></div><div><span>Cobrado</span><strong>RD$331k</strong><small>77.2% collection rate</small></div><div><span>Pendiente</span><strong>RD$97.5k</strong><small>4 facturas</small></div><div><span>Vencido</span><strong className="danger-text">RD$28.3k</strong><small>1 factura · 5 días</small></div></div>
    <section className="panel table-panel"><div className="table-toolbar"><div className="tab-pills"><button className="active">Todas <span>128</span></button><button>Pendientes <span>4</span></button><button>Vencidas <span>1</span></button><button>Recurrentes <span>12</span></button></div><div className="toolbar-end"><button className="secondary-btn"><Icon name="filter" size={15}/>Filtrar</button><button className="secondary-btn"><Icon name="download" size={15}/></button></div></div>
      <div className="data-table invoice-table"><div className="table-row table-head"><span>Factura</span><span>Cliente</span><span>NCF / e-NCF</span><span>Emisión</span><span>Vencimiento</span><span>Total</span><span>Estado</span><span/></div>{invoices.map(inv=><button className="table-row" key={inv.number} onClick={onPreview}><span><b>{inv.number}</b></span><span>{inv.client}</span><span className="mono">{inv.ncf}</span><span>{inv.issue}</span><span>{inv.due}</span><span><b>{inv.amount}</b></span><span><Status tone={inv.status==="Pagada"?"green":inv.status==="Vencida"?"red":inv.status==="Vence pronto"?"amber":inv.status==="Parcial"?"purple":"blue"}>{inv.status}</Status></span><span><Icon name="more" size={16}/></span></button>)}</div>
    </section>
  </>;
}

function InvoicePreview({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="invoice-modal" onMouseDown={e=>e.stopPropagation()}>
    <div className="invoice-modal-bar"><div><span className="pdf-chip">PDF</span><div><b>FAC-2026-0128</b><small>Vista previa del documento</small></div></div><div><button className="secondary-btn"><Icon name="mail" size={15}/>Enviar</button><button className="secondary-btn"><Icon name="download" size={15}/>Descargar</button><button className="icon-btn" onClick={onClose}>×</button></div></div>
    <div className="invoice-paper">
      <div className="invoice-brand"><div className="brand-lockup"><div className="mini-logo">J</div><div><b>JFMCSS</b><span>SOFTWARE · CLOUD · AUTOMATION</span></div></div><div className="invoice-title"><span>FACTURA</span><b># FAC-2026-0128</b></div></div>
      <div className="invoice-rule"/>
      <div className="invoice-meta"><div><span>FACTURADO A</span><b>Adsemble SRL</b><p>RNC 1-32-88421-7<br/>Santo Domingo, República Dominicana<br/>finanzas@adsemble.com</p></div><div className="invoice-meta-grid"><span><small>FECHA EMISIÓN</small><b>05/09/2026</b></span><span><small>VENCIMIENTO</small><b>05/10/2026</b></span><span><small>e-NCF</small><b>E310000001284</b></span><span><small>CONDICIÓN</small><b>30 días</b></span></div></div>
      <div className="invoice-lines"><div className="invoice-line-head"><span>Descripción</span><span>Cant.</span><span>Precio</span><span>Importe</span></div><div className="invoice-line"><span><b>Implementación Portal de Proveedores</b><small>Desarrollo, despliegue y acompañamiento de piloto</small></span><span>1</span><span>RD$30,000.00</span><span>RD$30,000.00</span></div></div>
      <div className="invoice-bottom"><div className="invoice-note"><b>Gracias por confiar en JFMCSS.</b><p>Para cualquier consulta sobre esta factura, responde al correo recibido o abre un ticket desde tu portal de cliente.</p></div><div className="invoice-totals"><span><small>Subtotal</small><b>RD$30,000.00</b></span><span><small>ITBIS 18%</small><b>RD$5,400.00</b></span><span className="total"><small>Total</small><b>RD$35,400.00</b></span></div></div>
      <div className="invoice-footer"><span>jfmcss.com</span><span>República Dominicana</span><span>Documento generado por JFMCSS Control</span></div>
    </div>
  </div></div>;
}

function Payments() {
  return <><PageHeader eyebrow="REVENUE OPS" title="Cobros" description="Controla cuentas por cobrar, pagos parciales, promesas de pago y conciliación." action="Registrar pago"/>
    <div className="collection-hero"><div><span>CUENTAS POR COBRAR</span><strong>RD$97,500</strong><p>4 facturas abiertas · DSO promedio 22 días</p></div><div className="aging"><div><span>0–30 días</span><b>RD$57.2k</b><i style={{width:"59%"}}/></div><div><span>31–60 días</span><b>RD$12k</b><i className="amber-bar" style={{width:"28%"}}/></div><div><span>60+ días</span><b>RD$28.3k</b><i className="red-bar" style={{width:"42%"}}/></div></div><div className="collection-score"><span>Collection score</span><strong>88</strong><small>Bueno · ↗ 6 pts</small></div></div>
    <div className="two-col"><section className="panel"><div className="panel-head"><div><span className="panel-kicker">SEGUIMIENTO</span><h2>Cobros prioritarios</h2></div></div><div className="collection-list"><div><span className="risk-dot red"/><div><b>Liquid Digital Agency</b><span>FAC-2026-0124 · 5 días vencida</span></div><strong>RD$28,320</strong><button>Recordar</button></div><div><span className="risk-dot amber"/><div><b>MCSD Advertising</b><span>FAC-2026-0126 · vence en 22 días</span></div><strong>RD$12,000</strong><button>Ver</button></div><div><span className="risk-dot purple"/><div><b>Weavers Nodes</b><span>Pago parcial · 50% recibido</span></div><strong>US$700</strong><button>Ver</button></div></div></section><section className="panel"><div className="panel-head"><div><span className="panel-kicker">AUTOMATION</span><h2>Cadencia de cobro</h2></div><Status tone="green">Activa</Status></div><div className="cadence"><div className="cadence-step done"><i><Icon name="check" size={12}/></i><div><b>Factura emitida</b><span>Email + portal</span></div></div><div className="cadence-step"><i>−3</i><div><b>Recordatorio preventivo</b><span>3 días antes</span></div></div><div className="cadence-step"><i>+1</i><div><b>Primer recordatorio</b><span>Email + WhatsApp</span></div></div><div className="cadence-step"><i>+7</i><div><b>Escalación</b><span>Alerta interna + contacto</span></div></div></div></section></div>
  </>;
}

function Support() {
  return <><PageHeader eyebrow="SERVICE DESK · SLA 96.8%" title="Soporte" description="Tickets, SLA, conocimiento, tiempos facturables y contexto completo del cliente." action="Nuevo ticket"/>
    <div className="support-strip"><div><span>Abiertos</span><b>8</b><small>2 nuevos hoy</small></div><div><span>En riesgo SLA</span><b className="danger-text">2</b><small>Requieren acción</small></div><div><span>1ra respuesta</span><b>18m</b><small>Meta &lt; 30m</small></div><div><span>Resolución promedio</span><b>4h 12m</b><small>↘ 18% este mes</small></div><div><span>CSAT</span><b>4.9/5</b><small>36 respuestas</small></div></div>
    <div className="support-layout"><section className="panel ticket-panel"><div className="table-toolbar"><div className="tab-pills"><button className="active">Mis tickets <span>6</span></button><button>Todos <span>8</span></button><button>Sin asignar <span>1</span></button></div><button className="secondary-btn"><Icon name="filter" size={15}/></button></div><div className="ticket-list">{tickets.map((t,i)=><div className={`ticket ${i===0?"selected":""}`} key={t.id}><div className="ticket-check"/><div className="ticket-main"><div className="ticket-id"><span>{t.id}</span><Status tone={t.priority==="Urgente"?"red":t.priority==="Alta"?"amber":"neutral"}>{t.priority}</Status></div><b>{t.title}</b><p>{t.client}</p></div><div className="ticket-state"><Status tone={t.status==="Nuevo"?"blue":t.status==="Esperando cliente"?"purple":"green"}>{t.status}</Status><small>Abierto hace {t.age}</small></div><div className={`sla ${i===0?"sla-danger":""}`}><span><Icon name="clock" size={13}/> SLA</span><b>{t.sla}</b></div><Avatar initials={t.owner} small/></div>)}</div></section>
      <aside className="ticket-inspector"><div className="ticket-inspector-head"><span>SUP-124</span><button><Icon name="more"/></button></div><h2>Error al generar reporte clínico</h2><div className="ticket-properties"><div><span>Cliente</span><b>Reset Bariatric</b></div><div><span>Proyecto</span><b>Medisoft</b></div><div><span>Prioridad</span><Status tone="red">Urgente</Status></div><div><span>Asignado</span><span className="owner-cell"><Avatar initials="JM" small/> Jonatan</span></div></div><div className="sla-card"><div><Icon name="clock"/><span><b>1h 42m</b><small>para incumplir SLA</small></span></div><div className="sla-track"><i style={{width:"72%"}}/></div></div><div className="conversation"><div className="message client-msg"><div className="msg-head"><Avatar initials="RB" small color="cyan"/><span><b>María · Reset</b><small>20:58</small></span></div><p>Al intentar generar el reporte clínico del paciente, se queda cargando y luego muestra error.</p></div><div className="message internal-msg"><span>NOTA INTERNA</span><p>Revisar worker de generación de PDF. Posible timeout en producción.</p></div></div><div className="reply-box"><textarea placeholder="Responder al cliente..."/><div><span>Tiempo: <b>00:18</b> · Facturable</span><button className="primary-btn">Enviar respuesta</button></div></div></aside>
    </div>
  </>;
}

function Renewals() {
  return <><PageHeader eyebrow="ASSET & SERVICE INTELLIGENCE" title="Servicios & activos" description="Dominios, servidores, cloud, licencias, SSL y contratos vinculados a cada cliente." action="Nuevo activo"/>
    <div className="watch-banner"><div className="watch-icon"><Icon name="server"/></div><div><span>RENEWAL WATCH</span><b>3 renovaciones requieren atención en los próximos 35 días</b><p>Impacto estimado si no se atienden: 2 servicios de producción.</p></div><button className="secondary-btn">Crear tareas</button></div>
    <section className="panel table-panel"><div className="table-toolbar"><div className="tab-pills"><button className="active">Todos <span>42</span></button><button>Dominios <span>11</span></button><button>Cloud <span>9</span></button><button>SSL <span>14</span></button><button>Licencias <span>8</span></button></div></div><div className="data-table renewal-table"><div className="table-row table-head"><span>Activo / Servicio</span><span>Cliente</span><span>Tipo</span><span>Renueva</span><span>Costo</span><span>Responsable</span><span>Estado</span></div>{renewals.map((r,i)=><div className="table-row" key={r.asset}><span className="asset-cell"><span className="asset-icon"><Icon name={r.type==="Dominio"?"external":"server"} size={15}/></span><b>{r.asset}</b></span><span>{r.client}</span><span>{r.type}</span><span><b>{r.date}</b><small>{r.days} días</small></span><span>{r.cost}</span><span>{r.owner}</span><span><Status tone={i===0?"red":i===1?"amber":"green"}>{i===0?"Urgente":i===1?"Próximo":"Saludable"}</Status></span></div>)}</div></section>
    <div className="two-col asset-insights"><section className="panel"><div className="panel-head"><div><span className="panel-kicker">COST INTELLIGENCE</span><h2>Infraestructura administrada</h2></div></div><div className="cost-breakdown"><div className="cost-total"><span>Costo mensual</span><b>US$2,184</b><small>Across 9 clients</small></div><div className="cost-bars"><span><b>Cloud servers</b><i><em style={{width:"72%"}}/></i><strong>US$1,420</strong></span><span><b>Managed services</b><i><em style={{width:"38%"}}/></i><strong>US$486</strong></span><span><b>Domains & SaaS</b><i><em style={{width:"24%"}}/></i><strong>US$278</strong></span></div></div></section><section className="panel"><div className="panel-head"><div><span className="panel-kicker">RISK</span><h2>Dependencias críticas</h2></div></div><div className="dependency-list"><div><span className="risk-dot red"/><div><b>medisoft.app</b><small>Producción · 1 proyecto dependiente</small></div><span>13 días</span></div><div><span className="risk-dot amber"/><div><b>Azure Portal Proveedores</b><small>Producción · renovación mensual</small></div><span>26 días</span></div><div><span className="risk-dot green"/><div><b>Nodefleet EU cluster</b><small>6 servicios dependientes</small></div><span>57 días</span></div></div></section></div>
  </>;
}

function Communications() {
  return <><PageHeader eyebrow="OMNICHANNEL" title="Comunicaciones" description="Email, WhatsApp y notificaciones in-app vinculadas directamente al historial del cliente." action="Nuevo mensaje"/>
    <div className="comm-layout"><section className="panel inbox"><div className="inbox-head"><h2>Bandeja unificada</h2><div className="channel-tabs"><button className="active">Todos</button><button><Icon name="mail" size={14}/> Email</button><button><Icon name="phone" size={14}/> WhatsApp</button></div></div>{[
      ["RB","Reset Bariatric","Gracias, confirmamos el pago de la factura...","22 min","mail","blue"],
      ["AD","Adsemble","¿Podemos coordinar la primera factura del piloto?","48 min","phone","cyan"],
      ["NF","NodeFleet","Supplier performance looks significantly better...","2 h","mail","purple"],
      ["MC","MCSD Advertising","Recibido. Revisaremos la renovación del SSL.","4 h","mail","amber"],
    ].map((m,i)=><div className={`inbox-item ${i===0?"unread":""}`} key={m[1]}><Avatar initials={m[0]} color={m[5]} small/><div><div><b>{m[1]}</b><span>{m[3]}</span></div><p>{m[2]}</p></div><span className="channel-icon"><Icon name={m[4] as IconName} size={13}/></span></div>)}</section><aside className="panel communication-stats"><span className="panel-kicker">DELIVERY</span><h2>Salud de comunicación</h2><div className="comm-score"><div className="ring small-ring"><span>98<small>%</small></span></div><div><b>Excelente entrega</b><span>Últimos 30 días</span></div></div><div className="delivery-row"><span>Email</span><div><i style={{width:"99.2%"}}/></div><b>99.2%</b></div><div className="delivery-row"><span>WhatsApp</span><div><i style={{width:"97.4%"}}/></div><b>97.4%</b></div><div className="delivery-row"><span>Portal</span><div><i style={{width:"100%"}}/></div><b>100%</b></div><div className="comm-foot"><Icon name="spark" size={16}/><span>12 mensajes automáticos evitaron seguimiento manual esta semana.</span></div></aside></div>
  </>;
}

function Automations() {
  const rules = [
    ["Cobro preventivo","Factura vence en 3 días","Email + WhatsApp al contacto financiero","124 ejecuciones","green"],
    ["SLA escalation","Ticket consume 80% del SLA","Alerta responsable + prioridad alta","18 ejecuciones","green"],
    ["Renewal watch","Activo vence en ≤ 30 días","Crear tarea + notificar owner","9 ejecuciones","green"],
    ["Client health risk","Health score cae por debajo de 75","Crear seguimiento comercial","3 ejecuciones","amber"],
  ];
  return <><PageHeader eyebrow="WORKFLOW ENGINE" title="Automatizaciones" description="Convierte eventos del negocio en acciones sin depender de seguimiento manual." action="Nueva automatización"/>
    <div className="automation-hero"><div className="ai-orb large"><Icon name="bolt"/></div><div><span>ESTE MES</span><b>154 tareas automatizadas</b><p>~12.8 horas de trabajo manual ahorradas</p></div><div className="automation-impact"><span><b>RD$40.3k</b> recuperados por recordatorios</span><span><b>0</b> SLA incumplidos por escalación</span></div></div>
    <section className="panel automation-list"><div className="automation-row automation-head"><span>Automatización</span><span>Disparador</span><span>Acciones</span><span>Actividad</span><span>Estado</span><span/></div>{rules.map(r=><div className="automation-row" key={r[0]}><span className="automation-name"><i><Icon name="bolt" size={14}/></i><b>{r[0]}</b></span><span>{r[1]}</span><span>{r[2]}</span><span>{r[3]}</span><span><Status tone={r[4] as "green"|"amber"}>{r[4]==="green"?"Activa":"Revisar"}</Status></span><span><Icon name="more" size={16}/></span></div>)}</section>
    <div className="automation-builder-preview"><span className="panel-kicker">BUILDER</span><h2>Diseñado para flujos visuales</h2><p>Cuando conectemos backend, cada regla se podrá componer con triggers, condiciones, delays, aprobaciones y acciones.</p><div className="flow-preview"><div className="flow-node trigger"><span>CUANDO</span><b>Factura vencida</b></div><i>→</i><div className="flow-node condition"><span>SI</span><b>Balance &gt; RD$10k</b></div><i>→</i><div className="flow-node action"><span>HACER</span><b>WhatsApp + tarea</b></div></div></div>
  </>;
}

function Reports() {
  return <><PageHeader eyebrow="BUSINESS INTELLIGENCE" title="Reportes" description="Ventas, delivery, rentabilidad, cobranza, soporte y retención sin exportar a otra herramienta." action="Crear reporte"/>
    <div className="report-grid"><div className="report-card"><div className="report-icon"><Icon name="trend"/></div><span>Ingresos</span><b>Revenue overview</b><p>Facturado, cobrado, MRR, ARR y forecast.</p><small>Actualizado hace 4 min</small></div><div className="report-card"><div className="report-icon"><Icon name="folder"/></div><span>Delivery</span><b>Rentabilidad por proyecto</b><p>Horas, costo, valor, margen y desviación.</p><small>Actualizado hoy</small></div><div className="report-card"><div className="report-icon"><Icon name="heart"/></div><span>Customer success</span><b>Client health & retention</b><p>Satisfacción, pagos, soporte y riesgo.</p><small>Actualizado hace 1 h</small></div><div className="report-card"><div className="report-icon"><Icon name="life"/></div><span>Support</span><b>SLA & service quality</b><p>Respuesta, resolución, carga y CSAT.</p><small>Tiempo real</small></div></div>
    <div className="insight-card"><div className="insight-copy"><span className="panel-kicker">JFMCSS PULSE · INSIGHT</span><h2>Los clientes con servicios recurrentes tienen 2.4× mayor valor anual.</h2><p>El 68% del margen de los últimos 90 días proviene de clientes que combinan proyecto + soporte o infraestructura administrada. Conviene ofrecer mantenimiento al cerrar proyectos nuevos.</p><button className="primary-btn">Ver análisis completo <Icon name="arrow" size={15}/></button></div><div className="insight-visual"><div className="value-bars"><div><span>Proyecto único</span><i style={{height:"35%"}}/><b>1.0×</b></div><div><span>+ Soporte</span><i style={{height:"64%"}}/><b>1.8×</b></div><div><span>+ Infra</span><i style={{height:"88%"}}/><b>2.4×</b></div></div></div></div>
  </>;
}

function SettingsPage() {
  return <><PageHeader eyebrow="ADMINISTRACIÓN" title="Configuración" description="Empresa, usuarios, fiscalidad, comunicaciones, seguridad e integraciones."/>
    <div className="settings-layout"><aside className="settings-nav"><button className="active"><Icon name="building"/>Empresa</button><button><Icon name="users"/>Usuarios & roles</button><button><Icon name="receipt"/>Fiscal & NCF</button><button><Icon name="mail"/>Comunicaciones</button><button><Icon name="life"/>SLA & soporte</button><button><Icon name="bolt"/>Integraciones</button><button><Icon name="shield"/>Seguridad & auditoría</button></aside><section className="panel settings-panel"><div className="settings-section-head"><div><h2>Perfil de JFMCSS</h2><p>Información utilizada en documentos, facturas y portal del cliente.</p></div><Status tone="green">Configurado</Status></div><div className="brand-settings"><div className="brand-preview"><div className="mini-logo big">J</div><div><b>JFMCSS</b><span>Software · Cloud · Automation</span></div><button>Cambiar logo</button></div><div className="form-grid"><label><span>Nombre comercial</span><input defaultValue="JFMCSS"/></label><label><span>Razón social</span><input defaultValue="JM Services"/></label><label><span>RNC / Cédula</span><input defaultValue="***-*******-*"/></label><label><span>Email fiscal</span><input defaultValue="billing@jfmcss.com"/></label><label className="full"><span>Dirección</span><input defaultValue="Santo Domingo, República Dominicana"/></label></div></div><div className="settings-divider"/><div className="settings-section-head"><div><h2>Preferencias de plataforma</h2><p>Valores predeterminados del workspace.</p></div></div><div className="form-grid"><label><span>Moneda base</span><select defaultValue="DOP"><option value="DOP">DOP · Peso dominicano</option><option>USD · US Dollar</option></select></label><label><span>Zona horaria</span><select defaultValue="SD"><option value="SD">America/Santo_Domingo</option></select></label><label><span>Idioma</span><select><option>Español</option><option>English</option></select></label><label><span>Formato de fecha</span><select><option>DD/MM/YYYY</option></select></label></div><div className="settings-actions"><button className="secondary-btn">Descartar</button><button className="primary-btn">Guardar cambios</button></div></section></div>
  </>;
}

function GlobalNotifications({ onClose }: { onClose: () => void }) {
  return <div className="notification-popover"><div className="notif-head"><div><b>Notificaciones</b><span>4 nuevas</span></div><button onClick={onClose}>×</button></div><div className="notif-list"><div className="notif unread"><i className="notif-dot red"/><div><b>SLA en riesgo</b><p>SUP-124 vence en 1h 42m.</p><span>Hace 2 min</span></div></div><div className="notif unread"><i className="notif-dot amber"/><div><b>Factura vencida</b><p>Liquid Digital · RD$28,320.</p><span>Hace 16 min</span></div></div><div className="notif unread"><i className="notif-dot cyan"/><div><b>Pago recibido</b><p>Reset Bariatric · RD$90,000.</p><span>Hace 22 min</span></div></div><div className="notif unread"><i className="notif-dot purple"/><div><b>Nuevo mensaje</b><p>NodeFleet respondió por email.</p><span>Hace 1 h</span></div></div></div><button className="notif-all">Ver centro de notificaciones</button></div>;
}

function CommandPalette({ onClose, navigate }: { onClose: () => void; navigate: (m: ModuleKey)=>void }) {
  const opts: { icon: IconName; title: string; meta: string; go: ModuleKey }[] = [
    {icon:"users", title:"Reset Bariatric Surgery", meta:"Cliente · Health 96", go:"clients"},
    {icon:"file", title:"FAC-2026-0128", meta:"Factura · Adsemble SRL", go:"billing"},
    {icon:"life", title:"SUP-124", meta:"Ticket urgente · Medisoft", go:"support"},
    {icon:"folder", title:"Portal de Proveedores", meta:"Proyecto · 96%", go:"projects"},
  ];
  return <div className="command-backdrop" onMouseDown={onClose}><div className="command" onMouseDown={e=>e.stopPropagation()}><div className="command-input"><Icon name="search"/><input autoFocus placeholder="Buscar clientes, facturas, tickets, proyectos..."/><kbd>ESC</kbd></div><div className="command-label">SUGERENCIAS</div>{opts.map(o=><button key={o.title} onClick={()=>{navigate(o.go);onClose();}}><span className="command-icon"><Icon name={o.icon}/></span><span><b>{o.title}</b><small>{o.meta}</small></span><Icon name="arrow" size={15}/></button>)}<div className="command-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>↵</kbd> abrir</span><span><b>JFMCSS</b> universal search</span></div></div></div>;
}

export default function AdminApp() {
  const [active, setActive] = useState<ModuleKey>("dashboard");
  const [clientDrawer, setClientDrawer] = useState<string | null>(null);
  const [invoicePreview, setInvoicePreview] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const activeLabel = useMemo(()=>navGroups.flatMap(g=>g.items).find(i=>i.key===active)?.label ?? "Centro de control", [active]);
  const navigate = (m: ModuleKey) => { setActive(m); setMobileNav(false); };

  let content: React.ReactNode;
  switch(active) {
    case "clients": content=<Clients onSelect={setClientDrawer}/>; break;
    case "sales": content=<Sales/>; break;
    case "projects": content=<Projects/>; break;
    case "billing": content=<Billing onPreview={()=>setInvoicePreview(true)}/>; break;
    case "payments": content=<Payments/>; break;
    case "support": content=<Support/>; break;
    case "renewals": content=<Renewals/>; break;
    case "notifications": content=<Communications/>; break;
    case "automations": content=<Automations/>; break;
    case "reports": content=<Reports/>; break;
    case "settings": content=<SettingsPage/>; break;
    default: content=<Dashboard navigate={navigate}/>;
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?"open":""}`}>
      <div className="sidebar-brand"><div className="logo-mark">J</div><div><strong>JFMCSS</strong><span>CONTROL</span></div><button className="mobile-close" onClick={()=>setMobileNav(false)}>×</button></div>
      <nav>{navGroups.map(group=><div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.items.map(item=><button key={item.key} className={active===item.key?"active":""} onClick={()=>navigate(item.key)}><span className="nav-icon"><Icon name={item.icon}/></span><span>{item.label}</span>{item.badge&&<em>{item.badge}</em>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><button className={active==="settings"?"active":""} onClick={()=>navigate("settings")}><span className="nav-icon"><Icon name="settings"/></span><span>Configuración</span></button><div className="workspace"><Avatar initials="JM" small/><div><b>Jonatan Maria</b><span>Super Admin</span></div><Icon name="more" size={16}/></div></div>
    </aside>

    <main className="main-shell">
      <header className="topbar"><div className="topbar-left"><button className="hamburger" onClick={()=>setMobileNav(true)}>☰</button><span className="breadcrumb">JFMCSS <b>/</b> {activeLabel}</span></div><div className="topbar-right"><button className="global-search" onClick={()=>setCommandOpen(true)}><Icon name="search" size={16}/><span>Buscar en JFMCSS...</span><kbd>⌘ K</kbd></button><button className="top-icon" onClick={()=>setNotificationsOpen(v=>!v)}><Icon name="bell"/><i>4</i></button><div className="top-separator"/><button className="profile-btn"><Avatar initials="JM" small/><span><b>Jonatan</b><small>Administrador</small></span><span className="down">⌄</span></button></div>{notificationsOpen&&<GlobalNotifications onClose={()=>setNotificationsOpen(false)}/>}</header>
      <div className="content">{content}</div>
      <footer><span>JFMCSS Control · Preview UI</span><span><i/> Todos los sistemas operativos</span><span>v0.1.0</span></footer>
    </main>
    {clientDrawer&&<ClientDrawer client={clientDrawer} onClose={()=>setClientDrawer(null)}/>} 
    {invoicePreview&&<InvoicePreview onClose={()=>setInvoicePreview(false)}/>} 
    {commandOpen&&<CommandPalette onClose={()=>setCommandOpen(false)} navigate={navigate}/>} 
  </div>;
}
