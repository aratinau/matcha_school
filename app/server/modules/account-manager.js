var crypto 		= require('crypto');
var MongoDB 	= require('mongodb').Db;
var Server 		= require('mongodb').Server;
var moment 		= require('moment');
var Entities = require('html-entities').XmlEntities;
var EM = require('./email-dispatcher');
entities = new Entities();

/*
	ESTABLISH DATABASE CONNECTION
*/

var dbName = process.env.DB_NAME || 'good-start';
var dbHost = process.env.DB_HOST || 'localhost'
var dbPort = process.env.DB_PORT || 27017;

var db = new MongoDB(dbName, new Server(dbHost, dbPort, {auto_reconnect: true}), {w: 1});
db.open(function(e, d){
	if (e) {
		console.log(e);
	} else {
		if (process.env.NODE_ENV == 'live') {
			db.authenticate(process.env.DB_USER, process.env.DB_PASS, function(e, res) {
				if (e) {
					console.log('mongo :: error: not authenticated', e);
				}
				else {
					console.log('mongo :: authenticated and connected to database :: "'+dbName+'"');
				}
			});
		}	else{
			console.log('mongo :: connected to database :: "'+dbName+'"');
		}
	}
});

var accounts = db.collection('accounts');
var tags = db.collection('tags');
var status = db.collection('status');
var notifications = db.collection('notifications');
var chat = db.collection('chat');

exports.login = function(email, pass, callback)
{
	accounts.findOne({email:email}, function (e, o) {
		if (o == null) {
			callback('email-not-found');
		} else {
			validatePassword(pass, o.pass, function(err, res) {
				if (res) {
					callback(null, o);
				} else {
					callback('invalid-password');
				}
			});
		}
	});
}

exports.loginViaCookie = function(user, pass, callback) // le pass est hashed
{
	console.log('exports loginViaCookie');
	accounts.findOne( {user:user}, function(e, o) {
		if (o) {
			o.pass == pass ? callback(o) : callback(null);
		} else {
			callback(null);
		}
	});
}

exports.register = function(newData, callback)
{
	// verif si l'user n'est pas pris
	accounts.findOne({user: newData.user}, function(e, o) {
		if (o) {
			callback('username-taken');
		} else {
			accounts.findOne({email: newData.email}, function(e, o) {
				if (o) {
					callback('email-taken');
				} else {
					//hash et enregistrement du mot de passe
					saltAndHash(newData.pass, function (hash) {
						newData.files = new Array();
						newData.tags = new Array();
						newData.pass = hash;
						newData.bio = '';
						newData.avatar = '';
						newData.interested_by_men = 'on';
						newData.interested_by_women = 'on';
						newData.sex = '';
						newData.dateOfBirth = "1980-01-01";
						newData.date = moment().format('MMMM Do YYYY, h:mm:ss a');
						newData.popularite = 0;
						newData.usersLiked = [];
						newData.usersWhoLikeMe = [];
						newData.usersMessagesUnread = [];
						newData.count_notif = 0;
						newData.msgNotif = '';
						newData.usersVisitedMe = [];
						newData.usersHistory = [];
						newData.connectedTo = [];
						accounts.insert(newData, {safe: true}, callback);
					});
				}
			});
		}
	});
}

exports.getAllUsers = function(callback)
{
	accounts.find().toArray(
		function(e, res) {
			if (e)
				callback(e)
			else
				callback(null, res)
		}
	);
}

exports.getAllUsersWithOptions = function(find, options, callback)
{
	accounts.find(find, options).toArray(
		function(e, res) {
			if (e)
				callback(e)
			else
				callback(null, res)
		}
	);
}

var generateSalt = function()
{
	var set = '0123456789abcdefghijklmnopqurstuvwxyzABCDEFGHIJKLMNOPQURSTUVWXYZ';
	var salt = '';
	for (var i = 0; i < 10; i++) {
		var p = Math.floor(Math.random() * set.length);
		salt += set[p];
	}
	return salt;
}

var md5 = function(str) {
	return crypto.createHash('md5').update(str).digest('hex');
}

var saltAndHash = function(pass, callback)
{
	var salt = generateSalt();
	callback(salt + md5(pass + salt));
}

var validatePassword = function(plainPass, hashedPass, callback)
{
	var salt = hashedPass.substr(0, 10);
	var validHash = salt + md5(plainPass + salt);
	callback(null, hashedPass === validHash);
}

exports.getAccountByEmail = function(email, callback)
{
	accounts.findOne({email:email}, function(e, o){ callback(o); });
}

exports.validateResetLink = function(email, passHash, callback)
{
	accounts.find({ $and: [{email:email, pass:passHash}] }, function(e, o){
		callback(o ? 'ok' : null);
	});
}

exports.updatePassword = function(email, newPass, callback)
{
	accounts.findOne({email:email}, function(e, o){
		if (e){
			callback(e, null);
		}	else{
			saltAndHash(newPass, function(hash){
		        o.pass = hash;
		        accounts.save(o, {safe: true}, callback);
			});
		}
	});
}

exports.validateMail = function(email, email_check, callback)
{
	accounts.findOne( {email:email}, function(e, o) {
		if (e){
			callback(e, null);
		}	else {
			if (o.email_check == email_check) {
				o.email_check = 0;
				accounts.save(o, {safe: true}, function(e) {
					if (e) callback(e);
					else callback(null, o);
				});
			}
			callback(e, null);
		}
	});
}

exports.updateAccount = function(newData, callback)
{
	accounts.findOne({_id:getObjectId(newData.id)}, function(e, o) {
		if (e) {
			callback(e, null);
		}	else {
			o.firstname = entities.encode(newData.firstname);
			o.lastname = entities.encode(newData.lastname);
			o.user = entities.encode(newData.user);
			o.bio = entities.encode(newData.bio);
			o.tags = newData.tags;
			o.sex = newData.sex;
			o.dateOfBirth = newData.dateOfBirth;
			o.interested_by_men = newData.interested_by_men;
			o.interested_by_women = newData.interested_by_women;
			accounts.save(o, {safe: true}, function(e) {
				if (e)
				{
					callback(e);
				}
				else {
					callback(null, o);
				}
			});
		}
	});
}

exports.updateMail = function(email, new_email_check, newMail, callback)
{
	accounts.findOne({email:email}, function(e, o){
		if (e) {
			callback(e, null);
		}	else {
			o.new_email = entities.encode(newMail);
			o.new_email_check = new_email_check;
			EM.dispatchCheckNewMail(o, function (e, m) {});
			accounts.save(o, {safe: true}, callback);
		}
	});
}

exports.recordTheNewMail = function(new_email_check, new_email, callback)
{
	accounts.findOne({new_email:new_email}, function(e, o) {
		if (e) {
			callback(e, null);
		}	else {
			if (o.new_email_check == new_email_check)
			{
				console.log('fosifosufsfds');
				o.email = o.new_email;
				o.new_email = undefined;
				o.new_email_check = undefined;
				accounts.save(o, {safe: true}, function(e) {
					if (e) callback(e);
					else callback(null, o);
				});
			}
		}
	});
}

exports.updatePasswordFromSettingsPage = function(email, oldPassword, newPass, callback)
{
	accounts.findOne({email:email}, function (e, o) {
		validatePassword(oldPassword, o.pass, function(err, res) {
			if (res) {
				saltAndHash(newPass, function(hash) {
					o.pass = hash;
					accounts.save(o, {safe: true}, callback);
				});
			} else {
				callback('invalid-password');
			}
		});
	});
}

exports.managePhotos = function(email, file, callback)
{
	accounts.findOne({email:email}, function (e, o) {
		accounts.update(o, { $addToSet: { files: { $each: [ file ] } } }, function(err) {});
	});
}

exports.isAllowedTodeletePhoto = function(email, photo, callback)
{
	var obj = {};
	obj.is_user_owner = 0;
	accounts.findOne({email: email}, function(e, o) {
			if (e)
				callback(e)
			else
			{
				for (var i = 0; i < o.files.length; i++) {
					if (o.files[i].path == photo)
						obj.is_user_owner = i;
				}
				callback(null, obj)
			}
	});
}

exports.deletePhoto = function(email, index, callback)
{
	accounts.findOne({email: email}, function(e, o) {
		if (e)
			callback(e)
		else
		{
			o.files.splice(index, 1);
			accounts.save(o, {safe: true}, callback);
			callback(null, o)
		}
	});
}

exports.getDataUser = function(email, callback)
{
	accounts.findOne({email: email}, function(e, o) {
		if (e)
			callback(e)
		else
			callback(null, o)
	});
}

exports.findOneUserById = function(id, callback)
{
	accounts.findOne({_id:getObjectId(id)}, function(e, o) {
		if (e)
			callback(e)
		else
			callback(null, o)
	});
}

var getObjectId = function(id)
{
	return new require('mongodb').ObjectID(id);
}

exports.getAllTags = function(callback)
{
	tags.find().toArray(
		function(e, res) {
			if (e)
				callback(e)
			else
				callback(null, res)
	});
}

exports.addNewTag = function(newData, callback)
{
	// verif si le tag n'est pas deja enregistre
	tags.findOne({name: newData.name}, function(e, o) {
		if (o) {
			//callback('already taken');
		} else {
			tags.insert(newData, {safe: true}, callback);
		}
	});
}

exports.setAvatar = function(email, avatar, callback)
{
	accounts.findOne({email:email}, function(e, o) {
		if (e){
			callback(e, null);
		}	else{
			o.avatar = 'uploads/' + avatar;
			accounts.save(o, {safe: true}, callback);
		}
	});
}

exports.updatePosition = function(email, latitude, longitude, callback)
{
	accounts.findOne({email:email}, function(e, o) {
		if (e){
			callback(e, null);
		}	else{
			o.latitude = entities.encode(latitude);
			o.longitude = entities.encode(longitude);
			accounts.save(o, {safe: true}, callback);
		}
	});
}

exports.newVisit = function(email, userIdVisited, callback)
{
	// retourner si deja visiter ou non
	accounts.findOne({email:email}, function(e, o) {
		if (e) {
			callback(e, null);
		}	else {
			if (o.usersVisited == null) {
				o.usersVisited = [];
				o.usersVisited.push(userIdVisited);
			}
			else {
				o.usersVisited.push(userIdVisited);
			}
			this.addPointPopularite(userIdVisited, function (e, p) {
				accounts.save(o, { save: true }, function(e) {
					if (e) {
						callback(e);
					}
					else {
						callback(null, o);
					}
				});
			});
		}
	});
}

exports.newLike = function(email, userIdLiked, callback)
{
	accounts.findOne({email:email}, function(e, o) {
		if (e) {
			callback(e, null);
		}	else {
			if (o.usersLiked.indexOf(userIdLiked) === -1) {
				o.usersLiked.push(userIdLiked);
				accounts.save(o, { save: true }, function(e) {
					if (e) {
						callback(e);
					}
					else {
						callback(null, o);
					}
				});
			}
		}
		callback(null, o);
	});
}

exports.newUserWhoLikeMe = function(idUserWhoLikeMe, user, callback)
{
	accounts.findOne({_id:getObjectId(user)}, function(e, o) {
		if (e) {
			callback(e, null);
		} else {
			if (o.usersWhoLikeMe.indexOf(idUserWhoLikeMe) === -1) {
				o.usersWhoLikeMe.push(idUserWhoLikeMe);
			}
			accounts.save(o, { save: true }, function(e) {
				if (e) {
					callback(e);
				} else {
					callback(null, o);
				}
			});
		}
	});
}

exports.isLiked = function(id, idUserLikeMe, callback)
{
	accounts.findOne({_id:getObjectId(id)}, function(e, o) {
		if (e) {
			callback(e, null);
		}	else {
			if (o.usersLiked.indexOf(idUserLikeMe) === -1) {
				callback(null, 'not liked');
			} else {
				callback(null, 'liked');
			}
		}
	});
}

exports.deLiked = function(id, userDeLiked, callback)
{
	accounts.findOne({_id:getObjectId(id)}, function(e, o) {
		if (e) {
			callback(e, null);
		}	else {
			o.usersLiked.splice(o.usersLiked.indexOf(userDeLiked), 1);
			o.connectedTo.splice(o.connectedTo.indexOf(userDeLiked), 1);
			accounts.save(o, { save: true }, function(e) {
				if (e) {
					callback(e);
				}
				else {
					// on supprime le connectedTo de l'autre user
					accounts.findOne({_id:getObjectId(userDeLiked)}, function(e, o) {
						if (e) {
							callback(e, null);
						}	else {
							o.usersWhoLikeMe.splice(o.usersWhoLikeMe.indexOf(id), 1);
							o.connectedTo.splice(o.connectedTo.indexOf(id), 1);
							accounts.save(o, { save: true }, function(e) {
								if (e) {
									callback(e);
								}
								else {
									callback(null, o);
								}
							});
						}
					});
				}
			});
		}
	});
}

exports.newUsersConnected = function(id, userConnected, callback)
{
	accounts.findOne({_id:getObjectId(id)}, function(e, o) {
		if (e) {
			callback(e, null);
		}	else {
			if (o.connectedTo.indexOf(userConnected) === -1) {
				o.connectedTo.push(userConnected);
			}
			accounts.save(o, { save: true }, function(e) {
				if (e) {
					callback(e);
				}
				else {
					callback(null, o);
				}
			});
		}
	});
}

exports.updateStatus = function(pseudo,  callback)
{
	status.count({pseudo:pseudo}, function(e, o) {
		if (o == 1) {
			status.findOne({pseudo:pseudo}, function(e, o) {
			if (e) {
				callback(e, null);
			}	else {
				o.date = moment();
				status.save(o, {safe: true}, callback);
			}
			});
		} else {
			var newData = {};
			newData.pseudo = pseudo;
			newData.date = moment();
			status.insert(newData, {safe: true}, callback);
		}
	});
}

exports.getStatus = function(pseudo,  callback)
{
	status.findOne({pseudo:pseudo}, function (e, res) {
		if (e)
			callback(e)
		else
			callback(null, res)
	});
}

exports.newNotification = function(id, callback)
{
	accounts.findOne({_id:getObjectId(id)}, function(e, o) {
		if (e) {
			callback(e, null);
		}	else {
			if (o.count_notif == undefined)
				o.count_notif = 1;
			else
				o.count_notif++;
			accounts.save(o, {safe: true}, callback);
		}
	});
}

exports.resetNotifications = function(id, callback)
{
	accounts.findOne({_id:getObjectId(id)}, function(e, o) {
		if (e) {
			callback(e, null);
		}	else {
			if (o.count_notif == undefined)
				o.count_notif = 0;
			else
				o.count_notif = 0;
			accounts.save(o, {safe: true}, callback);
		}
	});
}

exports.newMessageChat = function(user, to, message, callback)
{
	var newMessage = {};
	newMessage.from = user;
	newMessage.to = to;
	newMessage.message = message;
	newMessage.date = moment().format('MMMM Do YYYY, h:mm:ss a');
	chat.save(newMessage, {safe: true}, callback);
}

exports.getMessageChat = function(from, to,  callback)
{
	chat.find({ $and : [{ $or : [{ from:from } , { to:from }] }, { $or : [{ from:to } , { to:to }] }]} ).toArray(
		function(e, res) {
			if (e)
				callback(e)
			else
				callback(null, res)
	});
}

exports.addUsersMessagesUnread = function(user, from, callback)
{
	accounts.findOne({user:user}, function(e, o) {
		if (e) {
			callback(e, null);
		}	else {
			var isit = 0;
			for (var i = 0; i < o.usersMessagesUnread.length; i++) {
				if (o.usersMessagesUnread[i].user == from)
				{
					isit = 1;
				}
			}

			if (isit == 0) {
				var newAdd = {};
				accounts.findOne({user:from}, function(e, from) {
					newAdd.id = from._id;
					newAdd.user = from.user;
					o.usersMessagesUnread.push(newAdd);
					accounts.save(o, { save: true }, function(e) {
						if (e) {
							callback(e);
						}
						else {
							callback(null, o);
						}
					});
				});
			}
		}
	});
}

exports.resetUsersMessagesUnread = function(user, userMessageToRead, callback)
{
	accounts.findOne({user:user}, function(e, o) {
		if (e) {
			callback(e, null);
		}	else {
			for (var i = 0; i < o.usersMessagesUnread.length; i++) {
				if (o.usersMessagesUnread[i].user == userMessageToRead)
					o.usersMessagesUnread.splice(i, 1);
			}
			accounts.save(o, { save: true }, function(e) {
				if (e) {
					callback(e);
				}
				else {
					callback(null, o);
				}
			});
		}
	});
}

exports.newVisit = function(userToNotif, userIdVisited, callback)
{
	accounts.findOne({ _id:getObjectId(userToNotif) }, function(e, o) {
		if (e) {
			callback(e, null);
		}	else {
			var isit = 0;
			for (var i = 0; i < o.usersVisitedMe.length; i++) {
				if (o.usersVisitedMe[i].id == userIdVisited)
				{
					isit = 1;
				}
			}
			
			if (isit == 0) {
				var newAdd = {};
				accounts.findOne({ _id:getObjectId(userIdVisited) }, function(e, from) {
					newAdd.id = from._id;
					newAdd.user = from.user;
					o.usersVisitedMe.push(newAdd);
					accounts.save(o, { save: true }, function(e) {
						if (e) {
							callback(e);
						} else {
							callback(null, o, 0);
						}
					});
				});
			}
			callback(null, o, 1);
		}
	});
}

exports.newHistory = function(userToNotif, userIdVisited, callback)
{
	accounts.findOne({ _id:getObjectId(userToNotif) }, function(e, o) {
		if (e) {
			callback(e, null);
		}	else {
			var isit = 0;
			for (var i = 0; i < o.usersHistory.length; i++) {
				if (o.usersHistory[i].id == userIdVisited)
				{
					isit = 1;
				}
			}
			if (isit == 0) {
					var newAdd = {};
					accounts.findOne({ _id:getObjectId(userIdVisited) }, function(e, from) {
						newAdd.id = from._id;
						newAdd.user = from.user;
						o.usersHistory.push(newAdd);
						accounts.save(o, { save: true }, function(e) {
							if (e) {
								callback(e);
							} else {
								callback(null, o);
							}
						});
					});
			}
			callback(null, o);
		}
	});
}

exports.addPointPopularite = function(userIdLiked, callback)
{
	//console.log('ADD POINT POPULARITE');
	accounts.findOne({ _id:getObjectId(userIdLiked) }, function(e, o) {
		if (e) {
			callback(e, null);
		}	else {
			o.popularite = o.popularite + 10;
			accounts.save(o, { save: true }, function(e) {
				if (e) {
					callback(e);
				}
				else {
					callback(null, o);
				}
			});
		}
	});
}
