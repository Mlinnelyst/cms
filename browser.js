import puppeteer from 'puppeteer';
import fs from 'fs';
import isUp from 'is-up';
import Url from 'url-parse';
import http from 'http';
import https from 'https';

const url = `https://whatcms.org/?s=www.`;

var existing_domains = fs.readdirSync('./data').map((f) => {
	// Read the file parse the json and return the original domain
	const o = JSON.parse(fs.readFileSync('./data/' + f));
	return o.original_domain;
});

// Remove duplicates
existing_domains = [...new Set(existing_domains)];

console.log(existing_domains);

if (!fs.existsSync('sites_not_up.txt')) {
	fs.writeFileSync('sites_not_up.txt', '');
}

if (!fs.existsSync('sites_up.txt')) {
	fs.writeFileSync('sites_up.txt', '');
}

let sites_not_up = fs.readFileSync('sites_not_up.txt').toString().split('\n');
let sites_up = fs.readFileSync('sites_up.txt').toString().split('\n');

var original_domains = fs
	.readFileSync('domains.csv')
	.toString()
	.split('\r\n')
	.map((d) => {
		const original_domain = d;

		// If it contains a / only take the part before the /
		if (d.includes('/')) {
			return d.split('/')[0];
		}

		return { d, original_domain };
	})
	.filter(
		(d) => d.d !== '' && d.d != undefined && d.d != null && d.d.length > 1
	)
	.filter((d) => {
		const original_domain = d.original_domain;
		return !existing_domains.includes(original_domain);
	})
	.filter((d) => {
		const original_domain = d.original_domain;
		return !sites_not_up.includes(original_domain);
	});

//domains = [{ d: 'marketing.velux.be', original_domain: 'marketing.velux.be' }];

console.log('Domains to check: ' + original_domains.length);
console.log(original_domains);

async function check_if_site_is_up(domain) {
	domain = domain.replace('www-', '');

	console.log('Checking if site is up: ' + domain);

	var result = false;

	try {
		result = await new Promise((resolve) => {
			https
				.get('https://www.' + domain, function (res) {
					console.log(domain, res.statusCode);

					// Check if the status is an error
					if (res.statusCode >= 400) {
						return resolve(false);
					} else {
						return resolve(true);
					}
				})
				.on('error', function (e) {
					return resolve(false);
				});
		});
	} catch {
		try {
			result = await new Promise((resolve) => {
				http
					.get('http://www.' + domain, function (res) {
						console.log(domain, res.statusCode);

						// Check if the status is an error
						if (res.statusCode >= 400) {
							return resolve(false);
						} else {
							return resolve(true);
						}
					})
					.on('error', function (e) {
						return resolve(false);
					});
			});
		} catch {
			return true;
		}
	}

	console.log('Result: ' + result);

	if (!result) {
		sites_not_up.push(domain);
		sites_not_up = [...new Set(sites_not_up)];

		// Write the sites that are not up to a file
		fs.writeFileSync('sites_not_up.txt', sites_not_up.join('\n'));
	} else {
		sites_up.push(domain);
		sites_up = [...new Set(sites_up)];

		// Write the sites that are up to a file
		fs.writeFileSync('sites_up.txt', sites_up.join('\n'));
	}

	// Wait 2 seconds
	await new Promise((resolve) => setTimeout(resolve, 2000));

	return result;
}

var domains = [];

for (let i = 0; i < original_domains.length; i++) {
	const domain = original_domains[i];

	if (sites_not_up.includes(domain.original_domain)) {
		continue;
	}

	if (sites_up.includes(domain.original_domain)) {
		domains.push(domain);
		continue;
	}

	const is_up = await check_if_site_is_up(domain.d);

	if (is_up) {
		domains.push(domain);
	}
}

const detect_cms_button_selector = `#wcform > div > div > div > button.btn.btn-success.detect-btn > span`;

const domain_loaded_xpath = '//*[@id="result_destination"]/div[2]/div[2]/div/a';

const domain_loaded_selector =
	'#result_destination > div:nth-child(3) > div.card-body.bg-light > div > a';

async function get_domain_content(browser, domain, original_domain) {
	const page = await browser.newPage();

	// Set screen size
	await page.setViewport({ width: 1080, height: 1024 });

	try {
		await page.goto(url + domain);

		await page.waitForNetworkIdle();

		// Wait for the initial button and press it
		console.log('Waiting for page initial load');
		await page.waitForSelector(detect_cms_button_selector);

		console.log('Clicking button');

		await page.click(detect_cms_button_selector);

		// Wait for 2 seconds
		await page.waitForTimeout(2000);

		const title_selector_1 = `//*[@id="result_destination"]/div[3]/div[2]/h3`;

		// Wait for the title to appear
		await page.waitForXPath(title_selector_1, { timeout: 3000 });

		const title_selector_2 = `//*[@id="result_destination"]/div[2]/div[2]/table[1]/tbody/tr[1]/td[1]`;

		await page.waitForXPath(title_selector_2, { timeout: 3000 });

		console.log('Getting page content');

		// Check if sorry prompt is there
		const sorry_xpath = `//*[@id="result_destination"]/div[2]/div[1]/span[1]`;

		const sorry_exists = await page
			.$x(sorry_xpath)
			.then((elements) => elements.length > 0);

		if (sorry_exists) {
			// Check if the sorry prompt contains text that says "Sorry"
			const sorry_text = await page
				.$x(sorry_xpath)
				.then((elements) => elements[0].getProperty('textContent'))
				.then((text) => text.jsonValue());

			if (sorry_text.includes('Sorry')) {
				console.log('Sorry prompt found');
				await page.close();
				return;
			}
		}

		console.log('Getting category, software and versions...');

		var categories_array = [];

		for (let i = 2; i < 50; i++) {
			var o = {
				category: '',
				software: '',
				version: '',
			};

			const category_xpath = `//*[@id="result_destination"]/div[2]/div[2]/table[1]/tbody/tr[${i}]/td[1]`;

			// Check if the xpath exists
			const exists = await page
				.$x(category_xpath)
				.then((elements) => elements.length > 0);

			if (!exists) {
				console.log('No more categories found');
				break;
			}

			// Get the text of the first element the XPath matches
			const category = await page
				.$x(category_xpath)
				.then((elements) => elements[0].getProperty('textContent'))
				.then((text) => text.jsonValue());

			//console.log(category);

			o.category = category;

			const software_xpath = `//*[@id="result_destination"]/div[2]/div[2]/table[1]/tbody/tr[${i}]/td[2]/a`;

			// Check if the xpath exists
			const exists2 = await page
				.$x(software_xpath)
				.then((elements) => elements.length > 0);

			if (exists2) {
				const software = await page
					.$x(software_xpath)
					.then((elements) => elements[0].getProperty('textContent'))
					.then((text) => text.jsonValue());

				//console.log(software);

				o.software = software;
			} else {
				console.log('No software found');
			}

			// //*[@id="result_destination"]/div[2]/div[2]/table[1]/tbody/tr[3]/td[2]/a
			// //*[@id="result_destination"]/div[2]/div[2]/table[1]/tbody/tr[4]/td[2]/a
			// //*[@id="result_destination"]/div[2]/div[2]/table[1]/tbody/tr[4]/td[3]

			const version_xpath = `//*[@id="result_destination"]/div[2]/div[2]/table[1]/tbody/tr[${i}]/td[3]`;

			const exists3 = await page
				.$x(version_xpath)
				.then((elements) => elements.length > 0);

			if (exists3) {
				const version = await page
					.$x(version_xpath)
					.then((elements) => elements[0].getProperty('textContent'))
					.then((text) => text.jsonValue());

				//console.log(version);

				o.version = version;
			} else {
				console.log('No version found');
			}

			console.log(o);

			categories_array.push(o);
		}

		console.log('Getting Content Management Systems...');

		var cms_array = [];

		for (let i = 1; i < 50; i++) {
			var cms_object = {
				checked_pages: '',
				cms: '',
			};

			// //*[@id="result_destination"]/div[3]/div[2]/table/tbody/tr[1]/td[1]
			// //*[@id="result_destination"]/div[4]/div[2]/table/tbody/tr[1]/td[1]
			// //*[@id="result_destination"]/div[4]/div[2]/table/tbody/tr[2]/td[1]

			const checked_pages_xpath = `//*[@id="result_destination"]/div[3]/div[2]/table/tbody/tr[${i}]/td[1]`;

			// Check if the xpath exists
			const exists = await page
				.$x(checked_pages_xpath)
				.then((elements) => elements.length > 0);

			if (!exists) {
				console.log('No more cms found');
				break;
			}

			const checked_pages = await page
				.$x(checked_pages_xpath)
				.then((elements) => elements[0].getProperty('textContent'))
				.then((text) => text.jsonValue());

			console.log(checked_pages);

			cms_object.checked_pages = checked_pages;

			const cms_xpath = `//*[@id="result_destination"]/div[3]/div[2]/table/tbody/tr[${i}]/td[2]/a`;

			// Get the title of the first element the XPath matches
			const cms_element = await page
				.$x(cms_xpath)
				.then((elements) => elements[0]);

			console.log(cms_element);

			if (cms_element) {
				// Get the text of the cms_element
				const cms = await cms_element
					.getProperty('textContent')
					.then((text) => text.jsonValue());

				console.log(cms);

				cms_object.cms = cms;
			} else {
				console.log('No cms found');
			}

			cms_array.push(cms_object);
		}

		console.log('Got all the data.');

		console.log(categories_array);
		console.log(cms_array);

		// Save the site data to a JSON file in the data folder
		fs.writeFile(
			'./data/' + domain + '.json',
			JSON.stringify({
				categories: categories_array,
				cms: cms_array,
				original_domain: original_domain,
			}),
			(err) => {
				if (err) {
					console.log(err);
				} else {
					console.log('File saved.');
				}
			}
		);

		console.log('File written.');
	} catch {}

	await page.close();

	// Wait for 5 seconds
	await new Promise((r) => setTimeout(r, 5000));
}

async function start() {
	console.log('Starting Puppeteer');

	const browser = await puppeteer.launch({
		headless: false,
	});

	// Check the blacklisted sites
	/* for (let j = 0; j < sites_not_up.length; j++) {
		// Open the page
		const page = await browser.newPage();

		const domain = 'http://www.' + sites_not_up[j];

		console.log('Going to ' + domain + '...');

		try {
			// Go to the site
			await page.goto(domain, { timeout: 5000 });

			// Wait for network to idle
			await page.waitForNetworkIdle();

			// Wait for 5 seconds
			await new Promise((r) => setTimeout(r, 5000));
		} catch (e) {
			console.log(e);
			await new Promise((r) => setTimeout(r, 1000));
		}
	}

	await new Promise((r) => setTimeout(r, 99999 * 1000)); */

	for (let j = 0; j < domains.length; j++) {
		const domain = domains[j];

		console.log(
			`Getting data for ${domain.original_domain} (${j + 1} of ${
				domains.length
			})`
		);

		for (let i = 0; i < 2; i++) {
			console.log('Try ' + i + ' for ' + domain.original_domain);

			try {
				await get_domain_content(browser, domain.d, domain.original_domain);

				const file_path = './data/' + domain.d + '.json';

				if (fs.existsSync(file_path)) {
					break;
				}
			} catch (e) {
				console.log(e);
			}
		}
	}

	console.log('Done.');

	await browser.close();
}

start();
