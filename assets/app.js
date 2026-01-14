// Gestão MPE — protótipo v0.1 (offline / localStorage)
// Diretrizes: mobile-first, incremental, sem suposições arriscadas.

const LS_KEY = "gmpe_v01_state";
const APP_VERSION = "0.2";
const SCHEMA_VERSION = 1;

function deepClone(obj){
  return JSON.parse(JSON.stringify(obj));
}

function isValidState(obj){
  // Validação defensiva (mínima) para evitar corromper dados
  if(!obj || typeof obj !== "object") return false;
  if(!obj.cfg || typeof obj.cfg !== "object") return false;
  if(!Array.isArray(obj.tx)) return false;

  const cfg = obj.cfg;
  if(typeof cfg.company !== "string") return false;
  if(typeof cfg.currency !== "string") return false;
  if(typeof cfg.theme !== "string") return false;

  for(const t of obj.tx){
    if(!t || typeof t !== "object") return false;
    if(typeof t.id !== "string") return false;
    if(t.type !== "income" && t.type !== "expense") return false;
    if(typeof t.date !== "string") return false;
    if(typeof t.amount !== "number" || !isFinite(t.amount) || t.amount < 0) return false;
    if(typeof t.category !== "string") return false;
    if(typeof t.note !== "string") return false;
  }
  return true;
}

function downloadText(filename, text, mime="application/json;charset=utf-8"){
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

function exportJson(){
  const payload = {
    meta: { app:"Gestão MPE", appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString() },
    state: deepClone(state)
  };
  const filename = `gestao-mpe-backup-${new Date().toISOString().slice(0,10)}.json`;
  downloadText(filename, JSON.stringify(payload, null, 2));
  const hint = document.getElementById("backupHint");
  if(hint) hint.textContent = `Backup gerado: ${filename}`;
}

async function importJsonFile(file){
  const hint = document.getElementById("backupHint");
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    const candidate = data?.state ?? data; // aceita payload completo ou somente state
    if(!isValidState(candidate)){
      throw new Error("JSON inválido ou incompatível com este protótipo.");
    }
    state = candidate;
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


function nowISODate(){
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0,10);
}

function moneyFmt(value, currency="BRL"){
  try{
    return new Intl.NumberFormat("pt-BR", { style:"currency", currency }).format(value);
  }catch{
    return `R$ ${value.toFixed(2)}`;
  }
}

function monthKey(dateStr){
  // yyyy-mm-dd -> yyyy-mm
  return (dateStr || "").slice(0,7);
}

function loadState(){
  const raw = localStorage.getItem(LS_KEY);
  if(!raw) return {
    cfg: { company:"", currency:"BRL", theme:"dark" },
    tx: []
  };
  try{
    const parsed = JSON.parse(raw);
    // Migração simples se necessário
    return {
      cfg: { company: parsed.cfg?.company ?? "", currency: parsed.cfg?.currency ?? "BRL", theme: parsed.cfg?.theme ?? "dark" },
      tx: Array.isArray(parsed.tx) ? parsed.tx : []
    };
  }catch{
    return { cfg:{ company:"", currency:"BRL", theme:"dark" }, tx: [] };
  }
}

function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function seedData(){
  const today = nowISODate();
  const mk = monthKey(today);
  const sample = [
    { id: uid(), type:"income", date: `${mk}-02`, amount: 4200.00, category:"Vendas", note:"PIX / cartão" },
    { id: uid(), type:"expense", date: `${mk}-05`, amount: 1200.00, category:"Aluguel", note:"Sala comercial" },
    { id: uid(), type:"expense", date: `${mk}-10`, amount: 450.00, category:"Internet", note:"Plano mensal" },
    { id: uid(), type:"expense", date: `${mk}-12`, amount: 600.00, category:"Marketing", note:"Anúncios" },
    { id: uid(), type:"income", date: `${mk}-15`, amount: 2800.00, category:"Serviços", note:"Projeto" },
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

function totalsForMonth(month){
  const currency = state.cfg.currency;
  const tx = state.tx.filter(t => monthKey(t.date) === month);
  const income = tx.filter(t => t.type === "income").reduce((s,t)=>s+t.amount,0);
  const expense = tx.filter(t => t.type === "expense").reduce((s,t)=>s+t.amount,0);
  return { income, expense, net: income - expense, currency };
}

function balanceOverall(){
  return state.tx.reduce((s,t)=> s + (t.type === "income" ? t.amount : -t.amount), 0);
}

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

function renderKpis(){
  const currency = state.cfg.currency;
  const m = document.getElementById("filterMonth")?.value || currentMonth();
  const { income, expense } = totalsForMonth(m);
  document.getElementById("kpiBalance").textContent = moneyFmt(balanceOverall(), currency);
  document.getElementById("kpiIncome").textContent = moneyFmt(income, currency);
  document.getElementById("kpiExpense").textContent = moneyFmt(expense, currency);
}

function renderTable(){
  const month = document.getElementById("filterMonth").value;
  const type = document.getElementById("filterType").value;
  const tbody = document.getElementById("txTable");
  tbody.innerHTML = "";

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
    const pill = document.createElement("span");
    pill.className = `pill ${t.type}`;
    pill.textContent = t.type === "income" ? "Entrada" : "Saída";
    tdType.appendChild(pill);
    tr.appendChild(tdType);

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
    del.className = "btn";
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

function renderReports(){
  const month = document.getElementById("filterMonth").value;
  const currency = state.cfg.currency;
  const tx = state.tx.filter(t => monthKey(t.date) === month);

  const { income, expense, net } = totalsForMonth(month);
  const lines = [
    `Mês: ${month.replace("-", "/")}`,
    `Entradas: ${moneyFmt(income, currency)}`,
    `Saídas:   ${moneyFmt(expense, currency)}`,
    `Resultado: ${moneyFmt(net, currency)}`
  ].join("\n");
  document.getElementById("reportMonthSummary").textContent = lines;

  const byCat = new Map();
  for(const t of tx){
    const key = t.category || "Sem categoria";
    const signed = (t.type === "income") ? t.amount : -t.amount;
    byCat.set(key, (byCat.get(key) || 0) + signed);
  }
  const catArr = Array.from(byCat.entries()).sort((a,b)=> Math.abs(b[1]) - Math.abs(a[1]));
  const catLines = catArr.length ? catArr.map(([k,v]) => `${k}: ${moneyFmt(v, currency)}`).join("\n") : "Sem dados.";
  document.getElementById("reportByCategory").textContent = catLines;
}

function renderProjections(){
  const currency = state.cfg.currency;
  // Projeção MVP: baseado em custos fixos aproximados (média das saídas do mês selecionado)
  const month = document.getElementById("filterMonth").value;
  const tx = state.tx.filter(t => monthKey(t.date) === month);
  const expenses = tx.filter(t => t.type === "expense").map(t => t.amount);
  const avgExpense = expenses.length ? expenses.reduce((s,v)=>s+v,0) / expenses.length : 0;

  const reserve1 = avgExpense * 1; // 1 mês
  const reserve3 = avgExpense * 3; // 3 meses
  document.getElementById("projReserve").textContent =
    `1 mês: ${moneyFmt(reserve1, currency)}\n3 meses: ${moneyFmt(reserve3, currency)}`;

  // Meta: 30 dias de saídas médias (aprox = média de saídas)
  document.getElementById("projTarget").textContent =
    `Meta (30 dias): ${moneyFmt(avgExpense, currency)}`;

  const tips = [];
  const bal = balanceOverall();
  if(avgExpense > 0 && bal < avgExpense){
    tips.push("Seu saldo está abaixo da meta de 30 dias de saídas. Considere reduzir custos ou aumentar receita.");
  }else if(avgExpense > 0){
    tips.push("Saldo dentro/ acima da meta de 30 dias. Próximo passo: construir reserva de 1–3 meses.");
  }else{
    tips.push("Cadastre algumas saídas para gerar projeções mais úteis.");
  }

  const income = tx.filter(t => t.type === "income").reduce((s,t)=>s+t.amount,0);
  const expense = tx.filter(t => t.type === "expense").reduce((s,t)=>s+t.amount,0);
  if(income > 0 && expense > income){
    tips.push("No mês selecionado, suas saídas superaram suas entradas. Investigue categorias de maior impacto.");
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

function exportCsv(){
  const header = ["id","type","date","amount","category","note"];
  const rows = [header.join(",")];

  for(const t of state.tx){
    const row = [
      t.id,
      t.type,
      t.date,
      String(t.amount).replace(".", "."),
      (t.category || "").replaceAll('"','""'),
      (t.note || "").replaceAll('"','""')
    ].map(v => `"${v}"`).join(",");
    rows.push(row);
  }

  const blob = new Blob([rows.join("\n")], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gestao-mpe-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

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

function renderAll(){
  buildMonthOptions();
  renderKpis();
  renderTable();
  renderReports();
  renderProjections();
  renderConfig();
}

let state = loadState();

document.addEventListener("DOMContentLoaded", () => {
  // Tema
  setTheme(state.cfg.theme || "dark");

  // default date input
  document.getElementById("txDate").value = nowISODate();

  // Tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // Filters
  document.getElementById("filterMonth").addEventListener("change", renderAll);
  document.getElementById("filterType").addEventListener("change", renderAll);

  // Form
  document.getElementById("txForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const type = document.getElementById("txType").value;
    const date = document.getElementById("txDate").value;
    const amount = Number(document.getElementById("txAmount").value);
    const category = document.getElementById("txCategory").value.trim();
    const note = document.getElementById("txNote").value.trim();

    if(!date || !category || !(amount >= 0)) return;

    state.tx.unshift({ id: uid(), type, date, amount, category, note });
    saveState();

    // reset minimal
    document.getElementById("txAmount").value = "";
    document.getElementById("txCategory").value = "";
    document.getElementById("txNote").value = "";
    document.getElementById("txDate").value = nowISODate();

    renderAll();
  });

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


  document.getElementById("btnTheme").addEventListener("click", () => {
    setTheme(state.cfg.theme === "light" ? "dark" : "light");
  });

  renderAll();
});
