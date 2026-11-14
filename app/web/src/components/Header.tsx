import { Icon } from "../icons";
import { money } from "../format";

const LOGO =
  "https://cdn-wp.valio.fi/valio-wp-network/sites/2/2025/06/Valio_Aimo_logo_petrooli_RGB-1.svg";

// The existing Aimo webshop chrome: teal strip + white bar. The assistant lives inside the cart page.
export function Header({ cartTotal }: { cartTotal: number }) {
  return (
    <header className="shop-header">
      <div className="shop-strip">
        <a className="shop-strip__tab" href="#">
          Delivery wholesale
        </a>
        <span className="shop-strip__who">
          Hotelli Kaleva, Kamppi · Anna Korhonen, head chef
        </span>
        <span className="shop-strip__lang">EN</span>
      </div>
      <div className="shop-bar">
        <a className="shop-bar__logo" href="#" title="Valio Aimo">
          <img src={LOGO} alt="Valio Aimo" />
        </a>
        <label className="shop-search">
          <Icon name="search" size={22} />
          <input placeholder="Search products" aria-label="Search products" />
        </label>
        <a className="shop-bar__link" href="#">
          <Icon name="box" size={22} /> Orders
        </a>
        <a className="shop-bar__link" href="#">
          <Icon name="heart" size={22} /> Favourites
        </a>
        <span className="shop-bar__cart">
          <Icon name="cart" size={22} /> {money(cartTotal)}
        </span>
      </div>
    </header>
  );
}
