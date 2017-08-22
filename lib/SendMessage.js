const tz = 'Asia/Hong_Kong';

const config = require('config');
const moment = require('moment-timezone');
const Handlebars = require('handlebars');
const models = require('node-models')({
	db: process.env.MYSQL_DB,
	user: process.env.MYSQL_USER,
	password: process.env.MYSQL_PASSWORD,
	host: process.env.MYSQL_HOST,
	timezone: tz,
	debug: process.env.debug || true,
});

const Device = models.Device;
const Message = models.Message;
const MessageHotel = models.MessageHotel;
const MessageInfo = models.MessageInfo;
const MessageRecipient = models.MessageRecipient;

class SendMessage {
	constructor(devices) {
		this.devices = devices;

		this.barcodes = this.devices.map(device => device.barcode);
	}

	/**
	 * To send a message, we need to:
	 * 		1. Select devices
	 * 		2. Create Message
	 * 		3. Create MessageHotels
	 * 		4. Create MessageInfo
	 * 		5. Create MessageRecipients
	 */
	send() {
		console.log(`Sending new QA message at ${moment().format('MMMM Do YYYY, h:mm:ss a')}`);

		let devices = [];
		let messageId = null;
		let messageInfoId = null;

		const dates = moment().format('YYYY-MM-DD');
		const time = moment().format('HH:mm:ss');
		const sendAt = `${dates} ${time}`;

		return new Promise((resolve, reject) => {
			this.getDevices(this.barcodes)
				.then(_devices => {
					devices = _devices;

					const hotelIds = devices.map(d => d.hotel_id).join(',');
					const hotelRoomNumbers = devices.map(d => `${d.hotel_id}:${d.hotel_room_number}`).join(',');
					const content = config.get('message_content') || '';
					const locales = Object.keys(content).join(',') || 'en_US';

					const template = Handlebars.compile(JSON.stringify(content));
					const compiledContent = template({
						date: sendAt,
					});

					return this.createMessage(dates, time, hotelIds, hotelRoomNumbers, compiledContent, locales);
				})
				.then(newMessageId => {
					messageId = newMessageId;

					const hotelIds = devices.map(d => d.hotel_id);

					return this.createMessageHotels(hotelIds, messageId);
				})
				.then(() => {
					return this.createMessageInfo(messageId, sendAt);
				})
				.then(newMessageInfoId => {
					messageInfoId = newMessageInfoId;

					return this.createMessageRecipients(devices, messageId, messageInfoId);
				})
				.then(() => {
					// Set the message info status to pending
					return MessageInfo.update({
						status: 'pending',
					}, {
						where: {
							id: messageInfoId,
						},
					});
				})
				.then(() => {
					console.log('QA message send');

					return resolve({
						id: messageId,
						messageInfoId,
						sendAt,
						devices,
					});
				})
				.catch(err => {
					return reject(err);
				});
		});
	}

	/**
	 * Retrieve devices from the database
	 *
	 * @param {Array[Int]} barcodes
	 *
	 * @return {Promise}
	 */
	getDevices(barcodes) {
		return new Promise((resolve, reject) => {
			Device.findAll({
				where: {
					barcode: {
						$in: barcodes,
					},
					batterylv: {
						$gte: config.get('min_battery_lvl'),
					},
				},
			})
				.then(results => {
					console.log(`Found ${results.length} devices`);
					const devices = results.map(x => {
						return {
							barcode: x.barcode,
							hotel_id: x.hotel_id,
							hotel_room_number: x.hotel_room_number,
						};
					});

					return resolve(devices);
				})
				.catch(err => {
					console.error(err);

					return reject(err);
				});
		});
	}

	/**
	 * Create MessageHotels
	 *
	 * @param {Array[Int]} hotelIds
	 * @param {Int} messageId
	 *
	 * @return {Promise}
	 */
	createMessageHotels(hotelIds, messageId) {
		const q = [];

		// Remove duplicate hotel_id
		hotelIds = Array.from(new Set(hotelIds));

		hotelIds.forEach(hotelId => {
			const x = MessageHotel.create({
				message_id: messageId,
				hotel_id: hotelId,
			});

			q.push(x);
		});

		return Promise.all(q);
	}

	/**
	 * Create a new message object
	 *
	 * @param {String} hotelIds
	 * @param {String} hotelRoomNumbers
	 * @param {String} content
	 * @param {String} locals
	 * @param {String} category
	 *
	 * @return {Promise}
	 */
	createMessage(dates, time, hotelIds = '', hotelRoomNumbers = '', content = '', locales = '', category = 'f&b') {
		return new Promise((resolve, reject) => {
			Message.create({
				action: 'broadcastmessage',
				user_id: config.get('message_user'),
				status: 'pending',
				device_status: 'specific',
				hotel_ids: hotelIds,
				hotel_room_numbers: hotelRoomNumbers,
				dates,
				time,
				expiry: 2,
				zone_id: 1,
				locales,
				content,
				category,
			})
				.then(result => {
					if(!result.id) return reject('Errrrr');

					return resolve(result.id);
				})
				.catch(err => {
					return reject(err);
				});
		});
	}

	/**
	 * Create a new message info object
	 *
	 * @param {Int} messageId
	 * @param {Data} sendAt
	 *
	 * @return {Promise}
	 */
	createMessageInfo(messageId, sendAt) {
		return new Promise((resolve, reject) => {
			MessageInfo.create({
				message_id: messageId,
				send_at: sendAt,
				status: 'initialising',
				expiry: 2,
			})
				.then(result => {
					return resolve(result.id);
				})
				.catch(err => {
					return reject(err);
				});
		});
	}

	/**
	 * Create all the message recipients
	 *
	 * @param {String} devices
	 * @param {Int} messageId
	 * @param {Int} messageInfoId
	 *
	 * @return {Promise}
	 */
	createMessageRecipients(devices = [], messageId, messageInfoId) {
		const q = [];

		devices.forEach(device => {
			const x = MessageRecipient.create({
				message_id: messageId,
				hotel_id: device.hotel_id,
				hotel_room_number: device.hotel_room_number,
				message_info_id: messageInfoId,
			});

			q.push(x);
		});

		return Promise.all(q);
	}
}

module.exports = SendMessage;