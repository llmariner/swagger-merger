import fs from 'fs/promises';
import path from 'path';
import stringify from 'json-stable-stringify';
import { format } from 'prettier';

const prefixReferencesWithPackage = (obj, innerMostScope, packageName) => {
  if (!obj || typeof obj != 'object') {
    return;
  }

  // Handling https://swagger.io/specification/v2/#referenceObject
  if ('$ref' in obj) {
    const currentReference = obj['$ref'];

    const matchResult = /^(.*\/definitions\/)(.*)$/.exec(currentReference);
    if (matchResult !== null) {
      const head = matchResult[1];
      const name = matchResult[2];

      // For top level message definitions, the name will be prefixed with the
      // inner most scope of the package name.
      if (name.startsWith(innerMostScope)) {
        obj['$ref'] = `${head}${packageName}.${name.substr(
          innerMostScope.length
        )}`;
      } else if (name !== 'protobufAny' && name !== 'runtimeError') {
        // For nested message definitions, prefixing doesn't happen.
        obj['$ref'] = `${head}${packageName}.${name}`;
      }
    }
  }

  for (let key in obj) {
    prefixReferencesWithPackage(obj[key], innerMostScope, packageName);
  }
};

const swaggerFilePattern = /\.swagger\.json$/;

export const findSwaggerFiles = async (baseDirectoryPath) => {
  const results = [];
  const walk = async (currentPath) => {
    const stat = await fs.stat(currentPath);

    if (stat.isFile() && currentPath.match(swaggerFilePattern)) {
      results.push(currentPath);
    }

    if (stat.isDirectory()) {
      const children = await fs.readdir(currentPath);
      await Promise.all(
        children.map((child) => walk(path.join(currentPath, child)))
      );
    }
  };
  await walk(path.join(baseDirectoryPath, 'api'));
  return results;
};

// https://developers.google.com/protocol-buffers/docs/reference/proto3-spec#package
//
// Exported only for testing.
export const packagePattern = new RegExp(
  'package[ \\r\\n\\t]+((?:[A-Za-z0-9-]+\\.)*)([A-Za-z0-9-]+);'
);

export const processSwaggerFile = async (filePath, dest) => {
  const swaggerFileBuf = await fs.readFile(filePath);
  const swagger = JSON.parse(swaggerFileBuf.toString());

  const protoFile = filePath.replace(swaggerFilePattern, '.proto');
  let innerMostScope;
  let packageName;
  if (await fs.stat(protoFile).then(()=>true).catch(()=>false)) {
    const protoFileBuf = await fs.readFile(protoFile);

    const matchResult = packagePattern.exec(protoFileBuf.toString());
    if (matchResult === null) {
      throw new Error('Failed to get a package specifier');
    }
    packageName = matchResult[1] + matchResult[2];
    innerMostScope = matchResult[2];

    prefixReferencesWithPackage(swagger, innerMostScope, packageName);
  }

  // https://swagger.io/specification/v2/#pathsObject
  for (let p in swagger.paths) {
    dest.paths[p] = swagger.paths[p];
  }

  // https://swagger.io/specification/v2/#definitionsObject
  for (let name in swagger.definitions) {
    let rewrittenName = name;
    if (name !== 'protobufAny' && name !== 'runtimeError') {
      if (packageName === undefined) {
        rewrittenName = name;
      } else if (name.startsWith(innerMostScope)) {
        rewrittenName = `${packageName}.${name.substr(innerMostScope.length)}`;
      } else {
        rewrittenName = `${packageName}.${name}`;
      }
    }
    dest.definitions[rewrittenName] = swagger.definitions[name];
  }
};

export const merge = async (dirs) => {
  const swaggerFilePaths = (
    await Promise.all(dirs.map(findSwaggerFiles))
  ).flat().sort();

  const convertedSwaggerBase = {
    swagger: '2.0',
    info: {
      title: 'llm-operator APIs',
      version: 'v1.0',
    },
    consumes: ['application/json'],
    produces: ['application/json'],
    paths: {},
    definitions: {},
  };

  for (const swaggerFilePath of swaggerFilePaths) {
    await processSwaggerFile(swaggerFilePath, convertedSwaggerBase);
  }

  const jsonStr = stringify(convertedSwaggerBase, { space: 2 });
  // eslint-disable-next-line no-console
  return format(jsonStr, {parser: 'json', singleQuote: true});
};
