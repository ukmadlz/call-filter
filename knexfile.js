// Update with your config settings.

const basicConfig = {
  client: 'postgresql',
  connection: process.env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    tableName: 'knex_migrations'
  }
};

module.exports = {
  development: basicConfig,
  staging: basicConfig,
  production: basicConfig
};
