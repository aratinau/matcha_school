//var http = require('http');
var express = require('express');
var session = require('express-session');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var errorHandler = require('errorhandler');
var MongoStore = require('connect-mongo')(session);
var flash = require('req-flash');
var Twig = require("twig");
var validator = require('express-validator');

var app = express();

//var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);

app.locals.pretty = true;
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/app/server/views');
app.set('view engine', 'twig');
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(validator());
app.use(require('stylus').middleware({ src: __dirname + '/app/public' }));
app.use(express.static(__dirname + '/app/public'));
app.use('/bower_components',  express.static(__dirname + '/bower_components'));
app.set('uploads_path', __dirname + '/app/public/uploads');

// build mongo database connection url //

var dbHost = process.env.DB_HOST || 'localhost'
var dbPort = process.env.DB_PORT || 27017;
var dbName = process.env.DB_NAME || 'good-start';

var dbURL = 'mongodb://'+dbHost+':'+dbPort+'/'+dbName;
if (app.get('env') == 'live'){
// prepend url with authentication credentials // 
	dbURL = 'mongodb://'+process.env.DB_USER+':'+process.env.DB_PASS+'@'+dbHost+':'+dbPort+'/'+dbName;
}

app.use(session({
	secret: 'faeb4453e7c76c735d14fe6f6d04637f7807d1b4',
	proxy: true,
	resave: true,
	saveUninitialized: true,
	store: new MongoStore({ url: dbURL })
	})
);

app.use(flash({ locals: 'flash' }));

require('./app/server/routes')(app, io);

/*
io.on('connection', function (socket) {
  socket.emit('news', { hello: 'world' });
  socket.on('my other event', function (data) {
    console.log(data);
  });
});
*/

server.listen(app.get('port'), function() {
	console.log('Express server listening on port ' + app.get('port') + ' 😎 🍾');
});
/*
http.createServer(app).listen(app.get('port'), function(){
	console.log('Express server listening on port ' + app.get('port') + ' 😎 🍾');
});
*/

// http://www.journaldev.com/7995/node-expressjs-socket-io-module
