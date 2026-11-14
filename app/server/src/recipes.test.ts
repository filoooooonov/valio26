import { expect, test } from 'bun:test';
import type { Basket, BasketLine, Dish } from '../../web/src/api';
import { recipeLines, recipeSteps } from '../../web/src/recipes';
const dish: Dish = {id:'soup', name:'Salmon soup', portions:40, basis:'', diet:[]};
const line = (id: string, name: string, qty = 1, usedIn?: string[]) => ({id, name, qty, dishId:'soup', usedIn}) as BasketLine;
test('recipe method treats fish stock as seasoning and actual fillets as fish', () => {
  const stock = line('stock','KNORR FISH BOUILLON');
  expect(recipeSteps(dish,[stock]).join(' ')).not.toContain('Cut');
  const steps = recipeSteps(dish,[stock,line('fish','SALMON FILLET C-CUT')]).join(' ');
  expect(steps).toContain('Cut salmon into portions');
  expect(steps).not.toContain('bouillon into portions');
});
test('recipe ingredients follow shared products and omit removed lines', () => {
  const shared = {...line('shared','Potato',2,['Salmon soup','Vegetable stew']), dishId:'stew'};
  const removed = line('removed','Cream',0);
  const basket = {lines:[shared,removed,line('fish','Salmon')]} as Basket;
  expect(recipeLines(basket,dish).map(item=>item.id)).toEqual(['shared','fish']);
});
