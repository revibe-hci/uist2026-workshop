import {copy, emptySlot, newDraft, insertSlot, removeSlot, generationIndices} from './core.mjs';
import {SketchCanvas} from './canvas.mjs';
import {upgradeDraft,trackView,invalidateScores,applyScores,recordPlannedRange} from './tracks.mjs';
import {loadSavedWorkspace,saveWorkspace} from './storage.mjs';
import {CastControls} from './cast.mjs';
import {HologramSpace} from './space.mjs';
import {setPointTargets} from './space-math.mjs';
import {ensureRelationship,relationshipView,allArcTracks} from './relationship-state.mjs';
import {RelationshipControls} from './relationships.mjs';

const $ = id => document.getElementById(id);
const KEY = 'talebrush.reconstruction.v1';
let state = upgradeDraft(newDraft()), history = [], undo = [], busy = false, recognizing = false, revision = 0;
let tool = 'pen', hover = null, historyOpen = false, preview = null, connected = false, pendingGeneration = null;
let recognitionTimer, loadingTimer, saveFailure = false, inputUndoAt = 0;

let browserStorage;try{browserStorage=localStorage;}catch{}
const loaded=loadSavedWorkspace(browserStorage,KEY),migrationError=loaded.error;
if(loaded.workspace){state=loaded.workspace.draft;history=loaded.workspace.history.slice(-50);}

function save(){
  try{
    if(!saveWorkspace(browserStorage,KEY,{draft:state,history},loaded.writable)){$('autosave').textContent='Saving paused';return;}
    $('autosave').textContent='Saved locally';saveFailure=false;
  }
  catch{$('autosave').textContent='Save unavailable';if(!saveFailure){showError('Browser storage is unavailable or full. Keep this tab open and export your story to save it.');saveFailure=true;}}
}
function pushUndo(){undo.push(copy(state));if(undo.length>35)undo.shift();$('undo-button').disabled=busy||!undo.length;}
function changed(){
  if(pendingGeneration){pendingGeneration=null;message('Queued generation canceled because the draft changed. Sketch again when you are ready.');}
  revision++;save();
}
function message(text,loading=false){$('status-text').textContent=text;$('status').classList.toggle('loading',loading);}
function showError(text){$('error').textContent=text;$('error').hidden=false;}
function clearError(){$('error').hidden=true;$('error').textContent='';}
function snapshot(label){history.push({id:crypto.randomUUID(),label,date:new Date().toISOString(),draft:copy(state)});if(history.length>50)history.shift();}
function adjustHeight(textarea){textarea.style.height='auto';textarea.style.height=`${Math.max(26,textarea.scrollHeight)}px`;}
function focusSlot(i,position=0){const textarea=$('sentence-editor').querySelector(`[data-index="${i}"] textarea`);if(textarea){textarea.focus();textarea.setSelectionRange(position,position);textarea.scrollIntoView({block:'nearest',behavior:'smooth'});}}

async function api(path,body){
  let response;
  try{response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
  catch{throw new Error('Cannot reach the TaleBrush server. Restart python3 server.py, then try again.');}
  let data;try{data=await response.json();}catch{throw new Error('The server returned an unreadable response. Your draft is safe.');}
  if(!response.ok)throw new Error(data.error||'The request failed. Your draft is safe.');return data;
}

const fortuneCanvas=new SketchCanvas($('fortune-canvas'),{onBegin:pushUndo,onCommit:commitStroke,onHover:setHover,onFocus:focusSlot});
const surpriseCanvas=new SketchCanvas($('surprise-canvas'),{kind:'surprise',onBegin:pushUndo,onCommit:commitStroke,onHover:setHover});
const relationshipCanvas=new SketchCanvas($('relationship-canvas'),{onBegin:pushUndo,onCommit:commitStroke,onHover:setHover,onFocus:focusSlot});
function selectRelationship(from,to,type){
  if(busy||preview)return;ensureRelationship(state,from,to,type);state.activeCharacterId=from;state.viewMode='relationships';save();render();
  message('This direction has its own curve. Sketch the relationship, or swap the arrow to edit how the other character feels.');
}
const relationshipControls=new RelationshipControls({onSelect:selectRelationship,onSentence(index){if(busy||preview)return;state.relationshipSentence=index;save();renderCanvases();},onTool:selectTool});
const castControls=new CastControls({
  onSelect(characterId,dimensionId,selection='dimension'){
    if(busy||preview)return;state.activeCharacterId=characterId;state.activeDimensionId=dimensionId;hover=null;
    if(selection==='curve'||(state.viewMode==='relationships'&&selection!=='character'))state.viewMode='curves';
    if(state.viewMode==='relationships'&&state.characters.length>=2){const edge=state.relationshipTracks?.[state.activeRelationshipKey];ensureRelationship(state,characterId,edge?.targetCharacterId!==characterId&&state.characters.some(c=>c.id===edge?.targetCharacterId)?edge.targetCharacterId:state.characters.find(c=>c.id!==characterId).id,edge?.dimensionId||'trust');}
    save();render();
    const view=trackView(state);message(`${view.character.name} · ${view.dimension.name}. Sketch this curve; generation considers every drawn curve. Analyze arcs to recognize it in existing text.`);
  },
  onChange(mutate){
    if(busy||preview)throw new Error('Wait until generation or history preview is finished.');
    const before=copy(state);pushUndo();
    try{mutate(state);changed();render();}catch(error){state=before;undo.pop();render();throw error;}
  },
  onNotice:message,onRelationship:selectRelationship,
});
const storySpace=new HologramSpace({
  onBegin:pushUndo,
  onUpdate(index,values){if(!busy&&!preview)setPointTargets(state,index,values);},
  onCommit(indices){
    if(busy||preview)return;state.autoGenerate=false;recordPlannedRange(state,indices);changed();render();
    message('Spatial targets saved. Edit other points or dimensions, then Generate Again to apply the planned changes.');
  },
  onSentence(index){if(busy||preview)return;state.spaceSentence=index;save();renderCanvases();},
  onAxes(axes){if(busy||preview)return;state.spaceAxes=axes;save();renderCanvases();},
  onClear(index){
    if(busy||preview)return;pushUndo();for(const track of Object.values(state.tracks))if(track.characterId===state.activeCharacterId)track.controls[index]=null;
    state.autoGenerate=false;recordPlannedRange(state,[index]);changed();render();message('This character’s point targets cleared. Other characters’ targets remain in effect.');
  },
});

function renderCanvases(){
  const shown=preview||state,key=`${shown.activeCharacterId}:${shown.activeDimensionId}`;
  const overlays=historyOpen?history.filter(h=>h.draft.tracks[key]).map(h=>({...h,draft:trackView(h.draft,shown.activeCharacterId,shown.activeDimensionId)})):[];
  fortuneCanvas.setState(trackView(state),{history:overlays,preview:preview?trackView(preview):null,hover,busy,tool});
  surpriseCanvas.setState(state,{preview,hover,busy,tool});
  storySpace.setState(shown,{disabled:busy||!!preview});
  relationshipControls.render(shown,{disabled:busy||!!preview,tool});
  const relationship=relationshipView(shown);
  if(relationship){
    const key=shown.activeRelationshipKey,comparison=historyOpen?history.filter(h=>h.draft.relationshipTracks?.[key]).map(h=>({...h,draft:relationshipView(h.draft,key)})):[];
    relationshipCanvas.setState(relationship,{history:comparison,preview:preview?relationship:null,hover,busy,tool});
  }
}
function setHover(i){
  if(hover===i)return;hover=i;
  $('sentence-editor').querySelectorAll('.sentence-row').forEach(row=>row.classList.toggle('highlighted',Number(row.dataset.index)===i));
  fortuneCanvas.setHover(i);surpriseCanvas.setHover(i);
  if(relationshipCanvas.state)relationshipCanvas.setHover(i);
}
function renderEditor(){
  const shown=preview||state;
  $('story-title').value=shown.title;
  $('story-title').disabled=busy||!!preview;
  document.querySelector('.editor-panel').classList.toggle('history-preview',!!preview);
  $('sentence-editor').replaceChildren();
  shown.slots.forEach((slot,i)=>{
    const row=document.createElement('div');row.className=`sentence-row ${slot.source==='ai'?'ai':'author'}`;row.dataset.index=i;
    row.classList.toggle('highlighted',i===hover);
    const number=document.createElement('span');number.className='row-number';number.textContent=String(i+1).padStart(2,'0');number.setAttribute('aria-hidden','true');
    const textarea=document.createElement('textarea');textarea.rows=1;textarea.value=slot.text;textarea.maxLength=4000;textarea.spellcheck=true;
    textarea.setAttribute('aria-label',`Sentence ${i+1}${slot.source==='ai'?', AI generated':''}`);textarea.disabled=busy||!!preview;
    textarea.placeholder=i===0?'Begin your story…':i===shown.slots.findIndex(s=>!s.text.trim())?'A little space for what comes next…':'…';
    textarea.addEventListener('input',()=>{
      if(Date.now()-inputUndoAt>1500){pushUndo();inputUndoAt=Date.now();}
      state.slots[i].text=textarea.value;state.slots[i].source='human';invalidateScores(state,i);textarea.setAttribute('aria-label',`Sentence ${i+1}`);
      row.classList.remove('ai');row.classList.add('author');adjustHeight(textarea);changed();renderCanvases();updateSentenceCount();queueRecognition();
    });
    textarea.addEventListener('keydown',e=>{
      if(e.isComposing)return;
      if(e.key==='Enter'&&!e.shiftKey){
        e.preventDefault();if(state.slots.length>=30){message('This short-story canvas supports up to 30 sentences.');return;}
        pushUndo();const position=textarea.selectionStart,end=textarea.selectionEnd;
        const tail=textarea.value.slice(end);state.slots[i].text=textarea.value.slice(0,position);state.slots[i].source='human';invalidateScores(state,i);
        insertSlot(state,i+1,emptySlot(tail));changed();render();focusSlot(i+1);queueRecognition();
      }else if(e.key==='Backspace'&&!textarea.value&&state.slots.length>1){
        e.preventDefault();pushUndo();removeSlot(state,i);changed();render();focusSlot(Math.max(0,i-1),state.slots[Math.max(0,i-1)].text.length);queueRecognition();
      }
    });
    textarea.addEventListener('paste',e=>{
      const text=e.clipboardData.getData('text');if(!text.includes('\n'))return;
      const lines=text.replace(/\r/g,'').split('\n');
      if(state.slots.length+lines.length-1>30){e.preventDefault();showError('Paste up to 30 sentence rows at a time.');return;}
      e.preventDefault();pushUndo();const before=textarea.value.slice(0,textarea.selectionStart),after=textarea.value.slice(textarea.selectionEnd);
      state.slots[i]={...state.slots[i],text:before+lines[0],source:'human'};invalidateScores(state,i);
      for(let j=1;j<lines.length;j++)insertSlot(state,i+j,emptySlot(lines[j]+(j===lines.length-1?after:'')));
      changed();render();focusSlot(i+lines.length-1);queueRecognition();
    });
    row.addEventListener('pointerenter',()=>setHover(i));row.addEventListener('pointerleave',()=>setHover(null));
    textarea.addEventListener('focus',()=>setHover(i));
    const remove=document.createElement('button');remove.className='remove-row';remove.textContent='×';remove.title=`Remove sentence ${i+1}`;remove.setAttribute('aria-label',`Remove sentence ${i+1}`);remove.disabled=busy||!!preview||state.slots.length<=1;
    remove.addEventListener('click',()=>{pushUndo();removeSlot(state,i);changed();render();queueRecognition();});
    row.append(number,textarea,remove);$('sentence-editor').append(row);adjustHeight(textarea);
  });
  updateSentenceCount(shown);
}

function updateSentenceCount(shown=preview||state){$('sentence-count').textContent=`${shown.slots.filter(s=>s.text.trim()).length} / ${shown.slots.length} sentences`;}

function render(){
  const shown=preview||state,spatial=shown.viewMode==='space',relational=shown.viewMode==='relationships';
  if(!preview&&relational&&!relationshipView(state)&&state.characters.length>=2)ensureRelationship(state,state.activeCharacterId,state.characters.find(c=>c.id!==state.activeCharacterId).id,'trust');
  $('space-view').hidden=!spatial;$('curve-view').hidden=spatial||relational;$('relationships-view').hidden=!relational;
  for(const [id,selected] of [['curve-view-button',!spatial&&!relational],['space-view-button',spatial],['relationship-view-button',relational]]){$(id).setAttribute('aria-pressed',String(selected));$(id).disabled=busy||!!preview;}
  renderEditor();castControls.render(preview||state,busy||!!preview);renderCanvases();
  $('history-count').textContent=history.length;
  $('surprise-toggle').checked=state.showSurprise;$('surprise-panel').hidden=!state.showSurprise;
  $('auto-generate').checked=(preview||state).autoGenerate!==false;$('auto-generate').disabled=busy||!!preview;
  $('undo-button').disabled=busy||!!preview||!undo.length;
  for(const id of ['generate-button','add-sentence','surprise-toggle','recognize-button','new-button','pen-tool','eraser-tool'])$(id).disabled=busy||!!preview;
  $('add-sentence').disabled=busy||!!preview||state.slots.length>=30;
  $('history-button').disabled=busy;$('generate-label').textContent=busy?'Writing…':'Generate Again';
  document.body.classList.toggle('busy',busy);
  $('pen-tool').classList.toggle('active',tool==='pen');$('pen-tool').setAttribute('aria-pressed',String(tool==='pen'));
  $('eraser-tool').classList.toggle('active',tool==='eraser');$('eraser-tool').setAttribute('aria-pressed',String(tool==='eraser'));
}

function commitStroke(touched,kind,erased,cancelled){
  if(cancelled){if(undo.length)state=undo.pop();changed();render();return;}
  if(!touched.length)return;
  if(state.viewMode==='relationships'&&kind!=='surprise')state.relationshipSentence=touched[0];
  changed();
  if(kind==='surprise'){message('Surprise sketch updated. Generate Again to use it.');renderCanvases();return;}
  const from=Math.min(...touched),to=Math.max(...touched);
  recordPlannedRange(state,Array.from({length:to-from+1},(_,k)=>from+k));changed();
  if(erased){message('This curve’s constraint was erased. Generate Again uses the other characters’ and dimensions’ remaining curves.');render();return;}
  if(state.autoGenerate===false){message('Curve saved. Add other characters’ or dimensions’ curves, then Generate Again to write with all of them.');render();return;}
  generateRange(state.lastRange);
}

async function generateRange(range){
  if(busy)return;
  clearTimeout(recognitionTimer);closeHistory();clearError();
  if(recognizing){pendingGeneration=[...new Set([...(pendingGeneration||[]),...range])].sort((a,b)=>a-b);message('Finishing fortune analysis. Your sketch is queued and will generate automatically.');return;}
  const indices=generationIndices(state.slots,range);
  if(!indices.length){message('Your words are fixed anchors. Sketch across empty rows or AI sentences, or clear a row to replace it.');return;}
  if(indices.length>24){showError('Generate up to 24 sentences in one stroke. Sketch a shorter section.');return;}
  state.lastRange=range;pushUndo();const initial=copy(state);
  busy=true;render();message(`Writing ${indices.length} sentence${indices.length===1?'':'s'} with all drawn character/dimension curves, then recognizing the results…`,true);
  let elapsed=0;loadingTimer=setInterval(()=>{elapsed+=5;message(`Exploring your story… ${elapsed}s · Generating and independently scoring candidates.`,true);},5000);
  try{
    const result=await api('/api/generate',{...copy(state),indices,surprises:state.showSurprise?state.surprises:Array(state.slots.length).fill(null)});
    if(!history.length)history.push({id:crypto.randomUUID(),label:'Starting draft',date:new Date().toISOString(),draft:initial});
    invalidateScores(state,Math.min(...indices));
    result.updates.forEach(update=>{state.slots[update.index]={...state.slots[update.index],text:update.text,source:'ai'};});
    applyScores(state,result.updates);
    state.plannedRange=[];
    snapshot(`Exploration ${history.filter(h=>h.label.startsWith('Exploration')).length+1}`);changed();
    message(`${result.updates.length} new sentence${result.updates.length===1?'':'s'}. ${result.scored_pairs} character/dimension curve${result.scored_pairs===1?'':'s'} recognized. Switch tabs to compare, edit the words, or try another direction.`);
  }catch(error){showError(error.message);message('Your draft and sketch are safe. Generate Again to retry.');}
  finally{clearInterval(loadingTimer);busy=false;$('status').classList.remove('loading');render();}
}

function queueRecognition(){clearTimeout(recognitionTimer);recognitionTimer=setTimeout(()=>analyze(false),2200);}
async function analyze(explicit=true){
  if(busy||recognizing||!connected||!state.slots.some(s=>s.text.trim())){
    if(explicit&&!connected)showError('The Codex bridge is offline. Start python3 llm-bridge/bridge.py codex from the workshop repository.');return;
  }
  clearTimeout(recognitionTimer);const atRevision=revision;recognizing=true;$('recognize-button').disabled=true;
  if(explicit){clearError();message('Recognizing the selected and drawn character/dimension curves from the actual text…',true);}
  else $('connection-text').textContent='Recognizing story arcs…';
  try{
    const result=await api('/api/recognize',copy(state));
    if(atRevision!==revision){queueRecognition();return;}
    applyScores(state,result.scores);save();renderCanvases();
    if(explicit)message('Story arcs recognized from the current text. Switch character/dimension tabs to compare them.');
  }catch(error){if(explicit||atRevision===revision)showError(error.message);}
  finally{
    recognizing=false;$('recognize-button').disabled=busy;if(explicit)$('status').classList.remove('loading');$('connection-text').textContent=connected?'Codex bridge connected':'Codex bridge offline';
    if(pendingGeneration){const range=pendingGeneration;pendingGeneration=null;generateRange(range);}
  }
}

function closeHistory(){historyOpen=false;preview=null;$('history-menu').hidden=true;$('history-button').setAttribute('aria-expanded','false');render();}
function openHistory(){
  historyOpen=true;$('history-menu').hidden=false;$('history-button').setAttribute('aria-expanded','true');$('history-items').replaceChildren();
  if(!history.length){const text=document.createElement('p');text.className='history-empty';text.textContent='Your generated stories will appear here.';$('history-items').append(text);}
  [...history].reverse().forEach(saved=>{
    const button=document.createElement('button');button.className='history-item';const title=document.createElement('strong');title.textContent=saved.label;
    const summary=document.createElement('span');summary.textContent=`${new Date(saved.date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} · ${saved.draft.slots.find(s=>s.text.trim())?.text.slice(0,85)||'Empty draft'}`;button.append(title,summary);
    const show=()=>{preview=saved.draft;render();message(`Previewing ${saved.label}. Select to restore; move away to return to your draft.`);};
    button.addEventListener('pointerenter',show);button.addEventListener('focus',show);
    button.addEventListener('click',()=>{pushUndo();snapshot('Before restoring');state=copy(saved.draft);changed();closeHistory();message(`Restored ${saved.label}. You can edit it or sketch a new direction.`);});
    $('history-items').append(button);
  });
  renderCanvases();
}
$('history-button').addEventListener('click',()=>historyOpen?closeHistory():openHistory());
$('history-items').addEventListener('pointerleave',()=>{preview=null;render();message('Hover over a saved story to compare its text, cast and story arcs.');});
document.addEventListener('pointerdown',e=>{if(historyOpen&&!e.target.closest('.history-wrap'))closeHistory();});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&historyOpen){closeHistory();$('history-button').focus();}
  if(e.target.matches('textarea,input,select')||busy||$('help-dialog').open)return;
  if(e.key.toLowerCase()==='p')selectTool('pen');if(e.key.toLowerCase()==='e')selectTool('eraser');
});
function selectTool(value){tool=value;render();message(value==='eraser'?'Erase part of this curve’s green envelope. Other curves still guide generation.':'Draw across the canvas. Release your stroke to generate the touched part of the story using all drawn curves.');}
$('pen-tool').addEventListener('click',()=>selectTool('pen'));
$('eraser-tool').addEventListener('click',()=>selectTool('eraser'));
for(const [id,mode] of [['curve-view-button','curves'],['space-view-button','space'],['relationship-view-button','relationships']])$(id).addEventListener('click',()=>{
  if(busy||preview)return;state.viewMode=mode;if(mode==='space')state.autoGenerate=false;save();render();
  save();message(mode==='relationships'?'Choose who feels what toward whom. Draw a relationship curve; reciprocal directions are independent.':mode==='space'?'Orbit the 3D space, drag sentence points in a chosen plane, or adjust all dimensions below. Generate Again applies planned targets.':'Choose a character and dimension to sketch a story curve.');
});
$('generate-button').addEventListener('click',()=>{
  let range=state.autoGenerate===false&&state.plannedRange?.length?state.plannedRange:state.lastRange?.length?state.lastRange:allArcTracks(state).flatMap(t=>t.controls.map((control,i)=>control?i:null).filter(i=>i!==null));
  if(!range.length)range=state.slots.map((s,i)=>!s.text.trim()?i:null).filter(i=>i!==null);
  generateRange(range);
});
$('add-sentence').addEventListener('click',()=>{if(state.slots.length>=30)return;pushUndo();insertSlot(state,state.slots.length);changed();render();focusSlot(state.slots.length-1);});
$('undo-button').addEventListener('click',()=>{if(!undo.length||busy)return;closeHistory();state=undo.pop();changed();render();message('Previous draft action restored.');});
$('surprise-toggle').addEventListener('change',()=>{pushUndo();state.showSurprise=$('surprise-toggle').checked;changed();render();});
$('auto-generate').addEventListener('change',()=>{pushUndo();state.autoGenerate=$('auto-generate').checked;state.plannedRange=[];changed();render();message(state.autoGenerate?'Sketch release will generate immediately.':'Plan your curves, then click Generate Again when ready.');});
$('story-title').addEventListener('focus',pushUndo);
$('story-title').addEventListener('input',()=>{state.title=$('story-title').value;changed();});
$('recognize-button').addEventListener('click',()=>analyze(true));
$('new-button').addEventListener('click',()=>{
  pendingGeneration=null;pushUndo();if(state.slots.some(s=>s.text.trim()))snapshot('Before new story');
  state.title='';state.slots=Array.from({length:10},()=>emptySlot());state.surprises=Array(10).fill(null);state.lastRange=[];state.plannedRange=[];state.spaceSentence=0;
  for(const track of allArcTracks(state)){track.controls=Array(10).fill(null);track.values=Array(10).fill(null);}
  changed();closeHistory();render();message('A blank story with your cast and dimensions. Write the beginning, then sketch.');focusSlot(0);
});
$('export-button').addEventListener('click',()=>{
  const shown=preview||state,text=shown.title+'\n\n'+shown.slots.map(s=>s.text||'[Unwritten sentence]').join('\n');
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=(shown.title||'TaleBrush story').replace(/[^\p{L}\p{N} ._-]/gu,'').slice(0,100)+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
function openHelp(details=false){$('help-dialog').showModal();if(details){$('model-details').open=true;$('model-details').scrollIntoView({block:'start'});}}
$('help-button').addEventListener('click',()=>openHelp());$('details-button').addEventListener('click',()=>openHelp(true));$('close-help').addEventListener('click',()=>$('help-dialog').close());
$('help-dialog').addEventListener('click',e=>{if(e.target===$('help-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});

async function checkConnection(){
  try{const response=await fetch('/api/health');const data=await response.json();connected=data.ok;$('connection-text').textContent=data.ok?'Codex bridge connected':'Codex bridge offline';$('connection').classList.toggle('offline',!data.ok);$('connection').title=data.ok?`${data.backend} · ${data.model||'default model'}`:data.message;}
  catch{connected=false;$('connection-text').textContent='TaleBrush server offline';$('connection').classList.add('offline');}
}
$('retry-connection').addEventListener('click',async()=>{await checkConnection();if(connected){clearError();message('Connected to the Codex bridge. You can sketch to generate.');}});
window.addEventListener('resize',()=>{$('sentence-editor').querySelectorAll('textarea').forEach(adjustHeight);});
render();if(!migrationError)save();checkConnection();
if(history.length)message('Your saved draft is restored. Edit a sentence, redraw a section, or explore History.');
if(migrationError)showError(migrationError);
