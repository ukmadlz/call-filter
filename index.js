'use strict';

require('dotenv').load({ silent: true });

const Hapi = require('hapi');
const cfenv = require('cfenv');
const twilio = require('twilio');
const path = require('path');
const schwifty = require('schwifty');
const joi = require('joi');

const appEnv = cfenv.getAppEnv();

const server = new Hapi.Server({
  host: '0.0.0.0',
  port: appEnv.port
});

const options = {
  ops: {
    interval: 1000
  },
  reporters: {
    myConsoleReporter: [
      {
        module: 'good-squeeze',
        name: 'Squeeze',
        args: [{ log: '*', response: '*', error: '*' }]
      },
      {
        module: 'good-console'
      },
      'stdout'
    ]
  }
};

const voicemailMode = process.env.VOICEMAIL_MODE || false;

const consoleError = error => {
  console.log('------ Error ------');
  console.log(error);
  console.log('------ Error ------');
};

const voiceSettings = {
  voice: 'woman',
  language: 'en-gb'
};

server
  // Register the routes
  .register([
    {
      plugin: require('good'),
      options
    },
    {
      plugin: schwifty,
      options: {
        knex: require('knex')({
          client: 'pg',
          useNullAsDefault: true,
          connection: `${process.env.DATABASE_URL}?ssl=true`
        }),
        migrationsDir: path.join(__dirname, 'migrations'),
        migrateOnStart: true
      }
    }
  ])
  // DB
  .then(() => {
    return server.schwifty(
      class ContactList extends schwifty.Model {
        static get tableName() {
          return 'contact_list';
        }

        static get joiSchema() {
          return joi.object({
            id: joi.string(),
            telephone: joi.number(),
            name: joi.string(),
            allowed: joi.bool()
          });
        }
      }
    );
  })
  .then(() => {
    return server.schwifty(
      class CallLog extends schwifty.Model {
        static get tableName() {
          return 'block_call_log';
        }

        static get joiSchema() {
          return joi.object({
            id: joi.string(),
            telephone_id: joi.string()
          });
        }
      }
    );
  })
  // Add the routes
  .then(() => {
    server.route({
      method: 'GET',
      path: '/',
      handler: () => {
        return {};
      }
    });
    server.route({
      method: 'POST',
      path: '/twilio/incoming-call',
      handler: req => {
        const { ContactList, CallLog } = req.models();

        const logCall = telephone_id => {
          return CallLog.query()
            .insert({
              telephone_id: telephone_id
            })
            .then(result => {
              console.log('Call logged for later reference');
            });
        };

        const VoiceResponse = twilio.twiml.VoiceResponse;

        const notNaughtyList = [];

        const callFrom = req.payload.From.replace(/[^0-9\.]+/g, '');

        return ContactList.query()
          .findOne({ telephone: callFrom })
          .then(result => {
            const response = new VoiceResponse();

            if (result && result.allowed) {
              console.log(`[${callFrom}] Allowed number`);
              if (voicemailMode === true) {
                console.log(`[${callFrom}] Voicemail mode`);
                response.redirect(
                  {
                    method: 'POST'
                  },
                  '/twilio/record-voicemail'
                );
              } else {
                console.log(`[${callFrom}] Dialling host`);
                const dial = response.dial(
                  { timeout: 600 },
                  process.env.hostNumber
                );
              }
            } else if (result && result.allowed === false) {
              console.log(`[${callFrom}] Blocked number`);
              response.say(voiceSettings, 'Goodbye');
            } else {
              console.log(`[${callFrom}] Calling redirect user`);
              if (!result) {
                ContactList.query()
                  .insert({
                    telephone: callFrom
                  })
                  .then(result => {
                    console.log('New number added for review', result);
                    return logCall(result.id);
                  });
              }
              logCall(result.id);
              const dial = response.dial({
                action: '/twilio/record-voicemail',
                method: 'POST'
              });
              dial.number({ timeout: 20 }, process.env.redirectNumber);
            }

            return response.toString();
          })
          .catch(err => {
            consoleError(err);
            const response = new VoiceResponse();
            const dial = response.dial({
              action: '/twilio/record-voicemail',
              method: 'POST'
            });
            dial.number({ timeout: 20 }, process.env.redirectNumber);
            return response.toString();
          });
      }
    });
    server.route({
      method: 'POST',
      path: '/twilio/record-voicemail',
      handler: req => {
        const VoiceResponse = twilio.twiml.VoiceResponse;

        const response = new VoiceResponse();

        response.say(
          voiceSettings,
          'Please leave a message at the beep.\nPress the star key when finished.'
        );
        response.record({
          method: 'POST',
          action: '/twilio/recorded-voicemail',
          maxLength: 120,
          finishOnKey: '*'
        });
        response.say(voiceSettings, 'I did not receive a recording');

        return response.toString();
      }
    });
    server.route({
      method: 'POST',
      path: '/twilio/recorded-voicemail',
      handler: req => {
        const VoiceResponse = twilio.twiml.VoiceResponse;

        const response = new VoiceResponse();
        response.say(voiceSettings, 'Message recorded. Thank you. Goodbye');

        return response.toString();
      }
    });
  })
  // Start the server
  .then(() => {
    return server.start();
  })
  // It's alive
  .then(() => {
    console.info(`Server started at ${server.info.uri}`);
  })
  // Error
  .catch(err => consoleError);
