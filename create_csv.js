import fs from 'fs';

// Read all data files form the data folder
const data_files = fs.readdirSync('./data');

/*
Example object:
{
	"categories": [
		{
			"category": "E-commerce, CMS",
			"software": "Pimcore",
			"version": "2.4.38"
		},
		{ "category": "Programming Language", "software": "PHP", "version": "" },
		{ "category": "Web Server", "software": "Apache", "version": "" },
		{ "category": "Operating System", "software": "Debian", "version": "" }
	],
	"cms": [
		{ "checked_pages": "7", "cms": "SiteCore" },
		{ "checked_pages": "7", "cms": "HubSpot" },
		{ "checked_pages": "3", "cms": "Laravel" },
		{ "checked_pages": "1", "cms": "Umbraco" },
		{ "checked_pages": "2", "cms": "Pimcore" },
		{ "checked_pages": "19", "cms": "" }
	],
	"original_domain": "marketing.velux.be"
}*/

// Create an array to store all the data
const data = data_files
	.map((file) => {
		const file_content = fs.readFileSync('./data/' + file);
		return JSON.parse(file_content);
	})
	.map((item) => {
		const output = {
			original_domain: item.original_domain,
		};

		// Add each category to the output object
		item.categories.forEach((category) => {
			output['cat_' + category.category] = category.software;
			output['cat_' + category.category + '_version'] = category.version;
		});

		// Add each cms to the output object
		item.cms.forEach((cms) => {
			output['cms_' + cms.cms] = cms.checked_pages;
		});

		return output;
	});

console.log(data);

import ObjectsToCsv from 'objects-to-csv';

// If you use "await", code must be inside an asynchronous function:
(async () => {
	// console.log(data);

	// Get all unique keys
	const keys = data.reduce((acc, item) => {
		return [...acc, ...Object.keys(item)];
	}, []);

	// Remove duplicates
	const unique_keys = [...new Set(keys)];

	console.log(unique_keys.length);

	// Get a list of keys with actual values inside the data
	const keys_with_values = unique_keys.filter((key) => {
		return data.some((item) => {
			return item[key] !== undefined && item[key] !== '' && item[key] !== null;
		});
	});

	console.log(keys_with_values.length);

	// Create a new array with only the keys that have values
	const data_with_values = data.map((item) => {
		const output = {};
		keys_with_values.forEach((key) => {
			output[key] = item[key];
		});
		return output;
	});

	const csv = new ObjectsToCsv(data_with_values);

	// Remove the file if it already exists
	if (fs.existsSync('./output.csv')) {
		fs.unlinkSync('./output.csv');
	}

	// Save to file:
	await csv.toDisk('./output.csv', { allColumns: true });

	console.log('Done');

	// Return the CSV file as string:
	// console.log(await csv.toString());
})();
