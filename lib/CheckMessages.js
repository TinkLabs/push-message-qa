const tz = 'Asia/Hong_Kong';

const config = require('config');
const moment = require('moment-timezone');
const models = require('node-models')({
	db: process.env.MYSQL_DB,
	user: process.env.MYSQL_USER,
	password: process.env.MYSQL_PASSWORD,
	host: process.env.MYSQL_HOST,
	timezone: tz,
	debug: process.env.debug || true,
});

class CheckMessages {
	constructor() {
		this.messageIds = [];
	}

	check(messageIds) {
		this.messageIds = messageIds;

		console.log(`Check messages ${messageIds.length}`);

		return new Promise((resolve, reject) => {

		});
	}
}

module.exports = CheckMessages;