// Bundled identity assets from the official Roblox site and Steam app pages.
const knownIcons = {
  roblox: new URL("../assets/activity/icons/roblox.png", import.meta.url).href,
  "rainbow-six-siege": new URL("../assets/activity/icons/rainbow-six-siege.jpg", import.meta.url).href,
  "marvel-rivals": new URL("../assets/activity/icons/marvel-rivals.jpg", import.meta.url).href,
};
const knownNames = { roblox: "roblox", "rainbow six siege": "rainbow-six-siege", "tom clancy's rainbow six siege": "rainbow-six-siege", "marvel rivals": "marvel-rivals" };

function publicImage(value) {
  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw)) return "";
  try { const url = new URL(raw); return url.username || url.password ? "" : url.href; } catch { return ""; }
}

export function compactActivityArtworkCandidates(activity = {}) {
  if (activity.type === "listening") return [publicImage(activity.artworkUrl)].filter(Boolean);
  const meta = activity.metadata || {};
  const icon = publicImage(activity.icon || meta.icon);
  const provider = String(activity.provider || meta.provider || "").toLowerCase();
  // Older clients/cache entries labelled RAWG backgrounds and IGDB covers as icons.
  const isCoverAlias = icon && [activity.cover, activity.background, meta.cover, meta.background].includes(icon);
  const dedicatedIcon = isCoverAlias || /^(rawg|igdb|catalog)$/.test(provider) ? "" : icon;
  const known = knownIcons[activity.gameId || activity.id] || knownIcons[knownNames[String(activity.name || "").trim().toLowerCase()]] || "";
  return [...new Set([
    known || dedicatedIcon,
    publicImage(activity.logo || meta.logo),
    publicImage(activity.executableIcon || meta.executableIcon),
    publicImage(activity.squareArtwork || meta.squareArtwork),
  ].filter(Boolean))];
}

export function buildCompactActivityArtworkHtml(activity, className = "presenceActivityLogo") {
  const candidates = compactActivityArtworkCandidates(activity);
  if (!candidates.length) return "";
  const escape = value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  // Do not reveal an image until its actual dimensions are known. Try the next
  // identity candidate on failure; never crop a landscape/portrait into an icon.
  const failure = "this.parentElement.hidden=true;var next=JSON.parse(this.dataset.activityArtworkNext||'[]');if(next.length){this.dataset.activityArtworkNext=JSON.stringify(next.slice(1));this.src=next[0]}";
  const loaded = "var ratio=this.naturalWidth/this.naturalHeight;if(ratio>=0.8&&ratio<=1.25){this.style.maxWidth=this.naturalWidth+'px';this.style.maxHeight=this.naturalHeight+'px';this.parentElement.hidden=false}else{this.onerror()}";
  return `<div class="${escape(className)} activityCompactArtwork" hidden aria-hidden="true"><img src="${escape(candidates[0])}" alt="" data-activity-artwork-next="${escape(JSON.stringify(candidates.slice(1)))}" onload="${escape(loaded)}" onerror="${escape(failure)}" /></div>`;
}
