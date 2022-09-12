const joi = require('joi');

class Base {
    _knex;
    constructor(knex) {
        this._knex = knex;
    }
    query() {
        return {
            insert: async (record) => {
                try {
                    const valid = await this.joiSchema().validateAsync(record);
                    if(valid) {
                        return this._knex(this.tableName())
                        .insert(record)
                    }
                }
                catch (err) {
                    throw Error(err);
                }
            },
            findOne: async (query) => {
                try {
                    const valid = await this.joiSchema().validateAsync(query);
                    if(valid) {
                        return this._knex(this.tableName())
                            .where(query)
                            .limit(1)
                    }
                }
                catch (err) {
                    throw Error(err);
                }
            }
        }
    }
}

class contactList extends Base {
    tableName() {
        return 'contact_list';
    }

    joiSchema() {
        return joi.object({
            id: joi.string(),
            telephone: joi.number(),
            name: joi.string(),
            allowed: joi.bool()
        });
    }
    }

class callLog extends Base {
    tableName() {
        return 'block_call_log';
    }

    joiSchema() {
        return joi.object({
            id: joi.string(),
            telephone_id: joi.string()
        });
    }
}

module.exports = {
    contactList,
    callLog
}