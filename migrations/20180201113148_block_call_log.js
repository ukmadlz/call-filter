exports.up = knex => {
  return knex.schema
    .createTableIfNotExists('block_call_log', table => {
      table.increments('index');
      table.string('id');
      table.timestamps(true, true);
      table.string('telephone_id');
    })
    .then(() => {
      return knex.schema.alterTable('block_call_log', table => {
        table.dropPrimary();
        table.primary('id');
      });
    })
    .then(() => {
      return knex.schema.raw(`
      CREATE TRIGGER trigger_block_call_log_genid BEFORE INSERT ON block_call_log FOR EACH ROW EXECUTE PROCEDURE unique_short_id();
      `);
    });
};

exports.down = knex => {
  return knex.schema.dropTableIfExists('block_call_log');
};
