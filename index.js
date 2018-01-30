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
      method: 'POST',
      path: '/incoming-call',
      handler: req => {
        console.log(req);
        const VoiceResponse = twilio.twiml.VoiceResponse;

        const callFrom = req.payload.From;

        const response = new VoiceResponse();
        const dial = response.dial();
        dial.number(process.env.hostNumber);

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
