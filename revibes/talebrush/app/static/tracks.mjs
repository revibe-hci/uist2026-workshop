import {allArcTracks,assertRelationships} from './relationship-state.mjs';
export {allArcTracks} from './relationship-state.mjs';

export const BUILTIN_DIMENSIONS = [
  {id:'fortune',name:'Fortune',low:'Bad fortune',high:'Good fortune',description:'Outcomes and progress toward this character’s goals.',builtin:true},
  {id:'mood',name:'Mood',low:'Unhappy',high:'Happy',description:'This character’s emotional state, independent of objective fortune.',builtin:true},
  {id:'confidence',name:'Confidence',low:'Uncertain',high:'Self-assured',description:'How confident this character feels in their own ability.',builtin:true},
  {id:'tension',name:'Tension',low:'Calm',high:'Under pressure',description:'Stress, suspense or pressure experienced by this character.',builtin:true},
];
const clone=value=>JSON.parse(JSON.stringify(value));
const keyFor=(characterId,dimensionId)=>`${characterId}:${dimensionId}`;
const blankTrack=(characterId,dimensionId,count)=>({characterId,dimensionId,controls:Array(count).fill(null),values:Array(count).fill(null)});
const validUnit=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;
const text=(value,label,max=100)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new Error(`${label} must contain 1–${max} characters.`);return value.trim();};

export function assertDraft(state){
  if(!state||state.schemaVersion!==2||typeof state.title!=='string'||!Array.isArray(state.slots)||state.slots.length<1||state.slots.length>30)throw new Error('Invalid saved draft.');
  if(!state.slots.every(s=>s&&typeof s.text==='string'&&['human','ai'].includes(s.source)))throw new Error('Invalid sentence rows.');
  if(!Array.isArray(state.characters)||state.characters.length<1||state.characters.length>6||!Array.isArray(state.dimensions)||state.dimensions.length<1||state.dimensions.length>8)throw new Error('Invalid saved cast or dimensions.');
  for(const [items,label] of [[state.characters,'Character'],[state.dimensions,'Dimension']]){
    const ids=new Set(),names=new Set();
    for(const item of items){const name=text(item.name,label);if(!/^[\w-]{1,80}$/.test(item.id)||ids.has(item.id)||names.has(name.toLowerCase()))throw new Error(`Duplicate or invalid ${label.toLowerCase()}.`);ids.add(item.id);names.add(name.toLowerCase());}
  }
  for(const d of state.dimensions){text(d.low,'Low endpoint',80);text(d.high,'High endpoint',80);if(d.low.trim().toLowerCase()===d.high.trim().toLowerCase())throw new Error('Endpoints must be different.');}
  if(!state.characters.some(c=>c.id===state.activeCharacterId)||!state.dimensions.some(d=>d.id===state.activeDimensionId))throw new Error('Invalid active character/dimension.');
  if(!state.tracks||typeof state.tracks!=='object')throw new Error('Invalid saved arcs.');
  const expected=new Set();
  for(const c of state.characters)for(const d of state.dimensions){
    const key=keyFor(c.id,d.id),track=state.tracks[key];expected.add(key);
    if(!track||track.characterId!==c.id||track.dimensionId!==d.id||track.controls?.length!==state.slots.length||track.values?.length!==state.slots.length)throw new Error('Saved arcs do not match the sentence rows.');
    if(!track.controls.every(v=>v===null||(v&&validUnit(v.target)&&validUnit(v.tolerance)))||!track.values.every(v=>v===null||validUnit(v)))throw new Error('Invalid saved arc values.');
  }
  if(Object.keys(state.tracks).some(k=>!expected.has(k)))throw new Error('Unknown saved arc.');
  if(!Array.isArray(state.surprises)||state.surprises.length!==state.slots.length||!state.surprises.every(v=>v===null||validUnit(v)))throw new Error('Invalid surprise arc.');
  assertRelationships(state);
  return state;
}

export function upgradeDraft(raw){
  const state=clone(raw);
  if(state?.schemaVersion===2){
    if(state.relationshipTracks===undefined)state.relationshipTracks={};
    if(state.activeRelationshipKey===undefined)state.activeRelationshipKey=null;
    return assertDraft(state);
  }
  if(!state||typeof state.title!=='string'||typeof state.protagonist!=='string'||!Array.isArray(state.slots)||!Array.isArray(state.controls)||state.controls.length!==state.slots.length)throw new Error('Unrecognized saved draft.');
  const character={id:'legacy-protagonist',name:state.protagonist.trim()||'Character 1',description:''};
  state.relationshipTracks={};state.activeRelationshipKey=null;
  state.schemaVersion=2;state.characters=[character];state.dimensions=clone(BUILTIN_DIMENSIONS);state.tracks={};
  for(const d of state.dimensions)state.tracks[keyFor(character.id,d.id)]=blankTrack(character.id,d.id,state.slots.length);
  const fortune=state.tracks[keyFor(character.id,'fortune')];fortune.controls=clone(state.controls);fortune.values=state.slots.map(s=>s.fortune??null);
  state.activeCharacterId=character.id;state.activeDimensionId='fortune';
  state.slots.forEach(s=>{s.id ||= crypto.randomUUID();delete s.fortune;});
  delete state.protagonist;delete state.controls;
  return assertDraft(state);
}

export function migrateSaved(saved){
  return {draft:upgradeDraft(saved.draft),history:(Array.isArray(saved.history)?saved.history:[]).map(h=>({...h,draft:upgradeDraft(h.draft)}))};
}

export function activeTrack(state){return state.tracks[keyFor(state.activeCharacterId,state.activeDimensionId)];}
export function trackView(state,characterId=state.activeCharacterId,dimensionId=state.activeDimensionId){
  const track=state.tracks[keyFor(characterId,dimensionId)]||blankTrack(characterId,dimensionId,state.slots.length);
  const dimension=state.dimensions.find(d=>d.id===dimensionId)||BUILTIN_DIMENSIONS[0];
  const character=state.characters.find(c=>c.id===characterId);
  return {...state,controls:track.controls,slots:state.slots.map((slot,i)=>({...slot,fortune:track.values[i]})),dimension,character};
}

export function addCharacter(state,name,description=''){
  if(state.characters.length>=6)throw new Error('Use up to six characters in a short story.');
  name=text(name,'Character name');
  if(state.characters.some(c=>c.name.toLowerCase()===name.toLowerCase()))throw new Error('That character name already exists.');
  if(typeof description!=='string'||description.length>400)throw new Error('Use a description of at most 400 characters.');
  const character={id:crypto.randomUUID(),name,description:description.trim()};state.characters.push(character);
  for(const d of state.dimensions)state.tracks[keyFor(character.id,d.id)]=blankTrack(character.id,d.id,state.slots.length);
  return character;
}
export function renameCharacter(state,id,name,description=''){
  const character=state.characters.find(c=>c.id===id);if(!character)throw new Error('Character not found.');
  name=text(name,'Character name');
  if(state.characters.some(c=>c.id!==id&&c.name.toLowerCase()===name.toLowerCase()))throw new Error('That character name already exists.');
  if(typeof description!=='string'||description.length>400)throw new Error('Use a description of at most 400 characters.');
  if(character.name!==name||character.description!==description.trim())for(const t of allArcTracks(state))if(t.characterId===id||t.targetCharacterId===id)t.values.fill(null);
  character.name=name;character.description=description.trim();
}
export function removeCharacter(state,id){
  if(state.characters.length<=1)throw new Error('Keep at least one character.');
  state.characters=state.characters.filter(c=>c.id!==id);
  for(const [key,track] of Object.entries(state.tracks))if(track.characterId===id)delete state.tracks[key];
  for(const [key,track] of Object.entries(state.relationshipTracks||{}))if(track.characterId===id||track.targetCharacterId===id)delete state.relationshipTracks[key];
  if(state.activeRelationshipKey&&!Object.hasOwn(state.relationshipTracks||{},state.activeRelationshipKey))state.activeRelationshipKey=null;
  if(state.activeCharacterId===id)state.activeCharacterId=state.characters[0].id;
}
export function addDimension(state,name,low,high){
  if(state.dimensions.length>=8)throw new Error('Use up to eight story dimensions.');
  name=text(name,'Dimension name',40);low=text(low,'Low endpoint',80);high=text(high,'High endpoint',80);
  if(low.toLowerCase()===high.toLowerCase())throw new Error('Low and high endpoints must be different.');
  if(state.dimensions.some(d=>d.name.toLowerCase()===name.toLowerCase()))throw new Error('That dimension already exists.');
  const dimension={id:crypto.randomUUID(),name,low,high,description:`${name} experienced by this character, from ${low} to ${high}.`,builtin:false};state.dimensions.push(dimension);
  for(const c of state.characters)state.tracks[keyFor(c.id,dimension.id)]=blankTrack(c.id,dimension.id,state.slots.length);
  return dimension;
}
export function removeDimension(state,id){
  const dimension=state.dimensions.find(d=>d.id===id);if(!dimension)throw new Error('Dimension not found.');
  if(dimension.builtin)throw new Error('Built-in dimensions stay available.');
  state.dimensions=state.dimensions.filter(d=>d.id!==id);
  for(const [key,track] of Object.entries(state.tracks))if(track.dimensionId===id)delete state.tracks[key];
  if(state.activeDimensionId===id)state.activeDimensionId='fortune';
}
export function invalidateScores(state,from=0){for(const track of allArcTracks(state))track.values.fill(null,from);}
export function scoredPairs(state){return Object.entries(state.tracks).filter(([key,t])=>key===keyFor(state.activeCharacterId,state.activeDimensionId)||t.controls.some(Boolean)).map(([key,t])=>({key,characterId:t.characterId,dimensionId:t.dimensionId}));}
export function applyScores(state,rows){
  for(const row of rows)for(const [key,value] of Object.entries(row.values))if(Object.hasOwn(state.tracks,key))state.tracks[key].values[row.index]=value;else if(Object.hasOwn(state.relationshipTracks||{},key))state.relationshipTracks[key].values[row.index]=value;
}
export function recordPlannedRange(state,range){
  state.lastRange=[...new Set(range)].sort((a,b)=>a-b);
  if(state.autoGenerate===false)state.plannedRange=[...new Set([...(state.plannedRange||[]),...range])].sort((a,b)=>a-b);
}
