import puppeteer from 'puppeteer';
import logger from './logger.js';
import scrollToBottomBrowser from './browserUtils/scrollToBottom.js';

class PuppeteerPlugin {
	constructor ({
		launchOptions = {},
		gotoOptions = {},
		scrollToBottom = null,
	} = {}) {
		this.launchOptions = launchOptions;
		this.gotoOptions = gotoOptions;
		this.scrollToBottom = scrollToBottom;
		this.browser = null;
		this.headers = {};

		logger.info('init plugin', { launchOptions, scrollToBottom });
	}

	apply (registerAction) {
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
				const url = response.url;
				const page = await this.browser.newPage();

				if (hasValues(this.headers)) {
					logger.info('set headers to puppeteer page', this.headers);
					await page.setExtraHTTPHeaders(this.headers);
				}

				await page.goto(url, this.gotoOptions);

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

function hasValues (obj) {
	return obj && Object.keys(obj).length > 0;
}


async function scrollToBottom (page, timeout, viewportN) {
	logger.info(`scroll puppeteer page to bottom ${viewportN} times with timeout = ${timeout}`);

	await page.evaluate(scrollToBottomBrowser, timeout, viewportN);
}

export default PuppeteerPlugin;
