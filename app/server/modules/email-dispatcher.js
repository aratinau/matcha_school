var EM = {};
module.exports = EM;

EM.server = require("emailjs/email").server.connect(
{
	host 	    : process.env.EMAIL_HOST || 'smtp-aratinau.alwaysdata.net',
	user 	    : process.env.EMAIL_USER || 'aratinau@alwaysdata.net',
	password    : process.env.EMAIL_PASS || 'passpassword',
	ssl		    : true
});

/* reset the password */

EM.dispatchResetPasswordLink = function(account, callback)
{
	EM.server.send({
		from         : process.env.EMAIL_FROM || 'aratinau@student.42.fr',
		to           : account.email,
		subject      : 'Password Reset',
		text         : 'something went wrong... :(',
		attachment   : EM.composeEmail(account)
	}, callback );
}

EM.composeEmail = function(o)
{
	var link = 'http://127.0.0.1:3000/reset-password?e='+o.email+'&p='+o.pass;
	var html = "<html><body>";
		html += "Hi "+o.firstname+",<br><br>";
		html += "Your username is <b>"+o.user+"</b><br><br>";
		html += "<a href='"+link+"'>Click here to reset your password</a><br><br>";
		html += "</body></html>";
	return  [{data:html, alternative:true}];
}

/* valid the mail */

EM.dispatchCheckMail = function(account, callback)
{
	var account = account.ops[0];
	EM.server.send({
		from         : process.env.EMAIL_FROM || 'aratinau@student.42.fr',
		to           : account.email,
		subject      : 'Valid your mail',
		text         : 'something went wrong... :(',
		attachment   : EM.composeEmailChecker(account)
	}, callback );
}

EM.composeEmailChecker = function(o)
{
	var link = 'http://127.0.0.1:3000/check-mail?e='+o.email+'&cs='+o.email_check;
	var html = "<html><body>";
		html += "Hi "+o.firstname+",<br><br>";
		html += "Your username is <b>"+o.user+"</b><br><br>";
		html += "<a href='"+link+"'>Click here to validate your mail</a><br><br>";
		html += "</body></html>";
	return  [{data:html, alternative:true}];
}

/* change and valid the new mail */

EM.dispatchCheckNewMail = function(account, callback)
{
	EM.server.send({
		from         : process.env.EMAIL_FROM || 'aratinau@student.42.fr',
		to           : account.new_email,
		subject      : 'Valid your new mail',
		text         : 'something went wrong... :(',
		attachment   : EM.composeNewEmailChecker(account)
	}, callback );
}

EM.composeNewEmailChecker = function(o)
{
	var link = 'http://127.0.0.1:3000/check-new-mail?ne='+o.new_email+'&nec='+o.new_email_check;
	var html = "<html><body>";
		html += "Hi "+o.firstname+",<br><br>";
		html += "Your username is <b>"+o.user+"</b><br><br>";
		html += "<a href='"+link+"'>Click here to validate your new mail</a><br><br>";
		html += "</body></html>";
	return  [{data:html, alternative:true}];
}
