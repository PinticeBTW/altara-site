"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isMarketingAnalyticsAllowed } from "../lib/marketing-analytics-scope";

const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim();
const storageKey = "altara:marketing-analytics-consent:v1";

type Choice = "accepted" | "rejected";
type Clarity = ((command: string, options?: { ad_Storage: "denied"; analytics_Storage: "granted" | "denied" }) => void) & {
  q?: unknown[][];
};

declare global {
  interface Window {
    clarity?: Clarity;
  }
}

function readChoice(): Choice | null {
  try {
    const value = window.localStorage.getItem(storageKey);
    return value === "accepted" || value === "rejected" ? value : null;
  } catch {
    return null;
  }
}

function saveChoice(choice: Choice) {
  try {
    window.localStorage.setItem(storageKey, choice);
  } catch {
    // A blocked storage API must never imply consent on a later visit.
  }
}

function loadClarity(id: string) {
  if (document.querySelector("script[data-altara-clarity]")) return;

  window.clarity = window.clarity || function (...args) {
    (window.clarity!.q = window.clarity!.q || []).push(args);
  };
  window.clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });

  const script = document.createElement("script");
  script.async = true;
  script.dataset.altaraClarity = "";
  script.src = `https://www.clarity.ms/tag/${id}`;
  document.head.appendChild(script);
}

export function MarketingAnalytics() {
  const [choice, setChoice] = useState<Choice | null | "loading">("loading");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setChoice(readChoice()), 0);
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (choice === "accepted" && projectId && /^[a-z0-9]{4,32}$/i.test(projectId) && isMarketingAnalyticsAllowed(window.location)) {
      loadClarity(projectId);
    }
  }, [choice]);

  if (!projectId || !/^[a-z0-9]{4,32}$/i.test(projectId)) return null;

  function decide(next: Choice) {
    saveChoice(next);
    if (next === "rejected" && choice === "accepted") {
      window.clarity?.("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" });
      window.location.reload();
      return;
    }
    setChoice(next);
    setEditing(false);
  }

  return (
    <>
      <button type="button" className="marketing-privacy-link" onClick={() => setEditing(true)}>
        Analytics preferences
      </button>
      {(choice === null || editing) && (
        <aside className="marketing-consent" aria-label="Website analytics preferences" data-clarity-mask="true">
          <div>
            <strong>Help us improve this website?</strong>
            <p>
              With your permission, Microsoft Clarity uses analytics cookies and records visits, clicks and scrolls on ALTARA&apos;s
              public website. We use it to spot confusing pages. It stays off until you accept, and
              you can change your choice here later. <Link href="/privacy">Privacy policy</Link>
            </p>
          </div>
          <div className="marketing-consent-actions">
            <button type="button" onClick={() => decide("rejected")}>Reject</button>
            <button type="button" className="marketing-consent-accept" onClick={() => decide("accepted")}>Allow analytics</button>
          </div>
        </aside>
      )}
    </>
  );
}
