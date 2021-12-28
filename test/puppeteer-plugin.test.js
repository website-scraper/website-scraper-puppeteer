import chai from 'chai';
import http from 'http';
import finalhandler from 'finalhandler';
import serveStatic from 'serve-static';
import fs from 'fs-extra';
import scrape from 'website-scraper';
import PuppeteerPlugin from '../lib/index.js';

const { expect } = chai;

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
			expect(content).to.contain('<div id="special-characters-test">저는 7년 동안 한국에서 살았어요. Слава Україні!</div>');
		});
	});

	describe('Block navigation', () => {
		before('scrape website', async () => {
			result = await scrape({
				urls: [`http://localhost:${SERVE_WEBSITE_PORT}/navigation.html`],
				directory: directory,
				plugins: [
					new PuppeteerPlugin({
						blockNavigation: true
					})
				]
			});
		});
		before('get content from file', () => {
			content = fs.readFileSync(`${directory}/${result[0].filename}`).toString();
		});
		after('delete dir', () => fs.removeSync(directory));

		it('should render content (and not be redirected)', async () => {
			expect(content).to.contain('<div id="root">Navigation blocked!</div>');
		});
	});


});

function startWebserver(port = 3000) {
	const serve = serveStatic('./test/mock', {'index': ['index.html']});
	const server = http.createServer(function onRequest (req, res) {
		serve(req, res, finalhandler(req, res))
	});

	return server.listen(port)
}
