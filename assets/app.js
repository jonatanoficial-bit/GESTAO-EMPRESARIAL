// Gestão MPE — v0.5 (Etapa 5)
// Relatório anual + tendência mensal + importação CSV + insights (regras)
// Offline-first | Mobile-first | Incremental | Sem suposições arriscadas

const LS_KEY = "gmpe_v05_state";
const APP_VERSION = "0.5";
const SCHEMA_VERSION = 5;

/* =========================
   UTILIDADES
========================= */
function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function nowISODate(){
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0,10);
}

function monthKey(dateStr){
  return (dateStr || "").slice(0,7);
}

function yearKey(dateStr){
  return (dateStr || "").slice(0,4);
}

function moneyFmt(value, currency="BRL"){
  try{
    return new Intl.NumberFormat("pt-BR", { style:"currency", currency }).format(value);
  }catch{
    return `R$ ${Number(value||0).toFixed(2)}`;
  }
}

function deepClone(obj){
  return JSON.parse(JSON.stringify(obj));
}

function safeNumber(n){
  const v = Number(n);
  return isFinite(v) ? v : 0;
}

function downloadText(filename, text, mime="text/plain;charset=utf-8"){
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* =========================
   VALIDAÇÃO DEFENSIVA
========================= */
function isValidState(obj){
  if(!obj || typeof obj !== "object") return false;

  if(!obj.cfg || typeof obj.cfg !== "object") return false;
  if(typeof obj.cfg.company !== "string") return false;
  if(typeof obj.cfg.currency !== "string") return false;
  if(typeof obj.cfg.theme !== "string") return false;

  if(!Array.isArray(obj.accounts) || obj.accounts.length < 1) return false;
  if(!Array.isArray(obj.costCenters) || obj.costCenters.length < 1) return false;
  if(!Array.isArray(obj.tx)) return false;

  for(const a of obj.accounts){
    if(!a || typeof a !== "object") return false;
    if(typeof a.id !== "string") return false;
    if(typeof a.name !== "string" || !a.name.trim()) return false;
    if(typeof a.initialBalance !== "number" || !isFinite(a.initialBalance)) return false;
  }

  for(const c of obj.costCenters){
    if(!c || typeof c !== "object") return false;
    if(typeof c.id !== "string") return false;
    if(typeof c.name !== "string" || !c.name.trim()) return false;
  }

  for(const t of obj.tx){
    if(!t || typeof t !== "object") return false;
    if(typeof t.id !== "string") return false;
    if(t.type !== "income" && t.type !== "expense") return false;
    if(typeof t.date !== "string") return false;
    if(typeof t.amount !== "number" || !isFinite(t.amount) || t.amount < 0) return false;
    if(typeof t.accountId !== "string") return false;
    if(typeof t.costCenterId !== "string") return false;
    if(typeof t.category !== "string") return false;
    if(typeof t.note !== "string") return false;
  }

  return true;
}

/* =========================
   STATE
========================= */
function defaultState(){
  const accId = uid();
  const costId = uid();
  return {
    meta: { app:"Gestão MPE", appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION },
    cfg: { company:"", currency:"BRL", theme:"dark" },
    accounts: [
      { id: accId, name:"Caixa", initialBalance: 0 }
    ],
    costCenters: [
      { id: costId, name:"Operacional" }
    ],
    tx: []
  };
}

let state = loadState();

function loadState(){
  const raw = localStorage.getItem(LS_KEY);

  // Migração: se não houver gmpe_v05_state, tenta chaves anteriores
  if(!raw){
    const legacyKeys = ["gmpe_v04_state","gmpe_v03_state","gmpe_v02_state","gmpe_v01_state"];
    for(const k of legacyKeys){
      const r = localStorage.getItem(k);
      if(!r) continue;
      try{
        const legacy = JSON.parse(r);
        const migrated = migrateAnyToV05(legacy);
        if(isValidState(migrated)){
          localStorage.setItem(LS_KEY, JSON.stringify(migrated));
          return migrated;
        }
      }catch{}
    }
    return defaultState();
  }

  try{
    const parsed = JSON.parse(raw);
    if(!isValidState(parsed)){
      const migrated = migrateAnyToV05(parsed);
      if(isValidState(migrated)) return migrated;
      return defaultState();
    }
    return parsed;
  }catch{
    return defaultState();
  }
}

function migrateAnyToV05(any){
  const base = defaultState();

  const cfg = any?.cfg || {};
  base.cfg.company = String(cfg.company ?? "");
  base.cfg.currency = String(cfg.currency ?? "BRL");
  base.cfg.theme = String(cfg.theme ?? "dark");

  // accounts
  if(Array.isArray(any?.accounts) && any.accounts.length){
    base.accounts = any.accounts.map(a => ({
      id: String(a.id ?? uid()),
      name: String(a.name ?? "Conta"),
      initialBalance: safeNumber(a.initialBalance ?? 0)
    })).filter(a => a.name.trim());
    if(base.accounts.length === 0) base.accounts = defaultState().accounts;
  }

  // cost centers
  if(Array.isArray(any?.costCenters) && any.costCenters.length){
    base.costCenters = any.costCenters.map(c => ({
      id: String(c.id ?? uid()),
      name: String(c.name ?? "Centro")
    })).filter(c => c.name.trim());
    if(base.costCenters.length === 0) base.costCenters = defaultState().costCenters;
  }

  const acc0 = base.accounts[0].id;
  const cost0 = base.costCenters[0].id;

  // tx
  if(Array.isArray(any?.tx)){
    base.tx = any.tx.map(t => ({
      id: String(t.id ?? uid()),
      type: t.type === "expense" ? "expense" : "income",
      date: String(t.date ?? nowISODate()),
      amount: safeNumber(t.amount ?? 0),
      accountId: String(t.accountId ?? acc0),
      costCenterId: String(t.costCenterId ?? cost0),
      category: String(t.category ?? "Sem categoria"),
      note: String(t.note ?? "")
    }));
  }

  base.meta = { app:"Gestão MPE", appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION };
  return base;
}

function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

/* =========================
   TEMA + NAVEGAÇÃO
========================= */
function setTheme(theme){
  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
  state.cfg.theme = document.documentElement.dataset.theme;
  saveState();
  document.querySelector("#btnTheme .icon").textContent = state.cfg.theme === "light" ? "☾" : "☀︎";
}

function switchView(name){
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.querySelector(`#view-${name}`).classList.remove("hidden");
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === name));

  if(name === "relatorios"){
    renderReportsAndCharts();
    renderYearSection();
  }
}

/* =========================
   FILTROS (MÊS) + FILTROS (ANO)
========================= */
function currentMonth(){
  return monthKey(nowISODate());
}

function buildMonthOptions(){
  const months = new Set(state.tx.map(t => monthKey(t.date)));
  months.add(currentMonth());
  const arr = Array.from(months).filter(Boolean).sort().reverse();

  const sel = document.getElementById("filterMonth");
  sel.innerHTML = "";
  for(const m of arr){
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m.replace("-", "/");
    sel.appendChild(opt);
  }

  if(!sel.value) sel.value = currentMonth();
  if(!arr.includes(sel.value)) sel.value = currentMonth();
}

function buildAccountFilter(){
  const sel = document.getElementById("filterAccount");
  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "all";
  optAll.textContent = "Todas contas";
  sel.appendChild(optAll);

  for(const a of state.accounts){
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = a.name;
    sel.appendChild(opt);
  }

  if(!sel.value) sel.value = "all";
  const exists = sel.value === "all" || state.accounts.some(a => a.id === sel.value);
  if(!exists) sel.value = "all";
}

function buildCostCenterFilter(){
  const sel = document.getElementById("filterCostCenter");
  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "all";
  optAll.textContent = "Todos centros";
  sel.appendChild(optAll);

  for(const c of state.costCenters){
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  }

  if(!sel.value) sel.value = "all";
  const exists = sel.value === "all" || state.costCenters.some(c => c.id === sel.value);
  if(!exists) sel.value = "all";
}

function buildYearOptions(){
  const years = new Set(state.tx.map(t => yearKey(t.date)).filter(Boolean));
  years.add(yearKey(nowISODate()));
  const arr = Array.from(years).sort().reverse();

  const sel = document.getElementById("filterYear");
  sel.innerHTML = "";
  for(const y of arr){
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  }

  if(!sel.value) sel.value = yearKey(nowISODate());
  if(!arr.includes(sel.value)) sel.value = yearKey(nowISODate());
}

function getCurrentFilters(){
  const month = document.getElementById("filterMonth").value;
  const type = document.getElementById("filterType").value;
  const account = document.getElementById("filterAccount").value;
  const cost = document.getElementById("filterCostCenter").value;
  return { month, type, account, cost };
}

function filteredTx(){
  const { month, type, account, cost } = getCurrentFilters();
  let tx = state.tx.slice();
  tx = tx.filter(t => monthKey(t.date) === month);
  if(type !== "all") tx = tx.filter(t => t.type === type);
  if(account !== "all") tx = tx.filter(t => t.accountId === account);
  if(cost !== "all") tx = tx.filter(t => t.costCenterId === cost);
  tx.sort((a,b) => (b.date || "").localeCompare(a.date || ""));
  return tx;
}

/* =========================
   CÁLCULOS
========================= */
function totalsForMonth(month){
  const tx = state.tx.filter(t => monthKey(t.date) === month);
  const income = tx.filter(t => t.type === "income").reduce((s,t)=>s+t.amount,0);
  const expense = tx.filter(t => t.type === "expense").reduce((s,t)=>s+t.amount,0);
  return { income, expense, net: income - expense };
}

function balanceOverall(){
  let total = state.accounts.reduce((s,a)=> s + (a.initialBalance || 0), 0);
  for(const t of state.tx){
    total += (t.type === "income") ? t.amount : -t.amount;
  }
  return total;
}

function accountBalance(accountId){
  const acc = state.accounts.find(a => a.id === accountId);
  let total = acc ? (acc.initialBalance || 0) : 0;
  for(const t of state.tx.filter(t => t.accountId === accountId)){
    total += (t.type === "income") ? t.amount : -t.amount;
  }
  return total;
}

function renderKpis(){
  const currency = state.cfg.currency;
  const { month } = getCurrentFilters();
  const { income, expense } = totalsForMonth(month);

  document.getElementById("kpiBalance").textContent = moneyFmt(balanceOverall(), currency);
  document.getElementById("kpiIncome").textContent = moneyFmt(income, currency);
  document.getElementById("kpiExpense").textContent = moneyFmt(expense, currency);
}

/* =========================
   SELECTS (FORM)
========================= */
function renderAccountSelect(){
  const sel = document.getElementById("txAccount");
  sel.innerHTML = "";
  for(const a of state.accounts){
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = a.name;
    sel.appendChild(opt);
  }
}

function renderCostCenterSelect(){
  const sel = document.getElementById("txCostCenter");
  sel.innerHTML = "";
  for(const c of state.costCenters){
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  }
}

/* =========================
   CONTAS/PAINEL
========================= */
function renderAccountsPanel(){
  const box = document.getElementById("accountsPanel");
  box.innerHTML = "";

  for(const a of state.accounts){
    const div = document.createElement("div");
    div.className = "panel";
    div.innerHTML = `
      <h3>${a.name}</h3>
      <div class="mini">Saldo: ${moneyFmt(accountBalance(a.id), state.cfg.currency)}</div>
      <div class="actions" style="margin-top:10px">
        <button class="btn" data-action="edit" data-id="${a.id}">Editar</button>
        <button class="btn danger" data-action="delete" data-id="${a.id}">Excluir</button>
      </div>
    `;
    box.appendChild(div);
  }

  box.querySelectorAll("button").forEach(btn => {
    const id = btn.dataset.id;
    const act = btn.dataset.action;
    btn.addEventListener("click", () => {
      if(act === "edit") editAccount(id);
      if(act === "delete") deleteAccount(id);
    });
  });
}

function addAccount(){
  const name = (prompt("Nome da conta (ex: Banco PJ, Caixa, Cartão):") || "").trim();
  if(!name) return;

  const initialRaw = prompt("Saldo inicial (use ponto para decimais). Ex: 1500.50", "0");
  const initialBalance = Number(initialRaw);
  if(!isFinite(initialBalance)){
    alert("Saldo inicial inválido.");
    return;
  }

  state.accounts.push({ id: uid(), name, initialBalance });
  saveState();
  renderAll();
}

function editAccount(id){
  const acc = state.accounts.find(a => a.id === id);
  if(!acc) return;

  const name = (prompt("Editar nome da conta:", acc.name) || "").trim();
  if(!name) return;

  const initialRaw = prompt("Editar saldo inicial:", String(acc.initialBalance ?? 0));
  const initialBalance = Number(initialRaw);
  if(!isFinite(initialBalance)){
    alert("Saldo inicial inválido.");
    return;
  }

  acc.name = name;
  acc.initialBalance = initialBalance;
  saveState();
  renderAll();
}

function deleteAccount(id){
  if(state.accounts.length <= 1){
    alert("Você precisa ter pelo menos 1 conta.");
    return;
  }

  const used = state.tx.some(t => t.accountId === id);
  if(used){
    alert("Não é possível excluir: existe lançamento vinculado a esta conta.");
    return;
  }

  if(!confirm("Excluir esta conta?")) return;
  state.accounts = state.accounts.filter(a => a.id !== id);
  saveState();
  renderAll();
}

function addCostCenter(){
  const name = (prompt("Nome do centro de custo (ex: Operacional, Marketing, Administrativo):") || "").trim();
  if(!name) return;

  state.costCenters.push({ id: uid(), name });
  saveState();
  renderAll();
}

/* =========================
   TABELA (LANÇAMENTOS)
========================= */
function renderTable(){
  const tbody = document.getElementById("txTable");
  tbody.innerHTML = "";

  const accById = new Map(state.accounts.map(a => [a.id, a.name]));
  const costById = new Map(state.costCenters.map(c => [c.id, c.name]));
  const tx = filteredTx();

  if(tx.length === 0){
    document.getElementById("txHint").textContent = "Sem lançamentos para este filtro.";
    return;
  }
  document.getElementById("txHint").textContent = `${tx.length} lançamento(s) exibidos.`;

  for(const t of tx){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.date || ""}</td>
      <td>${t.type === "income" ? "Entrada" : "Saída"}</td>
      <td>${accById.get(t.accountId) || "—"}</td>
      <td>${costById.get(t.costCenterId) || "—"}</td>
      <td>${t.category || ""}</td>
      <td class="right">${moneyFmt(t.amount, state.cfg.currency)}</td>
      <td class="right"><button class="btn danger" data-id="${t.id}">Excluir</button></td>
    `;
    tr.querySelector("button").addEventListener("click", () => deleteTx(t.id));
    tbody.appendChild(tr);
  }
}

function deleteTx(id){
  if(!confirm("Excluir este lançamento?")) return;
  state.tx = state.tx.filter(t => t.id !== id);
  saveState();
  renderAll();
}

/* =========================
   RELATÓRIOS (MÊS)
========================= */
function reportMonthSummary(month){
  const currency = state.cfg.currency;
  const tx = state.tx.filter(t => monthKey(t.date) === month);
  const income = tx.filter(t => t.type === "income").reduce((s,t)=>s+t.amount,0);
  const expense = tx.filter(t => t.type === "expense").reduce((s,t)=>s+t.amount,0);
  const net = income - expense;

  return [
    `Mês: ${month.replace("-", "/")}`,
    `Entradas:  ${moneyFmt(income, currency)}`,
    `Saídas:    ${moneyFmt(expense, currency)}`,
    `Resultado: ${moneyFmt(net, currency)}`
  ].join("\n");
}

function reportSignedByKey(tx, keyGetter){
  const currency = state.cfg.currency;
  const m = new Map();
  for(const t of tx){
    const k = keyGetter(t);
    const signed = t.type === "income" ? t.amount : -t.amount;
    m.set(k, (m.get(k) || 0) + signed);
  }
  const arr = Array.from(m.entries()).sort((a,b)=> Math.abs(b[1]) - Math.abs(a[1]));
  if(arr.length === 0) return "Sem dados.";
  return arr.map(([k,v]) => `${k}: ${moneyFmt(v, currency)}`).join("\n");
}

function reportTopExpenses(txMonth){
  const currency = state.cfg.currency;
  const exp = txMonth.filter(t => t.type === "expense").slice().sort((a,b)=> b.amount - a.amount).slice(0,5);
  if(exp.length === 0) return "Sem dados.";

  const accById = new Map(state.accounts.map(a => [a.id, a.name]));
  const costById = new Map(state.costCenters.map(c => [c.id, c.name]));

  return exp.map(t => {
    const acc = accById.get(t.accountId) || "—";
    const cost = costById.get(t.costCenterId) || "—";
    return `${t.date} • ${t.category} • ${acc}/${cost} • ${moneyFmt(t.amount, currency)}`;
  }).join("\n");
}

function renderReports(){
  const { month } = getCurrentFilters();
  const txMonth = state.tx.filter(t => monthKey(t.date) === month);

  const accById = new Map(state.accounts.map(a => [a.id, a.name]));
  const costById = new Map(state.costCenters.map(c => [c.id, c.name]));

  document.getElementById("reportMonthSummary").textContent = reportMonthSummary(month);
  document.getElementById("reportTopExpenses").textContent = reportTopExpenses(txMonth);

  document.getElementById("reportByCategory").textContent = reportSignedByKey(txMonth, (t)=> t.category || "Sem categoria");
  document.getElementById("reportByAccount").textContent = reportSignedByKey(txMonth, (t)=> accById.get(t.accountId) || "—");
  document.getElementById("reportByCostCenter").textContent = reportSignedByKey(txMonth, (t)=> costById.get(t.costCenterId) || "—");
}

/* =========================
   GRÁFICOS (MÊS) + GRÁFICO (ANO)
========================= */
function clearCanvas(ctx, w, h){
  ctx.clearRect(0,0,w,h);
}

function drawPieChart(canvas, data){
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  clearCanvas(ctx, w, h);

  const total = data.reduce((s,d)=>s+d.value,0);
  if(total <= 0){
    ctx.font = "14px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("Sem dados.", 10, 24);
    return;
  }

  const cx = w/2, cy = h/2;
  const r = Math.min(w,h) * 0.35;

  let start = -Math.PI/2;
  for(let i=0;i<data.length;i++){
    const slice = (data[i].value/total) * Math.PI*2;
    const end = start + slice;
    const hue = (i * 47) % 360;
    ctx.fillStyle = `hsl(${hue} 70% 55%)`;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fill();

    start = end;
  }

  ctx.fillStyle = "rgba(0,0,0,0.20)";
  ctx.beginPath();
  ctx.arc(cx, cy, r*0.55, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "bold 14px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Saídas", cx, cy-4);
  ctx.font = "12px system-ui";
  ctx.fillText(moneyFmt(total, state.cfg.currency), cx, cy+14);
}

function drawBarChart(canvas, labels, values){
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  clearCanvas(ctx, w, h);

  if(values.length === 0){
    ctx.font = "14px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("Sem dados.", 10, 24);
    return;
  }

  const maxAbs = Math.max(...values.map(v => Math.abs(v)), 1);
  const padding = 36;
  const chartW = w - padding*2;
  const chartH = h - padding*2;
  const baseY = padding + chartH/2;

  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.moveTo(padding, baseY);
  ctx.lineTo(padding + chartW, baseY);
  ctx.stroke();

  const slot = chartW / values.length;
  const barW = slot * 0.65;

  for(let i=0;i<values.length;i++){
    const v = values[i];
    const x = padding + i*slot + (slot-barW)/2;
    const barH = (Math.abs(v)/maxAbs) * (chartH*0.45);

    const y = v >= 0 ? baseY - barH : baseY;
    ctx.fillStyle = v >= 0 ? "rgba(74,163,255,0.85)" : "rgba(255,91,91,0.85)";
    ctx.fillRect(x, y, barW, barH);

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(labels[i].slice(0,10), x + barW/2, h - 14);
  }
}

function drawLineChart(canvas, points){
  // points: [{xLabel, y}]
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  clearCanvas(ctx, w, h);

  if(!points.length){
    ctx.font = "14px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("Sem dados.", 10, 24);
    return;
  }

  const padding = 38;
  const chartW = w - padding*2;
  const chartH = h - padding*2;

  const ys = points.map(p => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxY - minY, 1);

  // grid (3 linhas)
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  for(let i=0;i<=3;i++){
    const y = padding + (chartH * i/3);
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(padding + chartW, y);
    ctx.stroke();
  }

  // path
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(74,163,255,0.95)";
  ctx.beginPath();

  points.forEach((p, i) => {
    const x = padding + chartW * (points.length === 1 ? 0.5 : i/(points.length-1));
    const y = padding + chartH * (1 - (p.y - minY)/span);
    if(i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  // pontos + labels
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "11px system-ui";
  ctx.textAlign = "center";

  points.forEach((p, i) => {
    const x = padding + chartW * (points.length === 1 ? 0.5 : i/(points.length-1));
    const y = padding + chartH * (1 - (p.y - minY)/span);

    ctx.fillStyle = "rgba(74,163,255,1)";
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.fillText(p.xLabel, x, h - 14);
  });

  // texto min/max
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText(moneyFmt(maxY, state.cfg.currency), padding, padding - 10);
  ctx.textAlign = "left";
  ctx.fillText(moneyFmt(minY, state.cfg.currency), padding, padding + chartH + 22);
}

function renderCharts(){
  const { month } = getCurrentFilters();
  const txMonth = state.tx.filter(t => monthKey(t.date) === month);

  // Pizza: saídas por categoria (top 8)
  const byCat = new Map();
  for(const t of txMonth){
    if(t.type !== "expense") continue;
    const k = t.category || "Sem categoria";
    byCat.set(k, (byCat.get(k) || 0) + t.amount);
  }
  const catArr = Array.from(byCat.entries())
    .sort((a,b)=> b[1]-a[1])
    .slice(0,8)
    .map(([label,value]) => ({ label, value }));

  const canvasPie = document.getElementById("chartPie");
  if(canvasPie) drawPieChart(canvasPie, catArr);

  const legend = document.getElementById("chartPieLegend");
  if(legend){
    if(catArr.length === 0){
      legend.textContent = "Sem dados de saídas para o mês.";
    }else{
      legend.textContent = catArr.map((d,i)=> {
        const hue = (i * 47) % 360;
        return `■ ${d.label}: ${moneyFmt(d.value, state.cfg.currency)} (hsl(${hue}))`;
      }).join(" | ");
    }
  }

  // Barras: saldo por conta
  const labels = state.accounts.map(a => a.name);
  const values = state.accounts.map(a => accountBalance(a.id));
  const canvasBars = document.getElementById("chartBars");
  if(canvasBars) drawBarChart(canvasBars, labels, values);
}

function renderReportsAndCharts(){
  renderReports();
  renderCharts();
}

/* =========================
   PROJEÇÕES (MVP - MÊS)
========================= */
function renderProjections(){
  const currency = state.cfg.currency;
  const { month } = getCurrentFilters();
  const tx = state.tx.filter(t => monthKey(t.date) === month);

  const expenses = tx.filter(t => t.type === "expense").map(t => t.amount);
  const avgExpense = expenses.length ? expenses.reduce((s,v)=>s+v,0) / expenses.length : 0;

  const reserve1 = avgExpense * 1;
  const reserve3 = avgExpense * 3;

  document.getElementById("projReserve").textContent =
    `1 mês: ${moneyFmt(reserve1, currency)}\n3 meses: ${moneyFmt(reserve3, currency)}`;

  document.getElementById("projTarget").textContent =
    `Meta (30 dias): ${moneyFmt(avgExpense, currency)}`;

  const tips = [];
  const bal = balanceOverall();

  if(avgExpense > 0 && bal < avgExpense){
    tips.push("Saldo geral abaixo da meta de 30 dias de saídas. Reduza custos ou aumente receita.");
  }else if(avgExpense > 0){
    tips.push("Saldo geral ok para 30 dias. Próximo passo: construir reserva de 1–3 meses.");
  }else{
    tips.push("Cadastre algumas saídas para gerar projeções mais úteis.");
  }

  const income = tx.filter(t => t.type === "income").reduce((s,t)=>s+t.amount,0);
  const expense = tx.filter(t => t.type === "expense").reduce((s,t)=>s+t.amount,0);

  if(income > 0 && expense > income){
    tips.push("No mês selecionado, as saídas superaram as entradas. Verifique categorias e centros de maior impacto.");
  }
  if(tx.length < 5){
    tips.push("Mais lançamentos = relatórios e insights melhores. Tente registrar diariamente por 1 semana.");
  }

  const ul = document.getElementById("projTips");
  ul.innerHTML = "";
  for(const tip of tips){
    const li = document.createElement("li");
    li.textContent = tip;
    ul.appendChild(li);
  }
}

/* =========================
   CONFIG + BACKUP + IMPORT CSV
========================= */
function renderConfig(){
  document.getElementById("cfgCompany").value = state.cfg.company || "";
  document.getElementById("cfgCurrency").value = state.cfg.currency || "BRL";
}

function saveConfig(){
  state.cfg.company = (document.getElementById("cfgCompany").value || "").trim();
  state.cfg.currency = document.getElementById("cfgCurrency").value || "BRL";
  saveState();
  renderAll();
  alert("Configurações salvas.");
}

function exportJson(){
  const payload = {
    meta: { app:"Gestão MPE", appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString() },
    state: deepClone(state)
  };
  const filename = `gestao-mpe-backup-${new Date().toISOString().slice(0,10)}.json`;
  downloadText(filename, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  const hint = document.getElementById("backupHint");
  if(hint) hint.textContent = `Backup gerado: ${filename}`;
}

async function importJsonFile(file){
  const hint = document.getElementById("backupHint");
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    const candidate = data?.state ?? data;

    if(!isValidState(candidate)){
      const migrated = migrateAnyToV05(candidate);
      if(!isValidState(migrated)) throw new Error("JSON inválido ou incompatível.");
      state = migrated;
    }else{
      state = candidate;
    }

    state.meta = { app:"Gestão MPE", appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION };

    saveState();
    renderAll();
    if(hint) hint.textContent = `Backup importado com sucesso (${file.name}).`;
    alert("Importação concluída.");
  }catch(err){
    if(hint) hint.textContent = `Falha ao importar: ${String(err.message || err)}`;
    alert("Não foi possível importar este arquivo. Verifique se é um backup do Gestão MPE.");
  }finally{
    const inp = document.getElementById("fileImportJson");
    if(inp) inp.value = "";
  }
}

function parseCsvLine(line){
  // Parser simples com suporte a aspas
  const out = [];
  let cur = "";
  let inQuotes = false;

  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(ch === '"' ){
      if(inQuotes && line[i+1] === '"'){ // escape ""
        cur += '"';
        i++;
      }else{
        inQuotes = !inQuotes;
      }
    }else if(ch === ',' && !inQuotes){
      out.push(cur);
      cur = "";
    }else{
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function normalizeHeader(h){
  return String(h || "").trim().toLowerCase();
}

function ensureAccountByName(name){
  const n = String(name || "").trim();
  if(!n) return state.accounts[0].id;
  const found = state.accounts.find(a => a.name.toLowerCase() === n.toLowerCase());
  if(found) return found.id;
  const id = uid();
  state.accounts.push({ id, name: n, initialBalance: 0 });
  return id;
}

function ensureCostCenterByName(name){
  const n = String(name || "").trim();
  if(!n) return state.costCenters[0].id;
  const found = state.costCenters.find(c => c.name.toLowerCase() === n.toLowerCase());
  if(found) return found.id;
  const id = uid();
  state.costCenters.push({ id, name: n });
  return id;
}

async function importCsvFile(file){
  const hint = document.getElementById("csvHint");
  try{
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim().length);
    if(lines.length < 2) throw new Error("CSV vazio ou inválido.");

    const header = parseCsvLine(lines[0]).map(normalizeHeader);

    // Esperado:
    // id,type,date,amount,account,costCenter,category,note
    const idx = {
      id: header.indexOf("id"),
      type: header.indexOf("type"),
      date: header.indexOf("date"),
      amount: header.indexOf("amount"),
      account: header.indexOf("account"),
      costCenter: header.indexOf("costcenter"),
      category: header.indexOf("category"),
      note: header.indexOf("note")
    };

    // mínimo viável: type,date,amount
    if(idx.type < 0 || idx.date < 0 || idx.amount < 0){
      throw new Error("Cabeçalho inválido. Use o CSV exportado pelo app.");
    }

    let imported = 0;
    let skipped = 0;

    for(let i=1;i<lines.length;i++){
      const cols = parseCsvLine(lines[i]);
      const type = String(cols[idx.type] || "").trim().toLowerCase();
      const date = String(cols[idx.date] || "").trim();
      const amount = safeNumber(String(cols[idx.amount] || "").trim().replace(",", "."));
      const accountName = idx.account >= 0 ? cols[idx.account] : "";
      const costName = idx.costCenter >= 0 ? cols[idx.costCenter] : "";
      const category = idx.category >= 0 ? String(cols[idx.category] || "").trim() : "Sem categoria";
      const note = idx.note >= 0 ? String(cols[idx.note] || "").trim() : "";
      const idRaw = idx.id >= 0 ? String(cols[idx.id] || "").trim() : "";

      const txType = (type === "expense" || type === "saida" || type === "saída") ? "expense" : "income";
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(amount >= 0)){
        skipped++;
        continue;
      }

      const accountId = ensureAccountByName(accountName);
      const costCenterId = ensureCostCenterByName(costName);

      const txId = idRaw ? idRaw : uid();

      // evitar duplicar se id já existe
      if(state.tx.some(t => t.id === txId)){
        skipped++;
        continue;
      }

      state.tx.push({
        id: txId,
        type: txType,
        date,
        amount,
        accountId,
        costCenterId,
        category: category || "Sem categoria",
        note: note || ""
      });

      imported++;
    }

    // ordena desc por data e salva
    state.tx.sort((a,b)=> (b.date || "").localeCompare(a.date || ""));
    saveState();
    renderAll();

    if(hint) hint.textContent = `Importação concluída: ${imported} importado(s), ${skipped} ignorado(s).`;
    alert("CSV importado com sucesso.");
  }catch(err){
    if(hint) hint.textContent = `Falha ao importar CSV: ${String(err.message || err)}`;
    alert("Não foi possível importar este CSV. Verifique o formato.");
  }finally{
    const inp = document.getElementById("fileImportCsv");
    if(inp) inp.value = "";
  }
}

/* =========================
   CSV EXPORT
========================= */
function exportCsvFromTx(tx, prefix){
  const header = ["id","type","date","amount","account","costCenter","category","note"];
  const rows = [header.join(",")];

  const accById = new Map(state.accounts.map(a => [a.id, a.name]));
  const costById = new Map(state.costCenters.map(c => [c.id, c.name]));

  for(const t of tx){
    const row = [
      t.id,
      t.type,
      t.date,
      String(t.amount),
      accById.get(t.accountId) || "",
      costById.get(t.costCenterId) || "",
      (t.category || "").replaceAll('"','""'),
      (t.note || "").replaceAll('"','""')
    ].map(v => `"${String(v)}"`).join(",");
    rows.push(row);
  }

  downloadText(`${prefix}-${new Date().toISOString().slice(0,10)}.csv`, rows.join("\n"), "text/csv;charset=utf-8");
}

function exportCsvAll(){
  exportCsvFromTx(state.tx, "gestao-mpe-tudo");
}

function exportCsvFiltered(){
  exportCsvFromTx(filteredTx(), "gestao-mpe-filtrado");
}

/* =========================
   SEED / WIPE
========================= */
function seedData(){
  const today = nowISODate();
  const mk = monthKey(today);

  const acc0 = state.accounts[0]?.id;
  const cost0 = state.costCenters[0]?.id;

  if(!acc0 || !cost0){
    alert("Crie ao menos 1 conta e 1 centro de custo antes.");
    return;
  }

  const sample = [
    { id: uid(), type:"income", date: `${mk}-02`, amount: 4200.00, accountId: acc0, costCenterId: cost0, category:"Vendas", note:"PIX / cartão" },
    { id: uid(), type:"expense", date: `${mk}-05`, amount: 1200.00, accountId: acc0, costCenterId: cost0, category:"Aluguel", note:"Sala comercial" },
    { id: uid(), type:"expense", date: `${mk}-10`, amount: 450.00, accountId: acc0, costCenterId: cost0, category:"Internet", note:"Plano mensal" },
    { id: uid(), type:"expense", date: `${mk}-12`, amount: 600.00, accountId: acc0, costCenterId: cost0, category:"Marketing", note:"Anúncios" },
    { id: uid(), type:"income", date: `${mk}-15`, amount: 2800.00, accountId: acc0, costCenterId: cost0, category:"Serviços", note:"Projeto" }
  ];

  state.tx = [...sample, ...state.tx];
  saveState();
  renderAll();
}

function wipeAll(){
  if(!confirm("Tem certeza? Isso apaga todos os lançamentos.")) return;
  state.tx = [];
  saveState();
  renderAll();
}

/* =========================
   RELATÓRIO ANUAL + INSIGHTS
========================= */
function monthsOfYear(year){
  const out = [];
  for(let m=1;m<=12;m++){
    out.push(`${year}-${String(m).padStart(2,"0")}`);
  }
  return out;
}

function totalsForMonthInYear(year, month){
  const tx = state.tx.filter(t => monthKey(t.date) === month && yearKey(t.date) === year);
  const income = tx.filter(t => t.type === "income").reduce((s,t)=>s+t.amount,0);
  const expense = tx.filter(t => t.type === "expense").reduce((s,t)=>s+t.amount,0);
  return { income, expense, net: income - expense };
}

function yearTotals(year){
  const tx = state.tx.filter(t => yearKey(t.date) === year);
  const income = tx.filter(t => t.type === "income").reduce((s,t)=>s+t.amount,0);
  const expense = tx.filter(t => t.type === "expense").reduce((s,t)=>s+t.amount,0);
  return { income, expense, net: income - expense, tx };
}

function yearCategoryRanking(year){
  const currency = state.cfg.currency;
  const { tx } = yearTotals(year);

  const m = new Map();
  for(const t of tx){
    const key = t.category || "Sem categoria";
    const signed = t.type === "income" ? t.amount : -t.amount;
    m.set(key, (m.get(key) || 0) + signed);
  }

  const arr = Array.from(m.entries()).sort((a,b)=> Math.abs(b[1]) - Math.abs(a[1]));
  if(!arr.length) return "Sem dados.";

  return arr.slice(0,20).map(([k,v]) => `${k}: ${moneyFmt(v, currency)}`).join("\n");
}

function yearInsights(year){
  const currency = state.cfg.currency;
  const { income, expense, net, tx } = yearTotals(year);

  // 1) runway simples = saldo geral / média mensal de saídas (do ano)
  const months = monthsOfYear(year);
  const monthExpenses = months.map(m => {
    const t = state.tx.filter(x => monthKey(x.date) === m && x.type === "expense");
    return t.reduce((s,x)=>s+x.amount,0);
  });
  const activeMonths = monthExpenses.filter(v=>v>0);
  const avgMonthlyExpense = activeMonths.length ? activeMonths.reduce((s,v)=>s+v,0)/activeMonths.length : 0;

  const bal = balanceOverall();
  const runwayMonths = avgMonthlyExpense > 0 ? (bal / avgMonthlyExpense) : null;

  // 2) concentração de gastos: % top categoria de despesas
  const expByCat = new Map();
  for(const t of tx){
    if(t.type !== "expense") continue;
    const k = t.category || "Sem categoria";
    expByCat.set(k, (expByCat.get(k)||0) + t.amount);
  }
  const expTotal = Array.from(expByCat.values()).reduce((s,v)=>s+v,0);
  const topExp = Array.from(expByCat.entries()).sort((a,b)=>b[1]-a[1])[0];
  const topShare = (expTotal>0 && topExp) ? (topExp[1]/expTotal) : 0;

  // 3) meses negativos
  const negatives = months.map(m => ({ m, net: totalsForMonth(m).net }))
    .filter(x => x.net < 0)
    .length;

  const lines = [];
  lines.push(`Ano: ${year}`);
  lines.push(`Entradas:  ${moneyFmt(income, currency)}`);
  lines.push(`Saídas:    ${moneyFmt(expense, currency)}`);
  lines.push(`Resultado: ${moneyFmt(net, currency)}`);
  lines.push("");

  if(runwayMonths === null){
    lines.push("Runway: sem saídas suficientes para calcular (cadastre despesas).");
  }else{
    lines.push(`Runway (aprox): ${runwayMonths.toFixed(1)} mês(es) mantendo o gasto médio do ano.`);
    if(runwayMonths < 2) lines.push("Alerta: runway abaixo de 2 meses. Priorize caixa e corte custos.");
  }

  if(topExp){
    lines.push(`Concentração: Top despesa = "${topExp[0]}" (${(topShare*100).toFixed(1)}% das despesas do ano).`);
    if(topShare >= 0.35) lines.push("Atenção: alta dependência em uma categoria. Negocie/otimize esse item.");
  }

  lines.push(`Meses com resultado negativo: ${negatives}/12.`);

  // 4) recorrência simples: mesma categoria aparece em >= 6 meses com despesa
  const catMonths = new Map(); // cat -> set(month)
  for(const t of tx){
    if(t.type !== "expense") continue;
    const m = monthKey(t.date);
    const k = t.category || "Sem categoria";
    if(!catMonths.has(k)) catMonths.set(k, new Set());
    catMonths.get(k).add(m);
  }
  const recurring = Array.from(catMonths.entries())
    .map(([k,set]) => ({ k, count: set.size }))
    .sort((a,b)=> b.count - a.count)
    .filter(x => x.count >= 6)
    .slice(0,3);

  if(recurring.length){
    lines.push("Recorrência (despesas frequentes):");
    recurring.forEach(r => lines.push(`- ${r.k} em ${r.count} mês(es)`));
  }

  return lines.join("\n");
}

function renderYearSection(){
  buildYearOptions();
  const year = document.getElementById("filterYear").value;

  const currency = state.cfg.currency;
  const { income, expense, net } = yearTotals(year);

  document.getElementById("yearSummary").textContent = [
    `Ano: ${year}`,
    `Entradas:  ${moneyFmt(income, currency)}`,
    `Saídas:    ${moneyFmt(expense, currency)}`,
    `Resultado: ${moneyFmt(net, currency)}`
  ].join("\n");

  document.getElementById("yearByCategory").textContent = yearCategoryRanking(year);
  document.getElementById("yearInsights").textContent = yearInsights(year);

  // gráfico tendência (net por mês)
  const months = monthsOfYear(year);
  const points = months.map(m => {
    const { net } = totalsForMonth(m);
    return { xLabel: m.slice(5,7), y: net };
  });

  const canvasTrend = document.getElementById("chartTrend");
  if(canvasTrend) drawLineChart(canvasTrend, points);
}

/* =========================
   RENDER ALL
========================= */
function renderAll(){
  buildMonthOptions();
  buildAccountFilter();
  buildCostCenterFilter();

  renderAccountSelect();
  renderCostCenterSelect();
  renderAccountsPanel();

  renderKpis();
  renderTable();
  renderReports();
  renderProjections();
  renderConfig();

  // Se estiver na aba relatórios, atualiza gráficos/ano
  const rel = document.getElementById("view-relatorios");
  if(rel && !rel.classList.contains("hidden")){
    renderReportsAndCharts();
    renderYearSection();
  }
}

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", () => {
  // Tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // Tema
  setTheme(state.cfg.theme || "dark");
  document.getElementById("btnTheme").addEventListener("click", () => {
    setTheme(state.cfg.theme === "light" ? "dark" : "light");
  });

  // Data padrão
  document.getElementById("txDate").value = nowISODate();

  // Form
  document.getElementById("txForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const type = document.getElementById("txType").value;
    const date = document.getElementById("txDate").value;
    const amount = Number(document.getElementById("txAmount").value);
    const category = document.getElementById("txCategory").value.trim();
    const note = document.getElementById("txNote").value.trim();
    const accountId = document.getElementById("txAccount").value;
    const costCenterId = document.getElementById("txCostCenter").value;

    if(!date || !category || !(amount >= 0) || !accountId || !costCenterId) return;

    state.tx.unshift({ id: uid(), type, date, amount, accountId, costCenterId, category, note });
    saveState();

    // reset
    document.getElementById("txAmount").value = "";
    document.getElementById("txCategory").value = "";
    document.getElementById("txNote").value = "";
    document.getElementById("txDate").value = nowISODate();

    renderAll();
  });

  // Filters mês
  document.getElementById("filterMonth").addEventListener("change", renderAll);
  document.getElementById("filterType").addEventListener("change", renderAll);
  document.getElementById("filterAccount").addEventListener("change", renderAll);
  document.getElementById("filterCostCenter").addEventListener("change", renderAll);

  // Filter ano
  document.getElementById("filterYear").addEventListener("change", renderYearSection);

  // Buttons
  document.getElementById("btnSeed").addEventListener("click", seedData);
  document.getElementById("btnWipe").addEventListener("click", wipeAll);

  document.getElementById("btnExportCsvAll").addEventListener("click", exportCsvAll);
  document.getElementById("btnExportCsvFiltered").addEventListener("click", exportCsvFiltered);

  document.getElementById("btnSaveCfg").addEventListener("click", saveConfig);

  document.getElementById("btnExportJson").addEventListener("click", exportJson);
  document.getElementById("fileImportJson").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if(file) importJsonFile(file);
  });

  document.getElementById("fileImportCsv").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if(file) importCsvFile(file);
  });

  document.getElementById("btnAddAccount").addEventListener("click", addAccount);
  document.getElementById("btnAddCostCenter").addEventListener("click", addCostCenter);

  renderAll();
});
