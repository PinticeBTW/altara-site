import Link from 'next/link';

export function ThemeSafetyNotice() {
  return <aside className="themeSafetyNotice" aria-label="Theme installation safety">
    <div>
      <h2>Before installing a theme</h2>
      <p>Import only a <code>.altara-theme.json</code> package in ALTARA. A theme never needs an installer, administrator access, your password or disabling antivirus. Validation reduces risk; it is not a guarantee of safety.</p>
    </div>
    <Link href="/developers/themes/guide#safety">Read safety precautions →</Link>
  </aside>;
}
