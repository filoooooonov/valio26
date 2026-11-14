import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const out=resolve(process.env.DEMO_VIDEO_OUT??resolve(import.meta.dirname,'../../artifacts/demo-video/smooth'));
const timeline=JSON.parse(readFileSync(resolve(out,'timeline.json'),'utf8'));
const FPS=60,TRANSITION=0.45;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=t=>t*t*t*(t*(t*6-15)+10);
const frameSeconds=n=>Math.round(n*FPS)/FPS;
const run=args=>execFileSync('ffmpeg',['-y','-loglevel','error',...args],{cwd:out,stdio:'inherit'});
const probe=file=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',file],{encoding:'utf8'})).format.duration*1;
const clips=timeline.clips.map((c,i)=>({...c,i,seconds:frameSeconds(Math.max(c.seconds,c.id==='external'?9.5:c.id==='intro'?4.5:c.id==='outro'?5:4))}));
const boundaries=clips.slice(1).filter((c,i)=>c.id!==clips[i].id).length;
let wanted=clips.reduce((s,c)=>s+c.seconds,0)-boundaries*TRANSITION;
if(wanted>120)throw Error('Readable cut exceeds 120 seconds; shorten idle holds in the recording rather than accelerate actions');
function camera(c,initial={x:.5,y:.5,zoom:1},returnWide=false){
 const ratio=Math.min(1,c.seconds/(c.end-c.start));
 const controls=[{at:0,duration:0,x:.5,y:.5,zoom:1}];
 const events=(c.events??[]).filter(e=>e.type==='focus').map(e=>({...e,at:Math.max(0,e.at*ratio),duration:Math.max(.75,(e.duration??1)*ratio)})).sort((a,b)=>a.at-b.at);
 // Camera state carries across contiguous clips; quintic smoothstep has zero speed and acceleration at endpoints.
 for(const e of events){const at=clamp(e.at,0,c.seconds-1.05);controls.push({at,duration:Math.min(1.25,e.duration),x:clamp(e.x??.5,0,1),y:clamp(e.y??.5,0,1),zoom:clamp(e.zoom??1.35,1,1.45)});}
 if(returnWide)controls.push({at:c.seconds-.95,duration:.95,x:.5,y:.5,zoom:1});
 controls.sort((a,b)=>a.at-b.at);
 const transitions=[];let state={...initial};
 const valueAt=t=>{let v={...initial};for(const tr of transitions){if(t<tr.at)break;const f=smooth(clamp((t-tr.at)/tr.duration,0,1));v={x:tr.from.x+(tr.to.x-tr.from.x)*f,y:tr.from.y+(tr.to.y-tr.from.y)*f,zoom:tr.from.zoom+(tr.to.zoom-tr.from.zoom)*f};}return v;};
 for(const point of controls.slice(1)){state=valueAt(point.at);transitions.push({at:point.at,duration:point.duration,from:state,to:{x:point.x,y:point.y,zoom:point.zoom}});}
 function expression(key){let expr=String(initial[key]);for(const tr of transitions){const u=`min(1,max(0,(on/${FPS}-${tr.at.toFixed(6)})/${tr.duration.toFixed(6)}))`;const easing=`(${u}*${u}*${u}*(${u}*(${u}*6-15)+10))`;const v=`(${tr.from[key].toFixed(6)}+(${tr.to[key]-tr.from[key]})*${easing})`;expr=`if(gte(on/${FPS},${tr.at.toFixed(6)}),${v},${expr})`;}return expr;}
 return {transitions,endState:valueAt(c.seconds),z:expression('zoom'),x:expression('x'),y:expression('y')};
}
const segments=[];let previousMotion=null,previousSource=null;
for(const c of clips){
 if(!existsSync(c.source))throw Error('Missing source '+c.source);
 const motion=camera(c,previousSource===c.source?previousMotion.endState:undefined,clips[c.i+1]?.source!==c.source);previousMotion=motion;previousSource=c.source;const file=resolve(out,`smooth-clip-${c.i}.mp4`);const raw=c.end-c.start;
 const filter=`setpts=${Math.min(1,c.seconds/raw)}*(PTS-STARTPTS),fps=${FPS},tpad=stop_mode=clone:stop_duration=${c.seconds},scale=3840:2160:flags=lanczos,zoompan=z='${motion.z}':x='max(0,min(iw-iw/zoom,iw*(${motion.x})-iw/zoom/2))':y='max(0,min(ih-ih/zoom,ih*(${motion.y})-ih/zoom/2))':d=1:s=1920x1080:fps=${FPS},setsar=1,format=yuv420p`;
 let source=c.source;if(!c.still){source=resolve(out,'smooth-raw-'+c.i+'.mp4');run(['-ss',String(c.start),'-i',c.source,'-t',String(raw),'-an','-c:v','libx264','-preset','ultrafast','-crf','15','-threads','2',source]);}
 const input=c.still?['-loop','1','-framerate',String(FPS),'-i',c.still]:['-i',source];
 const vf=c.still?'fps=60,scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p':filter;
 run([...input,'-t',String(c.seconds),'-vf',vf,'-an','-c:v','libx264','-preset','veryfast','-crf','19','-threads','2',file]);
 segments.push({...c,file,seconds:probe(file),camera:motion.transitions});
 console.log(`Rendered clip ${c.i+1}/${clips.length}: ${c.caption}`);
}
const groups=[];
for(const c of segments){let g=groups.at(-1);if(!g||g.id!==c.id){g={id:c.id,clips:[],seconds:0};groups.push(g);}g.clips.push(c);g.seconds+=c.seconds;}
for(const [i,g] of groups.entries()){
 const list=resolve(out,`smooth-group-${i}.txt`);writeFileSync(list,g.clips.map(c=>`file '${c.file.replaceAll('\\','/')}'`).join('\n'));
 g.file=resolve(out,`smooth-group-${i}.mp4`);run(['-f','concat','-safe','0','-i',list,'-c','copy',g.file]);g.seconds=probe(g.file);
}
let duration=0;const captions=[];const stamp=n=>`${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${(n%60).toFixed(2).padStart(5,'0')}`;
for(const [i,g]of groups.entries()){
 if(i)duration-=TRANSITION;let local=0;
 for(const c of g.clips){const focus=(c.events??[]).find(e=>e.type==='focus'&&e.zoom>1);const style=focus?.y>.65?'Top':'Default';
 const a=duration+local+.18,b=duration+local+c.seconds-.12;
 captions.push(`Dialogue: 0,${stamp(a)},${stamp(b)},${style},,0,0,0,,{\\fad(220,180)}${c.caption.replaceAll('\\','').replaceAll('{','').replaceAll('}','').replaceAll('\n','\\N')}`);local+=c.seconds;}
 duration+=g.seconds;
}
if(duration>120)throw Error(`Movie exceeds 120s: ${duration}`);
const styles=['Default,2','Top,8'].map(row=>{const[name,alignment]=row.split(',');return `Style: ${name},Arial,36,&H00FFFFFF,&H000000FF,&H00252F2F,&H00252F2F,0,0,0,0,100,100,0,0,3,12,0,${alignment},100,100,38,1`}).join('\n');
writeFileSync(resolve(out,'captions-smooth.ass'),`[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n${styles}\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${captions.join('\n')}\n`);
const inputs=groups.flatMap(g=>['-i',g.file]);let chain='',last='0:v',elapsed=groups[0].seconds;
for(let i=1;i<groups.length;i++){const label=`mix${i}`;chain+=`[${last}][${i}:v]xfade=transition=fade:duration=${TRANSITION}:offset=${(elapsed-TRANSITION).toFixed(6)}[${label}];`;last=label;elapsed+=groups[i].seconds-TRANSITION;}
chain+=`[${last}]ass=captions-smooth.ass,format=yuv420p[final]`;
run(['-filter_complex_threads','1',...inputs,'-filter_complex',chain,'-map','[final]','-an','-c:v','libx264','-crf','18','-preset','veryfast','-threads','2','-movflags','+faststart','final-smooth.mp4']);
writeFileSync(resolve(out,'render-smooth.json'),JSON.stringify({fps:FPS,easing:'quintic smoothstep',transitionSeconds:TRANSITION,duration:probe(resolve(out,'final-smooth.mp4')),segments:segments.map(({source,file,...c})=>c),groups:groups.map(({clips,file,...g})=>g)},null,2));
console.log(`Rendered ${resolve(out,'final-smooth.mp4')} (${probe(resolve(out,'final-smooth.mp4')).toFixed(2)}s, 1080p60, eased camera and scene crossfades)`);
