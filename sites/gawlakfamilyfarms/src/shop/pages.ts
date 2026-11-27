/**
 * The shop's pages, in WooCommerce's own markup and class names so the
 * theme's shop styles still apply: the product grid (/shop/) and a product
 * page (/product/<slug>/) whose variation picker posts "Buy now" to
 * /shop/checkout. Same file on every site.
 */
import { money, type Product } from "./catalog";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]!);
const price = (cents: number) =>
  `<span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">&#36;</span>${esc(money(cents).slice(1))}</bdi></span>`;
/** "$100.00", or "$45.00 – $60.00" when the options differ. */
function priceRange(p: Product): string {
  const all = p.variations.length ? p.variations.map((v) => v.price) : [p.price];
  const lo = Math.min(...all), hi = Math.max(...all);
  return lo === hi ? price(lo) : `${price(lo)} <span aria-hidden="true">&ndash;</span> ${price(hi)}`;
}

/** /shop/: every product, as WooCommerce's product grid. */
export function shopGrid(products: Product[], origin: string): string {
  return '<div class="woocommerce"><ul class="products columns-3">'
    + products.map((p) => {
      const url = `${origin}/product/${p.slug}/`;
      return `<li class="product type-product post-${p.id} ${p.variations.length ? "product-type-variable" : "product-type-simple"}">`
        + `<a href="${esc(url)}" class="woocommerce-LoopProduct-link woocommerce-loop-product__link">`
        + (p.image ? `<img src="${esc(p.image)}" class="attachment-woocommerce_thumbnail size-woocommerce_thumbnail" alt="${esc(p.name)}" loading="lazy">` : "")
        + `<h2 class="woocommerce-loop-product__title">${esc(p.name)}</h2><span class="price">${priceRange(p)}</span></a>`
        + `<a href="${esc(url)}" class="button wp-element-button product_type_${p.variations.length ? "variable" : "simple"}">${p.variations.length ? "Choose options" : "Buy now"}</a></li>`;
    }).join("")
    + "</ul></div>";
}

/** /product/<slug>/: gallery, title, price, short description, the options and "Buy now", the description. */
export function productPage(p: Product): string {
  const images = [p.image, ...p.gallery].filter(Boolean) as string[];
  const gallery = '<div class="woocommerce-product-gallery images">'
    + images.map((src, i) => `<div class="woocommerce-product-gallery__image"><img src="${esc(src)}" alt="${esc(p.name)}"${i ? ' loading="lazy"' : ' class="wp-post-image" data-shop-main'}></div>`).join("")
    + "</div>";
  const options = p.attributes.map((a) =>
    `<tr><th class="label"><label for="${esc(a.name)}">${esc(a.label)}</label></th><td class="value"><select id="${esc(a.name)}" name="attribute_${esc(a.name)}" data-attribute_name="${esc(a.name)}" required>`
    + '<option value="">Choose an option</option>' + a.options.map((o) => `<option value="${esc(o.slug)}">${esc(o.label)}</option>`).join("")
    + "</select></td></tr>").join("");
  const variations = p.variations.map((v) => ({ id: v.id, attributes: v.attributes, price: money(v.price), image: v.image }));
  const form = `<form class="${p.variations.length ? "variations_form cart" : "cart"}" action="/shop/checkout" method="post" data-shop-variations="${esc(JSON.stringify(variations))}">`
    + `<input type="hidden" name="product" value="${esc(p.slug)}">`
    + (p.variations.length ? `<table class="variations" role="presentation"><tbody>${options}</tbody></table><input type="hidden" name="variation" value="">` : "")
    + '<div class="quantity"><label class="screen-reader-text" for="shop-qty">Quantity</label><input type="number" id="shop-qty" class="input-text qty text" name="quantity" value="1" min="1" max="20" step="1" inputmode="numeric"></div> '
    + `<button type="submit" class="single_add_to_cart_button button alt wp-element-button"${p.variations.length ? " disabled" : ""}>Buy now</button>`
    + '<p class="shop-fine">Secure checkout with Stripe. Card, Apple Pay or Google Pay.</p></form>'
    + (p.variations.length ? VARIATION_JS : "");
  return `<div class="woocommerce"><div id="product-${p.id}" class="product type-product post-${p.id} ${p.variations.length ? "product-type-variable" : "product-type-simple"}">`
    + gallery
    + '<div class="summary entry-summary">'
    + `<h1 class="product_title entry-title">${esc(p.name)}</h1>`
    + `<p class="price" data-shop-price>${priceRange(p)}</p>`
    + (p.short_description ? `<div class="woocommerce-product-details__short-description">${p.short_description}</div>` : "")
    + form + "</div>"
    + (p.description ? `<div class="woocommerce-tabs"><h2>Description</h2><div class="woocommerce-Tabs-panel">${p.description}</div></div>` : "")
    + "</div></div>";
}

/** The variation picker: the chosen options find their variation; its price and picture show; "Buy now" waits until one matches. */
const VARIATION_JS = `<script>(function(){var f=document.currentScript.previousElementSibling;if(!f)return;
var vs=JSON.parse(f.getAttribute('data-shop-variations')||'[]'),sel=f.querySelectorAll('select[data-attribute_name]'),
hid=f.querySelector('input[name="variation"]'),btn=f.querySelector('button[type="submit"]'),pr=document.querySelector('[data-shop-price]'),
img=document.querySelector('[data-shop-main]'),pr0=pr?pr.innerHTML:'',img0=img?img.src:'';
function pick(){var want={};sel.forEach(function(s){want[s.getAttribute('data-attribute_name')]=s.value;});
var v=vs.find(function(x){return Object.keys(want).every(function(k){return want[k]!==''&&x.attributes[k]===want[k];});});
hid.value=v?v.id:'';btn.disabled=!v;if(pr)pr.innerHTML=v?'<span class="woocommerce-Price-amount amount"><bdi>'+v.price+'</bdi></span>':pr0;
if(img)img.src=v&&v.image?v.image:img0;}
sel.forEach(function(s){s.addEventListener('change',pick);});})();</script>`;

/** The page after paying. */
export const thanksPage = (site: string) =>
  `<div class="woocommerce"><div class="woocommerce-order"><p class="woocommerce-notice woocommerce-notice--success woocommerce-thankyou-order-received">Thank you. Your order on ${esc(site)} is paid.</p>`
  + "<p>A receipt is on its way to your email. We&rsquo;ll email you again when it ships.</p></div></div>";

/** "Your orders" on the account page: every site's orders. */
export function ordersTable(lines: { site: string; date: string; item: string; amount: number; currency: string }[], shopUrl: string): string {
  if (!lines.length) return `<div class="woocommerce-info">No order has been made yet. <a class="woocommerce-Button button" href="${esc(shopUrl)}">Browse products</a></div>`;
  return '<table class="woocommerce-orders-table shop_table shop_table_responsive"><thead><tr><th>Date</th><th>Site</th><th>Order</th><th>Total</th></tr></thead><tbody>'
    + lines.map((l) => `<tr><td>${esc(l.date)}</td><td>${esc(l.site)}</td><td>${esc(l.item)}</td><td>${esc(money(l.amount))} ${esc(l.currency.toUpperCase())}</td></tr>`).join("")
    + "</tbody></table>";
}
