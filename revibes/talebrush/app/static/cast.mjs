import {addCharacter,renameCharacter,removeCharacter,addDimension,removeDimension} from './tracks.mjs';
import {RELATIONSHIP_TYPES} from './relationship-state.mjs';
const $=id=>document.getElementById(id);

export class CastControls{
  constructor({onSelect,onChange,onNotice,onRelationship}){
    this.onSelect=onSelect;this.onChange=onChange;this.onNotice=onNotice;this.onRelationship=onRelationship;
    $('add-character').addEventListener('click',()=>this.editCharacter());
    $('edit-character').addEventListener('click',()=>this.editCharacter(this.state.activeCharacterId));
    $('add-dimension').addEventListener('click',()=>{$('dimension-form').reset();$('dimension-form-error').hidden=true;$('dimension-dialog').showModal();});
    for(const id of ['character-dialog','dimension-dialog']){
      $(id).querySelector('[data-close]').addEventListener('click',()=>$(id).close());
      $(id).addEventListener('click',e=>{if(e.target===$(id)){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$(id).close();}});
    }
    $('character-form').addEventListener('submit',e=>{
      e.preventDefault();
      try{
        const name=$('character-name').value,description=$('character-description').value;
        this.onChange(state=>{
          if(this.editId)renameCharacter(state,this.editId,name,description);
          else {const character=addCharacter(state,name,description);state.activeCharacterId=character.id;}
        });
        $('character-dialog').close();this.onNotice(`${name.trim()} is ready. Choose a dimension and sketch their arc.`);
      }catch(error){this.error('character-form-error',error.message);}
    });
    $('remove-character').addEventListener('click',()=>{
      try{this.onChange(state=>removeCharacter(state,this.editId));$('character-dialog').close();this.onNotice('Character removed. Undo restores the character and all their curves.');}
      catch(error){this.error('character-form-error',error.message);}
    });
    $('dimension-form').addEventListener('submit',e=>{
      e.preventDefault();
      try{this.onChange(state=>{const d=addDimension(state,$('dimension-name').value,$('dimension-low').value,$('dimension-high').value);state.activeDimensionId=d.id;});$('dimension-dialog').close();this.onNotice('Custom dimension added for every character. Its low/high meanings guide generation.');}
      catch(error){this.error('dimension-form-error',error.message);}
    });
    $('remove-dimension').addEventListener('click',()=>{
      try{this.onChange(state=>removeDimension(state,state.activeDimensionId));this.onNotice('Custom dimension removed. Undo restores its curves.');}
      catch(error){this.onNotice(error.message);}
    });
  }
  error(id,message){$(id).textContent=message;$(id).hidden=false;}
  editCharacter(id=null){
    this.editId=id;
    const character=this.state.characters.find(c=>c.id===id);
    $('character-dialog-title').textContent=id?'Edit character':'Add a character';
    $('character-name').value=character?.name||'';$('character-description').value=character?.description||'';
    $('remove-character').hidden=!id;$('remove-character').disabled=this.state.characters.length<=1;
    $('character-form-error').hidden=true;$('character-submit').textContent=id?'Save character':'Add character';
    $('character-dialog').showModal();
  }
  render(state,disabled=false){
    this.state=state;
    const character=state.characters.find(c=>c.id===state.activeCharacterId),dimension=state.dimensions.find(d=>d.id===state.activeDimensionId);
    $('character-tabs').replaceChildren();
    state.characters.forEach((c,i)=>{
      const button=document.createElement('button');button.type='button';button.className='character-tab';button.setAttribute('role','tab');button.setAttribute('aria-selected',String(c.id===character.id));button.title=c.description||c.name;button.disabled=disabled;
      const dot=document.createElement('span');dot.className='character-dot';dot.style.background=['#4d8064','#ae7a57','#7e78a7','#528b9c','#a77d98','#a09955'][i];
      button.append(dot,document.createTextNode(c.name));button.addEventListener('click',()=>this.onSelect(c.id,dimension.id,'character'));$('character-tabs').append(button);
    });
    $('dimension-tabs').replaceChildren();
    state.dimensions.forEach(d=>{
      const button=document.createElement('button');button.type='button';button.className='dimension-tab';button.textContent=d.name;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(d.id===dimension.id));button.title=`${d.low} → ${d.high}`;button.disabled=disabled;
      button.addEventListener('click',()=>this.onSelect(character.id,d.id,'dimension'));$('dimension-tabs').append(button);
    });
    for(const id of ['add-character','edit-character','add-dimension','remove-dimension'])$(id).disabled=disabled;
    $('add-character').disabled=disabled||state.characters.length>=6;$('add-dimension').disabled=disabled||state.dimensions.length>=8;
    $('remove-dimension').hidden=dimension.builtin;
    $('active-character-name').textContent=character.name;$('active-dimension-name').textContent=dimension.name.toLowerCase();
    $('dimension-description').textContent=dimension.description||`${dimension.low} → ${dimension.high}`;
    $('axis-high').textContent=dimension.high.toUpperCase();$('axis-low').textContent=dimension.low.toUpperCase();
    $('generated-dimension-label').textContent=`Recognized ${dimension.name.toLowerCase()}`;
    const constrained=Object.entries({...state.tracks,...state.relationshipTracks}).filter(([,track])=>track.controls.some(Boolean));
    $('arc-overview-summary').textContent=`${constrained.length} drawn curve${constrained.length===1?'':'s'} · generation uses all`;
    $('arc-overview-items').replaceChildren();
    if(!constrained.length){const p=document.createElement('p');p.textContent='Choose a character and dimension, then sketch. Add more curves to guide the same story.';$('arc-overview-items').append(p);}
    for(const [,track] of constrained){
      const c=state.characters.find(c=>c.id===track.characterId),target=state.characters.find(c=>c.id===track.targetCharacterId),d=target?RELATIONSHIP_TYPES.find(d=>d.id===track.dimensionId):state.dimensions.find(d=>d.id===track.dimensionId);
      const button=document.createElement('button');button.type='button';button.className='track-shortcut';button.disabled=disabled;
      const name=document.createElement('span');name.textContent=`${c.name}${target?' → '+target.name:''} · ${d.name}`;
      const count=document.createElement('small');count.textContent=`${track.controls.filter(Boolean).length} sentence targets`;
      button.append(name,count);button.addEventListener('click',()=>target?this.onRelationship?.(c.id,target.id,d.id):this.onSelect(c.id,d.id,'curve'));$('arc-overview-items').append(button);
    }
  }
}
