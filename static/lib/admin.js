'use strict';

define('admin/plugins/sso-auth0', ['settings', 'hooks', 'alerts'], function (Settings, hooks, alerts) {
	var ACP = {};

	ACP.init = function () {
		Settings.load('sso-auth0', $('.sso-auth0-settings'));

		$('#save').on('click', function () {
			Settings.save('sso-auth0', $('.sso-auth0-settings'), function () {
				alerts.alert({
					type: 'success',
					alert_id: 'sso-auth0-saved',
					title: 'Settings Saved',
					message: 'Please reload your NodeBB to apply these settings',
					clickfn: function () {
						socket.emit('admin.reload');
					},
				});
			});
		});

		hooks.onPage('filter:settings.sorted-list.load', (data) => {
			data.formValues = {
				groupNames: ajaxify.data.groupNames,
			};

			return data;
		});
	};

	return ACP;
});
