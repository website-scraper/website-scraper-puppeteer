[![Version](https://img.shields.io/npm/v/website-scraper-puppeteer.svg?style=flat)](https://www.npmjs.org/package/website-scraper-puppeteer)
[![Downloads](https://img.shields.io/npm/dm/website-scraper-puppeteer.svg?style=flat)](https://www.npmjs.org/package/website-scraper-puppeteer)
[![Build Status](https://travis-ci.org/website-scraper/website-scraper-puppeteer.svg?branch=master)](https://travis-ci.org/website-scraper/website-scraper-puppeteer)

# website-scraper-puppeteer
Plugin for [website-scraper](https://github.com/website-scraper/node-website-scraper) which returns html for dynamic websites using [puppeteer](https://github.com/GoogleChrome/puppeteer)

## Requirements
* nodejs version >= 8
* website-scraper version >= 4

## Installation
```sh
npm install website-scraper website-scraper-puppeteer
```

## Usage
```javascript
const scrape = require('website-scraper');
const PuppeteerPlugin = require('website-scraper-puppeteer');

scrape({
    urls: ['https://www.instagram.com/gopro/'],
    directory: '/path/to/save',
    plugins: [ new PuppeteerPlugin() ]
});
```

## How it works
It starts Chromium in headless mode which just opens page and waits until page is loaded.
It is far from ideal because probably you need to wait until some resource is loaded or click some button or log in. Currently this module doesn't support such functionality.