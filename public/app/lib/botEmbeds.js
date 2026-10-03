// Render structured bot cards only. No bot-supplied HTML or executable markup.
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const text = (value, max) => typeof value === "string" ? [...value].slice(0, max).join("") : "";
const mentionToken = /<@!?([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})>/gi;

// Resolve display labels only in ordinary text, never in code or link syntax.
// The bound also protects callers rendering old or malformed cached messages.
export function botMentionTokenPositions(value) {
  const source = String(value ?? "").slice(0, 8192), positions = new Set();
  const codeRanges = [...source.matchAll(/\[code\][\s\S]*?(?:\[\/code\]|$)/gi)].map(match => [match.index, match.index + match[0].length]);
  let offset = 0, fence = null, rangeIndex = 0;
  for (const line of source.split("\n")) {
    const marker = /^[ \t]*(`{3,}|~{3,})/.exec(line);
    if (fence || marker) {
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !line.slice(marker[0].length).trim()) fence = null;
      } else fence = marker[1];
      offset += line.length + 1; continue;
    }
    for (let index = 0; index < line.length;) {
      while (codeRanges[rangeIndex] && codeRanges[rangeIndex][1] <= offset + index) rangeIndex++;
      const range = codeRanges[rangeIndex];
      if (range && range[0] <= offset + index) { index = Math.min(line.length, range[1] - offset); continue; }
      if (line[index] === "\\") { index += 2; continue; }
      if (line[index] === "`") {
        const ticks = /^`+/.exec(line.slice(index))[0], closing = line.indexOf(ticks, index + ticks.length);
        if (closing < 0) break;
        index = closing + ticks.length; continue;
      }
      if (line[index] === "[") {
        let closing = index + 1, depth = 1;
        for (; closing < line.length && depth; closing++) {
          if (line[closing] === "\\") closing++;
          else if (line[closing] === "[") depth++;
          else if (line[closing] === "]") depth--;
        }
        if (!depth && line[closing] === "(") {
          depth = 1; closing++;
          for (; closing < line.length && depth; closing++) {
            if (line[closing] === "\\") closing++;
            else if (line[closing] === "(") depth++;
            else if (line[closing] === ")") depth--;
          }
          index = closing; continue;
        }
      }
      const url = /^(?:[a-z][a-z0-9+.-]{0,31}:\/\/|mailto:|javascript:|data:)[^\s]+/i.exec(line.slice(index));
      if (url) { index += url[0].length; continue; }
      const mention = /^<@!?([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})>/i.exec(line.slice(index));
      if (mention) { positions.add(offset + index); index += mention[0].length; } else index++;
    }
    offset += line.length + 1;
  }
  return positions;
}

export function renderBotMentionTokenHtml(userId, displayName) {
  const id = String(userId || '').toLowerCase();
  const name = typeof displayName === 'string' ? displayName.trim().slice(0, 256) : '';
  if (!name || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) return '';
  return `<button class="msg__mention" type="button" data-open-user-card="${id}" data-user-display="${escape(name)}" aria-label="Ver perfil de ${escape(name)}">${escape(`@${name}`)}</button>`;
}

function renderBotMentionSpans(source, resolveMention, format = escape) {
  if (typeof resolveMention !== "function" || !source.includes("<@")) return format(source);
  const positions = botMentionTokenPositions(source), replacements = [];
  let marker = "\u0000BOTMENTION";
  while (source.includes(marker)) marker += "X";
  const prepared = source.replace(mentionToken, (original, id, index) => {
    if (!positions.has(index)) return original;
    const name = resolveMention(id.toLowerCase());
    if (typeof name !== "string" || !name.trim()) return original;
    const token = `${marker}${replacements.length}\u0000`;
    replacements.push([token, renderBotMentionTokenHtml(id, name)]);
    return token;
  });
  let html = format(prepared);
  for (const [token, label] of replacements) html = html.split(token).join(label);
  return html;
}

export function botEmbedUrl(value) {
  if (typeof value !== "string" || value.length > 2048 || !/^https:\/\/[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:443)?([/?#][^\s\\]*)?$/.test(value)) return "";
  try {
    const url = new URL(value);
    if (/\.(local|localhost|internal|test|invalid)$/i.test(url.hostname) || /^[\d.]+$/.test(url.hostname)) return "";
    return url.href;
  } catch (_) { return ""; }
}

export function botMessageEmbeds(message) {
  // Ordinary human metadata can never turn into a bot card.
  if (message?.source !== "bot_channel_messages") return [];
  const embeds = message?.metadata?.embeds;
  return Array.isArray(embeds) ? embeds.slice(0,10).filter(e => e && typeof e === "object" && !Array.isArray(e)) : [];
}

function link(label, value) {
  const url = botEmbedUrl(value);
  return url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${label}</a>` : label;
}

// Each plain-text span is escaped before formatting. Links and code are tokens,
// so emphasis can never rewrite an HTML attribute or interpreted code content.
function formatBotInline(source, resolveMention = null) {
  const formatEmphasis = part => escape(part)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\p{L}\p{N}_])__([^_\n]+)__(?=$|[^\p{L}\p{N}_])/gu, '$1<strong>$2</strong>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^\p{L}\p{N}_])_([^_\n]+)_(?=$|[^\p{L}\p{N}_])/gu, '$1<em>$2</em>');
  const emphasis = part => renderBotMentionSpans(part, resolveMention, formatEmphasis);
  const tokens = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^\s\n)]+)\)/g;
  let html = "", cursor = 0;
  for (const match of source.matchAll(tokens)) {
    html += emphasis(source.slice(cursor, match.index));
    html += match[1] !== undefined
      ? `<code>${escape(match[1])}</code>`
      : botEmbedUrl(match[3]) ? link(formatEmphasis(match[2]), match[3]) : formatEmphasis(match[0]);
    cursor = match.index + match[0].length;
  }
  return html + emphasis(source.slice(cursor));
}

export function renderBotEmbedText(value, { resolveMention = null } = {}) {
  // The validated card limit is 6000 characters. Also bound this exported
  // helper independently, including malformed/cached data with many tokens.
  const lines = String(value ?? '').slice(0, 8192).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [], plain = [];
  const flush = () => { if (plain.length) { blocks.push(formatBotInline(plain.join('\n'), resolveMention)); plain.length = 0; } };
  for (let index = 0; index < lines.length; index++) {
    const fence = /^ {0,3}(`{3,}|~{3,})(?:[ \t]*[A-Za-z0-9_+-]{1,32})?[ \t]*$/.exec(lines[index]);
    if (fence) {
      flush(); const code = [], marker = fence[1][0], length = fence[1].length;
      while (++index < lines.length) {
        const closing = /^ {0,3}([`~]+)[ \t]*$/.exec(lines[index]);
        if (closing && closing[1][0] === marker && [...closing[1]].every(char => char === marker) && closing[1].length >= length) break;
        code.push(lines[index]);
      }
      blocks.push(`<pre style="max-width:100%;overflow:auto;white-space:pre-wrap"><code>${escape(code.join('\n'))}</code></pre>`);
      continue;
    }
    const quote = /^ {0,3}> ?(.*)$/.exec(lines[index]);
    if (quote) {
      flush(); const quoted = [quote[1]];
      while (index + 1 < lines.length) {
        const next = /^ {0,3}> ?(.*)$/.exec(lines[index + 1]);
        if (!next) break;
        quoted.push(next[1]); index++;
      }
      blocks.push(`<blockquote style="margin:8px 0;padding-left:12px;border-left:3px solid currentColor">${formatBotInline(quoted.join('\n'), resolveMention)}</blockquote>`);
      continue;
    }
    const bullet = /^ {0,3}[-+*][ \t]+(.+)$/.exec(lines[index]);
    if (bullet) {
      flush(); const items = [bullet[1]];
      while (index + 1 < lines.length) {
        const next = /^ {0,3}[-+*][ \t]+(.+)$/.exec(lines[index + 1]);
        if (!next) break;
        items.push(next[1]); index++;
      }
      blocks.push(`<ul style="margin:8px 0;padding-left:22px">${items.map(item => `<li>${formatBotInline(item, resolveMention)}</li>`).join('')}</ul>`);
      continue;
    }
    plain.push(lines[index]);
  }
  flush(); return blocks.join('\n');
}

function media(value, kind, label) {
  const url = botEmbedUrl(value);
  // External images are opt-in; a bot cannot automatically contact a tracking
  // endpoint in every member's browser. They are never trusted attachments.
  return url ? `<button type="button" class="botEmbed__media botEmbed__media--${kind}" data-bot-embed-image="${escape(url)}" aria-label="${escape(label)}">${escape(label)} · ${escape(new URL(url).hostname)}</button>` : "";
}

export function renderBotEmbeds(message, { resolveMention = null } = {}) {
  if (message?.metadata?.suppress_embeds === true || message?.suppress_embeds === true) return "";
  return botMessageEmbeds(message).map(embed => {
    const color = Number.isInteger(embed.color) && embed.color >= 0 && embed.color <= 0xffffff
      ? `#${embed.color.toString(16).padStart(6,"0")}` : "#e9cfaa";
    const title = text(embed.title,256), description = text(embed.description,4096);
    const fields = Array.isArray(embed.fields) ? embed.fields.slice(0,25) : [];
    const author = text(embed.author?.name,256), footer = text(embed.footer?.text,2048);
    const stamp = typeof embed.timestamp === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(embed.timestamp) && Number.isFinite(Date.parse(embed.timestamp)) ? embed.timestamp : "";
    return `<article class="botEmbed" style="--bot-embed-color:${color}" aria-label="${escape(title || "Bot message card")}">
      ${author ? `<div class="botEmbed__author">${media(embed.author?.icon_url,"icon","Load author icon")}${link(botEmbedUrl(embed.author?.url) ? escape(author) : renderBotMentionSpans(author, resolveMention),embed.author?.url)}</div>` : ""}
      ${title ? `<h3 class="botEmbed__title">${link(botEmbedUrl(embed.url) ? escape(title) : renderBotMentionSpans(title, resolveMention),embed.url)}</h3>` : ""}
      ${media(embed.thumbnail?.url,"thumbnail","Load thumbnail")}
      ${description ? `<div class="botEmbed__description">${renderBotEmbedText(description, { resolveMention })}</div>` : ""}
      ${fields.length ? `<dl class="botEmbed__fields">${fields.filter(f=>f && typeof f.name === "string" && typeof f.value === "string").map(f => `<div class="botEmbed__field${f.inline===true ? " botEmbed__field--inline" : ""}"><dt>${renderBotMentionSpans(text(f.name,256), resolveMention)}</dt><dd>${renderBotEmbedText(text(f.value,1024), { resolveMention })}</dd></div>`).join("")}</dl>` : ""}
      ${media(embed.image?.url,"image","Load image")}
      ${footer || stamp ? `<footer class="botEmbed__footer">${media(embed.footer?.icon_url,"icon","Load footer icon")}${renderBotMentionSpans(footer, resolveMention)}${stamp ? `<time datetime="${escape(stamp)}">${escape(new Date(stamp).toLocaleString())}</time>` : ""}</footer>` : ""}
    </article>`;
  }).join("");
}

export function bindBotEmbedMedia(root) {
  const listener = event => {
    const button = event.target?.closest?.("button[data-bot-embed-image]");
    if (!button || !root.contains(button)) return;
    const url = botEmbedUrl(button.getAttribute("data-bot-embed-image"));
    if (!url) return;
    const img = button.ownerDocument.createElement("img");
    img.alt = button.getAttribute("aria-label") || "Bot image";
    img.className = button.className.replace("botEmbed__media", "botEmbed__loadedMedia");
    img.referrerPolicy = "no-referrer";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => { img.replaceWith(button); button.textContent = "Image unavailable · retry"; }, {once:true});
    button.replaceWith(img);
    img.src = url;
  };
  root.addEventListener("click", listener);
  return () => root.removeEventListener("click", listener);
}
