(function(module) {
	"use strict";

	var User = module.parent.require('./user'),
		db = module.parent.require('../src/database'),
		meta = module.parent.require('./meta'),
		passport = module.parent.require('passport'),
		passportGithub = require('passport-github').Strategy,
		fs = module.parent.require('fs'),
		path = module.parent.require('path'),
		winston = module.parent.require('winston');

	var constants = Object.freeze({
		'name': "GitHub",
		'admin': {
			'icon': 'fa-github',
			'route': '/github'
		}
	});

	var GitHub = {};

	GitHub.getStrategy = function(strategies, callback) {
		if (GitHub.hasOwnProperty('id') && GitHub.hasOwnProperty('secret')) {
			passport.use(new passportGithub({
				clientID: GitHub.id,
				clientSecret: GitHub.secret,
				callbackURL: module.parent.require('nconf').get('url') + '/auth/github/callback'
			}, function(token, tokenSecret, profile, done) {
				GitHub.login(profile.id, profile.username, profile.emails[0].value, function(err, user) {
					if (err) {
						return done(err);
					}
					done(null, user);
				});
			}));

			strategies.push({
				name: 'github',
				url: '/auth/github',
				callbackURL: '/auth/github/callback',
				icon: 'fa-github',
				scope: 'user:email'
			});
		}
		
		callback(null, strategies);
	};

	GitHub.login = function(githubID, username, email, callback) {
		if (!email) {
			email = username + '@users.noreply.github.com';
		}
		
		GitHub.getUidByGitHubID(githubID, function(err, uid) {
			if (err) {
				return callback(err);
			}

			if (uid) {
				// Existing User
				callback(null, {
					uid: uid
				});
			} else {
				// New User
				var success = function(uid) {
					User.setUserField(uid, 'githubid', githubID);
					db.setObjectField('githubid:uid', githubID, uid);
					callback(null, {
						uid: uid
					});
				};

				User.getUidByEmail(email, function(err, uid) {
					if (!uid) {
						User.create({username: username, email: email}, function(err, uid) {
							if (err !== null) {
								callback(err);
							} else {
								success(uid);
							}
						});
					} else {
						success(uid); // Existing account -- merge
					}
				});
			}
		});
	};

	GitHub.getUidByGitHubID = function(githubID, callback) {
		db.getObjectField('githubid:uid', githubID, function(err, uid) {
			if (err) {
				callback(err);
			} else {
				callback(null, uid);
			}
		});
	};

	GitHub.addMenuItem = function(custom_header, callback) {
		custom_header.authentication.push({
			"route": constants.admin.route,
			"icon": constants.admin.icon,
			"name": constants.name
		});

		callback(null, custom_header);
	};

	function renderAdmin(req, res, callback) {
		res.render('sso/github/admin', {});
	}

	GitHub.init = function(data, callback) {
		data.router.get('/admin/github', data.middleware.admin.buildHeader, renderAdmin);
		data.router.get('/api/admin/github', renderAdmin);

		meta.settings.get('sso-github', function(err, config) {
			if (config.hasOwnProperty('id') && config.hasOwnProperty('secret')) {
				GitHub.id = config.id;
				GitHub.secret = config.secret;
			} else {
				winston.warn('[plugins/sso-github] Please complete GitHub SSO setup at: /admin/plugins/sso-github');
			}

			callback();
		});
	};

	module.exports = GitHub;
}(module));
