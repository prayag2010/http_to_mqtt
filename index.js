var settings = {
    mqtt: {
        host: process.env.MQTT_HOST || '',
        user: process.env.MQTT_USER || '',
        password: process.env.MQTT_PASS || '',
        clientId: process.env.MQTT_CLIENT_ID || null
    },
    keepalive: {
        topic: process.env.KEEP_ALIVE_TOPIC || 'keep_alive',
        message: process.env.KEEP_ALIVE_MESSAGE || 'keep_alive'
    },
    debug: process.env.DEBUG_MODE || false,
    auth_key: process.env.AUTH_KEY || '',
    http_port: process.env.PORT || 5000
}

var mqtt = require('mqtt');
var express = require('express');
var bodyParser = require('body-parser');
var multer = require('multer');

var app = express();

function getMqttClient() {

    var options = {
        username: settings.mqtt.user,
        password: settings.mqtt.password
    };

    if (settings.mqtt.clientId) {
        options.clientId = settings.mqtt.clientId
    }

    return mqtt.connect(settings.mqtt.host, options);
}

var mqttClient = getMqttClient();

app.set('port', settings.http_port);
app.use(bodyParser.json());

function logRequest(req, res, next) {
    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress;
    var message = 'Received request [' + req.originalUrl +
        '] from [' + ip + ']';

    if (settings.debug) {
        message += ' with payload [' + JSON.stringify(req.body) + ']';
    } else {
        message += '.';
    }
    console.log(message);

    next();
}

function authorizeUser(req, res, next) {
    if (settings.auth_key && req.body['key'] != settings.auth_key) {
        console.log('Request is not authorized.');
        console.log('Saved Key');
        console.log(settings.auth_key);
        console.log('Received Key');
        console.log(req.body['key']);
        //next();
        res.sendStatus(401);
    }
    else {
        next();
    }
}

function checkSingleFileUpload(req, res, next) {
    if (req.query.single) {
        var upload = multer().single(req.query.single);

        upload(req, res, next);
    }
    else {
        next();
    }
}

function checkMessagePathQueryParameter(req, res, next) {
    if (req.query.path) {
        req.body.message = req.body[req.query.path];
    }
    next();
}

function checkTopicQueryParameter(req, res, next) {

    if (req.query.topic) {
        req.body.topic = req.query.topic;
    }

    next();
}

function ensureTopicSpecified(req, res, next) {
    if (!req.body.topic) {
        res.status(500).send('Topic not specified');
    }
    else {
        next();
    }
}

app.get('/keep_alive/', logRequest, function (req, res) {
    mqttClient.publish(settings.keepalive.topic, settings.keepalive.message);
    res.sendStatus(200);
});

app.get('/light0/', logRequest, function (req, res) {
    mqttClient.publish('lig/stae/0', 'S');
    res.sendStatus(200);
});

app.get('/fan0/', logRequest, function (req, res) {
    mqttClient.publish('fan/stae/0', 'S');
    res.sendStatus(200);
});

app.get('/light1/', logRequest, function (req, res) {
    mqttClient.publish('lig/comm/1', 'S');
    res.sendStatus(200);
});

app.post('/googletest/', logRequest, function (req, res) {
//     var lol = req.body.queryResult.parameters['state'];
//     console.log(lol[0]);
//     if(String(lol) == 'on'){
//         console.log('FUCK');
//     }
    
    var dfIntent = req.body.queryResult.intent['displayName'];
    console.log(dfIntent);
    if(dfIntent == 'lights'){
        console.log('Lights intent detected');
        var state = req.body.queryResult.parameters['state'];
        console.log('state[0]');
        if(String(state[0]) == 'on'){
            console.log('Lights on via Dialogflow');
            mqttClient.publish('lig/stae/0', 'O');
            mqttClient.publish('lig/comm/1', 'O');
        }
        if(String(state[0]) == 'off' || String(state[0]) == 'of'){
            console.log('Lights off via Dialogflow');
            mqttClient.publish('lig/stae/0', 'F');
            mqttClient.publish('lig/comm/1', 'F');
        }
    }
    res.sendStatus(200);
});

app.post('/post/', logRequest, authorizeUser, checkSingleFileUpload, checkMessagePathQueryParameter, checkTopicQueryParameter, ensureTopicSpecified, function (req, res) {
    mqttClient.publish(req.body['topic'], req.body['message']);
    res.sendStatus(200);
});

app.post('/dialog/', logRequest, function (req, res) {
    mqttClient.publish('test', req.body.result.parameters['color']);
    res.sendStatus(200);
});

app.get('/subscribe/', logRequest, authorizeUser, function (req, res) {

    var topic = req.query.topic;

    if (!topic) {
        res.status(500).send('topic not specified');
    }
    else {
        // get a new mqttClient
        // so we dont constantly add listeners on the 'global' mqttClient
        var mqttClient = getMqttClient();

        mqttClient.on('connect', function () {
            mqttClient.subscribe(topic);
        });

        mqttClient.on('message', function (t, m) {
            if (t === topic) {
                res.write(m);
            }
        });

        req.on("close", function () {
            mqttClient.end();
        });

        req.on("end", function () {
            mqttClient.end();
        });
    }
});

app.listen(app.get('port'), function () {
    console.log('Node app is running on port', app.get('port'));
});
