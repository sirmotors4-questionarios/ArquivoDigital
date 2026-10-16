"use strict";
const CFG=window.ARQUIVO_CONFIG||{};
const shelves=Array.from({length:26},(_,i)=>String.fromCharCode(65+i)).flatMap(letter=>Array.from({length:6},(_,n)=>letter+(n+1)));
const sample=[
{"ID":1,"Departamento":"Tesouraria","Prateleira":"A1","Posição":1,"Nome do Ficheiro":"Extratos bancários","Ano Início":2020,"Ano Fim":2022,"Período":"2020–2022","Observações":"","Data de Cadastro":""},
{"ID":2,"Departamento":"Contabilidade","Prateleira":"B3","Posição":2,"Nome do Ficheiro":"Balancetes mensais","Ano Início":2021,"Ano Fim":"","Período":"2021","Observações":"","Data de Cadastro":""},
{"ID":3,"Departamento":"Recursos Humanos","Prateleira":"C6","Posição":3,"Nome do Ficheiro":"Processos individuais","Ano Início":2015,"Ano Fim":2019,"Período":"2015–2019","Observações":"","Data de Cadastro":""}
];
let records=[],editID=null,selectedShelf=null,pendingDelete=null,busy=false;
let departments=["Tesouraria","Contabilidade","Recursos Humanos"],configuredShelves=[...shelves],responsaveis=[];
const $=id=>document.getElementById(id);
let endpoint=sessionStorage.getItem("arquivo_consulta_url")||"";
let updateEndpoint=sessionStorage.getItem("arquivo_update_url")||"";
const activeOperations=new Map();
let operationTimer=null,operationPolling=false;
const operationStorageKey="arquivo_operacoes_pendentes";
function persistOperation(){sessionStorage.setItem(operationStorageKey,JSON.stringify([...activeOperations.values()]))}
function pendingFor(id){return activeOperations.get(String(id))}
function restoreOperation(){
 try{
  const saved=JSON.parse(sessionStorage.getItem(operationStorageKey)||"[]");
  const legacy=JSON.parse(sessionStorage.getItem("arquivo_operacao_em_curso")||"null");
  if(legacy&&legacy.id)saved.push(legacy);
  for(const op of saved){
   if(op&&op.id&&op.docId!=null&&op.target&&op.previous&&Number.isFinite(op.started))activeOperations.set(String(op.docId),op);
  }
  sessionStorage.removeItem("arquivo_operacao_em_curso");
  persistOperation();
  if(activeOperations.size)startOperationClock();
 }catch(e){sessionStorage.removeItem(operationStorageKey)}
}
const isDemo=()=>!endpoint;
const collator=new Intl.Collator('pt',{numeric:true,sensitivity:'base'});
const trim=v=>String(v??'').trim();
function num(v){return Number(v)||0}
function positionKey(r){return trim(r["Prateleira"]).toUpperCase()+"#"+String(r["Posição"]??("SEM_POSICAO_"+r.ID))}
function sorted(rows){return [...rows].sort((a,b)=>collator.compare(trim(a["Prateleira"]),trim(b["Prateleira"]))||num(a["Posição"])-num(b["Posição"])||collator.compare(trim(a["Nome do Ficheiro"]),trim(b["Nome do Ficheiro"])))}
function fieldByHeader(row,header){
  const normalizedKey=v=>String(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]/g,"").toLowerCase();
  const key=Object.keys(row).find(k=>normalizedKey(k)===normalizedKey(header));
  return key===undefined?undefined:row[key];
}
function normalized(r){
  const rawPosition=fieldByHeader(r,"Posição");
  const parsed=rawPosition===undefined||rawPosition===null||trim(rawPosition)===""?NaN:Number(trim(rawPosition).replace(",","."));
  return {...r,"Prateleira":trim(fieldByHeader(r,"Prateleira")).toUpperCase(),
    "Posição":Number.isSafeInteger(parsed)&&parsed>=1?parsed:null};
}
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(cls)node.className=cls;return node}
function operationStatus(state,title,description,id=""){renderTable()}
function viewHistory(r){
 $("historyDocName").textContent=r["Nome do Ficheiro"]+" · Documento "+r.ID;
 const raw=trim(fieldByHeader(r,"Actualização"));
 const root=$("historyContent");root.replaceChildren();
 if(!raw){root.append(el("p","Ainda não existem alterações registadas para este documento.","empty"))}
 else{
  // Os registos acumulados no Excel são exibidos sem alterar o texto original.
  const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)
   .filter(x=>!/^[-–—_\s]{3,}$/.test(x));
  const groups=[];let current=[];
  const datePattern=/^\[?\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\]?\s*$/;
  const isDate=line=>datePattern.test(line);
  const isEntryStart=line=>/^(?:actualiza[çc][ãa]o\s*(?:em|de|:)|alterad[oa]\s*(?:em|por|:))/i.test(line);
  for(const line of lines){
   // A data é o cabeçalho do próprio registo; nunca constitui um cartão separado.
   if(isDate(line)){
    if(current.length)groups.push(current);
    current=[line];
   }else if(isEntryStart(line)&&current.length&&!isDate(current[0])){
    groups.push(current);current=[line];
   }else current.push(line);
  }
  if(current.length)groups.push(current);
  groups.forEach((lines,index)=>{
   const card=el("article",undefined,"history-card");
   const heading=el("div",undefined,"history-card-head");
   heading.append(el("span","◷","history-card-icon"),el("strong","Registo "+String(index+1).padStart(2,"0")));
   card.append(heading);
   lines.forEach(line=>{
    if(/^[-–—_\\s]{3,}$/.test(line))return;
    const row=el("div",undefined,"history-line");
    const arrow=line.includes("→")?"→":line.includes("=>")?"=>":null;
    const textual=line.match(/^(.+?)\s+(?:de\s+)(.+?)\s+(?:para\s+)(.+)$/i);
    if(arrow){
     const [from,to]=line.split(arrow,2);
     const parts=from.trim().match(/^(.*?:\s*)([^:]+)$/);const before=el("span",parts?parts[2].trim():from.trim(),"change-before"),icon=el("span","→","change-arrow"),after=el("span",to.trim(),"change-after");if(parts)row.append(el("b",parts[1].trim()+" ","change-label"));
     row.append(before,icon,after);row.classList.add("history-change");
    }else if(textual){
     row.append(el("b",textual[1]+" · ","change-label"),el("span",textual[2],"change-before"),el("span","→","change-arrow"),el("span",textual[3],"change-after"));row.classList.add("history-change");
    }else row.append(el("span",line));
    card.append(row);
   });root.append(card);
  })
 }
 $("historyDialog").showModal();
}
function elapsedTime(ms){const seconds=Math.floor(ms/1000);return String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0")}
function rowMatchesUpdate(found,target){
 const fields=["Nome do Ficheiro","Departamento","Prateleira","Posição","Ano Início","Ano Fim","Observações"];
 return fields.every(k=>trim(fieldByHeader(found,k))===trim(target[k]));
}
function rowOperationStatus(r){
 const op=pendingFor(r.ID);
 if(!op)return null;
 const cell=el("div",undefined,"row-processing");
 const clock=el("span","◷ "+elapsedTime(Date.now()-op.started),"row-clock");
 clock.dataset.processingClock=String(r.ID);
 cell.append(clock,el("span",op.phase==="uncertain"?"A verificar…":"A processar…"));
 return cell;
}
function tickOperationClock(){
 document.querySelectorAll("[data-processing-clock]").forEach(n=>{
  const op=pendingFor(n.dataset.processingClock);
  if(op)n.textContent="◷ "+elapsedTime(Date.now()-op.started);
 });
 document.querySelectorAll("[data-pending-history]").forEach(n=>{
  const op=pendingFor(n.dataset.pendingHistory);
  if(op)n.title="Actualização em curso · "+elapsedTime(Date.now()-op.started);
 });
}
function stopOperationPolling(){clearInterval(operationTimer);operationTimer=null}
function startOperationClock(){
 if(operationTimer)return;
 operationTimer=setInterval(()=>{tickOperationClock();checkOperations()},5000);
}
async function checkOperations(){
 if(operationPolling||!activeOperations.size||isDemo())return;
 operationPolling=true;
 try{
  const response=await api({action:"list"});
  if(!Array.isArray(response.records))return;
  const fresh=response.records.map(normalized);
  let changed=false;
  for(const [key,op] of [...activeOperations]){
   if(Date.now()-op.started>10*60*1000&&op.phase!=="uncertain"){op.phase="uncertain";changed=true}
   const found=fresh.find(r=>String(r.ID)===key);
   const wasDifferent=!rowMatchesUpdate(op.previous,op.target);
   const baseline=trim(fieldByHeader(op.previous,"Data de Actualização"));
   const current=found?trim(fieldByHeader(found,"Data de Actualização")):"";
   const freshEvidence=wasDifferent||(baseline!==current&&Boolean(current));
   if(found&&rowMatchesUpdate(found,op.target)&&freshEvidence){
    activeOperations.delete(key);changed=true;
   }
  }
  if(changed){
   persistOperation();
   records=fresh;render();
   if(!activeOperations.size)stopOperationPolling();
  }
 }catch(e){/* Sem confirmação, os pedidos continuam visíveis e não são repetidos. */}
 finally{operationPolling=false}
}
function beginOperation(id,docId,target,previous){
 activeOperations.set(String(docId),{id,docId,target,previous,started:Date.now(),phase:"processing"});
 persistOperation();startOperationClock();renderTable();
}
function alertMsg(text,error=false){const n=$("message");n.textContent=text;n.className=error?"error":"success";n.hidden=false;window.scrollTo({top:0,behavior:'smooth'});clearTimeout(alertMsg.timer);alertMsg.timer=setTimeout(()=>n.hidden=true,7000)}
function show(view){document.querySelectorAll('.view').forEach(x=>x.hidden=x.id!==view);document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===view));const t={dashboard:['Painel geral','Localize e acompanhe os documentos arquivados.'],mapa:['Mapa do arquivo','Explore prateleiras e posições físicas.'],consulta:['Consultar documentos','Pesquise, edite ou reposicione registos.'],novo:[editID==null?'Novo registo':'Editar documento','Registe ou actualize a localização de um documento.']};$("pageTitle").textContent=t[view][0];$("pageSubtitle").textContent=t[view][1];window.scrollTo({top:0,behavior:'smooth'})}
function locationsOccupied(row,ignoreID){return records.find(r=>positionKey(r)===positionKey(row)&&String(r.ID)!==String(ignoreID??''))}
function unique(values){return [...new Set(values.map(trim).filter(Boolean))].sort(collator.compare)}
function renderSelect(id,values,all){const input=$(id),old=input.value;input.replaceChildren(new Option(all,""));values.forEach(v=>input.add(new Option(v,v)));input.value=values.includes(old)?old:""}
function render(){
records=records.map(normalized);
const all=sorted(records);
const withoutPosition=records.filter(r=>r["Posição"]===null);
if(withoutPosition.length)alertMsg("Atenção: "+withoutPosition.length+" registo(s) chegaram sem uma Posição válida do Excel. Confirme a coluna Posição na resposta do Power Automate.",true);
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
const respSelect=$("docForm").elements.responsavel,prevResp=respSelect.value;
respSelect.replaceChildren(new Option("Seleccionar responsável",""));
responsaveis.forEach(v=>respSelect.add(new Option(v,v)));
if(responsaveis.includes(prevResp))respSelect.value=prevResp;
const shelfSelect=$("docForm").elements.prateleira,prevShelf=shelfSelect.value;
shelfSelect.replaceChildren(new Option("Seleccionar",""));
configuredShelves.forEach(s=>shelfSelect.add(new Option(s,s)));
if(configuredShelves.includes(prevShelf))shelfSelect.value=prevShelf;
updatePositionChoices();
$("shelfSummary").replaceChildren(...[...new Set(all.map(x=>x["Prateleira"]))].slice(0,10).map(s=>{const n=el("button",undefined,"shelf-item");n.style.width="100%";n.style.textAlign="left";n.append(el("span",s,"pill"),el("span",all.filter(r=>r["Prateleira"]===s).length+" documento(s)","grow"));n.addEventListener("click",()=>openShelf(s));return n}));
if(!all.length)$("shelfSummary").replaceChildren(el("p","Sem documentos registados.","empty"));
const rec=$("recentDocs");rec.replaceChildren(...[...all].sort((a,b)=>num(b.ID)-num(a.ID)).slice(0,7).map(r=>{const n=el("div",undefined,"recent-item");const box=el("div",undefined,"grow");box.append(el("strong",r["Nome do Ficheiro"]),el("small",r.Departamento+" · "+r["Prateleira"]+" / "+r["Posição"]));n.append(el("span","▤","pill"),box);return n}));if(!all.length)rec.append(el("p","Nenhum documento registado.","empty"));
renderMap();renderTable();
if(selectedShelf)showShelf(selectedShelf);
$("syncState").textContent=isDemo()?"● Modo demonstração":("● Consulta configurada · Actualização "+(updateEndpoint?"configurada":"não configurada"));
}
function renderMap(){const group=$("shelfGroup").value;const map=$("shelfMap");map.replaceChildren();for(const s of configuredShelves.filter(s=>!group||s[0]===group)){const count=records.filter(r=>r["Prateleira"]===s).length;const btn=el("button",undefined,"shelf"+(count>0?" occupied":"")+(selectedShelf===s?" selected":""));btn.append(el("b",s),el("span",count+" posição(ões) ocupada(s)"));btn.addEventListener("click",()=>openShelf(s));map.append(btn)}}
function scrollToArchiveElement(node){
  if(!node)return;
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  node.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'start'});
}
function openShelf(s){
  selectedShelf=s;
  show("mapa");
  renderMap();
  showShelf(s);
  requestAnimationFrame(()=>scrollToArchiveElement($("shelfDetail")));
}
function showShelf(s){$("shelfDetail").hidden=false;$("selectedShelf").textContent="Prateleira "+s;const root=$("shelfDocuments");root.replaceChildren();const found=sorted(records.filter(r=>r["Prateleira"]===s));if(!found.length){root.append(el("p","Nenhuma posição ocupada nesta prateleira.","empty"));return}const tbl=el("table"),head=el("thead"),body=el("tbody");const hr=el("tr");["Posição","Nome do ficheiro","Departamento","Período","Acções"].forEach(h=>hr.append(el("th",h)));head.append(hr);found.forEach(r=>{const tr=el("tr");[r["Posição"],r["Nome do Ficheiro"],r.Departamento,r["Período"]||computedPeriod(r)].forEach(t=>tr.append(el("td",t)));const td=el("td");td.append(actions(r));tr.append(td);body.append(tr)});tbl.append(head,body);root.append(tbl)}
function actions(r){const span=el("div",undefined,"actions");const edit=el("button","Editar / Mover");edit.disabled=!!pendingFor(r.ID);if(edit.disabled)edit.title="Aguarde a conclusão da actualização deste documento.";edit.addEventListener("click",()=>editRow(r.ID));const remove=el("button","Eliminar","remove");remove.addEventListener("click",()=>askDelete(r.ID));span.append(edit,remove);return span}
function computedPeriod(r){const a=trim(r["Ano Início"]),b=trim(r["Ano Fim"]);return a?(b&&b!==a?a+"–"+b:a):"—"}
function renderTable(){const q=trim($("filterSearch").value).toLocaleLowerCase("pt"),dep=$("filterDept").value,shelf=$("filterShelf").value,year=num($("filterYear").value);const all=sorted(records).filter(r=>(!q||[r["Nome do Ficheiro"],r.Observações,r.Departamento,r["Prateleira"]].some(x=>trim(x).toLocaleLowerCase("pt").includes(q)))&&(!dep||r.Departamento===dep)&&(!shelf||r["Prateleira"]===shelf)&&(!year||(num(r["Ano Início"])<=year&&year<=num(r["Ano Fim"]||r["Ano Início"]))));$("filterCount").textContent=all.length+" resultado(s)";const root=$("docsBody");root.replaceChildren();for(const r of all){const tr=el("tr");const loc=el("td",r["Prateleira"]+" · Posição "+r["Posição"],"loc");const doc=el("td",r["Nome do Ficheiro"]);const depCell=el("td",r.Departamento);const period=el("td",r["Período"]||computedPeriod(r));const history=el("td");const isProcessing=!!pendingFor(r.ID);const historyBtn=el("button",isProcessing?"◷ Pendente":"Ver histórico","history-btn"+(isProcessing?" history-pending":""));historyBtn.type="button";if(isProcessing){historyBtn.dataset.pendingHistory=String(r.ID);historyBtn.title="Actualização em curso · "+elapsedTime(Date.now()-pendingFor(r.ID).started)}historyBtn.addEventListener("click",()=>viewHistory(r));history.append(historyBtn);const act=el("td");const activity=rowOperationStatus(r);if(activity)doc.append(activity);act.append(actions(r));tr.append(loc,doc,depCell,period,history,act);root.append(tr)}if(!all.length){const row=el("tr"),td=el("td","Nenhum documento encontrado.","empty");td.colSpan=6;row.append(td);root.append(row)}}
function updatePositionChoices(preferred="") {
  const fields=$("docForm").elements, shelf=trim(fields.prateleira.value);
  const select=fields.posicao, current=String(preferred||select.value||"");
  select.replaceChildren(new Option(shelf?"Seleccionar posição livre":"Seleccione primeiro a prateleira",""));
  select.disabled=!shelf;
  if(!shelf)return;
  const taken=new Set(records.filter(r=>r["Prateleira"]===shelf&&String(r.ID)!==String(editID??"")&&r["Posição"]!==null).map(r=>r["Posição"]));
 for(const op of activeOperations.values())if(op.target["Prateleira"]===shelf&&String(op.docId)!==String(editID??""))taken.add(op.target["Posição"]);
  const max=Math.max(0,...records.filter(r=>r["Prateleira"]===shelf&&r["Posição"]!==null).map(r=>r["Posição"]));
  // Apresenta apenas as posições livres de 1 até à última ocupada + 1.
  for(let pos=1;pos<=max+1;pos++)if(!taken.has(pos))select.add(new Option("Posição "+pos,String(pos)));
  if(current&&[...select.options].some(opt=>opt.value===current))select.value=current;
}
function clearForm(){editID=null;$("docForm").reset();updatePositionChoices();$("formTitle").textContent="Registar documento";$("saveBtn").textContent="Guardar registo"}
function editRow(id){if(pendingFor(id)){alertMsg("Este documento já tem uma actualização pendente. Aguarde a conclusão.",true);return}const r=records.find(x=>String(x.ID)===String(id));if(!r)return;editID=r.ID;const f=$("docForm").elements;f.nome.value=trim(r["Nome do Ficheiro"]);f.departamento.value=trim(r.Departamento);f.prateleira.value=trim(r["Prateleira"]);updatePositionChoices(String(r["Posição"]));f.anoInicio.value=r["Ano Início"];f.anoFim.value=r["Ano Fim"]||"";f.observacoes.value=r.Observações||"";f.responsavel.value="";$("formTitle").textContent="Editar / Reposicionar documento";$("saveBtn").textContent="Guardar alterações";show("novo")}
async function api(body){if(isDemo())throw Error("API não configurada");const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),CFG.timeoutMs||20000);try{const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:controller.signal});let parsed={};try{parsed=await res.json()}catch{}if(!res.ok||parsed.ok===false){const msg=parsed.code==="POSITION_OCCUPIED"?"Esta posição já está ocupada. Escolha outra.":parsed.message||"Erro na operação ("+res.status+").";throw Error(msg)}return parsed}finally{clearTimeout(timeout)}}
async function load(){if(busy)return;busy=true;$("refreshBtn").disabled=true;try{if(isDemo()){if(!load.hasDemo)records=sample.map(x=>({...x}));load.hasDemo=true}else{const response=await api({action:"list"});if(!Array.isArray(response.records))throw Error("A resposta da API não contém a lista de documentos.");records=response.records;
if(!Array.isArray(response.departments)||!Array.isArray(response.shelves))throw Error("A API deve devolver departments e shelves a partir das tabelas da folha Listas.");
departments=unique(response.departments.map(v=>typeof v==="string"?v:v.Departamento));
configuredShelves=unique(response.shelves.map(v=>typeof v==="string"?v:v.Prateleira).map(x=>x.toUpperCase())).filter(s=>/^[A-Z][1-6]$/.test(s));
if(!Array.isArray(response.responsaveis))throw Error("A resposta do Power Automate não contém o array responsaveis.");
responsaveis=unique(response.responsaveis.map(v=>typeof v==="string"?v:(v?.["Responsável"]??v?.Responsavel??"")));
}render()}catch(e){alertMsg("Não foi possível carregar o arquivo: "+e.message,true)}finally{busy=false;$("refreshBtn").disabled=false}}
async function save(ev){ev.preventDefault();if(!isDemo()&&(editID==null||!updateEndpoint)){alertMsg(editID==null?"O registo de novos documentos ainda não está ligado ao SharePoint.":"Configure primeiro a URL HTTP de pedidos de actualização em Ligar SharePoint.",true);return}if(busy)return;const f=$("docForm").elements;const yr=num(f.anoInicio.value),end=f.anoFim.value?num(f.anoFim.value):"";if(end&&end<yr){alertMsg("O ano final não pode ser anterior ao ano inicial.",true);return}const row={"Nome do Ficheiro":trim(f.nome.value),"Departamento":trim(f.departamento.value),"Prateleira":trim(f.prateleira.value),"Posição":num(f.posicao.value),"Ano Início":yr,"Ano Fim":end,"Observações":trim(f.observacoes.value),"Responsável":trim(f.responsavel.value)};if(!configuredShelves.includes(row["Prateleira"])||!departments.includes(row.Departamento)||!Number.isSafeInteger(row["Posição"])||row["Posição"]<1){alertMsg("Indique uma prateleira válida e uma posição inteira maior ou igual a 1.",true);return}const reserved=[...activeOperations.values()].find(op=>String(op.docId)!==String(editID)&&op.target["Prateleira"]===row["Prateleira"]&&op.target["Posição"]===row["Posição"]);
 if(reserved){alertMsg("Esta posição já está reservada por outro pedido pendente.",true);return}
 const taken=locationsOccupied(row,editID);if(taken){alertMsg("Posição ocupada: "+taken["Nome do Ficheiro"]+" já está na prateleira "+row["Prateleira"]+", posição "+row["Posição"]+".",true);return}if(!isDemo()&&pendingFor(editID)){alertMsg("Este documento já tem uma actualização pendente. Pode actualizar outros documentos enquanto aguarda.",true);return}busy=true;$("saveBtn").disabled=true;try{if(isDemo()){if(editID==null){const next=Math.max(0,...records.map(r=>num(r.ID)))+1;records.push({...row,ID:next,"Período":computedPeriod(row)})}else{const idx=records.findIndex(r=>String(r.ID)===String(editID));if(idx<0)throw Error("Registo não encontrado.");records[idx]={...records[idx],...row,"Período":computedPeriod(row)}}}else{
 const idPedido=crypto.randomUUID();
 const requestDocId=editID;
 const previous={...(records.find(r=>String(r.ID)===String(editID))||{})};
 beginOperation(idPedido,editID,row,previous);
 operationStatus("sending","A enviar actualização…","Pedido em processamento.",idPedido);
 const controller=new AbortController(),t=setTimeout(()=>controller.abort(),CFG.timeoutMs||20000);
 let response;
 try{response=await fetch(updateEndpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"update",id:editID,id_pedido:idPedido,record:row}),signal:controller.signal})}finally{clearTimeout(t)}
 const raw=await response.text();
 let result={};
 try{result=raw?JSON.parse(raw):{}}catch{throw Error("HTTP "+response.status+": resposta não é JSON válido. Confirma a acção Response no Power Automate.")}
 if(!response.ok||result.ok===false){
   const detail=typeof result.message==="string"?result.message:
     (typeof result.error?.message==="string"?result.error.message:"");
   const reason=({400:"Pedido inválido ou esquema JSON incompatível.",401:"Autenticação recusada. Confirme a opção Who can trigger the flow.",403:"Sem autorização para executar o fluxo.",404:"URL de actualização incorrecta ou desactualizada.",429:"Limite de pedidos excedido.",500:"Erro interno do Power Automate.",502:"Erro de comunicação com o serviço.",503:"Serviço temporariamente indisponível."})[response.status]||"O pedido não foi aceite pelo serviço.";
   if([400,401,403,404].includes(response.status)){activeOperations.delete(String(requestDocId));persistOperation();renderTable();if(!activeOperations.size)stopOperationPolling()}
   throw Error("HTTP "+response.status+" — "+(detail||reason));
 }
 if(!result.id_pedido&&!result.ID_Pedido)throw Error("Pedido enviado com ID "+idPedido+", mas não foi devolvida confirmação; verifique a fila SharePoint.");
 if(pendingFor(requestDocId)){pendingFor(requestDocId).phase="processing";persistOperation()}
 operationStatus("pending","Pedido em processamento","A aguardar confirmação dos dados do Excel.",idPedido);
 clearForm();show("consulta");return
}clearForm();render();show("consulta");alertMsg("Operação simulada. Os dados não foram enviados ao SharePoint.")}catch(e){
 if(pendingFor(requestDocId)){pendingFor(requestDocId).phase="uncertain";persistOperation();renderTable()}
 const message=e.name==="AbortError"?"Tempo limite ao contactar o Power Automate. Verifica o estado do pedido no SharePoint antes de tentares novamente.":e instanceof TypeError?"Falha de comunicação com o Power Automate (URL, CORS ou rede). Verifica a ligação e não repitas o pedido antes de consultar a fila no SharePoint.":e.message;
 operationStatus(pendingFor(requestDocId)?"uncertain":"error","Estado do pedido","Verifique o resultado no SharePoint.",idPedido);
 alertMsg("Não foi possível confirmar o pedido ("+idPedido+"): "+message,true)
}finally{busy=false;$("saveBtn").disabled=false}}
function askDelete(id){pendingDelete=id;const r=records.find(x=>String(x.ID)===String(id));$("confirmText").textContent='Pretende eliminar "'+(r?.["Nome do Ficheiro"]||"este documento")+'"? A posição ficará livre.';$("confirmDialog").showModal()}
async function deleteRow(){if(pendingDelete==null||busy)return;if(!isDemo()){pendingDelete=null;$("confirmDialog").close();alertMsg("Eliminação indisponível até configurar o fluxo protegido de escrita.",true);return}const id=pendingDelete;busy=true;$("confirmDelete").disabled=true;try{if(isDemo()){records=records.filter(r=>String(r.ID)!==String(id))}else{await api({action:"delete",id});const res=await api({action:"list"});records=res.records||[]}pendingDelete=null;$("confirmDialog").close();render();alertMsg(isDemo()?"Eliminação simulada.":"Registo eliminado.")}catch(e){alertMsg("Não foi possível eliminar: "+e.message,true);$("confirmDialog").close()}finally{busy=false;$("confirmDelete").disabled=false}}
document.querySelectorAll("[data-view]").forEach(btn=>btn.addEventListener("click",()=>{if(btn.dataset.view==="novo")clearForm();show(btn.dataset.view)}));
document.querySelectorAll("[data-go]").forEach(btn=>btn.addEventListener("click",()=>show(btn.dataset.go)));
$("newBtn").addEventListener("click",()=>{clearForm();show("novo")});
$("refreshBtn").addEventListener("click",load);
$("docForm").addEventListener("submit",save);
$("docForm").elements.prateleira.addEventListener("change",()=>updatePositionChoices());
$("cancelEdit").addEventListener("click",()=>{clearForm();show("consulta")});
$("resetForm").addEventListener("click",clearForm);
$("backToShelf").addEventListener("click",()=>{const shelfButton=[...$("shelfMap").querySelectorAll(".shelf")].find(b=>b.querySelector("b")?.textContent===selectedShelf);scrollToArchiveElement(shelfButton||$("shelfMap"))});
$("clearShelf").addEventListener("click",()=>{selectedShelf=null;$("shelfDetail").hidden=true;renderMap()});
$("shelfGroup").addEventListener("change",renderMap);
for(const id of ["filterSearch","filterDept","filterShelf","filterYear"])$(id).addEventListener("input",renderTable);
$("abortDelete").addEventListener("click",()=>{$("confirmDialog").close();pendingDelete=null});
$("confirmDelete").addEventListener("click",deleteRow);
for(const group of "ABCDEFGHIJKLMNOPQRSTUVWXYZ")$("shelfGroup").add(new Option(group,group));
// Departamentos e prateleiras são carregados da API (folha Listas).
$("connectBtn").addEventListener("click",()=>{$("apiUrlInput").value=endpoint;$("updateUrlInput").value=updateEndpoint;$("connectionDialog").showModal()});
$("closeConnection").addEventListener("click",()=>$("connectionDialog").close());
$("disconnectBtn").addEventListener("click",()=>{endpoint="";sessionStorage.removeItem("arquivo_consulta_url");updateEndpoint="";sessionStorage.removeItem("arquivo_update_url");records=[];load.hasDemo=false;$("connectionDialog").close();load()});
$("saveConnection").addEventListener("click",async()=>{const url=trim($("apiUrlInput").value);if(!/^https:\/\//i.test(url)){alertMsg("Introduza uma URL HTTPS válida.",true);return}const candidateUpdate=trim($("updateUrlInput").value);if(candidateUpdate&&!/^https:\/\//i.test(candidateUpdate)){alertMsg("A URL de actualização deve utilizar HTTPS.",true);return}endpoint=url;sessionStorage.setItem("arquivo_consulta_url",url);updateEndpoint=candidateUpdate;if(updateEndpoint)sessionStorage.setItem("arquivo_update_url",updateEndpoint);else sessionStorage.removeItem("arquivo_update_url");$("connectionDialog").close();await load()});
$("closeHistory").addEventListener("click",()=> $("historyDialog").close());
restoreOperation();
load();