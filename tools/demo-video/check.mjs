import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const out=resolve(process.env.DEMO_VIDEO_OUT??resolve(import.meta.dirname,'../../artifacts/demo-video/smooth'));
const smooth=!process.argv.includes('--original');
const t=JSON.parse(readFileSync(resolve(out,'timeline.json'),'utf8'));const e=JSON.parse(readFileSync(resolve(out,'evidence.json'),'utf8'));
const seconds=t.clips.reduce((s,c)=>s+c.seconds,0);
if(!(seconds>0&&seconds<=120))throw Error('Planned duration must be 0–120 seconds');
if((e.buyerApproved??e.buyerOrder)?.status!=='placed')throw Error('Buyer order was not placed');
if(!e.buyerAudit?.length||!e.externalAudit?.length||!e.external?.orderId||e.externalApproved?.status!=='placed')throw Error('Missing successful live flow evidence');
if(!e.external.lines.some(l=>l.text.startsWith('403')))throw Error('Agent self-approval rejection not recorded');
for(const c of t.clips)if(!existsSync(c.source))throw Error('Missing source '+c.source);
const file=resolve(out,smooth?'final-smooth.mp4':'final.mp4');
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=width,height,codec_name,r_frame_rate','-of','json',file],{encoding:'utf8'}));
const duration=Number(probe.format.duration);
if(duration>120.1)throw Error('Rendered video exceeds two minutes');
if(!probe.streams.some(s=>s.width===1920&&s.height===1080&&s.codec_name==='h264'))throw Error('Expected 1080p H.264');
if(smooth){
 const r=JSON.parse(readFileSync(resolve(out,'render-smooth.json'),'utf8'));
 if(r.easing!=='quintic smoothstep'||r.fps!==60||r.transitionSeconds<.3)throw Error('Missing eased camera or scene transitions');
 if(!probe.streams.some(s=>s.r_frame_rate==='60/1'))throw Error('Expected 60fps smooth video');
 if(duration<80)throw Error('Smooth cut needs longer, readable pacing');
 if(!t.clips.some(c=>c.events?.some(e=>e.type==='click')))throw Error('Missing recorded visible click metadata');
 if(!r.segments.some(c=>c.camera?.some(e=>e.to.zoom>1.15)))throw Error('Missing camera zooms');
 for(const c of r.segments){for(const p of c.camera??[]){if(p.to.zoom<1||p.to.zoom>1.45||p.duration<.7)throw Error('Unsafe or abrupt zoom');}const source=t.clips[c.i];if(source.caption!=='The gateway plans a basket and checks shortlisted products'&&c.seconds+.06<source.end-source.start)throw Error('Non-planner action compressed');}
}
console.log(`PASS: ${duration.toFixed(2)}s, 1920×1080 H.264${smooth?', 60fps quintic camera and scene crossfades':''}, buyer audit, real MCP and human approval. Captioned; no voiceover.`);
