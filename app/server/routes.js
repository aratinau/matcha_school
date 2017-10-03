var AM = require('./modules/account-manager.js');
var MP = require('./modules/missing-part.js');
var EM = require('./modules/email-dispatcher');
var geoip = require('geoip-lite');
var formidable = require('formidable');
var fs = require('fs');
var remove = require('remove');
var moment 		= require('moment');
var Entities = require('html-entities').XmlEntities;
entities = new Entities();

module.exports = function(app, io) {

	app.get('*', function(req, res, next) {
		// si le cookie existe et si l'user n'est pas dans session
		if ((req.cookies.user != undefined || req.cookies.pass != undefined) && req.session.user == null)
		{
			AM.loginViaCookie(req.cookies.user, req.cookies.pass, function(o) {
				if (o != null) {
					req.session.user = o;
				}
			});
		}
		res.locals.session = req.session;
		next();
	});

	var isAuthenticated = function (req, res, next) {
		if (req.session.user != null)
			next();
		else
		{
			req.flash('danger', 'You must be logged');
			res.redirect('/login');
		}
	};

	app.get('/', function(req, res) {
		var geo = geoip.lookup('62.210.34.139');
		res.render('index', {geo:geo});
	});

	app.get('/login', function(req, res) {
		res.render('login', { title: 'page login' });
	});

	app.post('/login', function(req, res) {
		AM.login(req.body.email, req.body.pass, function(e, o) {
			if (o == null)
			{
				res.render('login',
					{
						title : 'page register',
						errors : e
					}
				);
				return;
			}
			else
			{
				req.session.user = o;
				if (o.email_check != 0)
				{
					req.session.user = null;
					app.locals.user = null;
					req.flash('danger', 'You must valide your mail');
					res.redirect('/login');
					return;
				}

				req.flash('success', 'Vous etes bien identifie');
				if (req.body['remember-me'] == 'on') {
					res.cookie('user', o.user, { maxAge: 900000 });
					res.cookie('pass', o.pass, { maxAge: 900000 });
				}
				res.redirect('/');
			}
			return;
		});
	});

	app.get('/register', function(req, res) {
		res.render('register', { title: 'page register' });
	});

	app.post('/register', function(req, res, next) {

		req.checkBody("email", "Enter a valid email address.").isEmail();
		req.checkBody("firstname", "Error in firstname.").isAlpha().isLength({min:2, max:20});
		req.checkBody("lastname", "Error in lastname.").isAlpha().isLength({min:2, max:20});
		req.checkBody("user", "Error in username.").isAlpha().isLength({min:2, max:20});
		req.checkBody("pass", "Error in password.").isLength({min:6, max:20});

		var errors = req.validationErrors();
		if (errors) {
			res.render('register',
				{
					title : 'page register',
					errors : errors
				}
			);
			return;
		} else {
			AM.register({
				email: req.body.email,
				firstname: req.body.firstname,
				lastname: req.body.lastname,
				user: req.body.user,
				pass: req.body.pass,
				email_check: Math.floor(Math.random() * 10000000000000)
			}, function (e, o) {
				if (o) {
					EM.dispatchCheckMail(o, function (e, m) {
						if (m) {
							req.flash('success', 'Check your mail please');
							res.redirect('/login');
							res.end();
						}
					});
				}
				else {
					res.render('register',
						{
							title : 'page register',
							errors_db : e,
							errors : errors
						}
					);
				}
			});
		}
	});

	app.get('/check-mail', function (req, res, next) {
		var email = req.query["e"];
		var email_check = req.query["cs"];
		AM.validateMail(email, email_check, function(e, o) {
			if (e != 'ok') {
				console.log(o);
			}
		});
		req.flash('success', 'Your mail is now valide - You can login');
		res.redirect('/login');
		return;
	});

	app.get('/lost-password', function(req, res) {
		res.render('lost-password');
	});

	app.post('/lost-password', function(req, res){
		AM.getAccountByEmail(req.body['email'], function(o){
			if (o){
				EM.dispatchResetPasswordLink(o, function(e, m){
					if (!e){
						res.status(200).send('ok');
					}	else{
						for (k in e) console.log('ERROR : ', k, e[k]);
						res.status(400).send('unable to dispatch password reset');
					}
				});
			}	else{
				res.status(400).send('email-not-found');
			}
		});
	});

	app.get('/reset-password', function(req, res) {
		var email = req.query["e"];
		var passH = req.query["p"];
		AM.validateResetLink(email, passH, function(e){
			if (e != 'ok'){
				res.redirect('/');
			} else {
				req.session.reset = { email:email, passHash:passH };
				res.render('reset');
			}
		})
	});

	app.post('/reset-password', function(req, res) {
		var nPass = req.body['pass'];
		var email = req.session.reset.email;
		AM.updatePassword(email, nPass, function(e, o){
			if (o) {
				req.flash('success', 'Password changed sucessfully');
				res.redirect('/login');
			}	else {
				res.status(400).send('unable to update password');
			}
		})
	});

	app.get('/logout', function(req, res) {
		res.clearCookie('user');
		res.clearCookie('pass');
		req.flash('success', 'You\'re now logged out');
		
		req.session.user = null;
		app.locals.user = null;
		res.redirect('/');
	});

	/*
	 * isAuthenticated
	 */
	app.get('/all-users', isAuthenticated, function(req, res) {
		AM.getAllUsers( function(e, accounts) {
			res.render('list-users', { title : 'Liste des utilisateurs', accts : accounts });
		})
	});

	app.get('/update-profile', isAuthenticated, function(req, res) {
		var photos = req.session.user.files;

		// enregistres les changement dans la variable session
		function myFunction(item, index) {
			var split_path = item['_writeStream']['path'].split("/");
			item['_writeStream']['path'] = split_path[split_path.length - 2] + '/'+ split_path[split_path.length - 1];
		}

		AM.getDataUser(req.session.user.email, function (e, o) {
			if (o) {
				if (o.files != undefined)
					o.files.forEach(myFunction);
				else
					console.log('pas de photos');
				AM.getAllTags(function (e, t) {
					res.render('update-profile',
						{
							value:req.session.user,
							photos:o.files,
							tags:t,
							user:o
						}
					);
				});
			} else {
				res.status(400).send('error in getDataUser');
			}
		});

	});

	app.post('/update-profile', isAuthenticated, function(req, res) {
		var tags_array = req.body['tags'];
		console.log(tags_array);
		if (typeof tags_array == 'string')
		{
			tags_array = new Array();
			tags_array.push(req.body['tags']);
		}
		else
		{
			tags_array = req.body['tags'];
		}
		for (var i in tags_array) {
			AM.addNewTag({
				name: tags_array[i]
			}
			, function (e, o) {
				if (e != null)
				{
					console.log(e);
				}
				else
				{
					console.log(o);
				}
			});
		}
		AM.updateAccount({
				id : req.session.user._id,
				firstname : req.body['firstname'],
				lastname : req.body['lastname'],
				user : req.body['user'],
				bio : req.body['bio'],
				sex : req.body['sex'],
				dateOfBirth : req.body['dateOfBirth'],
				interested_by_men : req.body['interested_by_men'],
				interested_by_women : req.body['interested_by_women'],
				tags: tags_array
			}, function(e, o) {
				if (o) {
					req.session.user = o;
					req.flash('success', 'Account changed sucessfully');
					res.redirect('/update-profile');
				} else {
					res.status(400).send('unable to update account');
				}
		});
	});

	/*
	 * upload functions
	 */
	app.post('/upload-target', function (req, res, next) {
		var form = new formidable.IncomingForm();
		form.uploadDir = app.get('uploads_path');

		form.parse(req, function(err, fields, files) {
			if ('file' in files) {
				var file = files['file'];
				if (file.type == 'image/png' || file.type == 'image/jpeg' || file.type == 'image/jpg')
				{
					AM.managePhotos(req.session.user.email, file, function(e, o) {
					});
				}
				module.exports._deleteFiles(files);
				res.sendStatus(200);
			} else {
				module.exports._deleteFiles(files);
				res.sendStatus(400);
			}
		});
	});

	module.exports._deleteFiles = function (files) {
		// Delete temporary files
		for (var f in files) {
			// fs.unlink(files[f].path);
		}
	};

	app.post('/delete-picture', isAuthenticated, function(req, res) {
		var complete_img_path = app.get('uploads_path') + '/' + JSON.parse(req.body['json_string']).name_img;
		AM.isAllowedTodeletePhoto(req.session.user.email, complete_img_path, function (e, o) {
			AM.deletePhoto(req.session.user.email, o.is_user_owner, function(e, o) {
				if (o) {
					//res.sendStatus(200);
				}	else {
					//res.status(400).send('error delete photo');
				}
			});
			remove.removeSync(complete_img_path);
		});
	});

	app.get('/update-settings', isAuthenticated, function(req, res) {
		res.render('update-settings');
	});

	app.post('/update-settings-new-mail', isAuthenticated, function(req, res) { //
		var newMail = req.body['newMail'];
		if (newMail != '')
		{
			AM.updateMail(req.session.user.email, Math.floor(Math.random() * 10000000000000), newMail, function(e, o){
				if (o) {
					req.flash('success', 'Please valid your new mail');
					res.redirect('/update-settings');
				}	else {
					res.status(400).send('unable to update mail');
				}
			})
		}
		else
		{
			res.redirect('/update-settings');
		}
	});

	app.get('/update-photos', isAuthenticated, function(req, res) {
		AM.getDataUser(req.session.user.email, function (e, o) {
			if (o) {
				res.render('update-photos', {countphotos: 5 - o.files.length} );
			}
		});
	});

	app.get('/get-total-photos', isAuthenticated, function(req, res) {
		AM.getDataUser(req.session.user.email, function (e, o) {
			if (o) {
				res.setHeader('Content-Type', 'application/json');
				res.send(JSON.stringify({'obj' : { 'countphotos' : o.files.length }}));
			}
		});
	});

	app.post('/choose-as-avatar', isAuthenticated, function(req, res) {
		AM.setAvatar(req.session.user.email, req.body.val, function(e, o) {
		});
	});

	app.get('/check-new-mail', function(req, res) {
		var new_email = req.query["ne"];
		var new_email_check = req.query["nec"];
		AM.recordTheNewMail(new_email_check, new_email, function(e, o) {
			// votre nouveau mail est bien enregister
			if (o) {
				req.flash('success', 'You can now use your new email');
				res.clearCookie('user');
				res.clearCookie('pass');
				req.session.user = null;
				app.locals.user = null;
				res.redirect('/login');
			}	else {
				res.status(400).send('unable to update mail');
			}
		});
	});

	app.post('/update-settings-new-password', isAuthenticated, function(req, res) {
		var actualPassword = req.body['actualPassword'];
		var newPassword = req.body['newPassword'];
		var retypeNewPassword = req.body['retypeNewPassword'];
		if (actualPassword != '' && newPassword != '' && retypeNewPassword != '')
		{
			AM.updatePasswordFromSettingsPage(req.session.user.email, actualPassword, newPassword, function(e, o) {
				if (newPassword == retypeNewPassword)
				{
					if (e == 'invalid-password')
						req.flash('danger', 'Invalid password');
					if (e == null)
						req.flash('success', 'Your password has been changed');
				}
				else
				{
					req.flash('danger', 'Password does not mach');
				}
				res.redirect('/update-settings');
			});
		}
	});

	app.get('/find', isAuthenticated, function(req, res) {
	AM.getAllTags( function(e, tags) {
			res.render('find', { tags : tags });
		});
	});

	app.post('/find', isAuthenticated, function(req, res) {
		function getDistanceFromLatLonInKm(lat1,lon1,lat2,lon2) {
			var R = 6371; // Radius of the earth in km
			var dLat = deg2rad(lat2-lat1);  // deg2rad below
			var dLon = deg2rad(lon2-lon1); 
			var a = 
				Math.sin(dLat/2) * Math.sin(dLat/2) +
				Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
				Math.sin(dLon/2) * Math.sin(dLon/2)
				; 
			var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
			var d = R * c; // Distance in km
			return d;
		}

		function deg2rad(deg) {
			return deg * (Math.PI/180)
		}

		var JSONtags = new Array();
		if (req.body['tags'] != undefined)
		{
			if (typeof req.body.tags == 'object')
			{
				for (var i = 0; i < req.body.tags.length; i++)
				{
					JSONtags.push({tags: req.body.tags[i]});
				}
			}
			else
				JSONtags.push({tags: req.body.tags});
		}
		var OBJoptions = {};
		// orientation sexuelle des users
		/*
		 * si je suis un hetero de sexe masculin -> j'ai en retour des femmes qui aiment les hommes
		 * si je suis bi -> j'ai en retour des femmes et des hommes qui aiment les personnes du meme sexe que moi
		 * si je suis homo -> j'ai en retour des personnes du meme sexe que moi
		 */
		var algo_sex = new Object();
		var interest;
		// je suis interesse par les hommes et les femmes
		if (req.session.user.interested_by_men == 'on' && req.session.user.interested_by_women == 'on')
		{
			algo_sex = { $or : [{sex : 'women'} ,  {sex : 'men'} , {sex : null} ]};
			// j'ai en retour les hommes et les femmes qui ont un interet pour mon sexe
			//  exclure les personnes qui on interested = null pour le sexe de l'user
			if (req.session.user.sex == 'men')
				interest = { interested_by_men : 'on' };
			if (req.session.user.sex == 'women')
				interest = { interested_by_women : 'on' };
			else
			{
				// sexe non renseigne
				interest = { $or : [ {interested_by_women : 'on'} ,  {interested_by_men : 'on'} ] };
			}
		}
		else if (req.session.user.sex == 'men' && req.session.user.interested_by_women == 'on' && req.session.user.interested_by_men == undefined) // je suis un homme hetero
		{
			algo_sex = { sex : 'women' }, {sex : null};
			interest = { interested_by_men : 'on' };
		}
		else if (req.session.user.sex == 'women' && req.session.user.interested_by_men == 'on' && req.session.user.interested_by_women == undefined) // je suis une femme hetero
		{
			algo_sex = { sex : 'men' }, {sex : null};
			interest = { interested_by_women : 'on' };
		}
		else if (req.session.user.sex == 'men' && req.session.user.interested_by_women == undefined && req.session.user.interested_by_men == 'on') // je suis un homme gay
		{
			algo_sex = { sex : 'men' }, {sex : null};
			interest = { interested_by_men : 'on' };
		}
		else if (req.session.user.sex == 'women' && req.session.user.interested_by_women == 'on' && req.session.user.interested_by_men == undefined) // je suis une femme gay
		{
			algo_sex = { sex : 'women' }, {sex : null};
			interest = { interested_by_women : 'on' };
		}

		var pop_selected = req.body['pop-selected'].split(',');
		if (req.body['tags'] != undefined)
		{
			// si il y a des tags
			OBJoptions = new Object({
				$and : [
					{ $or:JSONtags },
					{ $or : [ algo_sex ] },
					{ user: { $ne: req.session.user.user }},
					interest,
					{ popularite : { $gte : parseInt(pop_selected[0]), $lte : parseInt(pop_selected[1]) }}
				]
			});
		}
		else
		{
			OBJoptions = new Object({
				$and : [
					{ $or : [ algo_sex ] },
					{ user: { $ne: req.session.user.user }},
					interest,
					{ popularite : { $gte : parseInt(pop_selected[0]), $lte : parseInt(pop_selected[1]) }}
				]
			});
		}
		AM.getAllUsersWithOptions(
			OBJoptions
			,
			{
				"sort": [['date','desc']]
			},
			function(e, users) {
				for (var key in users)
				{
					var obj = users[key];
					if (getDistanceFromLatLonInKm(req.session.user.latitude, req.session.user.longitude, obj.latitude, obj.longitude) > req.body['dist-selected'])
					{
						delete users[key];
					}
					else
						obj.distance = getDistanceFromLatLonInKm(req.session.user.latitude, req.session.user.longitude, obj.latitude, obj.longitude);

					if (obj.dateOfBirth !== undefined)
					{
						var age_selected = req.body['age-selected'].split(',');
						var age = moment().diff(moment(obj.dateOfBirth), 'years');
						if (((parseInt(age_selected[0]) <= parseInt(age)) && (parseInt(age_selected[1]) >= parseInt(age))))
						{
							console.log(obj.user + ' est affiche 🐶');
						}
						else
						{
							delete users[key];
						}
						obj.age = age;
					}
				}
			res.render('find_json', {users:users});
		});
	});

	app.post('/update-geo', isAuthenticated, function(req, res) {
		AM.updatePosition(req.session.user.email, req.body['latitude'], req.body['longitude'], function(e, o){
			if (o) {
			}
		})
	});

	app.get('/profile/:id', isAuthenticated, function(req, res) {
		function myFunction(item, index) {
			var split_path = item['_writeStream']['path'].split("/");
			item['_writeStream']['path'] = split_path[split_path.length - 2] + '/'+ split_path[split_path.length - 1];
		}
		AM.findOneUserById(req.params.id, function(e, o) {
			o.files.forEach(myFunction);
			o.age = moment().diff(moment(o.dateOfBirth), 'years');

			AM.findOneUserById(req.session.user._id, function(e, dataCurrentUser) {
				res.render('profile', { user:o, countPhotos:dataCurrentUser.files.length });
			});
		});
	});

	app.get('/notifications', isAuthenticated, function(req, res) {
		var notifs = {};
		var connected_with = [];

		AM.getDataUser(req.session.user.email,  function(e, o) {
			notifs.likes = o.usersLiked;
			notifs.connectedTo = o.connectedTo;
			notifs.usersWhoLikeMe = o.usersWhoLikeMe;
			notifs.usersMessagesUnread = o.usersMessagesUnread;
			notifs.usersVisitedMe = o.usersVisitedMe;
			res.render('notifications', { notifs : notifs });
		});

	});

	app.get('/chat/:user', isAuthenticated, function(req, res) {
		res.render('chat', { to : req.params.user });
	});

	app.post('/new-message', isAuthenticated, function(req, res) {
		if (req.body.message != '') {
			AM.newMessageChat(req.session.user.user, req.body.to, entities.encode(req.body.message), function(e, o) {
				AM.addUsersMessagesUnread(entities.encode(req.body.to), req.session.user.user, function(e, o) {
					res.render('chat', { to : req.params.user  });
				});
			});
		}
	});

	app.get('/get-message/:user', isAuthenticated, function(req, res) {
		AM.getMessageChat(req.session.user.user, req.params.user, function(e, o) {
			res.render('chat_json', { iam:req.session.user.user, messages:o });
		});
	});

	app.post('/send-a-like', isAuthenticated, function(req, res) {
		AM.newLike(req.session.user.email, req.body.val, function(e, o) {
			// est ce qu'il est deja liker par l'autre personne ?
			AM.isLiked(req.body.val, req.session.user._id, function(e, o) {
				if (o == 'not liked') {
					AM.newUserWhoLikeMe(req.session.user._id, req.body.val, function(e, o) {
						AM.newNotification(req.body.val, function(e, o) {
							res.end();
						});
					});
				} else {
					console.log('les users sont connected');
					// on rajute au tableau ConnectedTo de chaque user
					AM.newUserWhoLikeMe(req.session.user._id, req.body.val, function(e, o) {
						AM.newUsersConnected(req.session.user._id, req.body.val, function(e, o) {
							AM.newUsersConnected(req.body.val, req.session.user._id, function(e, o) {
								AM.newNotification(req.body.val, function(e, o) {
									res.end();
								});
							});
						});
					});
				}
			});
		});
	});

	app.post('/remove-a-like', isAuthenticated, function(req, res) {
		AM.deLiked(req.session.user._id, req.body.val, function(e, o) {
			AM.newNotification(req.body.val, function(e, o) {
				res.end();
			});
		});
	});

	app.get('/is-liked/:id', isAuthenticated, function(req, res) {
		AM.isLiked(req.session.user._id, req.params.id, function(e, o) {
			if (o == 'not liked') {
				res.setHeader('Content-Type', 'application/json');
				res.send(JSON.stringify({'isLiked' : 0}));
				res.end();
			} else {
				res.setHeader('Content-Type', 'application/json');
				res.send(JSON.stringify({'isLiked' : 1}));
				res.end();
			}
		});
	});

	app.get('/is-user-connected/:id', function (req, res) {
		// info user visited :
		AM.findOneUserById(req.params.id, function(e, user_visited) {
			res.setHeader('Content-Type', 'application/json');
			if (user_visited.usersLiked.indexOf(req.session.user._id) !== -1)
				res.send(JSON.stringify(1));
			else
				res.send(JSON.stringify(0));
		});
	});

	app.post('/update-status', isAuthenticated, function(req, res) {
		AM.updateStatus(req.session.user.user, function(e, o){
			if (o) {
				res.end();
			}
		})
	});

	app.post('/get-status', isAuthenticated, function(req, res) {
		AM.getStatus(req.body['pseudo'], function(e, o) {
			if (o) {
				res.setHeader('Content-Type', 'text/html');
				if (moment().diff(o.date, 'minutes') >= 1) {
					res.send('offline');
				}
				else {
					res.send('online');
				}
			} else {
				res.send('online');
			}
			res.end();
		});
	});

	app.get('/get-notifications', isAuthenticated, function(req, res) {
		AM.getDataUser(req.session.user.email,  function(e, o) {
			res.setHeader('Content-Type', 'text/html');
			var nbMessageUnread = 0;

			if (o.usersMessagesUnread != undefined)
			{
				nbMessageUnread = o.usersMessagesUnread.length;
			}

			if (o) {
				res.send(JSON.stringify(parseInt(o.count_notif) + nbMessageUnread));
			} else {
				res.send(JSON.stringify(nbMessageUnread));
			}
		});
	});

	app.post('/reset-notifications', isAuthenticated, function(req, res) {
		AM.resetNotifications(req.session.user._id, function(e, o) {
			if (o) {
				res.end();
			}
		});
	});
	app.post('/reset-nbmessageunread/:user', isAuthenticated, function(req, res) {
		AM.resetUsersMessagesUnread(req.session.user.user, entities.encode(req.params.user), function(e, o) {
			if (o) {
				res.end();
			}
		});
	});

	app.post('/new-visit', isAuthenticated, function(req, res) {
		//
		AM.addPointPopularite(req.body.val, function(e, o) {});
		AM.newVisit(req.body.val, req.session.user._id, function(e, o, visited) {
			if (visited == 0) {
				AM.newNotification(req.body.val, function(e, o) {
					res.end();
				});
			}
		});
		res.end();
	});

	app.post('/new-history', isAuthenticated, function(req, res) {
		AM.newHistory(req.session.user._id, req.body.val, function(e, o) {
			if (o) {
				res.end();
			}
		});
		res.end();
	});

	app.get('/history', isAuthenticated, function(req, res) {
		AM.getDataUser(req.session.user.email, function(e, history) {
			res.render('history', { history : history.usersHistory });
		})
	});

	app.get('/get-username/:id', isAuthenticated, function(req, res) {
		res.setHeader('Content-Type', 'text/html');
		AM.findOneUserById(req.params.id , function(e, o) {
			if (o) {
				res.send(o.user);
			}
		});
	});

	// var de websocket
	var users = [];
	var clients = [];
	var nicknames = {};
	var namesUsed = [];

	io.on('connection', function (socket, pseudo) {

		function search(nameKey, socket, myArray) {
			for (var i=0; i < myArray.length; i++) {
					if (myArray[i].user === nameKey && myArray[i].socket === socket) {
						//return myArray[i];
						return i;
				}
			}
		}
		function dump(obj) {
			var out = '';
			for (var i in obj) {
				out += i + ": " + obj[i] + "\n";
			}
			return out;
		}
		function forEachFunction(item, index) {
			console.log('index : ' + index + '\n');
			console.log('item : ' + dump(item));
		}

		// Dès qu'on nous donne un pseudo, on le stocke en variable de session et on informe les autres personnes
		//console.log('connection socket');
		socket.on('nouveau_client', function(user) {
			user = entities.encode(user);
			io.user = user;
			//socket.broadcast.emit('nouveau_client', pseudo);
			// ajoute le nouveau client au tableau :
			/*
			 * chercher si le pseudo est deja dans l'array users
			 * si non : on l'ajoute
			 *
			 */
			users.push({user:user, socket:socket});
			//console.log('log de users[] : ' + users.forEach(forEachFunction));
			console.log('search : ' + search(user, socket, users));
			console.log('log de users[] : ' + users);
		});

		// Dès qu'on reçoit un message, on récupère le pseudo de son auteur et on le transmet aux autres personnes
		socket.on('message', function (message) {
			message = entities.encode(message);
			socket.broadcast.emit('message', { pseudo: io.user, message: message });
		});

		socket.on('private', function (message) {
			message = entities.encode(message);
			socket.emit('message', 'nouveau message');
			console.log('private content : ' + message);
		});

		// Smitha
		socket.on('choose nickname', function(nick) {
			if (namesUsed.indexOf(nick) !== -1) {
				cb('That name is already taken!  Please choose another one.');
				return ;
			}
			clients[nick] = socket;
			nicknames[socket.id] = nick;
		});

		socket.on('private message', function(data){
			if (namesUsed.indexOf(data.userToPM) !== -1) {
				var from = nicknames[socket.id];
				clients[data.userToPM].emit('private message', {from: from, msg: data.msg});
			}
		});

		socket.on('ask status', function (pseudo_status) {
			// est ce que le login est dans les users connecte ?
			console.log('ici : ');
			// cherche si l'user a une connection socket active
			for (var i in nicknames) {
				if (nicknames[i] == pseudo_status)
				{
					socket.emit('status', 1);
					return ;
				}
			}
			
			socket.emit('status', 0);
		});

		socket.on('close', function(data, lol) {
			console.log('CLOSING');
			//var id = w.upgradeReq.headers['sec-websocket-key'];
			//console.log('Closing :: ', id);
			console.log('closed session ws');
			//console.log('indexOf : ' + users.indexOf(user, user));
			console.log('socket to close : ' + data);
			//console.log('search : ' + search(user, socket, users));
			//console.log(users);
			console.log('AVANT DELETE');
			console.log(nicknames);

			
			// il faut a chaque fois delete avant la nouvelle connexion
			var ind = namesUsed.indexOf(nicknames[socket.id]);
			delete namesUsed[ind];
			delete clients[ind];
			delete nicknames[socket.id];
			
			//io.sockets.emit('user disconnect', ind);
			/*
			console.log('APRES DELETE');
			console.log(nicknames);
			console.log('user disconnect');
			*/
		});
	});

	app.get('*', function(req, res) {
		res.render('404', { title: 'Page Not Found' });
	});
};
