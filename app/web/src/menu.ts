import { samplePlanningContext } from './minunAimo';
import { requirementsText, type EventRequirements } from './requirements';
import type { DeliveryChoice } from './components/DeliveryPicker';
import type { MenuItem } from './api';
export type MenuCategory = { id: string; title: string; description: string; selected: boolean; course?: MenuItem['course'] };
export type MenuDraft = { request: string; categories: MenuCategory[]; useMinunAimo?: boolean; requirements?: EventRequirements; delivery?: DeliveryChoice; planning?: boolean };
let seq = 0;
const category = (title: string, description: string, _index: number, course?: MenuItem['course']): MenuCategory => ({ id: 'menu-' + (++seq), title, description, selected: true, course });
/** Server menu (CONTRACT S35) -> editable categories. */
export function fromServerItems(items: MenuItem[]): MenuCategory[] {
 return items.map((item, i) => category(item.title, item.description, i, item.course));
}
/** Selected categories only: unselected ones are treated as removed when the assistant edits the menu. */
export function toServerItems(menu: MenuDraft): MenuItem[] {
 return menu.categories.filter(c => c.selected && c.title.trim()).map(c => ({ title: c.title, description: c.description, course: c.course ?? 'other' }));
}
export function suggestMenu(request: string): MenuDraft {
 const known = [
  [/salmon soup/i, 'Creamy salmon soup', 'A warm salmon soup with potatoes and a lactose-free cream option.'],
  [/rye bread/i, 'Rye bread', 'Sliced rye bread with a suitable spread.'],
  [/blueberry pie/i, 'Blueberry pie', 'Blueberry pie with a lactose-free serving option.'],
 ] as const;
 let items = known.filter(([match]) => match.test(request)).map(([, title, description], i) => category(title, description, i));
 if (!items.length && (request.includes(':') || !/catering|event|party|restock|guests|people/i.test(request))) {
  const list = (request.split(':')[1] ?? request).split(/[.;]/)[0].split(/,|\s+and\s+/i).map(s => s.trim()).filter(Boolean);
  items = list.map((title, i) => category(title, 'Select products and quantities for this part of your order.', i));
 }
 // Offline only: the gateway's /api/menu proposes the real menu. Never invent a fixed snack menu here.
 if (!items.length) items = [
  category('Starter', 'A light first course for the guests.', 0, 'starter'),
  category('Main course', 'A warm main dish with a side.', 1, 'main'),
  category('Dessert', 'A plated or shared dessert.', 2, 'dessert'),
  category('Drinks', 'Drinks in portions suitable for the guest count.', 3, 'drinks'),
 ];
 return { request, categories: items };
}
export function addCategory(menu: MenuDraft, text: string): MenuDraft {
 const title = /^(fruit|fruits)$/i.test(text.trim()) ? 'Fruits' : text.trim();
 if (!title) return menu;
 const found = menu.categories.find(c => c.title.toLowerCase() === title.toLowerCase());
 return { ...menu, categories: found ? menu.categories.map(c => c.id === found.id ? { ...c, selected: true } : c) : [...menu.categories, category(title, title === 'Fruits' ? 'Fresh seasonal fruit, easy to share and serve.' : 'Choose suitable products for this category.', menu.categories.length)] };
}
export function editMenuFromChat(menu: MenuDraft, text: string): MenuDraft | null {
 const add = text.match(/^(?:(?:please|also)\s+)*(?:add|include)\s+(?:also\s+)?(.+?)[.!]?$/i);
 if (add) return addCategory(menu, add[1]);
 const remove = text.match(/^(?:remove|skip|no|leave out)\s+(.+?)[.!]?$/i);
 if (remove) return { ...menu, categories: menu.categories.map(c => c.title.toLowerCase().includes(remove[1].toLowerCase()) ? { ...c, selected: false } : c) };
 return null;
}
export function menuSummary(menu: MenuDraft) {
 return menu.request + '\nApproved menu: ' + menu.categories.filter(c => c.selected).map(c => c.title).join(', ');
}
export function plannerRequest(menu: MenuDraft) {
 const chosen = menu.categories.filter(c => c.selected);
 const confirmed = menu.requirements ? '\nConfirmed event requirements (override any conflicting earlier assumptions): ' + requirementsText(menu.requirements) : '';
 const delivery = menu.delivery ? `\nConfirmed delivery: ${menu.delivery.address}; ${menu.delivery.date}, ${menu.delivery.time}.` : '';
 return menu.request + confirmed + delivery + '\n\nAPPROVED MENU ONLY:\n' + chosen.map(c => '- ' + c.title + ': ' + c.description).join('\n') + '\nUse ONLY the approved categories above. The initial request provides guest count, date and dietary requirements; its unapproved dishes are superseded. Do not add removed or unselected categories or extra dishes. Include products for every approved category. Keep guest quantities and dietary requirements from the request.' + (menu.useMinunAimo ? samplePlanningContext() : '');
}
export function fallbackMatchesMenu(menu: MenuDraft, dishes: { name: string }[]) {
 const norm = (s: string) => s.toLowerCase().replace(/creamy|lactose.free|[^a-z ]/g, '').trim();
 const selected = menu.categories.filter(c => c.selected);
 return selected.length === dishes.length && selected.every(c => dishes.some(d => norm(d.name).includes(norm(c.title)) || norm(c.title).includes(norm(d.name))));
}

export function displayMenuRequest(request: string) {
 const marker = '\n\nAPPROVED MENU ONLY:\n';
 const index = request.indexOf(marker);
 if (index < 0) return request;
 const categories = request.slice(index + marker.length).split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2).split(':')[0].trim());
 return request.slice(0, index) + '\nApproved menu: ' + categories.join(', ');
}
