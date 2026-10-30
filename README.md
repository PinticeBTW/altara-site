This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Legal Pages Deploy Note

TODO before Stripe live details: These pages must be deployed to production before adding their URLs to Stripe live public details.

## Microsoft Clarity on the public website

Set `NEXT_PUBLIC_CLARITY_PROJECT_ID` to the **Project ID** shown in the Clarity project's **Settings → Overview**. The ALTARA public website project's ID is `ytmkaellrg`; it is a public identifier, not an API key. It is set in the ignored local `.env.local`. Configure the same value in the build environment before deployment and rebuild the site. The integration is disabled if the value is absent or invalid.

The script loads only after the visitor accepts analytics, on `altaraapp.com` or `www.altaraapp.com`, and only on the explicit public marketing page list in `app/lib/marketing-analytics-scope.ts`. It is never included in the ALTARA app or developer portal. The loader does not start on URLs with query strings or fragments, to reduce the chance of forwarding sensitive values to Clarity. If adding a new marketing route, review its content for personal data before adding it to the list.

In the Clarity project, keep **Settings → Setup → Cookies** off by default (Consent Mode) and set **Settings → Masking** to **Strict**. The site also masks the FAQ search and consent panel in its markup. Verify these dashboard settings and the consent behavior in a production browser before relying on recordings. The site sends Consent API V2 with analytics granted and advertising denied only after acceptance. Rejection does not load the script; withdrawing consent sends a denied signal and reloads the page. The privacy policy describes the tool and the footer offers a permanent preference control.
