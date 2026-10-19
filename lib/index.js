import { URL } from 'url';
import puppeteer from '@website-scraper/puppeteer-version-wrapper';
import logger from './logger.js';
import scrollToBottomBrowser from './browserUtils/scrollToBottom.js';
import RequestRenderLock from './requestRenderLock.js';
import { parseCookieHeader, createBrowserCookieJar, storeBrowserCookie, ensureLeadingDot, getCookieHeader, deleteCookieHeader } from './cookies.js';

class PuppeteerPlugin {
	constructor ({
		launchOptions = {},
		gotoOptions = {},
		scrollToBottom = null,
		exclusiveRendering = true,
	} = {}) {
		this.launchOptions = launchOptions;
		this.gotoOptions = gotoOptions;
		this.scrollToBottom = scrollToBottom;
		this.exclusiveRendering = exclusiveRendering;
		this.browser = null;
		this.cookieJar = null;
		this.headers = {};
		// without serialization pages may rotate cookies while requests are in flight
		// (acceptable for websites which don't), so renders and requests run concurrently
		this.lock = exclusiveRendering ? new RequestRenderLock() : noLock;
		this.pendingRequests = new Map();

		logger.info('init plugin', { launchOptions, scrollToBottom, exclusiveRendering });
	}

	apply (registerAction) {
		registerAction('beforeStart', async ({options}) => {
			this.browser = await puppeteer.launch(this.launchOptions);
			// the jar may only be cached while no page can change it behind our back
			this.cookieJar = createBrowserCookieJar(this.browser, { cache: this.exclusiveRendering });
			await this.seedBrowserCookies(options);
		});

		registerAction('beforeRequest', async ({resource, requestOptions}) => {
			const headers = Object.assign({}, requestOptions.headers);

			// The configured Cookie header was seeded into the browser jar on start.
			// From now on got fills the Cookie header from the jar (cookieJar option)
			// for every request and every redirect hop, and stores Set-Cookie into it.
			// Puppeteer pages receive cookies from the jar as well, not from headers,
			// so that Cookie is not leaked to third-party requests made by the page.
			deleteCookieHeader(headers);

			if (hasValues(headers)) {
				this.headers = Object.assign({}, headers);
			}

			// A page render may rotate cookies, so plain requests must not be
			// in flight while a page is open. The request is finished once got
			// ran its afterResponse (final response) or beforeError hooks.
			const requestFinished = await this.lock.startRequest();
			this.pendingRequests.set(resource, requestFinished);
			const hooks = appendHooks(requestOptions.hooks, {
				afterResponse: response => {
					this.finishRequest(resource);
					return response;
				},
				beforeError: error => {
					this.finishRequest(resource);
					return error;
				}
			});

			return {requestOptions: Object.assign({}, requestOptions, {headers, hooks, cookieJar: this.cookieJar})};
		});

		registerAction('afterResponse', async ({response}) => {
			const contentType = response.headers['content-type'];
			const isHtml = contentType && contentType.split(';')[0] === 'text/html';
			if (isHtml) {
				const renderFinished = await this.lock.startRender();
				try {
					return await this.renderPage(response.url);
				} finally {
					// the page may have changed cookies in the browser jar
					this.cookieJar.invalidate();
					renderFinished();
				}
			} else {
				return response.body;
			}
		});

		// got hooks don't run if got rejected the request options
		registerAction('onResourceError', ({resource}) => this.finishRequest(resource));

		registerAction('afterFinish', () => this.browser && this.browser.close());
	}

	finishRequest (resource) {
		const requestFinished = this.pendingRequests.get(resource);
		if (requestFinished) {
			this.pendingRequests.delete(resource);
			requestFinished();
		}
	}

	async renderPage (url) {
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

		// page.content() returns an already-decoded string, so we
		// tell website-scraper to save it as utf8. Returning a binary
		// string instead corrupts non-latin1 characters on disk.
		// See https://github.com/website-scraper/node-website-scraper#afterresponse
		return {
			body: content,
			encoding: 'utf8'
		};
	}

	/**
	 * Sets cookies from the configured Cookie request header into the browser jar,
	 * so puppeteer pages send them too. Seeded once for the scraped urls' hosts
	 * (including their subdomains) - afterwards the jar, which receives
	 * rotated/refreshed cookies, is the source of truth.
	 * See https://github.com/website-scraper/website-scraper-puppeteer/issues/115
	 */
	async seedBrowserCookies (options) {
		const cookieHeader = getCookieHeader((options.request && options.request.headers) || {});
		if (!cookieHeader) {
			return;
		}

		const pairs = parseCookieHeader(cookieHeader);
		const hostnames = new Set(options.urls.map(({url}) => new URL(url).hostname));
		const cookies = [];
		for (const hostname of hostnames) {
			const domain = ensureLeadingDot(hostname);
			for (const {name, value} of pairs) {
				cookies.push({name, value, domain, path: '/'});
			}
		}

		if (cookies.length > 0) {
			logger.info(`seed browser cookies for ${Array.from(hostnames).join(', ')}`);
			// one by one, so that a rejected cookie does not drop the others
			for (const cookie of cookies) {
				await storeBrowserCookie(this.browser, cookie);
			}
		}
	}
}

function hasValues (obj) {
	return obj && Object.keys(obj).length > 0;
}

const noLock = {
	startRequest: async () => () => {},
	startRender: async () => () => {}
};

/**
 * Appends got hooks to the ones configured in request options (if any).
 */
function appendHooks (hooks = {}, extraHooks) {
	const merged = Object.assign({}, hooks);
	for (const [name, hook] of Object.entries(extraHooks)) {
		merged[name] = (hooks[name] || []).concat(hook);
	}
	return merged;
}

async function scrollToBottom (page, timeout, viewportN) {
	logger.info(`scroll puppeteer page to bottom ${viewportN} times with timeout = ${timeout}`);

	await page.evaluate(scrollToBottomBrowser, timeout, viewportN);
}

export default PuppeteerPlugin;
