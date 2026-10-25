'use client';
import {useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {ChatMarkdown} from '@/components/chat/ChatMarkdown';
import type {LearningDocument} from '@/lib/learning-response';

/** Opaque-origin iframe, no credentials, network, external scripts, forms or host bridge. */
export function InteractiveArtifact({html, summary}: {html:string;summary:string|null}) {
  const [running,setRunning]=useState(false);const [instance,setInstance]=useState(0);
  useEffect(()=>{if(!running)return;const timer=setTimeout(()=>setRunning(false),60000);return()=>clearTimeout(timer);},[running,instance]);
  const csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  // The first CSP intersects any subsequent policy. Model-supplied markup cannot relax it.
  const doc=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px/1.6 system-ui;color:#263b34;background:#fbfcfa;padding:20px}button,input{font:inherit}button{cursor:pointer}</style></head><body>${html}</body></html>`;
  return <section className="rounded-xl border p-4"><div className="mb-3 flex flex-wrap gap-3 print:hidden"><button className="focus-ring rounded-lg border px-3 py-2 text-sm" onClick={()=>{setInstance(v=>v+1);setRunning(true);}}>{running?'Restart simulation':'Run simulation'}</button>{running&&<button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setRunning(false)}>Stop</button>}<span className="self-center text-xs text-muted">Runs locally · pauses after one minute</span></div>{running?<iframe key={instance} title="Interactive learning simulation" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={doc} className="h-[560px] w-full rounded-lg border print:hidden"/>:<p className="text-sm text-muted">{summary??'Start the simulation to explore the example.'}</p>}<p className="hidden print:block">{summary}</p></section>;
}
export function ComponentArtifact({body, document}: {body:string|null;document:LearningDocument|null}) {
  return <ChatMarkdown text={body??''} document={document}/>;
}
export function ArtifactActions({slug,sessionId,turnId}: {slug:string;sessionId?:string;turnId?:string}) {
  const [revisions,setRevisions]=useState<{createdAt:string;snapshot:{body?:string;summary?:string;format?:string}}[]|null>(null);
  const [error,setError]=useState('');const root=useRef<HTMLDivElement>(null);
  return <div ref={root} className="my-5 print:hidden"><div className="flex flex-wrap gap-3 text-xs"><a href={`/api/artifacts/${encodeURIComponent(slug)}/export`} className="rounded-lg border px-3 py-2">Download</a><button className="rounded-lg border px-3 py-2" onClick={()=>window.print()}>Print / save PDF</button><button className="rounded-lg border px-3 py-2" onClick={async()=>{try{const r=await fetch(`/api/artifacts/${encodeURIComponent(slug)}/revisions`);if(!r.ok)throw Error();setRevisions(await r.json());}catch{setError('Could not load revisions.');}}}>Revision history</button>{sessionId&&<Link href={`/chat/${sessionId}${turnId?`?turn=${turnId}`:''}`} className="rounded-lg border px-3 py-2 text-accent">Source conversation →</Link>}</div>{error&&<p role="alert">{error}</p>}{revisions&&<details open className="mt-4 rounded-lg border p-3"><summary className="cursor-pointer text-sm">Previous revisions ({revisions.length})</summary>{revisions.map((r,i)=><details key={i} className="mt-3 border-t pt-3"><summary className="cursor-pointer text-xs">{new Date(r.createdAt).toLocaleString()}</summary><p className="mt-2 text-sm">{r.snapshot.summary}</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-soft p-3 text-xs">{r.snapshot.body}</pre></details>)}</details>}</div>;
}
