
This little server acts as a relay, pushing TCP packages from Vectron into a file for subsequent processing.

# Relay

TCP listener that relays what is received to a file, and then posts it to an endpoint.

# TCP Submissions

## Structure

Valid JSON. Less than 8KB.


## Bash Example
```
% nc localhost 3554
{ "Id": 1, "Name": "Coke" }
^C
```
# Keep Alive
Every minute, the relay server uploads a packet reflecting success and failure counts since the last submission:
```
{
  "source":"ubuntu1910",
  "payload":{"successes":0,"failures":0},
  "received":1585838990.455,
  "uid":"1585838990.455.50740082"
}
```


# Setup
## Base Installation
```
sudo mkdir /var/iot_relay
sudo chmod 777 /var/iot_relay/

cd ~
git clone git@github.com:renenw/relay.git
cd vectron_listener
npm install mkdirp --save
<!-- npm install express --save -->
npm install axios --save

```
Test: `node server`
```
pi@iot-relay:~/relay $ node server
Starting: iot-relay
HTTP on 3553
UDP on 54545
Working directory: /var/iot_relay
API endpoint: https://<my gateway>/ingest
UDP listener listening on 0.0.0.0:54545
HTTP listener started on port 3553
```

## Setup Environment Variables
On a Raspberry Pi: `sudo nano /etc/profile` and add your environment variables at the end:
```
export GATEWAY=https://<your gateway>/ingest
export API_KEY=<your key>
```

**NB:** To make pm2 refresh its understanding of these environment variables, you must run: `pm2 start server --update-env`. Nope, perhaps: `pm2 restart all --update-env`?

For details on how these variables are used, see Environment Variables below. In particular,  the API_KEY is passed to the Gateway POST request as an `x-api-key` header.

I restart the device, and test that our changes worked by calling: `printenv GATEWAY`

## Service creation

I took [this article's](https://www.digitalocean.com/community/tutorials/how-to-set-up-a-node-js-application-for-production-on-ubuntu-18-04) guidance.
```
sudo npm install pm2@latest -g
pm2 start server.js
pm2 startup systemd
```
And, run the command as instructed by the previous step.

Finally, and I'm not entirely sure why: `pm2 save`

### Useful PM2 commands

```
pm2 env 0
pm2 list
pm2 stop server
pm2 start server
pm2 start server --update-env   # not sure this worked
pm2 restart server
pm2 info server
pm2 logs server
pm2 monit
pm2 restart all --update-env    # this may have worked - but also ran an update of pm2
```

## Clean Up Cron
I use a nightly cron:

`find /var/iot_relay/done/* -maxdepth 1 -type d -ctime +7  | xargs rm -rf`
# Environment Variables

|Variable|Default|Purpose|
|-|-|-|
|DEVICE_NAME|*System host name*|Used as the `source` in the submission of metrics.|
|GATEWAY|https://relay.free.beeceptor.com|Endpoint messages will be forwarded to.|
|UDP_PORT|`54545`|UDP port on which server will listen.|
|HTTP_PORT|`3553`|TCP port on which HTTP server will listen.|
|GATEWAY|*None*|AWS Gateway URL where payloads will be posted.|
|MESSAGE_DIRECTORY|`/var/iot_relay`|Directory where messages are stored. Several sub-directories will be created beneath this root to manage message flow to AWS.|
|API_KEY|*None*|I leverage AWS Gateway's API key mechanism to secure requests. This `API_KEY` is used to set the `x-api-key` header on submissions.|
|MQTT_BROKER|*None*|IP address of MQTT broker. If your broker is running on the same Pi, `localhost`. If this variable is not set, MQTT messages will not be sent.|
### Gotcha
To make pm2 refresh its understanding of these environment variables, you must run: `pm2 start server --update-env`

### Samples
Typically you will just set the 
```
export DEVICE_NAME=my_arduino
export GATEWAY=https://relay.free.beeceptor.com
export HTTP_PORT=3000
export UDP_PORT=3000
export MESSAGE_DIRECTORY=/blah
export API_KEY=abcd
export MQTT_BROKER=localhost
```
# Amazon Setup
API Gateway --> SNS --> lamda: [see](https://www.alexdebrie.com/posts/aws-api-gateway-service-proxy/)
