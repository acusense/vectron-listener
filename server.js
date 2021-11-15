////////////////////////////////////// Init

const fs = require('fs');
const mkdirp = require('mkdirp');
const os = require("os");
var net = require('net');
const axios = require('axios');

const DEVICE_NAME = process.env.DEVICE_NAME || os.hostname();
const GATEWAY = process.env.GATEWAY || 'https://tcptest.free.beeceptor.com'
const API_KEY = process.env.API_KEY || ''
const HOME_DIRECTORY = process.env.MESSAGE_DIRECTORY || '/var/vectron';
const TCP_PORT = process.env.TCP_PORT || 3554

const IN = HOME_DIRECTORY + '/in'
const WIP = HOME_DIRECTORY + '/wip'
const RETRY = HOME_DIRECTORY + '/retry'
const DONE = HOME_DIRECTORY + '/done'

const http_post_options = {
  headers: {
    'x-api-key': API_KEY,
    'Content-Type': 'application/json'
  }
}

let failures = 0;
let successes = 0;

mkdirp.sync(IN);
mkdirp.sync(WIP);
mkdirp.sync(RETRY);
mkdirp.sync(DONE);


////////////////////////////////////// Startup

logString(`Starting: ${DEVICE_NAME}`);
logString(`TCP on ${TCP_PORT}`);
logString(`Working directory: ${HOME_DIRECTORY}`);

if (GATEWAY) {
  logString(`API endpoint: ${GATEWAY}`);
} else {
  logString('API endpoint not defined. Messages will not be posted to an API Gateway');
}

moveFiles(IN, RETRY);
moveFiles(WIP, RETRY);

setInterval(retry, 60000);
setInterval(uploadCounts, 300000);


////////////////////////////////////// TCP Submissions

var server = net.createServer();

server.on('connection', conn => {

  let remoteAddress = conn.remoteAddress + ':' + conn.remotePort;
  let buffer = '';

  console.log('New client connection from %s', remoteAddress);

  conn.on('data', d => {
    buffer += d;
    if (buffer.length>10000) { buffer = ''; }
  });

  conn.once('close', e => {
    let json = undefined;
    try {
      json = JSON.parse(buffer);
    } catch (e) {
      logString('Non JSON string: ' + buffer);
    }
    if (json) { write( { source: remoteAddress, payload: json } ); }
    console.log('Connection from %s closed', remoteAddress)
  });

  conn.on('error', err => {
    console.log('Connection %s error: %s', remoteAddress, err.message);
  });

});

server.listen(TCP_PORT, function() {    
  console.log('Server listening to %j', server.address());  
});





////////////////////////////////////// File System watcher

let watch_in = fs.watch(IN);

watch_in.on('change', function name(event, filename) {
  if (event==='change') { moveFile(IN, filename, WIP) };
});

let watch_wip = fs.watch(WIP);

watch_wip.on('change', function name(event, filename) {
  let sourceFile = WIP + '/' + filename;
  if (fs.existsSync(sourceFile)) {
    fs.readFile(sourceFile, 'utf8', (err, data) => {
        if (err) {
          logString('Unable to read file: ' + err); 
        } else {
          if (GATEWAY) { postFile(filename, data) };
        }
      });
  }
});


////////////////////////////////////// Uploader

function postFile(filename, data) {
  axios.post(GATEWAY, data, http_post_options)
  .then((res) => {
    let awsRequestId = res.headers['x-amzn-requestid'];
    logString(awsRequestId ? `Uploaded. Request ID: ${awsRequestId}` : 'Uploaded. No request id.')
    postSuccess(filename);
  })
  .catch((error) => {
    logString('Failed to relay ' + filename);
    logString(error);
    postFailure(filename);
  });
}

function postSuccess(filename) {
  let directory = DONE + '/' + (new Date().toISOString().substring(0,10));
  mkdirp.sync(directory);
  moveFile(WIP, filename, directory);
  successes = successes + 1;
}

function postFailure(filename) {
  moveFile(WIP, filename, RETRY);
  failures = failures + 1;
}




////////////////////////////////////// Helper functions

function logString(s) {
  console.log(s)
}

function write(data) {
  data.received = data.received || ((new Date()).getTime() / 1000.0);
  data.uid = (data.uid || data.received + '.' + Math.floor(Math.random()*100000000));;
  let fileName = IN + '/' + data.uid;
  fs.writeFile(fileName, JSON.stringify(data), (err)=>{ if (err) throw err; });
}

function moveFile(fromDirectory, filename, toDirectory) {
  fs.rename(fromDirectory + '/' + filename, toDirectory + '/' + filename, (err) => {
    if (err) { console.log('Failed to move ' + fromDirectory + '/' + filename + ' to ' + toDirectory + ': ' + err);  }
  });
}

function moveFiles(fromDirectory, toDirectory) {
  let files = fs.readdirSync(fromDirectory);
  for (let i = 0; i < files.length; i++) {
    fs.rename(fromDirectory + '/' + files[i], toDirectory + '/' + files[i], (err) => { if (err) { console.log('Unable to move to retry queue: ' + err.message); }});
  }
}

function retry() {
  moveFiles(RETRY, WIP);
}

function uploadCounts() {
  write({
          source: DEVICE_NAME,
          payload: {
              successes: successes,
              failures: failures
        }
  });
  successes = 0;
  failures = 0;
}