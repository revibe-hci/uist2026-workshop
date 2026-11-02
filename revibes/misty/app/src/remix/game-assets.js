import { toPng } from 'html-to-image';

export function normalizedRect(element, root) {
  const r = element.getBoundingClientRect(), b = root.getBoundingClientRect();
  return { x: Math.max(0, (r.left-b.left)/b.width), y: Math.max(0, (r.top-b.top)/b.height), w: Math.min(1,r.width/b.width), h: Math.min(1,r.height/b.height) };
}
export function screenshotRegions(root, selected) {
  if (selected) return [{ id:'selected',kind:'selected region',label:selected.label || 'Selected target',rect:selected }];
  const candidates = [...root.querySelectorAll('header, article, h1, h3')].map(el => /^H/.test(el.tagName) ? el.parentElement : el);
  const unique = [...new Set(candidates)].filter(el => el.offsetHeight >= 30 && el.offsetWidth >= 80);
  return unique.map((el,i) => ({ id:`fragment-${i}`,kind:el.tagName.toLowerCase(),label:el.innerText?.trim().split('\n')[0]?.slice(0,70)||'UI region',rect:normalizedRect(el,root) }))
    .filter(r => r.rect.y < .9 && r.rect.h < .8).slice(0,2);
}
export async function captureGameSource(root, selected) {
  if (!root) throw new Error('Source preview is unavailable.');
  const regions=screenshotRegions(root,selected);
  const image=await toPng(root,{ pixelRatio:1.5,skipFonts:true,backgroundColor:'#fff',style:{transform:'none'},width:root.clientWidth,height:root.clientHeight });
  return { source:image,sourceRegions:regions.length?regions:[{id:'screen',label:'Screen region',rect:{x:.04,y:.08,w:.92,h:.28}}] };
}
export async function captureGameResult(root, sourceRegions=[]) {
  const elements=[...root.querySelectorAll('header,article,section,h1,h2,h3,div,p')];
  const regions=sourceRegions.map(region=>{
    const matches=elements.filter(el => el.innerText?.trim().startsWith(region.label) && el.offsetWidth>80 && el.offsetHeight>25);
    const matched=matches.sort((a,b)=>(a.offsetWidth*a.offsetHeight)-(b.offsetWidth*b.offsetHeight))[0];
    return {...region,rect:matched?normalizedRect(matched,root):region.rect};
  });
  const result=await toPng(root,{pixelRatio:1.5,skipFonts:true,backgroundColor:'#fff',style:{transform:'none'},width:root.clientWidth,height:root.clientHeight});
  return {result,resultRegions:regions};
}
