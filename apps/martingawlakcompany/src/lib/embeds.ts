/**
 * Replace the placeholders the WordPress exporter leaves for plugin shortcodes
 * with this site's own components.
 */
const contactForm = `
<form class="contact-form" method="post" action="/api/contact">
  <label>Name <input name="name" required autocomplete="name"></label>
  <label>Email <input name="email" type="email" required autocomplete="email"></label>
  <label>Phone <input name="phone" type="tel" autocomplete="tel"></label>
  <label>Message <textarea name="message" rows="5" required></textarea></label>
  <label class="hp" aria-hidden="true">Company <input name="company" tabindex="-1" autocomplete="off"></label>
  <button class="button" type="submit">Send message</button>
</form>`;

const zora = `
<div class="callout">
  <p>Collect and trade Martin Gawlak Company's creator coins on Zora.</p>
  <a class="button" href="https://zora.co/@martingawlak" rel="noopener" target="_blank">Open on Zora</a>
</div>`;

export function renderEmbeds(html: string): string {
  return html
    .replace(/<div data-embed="contact-form"><\/div>/g, contactForm)
    .replace(/<div data-embed="zora"><\/div>/g, zora);
}
