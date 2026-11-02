import React,{useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {Crosshair,Download,RotateCcw,Volume2,VolumeX,X} from 'lucide-react';
import {blendEvents} from './events.js';
import {useRemix} from './context.js';
import {createGameRenderer} from './game-renderer.js';
import {createGameAudio} from './game-audio.js';
import {useModalFocus} from './modal.js';

function Arena({session,onClose}){
  const ref=useRef(null),canvas=useRef(null),renderer=useRef(null),audio=useRef(null),recorder=useRef(null),recordTimer=useRef(null);
  const {reduced}=useRemix();const [recording,setRecording]=useState(false),[audioOn,setAudioOn]=useState(false),[message,setMessage]=useState(''),[isReplay,setIsReplay]=useState(!!session.replayOnly);
  useModalFocus(ref,onClose);
  useEffect(()=>{if(!reduced)renderer.current=createGameRenderer(canvas.current);return()=>{renderer.current?.dispose();renderer.current=null;audio.current?.dispose();audio.current=null;clearTimeout(recordTimer.current);if(recorder.current?.state==='recording')recorder.current.stop();};},[reduced]);
  useEffect(()=>{renderer.current?.update({phase:session.phase,assets:session.assets,replay:isReplay,label:session.blendLabel});},[session,isReplay]);
  const enableAudio=async()=>{if(!audio.current)audio.current=await createGameAudio();setAudioOn(true);return audio.current;};
  const waves=Math.max(1,Math.min(2,session.assets?.sourceRegions?.length||1));
  const replay=()=>{setIsReplay(true);renderer.current?.restart();if(audioOn)audio.current?.play(waves);};
  const record=async()=>{
    if(!canvas.current.captureStream||!window.MediaRecorder){setMessage('Recording is unavailable in this browser. Use Chrome or Edge.');return;}
    try{
      const engine=await enableAudio(),video=canvas.current.captureStream(30);
      const combined=new MediaStream([...video.getVideoTracks(),...engine.stream.getAudioTracks()]);
      const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(m=>MediaRecorder.isTypeSupported(m));
      const r=new MediaRecorder(combined,mime?{mimeType:mime,videoBitsPerSecond:7000000}:undefined),chunks=[];recorder.current=r;
      r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      r.onstop=()=>{video.getTracks().forEach(t=>t.stop());setRecording(false);const blob=new Blob(chunks,{type:r.mimeType});if(!blob.size){setMessage('No video frames were captured. Open Replay blend and record again.');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Blend-Raiders-real-blend-10s.${r.mimeType.includes('mp4')?'mp4':'webm'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);setMessage('10-second recording downloaded. This is the current real blend.');};
      r.start(200);setIsReplay(true);renderer.current.restart();engine.play(waves);setRecording(true);setMessage('Recording the real blend replay with game audio…');recordTimer.current=setTimeout(()=>r.stop(),10000);
    }catch(e){setMessage(e.message);setRecording(false);}
  };
  return <div className="rm-arena-backdrop"><section ref={ref} className="rm-arena" role="dialog" aria-modal="true" aria-label="Live blend arena">
    <header><div><Crosshair size={18}/><strong>Blend Raiders</strong><span>{session.replayOnly?'Replay of your real generated result':'Connected to the live Misty blend'}</span></div><button type="button" aria-label="Close blend arena" disabled={recording} onClick={onClose}><X size={19}/></button></header>
    {reduced?<div className="rm-arena-static"><h2>Reduced motion is on</h2><p>Your real result remains on the canvas. Turn off the game view to use static progress.</p></div>:<canvas ref={canvas} aria-label="Actual source, selected reference and generated result with game-style transfer agents"/>}
    <footer><div className="rm-arena-buttons"><button type="button" disabled={!session.assets?.result||recording||reduced} onClick={replay}><RotateCcw size={15}/>Replay assembly</button><button type="button" aria-pressed={audioOn} onClick={async()=>{try{if(audioOn){audio.current?.stop();setAudioOn(false);}else{const e=await enableAudio();e.play(waves);}}catch(e){setMessage(e.message);}}}>{audioOn?<Volume2 size={15}/>:<VolumeX size={15}/>} {audioOn?'Mute game audio':'Enable game audio'}</button><button type="button" className="rm-record" disabled={!session.assets?.result||recording||reduced} onClick={record}><Download size={15}/>{recording?'Recording 10 seconds…':'Record 10s + sound'}</button></div><p role="status">{message||session.error||'Actual input screenshots and model output. Replay makes no new model call.'}</p></footer>
  </section></div>;
}
export default function BlendArena(){
  useSyncExternalStore(blendEvents.subscribe,blendEvents.getRevision,()=>0);
  const {flags,reduced}=useRemix(),[open,setOpen]=useState(null),seen=useRef(new Set());
  const sessions=blendEvents.getAll();
  useEffect(()=>{for(const s of sessions){const key=`${s.id}:${s.run}:${s.viewRequest||0}`;if(!s.rehearsal&&s.arena&&!seen.current.has(key)){seen.current.add(key);if((flags.game&&flags.builders&&!reduced)||s.replayOnly)setOpen({id:s.id,run:s.run});}}},[sessions,flags.game,flags.builders,reduced]);
  const session=open&&sessions.find(s=>s.id===open.id&&s.run===open.run);
  return session?<Arena key={`${session.id}:${session.run}`} session={session} onClose={()=>setOpen(null)}/>:null;
}
