const { expect } = require('chai');
const http = require('http');
const finalhandler = require('finalhandler');
const serveStatic = require('serve-static');
const fs = require('fs-extra');
const scrape = require('website-scraper');
const PuppeteerPlugin = require('../lib');

const directory = __dirname + '/tmp';
const SERVE_WEBSITE_PORT = 4567;

describe('Puppeteer plugin test', () => {
	let result, content;

	before('serve website', () => serveWebsite(SERVE_WEBSITE_PORT));

	describe('Dynamic content', () => {
		before('scrape website', async () => {
			result = await scrape({
				urls: [`http://localhost:${SERVE_WEBSITE_PORT}`],
				directory: directory,
				plugins: [ new PuppeteerPlugin() ]
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

function serveWebsite(port = 3000) {
	const serve = serveStatic(__dirname + '/mock', {'index': ['index.html']});
	const server = http.createServer(function onRequest (req, res) {
		serve(req, res, finalhandler(req, res))
	});
	server.listen(port)
}
