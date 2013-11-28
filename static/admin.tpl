<h1>GitHub Social Authentication</h1>
<hr />

<form>
	<div class="alert alert-warning">
		<p>
			Register a new <strong>GitHub Application</strong> via 
			<a href="https://github.com/settings/applications">Developer Applications</a> and then paste
			your application details here. Your callback URL is yourdomain.com/auth/github/callback
		</p>
		<br />
		<input type="text" data-field="social:github:id" title="Client ID" class="form-control input-lg" placeholder="Client ID"><br />
		<input type="text" data-field="social:github:secret" title="Client Secret" class="form-control" placeholder="Client Secret"><br />
	</div>
</form>

<button class="btn btn-lg btn-primary" id="save">Save</button>

<script>
	require(['forum/admin/settings'], function(Settings) {
		Settings.prepare();
	});
</script>