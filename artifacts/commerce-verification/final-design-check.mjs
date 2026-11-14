import assert from 'node:assert/strict';
import {chromium} from '../../video/node_modules/playwright/index.mjs';
import {writeFileSync} from 'node:fs';
const base='http://localhost:5173';
const quote=await fetch(base+'/api/basket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request:'1000 litres lactose-free milk',date:'2026-11-16'})});assert.equal(quote.status,200);const basket=await quote.json();
const browser=await chromium.launch(),results=[];
try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const context=await browser.newContext({viewport}),page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/?b='+basket.id);if(viewport.width<600)await page.getByRole('tab',{name:/Order/}).click();
 const comparison=page.getByRole('region',{name:'Compare product options',exact:true});await comparison.waitFor();await page.waitForTimeout(400);
 assert.equal(await page.getByText('Scheduled menus',{exact:true}).count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if(viewport.width===1440){const prices=await page.locator('.purchase-option__pricing').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().top));assert(Math.abs(prices[0]-prices[1])<2);}
 await page.screenshot({path:`artifacts/commerce-verification/final-design-${viewport.width}.png`,fullPage:true});
 const why=page.getByRole('button',{name:'Why these products?',exact:true});await why.click();await page.getByRole('dialog',{name:'Why these products?',exact:true}).waitFor();await page.waitForTimeout(300);
 assert((await page.getByRole('dialog').innerText()).includes('12 products'));
 await page.screenshot({path:`artifacts/commerce-verification/final-evidence-${viewport.width}.png`,fullPage:true});
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});assert(await why.evaluate(e=>e===document.activeElement));
 const changedResponse=page.waitForResponse(r=>r.url().includes('/lines/')&&r.request().method()==='POST');await comparison.getByRole('button',{name:/^Choose /}).first().click();const changed=await (await changedResponse).json();assert.equal(changed.lines.length,1);assert.notEqual(changed.lines[0].sku,basket.lines[0].sku);
 await page.waitForFunction(()=>[...document.querySelectorAll('.purchase-option button')].some(b=>!b.disabled));
 const undoneResponse=page.waitForResponse(r=>r.url().endsWith('/undo')&&r.request().method()==='POST');await page.keyboard.press('Control+z');const undone=await (await undoneResponse).json();assert.equal(undone.basket.lines[0].sku,basket.lines[0].sku);
 await page.goto(base+'/?view=schedules');assert.equal(await page.getByRole('heading',{name:'Scheduled menus',exact:true}).count(),0);await page.locator('textarea').waitFor();
 await page.goto(base+'/?view=mikko');await page.getByText('Purchasing policy',{exact:true}).first().click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 results.push({viewport,noScheduledMenus:true,alignedPrices:true,noOverflow:true,evidenceDialogAndFocus:true,selectionAndUndo:true,pageErrors:errors});assert.deepEqual(errors,[]);await context.close();
}}finally{await browser.close();}
writeFileSync('artifacts/commerce-verification/final-design-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({basketId:basket.id,checks:results},null,2));
