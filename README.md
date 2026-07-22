[![Version](https://img.shields.io/npm/v/website-scraper-puppeteer.svg?style=flat)](https://www.npmjs.org/package/website-scraper-puppeteer)
[![Downloads](https://img.shields.io/npm/dm/website-scraper-puppeteer.svg?style=flat)](https://www.npmjs.org/package/website-scraper-puppeteer)
[![Node.js CI](https://github.com/website-scraper/website-scraper-puppeteer/actions/workflows/node.js.yml/badge.svg)](https://github.com/website-scraper/website-scraper-puppeteer)
[![Code Coverage](https://qlty.sh/gh/website-scraper/projects/website-scraper-puppeteer/coverage.svg)](https://qlty.sh/gh/website-scraper/projects/website-scraper-puppeteer)

# website-scraper-puppeteer
Plugin for [website-scraper](https://github.com/website-scraper/node-website-scraper) which returns html for dynamic websites using [puppeteer](https://github.com/puppeteer/puppeteer).

## Sponsors
Maintenance of this project is made possible by all the [contributors](https://github.com/website-scraper/website-scraper-puppeteer/graphs/contributors) and [sponsors](https://github.com/sponsors/s0ph1e).
If you'd like to sponsor this project and have your avatar or company logo appear below [click here](https://github.com/sponsors/s0ph1e). 💖

<!-- sponsors --><a href="https://github.com/aivus"><img src="https:&#x2F;&#x2F;github.com&#x2F;aivus.png" width="60px" alt="User avatar: Illia Antypenko" /></a><a href="https://github.com/swissspidy"><img src="https:&#x2F;&#x2F;github.com&#x2F;swissspidy.png" width="60px" alt="User avatar: Pascal Birchler" /></a><a href="https://github.com/itscarlosrufo"><img src="https:&#x2F;&#x2F;github.com&#x2F;itscarlosrufo.png" width="60px" alt="User avatar: Carlos Rufo" /></a><a href="https://github.com/francescamarano"><img src="https:&#x2F;&#x2F;github.com&#x2F;francescamarano.png" width="60px" alt="User avatar: Francesca Marano" /></a><a href="https://github.com/github"><img src="https:&#x2F;&#x2F;github.com&#x2F;github.png" width="60px" alt="User avatar: GitHub" /></a><a href="https://github.com/Belrestro"><img src="https:&#x2F;&#x2F;github.com&#x2F;Belrestro.png" width="60px" alt="User avatar: Andrew Vorobiov" /></a><a href="https://github.com/Effiezhu"><img src="https:&#x2F;&#x2F;github.com&#x2F;Effiezhu.png" width="60px" alt="User avatar: " /></a><a href="https://github.com/slicemedia"><img src="https:&#x2F;&#x2F;github.com&#x2F;slicemedia.png" width="60px" alt="User avatar: " /></a><!-- sponsors -->

## Requirements
* nodejs version >= 20
* website-scraper version >= 5

## Installation
```sh
npm install website-scraper website-scraper-puppeteer
```

### Installing Chrome

Puppeteer normally downloads a compatible version of Chrome automatically during installation via a `postinstall` script. Starting with **npm v12**, lifecycle scripts (including `postinstall`) are disabled by default, so this automatic download no longer runs. You may then see an error like `Could not find Chrome (ver. ...)` when scraping.

If you use **npm v12 or newer** (or another package manager that blocks install scripts, e.g. recent `pnpm`), install Chrome manually after installing the packages:

```sh
npx puppeteer browsers install chrome
```

Alternatives:
* Re-enable install scripts by adding `puppeteer` to the [`allowScripts`](https://docs.npmjs.com/cli/v12/using-npm/config#allow-scripts) field in your `package.json` (or `.npmrc`), so the browser is downloaded automatically again.
* Use a Chrome/Chromium already installed on your system by pointing Puppeteer to it via `launchOptions.executablePath` (or the `PUPPETEER_EXECUTABLE_PATH` environment variable).

See Puppeteer's guide on [why automatic downloads can be blocked](https://pptr.dev/guides/installation#automatic-downloads-can-be-blocked) for more details.

## Usage
```javascript
import scrape from 'website-scraper';
import PuppeteerPlugin from 'website-scraper-puppeteer';

await scrape({
    urls: ['https://www.instagram.com/gopro/'],
    directory: '/path/to/save',
    plugins: [ 
      new PuppeteerPlugin({
        launchOptions: { headless: "new" }, /* optional */
        gotoOptions: { waitUntil: "networkidle0" }, /* optional */
        scrollToBottom: { timeout: 10000, viewportN: 10 }, /* optional */
      })
    ]
});
```
Puppeteer plugin constructor accepts next params:
* `launchOptions` - *(optional)* - puppeteer launch options, can be found in [puppeteer docs](https://github.com/puppeteer/puppeteer/blob/main/docs/api/puppeteer.puppeteerlaunchoptions.md)
* `gotoOptions` - *(optional)* - puppeteer page.goto options, can be found in [puppeteer docs](https://github.com/puppeteer/puppeteer/blob/main/docs/api/puppeteer.frame.goto.md#parameters)
* `scrollToBottom` - *(optional)* - in some cases, the page needs to be scrolled down to render its assets (lazyloading). Because some pages can be really endless, the scrolldown process can be interrupted before reaching the bottom when one or both of the bellow limitations are reached:
    * `timeout` - in milliseconds
    * `viewportN` - viewport height multiplier

## Cookies
Cookies passed in `request.headers.Cookie` (website-scraper option) are set into the browser's cookie jar for the scraped urls' hosts (including their subdomains), so pages opened in puppeteer send them too — but they are not leaked to other domains.
The jar is the source of truth afterwards: if the website rotates or refreshes cookies (via `Set-Cookie` or js executed on the page), the updated cookies are used for all subsequent requests.

```javascript
await scrape({
    urls: ['https://example.com/'],
    directory: '/path/to/save',
    request: {
        headers: { Cookie: 'session=abc123' }
    },
    plugins: [ new PuppeteerPlugin() ]
});
```

## How it works
It starts Chromium in headless mode which just opens page and waits until page is loaded.
It is far from ideal because probably you need to wait until some resource is loaded or click some button or log in. Currently this module doesn't support such functionality.
