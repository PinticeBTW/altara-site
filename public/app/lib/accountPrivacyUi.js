import { policyAllowsProduct, policyMessage, signupPolicyMetadata } from "./accountPrivacyClient.js";

function stylesheet(doc) {
 if (doc.querySelector('link[data-account-privacy-style]')) return;
 const link = doc.createElement("link"); link.rel = "stylesheet"; link.href = new URL("./accountPrivacy.css", import.meta.url).href;
 link.dataset.accountPrivacyStyle = "1"; doc.head.append(link);
}
function element(doc, tag, text, className) {
 const el = doc.createElement(tag);
 if (text) el.textContent = text;
 if (className) el.className = className;
 return el;
}
function tx(translate, key, fallback, params = null) {
 const raw = typeof translate === "function" ? translate(key, fallback) : fallback;
 if(!params || typeof params !== "object") return String(raw || fallback || "");
 let out=String(raw || fallback || "");
 for(const [name,value] of Object.entries(params)) out=out.split(`{${name}}`).join(String(value ?? ""));
 return out;
}
function link(doc, text, url) {
 const a = element(doc,"a",text);
 const parsed = new URL(url);
 if (!(parsed.protocol === "https:" && ["altaraapp.com","www.altaraapp.com"].includes(parsed.hostname)) && parsed.protocol !== "mailto:") throw new Error("Unsafe policy URL");
 a.href = parsed.href; a.target = "_blank"; a.rel = "noopener noreferrer"; return a;
}
function controls(doc, host, requirements, existing = {}, translate = null, { draft = false } = {}) {
 host.replaceChildren();
 const field = (label, input) => { const row=element(doc,"label",label); row.append(input); host.append(row); return input; };
 const region = field(tx(translate,"privacy.country.label","Country of residence"), element(doc,"select")); region.name="legal_region";
 region.append(new Option(tx(translate,"privacy.country.choose","Choose a country"), ""));
 let names; try { names=new Intl.DisplayNames([doc.documentElement.lang || "en"],{type:"region"}); } catch (_) {}
 for (const code of requirements.countries || []) region.append(new Option(names?.of(code) || code,code));
 region.value=existing.legal_region || ""; region.disabled=!draft && (!!existing.legal_region || existing.br_required === true);
 if (existing.br_required && !region.value) region.value="BR";
 const br = element(doc,"div",null,"accountPrivacy");
 const birth = element(doc,"input"); birth.type="date"; birth.name="dob"; birth.autocomplete="bday"; birth.value=existing.dob || "";
 birth.readOnly=!draft && !!existing.dob;
 const birthLabel=element(doc,"label",tx(translate,"privacy.dob.label","Date of birth")); birthLabel.append(birth); br.append(birthLabel);
 br.append(element(doc,"p",tx(translate,"privacy.dob.hint","This is your age declaration, not verified age. Your date of birth is private."),"policyHint"));
 function check(text, documentType) {
  const row=element(doc,"label",null,"policyCheck"),box=element(doc,"input"); box.type="checkbox";
  const description=element(doc,"span",text+" "), item=requirements.documents?.[documentType];
  if(item?.url) description.append(link(doc,documentType==="terms"?tx(translate,"privacy.terms.label","Terms of Service"):tx(translate,"privacy.privacy.label","Privacy Policy"),item.url));
  else { description.append(element(doc,"span",tx(translate,"privacy.document.unavailable","Document unavailable"))); box.disabled=true; }
  row.append(box,description); br.append(row); return box;
 }
 const terms=check(tx(translate,"privacy.terms.intent","I accept the"),"terms");
 const privacy=check(tx(translate,"privacy.privacy.intent","I have read and acknowledge the"),"privacy");
 terms.checked=existing.terms_accepted === true && (!draft || existing.terms_version === requirements.documents?.terms?.version);
 privacy.checked=existing.privacy_acknowledged === true && (!draft || existing.privacy_version === requirements.documents?.privacy?.version);
 br.append(element(doc,"p",tx(translate,"privacy.ack.hint","Acknowledging the Privacy Policy is not consent to every use of your personal data."),"policyHint"));
 host.append(br);
 const sync=()=>{br.hidden=region.value!=="BR";}; region.addEventListener("change",sync); sync();
 return {
  read: () => ({
   legal_region: region.value,
   ...(region.value==="BR" ? {dob:birth.value,terms_accepted:terms.checked,privacy_acknowledged:privacy.checked,
    terms_version:requirements.documents?.terms?.version,privacy_version:requirements.documents?.privacy?.version}:{}),
   locale: doc.documentElement.lang || "en",
  }),
  clear: () => {birth.value="";terms.checked=false;privacy.checked=false;},
 };
}
export async function mountSignupPrivacy(client, host, { document:doc=globalThis.document, t:translate=null }={}) {
 if(!host || !client.enabled) return { prepare:async()=>({}), clear:()=>{} };
 stylesheet(doc);
 let form=null, requirements=null;
 async function refresh({ preserveDraft = false } = {}) {
  const draft=preserveDraft && form ? form.read() : {};
  requirements=await client.requirements();
  host.hidden=requirements.status==="rollout_off";
  if(host.hidden) return;
  host.classList.add("accountPrivacy");
  if(requirements.status!=="available") {
   host.replaceChildren(element(doc,"p",policyMessage("policy_unavailable",translate),"policyFeedback"));
   return;
  }
  form=controls(doc,host,requirements,draft,translate,{draft:true});
 }
 await refresh();
 return {
  async prepare(email) {
   if(requirements?.status==="rollout_off") return {};
   if(requirements?.status!=="available" || !form) { await refresh(); throw new Error(policyMessage("policy_unavailable",translate)); }
   const declaration={...form.read(),email};
   const result=await client.prepareSignup(declaration);
   if(result.status!=="prepared") {
    if(result.status==="outdated_policy_acceptance") await refresh();
    throw new Error(policyMessage(result.status,translate));
   }
   return signupPolicyMetadata(result);
  },
  clear:()=>form?.clear(),
  refresh:()=>refresh({ preserveDraft:true }),
 };
}
const accountGates=new WeakMap();
const needsGate=client=>client.gateRequired ?? client.enabled;
export function ensureAccountPolicy(client, options={}) {
 // Boot, invite recovery and polling all share the existing dialog.
 if(accountGates.has(client)) return accountGates.get(client);
 const work=runAccountPolicyGate(client,options);
 accountGates.set(client,work);
 void work.then(()=>{if(accountGates.get(client)===work)accountGates.delete(client);},()=>{if(accountGates.get(client)===work)accountGates.delete(client);});
 return work;
}
async function runAccountPolicyGate(client, { document:doc=globalThis.document, onLogout, t:translate=null, onStatus=null }={}) {
 if(!needsGate(client)) return true;
 let status=await client.refresh();
 if(!needsGate(client)) return true;
 try { onStatus?.({ phase:"evaluated", status, required:!policyAllowsProduct(status) }); } catch (_) {}
 if(policyAllowsProduct(status) && client.isCurrent(status)) return true;
 try { onStatus?.({ phase:"required", status, required:true }); } catch (_) {}
 stylesheet(doc);
 const dialog=element(doc,"dialog",null,"accountPrivacyDialog");
 const content=element(doc,"div",null,"accountPrivacy");
 content.append(element(doc,"h2",tx(translate,"privacy.gate.title","Complete your account information")));
 const formHost=element(doc,"div",null,"accountPrivacy"),feedback=element(doc,"p",null,"policyFeedback");
 feedback.setAttribute("role","status"); feedback.setAttribute("aria-live","polite");
 const actions=element(doc,"div",null,"policyActions"),save=element(doc,"button",tx(translate,"privacy.action.continue","Continue"),"btn primary"),retry=element(doc,"button",tx(translate,"privacy.action.retry","Retry"),"btn");
 const signOut=element(doc,"button",tx(translate,"privacy.action.logout","Log out"),"btn"); actions.append(save,retry,signOut);
 const rights=element(doc,"section",null,"accountPrivacy");
 rights.setAttribute("aria-label",tx(translate,"privacy.requests.aria","Privacy requests"));
 content.append(formHost,feedback,actions,rights,link(doc,tx(translate,"privacy.support","Privacy and support"),"mailto:support@altaraapp.com"),
  link(doc,tx(translate,"privacy.public_terms","Public Terms"),"https://www.altaraapp.com/terms"),link(doc,tx(translate,"privacy.public_policy","Public Privacy Policy"),"https://www.altaraapp.com/privacy"));
 dialog.append(content); doc.body.append(dialog);
 dialog.addEventListener("cancel",event=>event.preventDefault());
 dialog.showModal();
 let form=null, settle, terminal=false, renderEpoch=0; const done=new Promise(resolve=>{settle=resolve;});
 const stopInvalidation=client.onInvalidate?.((event)=>{
  if(terminal) return;
  renderEpoch++;
  form=null;formHost.replaceChildren();rights.replaceChildren();save.disabled=true;
  status={status:"policy_unavailable",requires_completion:true};feedback.textContent=policyMessage(status.status,translate);
  if(event?.reason==="canary") {
   if(!needsGate(client)) {finish(true,"dismissed");return;}
   void reevaluate(false);
  } else if(event?.reason==="identity") finish(false);
 });
 function finish(value,phase="completed") {
  if(terminal) return;
  if(value===true) { try { onStatus?.({ phase, status, required:false }); } catch (_) {} }
  terminal=true;stopInvalidation?.();dialog.close();dialog.remove();settle(value);
 }
 function renderRights() {
  rights.replaceChildren(element(doc,"p",tx(translate,"privacy.rights.gate_hint","You can request your data or account deletion while completing this step. These requests require processing; they do not generate a download or delete your account."),"policyHint"));
  for(const [kind,label] of [["export",tx(translate,"privacy.request.export","Request my data")],["deletion",tx(translate,"privacy.request.deletion","Request account deletion")]]) {
   const button=element(doc,"button",label,"btn");let key=null;
   rights.append(button);
   button.addEventListener("click",async()=>{
    if(terminal)return;
    button.disabled=true;key ||= globalThis.crypto.randomUUID();
    const result=await client.request(kind,key);
    if(terminal)return;
    status=await client.refresh();
    if(terminal)return;
    // Rights actions never dismiss the completion gate.
    renderRights();feedback.textContent=policyMessage(result.status,translate);
   });
  }
  if(!client.isCurrent(status))return;
  for(const request of status.requests || []) {
   const row=element(doc,"div",null,"policyRequest");
   const label={requested:tx(translate,"privacy.request.status.requested","Awaiting processing"),in_progress:tx(translate,"privacy.request.status.in_progress","Being processed"),cancelled:tx(translate,"privacy.request.status.cancelled","Cancelled"),fulfilled:tx(translate,"privacy.request.status.fulfilled","Fulfilled by support"),rejected:tx(translate,"privacy.request.status.rejected","Not fulfilled — contact support")}[request.status] || tx(translate,"privacy.request.status.unknown","Contact support");
   row.append(element(doc,"p",(request.kind==="export"?tx(translate,"privacy.request.export_name","Data request"):tx(translate,"privacy.request.deletion_name","Account deletion request"))+" · "+label));
   if(request.status==="requested") {
    const cancel=element(doc,"button",tx(translate,"privacy.request.cancel","Cancel request"),"btn");row.append(cancel);
    cancel.addEventListener("click",async()=>{
     if(terminal)return;
     cancel.disabled=true;const result=await client.cancel(request.id);
     if(terminal)return;
     status=await client.refresh();if(terminal)return;
     renderRights();feedback.textContent=policyMessage(result.status,translate);
    });
   }
   rights.append(row);
  }
 }
 async function render() {
  if(terminal) return;
  if(!needsGate(client)) {finish(true,"dismissed");return;}
  const epoch=++renderEpoch;
  const requirements=await client.requirements();
  if(terminal || epoch!==renderEpoch) return;
  if(!needsGate(client)) {finish(true,"dismissed");return;}
  if(!client.isCurrent(status)) status={status:"policy_unavailable",requires_completion:true};
  if(policyAllowsProduct(status)) {finish(true);return;}
  feedback.textContent=policyMessage(status.status,translate);
  renderRights();
  if(requirements.status==="available" && !["region_conflict","canary_paused","canary_removed","campaign_paused","no_longer_authorized","canary_voice_pending","client_update_required","policy_unavailable"].includes(status.status)) {form=controls(doc,formHost,requirements,status,translate);save.disabled=false;}
  else { form=null;formHost.replaceChildren();save.disabled=true; }
 }
 async function reevaluate(discover=true) {
  const epoch=++renderEpoch;
  const next=await client.refresh({discover});
  if(terminal || epoch!==renderEpoch) return;
  status=next;await render();
 }
 save.addEventListener("click",async()=>{
  if(!form || terminal) return;
  save.disabled=true;
  const result=await client.complete(form.read());
  if(terminal) return;
  // Fetch authoritative state again. A completion response alone never dismisses the gate.
  status=await client.refresh();
  if(terminal) return;
  await render();
  if(!terminal && !policyAllowsProduct(status) && result.status!=="policy_unavailable") feedback.textContent=policyMessage(result.status,translate);
 });
 retry.addEventListener("click",async()=>{if(!terminal)await reevaluate();});
 signOut.addEventListener("click",async()=>{finish(false);client.clear();await onLogout?.();});
 await render(); return done;
}
const centerSubscriptions=new WeakMap();
const centerEpochs=new WeakMap();
export async function renderAccountPrivacyCenter(client, host, { document:doc=globalThis.document,onActivityChange,onSecurity,t:translate=null }={}) {
 if(!client.enabled || !host) return;
 const epoch=(centerEpochs.get(host)||0)+1;centerEpochs.set(host,epoch);
 stylesheet(doc); host.classList.add("accountPrivacy");
 host.replaceChildren(element(doc,"h3",tx(translate,"privacy.center.title","Privacy and your data")));
 centerSubscriptions.get(host)?.();
 centerSubscriptions.set(host,client.onInvalidate?.((event)=>{
  centerEpochs.set(host,(centerEpochs.get(host)||0)+1);
  host.replaceChildren(element(doc,"p",policyMessage("policy_unavailable",translate)));
  if(event?.reason==="canary" && client.enabled) queueMicrotask(()=>{
   void renderAccountPrivacyCenter(client,host,{document:doc,onActivityChange,onSecurity,t:translate});
  });
 }));
 const status=await client.refresh(), req=await client.requirements();
 if(centerEpochs.get(host)!==epoch) return;
 if(!client.isCurrent(status)) {host.append(element(doc,"p",policyMessage("policy_unavailable",translate)));return;}
 const fields=element(doc,"div",null,"accountPrivacy");
 const feedback=element(doc,"p",null,"policyFeedback");feedback.setAttribute("role","status");
 host.append(element(doc,"p",tx(translate,"privacy.center.hint","Review your account information and request a copy of your personal data or account deletion."),"policyHint"));
 host.append(element(doc,"p",tx(translate,"privacy.center.declared_country","Declared country of residence: {country}",{country:status.declared_country || status.legal_region || tx(translate,"privacy.center.not_declared","Not declared")})));
 if(status.policy_region_source) host.append(element(doc,"p",status.policy_region_source==="operator" ? tx(translate,"privacy.center.policy_country","Account policy country: {country}",{country:status.policy_region}) : tx(translate,"privacy.center.policy_country_pending","Account policy country still needs confirmation."),"policyHint"));
 const ageText=status.age_assurance==="verified"?tx(translate,"privacy.center.age_verified","Verified by an age-assurance process"):status.age_assurance==="self_declared"?tx(translate,"privacy.center.age_self_declared","Self-declared; not verified"):tx(translate,"privacy.center.age_unknown","Not declared");
 host.append(element(doc,"p",tx(translate,"privacy.center.age","Age information: {status}",{status:ageText})));
 for(const receipt of status.receipts || []) host.append(element(doc,"p",receipt.document_type==="terms"?tx(translate,"privacy.center.terms_receipt","Terms accepted: {version} · {date}",{version:receipt.version,date:String(receipt.recorded_at).slice(0,10)}):tx(translate,"privacy.center.privacy_receipt","Privacy acknowledged: {version} · {date}",{version:receipt.version,date:String(receipt.recorded_at).slice(0,10)}),"policyHint"));
 if(req.status==="available" && !["canary_paused","canary_removed","campaign_paused","no_longer_authorized","canary_voice_pending","client_update_required"].includes(status.status)) {
  const form=controls(doc,fields,req,status,translate),save=element(doc,"button",tx(translate,"privacy.center.save","Save account information"),"btn");
  fields.append(save);host.append(fields);
  save.addEventListener("click",async()=>{save.disabled=true;const result=await client.complete(form.read());
   await renderAccountPrivacyCenter(client,host,{document:doc,onActivityChange,onSecurity,t:translate});const out=host.querySelector('[role="status"]');if(out)out.textContent=policyMessage(result.status,translate);});
 }
 if(status.minor_activity_protected) {
  const activityLabel=element(doc,"label",null,"policyCheck"),toggle=element(doc,"input");toggle.type="checkbox";toggle.checked=status.activity_enabled===true;
  toggle.disabled=!status.activity_opt_in_allowed;
  activityLabel.append(toggle,element(doc,"span",tx(translate,"privacy.center.activity","Share game and listening activity")));
  host.append(activityLabel,element(doc,"p",status.activity_opt_in_allowed?tx(translate,"privacy.center.activity_allowed","Off by default. Turn on only if you choose."):tx(translate,"privacy.center.activity_off","Activity sharing is currently off for this account."),"policyHint"));
  toggle.addEventListener("change",async()=>{const result=await client.setActivity(toggle.checked);
   if(result.status==="eligible" && client.isCurrent(result)) onActivityChange?.(result.activity_enabled===true);else feedback.textContent=policyMessage(result.status,translate);
   await renderAccountPrivacyCenter(client,host,{document:doc,onActivityChange,onSecurity,t:translate});});
 }
 const actions=element(doc,"div",null,"policyActions");
 for(const [kind,label] of [["export",tx(translate,"privacy.request.export","Request my data")],["deletion",tx(translate,"privacy.request.deletion","Request account deletion")]]) {
  const btn=element(doc,"button",label,"btn");actions.append(btn);
  let requestKey=null;
  btn.addEventListener("click",async()=>{
   btn.disabled=true;requestKey ||= globalThis.crypto.randomUUID();
   const result=await client.request(kind,requestKey);
   await renderAccountPrivacyCenter(client,host,{document:doc,onActivityChange,onSecurity,t:translate});
   const out=host.querySelector('[role="status"]'); if(out) out.textContent=policyMessage(result.status,translate);
  });
 }
 host.append(actions,element(doc,"p",tx(translate,"privacy.center.requests_hint","These are requests for our support team. No download is generated and your account is not deleted by submitting a request."),"policyHint"));
 for(const request of status.requests || []) {
  const row=element(doc,"div",null,"policyRequest");
  const label={requested:tx(translate,"privacy.request.status.requested","Awaiting processing"),in_progress:tx(translate,"privacy.request.status.in_progress","Being processed"),cancelled:tx(translate,"privacy.request.status.cancelled","Cancelled"),fulfilled:tx(translate,"privacy.request.status.fulfilled","Fulfilled by support"),rejected:tx(translate,"privacy.request.status.rejected","Not fulfilled — contact support")}[request.status] || tx(translate,"privacy.request.status.unknown","Contact support");
  row.append(element(doc,"p",(request.kind==="export"?tx(translate,"privacy.request.export_name","Data request"):tx(translate,"privacy.request.deletion_name","Account deletion request"))+" · "+label));
  if(request.status==="requested") {
   const cancel=element(doc,"button",tx(translate,"privacy.request.cancel","Cancel request"),"btn");row.append(cancel);
   cancel.addEventListener("click",async()=>{cancel.disabled=true;await client.cancel(request.id);await renderAccountPrivacyCenter(client,host,{document:doc,onActivityChange,onSecurity,t:translate});});
  }
  host.append(row);
 }
 if(["policy_unavailable","canary_paused","canary_removed","campaign_paused","no_longer_authorized","canary_voice_pending","client_update_required"].includes(status.status)) feedback.textContent=policyMessage(status.status,translate);
 if(onSecurity) { const security=element(doc,"button",tx(translate,"privacy.center.security","Email, password and security controls"),"btn");security.addEventListener("click",onSecurity);host.append(security); }
 host.append(feedback,link(doc,tx(translate,"privacy.support","Privacy and support"),"mailto:support@altaraapp.com"));
 host.append(link(doc,tx(translate,"privacy.public_terms","Public Terms"),"https://www.altaraapp.com/terms"),link(doc,tx(translate,"privacy.public_policy","Public Privacy Policy"),"https://www.altaraapp.com/privacy"));
}
