import type { Basket, BasketLine, Dish } from './api';

export function recipeLines(basket: Basket, dish: Dish): BasketLine[] {
  return basket.lines.filter(line => line.qty > 0 && (line.dishId === dish.id || line.usedIn?.includes(dish.name)));
}

export function recipeSteps(dish: Dish, lines: BasketLine[]): string[] {
  const name = dish.name.toLowerCase();
  const has = (pattern: RegExp) => lines.some(line => pattern.test(line.name));
  const vegetables = [has(/potato|peruna/i) ? 'potatoes' : '', has(/carrot|porkkana/i) ? 'carrots' : '', has(/leek|purjo/i) ? 'leeks' : '', has(/onion|sipuli/i) ? 'onions' : ''].filter(Boolean).join(', ');
  const fishLines = lines.filter(line => /salmon|trout|fish|lohi|kala/i.test(line.name) && !/stock|bouillon|broth|powder|sauce|liemi|fond/i.test(line.name));
  const fish = fishLines.length ? /trout|kirjolohi/i.test(fishLines[0].name) ? 'trout' : /salmon|lohi/i.test(fishLines[0].name) ? 'salmon' : 'fish' : '';
  const cream = has(/cream|kerma/i) ? 'cream' : has(/milk|maito/i) ? 'milk' : '';
  if (/soup|keitto/.test(name)) return [
    vegetables ? `Wash, peel where needed, and chop ${vegetables} into even pieces.` : 'Prepare the listed vegetables in even pieces.',
    'Cook the vegetables in water or your usual stock until nearly tender.',
    ...(fish ? [`Cut ${fish} into portions. Add to the soup and simmer gently until cooked through.`] : []),
    ...(cream ? [`Stir in ${cream} near the end and heat gently.`] : []),
    'Use the listed herbs and your kitchen seasonings to finish. Portion for the guest count shown.',
  ];
  if (/lentil|stew|curry|linssi/.test(name)) return [
    'Rinse dry lentils and prepare the listed vegetables. Drain any canned ingredients.',
    'Soften the chopped vegetables in a little kitchen oil, then add your selected spices.',
    'Add the lentils, any listed tomato products, and enough water or stock to simmer. Cook until the lentils and vegetables are tender.',
    'Adjust the consistency and seasoning, then divide into the portions shown.',
  ];
  if (/salad|salaatti/.test(name)) return [
    'Wash and drain the listed salad vegetables well.',
    'Chop the ingredients into bite-sized pieces and keep any separate dietary portions apart.',
    'Combine close to serving. Add your usual dressing only if it suits the confirmed dietary requirements.',
  ];
  if (/bread|croissant|sandwich|leip/.test(name)) return [
    'Prepare the bread or pastries according to the pack instructions; thaw or bake where required.',
    'Slice or portion, then add the listed spread and fillings shortly before serving.',
    'Keep dietary variations separate and divide into the portions shown.',
  ];
  if (/pie|cake|dessert|piirakka/.test(name)) {
    const readyMade = lines.some(line => /pie|cake|piirakka|torttu/i.test(line.name));
    return readyMade ? ['Thaw or bake the prepared dessert according to its pack instructions.', 'Cut into the portions shown and serve with any listed accompaniments.'] : [
      'Prepare your usual pastry or cake base with the listed baking ingredients, following your kitchen recipe for the dish.',
      'Add the listed fruit or berries and bake according to that recipe.',
      'Let it cool before portioning. Serve any listed accompaniments separately.',
    ];
  }
  return ['Prepare the listed products according to their pack instructions and your kitchen recipe for this dish.', 'Combine and portion for the guest count shown, keeping dietary variations separate.'];
}
