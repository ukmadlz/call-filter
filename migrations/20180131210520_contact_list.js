exports.up = knex => {
  return knex.schema
    .createTableIfNotExists('contact_list', table => {
      table.increments('index');
      table.string('id');
      table.timestamps(true, true);
      table.bigInteger('telephone').unique();
      table.string('name');
      table.boolean('allowed');
    })
    .then(() => {
      return knex.schema.alterTable('contact_list', table => {
        table.dropPrimary();
        table.primary('id');
      });
    })
    .then(() => {
      return knex.schema.raw(`
      CREATE TRIGGER trigger_contact_list_genid BEFORE INSERT ON contact_list FOR EACH ROW EXECUTE PROCEDURE unique_short_id();
      `);
    });
};

exports.down = knex => {
  return knex.schema.dropTableIfExists('contact_list');
};
