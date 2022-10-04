<div class="co-12 col-sm-8 offset-sm-2 col-md-6 offset-md-3">
	<div class="card">
		<div class="card-header">
			<span class="fs-3">[[user:sso.dissociate-confirm-title]]</span>
		</div>
		<div class="card-body">
			[[user:sso.dissociate-confirm, {service}]]

			<hr>

			<form method="post">
				<input type="hidden" name="_csrf" value="{config.csrf_token}" />
				<button class="btn btn-danger">[[user:sso.dissociate]]</button>
			</form>
		</div>
	</div>
</div>