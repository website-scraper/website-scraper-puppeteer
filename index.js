const puppeteer = require('puppeteer');

class PuppeteerPlugin {
	constructor({
		launchOptions = {},
		scrollToBottom = null
	} = {}) {
		this.launchOptions = launchOptions;
		this.scrollToBottom = scrollToBottom;
		this.browser = null;
		this.headers = {};
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
					await page.setExtraHTTPHeaders(this.headers);
				}
				await page.goto(url);

				if(this.scrollToBottom) {
					await scrollToBottom(page, this.scrollToBottom.timeout, this.scrollToBottom.viewportN);
				}

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


async function scrollToBottom(page, timeout, viewportN) {
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

module.exports = PuppeteerPlugin;
