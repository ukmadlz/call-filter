'use strict';

require('dotenv').config({ silent: true });

const Hapi = require('hapi');
const cfenv = require('cfenv');
const knex = require('knex')({
    client: 'pg',
    connection: process.env.DATABASE_URL,
});
const twilio = require('twilio');
const debug = require('debug');

const { contactList, callLog } = require('./models/database');

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
  debug('app:error')(error);
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
    }
  ])
  // DB
  .then(() => {
    return knex.migrate.latest()
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
        const ContactList = new contactList(knex);
        const CallLog = new callLog(knex);

        const logCall = telephone_id => {
          return CallLog.query()
            .insert({
              telephone_id: telephone_id
            })
            .then(result => {
              debug('app:log')('Call logged for later reference');
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
              debug('app:log')(`[${callFrom}] Allowed number`);
              if (voicemailMode === true) {
                debug('app:log')(`[${callFrom}] Voicemail mode`);
                response.redirect(
                  {
                    method: 'POST'
                  },
                  '/twilio/record-voicemail'
                );
              } else {
                debug('app:log')(`[${callFrom}] Dialling host`);
                const dial = response.dial(
                  { timeout: 600 },
                  process.env.HOST_NUMBER
                );
              }
            } else if (result && result.allowed === false) {
              debug('app:log')(`[${callFrom}] Blocked number`);
              response.say(voiceSettings, 'Goodbye');
            } else {
              debug('app:log')(`[${callFrom}] Calling redirect user`);
              if (!result) {
                ContactList.query()
                  .insert({
                    telephone: callFrom
                  })
                  .then(result => {
                    debug('app:log')('New number added for review', result);
                    return logCall(result.id);
                  });
              }
              logCall(result.id);
              const dial = response.dial({
                action: '/twilio/record-voicemail',
                method: 'POST'
              });
              dial.number({ timeout: 20 }, process.env.REDIRECT_NUMBER);
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
            dial.number({ timeout: 20 }, process.env.REDIRECT_NUMBER);
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
  .then((data) => {
    debug('app:info')(`Server started at ${server.info.uri}`);
  })
  // Error
  .catch(consoleError);