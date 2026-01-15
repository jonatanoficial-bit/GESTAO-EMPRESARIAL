// Gestão MPE — v0.3 (Etapa 3)
// Contas (Caixa/Bancos) + Centro de Custos + Relatórios por conta/centro
// Offline-first | Mobile-first | Incremental | Sem suposições arriscadas

const LS_KEY = "gmpe_v03_state";
const APP_VERSION = "0.3";
const SCHEMA_VERSION = 3;

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
  if(!raw) return defaultState();

  try{
    const parsed = JSON.parse(raw);

    // Migração simples: se vier de versões antigas sem accounts/costCenters, cria defaults
    if(parsed && typeof parsed === "object"){
      if(!Array.isArray(parsed.accounts) || parsed.accounts.length === 0){
        parsed.accounts = [{ id: uid(), name:"Caixa", initialBalance: 0 }];
      }
      if(!Array.isArray(parsed.costCenters) || parsed.costCenters.length === 0){
        parsed.costCenters = [{ id: uid(), name:"Operacional" }];
      }
      // Garantir cfg
      parsed.cfg = parsed.cfg || { company:"", currency:"BRL", theme:"dark" };
      parsed.cfg.company = parsed.cfg.company ?? "";
      parsed.cfg.currency = parsed.cfg.currency ?? "BRL";
      parsed.cfg.theme = parsed.cfg.theme ?? "dark";

      // Ajustar tx antigas sem accountId/costCenterId (associa ao primeiro de cada)
      const acc0 = parsed.accounts[0].id;
      const cost0 = parsed.costCenters[0].id;
      if(Array.isArray(parsed.tx)){
        parsed.tx = parsed.tx.map(t => ({
          id: String(t.id ?? uid()),
          type: t.type === "expense" ? "expense" : "income",
          date: String(t.date ?? nowISODate()),
          amount: Number(t.amount ?? 0),
          accountId: String(t.accountId ?? acc0),
          costCenterId: String(t.costCenterId ?? cost0),
          category: String(t.category ?? "Sem categoria"),
          note: String(t.note ?? "")
        }));
      }else{
        parsed.tx = [];
      }

      parsed.meta = { app:"Gestão MPE", appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION };

      // Se ainda assim ficar inconsistente, volta pro default
      if(!isValidState(parsed)) return defaultState();
      return parsed;
    }

    return defaultState();
  }catch{
    return defaultState();
  }
}

function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

/* =========================
   DOWNLOADS (CSV/JSON)
========================= */
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

function exportCsv(){
  const header = ["id","type","date","amount","account","costCenter","category","note"];
  const rows = [header.join(",")];

  const accById = new Map(state.accounts.map(a => [a.id, a.name]));
  const costById = new Map(state.costCenters.map(c => [c.id, c.name]));

  for(const t of state.tx){
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

  downloadText(`gestao-mpe-${new Date().toISOString().slice(0,10)}.csv`, rows.join("\n"), "text/csv;charset=utf-8");
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
      throw new Error("JSON inválido ou incompatível.");
    }

    state = candidate;
    // garantir meta atual
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
}

/* =========================
   DADOS / KPIs / FILTROS
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
  sel.value = currentMonth();
}

function totalsForMonth(month){
  const tx = state.tx.filter(t => monthKey(t.date) === month);
  const income = tx.filter(t => t.type === "income").reduce((s,t)=>s+t.amount,0);
  const expense = tx.filter(t => t.type === "expense").reduce((s,t)=>s+t.amount,0);
  return { income, expense, net: income - expense };
}

function balanceOverall(){
  // saldo total = soma dos saldos iniciais + entradas - saídas
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
  const m = document.getElementById("filterMonth")?.value || currentMonth();
  const { income, expense } = totalsForMonth(m);

  document.getElementById("kpiBalance").textContent = moneyFmt(balanceOverall(), currency);
  document.getElementById("kpiIncome").textContent = moneyFmt(income, currency);
  document.getElementById("kpiExpense").textContent = moneyFmt(expense, currency);
}

/* =========================
   CONTAS + CENTROS
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

function deleteCostCenter(id){
  if(state.costCenters.length <= 1){
    alert("Você precisa ter pelo menos 1 centro de custo.");
    return;
  }

  const used = state.tx.some(t => t.costCenterId === id);
  if(used){
    alert("Não é possível excluir: existe lançamento vinculado a este centro de custo.");
    return;
  }

  if(!confirm("Excluir este centro de custo?")) return;
  state.costCenters = state.costCenters.filter(c => c.id !== id);
  saveState();
  renderAll();
}

/* =========================
   TABELA DE LANÇAMENTOS
========================= */
function renderTable(){
  const month = document.getElementById("filterMonth").value;
  const type = document.getElementById("filterType").value;

  const tbody = document.getElementById("txTable");
  tbody.innerHTML = "";

  const accById = new Map(state.accounts.map(a => [a.id, a.name]));
  const costById = new Map(state.costCenters.map(c => [c.id, c.name]));

  let tx = state.tx.slice().sort((a,b) => (b.date || "").localeCompare(a.date || ""));
  tx = tx.filter(t => monthKey(t.date) === month);
  if(type !== "all") tx = tx.filter(t => t.type === type);

  if(tx.length === 0){
    document.getElementById("txHint").textContent = "Sem lançamentos para este filtro.";
    return;
  }
  document.getElementById("txHint").textContent = `${tx.length} lançamento(s) exibidos.`;

  for(const t of tx){
    const tr = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.textContent = t.date || "";
    tr.appendChild(tdDate);

    const tdType = document.createElement("td");
    tdType.textContent = t.type === "income" ? "Entrada" : "Saída";
    tr.appendChild(tdType);

    const tdAcc = document.createElement("td");
    tdAcc.textContent = accById.get(t.accountId) || "—";
    tr.appendChild(tdAcc);

    const tdCost = document.createElement("td");
    tdCost.textContent = costById.get(t.costCenterId) || "—";
    tr.appendChild(tdCost);

    const tdCat = document.createElement("td");
    tdCat.textContent = t.category || "";
    tr.appendChild(tdCat);

    const tdAmt = document.createElement("td");
    tdAmt.className = "right";
    tdAmt.textContent = moneyFmt(t.amount, state.cfg.currency);
    tr.appendChild(tdAmt);

    const tdAct = document.createElement("td");
    tdAct.className = "right";
    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "Excluir";
    del.addEventListener("click", () => deleteTx(t.id));
    tdAct.appendChild(del);
    tr.appendChild(tdAct);

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
   RELATÓRIOS
========================= */
function renderReports(){
  const month = document.getElementById("filterMonth").value;
  const currency = state.cfg.currency;

  const tx = state.tx.filter(t => monthKey(t.date) === month);

  const { income, expense, net } = totalsForMonth(month);

  document.getElementById("reportMonthSummary").textContent = [
    `Mês: ${month.replace("-", "/")}`,
    `Entradas:  ${moneyFmt(income, currency)}`,
    `Saídas:    ${moneyFmt(expense, currency)}`,
    `Resultado: ${moneyFmt(net, currency)}`
  ].join("\n");

  // Por categoria (saldo assinado)
  const byCat = new Map();
  for(const t of tx){
    const key = t.category || "Sem categoria";
    const signed = (t.type === "income") ? t.amount : -t.amount;
    byCat.set(key, (byCat.get(key) || 0) + signed);
  }
  const catArr = Array.from(byCat.entries()).sort((a,b)=> Math.abs(b[1]) - Math.abs(a[1]));
  document.getElementById("reportByCategory").textContent =
    catArr.length ? catArr.map(([k,v]) => `${k}: ${moneyFmt(v, currency)}`).join("\n") : "Sem dados.";

  // Por conta (saldo assinado no mês)
  const byAcc = new Map();
  for(const t of tx){
    const key = t.accountId;
    const signed = (t.type === "income") ? t.amount : -t.amount;
    byAcc.set(key, (byAcc.get(key) || 0) + signed);
  }
  const accArr = Array.from(byAcc.entries()).sort((a,b)=> Math.abs(b[1]) - Math.abs(a[1]));
  const accById = new Map(state.accounts.map(a => [a.id, a.name]));
  document.getElementById("reportByAccount").textContent =
    accArr.length ? accArr.map(([id,v]) => `${accById.get(id) || "—"}: ${moneyFmt(v, currency)}`).join("\n") : "Sem dados.";

  // Por centro de custo (saldo assinado no mês)
  const byCost = new Map();
  for(const t of tx){
    const key = t.costCenterId;
    const signed = (t.type === "income") ? t.amount : -t.amount;
    byCost.set(key, (byCost.get(key) || 0) + signed);
  }
  const costArr = Array.from(byCost.entries()).sort((a,b)=> Math.abs(b[1]) - Math.abs(a[1]));
  const costById = new Map(state.costCenters.map(c => [c.id, c.name]));
  document.getElementById("reportByCostCenter").textContent =
    costArr.length ? costArr.map(([id,v]) => `${costById.get(id) || "—"}: ${moneyFmt(v, currency)}`).join("\n") : "Sem dados.";
}

/* =========================
   PROJEÇÕES (MVP)
========================= */
function renderProjections(){
  const currency = state.cfg.currency;
  const month = document.getElementById("filterMonth").value;
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
    tips.push("Seu saldo geral está abaixo da meta de 30 dias de saídas. Considere reduzir custos ou aumentar receita.");
  }else if(avgExpense > 0){
    tips.push("Saldo geral dentro/ acima da meta de 30 dias. Próximo passo: construir reserva de 1–3 meses.");
  }else{
    tips.push("Cadastre algumas saídas para gerar projeções mais úteis.");
  }

  const income = tx.filter(t => t.type === "income").reduce((s,t)=>s+t.amount,0);
  const expense = tx.filter(t => t.type === "expense").reduce((s,t)=>s+t.amount,0);

  if(income > 0 && expense > income){
    tips.push("No mês selecionado, suas saídas superaram suas entradas. Investigue categorias/centros de maior impacto.");
  }
  if(tx.length < 5){
    tips.push("Mais lançamentos = relatórios e projeções melhores. Tente registrar diariamente por 1 semana.");
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
   CONFIG
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
   RENDER ALL
========================= */
function renderAll(){
  buildMonthOptions();
  renderAccountSelect();
  renderCostCenterSelect();
  renderAccountsPanel();
  renderKpis();
  renderTable();
  renderReports();
  renderProjections();
  renderConfig();
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

  // Filters
  document.getElementById("filterMonth").addEventListener("change", renderAll);
  document.getElementById("filterType").addEventListener("change", renderAll);

  // Buttons
  document.getElementById("btnSeed").addEventListener("click", seedData);
  document.getElementById("btnWipe").addEventListener("click", wipeAll);
  document.getElementById("btnExportCsv").addEventListener("click", exportCsv);

  document.getElementById("btnSaveCfg").addEventListener("click", saveConfig);

  document.getElementById("btnExportJson").addEventListener("click", exportJson);
  document.getElementById("fileImportJson").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if(file) importJsonFile(file);
  });

  document.getElementById("btnAddAccount").addEventListener("click", addAccount);

  document.getElementById("btnAddCostCenter").addEventListener("click", () => {
    const name = (prompt("Nome do centro de custo:") || "").trim();
    if(!name) return;
    state.costCenters.push({ id: uid(), name });
    saveState();
    renderAll();
  });

  // Clique duplo no painel de centro de custo para excluir (sem UI extra por enquanto)
  // (manter simples e incremental: exclusão completa será refinada se você pedir)
  // -> por enquanto não expomos botão de excluir centro na UI principal.

  renderAll();
});
