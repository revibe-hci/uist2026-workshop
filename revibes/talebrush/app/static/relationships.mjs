import {RELATIONSHIP_TYPES,relationshipView,relationshipKey} from './relationship-state.mjs';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const svg=(name,attrs={})=>{const e=document.createElementNS(NS,name);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;};

export class RelationshipControls{
  constructor({onSelect,onSentence,onTool}){
    this.onSelect=onSelect;this.onSentence=onSentence;
    $('relationship-from').addEventListener('change',()=>{
      const from=$('relationship-from').value,to=$('relationship-to').value;
      this.onSelect(from,from===to?this.state.characters.find(c=>c.id!==from).id:to,$('relationship-type').value);
    });
    for(const id of ['relationship-to','relationship-type'])$(id).addEventListener('change',()=>this.onSelect($('relationship-from').value,$('relationship-to').value,$('relationship-type').value));
    $('relationship-swap').addEventListener('click',()=>this.onSelect($('relationship-to').value,$('relationship-from').value,$('relationship-type').value));
    $('relationship-sentence').addEventListener('change',()=>this.onSentence(Number($('relationship-sentence').value)));
    $('relationship-pen').addEventListener('click',()=>onTool('pen'));$('relationship-eraser').addEventListener('click',()=>onTool('eraser'));
    $('relationship-add-character').addEventListener('click',()=>$('add-character').click());
  }
  render(state,{disabled=false,tool='pen'}={}){
    this.state=state;this.disabled=disabled;
    const enough=state.characters.length>=2,view=relationshipView(state);
    $('relationship-empty').hidden=enough;$('relationship-content').hidden=!enough;
    $('relationship-add-character').disabled=disabled;
    if(!enough)return;
    const track=state.relationshipTracks?.[state.activeRelationshipKey];
    const from=track?.characterId||state.characters[0].id,to=track?.targetCharacterId||state.characters.find(c=>c.id!==from).id,type=track?.dimensionId||'trust';
    for(const [id,items,value]of [['relationship-from',state.characters,from],['relationship-to',state.characters.filter(c=>c.id!==from),to],['relationship-type',RELATIONSHIP_TYPES,type]]){
      const select=$(id);select.replaceChildren();select.disabled=disabled;
      for(const item of items){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;select.append(option);}select.value=value;
    }
    const sentence=$('relationship-sentence');sentence.replaceChildren();sentence.disabled=disabled;
    state.slots.forEach((s,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${String(i+1).padStart(2,'0')} · ${s.text.slice(0,55)||'Unwritten sentence'}`;sentence.append(option);});
    const index=Math.min(state.slots.length-1,Math.max(0,state.relationshipSentence??0));sentence.value=index;
    for(const id of ['relationship-swap','relationship-pen','relationship-eraser'])$(id).disabled=disabled;
    $('relationship-pen').setAttribute('aria-pressed',String(tool==='pen'));$('relationship-eraser').setAttribute('aria-pressed',String(tool==='eraser'));
    if(view){$('relationship-heading').textContent=`${view.character.name} · ${view.dimension.name}`;$('relationship-description').textContent=view.dimension.description;$('relationship-high').textContent=view.dimension.high.toUpperCase();$('relationship-low').textContent=view.dimension.low.toUpperCase();}
    const target=track?.controls[index]?.target,actual=track?.values[index];
    $('relationship-score').textContent=`Sentence ${index+1}: target ${target==null?'unset':Math.round(target*100)+'%'} · recognized ${actual==null?'not analyzed':Math.round(actual*100)+'%'}`;
    this.drawGraph(from,to,type,index);
  }
  drawGraph(from,to,type,index){
    const graph=$('relationship-graph');graph.replaceChildren();
    const defs=svg('defs'),marker=svg('marker',{id:'relationship-arrow',viewBox:'0 0 10 10',refX:8,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});marker.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#7caa8c'}));defs.append(marker);graph.append(defs);
    const chars=this.state.characters,positions=new Map(chars.map((c,i)=>[c.id,[250+185*Math.cos(-Math.PI/2+2*Math.PI*i/chars.length),112+65*Math.sin(-Math.PI/2+2*Math.PI*i/chars.length)]]));
    const edges=Object.values(this.state.relationshipTracks||{}).filter(t=>t.dimensionId===type);
    for(const edge of edges){
      const a=positions.get(edge.characterId),b=positions.get(edge.targetCharacterId);if(!a||!b)continue;
      const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length;
      const start=[a[0]+ux*23,a[1]+uy*23],end=[b[0]-ux*26,b[1]-uy*26],control=[(a[0]+b[0])/2-uy*38,(a[1]+b[1])/2+ux*38];
      const selected=edge.characterId===from&&edge.targetCharacterId===to,actual=edge.values[index],target=edge.controls[index]?.target;
      const path=svg('path',{d:`M${start} Q${control} ${end}`,fill:'none',stroke:selected?'#4c8b69':'#a9bba7','stroke-width':selected?3:1.5,'marker-end':'url(#relationship-arrow)',tabindex:this.disabled?-1:0,role:'button','aria-label':`${chars.find(c=>c.id===edge.characterId).name} to ${chars.find(c=>c.id===edge.targetCharacterId).name}: ${type}`});
      path.style.cursor=this.disabled?'default':'pointer';const choose=()=>{if(!this.disabled)this.onSelect(edge.characterId,edge.targetCharacterId,type);};path.addEventListener('click',choose);path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});graph.append(path);
      if(selected){const label=svg('text',{x:control[0],y:control[1],fill:'#668460','font-size':10,'text-anchor':'middle'});label.textContent=`${target==null?'No target':Math.round(target*100)+'% target'}${actual==null?'':' / '+Math.round(actual*100)+'% recognized'}`;graph.append(label);}
    }
    for(const c of chars){
      const [x,y]=positions.get(c.id),group=svg('g',{tabindex:this.disabled?-1:0,role:'button','aria-label':`Select relationship to ${c.name}`});group.style.cursor=this.disabled?'default':'pointer';
      group.append(svg('circle',{cx:x,cy:y,r:21,fill:c.id===from?'#dcebd8':c.id===to?'#e8e2d4':'#f1f3e9',stroke:'#b7c8ac','stroke-width':1.5}));
      const initial=svg('text',{x,y:y+4,'text-anchor':'middle',fill:'#536d4a','font-size':12});initial.textContent=c.name.slice(0,1).toUpperCase();group.append(initial);
      const label=svg('text',{x,y:y+36,'text-anchor':'middle',fill:'#718365','font-size':11});label.textContent=c.name.length>20?c.name.slice(0,18)+'…':c.name;group.append(label);
      const choose=()=>{if(this.disabled)return;this.onSelect(c.id===from?to:from,c.id,type);};group.addEventListener('click',choose);group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});graph.append(group);
    }
  }
}
