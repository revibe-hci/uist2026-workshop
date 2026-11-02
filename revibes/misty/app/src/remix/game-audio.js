// Original game-like audio. No microphone, downloads, or third-party soundtrack.
export async function createGameAudio(){
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('Audio is unavailable in this browser.');
  const ctx=new Audio(),destination=ctx.createMediaStreamDestination(),master=ctx.createGain();master.gain.value=.28;master.connect(ctx.destination);master.connect(destination);await ctx.resume();
  let sources=[];
  function stop(){sources.forEach(s=>{try{s.stop();}catch{}s.disconnect();});sources=[];}
  function tone(at,f,duration=.18,volume=.2,type='sine'){
    const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(f,at);osc.frequency.exponentialRampToValueAtTime(f*.75,at+duration);gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.008);gain.gain.exponentialRampToValueAtTime(.001,at+duration);osc.connect(gain);gain.connect(master);osc.start(at);osc.stop(at+duration+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();};sources.push(osc);
  }
  function play(waves=2){stop();const start=ctx.currentTime+.03,stretch=waves===1?6.6/3.6:1;
    (waves===1?[0]:[0,3.6]).forEach(base=>{[.55,.73,.91].forEach((at,i)=>tone(start+base+at*stretch,650+i*170,.09,.16,'triangle'));tone(start+base+1.85*stretch,190,.35,.26,'sawtooth');tone(start+base+2.35*stretch,75,.26,.55,'triangle');[2.88,3.05].forEach((at,i)=>tone(start+base+at*stretch,750+i*220,.28,.32));});
    for(let k=0;k<16;k++)tone(start+k*.45,[164.8,220,246.9,329.6][k%4],.14,.07,'triangle');
    [659.25,830.61,987.77,1318.5].forEach((f,i)=>tone(start+8.1+i*.09,f,.55,.32));
  }
  return {play,stop,stream:destination.stream,dispose(){stop();master.disconnect();destination.disconnect();ctx.close().catch(()=>{});}};
}
