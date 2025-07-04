'use strict';

(function (module) {
	const User = require.main.require('./src/user');
	const db = require.main.require('./src/database');
	const meta = require.main.require('./src/meta');
	const groups = require.main.require('./src/groups');
	const nconf = require.main.require('nconf');
	const async = require.main.require('async');
	const passport = require.main.require('passport');
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

	const svgIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="17.82" viewBox="0 0 256 285"><path d="M220.412 0h-92.415l28.562 89.006h92.416l-74.77 53.077l28.57 89.511c48.128-35.06 63.854-88.12 46.208-142.588L220.413 0ZM7.018 89.006h92.416L127.997 0H35.589L7.019 89.006c-17.655 54.468-1.92 107.529 46.207 142.588l28.563-89.51l-74.77-53.078Zm46.208 142.588l74.77 52.97l74.77-52.97l-74.77-53.847l-74.77 53.847Z" fill="#eb5424"/></svg>';

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
					scope: 'openid email profile',
				}, async (req, token, unused, unused2, profile, done) => {
					if (req.hasOwnProperty('user') && req.user.hasOwnProperty('uid') && req.user.uid > 0) {
						// Save Auth0-specific information to the user
						await Promise.all([
							User.setUserField(req.user.uid, 'auth0id', profile.id),
							db.setObjectField('auth0id:uid', profile.id, req.user.uid),
							Auth0.assignGroups(profile.id, req.user.uid),
						]);

						return done(null, req.user);
					}

					const email = Array.isArray(profile.emails) && profile.emails.length ? profile.emails[0].value : '';
					const { uid } = await Auth0.login(
						profile.id, profile.nickname || profile.displayName, email, profile.picture
					);
					Auth0.assignGroups(profile.id, uid);
					done(null, { uid });
				}));

				strategies.push({
					name: 'auth0',
					url: '/auth/auth0',
					callbackURL: '/auth/auth0/callback',
					icon: constants.admin.icon,
					icons: {
						svg: svgIcon,
					},
					labels: {
						login: 'Sign in with auth0',
						register: 'Sign up with auth0',
					},
					color: '#eb5424',
					scope: 'openid email profile',
					checkState: false, // defer to state checking used by passport-auth0
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

	Auth0.login = async (auth0id, username, email, picture) => {
		let uid = await Auth0.getUidByAuth0ID(auth0id);
		if (uid) {
			// Existing User
			return { uid };
		}

		if (email) {
			uid = await User.getUidByEmail(email);
		}

		if (!uid) {
			// Abort user creation if registration via SSO is restricted
			if (Auth0.settings.disableRegistration === 'on') {
				throw new Error('[[error:sso-registration-disabled, Auth0]]');
			}

			uid = await User.create({ username: username });
		}

		// New or existing account
		if (email) {
			await User.setUserField(uid, 'email', email);
			await User.email.confirmByUid(uid);
		}

		await Promise.all([
			User.setUserFields(uid, {
				auth0id,
				picture,
				uploadedpicture: picture,
			}),
			db.setObjectField('auth0id:uid', auth0id, uid),
		]);

		return { uid };
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

		if (!res.ok) {
			const { message } = await res.json();
			winston.warn('[plugins/sso-auth0] Unable to retrieve user roles; error follows.');
			winston.error(`[plugins/sso-auth0] ${message}`);
			return;
		}

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

	Auth0.getUidByAuth0ID = async auth0Id => db.getObjectField('auth0id:uid', auth0Id);

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
				title: 'SSO Auth0',
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
