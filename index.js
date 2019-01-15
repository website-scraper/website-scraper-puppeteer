const puppeteer = require('puppeteer');

class PuppeteerPlugin {
	apply(registerAction) {
		let browser;

		registerAction('beforeStart', async () => {
			browser = await puppeteer.launch();
		});

		registerAction('afterResponse', async ({response}) => {
			const contentType = response.headers['content-type'];
			const isHtml = contentType && contentType.split(';')[0] === 'text/html';
			if (isHtml) {
				const url = response.request.href;

				const page = await browser.newPage();
				await page.goto(url);
				const content = await page.content();
				await page.close();
				return content;
			} else {
				return response.body;
			}
		});

		registerAction('afterFinish', () => browser.close());
	}
}

module.exports = PuppeteerPlugin;