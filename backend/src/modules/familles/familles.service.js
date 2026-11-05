const db = require('../../config/db');
const repo = require('./familles.repository');

const list = () => repo.list();
const create = (user, data) => db.withTransaction({ userId: user.id }, (client) => repo.insert(client, data));

module.exports = { list, create };
