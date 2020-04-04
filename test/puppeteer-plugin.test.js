const { expect } = require('chai');
const http = require('http');
const finalhandler = require('finalhandler');
const serveStatic = require('serve-static');
const fs = require('fs-extra');
const scrape = require('website-scraper');
const PuppeteerPlugin = require('../index');

const directory = __dirname + '/tmp';

describe('Puppeteer plugin test', () => {
	let result, content;

	before('serve website', () => serveWebsite(4567));
	before('scrape website', async () => {
		result = await scrape({
			urls: ['http://localhost:4567'],
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

function serveWebsite(port = 3000) {
	const serve = serveStatic(__dirname + '/mock', {'index': ['index.html']});
	const server = http.createServer(function onRequest (req, res) {
		serve(req, res, finalhandler(req, res))
	});
	server.listen(port)
}
