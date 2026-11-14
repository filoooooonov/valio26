import {chromium} from '../../video/node_modules/playwright/index.mjs';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch();const results=[];
try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const context=await browser.newContext({viewport});const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5173/?b=b_n1drmd');if(viewport.width<600)await page.getByRole('tab',{name:/Order/}).click();
 await page.getByRole('heading',{name:'Compare product options',exact:true}).waitFor();await page.waitForTimeout(600);
 await page.getByRole('heading',{name:'Compare product options',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/commerce-verification/comparison-live-${viewport.width}.png`,fullPage:true});
 const before=await (await page.request.get('http://localhost:5173/api/basket/b_n1drmd')).json();
 const selection=page.getByRole('button',{name:'Select for review',exact:true}).first();assert.equal(await selection.isEnabled(),true);
 const changedResponse=page.waitForResponse(r=>r.url().includes('/lines/') && r.request().method()==='POST');await selection.click();const changed=await (await changedResponse).json();assert.equal(changed.lines.length,1);assert.notEqual(changed.lines[0].sku,before.lines[0].sku);assert.notEqual(changed.total,before.total);
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Select for review')&&!b.disabled));
 const undoResponse=page.waitForResponse(r=>r.url().endsWith('/undo') && r.request().method()==='POST');await page.keyboard.press('Control+z');const restored=await (await undoResponse).json();assert.equal(restored.basket.lines[0].sku,before.lines[0].sku);
 console.log('Viewport',viewport.width,'comparison shown, alternative selected, one cart line retained, undo restored.');
 results.push({viewport,noOverflow:await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),comparisonVisible:true,selectionAndUndoVerified:true,pageErrors:errors});
 await context.close();
}}finally{await browser.close();}writeFileSync('artifacts/commerce-verification/comparison-browser.json',JSON.stringify(results,null,2));
