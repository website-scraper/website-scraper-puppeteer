import puppeteer from 'puppeteer';
import logger from './logger.js';
import scrollToBottomBrowser from './browserUtils/scrollToBottom.js';

class PuppeteerPlugin {
	constructor ({
		launchOptions = {},
		gotoOptions = {},
		scrollToBottom = null,
		blockNavigation = false
	} = {}) {
		this.launchOptions = launchOptions;
		this.gotoOptions = gotoOptions;
		this.scrollToBottom = scrollToBottom;
		this.blockNavigation = blockNavigation;
		this.browser = null;
		this.headers = {};

		logger.info('init plugin', { launchOptions, scrollToBottom, blockNavigation });
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

				if (this.blockNavigation) {
					await blockNavigation(page, url);
				}

				const puppeteerResponse = await page.goto(url, this.gotoOptions);

				if (this.scrollToBottom) {
					await scrollToBottom(page, this.scrollToBottom.timeout, this.scrollToBottom.viewportN);
				}

				const content = await page.content();
				await page.close();

				const encoding = extractEncodingFromHeader(puppeteerResponse.headers());
				const body = Buffer.from(content).toString(encoding);

				return { body, encoding };
			} else {
				return { body: response.body };
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

async function blockNavigation (page, url) {
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

function extractEncodingFromHeader (headers) {
	const contentTypeHeader = headers['content-type'];

	return contentTypeHeader && contentTypeHeader.includes('utf-8') ? 'utf8' : 'binary';
}

export default PuppeteerPlugin;
