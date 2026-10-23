import pages from "../data/pages.json";
import posts from "../data/posts.json";
import products from "../data/products.json";

export interface Entry {
  id: number;
  slug: string;
  title: string;
  date: string;
  modified: string;
  content: string;
  excerpt: string;
  description: string | null;
  seoTitle: string | null;
  image: string | null;
  categories: string[];
}

export type Product = (typeof products)[number];

export const allPages = pages as Entry[];
export const allPosts = posts as Entry[];
export const allProducts = (products as Product[]).filter((p) => p.active);

export const formatPrice = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export const formatDate = (iso: string) =>
  new Date(iso.replace(" ", "T") + "Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

/** Plain-text summary for meta descriptions and cards. */
export function summarize(entry: Pick<Entry, "description" | "excerpt" | "content">, length = 160): string {
  const text = (entry.description || entry.excerpt || entry.content)
    .replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > length ? text.slice(0, length - 1).replace(/\s+\S*$/, "") + "…" : text;
}
