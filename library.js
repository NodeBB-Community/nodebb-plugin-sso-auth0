'use strict';

(function (module) {
	const User = require.main.require('./src/user');
	const db = require.main.require('./src/database');
	const meta = require.main.require('./src/meta');
	const groups = require.main.require('./src/groups');
	const nconf = require.main.require('nconf');
	const async = require.main.require('async');
	const passport = require.main.require('passport');
	const util = require('util');
	const Auth0Strategy = require('passport-auth0');

	const winston = module.parent.require('winston');
	const fetch = require('node-fetch');

	const constants = Object.freeze({
		name: 'Auth0',
		admin: {
			icon: 'fa-star',
			route: '/plugins/sso-auth0',
		},
	});

	const Auth0 = {
		mgmtToken: undefined,
		mgmtTokenExpiry: 0,
	};

	Auth0.getStrategy = function (strategies, callback) {
		meta.settings.get('sso-auth0', (err, settings) => {
			Auth0.settings = settings;

			if (!err && settings.id && settings.secret) {
				passport.use(new Auth0Strategy({
					domain: settings.domain,
					clientID: settings.id,
					clientSecret: settings.secret,
					callbackURL: `${nconf.get('url')}/auth/auth0/callback`,
					passReqToCallback: true,
					state: false, // this is ok because nodebb core passes state through in .authenticate()
					scope: 'openid email profile',
				}, async (req, token, unused, unused2, profile, done) => {
					if (req.hasOwnProperty('user') && req.user.hasOwnProperty('uid') && req.user.uid > 0) {
						// Save Auth0-specific information to the user
						User.setUserField(req.user.uid, 'auth0id', profile.id);
						db.setObjectField('auth0id:uid', profile.id, req.user.uid);
						Auth0.assignGroups(profile.id, req.user.uid);
						return done(null, req.user);
					}

					const email = Array.isArray(profile.emails) && profile.emails.length ? profile.emails[0].value : '';
					const loginAsync = util.promisify(Auth0.login);

					const { uid } = await loginAsync(profile.id, profile.nickname || profile.displayName, email, profile.picture);
					Auth0.assignGroups(profile.id, uid);
					done(null, { uid });
				}));

				strategies.push({
					name: 'auth0',
					url: '/auth/auth0',
					callbackURL: '/auth/auth0/callback',
					icon: constants.admin.icon,
					scope: 'openid email profile',
				});
			}

			callback(null, strategies);
		});
	};

	Auth0.appendUserHashWhitelist = function (data, callback) {
		data.whitelist.push('auth0id');
		setImmediate(callback, null, data);
	};

	Auth0.getAssociation = function (data, callback) {
		User.getUserField(data.uid, 'auth0id', (err, auth0id) => {
			if (err) {
				return callback(err, data);
			}

			if (auth0id) {
				data.associations.push({
					associated: true,
					name: constants.name,
					icon: constants.admin.icon,
					deauthUrl: `${nconf.get('url')}/deauth/auth0`,
				});
			} else {
				data.associations.push({
					associated: false,
					url: `${nconf.get('url')}/auth/auth0`,
					name: constants.name,
					icon: constants.admin.icon,
				});
			}

			callback(null, data);
		});
	};

	Auth0.login = function (auth0Id, username, email, picture, callback) {
		Auth0.getUidByAuth0ID(auth0Id, (err, uid) => {
			if (err) {
				return callback(err);
			}

			if (uid) {
				// Existing User
				callback(null, {
					uid: uid,
				});
			} else {
				// New User
				const success = function (uid) {
					// trust email returned from Auth0
					User.setUserField(uid, 'email:confirmed', 1);
					db.sortedSetRemove('users:notvalidated', uid);

					User.setUserField(uid, 'auth0id', auth0Id);

					// set profile picture
					User.setUserField(uid, 'uploadedpicture', picture);
					User.setUserField(uid, 'picture', picture);

					db.setObjectField('auth0id:uid', auth0Id, uid);
					callback(null, {
						uid: uid,
					});
				};

				User.getUidByEmail(email, (_, uid) => {
					if (!uid) {
						// Abort user creation if registration via SSO is restricted
						if (Auth0.settings.disableRegistration === 'on') {
							return callback(new Error('[[error:sso-registration-disabled, GitHub]]'));
						}

						User.create({ username: username, email: email }, (err, uid) => {
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

	Auth0.assignGroups = async (remoteId, uid) => {
		const token = await Auth0.getMgmtToken();
		const { domain, role2group } = await meta.settings.get('sso-auth0');

		if (!token || !role2group || !role2group.length) {
			return;
		}

		const url = `https://${domain}/api/v2/users/${remoteId}/roles`;
		const res = await fetch(url, {
			headers: {
				Authorization: `bearer ${token}`,
			},
		});
		const body = await res.json();
		const roles = body.map(obj => obj.id);
		winston.verbose(`[plugins/sso-auth0] Found ${roles.length} for ${remoteId}`);

		const { toJoin, toLeave } = role2group.reduce((memo, { roleId, groupName }) => {
			if (roles.includes(roleId)) {
				memo.toJoin.push(groupName);
			} else {
				memo.toLeave.push(groupName);
			}

			return memo;
		}, { toJoin: [], toLeave: [] });
		if (toLeave.length) {
			winston.verbose(`[plugins/sso-auth0] uid ${uid} now leaving ${toLeave.length} user groups.`);
		}
		await groups.leave(toLeave, uid);
		await groups.join(toJoin, uid);
		winston.verbose(`[plugins/sso-auth0] uid now ${uid} a part of ${toJoin.length} user groups.`);
	};

	Auth0.getMgmtToken = async () => {
		if (Auth0.mgmtToken && Auth0.mgmtTokenExpiry > Date.now()) {
			return Auth0.mgmtToken;
		}

		const { domain, mgmtId, mgmtSecret } = await meta.settings.get('sso-auth0');
		if (!mgmtId || !mgmtSecret) {
			return false;
		}

		const res = await fetch(`https://${domain}/oauth/token`, {
			method: 'post',
			body: JSON.stringify({
				grant_type: 'client_credentials',
				client_id: mgmtId,
				client_secret: mgmtSecret,
				audience: `https://${domain}/api/v2/`,
			}),
			headers: { 'Content-Type': 'application/json' },
		});

		if (!res.ok) {
			const { error } = await res.json();
			winston.warn(`[plugins/sso-auth0] Unable to retrieve management token — ${error}`);
			return false;
		}

		const { access_token, expires_in } = await res.json();
		winston.verbose('[plugins/sso-auth0] Retrieved new management bearer token');
		Auth0.mgmtToken = access_token;
		Auth0.mgmtTokenExpiry = Date.now() + (expires_in * 1000);
		return access_token;
	};

	Auth0.getUidByAuth0ID = function (auth0Id, callback) {
		db.getObjectField('auth0id:uid', auth0Id, (err, uid) => {
			if (err) {
				callback(err);
			} else {
				callback(null, uid);
			}
		});
	};

	Auth0.addMenuItem = function (custom_header, callback) {
		custom_header.authentication.push({
			route: constants.admin.route,
			icon: constants.admin.icon,
			name: constants.name,
		});

		callback(null, custom_header);
	};

	Auth0.init = function (data, callback) {
		const hostHelpers = require.main.require('./src/routes/helpers');

		async function renderAdmin(req, res) {
			let groupNames = await db.getSortedSetRange('groups:createtime', 0, -1);
			groupNames = groupNames.filter(name => (
				name !== 'registered-users' &&
				name !== 'verified-users' &&
				name !== 'unverified-users' &&
				name !== groups.BANNED_USERS &&
				!groups.isPrivilegeGroup(name)
			));

			res.render('admin/plugins/sso-auth0', {
				callbackURL: `${nconf.get('url')}/auth/auth0/callback`,
				groupNames,
			});
		}

		data.router.get('/admin/plugins/sso-auth0', data.middleware.admin.buildHeader, renderAdmin);
		data.router.get('/api/admin/plugins/sso-auth0', renderAdmin);

		hostHelpers.setupPageRoute(data.router, '/deauth/auth0', data.middleware, [data.middleware.requireUser], (req, res) => {
			res.render('plugins/sso-auth0/deauth', {
				service: 'Auth0',
			});
		});
		data.router.post('/deauth/auth0', [data.middleware.requireUser, data.middleware.applyCSRF], (req, res, next) => {
			Auth0.deleteUserData({
				uid: req.user.uid,
			}, (err) => {
				if (err) {
					return next(err);
				}

				res.redirect(`${nconf.get('relative_path')}/me/edit`);
			});
		});

		callback();
	};

	Auth0.deleteUserData = function (data, callback) {
		const { uid } = data;

		async.waterfall([
			async.apply(User.getUserField, uid, 'auth0id'),
			function (oAuthIdToDelete, next) {
				db.deleteObjectField('auth0id:uid', oAuthIdToDelete, next);
			},
			async.apply(db.deleteObjectField, `user:${uid}`, 'auth0id'),
		], (err) => {
			if (err) {
				winston.error(`[sso-auth0] Could not remove OAuthId data for uid ${uid}. Error: ${err}`);
				return callback(err);
			}
			callback(null, uid);
		});
	};

	module.exports = Auth0;
}(module));
