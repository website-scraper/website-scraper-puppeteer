const puppeteer = require('puppeteer');

class PuppeteerPlugin {
	apply(registerAction) {
		let browser, page;

		registerAction('beforeStart', async () => {
			browser = await puppeteer.launch();
			page = await browser.newPage();
		});

		registerAction('afterResponse', async ({response}) => {
			const contentType = response.headers['content-type'];
			const isHtml = contentType && contentType.split(';')[0] === 'text/html';
			if (isHtml) {
				const url = response.request.href;
				await page.goto(url);
				return page.content();
			} else {
				return response.body;
			}
		});

		registerAction('afterFinish', () => browser.close());
	}
}

module.exports = PuppeteerPlugin;