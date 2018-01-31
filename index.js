'use strict';

require('dotenv').load({ silent: true });

const Hapi = require('hapi');
const cfenv = require('cfenv');
const twilio = require('twilio');

const appEnv = cfenv.getAppEnv();

const server = new Hapi.Server({
  host: appEnv.bind,
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
  .register({
    plugin: require('good'),
    options
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
      path: '/incoming-call',
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
            action: '/record-voicemail',
            method: 'POST'
          });
          dial.number(process.env.redirectNumber);
        }

        return response.toString();
      }
    });
    server.route({
      method: 'POST',
      path: '/record-voicemail',
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
