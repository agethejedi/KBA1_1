
import crypto from "crypto";
import { getPersonBySafeKey } from "../services/datastore.js";
import { getPolicy } from "./policy.js";

const VEH_ATTRS = ["color","model","make","year"];
const RE_FIELDS = ["street","move_in_year","city","zip"];
const LIC_FIELDS = ["agency","profession","number"];

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^\w\s]/g,"").replace(/\s+/g," ").trim();

function choose(fields, allowed, exclude=null){
  const pool = (allowed && allowed.length ? fields.filter(f => allowed.includes(f)) : fields)
    .filter(f => f !== exclude);
  return pool.length ? pool[Math.floor(Math.random()*pool.length)] : (exclude || fields[0]);
}

function buildRealEstateQuestion(address, field){
  if(field === "street") return { type:"real_estate",
    prompt:"Fill in the street address of your most recent residence (street & number):",
    answer: address.street || "" };
  if(field === "move_in_year") return { type:"real_estate",
    prompt:"What year did you move into your most recent residence? (YYYY)",
    answer: String(address.from || "").slice(0,4) };
  if(field === "city") return { type:"real_estate",
    prompt:"What city is your most recent residence located in?",
    answer: address.city || "" };
  return { type:"real_estate",
    prompt:"What is the ZIP code of your most recent residence?",
    answer: address.zip || "" };
}

function buildVehicleQuestion(car, attr){
  const pretty = (v)=> (v==null?"":String(v));
  if(attr === "color"){
    return { type: "vehicle",
      prompt: `What was the color of the ${pretty(car.make)} ${pretty(car.model)} (${pretty(car.year) || "unknown year"})?`,
      answer: car.color || "" };
  }
  if(attr === "model"){
    return { type: "vehicle",
      prompt: `What was the model of the ${pretty(car.make)} you owned?`,
      answer: car.model || "" };
  }
  if(attr === "make"){
    return { type: "vehicle",
      prompt: `What was the make of the vehicle you previously owned (year ${pretty(car.year) || "unknown"})?`,
      answer: car.make || "" };
  }
  return { type: "vehicle",
    prompt: `What year was the ${pretty(car.make)} ${pretty(car.model)} you owned? (YYYY)`,
    answer: (car.year || "").toString().slice(0,4) };
}

function buildLicenseQuestion(lic, field){
  if(field === "agency") return { type:"license",
    prompt:`Which agency issued your ${lic.profession || "professional"} license? (full agency name)`,
    answer: lic.agency || "" };
  if(field === "number") return { type:"license",
    prompt:`What is the license number for your ${lic.profession || "professional"} license?`,
    answer: lic.number || "" };
  return { type:"license",
    prompt:"What is the profession listed on your license?",
    answer: lic.profession || "" };
}

export function generateQuestions(person, policy){
  const qs = [];
  const adds = person.addresses || [];
  const cars = person.cars || [];
  const lics = person.licenses || [];

  const sel = policy?.selection || {};
  const counts = sel.counts || {};

  const reAllowed = sel.real_estate?.allowedFields || RE_FIELDS;
  const reCount = Math.max(0, counts.real_estate ?? 0);
  let lastRe = null;
  for(let i=0;i<reCount;i++){
    const a = adds[0] || {};
    const field = choose(RE_FIELDS, reAllowed, sel.preferDiversity ? lastRe : null);
    const q = buildRealEstateQuestion(a, field);
    qs.push({ id: crypto.randomUUID(), ...q, personKey: person._keySafe, meta:{ field } });
    lastRe = field;
  }

  const vAllowed = sel.vehicle?.allowedAttrs || VEH_ATTRS;
  const vCount = Math.max(0, counts.vehicle ?? 0);
  let lastAttr = null;
  for(let i=0;i<vCount;i++){
    const car = cars[Math.min(i, Math.max(0,cars.length-1))] || {};
    const existing = VEH_ATTRS.filter(a => car[a]);
    const attr = choose(existing.length?existing:VEH_ATTRS, vAllowed, sel.preferDiversity ? lastAttr : null);
    const vq = buildVehicleQuestion(car, attr);
    qs.push({ id: crypto.randomUUID(), ...vq, personKey: person._keySafe, meta:{ attr, carIndex: i } });
    lastAttr = attr;
  }

  const lAllowed = sel.license?.allowedFields || LIC_FIELDS;
  const lCount = Math.max(0, counts.license ?? 0);
  let lastLic = null;
  for(let i=0;i<lCount;i++){
    const lic = lics[Math.min(i, Math.max(0, lics.length-1))] || {};
    const field = choose(LIC_FIELDS, lAllowed, sel.preferDiversity ? lastLic : null);
    const lq = buildLicenseQuestion(lic, field);
    qs.push({ id: crypto.randomUUID(), ...lq, personKey: person._keySafe, meta:{ field, licIndex: i } });
    lastLic = field;
  }

  return { questions: qs, personKey: person._keySafe };
}

export function swapQuestion(personKey, question){
  const person = getPersonBySafeKey(personKey);
  if(!person) throw new Error("Person not found");

  const policy = getPolicy();
  const sel = policy.selection;

  if(question.type==="real_estate"){
    const adds = person.addresses || [];
    const a = adds[1] || adds[0] || {};
    const reAllowed = sel.real_estate.allowedFields;
    const field = choose(RE_FIELDS, reAllowed, question.meta?.field || null);
    const q = buildRealEstateQuestion(a, field);
    return { id: crypto.randomUUID(), ...q, personKey, meta:{ field } };
  }

  if(question.type==="vehicle"){
    const cars = person.cars || [];
    const idx = (question.meta?.carIndex ?? 0);
    const nextCar = cars[idx===0 && cars[1] ? 1 : 0] || cars[0] || {};
    const allowed = sel.vehicle.allowedAttrs;
    const existing = VEH_ATTRS.filter(a => nextCar[a]);
    const attr = choose(existing.length?existing:VEH_ATTRS, allowed, question.meta?.attr || null);
    const q = buildVehicleQuestion(nextCar, attr);
    return { id: crypto.randomUUID(), ...q, personKey, meta:{ attr, carIndex: nextCar===cars[1]?1:0 } };
  }

  if(question.type==="license"){
    const lics = person.licenses || [];
    const idx = (question.meta?.licIndex ?? 0);
    const nextLic = lics[idx===0 && lics[1] ? 1 : 0] || lics[0] || {};
    const allowed = sel.license.allowedFields;
    const field = choose(LIC_FIELDS, allowed, question.meta?.field || null);
    const q = buildLicenseQuestion(nextLic, field);
    return { id: crypto.randomUUID(), ...q, personKey, meta:{ field, licIndex: nextLic===lics[1]?1:0 } };
  }

  return question;
}

export function validateAnswers(personKey, answers, policy){
  let correct=0, incorrect=0, declined=0;
  const perClass = {};
  const add = (cls,k)=> (perClass[cls] ??= {correct:0,incorrect:0,declined:0}, perClass[cls][k]++);

  answers.forEach(a=>{
    const cls = a.type || "misc";
    if(a.declined){ declined++; add(cls,"declined"); return; }
    const exp = norm(a.expected || a.answer || "");
    const got = norm(a.value || "");
    if(!exp){ incorrect++; add(cls,"incorrect"); return; }

    if(/^\d{4}$/.test(exp) && (got.match(/\d{4}/)||[])[0] === exp){ correct++; add(cls,"correct"); return; }

    const ok = (got===exp) || exp.split(" ").filter(Boolean).every(t=>got.includes(t));
    if(ok){ correct++; add(cls,"correct"); } else { incorrect++; add(cls,"incorrect"); }
  });

  const rules = policy?.scoring || {};
  const globalFail = (incorrect + declined) >= (rules.failIfWrongOrDeclinedAtLeast ?? 2);
  const globalPass = correct >= (rules.passIfCorrectAtLeast ?? 3);

  const floors = rules.perClassMinimumCorrect || {};
  const classFail = Object.entries(floors).some(([cls, min]) => (min>0 && (perClass[cls]?.correct || 0) < min));

  const status = (!globalFail && !classFail && globalPass) ? "PASS" : "FAIL";
  return { correct, incorrect, declined, perClass, status, rule: rules };
}
