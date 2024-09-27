# Swagger-merger

Swagger-merger is a set of scripts that merges and updates the swagger files
and internal dependencies of our frontend.

# How to use

This script requires to have the following command-line tools in your environment.
- git
- [github CLI](https://cli.github.com/)
- node.js
- yarn

Please install them.  Also you need to log into github CLI.

Then, check out the frontend.

```sh
% git clone https://github.com/llmariner/frontend
```

Also it requires to check out the dependency repositories. You can use `update_repos.sh`
script for that.

```sh
% mkdir apis
% ./update_repos.sh apis
```

Then, run the script.

```sh
% yarn regenerate apis frontend
```

It will scan the frontend repository, create a new branch, create a commit,
upload it to github, and then create a pull request.

# Adding an extra dependency

When a new dependency is added to frontend, that needs to be added to
`update_repos.sh` file.

# Running automatically as a github action

The plan is to run this script periodically as a github action, and so automatically
create a PR when some API changes. So far we've met the difficulties around the
access token, and so this is not yet finalized.

# HACKING

The code itself is written through [zx](https://github.com/google/zx) to coordinate
multiple command-line tools. Please refer zx documentations to understand the
code.
