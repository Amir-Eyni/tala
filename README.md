# Tala

A live dashboard for gold and currency prices, built with Next.js App Router.
It includes 18k/24k gold, Emami coins, silver, USDT, USD, and EUR with live
percentage changes, 24-hour ranges, and a currency-to-metal converter.

## Requirements

- Node.js 20.9 or later
- npm

## Install

```bash
npm install
```

## Configure the public site URL

Set `NEXT_PUBLIC_SITE_URL` to the production origin (for example,
`https://prices.example.com`) before building for deployment. This value is
used as the metadata base URL, in the sitemap, and in the sitemap reference in
`robots.txt`. On Vercel, `VERCEL_URL` is used as a fallback; in local
development, the default is `http://localhost:3000`.

## Run locally

```bash
npm run dev
```

Open <http://localhost:3000>.

## Build and run in production

```bash
npm run build
npm start
```

`npm start` runs Next.js using its built-in Node.js server. The project does not
currently enable standalone output; this keeps the production start command
consistent for standard Node.js hosts. If deploying with Docker, configure
Next.js standalone output and run the generated `.next/standalone/server.js`
instead.

## Other checks

```bash
npm run lint
npm test
```

## SEO routes

- `/robots.txt` permits public pages and disallows crawling the prices API.
- `/sitemap.xml` lists the public dashboard homepage when a production site URL
  is configured.
