import {dimensions, MODEL_ID, RUBRIC_VERSION, validateRatings, makePrompt, toCSV} from './rubric.js';

const $ = id => document.getElementById(id);
let engine, record, busy = false;
const sampleEmail = `Hi Jordan,\n\nI'm sorry the revised proposal didn't reach you before yesterday's meeting. I missed the final handoff, and I take responsibility for the delay. I understand this put your team in a difficult position.\n\nI'll send the corrected proposal by 2 p.m. today, with the pricing changes highlighted. I'll also set up a shared checklist with Maya so future revisions have a clear owner and deadline. Could we have a quick call tomorrow at 10 a.m. to confirm everything is in order?\n\nI've been feeling stretched this week, but I should have flagged the delay sooner. Thank you for your patience. I value our partnership and want to earn back your confidence.\n\nBest,\nAlex`;
const sampleContext = 'A revised proposal was due before yesterday’s client meeting. It did not arrive. The client needs the corrected pricing and a plan to prevent another missed handoff.';

function status(message, error=false) { $('status').textContent = message; $('status').classList.toggle('error',error); }
function countWords(){ const text = $('email').value.trim(); $('word-count').textContent = `${text ? text.split(/\s+/).length : 0} words`; }
function discardRecord(){record = undefined; $('results').hidden = true; $('empty-state').hidden = false; $('result-badge').textContent='AWAITING INPUT'; $('result-badge').classList.remove('active');}
for (const id of ['email','context','study-id']) $(id).addEventListener('input',()=>{ countWords(); if(record){discardRecord();status('Input changed. Evaluate again to create a matching record.');} });
$('mode').addEventListener('change',()=>{
  $('mode-help').textContent = $('mode').value === 'local' ? 'Runs locally with WebGPU. First use downloads a model (about 1 GB); allow around 2 GB of GPU memory. No account or API key.' : 'Rate each dimension using the shared rubric. Add your reasoning and export the completed record. No model download or internet needed after the site loads.';
});

function setBusy(value) {
  busy=value;
  for(const id of ['analyze','sample','clear','mode','email','context','study-id']) $(id).disabled=value;
  $('analyze').textContent=value ? 'Evaluating…' : '✧  Evaluate email  →';
  $('progress').hidden = !value;
  if(!value) $('progress').value=0;
}

function newRecord(method, ratings, model=null) {
  return {studyId:$('study-id').value.trim(),evaluatedAt:new Date().toISOString(),rubricVersion:RUBRIC_VERSION,method,model,ratings};
}

function textNode(tag,text,className) {const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}

function renderRatings() {
  $('empty-state').hidden=true; $('results').hidden=false;
  $('result-badge').textContent=record.method==='example' ? 'ILLUSTRATIVE EXAMPLE' : record.method==='manual' ? 'MANUAL REVIEW' : 'AI DRAFT · REVIEW';
  $('result-badge').classList.add('active');
  const scored = record.ratings.filter(r=>r.score!==null).length;
  $('result-summary').textContent = `${scored} of 10 dimensions rated${record.studyId ? ' · '+record.studyId : ''}. ${record.method==='example' ? 'These are hand-written example ratings, not AI output.' : record.method==='local-ai' ? 'Drafted on this device. Check every judgment against the email.' : 'Apply the rubric and record your judgments below.'}`;
  $('rating-list').replaceChildren();
  record.ratings.forEach((r,index)=>{
    const d=dimensions[index];
    const detail=document.createElement('details');detail.className='rating';
    const summary=document.createElement('summary');
    const title=textNode('span','', 'rating-title');title.append(textNode('small',String(index+1).padStart(2,'0')),document.createTextNode(d.name));
    const visual=textNode('span','', 'rating-visual');const dots=textNode('span','', 'dots');dots.setAttribute('aria-hidden','true');
    for(let i=1;i<=5;i++) dots.append(textNode('i','', i<=r.score ? 'on' : ''));
    const score=textNode('span',r.score===null?'N/A':`${r.score}/5`,'score');visual.append(dots,score,textNode('span','⌄','chevron'));summary.append(title,visual);
    const body=textNode('div','','rating-body');body.append(textNode('p',d.description));
    const selectId=`score-${d.id}`, notesId=`notes-${d.id}`;
    const label=textNode('label','Rating');label.htmlFor=selectId;
    const select=document.createElement('select');select.id=selectId;
    [['','Not enough information'],...d.anchors.map((a,i)=>[String(i+1),`${i+1} — ${a}`])].forEach(([value,label])=>{const o=textNode('option',label);o.value=value;select.append(o);});
    select.value=r.score===null?'':String(r.score);
    select.addEventListener('change',()=>{r.score=select.value ? Number(select.value) : null;r.reviewed=true;renderRatings();const reopened=$(`score-${d.id}`);reopened.closest('details').open=true;reopened.focus();});
    const notesLabel=textNode('label','Rationale / reviewer notes');notesLabel.htmlFor=notesId;
    const notes=document.createElement('textarea');notes.id=notesId;notes.value=r.rationale;notes.maxLength=4000;notes.addEventListener('input',()=>{r.rationale=notes.value;r.reviewed=true;});
    body.append(label,select,notesLabel,notes);
    if(r.evidence)body.append(textNode('blockquote',`“${r.evidence}”`));
    const reviewLabel=textNode('label','');const check=document.createElement('input');check.type='checkbox';check.checked=r.reviewed;check.style.width='auto';check.style.margin='12px 7px 0 0';check.addEventListener('change',()=>{r.reviewed=check.checked;});reviewLabel.append(check,document.createTextNode('Reviewed by a human'));body.append(reviewLabel);
    detail.append(summary,body);$('rating-list').append(detail);
  });
}

$('analyze').addEventListener('click',async()=>{
  if(busy)return;
  const email=$('email').value.trim(),context=$('context').value.trim();
  if(!email){status('Paste an email before evaluating.',true);$('email').focus();return;}
  if($('mode').value==='manual'){
    record=newRecord('manual',dimensions.map(d=>({id:d.id,score:null,rationale:'',evidence:'',reviewed:false})));renderRatings();status('Manual review is ready. Open each dimension to select a score and add notes.');return;
  }
  if(!navigator.gpu){status('On-device AI needs WebGPU in a supported browser, such as recent desktop Chrome or Edge. Choose Manual review to continue here.',true);return;}
  // Keep the small model within its context window and protect limited GPU memory.
  if(email.length+context.length>3000){status('For on-device AI, keep the combined email and issue under 3,000 characters. Manual review supports the full input.',true);return;}
  discardRecord();setBusy(true);
  try {
    if(!engine){
      status('Checking WebGPU and downloading the local model. First load can take several minutes…');
      const adapter=await navigator.gpu.requestAdapter();
      if(!adapter)throw new Error('No compatible GPU is available. Select Manual review to continue.');
      const {CreateMLCEngine} = await import('https://esm.run/@mlc-ai/web-llm@0.2.80');
      engine=await CreateMLCEngine(MODEL_ID,{initProgressCallback: report=>{status(report.text);$('progress').value=Math.max(0,Math.min(1,report.progress || 0));}},{context_window_size:4096});
    }
    status('Reading the email on this device. Keep this tab open…');$('progress').removeAttribute('value');
    const response=await engine.chat.completions.create({messages:makePrompt(email,context),temperature:0,seed:42,max_tokens:1600,response_format:{type:'json_object'}});
    const content=response.choices?.[0]?.message?.content;
    if(!content)throw new Error('The model returned an empty response. Retry or choose Manual review.');
    let parsed;
    try {parsed=JSON.parse(content);} catch {throw new Error('The model did not finish a valid rating record. Retry or choose Manual review.');}
    const ratings=validateRatings(parsed,email,context);
    record=newRecord('local-ai',ratings,MODEL_ID);renderRatings();status('Evaluation complete. Review scores and explanations before using them in your study.');
    await engine.resetChat();
  }catch(error){
    console.warn('Local evaluation failed:',error.name);
    status(`${error.message || 'Local AI could not start.'} Your email is still here. Manual review is available without a download.`,true);
    if(engine){try{await engine.unload();}catch{}engine=undefined;}
  }finally{setBusy(false);}
});

$('sample').addEventListener('click',()=>{
  $('email').value=sampleEmail;$('context').value=sampleContext;$('study-id').value='EXAMPLE-001';countWords();
  const scores=[5,4,null,1,5,5,5,4,2,4];
  const rationales=[
    'A coherent business response with a greeting, explanation, actions, and sign-off.',
    'Tailored corrective steps and acknowledgment of the client’s difficulty show visible engagement. Actual effort cannot be measured.',
    'There is no direct evidence of authorship. Polished language is insufficient to establish AI use.',
    'The email provides almost no basis for deciding whether AI was involved.',
    'The writer explicitly owns the missed handoff and describes prevention and follow-through.',
    'The response includes named ownership, a delivery time, highlighted changes, and a proposed call.',
    'The writer acknowledges the impact, values the partnership, and proposes steps to restore trust.',
    'The wording is courteous, considerate, and acknowledges the recipient’s inconvenience.',
    'The writer discloses feeling stretched, without describing severe stress.',
    'The plan addresses delivery and prevention. Completion and client acceptance are not yet established.'
  ];
  const evidence=['Hi Jordan,','with the pricing changes highlighted.','','','I take responsibility for the delay.',"I'll send the corrected proposal by 2 p.m. today",'I value our partnership and want to earn back your confidence.','Thank you for your patience.',"I've been feeling stretched this week",'future revisions have a clear owner and deadline.'];
  record=newRecord('example',dimensions.map((d,i)=>({id:d.id,score:scores[i],rationale:rationales[i],evidence:evidence[i],reviewed:false})));
  renderRatings();status('Example loaded with illustrative human-written ratings. Paste your own email to begin a new evaluation.');
});
$('clear').addEventListener('click',()=>{for(const id of ['email','context','study-id'])$(id).value='';discardRecord();countWords();status('Cleared. Email text and ratings are not saved by this site.');$('email').focus();});

function download(kind){
  if(!record)return;
  const content=kind==='csv'?toCSV(record):JSON.stringify(record,null,2);
  const blob=new Blob([content],{type:kind==='csv'?'text/csv;charset=utf-8':'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`correspond-${record.studyId.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,50)||'email'}-${record.evaluatedAt.slice(0,10)}.${kind}`;
  a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('export-csv').addEventListener('click',()=>download('csv'));
$('export-json').addEventListener('click',()=>download('json'));

for(const d of dimensions){
  const section=textNode('section','','rubric-dimension');section.append(textNode('h3',d.name),textNode('p',d.description));const list=document.createElement('ol');d.anchors.forEach(a=>list.append(textNode('li',a)));section.append(list);$('rubric-content').append(section);
}
$('rubric-open').addEventListener('click',()=>$('rubric-dialog').showModal());
$('rubric-close').addEventListener('click',()=>$('rubric-dialog').close());
