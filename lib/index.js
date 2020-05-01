const puppeteer = require('puppeteer');
const logger = require('./logger.js');

class PuppeteerPlugin {
	constructor({
		launchOptions = {},
		scrollToBottom = null,
		blockNavigation = false
	} = {}) {
		this.launchOptions = launchOptions;
		this.scrollToBottom = scrollToBottom;
		this.blockNavigation = blockNavigation;
		this.browser = null;
		this.headers = {};

		logger.info('init plugin', { launchOptions, scrollToBottom, blockNavigation });
	}

	apply(registerAction) {
		registerAction('beforeStart', async () => {
			this.browser = await puppeteer.launch(this.launchOptions);
		});

		registerAction('beforeRequest', async ({requestOptions}) => {
			if (hasValues(requestOptions.headers)) {
				this.headers = Object.assign({}, requestOptions.headers);
			}
			return {requestOptions};
		});

		registerAction('afterResponse', async ({response}) => {
			const contentType = response.headers['content-type'];
			const isHtml = contentType && contentType.split(';')[0] === 'text/html';
			if (isHtml) {
				const url = response.request.href;
				const page = await this.browser.newPage();

				if (hasValues(this.headers)) {
					logger.info('set headers to puppeteer page', this.headers);
					await page.setExtraHTTPHeaders(this.headers);
				}

				if (this.blockNavigation) {
					await blockNavigation(page, url);
				}

				await page.goto(url);

				if (this.scrollToBottom) {
					await scrollToBottom(page, this.scrollToBottom.timeout, this.scrollToBottom.viewportN);
				}

				const content = await page.content();
				await page.close();

				// convert utf-8 -> binary string because website-scraper needs binary
				return Buffer.from(content).toString('binary');
			} else {
				return response.body;
			}
		});

		registerAction('afterFinish', () => this.browser && this.browser.close());
	}
}

function hasValues(obj) {
	return obj && Object.keys(obj).length > 0;
}


async function scrollToBottom(page, timeout, viewportN) {
	logger.info(`scroll puppeteer page to bottom ${viewportN} times with timeout = ${timeout}`);

	await page.evaluate(async (timeout, viewportN) => {
		await new Promise((resolve, reject) => {
			let totalHeight = 0, distance = 200, duration = 0, maxHeight = window.innerHeight * viewportN;
			const timer = setInterval(() => {
				duration += 200;
				window.scrollBy(0, distance);
				totalHeight += distance;
				if (totalHeight >= document.body.scrollHeight || duration >= timeout || totalHeight >= maxHeight) {
					clearInterval(timer);
					resolve();
				}
			}, 200);
		});
	}, timeout, viewportN);
}

async function blockNavigation(page, url) {
	logger.info(`block navigation for puppeteer page from url ${url}`);

	page.on('request', req => {
		if (req.isNavigationRequest() && req.frame() === page.mainFrame() && req.url() !== url) {
			req.abort('aborted');
		} else {
			req.continue();
		}
	});
	await page.setRequestInterception(true);
}

module.exports = PuppeteerPlugin;
