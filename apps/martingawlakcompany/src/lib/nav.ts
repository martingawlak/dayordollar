/** Main navigation, carried over from the WordPress "Menu2" menu. */
export interface NavItem {
  label: string;
  href: string;
  children?: NavItem[];
}

export const nav: NavItem[] = [
  {
    label: "Marketing",
    href: "/martin-marketing/",
    children: [
      { label: "Services", href: "/services/" },
      { label: "Alpha Mason™", href: "/alpha-mason/" },
      { label: "Pricing", href: "/pricing/" },
      { label: "Marketing Library", href: "/marketing-library/" },
      { label: "Marketing Strategies", href: "/marketing-strategies/" },
      { label: "Marketing Terms", href: "/marketing-terms/" },
      { label: "Expert Perspective", href: "/expert-perspective/" },
      { label: "New Partner", href: "/new-partner/" },
    ],
  },
  { label: "Blog", href: "/blog/" },
  { label: "Shop", href: "/shop/" },
  { label: "Staff", href: "/staff/" },
  { label: "Contact", href: "/contact/" },
];
