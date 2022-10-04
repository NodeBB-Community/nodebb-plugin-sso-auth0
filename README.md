![Auth0 Logo](./static/assets/logo.svg)

# NodeBB Auth0 SSO Plugin

_**Please note**: This plugin is unaffiliated with the Auth0 project_

This plugin allows you to use Auth0 has a login provider for NodeBB.

Install it via the admin control panel (Extend > Plugins), activate it, and rebuild/restart NodeBB.

Then navigate to `/admin/plugins/sso-auth0` and follow the instructions to set up the plugin.

# Maintenance and Sponsorship

This plugin is maintained by the NodeBB team. Please report any bugs in the repository [issue tracker](./issues).

## Role-Based Access Control

This plugin is able to sort users into specific user groups based on Auth0 user roles. You can maintain a map of role IDs to user groups, and further limit access via standard category privileges in NodeBB.

_The role-based access control functionality was sponsored by [Profit Accumulator](https://profitaccumulator.co.uk)._