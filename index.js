import 'zx/globals';
import fsp from 'fs/promises';
import fs from 'fs'
import path from 'path';
import semver from 'semver';
import { merge } from './merger.js';

$.verbose = false;

const reviewers = [
  'takeshi-cloudnatix',
];

// In the actions runner, the access token should be stored
// /action-runner/github-pat/github-pat file. Passing it to
// GH_TOKEN should allow github CLI to use that variable.
// See also: https://cli.github.com/manual/gh_help_environment
const githubPatFile = '/action-runner/github-pat/github-pat';
if (await fsp.access(githubPatFile, fs.constants.R_OK).then(() => true).catch(() => false)) {
  process.env.GH_TOKEN = await fsp.readFile(githubPatFile)
    .then((buf) => buf.toString().trim());
}

const ensureConfigValue = async (configName, defaultValue) => {
  // git config may fail (exit with non-zero return code) if the
  // specified config is not set, and zx turns that to a rejected
  // promise, which is an exception in an async function. Simply
  // enclosed by a try{} clause is just okay to capture such a
  // case.
  try {
    const result = await $`git config ${configName}`;
    if (result.stdout.toString().trim().length > 0) {
      // git config has a value, so return without setting
      // any values.
      return;
    }
  } catch (e) {
    // git config has no such value. Fall through to the
    // next line.
  }
  await $`git config ${configName} ${defaultValue}`;
}

const [srcDir, frontendDir] = process.argv.slice(2);
const currentDir = process.cwd();

let branchName = process.argv[4];
let sweepOldBranches = false;
if (branchName === undefined) {
  const now = new Date();
  // Get YYYY-MM-DD format through ISO-format string.
  let date = now.toISOString();
  date = date.slice(0, date.indexOf('T'));
  branchName = `swagger-merger/${date}`;
  sweepOldBranches = true;
}

const parseVersion = (spec) => {
  const m = /\#(.*)/.exec(spec);
  return m ? m[1] : null;
};

const extractDependencies = (deps) =>
  Object.keys(deps).filter((name) =>
    name.indexOf('@llmariner-types/') == 0
  ).map((name) => {
    return {
      name: name.slice('@llmariner-types/'.length),
      value: deps[name],
      currentVersion: parseVersion(deps[name]),
    };
  });

const getLatest = (tags) => {
  const parsedTags = tags.filter(t => t.length > 0).map((t) => semver.parse(t));
  return parsedTags.slice(1).reduce((t1, t2) => semver.gt(t1, t2) ? t1 : t2, parsedTags[0]).raw;
};

// In the actions runner, the user email/name should be set in order
// to make commits. The config should be local to the frontend repository
// and not global, in order to avoid polluting other workflows.
cd(frontendDir)
await ensureConfigValue('user.email', 'cloudnatix-ci-robot@cloudnatix.com')
await ensureConfigValue('user.name', 'cloudnatix CI robot')
cd(currentDir)

const frontendPkg = await fsp.readFile(path.join(frontendDir, 'package.json'))
    .then(JSON.parse);
const cnatixDeps = extractDependencies(frontendPkg.dependencies);
cnatixDeps.push(...extractDependencies(frontendPkg.devDependencies));

if (cnatixDeps.length == 0) {
  console.log('no dependencies on @llmariner-types');
  process.exit(0);
}

for (let dep of cnatixDeps) {
  console.log(`checking ${dep.name}`);
  cd(path.join(srcDir, dep.name));
  if (dep.currentVersion == null) {
    // If the version is not specified in the package.json of frontend,
    // set dep.hasUpdate to true so that it will update package.json
    // to specify the latest version.
    dep.hasUpdate = true;
  } else {
    const diff = await $`git diff ${dep.currentVersion} -- api`;
    dep.hasUpdate = diff.stdout.length > 0;
  }
  dep.latest = getLatest((await $`git tag --list "v[0-9]*.[0-9]*.[0-9]*"`).stdout.toString().split('\n'));
  cd(currentDir);
}

const hasUpdate = cnatixDeps.reduce((prev, curr) => prev || curr.hasUpdate, false);
if (!hasUpdate) {
  console.log('no dependencies have updates');
  process.exit(0);
}

console.log('regenerating swagger.json file');
const mergedJSON = await merge(cnatixDeps.map(dep => path.join(srcDir, dep.name)));
await fsp.writeFile(
  path.join(frontendDir, 'src', 'next', 'pages', 'api-doc', 'swagger.json'),
  mergedJSON);

cd(frontendDir);
for (let dep of cnatixDeps) {
  if (!dep.hasUpdate) {
    continue;
  }
  console.log(`updating ${dep.name} from ${dep.currentVersion} to ${dep.latest}`);
  // This will rebuild node_modules directories which will be time-consuming,
  // but it is better to modify the file through yarn command.
  await $`yarn upgrade @llmariner-types/${dep.name} 'git+https://github.com/llmariner/${dep.name}.git#${dep.latest}'`;
}

// Invoke yarn command again, this will remove the old entry from yarn.lock file.
await $`yarn --ignore-optional`

console.log('creating a PR');
await $`git switch -c ${branchName}`;
await $`git commit -a -m "Update swagger.json"`;
await $`git push origin ${branchName}`;

if (sweepOldBranches) {
  const output = await $`gh pr list --json number,headRefName`;
  Promise.all(JSON.parse(output.stdout).map(async (pr) => {
    const parts = pr.headRefName.split('/');
    if (parts.length === 2 && parts[0] === 'swagger-merger') {
      console.log(`closing #${pr.number} (${pr.headRefName})`);
      await $`gh pr close ${pr.number}`;
    }
  }));
}

await $`gh pr create --reviewer=${reviewers.join(',')} --title "Update swagger.json" --body ''`;
console.log('done');
