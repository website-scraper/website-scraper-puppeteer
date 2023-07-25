[![Version](https://img.shields.io/npm/v/website-scraper-puppeteer.svg?style=flat)](https://www.npmjs.org/package/website-scraper-puppeteer)
[![Downloads](https://img.shields.io/npm/dm/website-scraper-puppeteer.svg?style=flat)](https://www.npmjs.org/package/website-scraper-puppeteer)
[![Node.js CI](https://github.com/website-scraper/website-scraper-puppeteer/actions/workflows/node.js.yml/badge.svg)](https://github.com/website-scraper/website-scraper-puppeteer)
[![Test Coverage](https://codeclimate.com/github/website-scraper/website-scraper-puppeteer/badges/coverage.svg)](https://codeclimate.com/github/website-scraper/website-scraper-puppeteer/coverage)

# website-scraper-puppeteer
Plugin for [website-scraper](https://github.com/website-scraper/node-website-scraper) which returns html for dynamic websites using [puppeteer](https://github.com/puppeteer/puppeteer).

This module is an Open Source Software maintained by one developer in free time. If you want to thank the author of this module you can use [GitHub Sponsors](https://github.com/sponsors/s0ph1e) or [Patreon](https://www.patreon.com/s0ph1e).

## Requirements
* nodejs version >= 14.14
* website-scraper version >= 5

## Installation
```sh
npm install website-scraper website-scraper-puppeteer
```

## Usage
```javascript
import scrape from 'website-scraper';
import PuppeteerPlugin from 'website-scraper-puppeteer';

await scrape({
    urls: ['https://www.instagram.com/gopro/'],
    directory: '/path/to/save',
    plugins: [ 
      new PuppeteerPlugin({
        launchOptions: { headless: false }, /* optional */
        gotoOptions: { waitUntil: "networkidle0" }, /* optional */
        scrollToBottom: { timeout: 10000, viewportN: 10 }, /* optional */
        blockNavigation: true, /* optional */
      })
    ]
});
```
Puppeteer plugin constructor accepts next params:
* `launchOptions` - *(optional)* - puppeteer launch options, can be found in [puppeteer docs](https://github.com/puppeteer/puppeteer/blob/puppeteer-v20.2.0/docs/api/puppeteer.puppeteerlaunchoptions.md)
* `gotoOptions` - *(optional)* - puppeteer page.goto options, can be found in [puppeteer docs](https://github.com/puppeteer/puppeteer/blob/puppeteer-v20.2.0/docs/api/puppeteer.frame.goto.md#parameters)
* `scrollToBottom` - *(optional)* - in some cases, the page needs to be scrolled down to render its assets (lazyloading). Because some pages can be really endless, the scrolldown process can be interrupted before reaching the bottom when one or both of the bellow limitations are reached:
    * `timeout` - in milliseconds
    * `viewportN` - viewport height multiplier
* `blockNavigation` - *(optional)* - defines whether navigation away from the page is permitted or not. If it is set to true, then the page is locked to the current url and redirects with `location.replace(anotherPage)` will not pass. Defaults to `false`

## How it works
It starts Chromium in headless mode which just opens page and waits until page is loaded.
It is far from ideal because probably you need to wait until some resource is loaded or click some button or log in. Currently this module doesn't support such functionality.
