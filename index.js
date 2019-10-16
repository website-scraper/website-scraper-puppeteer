const puppeteer = require('puppeteer');

class PuppeteerPlugin {
	constructor({launchOptions = {}} = {}) {
		this.launchOptions = launchOptions;
		this.browser = null;
		this.headers = {};
	}

	apply(registerAction) {
		registerAction('beforeStart', async () => {
			this.browser = await puppeteer.launch(this.launchOptions);
		});

		registerAction('beforeRequest', async ({requestOptions}) => {
			if (hasValues(requestOptions.headers)) {
				this.headers = requestOptions.headers;
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
					await page.setExtraHTTPHeaders(this.headers);
				}
				await page.goto(url);
				const content = await page.content();
				await page.close();
				return content;
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

module.exports = PuppeteerPlugin;