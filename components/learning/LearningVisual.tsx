'use client';

import { useId, useSyncExternalStore, type ReactNode } from 'react';
import { askAbout, type LearningVisual as Visual } from '@/lib/learning-response';

const memory = new Map<string,string>();
const subscribe = (callback:()=>void) => {window.addEventListener('atlas:visual-state',callback);return()=>window.removeEventListener('atlas:visual-state',callback);};
function useVisualState(key:string, initial:string):[string,(value:string)=>void] {
  const value=useSyncExternalStore(subscribe,()=>{try{return sessionStorage.getItem(key)??memory.get(key)??initial;}catch{return memory.get(key)??initial;}},()=>initial);
  return [value,next=>{memory.set(key,next);try{sessionStorage.setItem(key,next);}catch{/* Optional local state. */}window.dispatchEvent(new Event('atlas:visual-state'));}];
}

const button = 'focus-ring rounded-lg border px-3 py-1.5 text-xs text-muted hover:bg-accent-soft disabled:opacity-40';
function Ask({text}: {text: string}) { return <button type="button" className={button} onClick={() => askAbout(text)}>Explain this part</button>; }
function Diagram({v,stateKey}: {v: Visual;stateKey:string}) {
  const [selected, setSelected] = useVisualState(stateKey,v.nodes![0].id);
  const nodes = v.nodes!;
  const node = nodes.find(n => n.id === selected) ?? nodes[0];
  const marker = useId().replaceAll(':', '');
  // Bounded topological layers; cycles stay in a separate last layer and remain inspectable.
  const layers = new Map<string, number>();
  for (let pass = 0; pass < nodes.length; pass++) {
    for (const n of nodes) {
      const parents = v.edges!.filter(e => e.target === n.id).map(e => e.source);
      if (!layers.has(n.id) && parents.every(p => layers.has(p))) layers.set(n.id, parents.length ? Math.max(...parents.map(p => layers.get(p)!)) + 1 : 0);
    }
  }
  for (const n of nodes) if (!layers.has(n.id)) layers.set(n.id, nodes.length);
  const levels = [...new Set(layers.values())].sort((a,b) => a-b);
  const width = Math.max(360,...levels.map(level=>nodes.filter(n=>layers.get(n.id)===level).length*184+40));
  const points = new Map<string, {x:number;y:number}>();
  levels.forEach((level, i) => {
    const members = nodes.filter(n => layers.get(n.id) === level);
    members.forEach((n, j) => points.set(n.id, {x:(j+1)*width/(members.length+1), y:42+i*100}));
  });
  const height = levels.length*100;
  return <>
    <div className="max-h-[480px] overflow-auto"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={v.fallback} className="mx-auto block w-full" style={{minWidth:width,height}}>
      <defs><marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#65847d" /></marker></defs>
      {v.edges!.map((e,i) => { const a=points.get(e.source)!; const b=points.get(e.target)!; return <g key={i}><path d={`M${a.x},${a.y+19} L${b.x},${b.y-22}`} stroke="#65847d" strokeWidth="1.5" markerEnd={`url(#${marker})`} /><text x={(a.x+b.x)/2+8} y={(a.y+b.y)/2} fontSize="11" fill="#52615e">{e.label}</text></g>; })}
      {nodes.map(n => {const p=points.get(n.id)!; return <g key={n.id} role="button" tabIndex={0} aria-label={n.label} aria-pressed={selected===n.id} onClick={() => setSelected(n.id)} onKeyDown={e => {if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(n.id);}}} className="cursor-pointer focus:outline-2"><rect x={p.x-82} y={p.y-20} width="164" height="40" rx="10" fill={selected===n.id?'#d8e9e3':'#f4f6f3'} stroke={selected===n.id?'#557d70':'#d4ddd7'} /><text x={p.x} y={p.y+4} textAnchor="middle" fontSize="12" fill="#263b34">{n.label.length>26?n.label.slice(0,25)+'…':n.label}</text></g>;})}
    </svg></div>
    <div className="mt-2 rounded-lg bg-surface-soft p-3 text-sm"><strong>{node.label}</strong>{node.detail && <p className="mt-1 leading-relaxed text-muted">{node.detail}</p>}</div>
    <div className="mt-3"><Ask text={`${v.title}: ${node.label}\n${node.detail ?? ''}`} /></div>
  </>;
}
function Steps({v, render,stateKey}: {v: Visual; render: (text:string)=>ReactNode;stateKey:string}) {
  const [saved,setSaved]=useVisualState(stateKey,"0");const index=Math.min(v.steps!.length-1,Math.max(0,Number(saved)||0));const setIndex=(value:number)=>setSaved(String(value));const step=v.steps![index];
  return <><ol className="mb-4 flex flex-wrap gap-2" aria-label="Steps">{v.steps!.map((s,i)=><li key={i}><button type="button" onClick={()=>setIndex(i)} className={`${button} ${i===index?'bg-accent-soft text-ink':''}`} aria-current={i===index?'step':undefined}>{i+1}. {s.title}</button></li>)}</ol><div aria-live="polite"><h4 className="font-medium">{step.title}</h4>{render(step.body)}{step.code&&<pre className="my-3 overflow-auto rounded-lg bg-surface-soft p-3 text-xs"><code>{step.code}</code></pre>}</div><div className="mt-4 flex flex-wrap items-center gap-2"><button className={button} disabled={!index} onClick={()=>setIndex(index-1)}>Previous</button><button className={button} disabled={index===v.steps!.length-1} onClick={()=>setIndex(index+1)}>Next</button><Ask text={`${v.title}, step ${index+1}: ${step.title}\n${step.body}`} /></div></>;
}
function Plot({v,stateKey}: {v: Visual;stateKey:string}) {
  const min=v.xMin!,max=v.xMax!,c=v.coefficients!;const [saved,setSaved]=useVisualState(stateKey,String(v.initialX??0));const x=Math.min(max,Math.max(min,Number(saved)||0));const setX=(value:number)=>setSaved(String(value));
  const f=(t:number)=>c.reduceRight((sum,a)=>sum*t+a,0);
  const samples=Array.from({length:121},(_,i)=>({x:min+(max-min)*i/120,y:f(min+(max-min)*i/120)}));
  const low=Math.min(...samples.map(p=>p.y)),high=Math.max(...samples.map(p=>p.y)); const span=high-low||1;
  const sx=(t:number)=>40+(t-min)/(max-min)*520,sy=(t:number)=>220-(t-low)/span*180;
  const slope=c.reduce((sum,a,i)=>sum+(i?i*a*x**(i-1):0),0);
  const number=(n:number)=>Number(n.toPrecision(5)).toString();
  return <><svg viewBox="0 0 600 260" role="img" aria-label={v.fallback} className="w-full"><path d="M40,25 V225 H570" fill="none" stroke="#a5b3ab"/><polyline points={samples.map(p=>`${sx(p.x)},${sy(p.y)}`).join(' ')} fill="none" stroke="#537e73" strokeWidth="2.5"/><circle cx={sx(x)} cy={sy(f(x))} r="5" fill="#ac7d3b"/><text x="550" y="250" fontSize="12">{v.xLabel??'x'}</text><text x="10" y="20" fontSize="12">{v.yLabel??'y'}</text><text x="40" y="245" fontSize="11">{number(min)}</text><text x="550" y="240" fontSize="11">{number(max)}</text><text x="5" y="220" fontSize="10">{number(low)}</text><text x="5" y="40" fontSize="10">{number(high)}</text></svg><label className="block text-sm">Change {v.xLabel??'x'}: <strong>{number(x)}</strong><input aria-label={`Change ${v.xLabel??'x'}`} type="range" className="mt-3 w-full accent-[#537e73]" min={min} max={max} step={(max-min)/200} value={x} onChange={e=>setX(Number(e.target.value))}/></label><p aria-live="polite" className="mt-2 font-mono text-sm">{v.yLabel??'y'} = {number(f(x))} · slope = {number(slope)}</p><p className="mt-2 text-xs text-muted">Polynomial coefficients, lowest degree first: {c.join(', ')}. Values follow this illustrative model.</p></>;
}
export function LearningVisual({visual:v, renderMarkdown,stateKey}: {visual:Visual; renderMarkdown:(text:string)=>ReactNode;stateKey:string}) {
  let body:ReactNode;
  switch(v.type){
    case 'diagram':body=<Diagram v={v} stateKey={stateKey}/>;break;
    case 'stepper':case 'worked-example':body=<Steps v={v} render={renderMarkdown} stateKey={stateKey}/>;break;
    case 'plot':body=<Plot v={v} stateKey={stateKey}/>;break;
    case 'compare':body=<div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Criterion</th>{v.columns!.map((c,i)=><th className="p-2" key={i}>{c}</th>)}</tr></thead><tbody>{v.rows!.map((r,i)=><tr key={i} className="border-t"><th className="p-2 align-top font-medium">{r.label}</th>{r.cells.map((c,j)=><td key={j} className="p-2 align-top text-muted">{c}</td>)}</tr>)}</tbody></table></div>;break;
    // Asset IDs only. The authenticated application route checks ownership.
    // eslint-disable-next-line @next/next/no-img-element
    case 'image':body=<figure><img src={`/assets/${v.assetId}`} alt={v.alt} className="h-auto w-full rounded-lg" loading="lazy"/>{v.caption&&<figcaption className="mt-3 text-sm text-muted">{v.caption}</figcaption>}</figure>;break;
    case 'details':return <details className="my-5 rounded-xl border p-4"><summary className="cursor-pointer font-medium">{v.title}</summary>{renderMarkdown(v.body!)}</details>;
  }
  return <section aria-label={v.title} className="my-5 overflow-hidden rounded-xl border bg-[#fbfcfa] p-4 sm:p-5"><h3 className="mb-4 text-sm font-semibold text-ink">{v.title}</h3>{body}</section>;
}
