export const RELATIONSHIP_TYPES = [
  {id:'trust',name:'Trust',low:'Distrust',high:'Trust',description:'How much the source trusts and relies on the target.'},
  {id:'rivalry',name:'Rivalry',low:'Cooperative',high:'Competitive',description:'How strongly the source competes with or opposes the target.'},
  {id:'affection',name:'Affection',low:'Dislike',high:'Affection',description:'The warmth and affection the source feels toward the target.'},
  {id:'power',name:'Power',low:'Powerless',high:'Dominant',description:'The influence or control the source has over the target.'},
];
export const relationshipKey=(from,to,type)=>`rel:${from}:${to}:${type}`;
export const allArcTracks=state=>[...Object.values(state.tracks||{}),...Object.values(state.relationshipTracks||{})];
const typeFor=id=>RELATIONSHIP_TYPES.find(type=>type.id===id);
const endpoints=(state,from,to)=>from!==to&&state.characters.some(c=>c.id===from)&&state.characters.some(c=>c.id===to);
const unit=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;
const aligned=(array,count,predicate)=>Array.isArray(array)&&array.length===count&&Array.from(array).every(predicate);

export function assertRelationships(state){
  const tracks=state.relationshipTracks;
  if(tracks!==undefined){
    if(!tracks||typeof tracks!=='object'||Array.isArray(tracks))throw new Error('Invalid saved relationship map.');
    for(const [key,track] of Object.entries(tracks)){
      if(!track||!endpoints(state,track.characterId,track.targetCharacterId)||!typeFor(track.dimensionId)||key!==relationshipKey(track.characterId,track.targetCharacterId,track.dimensionId))throw new Error('Invalid saved relationship endpoints, key or type.');
      if(!aligned(track.controls,state.slots.length,v=>v===null||(v&&unit(v.target)&&unit(v.tolerance)))||!aligned(track.values,state.slots.length,v=>v===null||unit(v)))throw new Error('Invalid saved relationship values or sentence rows.');
    }
  }
  if(state.activeRelationshipKey!==undefined&&state.activeRelationshipKey!==null&&(typeof state.activeRelationshipKey!=='string'||!Object.hasOwn(tracks||{},state.activeRelationshipKey)))throw new Error('Invalid active relationship.');
}

export function ensureRelationship(state,from,to,type){
  if(!endpoints(state,from,to))throw new Error('Relationship endpoints must be different known characters.');
  if(!typeFor(type))throw new Error('Unknown relationship type.');
  state.relationshipTracks ??={};
  const key=relationshipKey(from,to,type);
  if(!Object.hasOwn(state.relationshipTracks,key))state.relationshipTracks[key]={characterId:from,targetCharacterId:to,dimensionId:type,controls:Array(state.slots.length).fill(null),values:Array(state.slots.length).fill(null)};
  state.activeRelationshipKey=key;
  return state.relationshipTracks[key];
}

export function relationshipView(state,key=state.activeRelationshipKey){
  const track=state.relationshipTracks?.[key];
  if(!track||!endpoints(state,track.characterId,track.targetCharacterId)||key!==relationshipKey(track.characterId,track.targetCharacterId,track.dimensionId))return null;
  const dimension=typeFor(track.dimensionId);if(!dimension)return null;
  const source=state.characters.find(c=>c.id===track.characterId),target=state.characters.find(c=>c.id===track.targetCharacterId);
  return {...state,controls:track.controls,slots:state.slots.map((slot,i)=>({...slot,fortune:track.values[i]})),character:{id:source.id,name:`${source.name} → ${target.name}`},dimension};
}
