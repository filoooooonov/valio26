import assert from 'node:assert/strict';
import { chromium } from '../../video/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';

const browser=await chromium.launch();const results=[];
try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){

    const context=await browser.newContext({viewport});const page=await context.newPage();page.setDefaultTimeout(10000);const calls=[];const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',async route=>{
      const r=route.request(),url=new URL(r.url());calls.push(url.pathname);
      if(url.pathname.endsWith('/image'))return route.fulfill({json:{url:null}});
      const response=await fetch("http://127.0.0.1:8795"+url.pathname+url.search,{method:r.method(),headers:{'Content-Type':'application/json'},...(r.postData()?{body:r.postData()}:{})});
      return route.fulfill({status:response.status,body:await response.text(),contentType:'application/json'});
    });
    console.log('Verify viewport',viewport.width);await page.goto('http://localhost:5173/');await page.getByRole('textbox').last().waitFor();
    await page.screenshot({path:`artifacts/commerce-verification/home-${viewport.width}.png`,fullPage:true});
    const composer=page.locator('textarea').last();await composer.fill('20 litres of lactose-free milk delivered 2026-11-16');await composer.press('Enter');
    if(viewport.width<600)await page.getByRole('tab',{name:/Order/}).click();
    await page.getByRole('heading',{name:/Your purchase/}).waitFor();
    assert(!calls.includes('/api/menu'));assert(!await page.getByRole('group',{name:'Guests',exact:true}).count());
    await page.waitForTimeout(600);
    await page.screenshot({path:`artifacts/commerce-verification/direct-${viewport.width}.png`,fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(viewport.width===1440){
      await page.getByRole('button',{name:/Review and confirm/}).click();await page.getByRole('button',{name:/^Place order/}).click();
      await page.getByRole('heading',{name:'Order complete',exact:true}).waitFor();
      await page.screenshot({path:'artifacts/commerce-verification/confirmed-1440.png',fullPage:true});
      assert(await page.getByText(/Nothing has been submitted to Valio Aimo/).count());
    }
    await page.goto('http://localhost:5173/?view=mikko');await page.getByText('Purchasing policy',{exact:true}).click();
    await page.getByRole('heading',{name:'Customer purchasing policy'}).waitFor();
    await page.screenshot({path:`artifacts/commerce-verification/policy-${viewport.width}.png`,fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.goto('http://localhost:5173/?view=schedules');await page.getByRole('heading',{name:'Scheduled menus',exact:true}).waitFor();
    await page.screenshot({path:`artifacts/commerce-verification/scheduled-${viewport.width}.png`,fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    results.push({viewport,directBypassesMenu:true,directHidesGuestControls:true,existingScheduledPagePreserved:true,noOverflow:true,pageErrors:errors});assert.deepEqual(errors,[]);
    await context.close();
  }
}finally{await browser.close();}
writeFileSync('artifacts/commerce-verification/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
