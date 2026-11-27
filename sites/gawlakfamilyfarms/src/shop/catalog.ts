/** The shop's catalogue types and lookups (the data is catalog.gen.ts, from the old WooCommerce shop). Same file on every site. */
export interface Option { slug: string; label: string }
export interface Attribute { name: string; label: string; options: Option[] }
export interface Variation { id: number; sku: string; price: number; attributes: Record<string, string>; image: string | null }
export interface Product {
  id: number; slug: string; name: string; site: string;
  /** Cents. */
  price: number; currency: string;
  /** Physical goods ship (US); a digital one would not. */
  shipping: boolean;
  image: string | null; gallery: string[];
  short_description: string; description: string;
  attributes: Attribute[]; variations: Variation[];
}

export const findProduct = (all: Product[], slug: string) => all.find((p) => p.slug === slug) ?? null;
/** The variation a buyer picked: by id, and only one that belongs to the product. */
export const findVariation = (p: Product, id: unknown) => p.variations.find((v) => String(v.id) === String(id)) ?? null;
/** "Sport Grey, S" for a variation. */
export const variationLabel = (p: Product, v: Variation) =>
  p.attributes.map((a) => a.options.find((o) => o.slug === v.attributes[a.name])?.label ?? v.attributes[a.name]).filter(Boolean).join(", ");
/** "$100.00" */
export const money = (cents: number) => "$" + (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
