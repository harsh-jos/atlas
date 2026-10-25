import {apiGet} from '@/lib/api';
export async function GET(_request:Request,{params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;const result=await apiGet<{content:string;mime:string;extension:string}>(`/artifacts/${encodeURIComponent(slug)}/export`);
  const name=slug.replace(/[^a-z0-9_-]/gi,'_').slice(0,150);
  return new Response(result.content,{headers:{'Content-Type':`${result.mime}; charset=utf-8`,'Content-Disposition':`attachment; filename="${name}.${result.extension}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
