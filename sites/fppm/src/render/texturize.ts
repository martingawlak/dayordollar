/**
 * What WordPress's block theme does to a page after the shortcodes have run
 * (get_the_block_template_html(): wptexturize, convert_smilies,
 * wp_filter_content_tags over the whole template), applied here to the
 * plugin's output — the rest of the frame was cut already processed.
 * Ported from WordPress 7.1.5 (wp-includes/formatting.php, media.php) for
 * the cases the plugin's markup and its members' text reach: no shortcodes
 * are left in the text, and only <img> tags without width/height (so only
 * decoding="async" is ever added).
 */

const SPACES = "(?:[\\r\\n\\t ]|\\u00A0|&nbsp;)";
const OPEN_Q = "&#8220;", CLOSE_Q = "&#8221;", APOS = "&#8217;", PRIME = "&#8242;", DPRIME = "&#8243;", OPEN_SQ = "&#8216;", CLOSE_SQ = "&#8217;";
const EN = "&#8211;", EM = "&#8212;";
const OQ_FLAG = "<!--oq-->", OSQ_FLAG = "<!--osq-->", APOS_FLAG = "<!--apos-->";

const STATIC: [string, string][] = [["...", "&#8230;"], ["``", OPEN_Q], ["''", CLOSE_Q], [" (tm)", " &#8482;"],
  ...("'tain't,'twere,'twas,'tis,'twill,'til,'bout,'nuff,'round,'cause,'em".split(",").map((w, i) =>
    [w, "&#8217;tain&#8217;t,&#8217;twere,&#8217;twas,&#8217;tis,&#8217;twill,&#8217;til,&#8217;bout,&#8217;nuff,&#8217;round,&#8217;cause,&#8217;em".split(",")[i]] as [string, string]))];

/** PHP's \Z: the end, or just before a final newline. */
const Z = "(?=\\n?$)";
const DYN_APOS: [RegExp, string][] = [
  [new RegExp("'(\\d\\d)'(?=" + Z + "|[.,:;!?)}\\-\\]]|&gt;|" + SPACES + ")", "g"), APOS_FLAG + "$1" + CLOSE_SQ],
  [new RegExp("'(\\d\\d)\"(?=" + Z + "|[.,:;!?)}\\-\\]]|&gt;|" + SPACES + ")", "g"), APOS_FLAG + "$1" + CLOSE_Q],
  [new RegExp("'(?=\\d\\d(?:" + Z + "|(?![%\\d]|[.,]\\d)))", "g"), APOS_FLAG],
  [new RegExp("(?<=^|" + SPACES + ")'(\\d[.,\\d]*)'", "g"), OSQ_FLAG + "$1" + CLOSE_SQ],
  [new RegExp("(?<=^|[([{\"\\-]|&lt;|" + SPACES + ")'", "g"), OSQ_FLAG],
  [new RegExp("(?<!" + SPACES + ")'(?!" + Z + "|[.,:;!?\"'(){}[\\]\\-]|&[lg]t;|" + SPACES + ")", "g"), APOS_FLAG],
];
const DYN_QUOTE: [RegExp, string][] = [
  [new RegExp("(?<=^|" + SPACES + ")\"(\\d[.,\\d]*)\"", "g"), OQ_FLAG + "$1" + CLOSE_Q],
  [new RegExp("(?<=^|[([{\\-]|&lt;|" + SPACES + ")\"(?!" + SPACES + ")", "g"), OQ_FLAG],
];
const DYN_DASH: [RegExp, string][] = [
  [/---/g, EM],
  [new RegExp("(?<=^|" + SPACES + ")--(?=$|" + SPACES + ")", "g"), EM],
  [/(?<!xn)--/g, EN],
  [new RegExp("(?<=^|" + SPACES + ")-(?=$|" + SPACES + ")", "g"), EN],
];
const AMP = /&(?!#(?:\d+|x[a-f0-9]+);|[a-z1-4]{1,8};)/gi;
const NO_TEXTURIZE = ["pre", "code", "kbd", "style", "script", "tt"];

/** The split: HTML comments and elements as delimiters (_get_wptexturize_split_regex() without shortcodes). */
function split(text: string): string[] {
  const out: string[] = [];
  const re = /<(?:!(?:-(?!->)[^-]*)*(?:-->)?|[^>]*>?)/gy;
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt < 0) { out.push(text.slice(i)); break; }
    if (lt > i) out.push(text.slice(i, lt));
    let m: RegExpExecArray | null;
    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      const stop = end < 0 ? text.length : end + 3;
      out.push(text.slice(lt, stop)); i = stop; continue;
    }
    re.lastIndex = lt;
    m = re.exec(text);
    const tok = m ? m[0] : "<";
    out.push(tok); i = lt + tok.length;
  }
  return out;
}

function pushpop(tag: string, stack: string[]): void {
  let opening: boolean, offset: number;
  if (tag.length > 1 && tag[1] !== "/") { opening = true; offset = 1; }
  else if (stack.length === 0) return;
  else { opening = false; offset = 2; }
  const sp = tag.indexOf(" ");
  const name = sp < 0 ? tag.slice(offset, -1) : tag.slice(offset, sp);
  if (NO_TEXTURIZE.includes(name)) {
    if (opening) stack.push(name);
    else if (stack[stack.length - 1] === name) stack.pop();
  }
}

function primes(haystack: string, needle: string, prime: string, openQuote: string, closeQuote: string): string {
  const flag = "<!--wp-prime-or-quote-->";
  const quote = () => new RegExp(needle + "(?=" + Z + "|[.,:;!?)}\\-\\]]|&gt;|" + SPACES + ")", "g");
  const primeRe = () => new RegExp("(?<=\\d)" + needle, "g");
  const sentences = haystack.split(openQuote);
  sentences.forEach((s0, key) => {
    let s = s0;
    if (!s.includes(needle)) return;
    if (key !== 0 && !s.includes(closeQuote)) {
      let count = 0;
      s = s.replace(quote(), () => { count++; return flag; });
      if (count > 1) {
        let count2 = 0;
        s = s.replace(new RegExp("(?<!\\d)" + flag, "g"), () => { count2++; return closeQuote; });
        if (count2 === 0) {
          const pos = s.includes(flag + ".") ? s.lastIndexOf(flag + ".") : s.lastIndexOf(flag);
          s = s.slice(0, pos) + closeQuote + s.slice(pos + flag.length);
        }
        s = s.replace(primeRe(), prime).replace(new RegExp("(?<=\\d)" + flag, "g"), prime).split(flag).join(closeQuote);
      } else if (count === 1) {
        s = s.split(flag).join(closeQuote).replace(primeRe(), prime);
      } else {
        s = s.replace(primeRe(), prime);
      }
    } else {
      s = s.replace(primeRe(), prime).replace(quote(), closeQuote);
    }
    if (needle === '"' && s.includes('"')) s = s.split('"').join(closeQuote);
    sentences[key] = s;
  });
  return sentences.join(openQuote);
}

/** wptexturize(). */
export function wptexturize(text: string): string {
  if (!text) return text;
  const stack: string[] = [];
  const parts = split(text);
  for (let i = 0; i < parts.length; i++) {
    let curl = parts[i];
    if (curl === "") continue;
    if (curl[0] === "<") {
      if (curl.startsWith("<!--")) continue;
      curl = curl.replace(AMP, "&#038;");
      pushpop(curl, stack);
    } else if (curl.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "") === "") {
      continue;
    } else if (stack.length === 0) {
      for (const [a, b] of STATIC) curl = curl.split(a).join(b);
      if (curl.includes("'")) {
        for (const [re, r] of DYN_APOS) curl = curl.replace(re, r);
        curl = primes(curl, "'", PRIME, OSQ_FLAG, CLOSE_SQ);
        curl = curl.split(APOS_FLAG).join(APOS).split(OSQ_FLAG).join(OPEN_SQ);
      }
      if (curl.includes('"')) {
        for (const [re, r] of DYN_QUOTE) curl = curl.replace(re, r);
        curl = primes(curl, '"', DPRIME, OQ_FLAG, CLOSE_Q);
        curl = curl.split(OQ_FLAG).join(OPEN_Q);
      }
      if (curl.includes("-")) for (const [re, r] of DYN_DASH) curl = curl.replace(re, r);
      if (/(?<=\d)x\d/.test(curl)) curl = curl.replace(/\b(\d(?:(?<=0)[\d.,]+|(?<!0)[\d.,]*))x(\d[\d.,]*)\b/g, "$1&#215;$2");
      curl = curl.replace(AMP, "&#038;");
    }
    parts[i] = curl;
  }
  return parts.join("");
}

/* ---- convert_smilies() (use_smilies is on): text smileys between spaces become emoji ---- */
const SMILIES: Record<string, string> = {
  ":mrgreen:": "mrgreen.png", ":neutral:": "😐", ":twisted:": "😈", ":arrow:": "➡", ":shock:": "😯", ":smile:": "🙂", ":???:": "😕", ":cool:": "😎", ":evil:": "👿",
  ":grin:": "😀", ":idea:": "💡", ":oops:": "😳", ":razz:": "😛", ":roll:": "🙄", ":wink:": "😉", ":cry:": "😥", ":eek:": "😮", ":lol:": "😆", ":mad:": "😡", ":sad:": "🙁",
  "8-)": "😎", "8-O": "😯", ":-(": "🙁", ":-)": "🙂", ":-?": "😕", ":-D": "😀", ":-P": "😛", ":-o": "😮", ":-x": "😡", ":-|": "😐", ";-)": "😉",
  "8O": "😯", ":(": "🙁", ":)": "🙂", ":?": "😕", ":D": "😀", ":P": "😛", ":o": "😮", ":x": "😡", ":|": "😐", ";)": "😉", ":!:": "❗", ":?:": "❓",
};
const quoteRe = (s: string) => s.replace(/[.\\+*?[^\]$(){}=!<>|:\-#/]/g, "\\$&");
const SMILEY_RE = (() => {
  // krsort(): keys in reverse byte order, grouped by first character.
  const keys = Object.keys(SMILIES).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  let re = "(?<=" + SPACES + "|^)", sub = "";
  for (const k of keys) {
    const first = k[0], rest = k.slice(1);
    if (first !== sub) {
      if (sub !== "") re += ")(?=" + SPACES + "|$)|(?<=" + SPACES + "|^)";
      sub = first;
      re += quoteRe(first) + "(?:";
    } else re += "|";
    re += quoteRe(rest);
  }
  return new RegExp(re + ")(?=" + SPACES + "|$)", "gm");
})();
export function convertSmilies(text: string, siteUrl: string): string {
  const parts = text.split(/(<[^>]*?>)/);
  let ignore = "", out = "";
  for (const content0 of parts) {
    let content = content0;
    if (ignore === "") { const m = /^<(code|pre|style|script|textarea)[^>]*>/.exec(content); if (m) ignore = m[1]; }
    if (ignore === "" && content.length > 0 && content[0] !== "<") {
      content = content.replace(SMILEY_RE, (m) => {
        const smiley = m.trim(), img = SMILIES[smiley];
        if (!/\.(png)$/i.test(img)) return img;
        return '<img src="' + siteUrl + "/wp-includes/images/smilies/" + img + '" alt="' + smiley + '" class="wp-smiley" style="height: 1em; max-height: 1em;" />';
      });
    }
    if (ignore !== "" && content === "</" + ignore + ">") ignore = "";
    out += content;
  }
  return out;
}

/** wp_filter_content_tags() for images without width/height: decoding="async" when none is given. */
export function filterContentTags(text: string): string {
  const seen = new Set<string>();
  for (const m of text.matchAll(/<img\s[^>]+>/g)) {
    const tag = m[0];
    if (seen.has(tag)) continue;
    seen.add(tag);
    if (/ decoding=["'][A-Za-z]+["']/.test(tag) || !tag.includes(' src="') || / width="/.test(tag) && / height="/.test(tag)) continue;
    text = text.split(tag).join(tag.replace(/<img/g, '<img decoding="async"'));
  }
  return text;
}

/** The three, in WordPress's order. */
export const templateFilters = (html: string, siteUrl: string) => filterContentTags(convertSmilies(wptexturize(html), siteUrl));
