'use strict';

require('dotenv').load({ silent: true });

const Hapi = require('hapi');
const cfenv = require('cfenv');
const twilio = require('twilio');
const path = require('path');

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

server
  // Register the routes
  .register([
    {
      plugin: require('good'),
      options
    },
    {
      plugin: require('schwifty'),
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
        const VoiceResponse = twilio.twiml.VoiceResponse;

        const notNaughtyList = [];

        const callFrom = req.payload.From;

        const response = new VoiceResponse();
        console.log(notNaughtyList.indexOf(callFrom));
        if (notNaughtyList.indexOf(callFrom) >= 0) {
          const dial = response.dial({ timeout: 600 }, process.env.hostNumber);
        } else {
          const dial = response.dial({
            action: '/twilio/record-voicemail',
            method: 'POST'
          });
          dial.number(process.env.redirectNumber);
        }

        return response.toString();
      }
    });
    server.route({
      method: 'POST',
      path: '/twilio/record-voicemail',
      handler: req => {
        const VoiceResponse = twilio.twiml.VoiceResponse;

        const response = new VoiceResponse();

        response.say(
          'Please leave a message at the beep.\nPress the star key when finished.'
        );
        response.record({
          action: 'http://foo.edu/handleRecording.php',
          method: 'GET',
          maxLength: 120,
          finishOnKey: '*',
          transcribe: true
        });
        response.say('I did not receive a recording');

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
  .catch(err => {
    console.log('------ Error ------');
    console.log(err);
    console.log('------ Error ------');
  });
