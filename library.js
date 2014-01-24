(function(module) {
	"use strict";

	var User = module.parent.require('./user'),
		db = module.parent.require('../src/database'),
		passport = module.parent.require('passport'),
  		passportGithub = require('passport-github').Strategy,
  		fs = module.parent.require('fs'),
  		path = module.parent.require('path');

	var constants = Object.freeze({
		'name': "GitHub",
		'admin': {
			'route': '/github',
			'icon': 'fa-github'
		}
	});

	var GitHub = {};

	GitHub.getStrategy = function(strategies) {
		if (meta.config['social:github:id'] && meta.config['social:github:secret']) {
			passport.use(new passportGithub({
				clientID: meta.config['social:github:id'],
				clientSecret: meta.config['social:github:secret'],
				callbackURL: module.parent.require('nconf').get('url') + 'auth/github/callback'
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
				icon: 'github',
				scope: 'user:email'
			});
		}

		return strategies;
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
				}

				User.getUidByEmail(email, function(err, uid) {
					if (!uid) {
						User.create(username, undefined, email, function(err, uid) {
							if (err !== null) {
								callback(err);
							} else success(uid);
						});
					} else success(uid); // Existing account -- merge
				});
			}
		});
	}

	GitHub.getUidByGitHubID = function(githubID, callback) {
		db.getObjectField('githubid:uid', githubID, function(err, uid) {
			if (err) {
				callback(err);
			} else {
				callback(null, uid);
			}
		});
	};

	GitHub.addMenuItem = function(custom_header) {
		custom_header.authentication.push({
			"route": constants.admin.route,
			"icon": constants.admin.icon,
			"name": constants.name
		});

		return custom_header;
	}

	GitHub.addAdminRoute = function(custom_routes, callback) {
		fs.readFile(path.resolve(__dirname, './static/admin.tpl'), function (err, template) {
			custom_routes.routes.push({
				"route": constants.admin.route,
				"method": "get",
				"options": function(req, res, callback) {
					callback({
						req: req,
						res: res,
						route: constants.admin.route,
						name: constants.name,
						content: template
					});
				}
			});

			callback(null, custom_routes);
		});
	};

	module.exports = GitHub;
}(module));