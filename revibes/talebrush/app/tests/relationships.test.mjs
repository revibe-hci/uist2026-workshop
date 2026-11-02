import test from 'node:test';
import assert from 'node:assert/strict';
import {newDraft,insertSlot,removeSlot} from '../static/core.mjs';
import {upgradeDraft,migrateSaved,addCharacter,removeCharacter,renameCharacter,invalidateScores,applyScores,assertDraft} from '../static/tracks.mjs';

const draft=()=>upgradeDraft(newDraft());
test('legacy drafts and every history snapshot acquire empty relationship maps without loss',()=>{
  const old=draft();delete old.relationshipTracks;delete old.activeRelationshipKey;
  const saved=migrateSaved({draft:old,history:[{id:'h',draft:old}]});
  for(const state of [saved.draft,saved.history[0].draft]){
    assert.deepEqual(state.relationshipTracks,{});
    assert.equal(state.activeRelationshipKey,null);
    assert.deepEqual(state.tracks,old.tracks);
    assert.deepEqual(state.slots,old.slots);
  }
  assert.equal(old.relationshipTracks,undefined);
});

import * as relationships from '../static/relationship-state.mjs';
const cast=()=>{const state=draft();const first=state.activeCharacterId,second=addCharacter(state,'Maya').id,third=addCharacter(state,'Joe').id;return {state,first,second,third};};
const edge=(state,from,to,type='trust')=>{assert.equal(typeof relationships.ensureRelationship,'function');return relationships.ensureRelationship(state,from,to,type);};

test('directed relationship types and selections have independent curves',()=>{
  const {state,first,second}=cast();
  const forward=edge(state,first,second),reverse=edge(state,second,first),other=edge(state,first,second,'power');
  forward.controls[0]={target:.9,tolerance:.1};forward.values[0]=.7;
  assert.equal(reverse.controls[0],null);assert.equal(other.values[0],null);
  assert.equal(relationships.relationshipKey(first,second,'trust'),`rel:${first}:${second}:trust`);
  assert.equal(edge(state,first,second),forward);
  assert.equal(state.activeRelationshipKey,`rel:${first}:${second}:trust`);
  assert.deepEqual(relationships.RELATIONSHIP_TYPES.map(t=>t.id),['trust','rivalry','affection','power']);
  for(const type of relationships.RELATIONSHIP_TYPES)for(const key of ['name','low','high','description'])assert.equal(typeof type[key],'string');
  assert.throws(()=>edge(state,first,first),/relationship|different|self/i);
  assert.throws(()=>edge(state,first,'missing'),/character|endpoint/i);
  assert.throws(()=>edge(state,first,second,'mood'),/type/i);
});

test('relationship views preserve control references and show endpoint names',()=>{
  const {state,first,second}=cast(),track=edge(state,first,second);
  track.values[0]=.8;
  const view=relationships.relationshipView(state);
  assert.equal(view.controls,track.controls);assert.equal(view.slots[0].fortune,.8);
  assert.deepEqual(view.character,{id:first,name:'Mike → Maya'});assert.equal(view.dimension.id,'trust');
  assert.equal(relationships.relationshipView(state,'missing'),null);
  state.activeRelationshipKey=null;assert.equal(relationships.relationshipView(state),null);
});

test('insert and remove align both track maps and invalidation applies to both',()=>{
  const {state,first,second}=cast(),track=edge(state,first,second);
  track.controls[1]={target:.8,tolerance:.1};track.values.fill(.4);
  const tracks=relationships.allArcTracks(state);
  assert.equal(tracks.length,Object.keys(state.tracks).length+1);assert.ok(tracks.includes(track));
  insertSlot(state,1,{id:'new',text:'',source:'human'});
  assert.equal(track.controls[1],null);assert.equal(track.controls[2].target,.8);assert.equal(track.values[1],null);
  removeSlot(state,1);assert.equal(track.controls[1].target,.8);assert.equal(track.values.length,state.slots.length);
  for(const arc of relationships.allArcTracks(state))arc.values.fill(.4);
  invalidateScores(state,1);
  for(const arc of relationships.allArcTracks(state)){assert.equal(arc.values[0],.4);assert.equal(arc.values[1],null);}
  const key=relationships.relationshipKey(first,second,'trust'),individual=Object.keys(state.tracks)[0];
  applyScores(state,[{index:1,values:{[key]:.9,[individual]:.6}}]);
  assert.equal(track.values[1],.9);assert.equal(state.tracks[individual].values[1],.6);
});

test('renaming either endpoint clears incident scores; removal and history preserve unrelated edges',()=>{
  const {state,first,second,third}=cast();
  const outgoing=edge(state,first,second),incoming=edge(state,third,first),unrelated=edge(state,second,third);
  for(const track of [outgoing,incoming,unrelated])track.values.fill(.7);
  renameCharacter(state,first,'Miles');
  assert.ok(outgoing.values.every(v=>v===null));assert.ok(incoming.values.every(v=>v===null));assert.equal(unrelated.values[0],.7);
  const old=structuredClone(state);removeCharacter(state,first);
  assert.deepEqual(Object.values(state.relationshipTracks),[unrelated]);
  assert.equal(relationships.relationshipView(state).character.name,'Maya → Joe');
  const restored=migrateSaved({draft:state,history:[{draft:old}]}).history[0].draft;
  assert.equal(Object.keys(restored.relationshipTracks).length,3);
  state.activeRelationshipKey=relationships.relationshipKey(second,third,'trust');removeCharacter(state,third);
  assert.equal(state.activeRelationshipKey,null);assert.equal(relationships.relationshipView(state),null);
});

test('saved relationship validation rejects malformed maps, endpoints, keys and values',()=>{
  const {state,first,second}=cast();edge(state,first,second);
  assert.doesNotThrow(()=>assertDraft(state));assert.deepEqual(upgradeDraft(state),state);
  const key=Object.keys(state.relationshipTracks)[0];
  const mutations=[
    s=>s.relationshipTracks=null,s=>s.relationshipTracks=[],
    s=>s.relationshipTracks[key].characterId='missing',
    s=>s.relationshipTracks[key].targetCharacterId=first,
    s=>s.relationshipTracks[key].dimensionId='mood',
    s=>{s.relationshipTracks.wrong=s.relationshipTracks[key];delete s.relationshipTracks[key];},
    s=>s.relationshipTracks[key].values.pop(),
    s=>s.relationshipTracks[key].controls={},
    s=>s.relationshipTracks[key].values[0]=1.1,
    s=>s.relationshipTracks[key].controls[0]={target:.4,tolerance:-.1},
    s=>s.activeRelationshipKey='missing',
  ];
  for(const mutate of mutations){const invalid=structuredClone(state);mutate(invalid);assert.throws(()=>upgradeDraft(invalid),/relationship/i);}
});
