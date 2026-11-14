import type { Basket } from '../api';
import { money, niceName } from '../format';
import { basketEconomics, sampleRestaurant, targetFoodCostPerGuest, verifiedSaving } from '../minunAimo';
import './minun-aimo.css';

export function MinunAimoContext({ enabled, onChange }: { enabled: boolean; onChange: (value: boolean) => void }) {
  const monthly = sampleRestaurant.monthly;
  const ebitda = monthly.revenue - monthly.ingredients - monthly.labour - monthly.otherOperatingCosts;
  return <section className="minun-context" aria-label="Minun Aimo sample restaurant context">
    <div className="minun-context__head"><span><b>Plan with your menu margins</b><span className="minun-sample">Minun Aimo · sample restaurant data</span></span><label className="minun-toggle"><input type="checkbox" checked={enabled} onChange={event => onChange(event.target.checked)} />Use sample profile</label></div>
    {enabled && <p className="minun-context__note">Aim for ingredients under {money(targetFoodCostPerGuest())} per guest while keeping your chosen menu.</p>}
    <details><summary>See the sample profile</summary><div className="minun-facts"><span>Event package, excl. VAT <b>{money(sampleRestaurant.packagePriceExVat)} / guest</b></span><span>Previous ingredient cost <b>{money(sampleRestaurant.historicalFoodCostPerGuest)} / guest</b></span><span>Food-cost target <b>{sampleRestaurant.targetFoodCostRatio * 100}% of sales</b></span><span>Monthly sales / operating EBITDA <b>{money(monthly.revenue)} / {money(ebitda)}</b></span></div><p className="minun-disclaimer">Illustrative reports for {sampleRestaurant.name}. No account connection. Sample EBITDA is sales less ingredients, labour and other operating costs; a product saving alone is not a verified profit forecast.</p></details>
  </section>;
}

export function MenuEconomics({ basket, onReview }: { basket: Basket; onReview: (lineId: string) => void }) {
  const economics = basketEconomics(basket);
  const saving = verifiedSaving(basket);
  return <section className="menu-economics" aria-label="Menu cost insight">
    <div className="menu-economics__head"><b>Your menu cost</b><span className="minun-sample">Sample Minun Aimo target · gateway product prices</span></div>
    <p><strong>{money(economics.perGuest)} per guest</strong><span> · target {money(economics.target)}</span></p>
    <p className="minun-context__note">{Math.round(economics.foodCostRatio * 100)}% of the sample {money(sampleRestaurant.packagePriceExVat)} selling price.{economics.provisional ? ' Estimate includes proposed substitutions; confirm choices before ordering.' : ' Based on the current basket; kitchen stock and waste are not included.'}</p>
    {saving ? <div className="menu-economics__suggestion"><p>Consider {niceName(saving.option.name)} instead of {niceName(saving.current)}: {money(saving.saving)} less than the original product for this basket.{saving.includedInEstimate ? ' This saving is already included in the estimate above.' : ''} Price and delivery were checked with the basket; re-check at confirmation.</p><button className="btn btn--outline btn--sm" onClick={() => onReview(saving.lineId)}>Review product option</button></div> : <p className="minun-context__note">{economics.perGuest <= economics.target ? 'The current estimate is within the sample food-cost target.' : 'Above the sample target. Review quantities or ingredient choices; no cheaper equivalent is verified yet.'}</p>}
  </section>;
}
