
const API_BASE = window.RXL_API_BASE || "http://localhost:4001";
const API = (p) => `${API_BASE}${p}`;
const AUTH = { "Authorization": "Bearer devkey" };

const $ = (s) => document.querySelector(s);
const file = $("#file"), upload = $("#upload"), ds = $("#ds");
const custId = $("#custId"), ssn = $("#ssn"), start = $("#start"), who = $("#who");
const qa = $("#qa"), qList = $("#qList"), result = $("#result");
const savePolicyBtn = $("#savePolicy");

function toggle(inp, btn){
  btn.addEventListener("click", ()=> { inp.type = inp.type === "password" ? "text" : "password"; });
}
toggle(document.getElementById("custId"), document.getElementById("toggleCust"));
toggle(document.getElementById("ssn"), document.getElementById("toggleSSN"));

upload.addEventListener("click", async () => {
  if (!file.files[0]) return alert("Pick a JSON file first");
  const text = await file.files[0].text();
  let records;
  try { records = JSON.parse(text); } catch (e) { return alert("Invalid JSON"); }
  const r = await fetch(API("/api/dataset/upload"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...AUTH },
    body: JSON.stringify({ records, ttlSeconds: 1800 })
  });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Upload failed");
  window.datasetId = j.datasetId;
  ds.textContent = `datasetId=${window.datasetId}, expires in ${j.expiresIn}s`;
});

savePolicyBtn.addEventListener("click", async ()=>{
  const reCount = +document.getElementById("pc_re_count").value || 0;
  const vCount  = +document.getElementById("pc_v_count").value  || 0;
  const lCount  = +document.getElementById("pc_l_count").value  || 0;
  const vAttrs = document.getElementById("pc_v_attrs").value.split(",").map(s=>s.trim()).filter(Boolean);
  const reFields = document.getElementById("pc_re_fields").value.split(",").map(s=>s.trim()).filter(Boolean);
  const lFields = document.getElementById("pc_l_fields").value.split(",").map(s=>s.trim()).filter(Boolean);
  const passAtLeast = +document.getElementById("pc_pass").value || 3;
  const failAtLeast = +document.getElementById("pc_fail").value || 2;
  const [minRe,minVeh,minLic] = (document.getElementById("pc_class_mins").value || "0,0,0")
    .split(",").map(x=>+x.trim()||0);

  const body = {
    scoring: {
      passIfCorrectAtLeast: passAtLeast,
      failIfWrongOrDeclinedAtLeast: failAtLeast,
      perClassMinimumCorrect: { real_estate: minRe, vehicle: minVeh, license: minLic }
    },
    selection: {
      counts: { real_estate: reCount, vehicle: vCount, license: lCount },
      vehicle: { allowedAttrs: vAttrs },
      real_estate: { allowedFields: reFields },
      license: { allowedFields: lFields },
      preferDiversity: true
    }
  };

  const r = await fetch(API("/api/policy"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...AUTH },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if(!r.ok){ alert(j.error || "Policy update failed"); return; }
  alert("Policy saved.");
});

start.addEventListener("click", async () => {
  if (!window.datasetId) return alert("Upload a dataset first");
  const r = await fetch(API("/api/kba/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...AUTH },
    body: JSON.stringify({ datasetId: window.datasetId, ssn: ssn.value || undefined, customerId: custId.value || undefined })
  });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Start failed");

  window.session = { id: j.sessionId, questions: j.questions, personKey: j.questions?.[0]?.personKey };
  who.textContent = `Session ${window.session.id} · Questions: ${window.session.questions.length}`;
  renderQuestions(window.session.questions);
  qa.classList.remove("hidden");
  result.textContent = "";
});

function renderQuestions(questions) {
  qList.innerHTML = "";
  questions.forEach(q => {
    const div = document.createElement("div");
    div.className = "q";
    div.innerHTML = `
      <div class="qhead">
        <div class="qtype">${q.type}</div>
        <div style="display:flex;gap:8px">
          <button class="btn swap" data-id="${q.id}">Swap</button>
          <button class="btn ghost decline" data-id="${q.id}">Decline</button>
        </div>
      </div>
      <div style="margin-top:6px">${q.prompt}</div>
      <input style="margin-top:8px" type="text" data-input="${q.id}" placeholder="Type answer here">
      <div class="feedback hidden" id="fb_${q.id}"></div>
    `;
    qList.appendChild(div);
  });

  qList.querySelectorAll(".swap").forEach(btn=>{
    btn.addEventListener("click", async (e)=>{
      const id = e.currentTarget.dataset.id;
      const q = window.session.questions.find(x=>x.id===id);
      const r = await fetch(API("/api/kba/swap"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH },
        body: JSON.stringify({ datasetId: window.datasetId, sessionId: window.session.id, personKey: window.session.personKey, question: q })
      });
      const j = await r.json();
      if (!r.ok) return alert(j.error || "Swap failed");
      const idx = window.session.questions.findIndex(x=>x.id===id);
      window.session.questions[idx] = j.question;
      renderQuestions(window.session.questions);
    });
  });

  qList.querySelectorAll(".decline").forEach(btn=>{
    btn.addEventListener("click", (e)=>{
      const id = e.currentTarget.dataset.id;
      const fb = document.getElementById(`fb_${id}`);
      fb.classList.remove("hidden"); fb.classList.add("fail");
      fb.innerText = "❌ Declined";
      const inp = qList.querySelector(`[data-input="${id}"]`);
      if (inp) { inp.value = ""; inp.disabled = true; }
    });
  });
}

document.getElementById("submit").addEventListener("click", async ()=>{
  const payload = window.session.questions.map(q => {
    const inp = qList.querySelector(`[data-input="${q.id}"]`);
    const declined = !inp || inp.disabled || !inp.value.trim();
    return { id: q.id, type: q.type, value: inp?.value || "", declined };
  });

  const r = await fetch(API("/api/kba/submit"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...AUTH },
    body: JSON.stringify({ datasetId: window.datasetId, sessionId: window.session.id, personKey: window.session.personKey, answers: payload })
  });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Submit failed");

  result.className = "result " + (j.status === "PASS" ? "pass" : "fail");
  result.innerText = `${j.status === "PASS" ? "✅ PASS" : "❌ FAIL"} — Correct: ${j.correct}, Incorrect: ${j.incorrect}, Declined: ${j.declined}`;
});
