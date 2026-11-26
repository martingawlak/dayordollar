/**
 * WordPress's wpautop() and shortcode_unautop() (wp-includes/formatting.php,
 * 6.9), ported line by line: Beaver Builder's rich-text modules run their
 * text through them before the shortcodes, so the page's paragraphs and line
 * breaks come out as they did on the live site.
 */

const ALLBLOCKS = "(?:table|thead|tfoot|caption|col|colgroup|tbody|tr|td|th|div|dl|dd|dt|ul|ol|li|pre|form|map|area|blockquote|address|style|p|h[1-6]|hr|fieldset|legend|section|article|aside|hgroup|header|footer|nav|figure|figcaption|details|menu|summary)";

/** wp_html_split(): text and elements (tags, comments, CDATA) alternating; elements at odd indexes. */
export function htmlSplit(input: string): string[] {
  return input.split(/(<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<[^>]*>?)/);
}

/** wp_replace_in_html_tags() for one needle. */
function replaceInHtmlTags(haystack: string, needle: string, replace: string): string {
  const parts = htmlSplit(haystack);
  let changed = false;
  for (let i = 1; i < parts.length; i += 2) {
    if (parts[i].includes(needle)) { parts[i] = parts[i].split(needle).join(replace); changed = true; }
  }
  return changed ? parts.join("") : haystack;
}

export function wpautop(text: string, br = true): string {
  const preTags: [string, string][] = [];
  if (text.trim() === "") return "";
  text = text + "\n";
  if (text.includes("<pre")) {
    const parts = text.split("</pre>");
    const lastPart = parts.pop()!;
    text = "";
    parts.forEach((part, i) => {
      const start = part.indexOf("<pre");
      if (start === -1) { text += part; return; }
      const name = `<pre wp-pre-tag-${i}></pre>`;
      preTags.push([name, part.slice(start) + "</pre>"]);
      text += part.slice(0, start) + name;
    });
    text += lastPart;
  }
  text = text.replace(/<br\s*\/?>\s*<br\s*\/?>/g, "\n\n");
  text = text.replace(new RegExp("(<" + ALLBLOCKS + "[\\s/>])", "g"), "\n\n$1");
  text = text.replace(new RegExp("(</" + ALLBLOCKS + ">)", "g"), "$1\n\n");
  text = text.replace(/(<hr\s*?\/?>)/g, "$1\n\n");
  text = text.replace(/\r\n|\r/g, "\n");
  text = replaceInHtmlTags(text, "\n", " <!-- wpnl --> ");
  if (text.includes("<option")) {
    text = text.replace(/\s*<option/g, "<option");
    text = text.replace(/<\/option>\s*/g, "</option>");
  }
  if (text.includes("</object>")) {
    text = text.replace(/(<object[^>]*>)\s*/g, "$1");
    text = text.replace(/\s*<\/object>/g, "</object>");
    text = text.replace(/\s*(<\/?(?:param|embed)[^>]*>)\s*/g, "$1");
  }
  if (text.includes("<source") || text.includes("<track")) {
    text = text.replace(/([<[](?:audio|video)[^>\]]*[>\]])\s*/g, "$1");
    text = text.replace(/\s*([<[]\/(?:audio|video)[>\]])/g, "$1");
    text = text.replace(/\s*(<(?:source|track)[^>]*>)\s*/g, "$1");
  }
  if (text.includes("<figcaption")) {
    text = text.replace(/\s*(<figcaption[^>]*>)/g, "$1");
    text = text.replace(/<\/figcaption>\s*/g, "</figcaption>");
  }
  text = text.replace(/\n\n+/g, "\n\n");
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p !== "");
  text = "";
  for (const p of paragraphs) text += "<p>" + p.replace(/^\n+|\n+$/g, "") + "</p>\n";
  text = text.replace(/<p>\s*<\/p>/g, "");
  text = text.replace(/<p>([^<]+)<\/(div|address|form)>/g, "<p>$1</p></$2>");
  text = text.replace(new RegExp("<p>\\s*(</?" + ALLBLOCKS + "[^>]*>)\\s*</p>", "g"), "$1");
  text = text.replace(/<p>(<li.+?)<\/p>/g, "$1");
  text = text.replace(/<p><blockquote((?:[^>"']|"[^"]*"|'[^']*')*)>/gi, "<blockquote$1><p>");
  text = text.split("</blockquote></p>").join("</p></blockquote>");
  text = text.replace(new RegExp("<p>\\s*(</?" + ALLBLOCKS + "[^>]*>)", "g"), "$1");
  text = text.replace(new RegExp("(</?" + ALLBLOCKS + "[^>]*>)\\s*</p>", "g"), "$1");
  if (br) {
    text = text.replace(/<(script|style|svg|math).*?<\/\1>/gs, (m) => m.split("\n").join("<WPPreserveNewline />"));
    text = text.split("<br>").join("<br />").split("<br/>").join("<br />");
    text = text.replace(/(?<!<br \/>)\s*\n/g, "<br />\n");
    text = text.split("<WPPreserveNewline />").join("\n");
  }
  text = text.replace(new RegExp("(</?" + ALLBLOCKS + "[^>]*>)\\s*<br />", "g"), "$1");
  text = text.replace(/<br \/>(\s*<\/?(?:p|li|div|dl|dd|dt|th|pre|td|ul|ol)[^>]*>)/g, "$1");
  text = text.replace(/\n<\/p>$/, "</p>");
  for (const [name, html] of preTags) text = text.split(name).join(html);
  if (text.includes("<!-- wpnl -->")) text = text.split(" <!-- wpnl --> ").join("\n").split("<!-- wpnl -->").join("\n");
  return text;
}

/** shortcode_unautop(): unwrap a paragraph that holds nothing but one registered shortcode. */
export function shortcodeUnautop(text: string, tags: string[]): string {
  if (tags.length === 0) return text;
  const tagre = tags.map((t) => t.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&")).join("|");
  const spaces = "(?:[\\r\\n\\t ]|\\u00a0|&nbsp;)";
  const pattern = new RegExp(
    "<p>" + spaces + "*" + "(\\[(" + tagre + ")(?![\\w-])[^\\]\\/]*(?:\\/(?!\\])[^\\]\\/]*)*?(?:\\/\\]|\\](?:[^\\[]*(?:\\[(?!\\/\\2\\])[^\\[]*)*\\[\\/\\2\\])?))" + spaces + "*<\\/p>",
    "g",
  );
  return text.replace(pattern, "$1");
}
