const marketingPaths = new Set([
  "/", "/about", "/discord-alternative", "/download/linux", "/downloads",
  "/faq", "/features", "/privacy", "/terms",
]);

type PageLocation = Pick<Location, "hostname" | "pathname" | "search" | "hash">;

export function isMarketingAnalyticsAllowed(location: PageLocation) {
  return (
    (location.hostname === "altaraapp.com" || location.hostname === "www.altaraapp.com") &&
    marketingPaths.has(location.pathname) &&
    !location.search &&
    !location.hash
  );
}
