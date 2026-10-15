"use strict";
const CFG=window.ARQUIVO_CONFIG||{};
const shelves=Array.from({length:26},(_,i)=>String.fromCharCode(65+i)).flatMap(letter=>Array.from({length:6},(_,n)=>letter+(n+1)));
const sample=[
{"ID":1,"Departamento":"Tesouraria","Prateleira":"A1","Posição":1,"Nome do Ficheiro":"Extratos bancários","Ano Início":2020,"Ano Fim":2022,"Período":"2020–2022","Observações":"","Data de Cadastro":""},
{"ID":2,"Departamento":"Contabilidade","Prateleira":"B3","Posição":2,"Nome do Ficheiro":"Balancetes mensais","Ano Início":2021,"Ano Fim":"","Período":"2021","Observações":"","Data de Cadastro":""},
{"ID":3,"Departamento":"Recursos Humanos","Prateleira":"C6","Posição":3,"Nome do Ficheiro":"Processos individuais","Ano Início":2015,"Ano Fim":2019,"Período":"2015–2019","Observações":"","Data de Cadastro":""}
];
let records=[],editID=null,selectedShelf=null,pendingDelete=null,busy=false;\nlet departments=["Tesouraria","Contabilidade","Recursos Humanos"],configuredShelves=[...shelves];
const $=id=>document.getElementById(id);
const isDemo=CFG.demo!==false || !CFG.apiUrl;
const collator=new Intl.Collator('pt',{numeric:true,sensitivity:'base'});
const trim=v=>String(v??'').trim();
function num(v){return Number(v)||0}
function positionKey(r){return trim(r["Prateleira"]).toUpperCase()+"#"+num(r["Posição"])}
function sorted(rows){return [...rows].sort((a,b)=>collator.compare(trim(a["Prateleira"]),trim(b["Prateleira"]))||num(a["Posição"])-num(b["Posição"])||collator.compare(trim(a["Nome do Ficheiro"]),trim(b["Nome do Ficheiro"])))}
function normalized(r){return {...r,"Prateleira":trim(r["Prateleira"]).toUpperCase(),"Posição":num(r["Posição"])}}
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(cls)node.className=cls;return node}
function alertMsg(text,error=false){const n=$("message");n.textContent=text;n.className=error?"error":"success";n.hidden=false;window.scrollTo({top:0,behavior:'smooth'});clearTimeout(alertMsg.timer);alertMsg.timer=setTimeout(()=>n.hidden=true,7000)}
function show(view){document.querySelectorAll('.view').forEach(x=>x.hidden=x.id!==view);document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===view));const t={dashboard:['Painel geral','Localize e acompanhe os documentos arquivados.'],mapa:['Mapa do arquivo','Explore prateleiras e posições físicas.'],consulta:['Consultar documentos','Pesquise, edite ou reposicione registos.'],novo:[editID==null?'Novo registo':'Editar documento','Registe ou actualize a localização de um documento.']};$("pageTitle").textContent=t[view][0];$("pageSubtitle").textContent=t[view][1];window.scrollTo({top:0,behavior:'smooth'})}
function locationsOccupied(row,ignoreID){return records.find(r=>positionKey(r)===positionKey(row)&&String(r.ID)!==String(ignoreID??''))}
function unique(values){return [...new Set(values.map(trim).filter(Boolean))].sort(collator.compare)}
function renderSelect(id,values,all){const input=$(id),old=input.value;input.replaceChildren(new Option(all,""));values.forEach(v=>input.add(new Option(v,v)));input.value=values.includes(old)?old:""}
function render(){
records=records.map(normalized);
const all=sorted(records);
$("totalDocs").textContent=all.length;
$("usedShelves").textContent=new Set(all.map(x=>x["Prateleira"])).size;
$("totalDepts").textContent=unique(all.map(x=>x.Departamento)).length;
$("usedPositions").textContent=new Set(all.map(positionKey)).size;
renderSelect("filterDept",unique(all.map(x=>x.Departamento)),"Todos");
renderSelect("filterShelf",unique(all.map(x=>x["Prateleira"])),"Todas");
const depSelect=$("docForm").elements.departamento,prevDept=depSelect.value;
depSelect.replaceChildren(new Option("Seleccionar departamento",""));
departments.forEach(d=>depSelect.add(new Option(d,d)));
if(departments.includes(prevDept))depSelect.value=prevDept;
const shelfSelect=$("docForm").elements.prateleira,prevShelf=shelfSelect.value;
shelfSelect.replaceChildren(new Option("Seleccionar",""));
configuredShelves.forEach(s=>shelfSelect.add(new Option(s,s)));
if(configuredShelves.includes(prevShelf))shelfSelect.value=prevShelf;\nupdatePositionChoices();
$("shelfSummary").replaceChildren(...[...new Set(all.map(x=>x["Prateleira"]))].slice(0,10).map(s=>{const n=el("button",undefined,"shelf-item");n.style.width="100%";n.style.textAlign="left";n.append(el("span",s,"pill"),el("span",all.filter(r=>r["Prateleira"]===s).length+" documento(s)","grow"));n.addEventListener("click",()=>openShelf(s));return n}));
if(!all.length)$("shelfSummary").replaceChildren(el("p","Sem documentos registados.","empty"));
const rec=$("recentDocs");rec.replaceChildren(...[...all].sort((a,b)=>num(b.ID)-num(a.ID)).slice(0,7).map(r=>{const n=el("div",undefined,"recent-item");const box=el("div",undefined,"grow");box.append(el("strong",r["Nome do Ficheiro"]),el("small",r.Departamento+" · "+r["Prateleira"]+" / "+r["Posição"]));n.append(el("span","▤","pill"),box);return n}));if(!all.length)rec.append(el("p","Nenhum documento registado.","empty"));
renderMap();renderTable();
if(selectedShelf)showShelf(selectedShelf);
$("syncState").textContent=isDemo?"● Modo demonstração":"● Ligado ao serviço";
}
function renderMap(){const group=$("shelfGroup").value;const map=$("shelfMap");map.replaceChildren();for(const s of configuredShelves.filter(s=>!group||s[0]===group)){const count=records.filter(r=>r["Prateleira"]===s).length;const btn=el("button",undefined,"shelf"+(selectedShelf===s?" selected":""));btn.append(el("b",s),el("span",count+" posição(ões) ocupada(s)"));btn.addEventListener("click",()=>openShelf(s));map.append(btn)}}
function openShelf(s){selectedShelf=s;show("mapa");renderMap();showShelf(s)}
function showShelf(s){$("shelfDetail").hidden=false;$("selectedShelf").textContent="Prateleira "+s;const root=$("shelfDocuments");root.replaceChildren();const found=sorted(records.filter(r=>r["Prateleira"]===s));if(!found.length){root.append(el("p","Nenhuma posição ocupada nesta prateleira.","empty"));return}const tbl=el("table"),head=el("thead"),body=el("tbody");const hr=el("tr");["Posição","Nome do ficheiro","Departamento","Período","Acções"].forEach(h=>hr.append(el("th",h)));head.append(hr);found.forEach(r=>{const tr=el("tr");[r["Posição"],r["Nome do Ficheiro"],r.Departamento,r["Período"]||computedPeriod(r)].forEach(t=>tr.append(el("td",t)));const td=el("td");td.append(actions(r));tr.append(td);body.append(tr)});tbl.append(head,body);root.append(tbl)}
function actions(r){const span=el("div",undefined,"actions");const edit=el("button","Editar / Mover");edit.addEventListener("click",()=>editRow(r.ID));const remove=el("button","Eliminar","remove");remove.addEventListener("click",()=>askDelete(r.ID));span.append(edit,remove);return span}
function computedPeriod(r){const a=trim(r["Ano Início"]),b=trim(r["Ano Fim"]);return a?(b&&b!==a?a+"–"+b:a):"—"}
function renderTable(){const q=trim($("filterSearch").value).toLocaleLowerCase("pt"),dep=$("filterDept").value,shelf=$("filterShelf").value,year=num($("filterYear").value);const all=sorted(records).filter(r=>(!q||[r["Nome do Ficheiro"],r.Observações,r.Departamento,r["Prateleira"]].some(x=>trim(x).toLocaleLowerCase("pt").includes(q)))&&(!dep||r.Departamento===dep)&&(!shelf||r["Prateleira"]===shelf)&&(!year||(num(r["Ano Início"])<=year&&year<=num(r["Ano Fim"]||r["Ano Início"]))));$("filterCount").textContent=all.length+" resultado(s)";const root=$("docsBody");root.replaceChildren();for(const r of all){const tr=el("tr");const loc=el("td",r["Prateleira"]+" · Posição "+r["Posição"],"loc");const doc=el("td",r["Nome do Ficheiro"]);const depCell=el("td",r.Departamento);const period=el("td",r["Período"]||computedPeriod(r));const act=el("td");act.append(actions(r));tr.append(loc,doc,depCell,period,act);root.append(tr)}if(!all.length){const row=el("tr"),td=el("td","Nenhum documento encontrado.","empty");td.colSpan=5;row.append(td);root.append(row)}}
function updatePositionChoices(preferred="") {
  const fields=$("docForm").elements, shelf=trim(fields.prateleira.value);
  const select=fields.posicao, current=String(preferred||select.value||"");
  select.replaceChildren(new Option(shelf?"Seleccionar posição livre":"Seleccione primeiro a prateleira",""));
  select.disabled=!shelf;
  if(!shelf)return;
  const taken=new Set(records.filter(r=>r["Prateleira"]===shelf&&String(r.ID)!==String(editID??"")).map(r=>num(r["Posição"])));
  const max=Math.max(0,...records.filter(r=>r["Prateleira"]===shelf).map(r=>num(r["Posição"])));
  // Apresenta apenas as posições livres de 1 até à última ocupada + 1.
  for(let pos=1;pos<=max+1;pos++)if(!taken.has(pos))select.add(new Option("Posição "+pos,String(pos)));
  if(current&&[...select.options].some(opt=>opt.value===current))select.value=current;
}
function clearForm(){editID=null;$("docForm").reset();updatePositionChoices();$("formTitle").textContent="Registar documento";$("saveBtn").textContent="Guardar registo"}
function editRow(id){const r=records.find(x=>String(x.ID)===String(id));if(!r)return;editID=r.ID;const f=$("docForm").elements;f.nome.value=trim(r["Nome do Ficheiro"]);f.departamento.value=trim(r.Departamento);f.prateleira.value=trim(r["Prateleira"]);updatePositionChoices(String(r["Posição"]));f.anoInicio.value=r["Ano Início"];f.anoFim.value=r["Ano Fim"]||"";f.observacoes.value=r.Observações||"";$("formTitle").textContent="Editar / Reposicionar documento";$("saveBtn").textContent="Guardar alterações";show("novo")}
async function api(body){if(isDemo)throw Error("API não configurada");const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),CFG.timeoutMs||20000);try{const res=await fetch(CFG.apiUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:controller.signal});let parsed={};try{parsed=await res.json()}catch{}if(!res.ok||parsed.ok===false){const msg=parsed.code==="POSITION_OCCUPIED"?"Esta posição já está ocupada. Escolha outra.":parsed.message||"Erro na operação ("+res.status+").";throw Error(msg)}return parsed}finally{clearTimeout(timeout)}}
async function load(){if(busy)return;busy=true;$("refreshBtn").disabled=true;try{if(isDemo){if(!records.length&&!load.hasDemo)records=sample.map(x=>({...x}));load.hasDemo=true}else{const response=await api({action:"list"});if(!Array.isArray(response.records))throw Error("A resposta da API não contém a lista de documentos.");records=response.records;
if(!Array.isArray(response.departments)||!Array.isArray(response.shelves))throw Error("A API deve devolver departments e shelves a partir das tabelas da folha Listas.");
departments=unique(response.departments.map(v=>typeof v==="string"?v:v.Departamento));
configuredShelves=unique(response.shelves.map(v=>typeof v==="string"?v:v.Prateleira).map(x=>x.toUpperCase())).filter(s=>/^[A-Z][1-6]$/.test(s));
}render()}catch(e){alertMsg("Não foi possível carregar o arquivo: "+e.message,true)}finally{busy=false;$("refreshBtn").disabled=false}}
async function save(ev){ev.preventDefault();if(busy)return;const f=$("docForm").elements;const yr=num(f.anoInicio.value),end=f.anoFim.value?num(f.anoFim.value):"";if(end&&end<yr){alertMsg("O ano final não pode ser anterior ao ano inicial.",true);return}const row={"Nome do Ficheiro":trim(f.nome.value),"Departamento":trim(f.departamento.value),"Prateleira":trim(f.prateleira.value),"Posição":num(f.posicao.value),"Ano Início":yr,"Ano Fim":end,"Observações":trim(f.observacoes.value)};if(!configuredShelves.includes(row["Prateleira"])||!departments.includes(row.Departamento)||!Number.isSafeInteger(row["Posição"])||row["Posição"]<1){alertMsg("Indique uma prateleira válida e uma posição inteira maior ou igual a 1.",true);return}const taken=locationsOccupied(row,editID);if(taken){alertMsg("Posição ocupada: "+taken["Nome do Ficheiro"]+" já está na prateleira "+row["Prateleira"]+", posição "+row["Posição"]+".",true);return}busy=true;$("saveBtn").disabled=true;try{if(isDemo){if(editID==null){const next=Math.max(0,...records.map(r=>num(r.ID)))+1;records.push({...row,ID:next,"Período":computedPeriod(row)})}else{const idx=records.findIndex(r=>String(r.ID)===String(editID));if(idx<0)throw Error("Registo não encontrado.");records[idx]={...records[idx],...row,"Período":computedPeriod(row)}}}else{await api(editID==null?{action:"create",record:row}:{action:"update",id:editID,record:row});const result=await api({action:"list"});records=result.records||[]}clearForm();render();show("consulta");alertMsg(isDemo?"Operação simulada. Os dados não foram enviados ao SharePoint.":"Registo guardado com sucesso.")}catch(e){alertMsg("Não foi possível guardar: "+e.message,true)}finally{busy=false;$("saveBtn").disabled=false}}
function askDelete(id){pendingDelete=id;const r=records.find(x=>String(x.ID)===String(id));$("confirmText").textContent='Pretende eliminar "'+(r?.["Nome do Ficheiro"]||"este documento")+'"? A posição ficará livre.';$("confirmDialog").showModal()}
async function deleteRow(){if(pendingDelete==null||busy)return;const id=pendingDelete;busy=true;$("confirmDelete").disabled=true;try{if(isDemo){records=records.filter(r=>String(r.ID)!==String(id))}else{await api({action:"delete",id});const res=await api({action:"list"});records=res.records||[]}pendingDelete=null;$("confirmDialog").close();render();alertMsg(isDemo?"Eliminação simulada.":"Registo eliminado.")}catch(e){alertMsg("Não foi possível eliminar: "+e.message,true);$("confirmDialog").close()}finally{busy=false;$("confirmDelete").disabled=false}}
document.querySelectorAll("[data-view]").forEach(btn=>btn.addEventListener("click",()=>{if(btn.dataset.view==="novo")clearForm();show(btn.dataset.view)}));
document.querySelectorAll("[data-go]").forEach(btn=>btn.addEventListener("click",()=>show(btn.dataset.go)));
$("newBtn").addEventListener("click",()=>{clearForm();show("novo")});
$("refreshBtn").addEventListener("click",load);
$("docForm").addEventListener("submit",save);\n$("docForm").elements.prateleira.addEventListener("change",()=>updatePositionChoices());
$("cancelEdit").addEventListener("click",()=>{clearForm();show("consulta")});
$("resetForm").addEventListener("click",clearForm);
$("clearShelf").addEventListener("click",()=>{selectedShelf=null;$("shelfDetail").hidden=true;renderMap()});
$("shelfGroup").addEventListener("change",renderMap);
for(const id of ["filterSearch","filterDept","filterShelf","filterYear"])$(id).addEventListener("input",renderTable);
$("abortDelete").addEventListener("click",()=>{$("confirmDialog").close();pendingDelete=null});
$("confirmDelete").addEventListener("click",deleteRow);
for(const group of "ABCDEFGHIJKLMNOPQRSTUVWXYZ")$("shelfGroup").add(new Option(group,group));
// Departamentos e prateleiras são carregados da API (folha Listas).
load();