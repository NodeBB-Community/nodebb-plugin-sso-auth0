<form class="sso-auth0-settings">
	<div class="row">
		<div class="col-sm-2 col-12 settings-header">Auth0 SSO</div>
		<div class="col-sm-10 col-12">
			<p class="lead">Getting Started...</p>
			<p>
				Register a new <strong>Application</strong> via your
				<a href="https://manage.auth0.com/dashboard">Auth0 Dashboard</a> and then paste
				your application details here.
			</p>
			<p>
				When requested, please select "Single Page Web Applications" as the application type.
			</p>
			<p>
				Then, go to the "Settings" tab and populate the fields below with the values given.
			</p>

			<hr />

			<div class="mb-3">
				<label for="domain">Domain</label>
				<input type="text" name="domain" title="Client Domain" class="form-control" placeholder="Client Domain">
			</div>
			<div class="mb-3">
				<label for="id">Client ID</label>
				<input type="text" name="id" title="Client ID" class="form-control" placeholder="Client ID">
			</div>
			<div class="mb-3">
				<label for="secret">Client Secret</label>
				<input type="text" name="secret" title="Client Secret" class="form-control" placeholder="Client Secret" />
			</div>
			<div class="mb-3 alert alert-warning">
				<label for="callback">Your NodeBB&apos;s "Authorization callback URL"</label>
				<input type="text" id="callback" title="Authorization callback URL" class="form-control" value="{callbackURL}" readonly />
				<p class="form-text">
					Ensure that this value is set in your Auth0 application&apos;s settings
				</p>
			</div>
			<div class="form-check">
				<input type="checkbox" class="form-check-input" id="disableRegistration" name="disableRegistration" />
				<label for="disableRegistration" class="form-check-label">
					Disable user registration via SSO
				</label>
			</div>
			<p class="form-text">
				Restricting registration means that only registered users can associate their account with this SSO strategy.
				This restriction is useful if you have users bypassing registration controls by using social media accounts, or
				if you wish to use the NodeBB registration queue.
			</p>
		</div>
	</div>

	<div class="row">
		<div class="col-sm-2 col-12 settings-header">User Roles</div>
		<div class="col-sm-10 col-12">
			<p class="lead">
				Optionally — Allow NodeBB to automatically assign users to specific user groups based on their Auth0 roles.
			</p>
			<p>
				You will need to create another application — this time a "Machine to Machine Application" — in order for this plugin to read the roles for a user.
				Then:
				<ol>
					<li>Tie this application to the "Auth0 Management API"</li>
					<li>Ensure that the app has access to the <code>read:users</code> and <code>read:roles</code> permissions.</li>
					<li>Paste the values from the "Settings" tab into the fields below.</li>
				</ol>
			</p>

			<hr />

			<div class="mb-3">
				<label for="mgmtId">Client ID</label>
				<input type="text" id="mgmtId" name="mgmtId" title="Client ID" class="form-control" placeholder="Client ID">
			</div>
			<div class="mb-3">
				<label for="mgmtSecret">Client Secret</label>
				<input type="text" id="mgmtSecret" name="mgmtSecret" title="Client Secret" class="form-control" placeholder="Client Secret" />
			</div>

			<div class="mb-3" data-type="sorted-list" data-sorted-list="role2group" data-item-template="admin/plugins/sso-auth0/partials/role2group-item" data-form-template="admin/plugins/sso-auth0/partials/role2group-form">
				<ul data-type="list" class="list-group"></ul>
				<button type="button" data-type="add" class="btn btn-info mt-1">Add Role-to-Group Association</button>
			</div>
		</div>
	</div>
</form>

<button id="save" class="floating-button mdl-button mdl-js-button mdl-button--fab mdl-js-ripple-effect mdl-button--colored">
	<i class="material-icons">save</i>
</button>