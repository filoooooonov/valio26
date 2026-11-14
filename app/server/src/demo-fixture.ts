import { getProduct } from './catalog';
import { setFetcher } from './valio';

/** Explicit local fixture for reproducible exception demos. Real sponsor product IDs; synthetic facts. */
export function installSyntheticFacts() {
  const control={milkPrice:1,blocked:new Set<string>()};
  setFetcher((async(url:string,init:RequestInit)=>{
    const ids=JSON.parse(String(init.body)).products as string[];
    const products=ids.map(productId=>{
      const p=getProduct(productId);
      const unit=p?.unit==='KG'?'KG':p?.size?.unit==='L'?'L':'KG';
      const size=p?.unit==='KG'?1:p?.size?.qty ?? 1;
      const price=/milk/i.test(p?.en ?? '')?control.milkPrice:10;
      return String(url).endsWith('/price')?{
        productId,netPriceFound:true,catalogPrice:{value:price,valueWithTax:price*1.135},comparisonPrice:{value:price/size},comparisonUnit:unit,tax:{taxRate:13.5},
      }:{productId,logisticModel:'Stock',closingTime:'2099-01-01T00:00:00Z',scheduleLines:control.blocked.has(productId)?[]:[{availableDate:'2026-11-16',availableAmount:100000,salesUnit:p?.unit ?? 'ST'}]};
    });
    return new Response(JSON.stringify({products,timeNow:'2026-11-14T12:00:00Z'}));
  }) as typeof fetch);
  return control;
}
