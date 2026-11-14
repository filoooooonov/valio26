// Visible, eased human-paced browser actions. Camera coordinates use viewport fractions.
export function installCursor() {
 if(document.getElementById('demo-motion-cursor'))return;
 const style=document.createElement('style');style.textContent='html,body,body *{cursor:none!important}.demo-click-ring{position:fixed;width:46px;height:46px;border:3px solid #c2e32c;border-radius:50%;pointer-events:none;z-index:2147483646;box-sizing:border-box;animation:demo-click .65s cubic-bezier(.16,1,.3,1) forwards}@keyframes demo-click{from{transform:translate(-50%,-50%) scale(.25);opacity:1}to{transform:translate(-50%,-50%) scale(2.3);opacity:0}}';document.documentElement.append(style);
 const cursor=document.createElement('div');cursor.id='demo-motion-cursor';cursor.style.cssText='position:fixed;left:56px;top:70px;width:50px;height:50px;pointer-events:none;z-index:2147483647;filter:drop-shadow(0 3px 3px #002c2c88);will-change:transform';
 cursor.innerHTML='<svg width="50" height="50" viewBox="0 0 50 50"><circle cx="17" cy="19" r="18" fill="#c2e32c" fill-opacity=".22"/><path d="M10 5L12 37L20 29L26 42L33 38L26 25L38 24Z" fill="white" stroke="#003d3c" stroke-width="2.5" stroke-linejoin="round"/></svg>';document.documentElement.append(cursor);
 const place=(x,y)=>{cursor.style.left=(x-10)+'px';cursor.style.top=(y-5)+'px';window.__demoPointer={x,y};};
 const saved=sessionStorage.getItem('demo-pointer');if(saved){try{const p=JSON.parse(saved);place(p.x,p.y)}catch{}}
 document.addEventListener('mousemove',e=>{place(e.clientX,e.clientY);sessionStorage.setItem('demo-pointer',JSON.stringify({x:e.clientX,y:e.clientY}));},true);
 document.addEventListener('mousedown',e=>{const ring=document.createElement('div');ring.className='demo-click-ring';ring.style.left=e.clientX+'px';ring.style.top=e.clientY+'px';document.documentElement.append(ring);setTimeout(()=>ring.remove(),700);cursor.style.transform='scale(.86)'},true);
 document.addEventListener('mouseup',()=>{cursor.style.transition='transform .18s ease-out';cursor.style.transform='scale(1)'},true);
}
const ease=t=>t*t*t*(t*(t*6-15)+10); // quintic smootherstep: zero velocity/acceleration at endpoints
export function createMotion(page,emit) {
 let pointer={x:66,y:75};
 const pause=ms=>page.waitForTimeout(ms);
 async function ensure(){await page.evaluate(installCursor);const saved=await page.evaluate(()=>window.__demoPointer);if(saved)pointer=saved;}
 async function move(x,y){await ensure();const from={...pointer},distance=Math.hypot(x-from.x,y-from.y),ms=Math.min(1100,800+distance*.15);const steps=Math.ceil(ms/20);for(let i=1;i<=steps;i++){const t=ease(i/steps);await page.mouse.move(from.x+(x-from.x)*t,from.y+(y-from.y)*t);await pause(ms/steps);}pointer={x,y};}
 async function focus(locator,zoom=1.32){
  await locator.waitFor({state:'visible',timeout:20000});await ensure();
  await locator.evaluate(async el=>{const root=el.closest('.chat__thread,.chat__body,.order__body,.mikko__list');let node=el.parentElement;let scroller=null;while(node){const c=getComputedStyle(node);if(/auto|scroll/.test(c.overflowY)&&node.scrollHeight>node.clientHeight+2){scroller=node;break;}node=node.parentElement;}
   const r=el.getBoundingClientRect(),host=scroller?.getBoundingClientRect(),height=host?.height??innerHeight,top=host?.top??0;const delta=r.top-top-height*.46+r.height*.5;
   if(Math.abs(delta)<50||(!scroller&&document.documentElement.scrollHeight<=innerHeight))return;
   const from=scroller?scroller.scrollTop:scrollY;const maximum=scroller?scroller.scrollHeight-scroller.clientHeight:document.documentElement.scrollHeight-innerHeight;const to=Math.max(0,Math.min(maximum,from+delta));
   await new Promise(resolve=>{const start=performance.now();function tick(now){const p=Math.min(1,(now-start)/800),e=p*p*p*(p*(p*6-15)+10);if(scroller)scroller.scrollTop=from+(to-from)*e;else scrollTo(0,from+(to-from)*e);if(p<1)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});
  });
  const box=await locator.boundingBox();if(!box)throw Error('Target has no visible bounds');const v=page.viewportSize();const x=Math.max(10,Math.min(v.width-10,box.x+box.width*.5)),y=Math.max(10,Math.min(v.height-10,box.y+box.height*.5));emit({type:'focus',x:x/v.width,y:y/v.height,zoom,duration:.95});await move(x,y);await pause(250);return{x,y};
 }
 async function click(locator){const{x,y}=await focus(locator);await locator.waitFor({state:'visible'});if(!await locator.isEnabled())throw Error('Motion target is disabled');const v=page.viewportSize();emit({type:'click',x:x/v.width,y:y/v.height,zoom:1.32,duration:.9});await page.mouse.down();await pause(120);await page.mouse.up();await pause(700);}
 async function type(locator,text){await click(locator);await locator.fill('');const v=page.viewportSize();emit({type:'type',x:pointer.x/v.width,y:pointer.y/v.height,zoom:1.42,duration:.9});await locator.pressSequentially(text,{delay:35});await pause(500);}
 async function wide(){emit({type:'focus',x:.5,y:.5,zoom:1,duration:1.1});await pause(1100);}
 async function goto(url){await wide();await page.goto(url);await ensure();await pause(550);}
 return{click,type,focus,wide,goto};
}
