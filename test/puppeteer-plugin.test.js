import { expect } from 'chai';
import http from 'http';
import finalhandler from 'finalhandler';
import serveStatic from 'serve-static';
import fs from 'fs-extra';
import scrape from 'website-scraper';
import PuppeteerPlugin from '../lib/index.js';

const directory = './test/tmp';
const SERVE_WEBSITE_PORT = 4567;

describe('Puppeteer plugin test', () => {
	let result, content, server;

	before('start webserver', () => server = startWebserver(SERVE_WEBSITE_PORT));
	after('stop webserver', () => server.close())

	describe('Dynamic content', () => {
		before('scrape website', async () => {
			result = await scrape({
				urls: [`http://localhost:${SERVE_WEBSITE_PORT}`],
				directory: directory,
				plugins: [ new PuppeteerPlugin({
					scrollToBottom: { timeout: 50, viewportN: 10 }
				}) ]
			});
		});
		before('get content from file', () => {
			content = fs.readFileSync(`${directory}/${result[0].filename}`).toString();
		});
		after('delete dir', () => fs.removeSync(directory));

		it('should have 1 item in result array', () => {
			expect(result.length).eql(1);
		});

		it('should render dymanic website', async () => {
			expect(content).to.contain('<div id="root">Hello world from JS!</div>');
		});

		it('should render special characters correctly', async () => {
			expect(content).to.contain('<div id="special-characters-test">7년 동안 한국에서 살았어요. Слава Україні!</div>');
		});
	});

	describe('CJK content with charset only in meta tag', () => {
		let cjkResult, cjkContent;

		before('scrape website', async () => {
			cjkResult = await scrape({
				urls: [`http://localhost:${SERVE_WEBSITE_PORT}/cjk.html`],
				directory: directory,
				plugins: [ new PuppeteerPlugin() ]
			});
		});
		before('get content from file', () => {
			cjkContent = fs.readFileSync(`${directory}/${cjkResult[0].filename}`).toString();
		});
		after('delete dir', () => fs.removeSync(directory));

		// Regression test for https://github.com/website-scraper/website-scraper-puppeteer/pull/103
		// Saving the page as a binary string corrupted these characters on disk.
		it('should save CJK characters without corruption', () => {
			expect(cjkContent).to.contain('<div id="cjk-characters-test">磁致伸缩位移传感器 影响大跨度桥梁施工控制的因素</div>');
		});
	});
});

function startWebserver(port = 3000) {
	const serve = serveStatic('./test/mock', {'index': ['index.html']});
	const server = http.createServer(function onRequest (req, res) {
		// Serve the CJK page the same way as the website from #103: utf-8 is
		// declared only in the html <meta> tag, not in the Content-Type header.
		if (req.url === '/cjk.html') {
			res.setHeader('Content-Type', 'text/html');
			res.end(fs.readFileSync('./test/mock/cjk.html'));
			return;
		}
		serve(req, res, finalhandler(req, res))
	});

	return server.listen(port)
}
