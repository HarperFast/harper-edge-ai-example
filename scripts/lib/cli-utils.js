// ANSI color codes
const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
};

export const log = {
	info: (msg) => console.log(`${colors.blue}${msg}${colors.reset}`),
	success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
	error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
	warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),

	section: (title) => {
		console.log(`\n${colors.bright}${'='.repeat(60)}`);
		console.log(title);
		console.log(`${'='.repeat(60)}${colors.reset}\n`);
	},

	step: (num, title) => {
		console.log(`\n${colors.cyan}Step ${num}: ${title}${colors.reset}`);
	},
};

export async function withProgress(label, fn) {
	process.stdout.write(`${label}...`);
	try {
		const result = await fn();
		console.log(` ${colors.green}✓${colors.reset}`);
		return result;
	} catch (error) {
		console.log(` ${colors.red}✗${colors.reset}`);
		throw error;
	}
}

export function printTable(data, headers) {
	// Simple table printer
	const colWidths = headers.map((h, i) => Math.max(h.length, ...data.map((row) => String(row[i] || '').length)));

	const line = '+' + colWidths.map((w) => '-'.repeat(w + 2)).join('+') + '+';

	console.log(line);
	console.log('| ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + ' |');
	console.log(line);

	data.forEach((row) => {
		console.log('| ' + row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join(' | ') + ' |');
	});

	console.log(line);
}
