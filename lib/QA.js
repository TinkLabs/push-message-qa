const tz = 'Asia/Hong_Kong';

const CronJob = require('cron').CronJob;
const config = require('config');
const moment = require('moment-timezone');
const SendMessage = require('./SendMessage');
const CheckMessages = require('./CheckMessages');

class QA {
	constructor() {
		moment.tz.setDefault(tz);

		this.sendMessages = [];
		this.sendMessage = new SendMessage(config.get('devices'));
		this.checkMessages = new CheckMessages();
	}

	/**
	 * Keep track of the message that we've send
	 *
	 * @param {Object} message
	 */
	addSendMessage(message) {
		this.sendMessages.push(message);

		// Only keep the last 10 messages
		if(this.sendMessages.length > 10) {
			this.sendMessages = this.sendMessages.slice(this.sendMessage.length - 10, 10);
		}
	}

	start() {
		this.sendMessage.send()
			.then(result => {
				this.addSendMessage(result);

				this.checkMessages.check(this.sendMessages);
			})
			.catch(err => {
				console.log(err);
			});

		const job = new CronJob({
			cronTime: config.get('send_message'),
			onTick: () => {
			},
			start: true,
		});
	}
}

module.exports = QA;