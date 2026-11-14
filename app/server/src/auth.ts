import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { baskets, orders } from './store';
import { HttpError } from './plan';

const PrincipalSchema = z.object({token:z.string().min(24),actor:z.string().min(1),customer:z.string().min(1),role:z.enum(['buyer','agent','approver','admin'])}).strict();
export type Principal = z.infer<typeof PrincipalSchema>;
export const authenticatedMode = () => !!process.env.COMMERCE_PRINCIPALS_JSON;
export function authenticate(request: Request): Principal | undefined {
  const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  const cookie = request.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith('commerce_session='))?.slice(17);
  const credential = bearer ?? cookie;
  if (!credential) return;
  const principals = z.array(PrincipalSchema).parse(JSON.parse(process.env.COMMERCE_PRINCIPALS_JSON ?? '[]'));
  return principals.find(p => Buffer.byteLength(p.token) === Buffer.byteLength(credential) && timingSafeEqual(Buffer.from(p.token),Buffer.from(credential)));
}
export function requirePrincipal(request: Request): Principal {
  const p = authenticate(request);
  if (!p) throw new HttpError(401,'A valid delegated purchasing credential is required.');
  // Browser-cookie mutations need a same-origin request. Bearer clients are not subject to cookie CSRF.
  if (!request.headers.has('authorization') && !['GET','HEAD'].includes(request.method)) {
    const origin=request.headers.get('origin');
    const allowed=process.env.COMMERCE_BROWSER_ORIGIN ?? new URL(request.url).origin;
    if (!origin || origin !== allowed) throw new HttpError(403,'Cross-origin cookie mutation refused.');
  }
  return p;
}
export function scopeCustomer(principal:Principal, customer:string) {
  if (principal.customer !== customer) throw new HttpError(404,'Resource not found for this account.');
}
export function scopeBasket(principal:Principal,id:string) {
  const b=baskets.get(id);
  if (!b) throw new HttpError(404,'purchase request not found');
  scopeCustomer(principal,b.customer);
  return b;
}
export function scopeOrder(principal:Principal,id:string) {
  const o=orders.get(id);
  if (!o) throw new HttpError(404,'order not found');
  scopeCustomer(principal,o.customer);
  return o;
}
export function requireApprover(p:Principal) {
  if (!['approver','admin'].includes(p.role)) throw new HttpError(403,'Only a delegated human approver may decide.');
}
