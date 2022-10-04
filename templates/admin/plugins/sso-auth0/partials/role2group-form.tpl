<form>
	<div class="mb-3">
		<label for="roleId">Role ID</label>
		<input type="text" id="roleId" name="roleId" class="form-control" />
		<p class="form-text">
			You can find this value by going into the role settings itself. It is shown under the role name.
		</p>
	</div>
	<div class="mb-3">
		<label for="groupName">Group Name</label>
		<select id="groupName" name="groupName" class="form-control">
			{{{ each groupNames }}}
			<option value="{@value}">{@value}</option>
			{{{ end }}}
		</select>
	</div>
</form>